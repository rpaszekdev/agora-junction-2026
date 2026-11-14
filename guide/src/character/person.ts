import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl } from "./assets";
import { toGlb } from "./glb";

/**
 * People for the intro, on Dennis's skeleton (public/models/friend/), posed by aiming bones at directions in their own
 * frame (x: their left, y: up, z: ahead; the model's units are centimetres) or by two-bone IK (legs to pedals, hands
 * to handlebars). Built facing +z, feet at y = 0.
 * - `person()`: Dennis himself (the retro pack's "retro-m3", as `extra` makes him; his own old model, models/friend/, now only
 *   gives everyone the skeleton and the walk);
 * - `extra(name)`: anyone else, from the bought character packs (BitSoft's NPCs, the everyday workers, the PSX
 *   hazmat / retro / casual characters), converted offline (scripts/convert-npcs.mjs: public/models/npc/), each bound
 *   here to a copy of his skeleton fitted to its own joints.
 * Everyone can also play baked motion clips (public/models/anims/, scripts/bake-anims.mjs: Quaternius's CC0 library
 * and 100STYLE's mocap, retargeted onto this skeleton): `play(name)`, cross-faded, fitted at load to each one's own
 * skeleton and hip height, applied by `reset(dt)` so a scene can still aim the head or reach on top. The review page:
 * anims.html (src/game/animLab.ts).
 */

const SCALE = 0.01;

let base: Promise<{
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}> | null = null;
/** The model, loaded once (fetched and decoded by hand: the page's security policy forbids fetching `data:` URLs). */
export function loadPersonModel(): Promise<{
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}> {
  base ??= (async () => {
    const json = (await (
      await fetch(assetUrl("models/friend/friend-rigged.gltf.json"))
    ).json()) as { buffers?: { uri?: string; byteLength: number }[] };
    return await new Promise<{
      scene: THREE.Group;
      animations: THREE.AnimationClip[];
    }>((res, rej) =>
      new GLTFLoader().parse(toGlb(json), "", (g) => res(g), rej),
    );
  })();
  return base;
}

/** Clothes for `person` (from when he was his own model, re-tinted; kept for the callers: he's retro-m3 now). */
export interface Look {
  jacket?: string;
  trousers?: string;
  top?: string;
  /** 0..1: dirt and shadow over the face. */
  grime?: number;
}

const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const mq = new THREE.Quaternion();
const e = new THREE.Euler();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

export class Person {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly bones: Record<string, THREE.Bone> = {};
  private readonly rest: Record<string, THREE.Quaternion> = {};
  readonly restHips = new THREE.Vector3();
  private readonly mixer: THREE.AnimationMixer;
  private readonly walkAction: THREE.AnimationAction | null;
  /** Bone lengths (cm) for the IK. */
  private readonly len: Record<string, number> = {};
  /** The walk (fitted to his hip height). */
  readonly clips: THREE.AnimationClip[];

  /** `model`: a skinned model on Dennis's skeleton (its materials set), scaled to metres. */
  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.model = model;
    this.clips = clips;
    this.model.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) {
        const name = b.name.replace(/^mixamorig:?/, "");
        this.bones[name] = b;
        this.rest[name] = b.quaternion.clone();
      }
    });
    this.root.add(this.model);
    this.restHips.copy(this.bones["Hips"]!.position);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.walkAction = clips[0] ? this.mixer.clipAction(clips[0]) : null;
    if (this.walkAction) {
      this.walkAction.setEffectiveWeight(0);
      this.walkAction.play();
    }
    for (const [a, b] of [
      ["LeftUpLeg", "LeftLeg"],
      ["LeftLeg", "LeftFoot"],
      ["RightUpLeg", "RightLeg"],
      ["RightLeg", "RightFoot"],
      ["LeftArm", "LeftForeArm"],
      ["LeftForeArm", "LeftHand"],
      ["RightArm", "RightForeArm"],
      ["RightForeArm", "RightHand"],
    ] as const)
      this.len[a] = this.bones[b]!.position.length();
  }

  /**
   * Back to the rest pose (then the walk cycle at `walk` 0..1, its speed `rate`), ready to be posed. Any clips started
   * with `play` are applied here too (and advanced by `dt`), so a scene can `reset(dt)`, then aim the head or reach on
   * top of the clip, as it poses on top of the rest pose.
   */
  reset(dt: number, walk = 0, rate = 0.7): void {
    for (const [n, b] of Object.entries(this.bones))
      b.quaternion.copy(this.rest[n]!);
    this.bones["Hips"]!.position.copy(this.restHips);
    if (this.walkAction) {
      this.walkAction.setEffectiveWeight(walk);
      this.walkAction.timeScale = rate;
    }
    if (this.anims.size && this.animsLive()) this.remix();
    if (this.walkAction || this.anims.size) this.mixer.update(dt);
  }

  /**
   * Whether any clip is on (some weight, or fading): a clip whose fade-out has finished is stopped here (handing its
   * bones back to the mixer), so with no clip on, `reset` is exactly what it was before there were clips.
   */
  private animsLive(): boolean {
    let live = false;
    for (const a of this.anims.values()) {
      if (!a.isScheduled()) continue;
      if (!a.enabled) a.stop();
      else live = true;
    }
    return live;
  }

  /**
   * three's mixer only writes a bone when its blended value differs from the last update's (it assumes nothing else
   * moves the bones); `reset` has just put them all back to rest, so a clip held still (a pose, a paused clip, a bone
   * that keeps still) would be lost. This marks every value as changed: the last update's copy (the one the next update
   * compares with) is overwritten with a value no bone will have. It has to stay finite and, for a turn, a unit
   * quaternion: where nothing drives a value that frame (the old walk at weight 0), the mixer blends from that copy
   * with weight 0, and NaN (or a huge number) would survive that.
   */
  private remix(): void {
    const m = this.mixer as unknown as {
      _accuIndex: number;
      _bindings: { buffer: Float64Array; valueSize: number }[];
    };
    for (const b of m._bindings) {
      const at = m._accuIndex * b.valueSize + b.valueSize;
      if (b.valueSize === 4) b.buffer.set(ODD_TURN, at);
      else b.buffer.fill(-12345.678, at, at + b.valueSize);
    }
  }

  // ---------------------------------------------------------------- motion clips (public/models/anims/)

  /** The clips bound to this skeleton, by name (made on first `play`). */
  private readonly anims = new Map<string, THREE.AnimationAction>();
  /** The last `play` asked of each clip, while it loads (a `stopAnim` meanwhile cancels it). */
  private readonly animAsk = new Map<string, number>();
  private animAsks = 0;
  private animFit: AnimFit | null = null;
  private readonly animSpeeds = new Map<string, number>();
  private readonly animSeats = new Map<string, number>();
  /** (Agora) Whether each clip given by `addClip` loops (a baked one says so in its own file). */
  private readonly ownLoops = new Map<string, boolean>();

  /**
   * (Agora) A clip made for this very skeleton (Mixamo's own, on a Mixamo body: ../mixamo.ts), taken as it is:
   * `play(name)` then plays it like a baked one.
   */
  addClip(name: string, clip: THREE.AnimationClip, loop: boolean): void {
    this.anims.set(name, this.mixer.clipAction(clip));
    this.ownLoops.set(name, loop);
  }

  /**
   * Play a baked clip (scripts/bake-anims.mjs; see `loadAnim`), fitted to this skeleton (its own rest pose and hip
   * height). By default it cross-fades from whatever other clips play (`fade` s); `keep` leaves them playing, blended by
   * weight. `weight` 0..1, `rate` its speed, `loop` (default: the clip's own), `time` a start time (s; otherwise it
   * goes on from where it is if already playing, or starts at 0). A clip that doesn't loop holds its last frame.
   * Applied by `reset(dt)` (or `update(dt)`), which also advances it. Walks are in place: move him at
   * `animSpeed(name) * rate` m/s.
   */
  async play(
    name: string,
    o: PlayOptions = {},
  ): Promise<THREE.AnimationAction | null> {
    const ask = ++this.animAsks;
    this.animAsk.set(name, ask);
    let action = this.anims.get(name);
    if (!action) {
      const [file, index] = await Promise.all([
        loadAnim(name),
        loadAnimIndex(),
      ]);
      if (this.animAsk.get(name) !== ask) return null;
      action = this.anims.get(name);
      if (!action) {
        this.animFit ??= this.fitAnim(index);
        const { clip, speed, seat } = bindAnim(file, this.animFit, this.bones);
        if (seat) this.animSeats.set(name, seat * this.model.scale.x);
        action = this.mixer.clipAction(clip);
        this.anims.set(name, action);
        // (cm/s in his own frame; the model is scaled to metres, times his height)
        this.animSpeeds.set(name, speed * this.model.scale.x);
      }
    }
    if (this.animAsk.get(name) !== ask) return null;
    this.animAsk.delete(name);
    const fade = o.fade ?? 0.3;
    const loop =
      o.loop ?? this.ownLoops.get(name) ?? (await loadAnim(name)).loop;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = o.rate ?? 1;
    // (a one-shot that has finished, held on its last frame, starts again)
    const running =
      action.enabled &&
      action.isScheduled() &&
      !action.paused &&
      action.getEffectiveWeight() > 0;
    if (running) {
      action.stopFading().setEffectiveWeight(o.weight ?? 1);
      if (o.time !== undefined) action.time = o.time;
    } else {
      action.reset();
      action.time = o.time ?? 0;
      action.setEffectiveWeight(o.weight ?? 1);
      // (the mixer keeps each bone's value from when a clip first drives it, and blends towards it under full weight:
      // that must be the rest pose, not whatever pose a scene left him in)
      const was = Object.values(this.bones).map((b) => b.quaternion.clone());
      const hipsWas = this.bones["Hips"]!.position.clone();
      for (const [n, b] of Object.entries(this.bones))
        b.quaternion.copy(this.rest[n]!);
      this.bones["Hips"]!.position.copy(this.restHips);
      action.play();
      Object.values(this.bones).forEach((b, i) => b.quaternion.copy(was[i]!));
      this.bones["Hips"]!.position.copy(hipsWas);
      if (fade > 0) action.fadeIn(fade);
    }
    // (a zero-length fade is a cut: three's fade only ends once its mixer's clock moves on)
    if (!o.keep)
      for (const [n, a] of this.anims)
        if (n !== name && a.enabled && a.isScheduled())
          fade > 0 ? a.fadeOut(fade) : a.stop();
    return action;
  }

  /** Fade a clip out (`fade` s), or every clip if no name is given. */
  stopAnim(name?: string, fade = 0.3): void {
    for (const [n, a] of this.anims) {
      if (name !== undefined && n !== name) continue;
      if (fade > 0 && a.enabled && a.isScheduled()) a.fadeOut(fade);
      else a.stop();
    }
    if (name === undefined) this.animAsk.clear();
    else this.animAsk.delete(name);
  }

  /** The clip playing at the greatest weight (or null), and its time (s). */
  playing(): { name: string; time: number; weight: number } | null {
    let best: { name: string; time: number; weight: number } | null = null;
    for (const [name, a] of this.anims) {
      const weight = a.enabled && a.isScheduled() ? a.getEffectiveWeight() : 0;
      if (weight > 0 && (!best || weight > best.weight))
        best = { name, time: a.time, weight };
    }
    return best;
  }

  /** How fast a walk clip carries him at rate 1 (m/s; measured on his own legs, from the planted toe; 0 if not a walk or not loaded yet). */
  animSpeed(name: string): number {
    return this.animSpeeds.get(name) ?? 0;
  }

  /**
   * The seat height a sitting or couch clip assumes on him (m, from the floor his root stands on: where his buttocks
   * meet the seat), once it's loaded; 0 for other clips. sit-idle, sit-talking, sit-enter's end, sleep and wake-up
   * share it: put a couch's seat top there (or move his root up or down by the difference).
   */
  animSeat(name: string): number {
    return this.animSeats.get(name) ?? 0;
  }

  /** Rest pose plus the clips, advanced by `dt` (the same as `reset(dt)`): then pose on top (aim, reach, add). */
  update(dt: number): void {
    this.reset(dt);
  }

  /**
   * How a clip fits this skeleton: each bone's rest turn in his own frame, turned so the bone lies along the reference
   * skeleton's (Dennis's old model, the one the clips were baked on: an extra's fitted copy lies along its own
   * character's limbs, which may hang in an A-pose); a hand or a toe follows its limb. The head keeps its own rest turn
   * (the face looks ahead at rest on every rig, whatever the neck's lean: turned with the neck, it would nod).
   */
  private fitAnim(index: AnimIndex): AnimFit {
    const world: Record<string, THREE.Quaternion> = {};
    const pos: Record<string, THREE.Vector3> = {};
    const restWorld: Record<string, THREE.Quaternion> = {};
    const parent: Record<string, string | null> = {};
    for (const n of BONES) {
      const b = this.bones[n]!;
      const pn = (b.parent as THREE.Bone | null)?.isBone
        ? b.parent!.name.replace(/^mixamorig:?/, "")
        : null;
      parent[n] = pn && world[pn] ? pn : null;
      const pw = parent[n] ? world[parent[n]!]! : new THREE.Quaternion();
      world[n] = pw.clone().multiply(this.rest[n]!);
      pos[n] = parent[n]
        ? b.position.clone().applyQuaternion(pw).add(pos[parent[n]!]!)
        : this.restHips.clone();
    }
    const corr: Record<string, THREE.Quaternion> = {};
    for (const n of BONES) {
      const c = AIM[n];
      const ref = index.ref.dirs[n];
      if (c && ref && pos[c])
        corr[n] = new THREE.Quaternion().setFromUnitVectors(
          pos[c]!.clone().sub(pos[n]!).normalize(),
          new THREE.Vector3(...ref),
        );
      else
        corr[n] =
          parent[n] && n !== "Head"
            ? corr[parent[n]!]!.clone()
            : new THREE.Quaternion();
      restWorld[n] = corr[n]!.clone().multiply(world[n]!);
    }
    const foot: Record<string, number> = {};
    for (const n of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"])
      foot[n] = pos[n]!.y;
    // the body's surface round the torso (its skin's rest vertices, each by the bone that weighs on it most, kept as
    // offsets from that bone's joint): what lies on a floor or sits on a seat
    const skin: Record<string, THREE.Vector3[]> = {};
    const vx = new THREE.Vector3();
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (
        !m.isSkinnedMesh ||
        m.parent !== this.model ||
        !m.position.equals(vx.set(0, 0, 0))
      )
        return;
      const P = m.geometry.attributes["position"]!,
        si = m.geometry.attributes["skinIndex"]!,
        sw = m.geometry.attributes["skinWeight"]!;
      for (let i = 0; i < P.count; i++) {
        let bi = 0,
          bw = -1;
        for (let c = 0; c < 4; c++)
          if (sw.getComponent(i, c) > bw)
            ((bw = sw.getComponent(i, c)), (bi = si.getComponent(i, c)));
        const name = m.skeleton.bones[bi]?.name.replace(/^mixamorig:?/, "");
        if (!name || !SKIN.includes(name)) continue;
        (skin[name] ??= []).push(
          new THREE.Vector3()
            .fromBufferAttribute(P as THREE.BufferAttribute, i)
            .sub(pos[name]!),
        );
      }
    });
    return {
      refHipY: index.ref.hipY,
      restWorld,
      restActual: world,
      parent,
      hipY: this.restHips.y,
      offset: Object.fromEntries(
        BONES.map((n) => [n, this.bones[n]!.position.clone()]),
      ),
      foot,
      skin,
    };
  }

  /** Add a turn to a bone on top of what it has. */
  add(name: string, x: number, y: number, z: number): void {
    const b = this.bones[name];
    if (b) b.quaternion.multiply(q.setFromEuler(e.set(x, y, z)));
  }

  /** Point a bone (towards its child) along a direction in his own frame, by `k`. */
  aim(name: string, child: string, dir: THREE.Vector3, k = 1): void {
    const b = this.bones[name];
    const c = this.bones[child];
    if (!b || !c || !b.parent) return;
    b.parent.updateWorldMatrix(true, false);
    this.model.getWorldQuaternion(mq);
    v1.copy(dir).normalize().applyQuaternion(mq);
    b.parent.getWorldQuaternion(q2);
    v1.applyQuaternion(q2.invert());
    v2.copy(c.position).normalize().applyQuaternion(b.quaternion);
    q.setFromUnitVectors(v2, v1).multiply(b.quaternion);
    b.quaternion.slerp(q, Math.min(1, k));
  }

  /** Where a bone is, in his own frame (cm). */
  at(name: string, out = new THREE.Vector3()): THREE.Vector3 {
    const b = this.bones[name]!;
    b.updateWorldMatrix(true, false);
    b.getWorldPosition(out);
    return this.model.worldToLocal(out);
  }

  /**
   * Two-bone IK: `upper` (and its child `mid`) reach `target` (cm, his frame), the joint bending towards `pole`
   * (a direction in his frame: forward for a knee, down and back for an elbow).
   */
  reach(
    upper: string,
    mid: string,
    end: string,
    target: THREE.Vector3,
    pole: THREE.Vector3,
  ): void {
    const L1 = this.len[upper]!;
    const L2 = this.len[mid]!;
    const a = this.at(upper);
    const to = target.clone().sub(a);
    const d = Math.max(1, Math.min(L1 + L2 - 0.5, to.length()));
    const dir = to.normalize();
    const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const side = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const knee = a.clone().addScaledVector(dir, along).addScaledVector(side, h);
    this.aim(upper, mid, knee.clone().sub(a));
    const kneeNow = this.at(mid);
    this.aim(mid, end, target.clone().sub(kneeNow));
  }
}

// ---------------------------------------------------------------- motion clips

/** How `Person.play` plays a clip. */
export interface PlayOptions {
  /** 0..1 (default 1). */
  weight?: number;
  /** Cross-fade time (s, default 0.3). */
  fade?: number;
  /** Speed (default 1). */
  rate?: number;
  /** Loop (default: as the clip was baked). */
  loop?: boolean;
  /** Start (or jump) to this time (s). */
  time?: number;
  /** Leave the other clips playing (blended by weight) instead of fading them out. */
  keep?: boolean;
}

/**
 * A baked clip (public/models/anims/<name>.json, made by scripts/bake-anims.mjs): per bone, its world turn away from
 * the T-pose in his own frame (x, y, z, w; x 10000), per frame or one key for a bone that keeps still; the hips'
 * position in hip heights (x 10000). `speed`: a walk's speed (m/s) on the reference skeleton's hips (`AnimIndex.ref`).
 */
export interface AnimFile {
  v: 1;
  name: string;
  fps: number;
  frames: number;
  duration: number;
  loop: boolean;
  speed: number;
  /** 'feet': put on the floor by the planted foot (refined per skeleton here); 'none': as baked (lying, falling). */
  ground: "feet" | "none";
  bones: Record<string, number[]>;
  hips: number[];
  /** For a clip off its feet (lying, falling, waking): the standing (or sitting) pose its floor was set from. */
  stand?: { bones: Record<string, number[]>; hips: number[] };
  /**
   * Lying: per frame (or one value) how much he lies, 0..1. Where he lies, his back and pelvis are put on the surface
   * (`rest`): the floor, or the seat of a couch (that seat: where the `stand` pose, sitting, has his buttocks).
   */
  lie?: number[];
  rest?: "floor" | "seat";
  /**
   * Lying: limbs fitted to this body so they rest on the surface: each turned about its root joint (the hip, the
   * shoulder) until its end ('rest': a foot) touches it, or ('lift': an arm under him) goes no more than a centimetre
   * into it. As far as he lies.
   */
  settle?: {
    limb: "LeftLeg" | "RightLeg" | "LeftArm" | "RightArm";
    mode: "rest" | "lift";
  }[];
  /** A sitting frame (or 'stand'): where his buttocks meet the seat there is reported by `animSeat`. */
  seatAt?: number | "stand";
}

/** One clip in public/models/anims/index.json. */
export interface AnimInfo {
  duration: number;
  loop: boolean;
  speed: number;
  frames: number;
  what: string;
  source: string;
  from: string;
  url: string;
  licence: string;
  credit?: string;
}

/** public/models/anims/index.json: the clips, and the skeleton they were baked on (hip height, cm; bone directions). */
export interface AnimIndex {
  v: 1;
  fps: number;
  ref: { hipY: number; dirs: Record<string, [number, number, number]> };
  clips: Record<string, AnimInfo>;
}

/** A skeleton's fit for the clips (see `Person.fitAnim`). */
interface AnimFit {
  refHipY: number;
  /** Each bone's own rest turn (before the clips' correction): the skin is bound there. */
  restActual: Record<string, THREE.Quaternion>;
  /** The torso's skin (rest vertices less their bone's joint, cm), by bone: see `BODY`. */
  skin: Record<string, THREE.Vector3[]>;
  restWorld: Record<string, THREE.Quaternion>;
  parent: Record<string, string | null>;
  hipY: number;
  offset: Record<string, THREE.Vector3>;
  foot: Record<string, number>;
}

let animIndex: Promise<AnimIndex> | null = null;
/** The list of baked clips (loaded once). */
export function loadAnimIndex(): Promise<AnimIndex> {
  animIndex ??= fetch(assetUrl("models/anims/index.json")).then((r) => {
    if (!r.ok) throw new Error(`${r.status} for models/anims/index.json`);
    return r.json() as Promise<AnimIndex>;
  });
  return animIndex;
}

const animFiles = new Map<string, Promise<AnimFile>>();
/** A baked clip (loaded once; see `AnimFile`). `Person.play` loads what it needs; this is for loading ahead. */
export function loadAnim(name: string): Promise<AnimFile> {
  let p = animFiles.get(name);
  if (!p) {
    p = fetch(assetUrl(`models/anims/${name}.json`)).then((r) => {
      if (!r.ok) throw new Error(`no such clip: ${name} (${r.status})`);
      return r.json() as Promise<AnimFile>;
    });
    p.catch(() => animFiles.delete(name));
    animFiles.set(name, p);
  }
  return p;
}

/** A unit quaternion no bone will hold (see `Person.remix`). */
const ODD_TURN = new THREE.Quaternion(0.1234, -0.5678, 0.3141, 0.7)
  .normalize()
  .toArray();

const aq = new THREE.Quaternion();
const aq2 = new THREE.Quaternion();
const av = new THREE.Vector3();

/**
 * A baked clip as three.js tracks for one skeleton: each frame's world turns put on this skeleton's (T-posed) rest,
 * made local to the parent; the hips' position at this skeleton's hip height. A clip standing on its feet is then put
 * on the floor for this skeleton's own legs (the typical height of the planted foot made its rest height), as the
 * bake did for the reference.
 */
function bindAnim(
  file: AnimFile,
  fit: AnimFit,
  bones: Record<string, THREE.Bone>,
): { clip: THREE.AnimationClip; speed: number; seat: number } {
  const n = file.frames;
  const times = Float32Array.from({ length: n }, (_, i) => i / file.fps);
  const order = BONES.filter((b) => file.bones[b]);
  const local: Record<string, Float32Array> = {};
  for (const b of order) local[b] = new Float32Array(n * 4);
  const hips = new Float32Array(n * 3);
  const world: Record<string, THREE.Quaternion> = {};
  for (const b of BONES) world[b] = new THREE.Quaternion();
  const pos: Record<string, THREE.Vector3> = {};
  const contact: number[] = [];
  const toes: number[][] = [];
  const legs = [
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "LeftToeBase",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
    "RightToeBase",
  ];
  for (let i = 0; i < n; i++) {
    for (const b of BONES) {
      const d = file.bones[b];
      const w = world[b]!;
      if (d) {
        const k = d.length > 4 ? i * 4 : 0;
        w.set(d[k]! / 1e4, d[k + 1]! / 1e4, d[k + 2]! / 1e4, d[k + 3]! / 1e4)
          .normalize()
          .multiply(fit.restWorld[b]!);
      } else w.copy(fit.restWorld[b]!);
    }
    for (const b of order) {
      const p = fit.parent[b];
      aq.copy(world[b]!);
      if (p) aq.premultiply(aq2.copy(world[p]!).invert());
      aq.toArray(local[b]!, i * 4);
    }
    const k = file.hips.length > 3 ? i * 3 : 0;
    av.set(file.hips[k]!, file.hips[k + 1]!, file.hips[k + 2]!)
      .multiplyScalar(fit.hipY / 1e4)
      .toArray(hips, i * 3);
    if (file.ground === "feet" || file.speed > 0) {
      pos["Hips"] = av.clone();
      for (const b of legs) {
        const p = fit.parent[b]!;
        pos[b] = fit.offset[b]!.clone().applyQuaternion(world[p]!).add(pos[p]!);
      }
      if (file.ground === "feet")
        contact.push(
          Math.min(
            ...["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"].map(
              (b) => pos[b]!.y - fit.foot[b]!,
            ),
          ),
        );
      toes.push([
        pos["LeftToeBase"]!.y,
        pos["LeftToeBase"]!.z,
        pos["RightToeBase"]!.y,
        pos["RightToeBase"]!.z,
      ]);
    }
  }
  // a walk's speed on these legs (cm/s): the planted toe's slide back under him (the median while a toe is within
  // 1.5 cm of the lowest either toe gets), as the bake measures it on the reference; a stop-start gait (more than 30%
  // off the bake's figure, scaled to this hip height) keeps the bake's
  let speed = 0;
  if (file.speed > 0 && toes.length > 2) {
    const low = Math.min(...toes.map((t) => Math.min(t[0]!, t[2]!)));
    const vs: number[] = [];
    for (let i = 0; i + 1 < toes.length; i++)
      for (const o of [0, 2])
        if (toes[i]![o]! < low + 1.5 && toes[i + 1]![o]! < low + 1.5)
          vs.push(-(toes[i + 1]![o + 1]! - toes[i]![o + 1]!) * file.fps);
    vs.sort((a, b) => a - b);
    const scaled = file.speed * 100 * (fit.hipY / fit.refHipY);
    speed = vs.length ? vs[Math.floor(vs.length / 2)]! : scaled;
    if (Math.abs(speed - scaled) > 0.3 * scaled) speed = scaled;
  }
  if (contact.length) {
    const lift = -contact.sort((a, b) => a - b)[
      Math.floor(contact.length / 2)
    ]!;
    if (Math.abs(lift) < 15)
      for (let i = 0; i < n; i++) hips[i * 3 + 1]! += lift;
  }
  // a pose of the clip (a frame, or its stand pose) on this skeleton: world turns and joints (cm, his frame)
  const decode = (
    src: { bones: Record<string, number[]>; hips: number[] },
    i: number,
    lift: number,
  ) => {
    const w: Record<string, THREE.Quaternion> = {};
    for (const b of BONES) {
      const d = src.bones[b];
      const k = d && d.length > 4 ? i * 4 : 0;
      w[b] = d
        ? new THREE.Quaternion(
            d[k]! / 1e4,
            d[k + 1]! / 1e4,
            d[k + 2]! / 1e4,
            d[k + 3]! / 1e4,
          )
            .normalize()
            .multiply(fit.restWorld[b]!)
        : fit.restWorld[b]!.clone();
    }
    const k = src.hips.length > 3 ? i * 3 : 0;
    const p: Record<string, THREE.Vector3> = {
      Hips: new THREE.Vector3(
        src.hips[k]!,
        src.hips[k + 1]!,
        src.hips[k + 2]!,
      ).multiplyScalar(fit.hipY / 1e4),
    };
    p["Hips"]!.y += lift;
    for (const b of BONES)
      if (b !== "Hips")
        p[b] = fit.offset[b]!.clone()
          .applyQuaternion(w[fit.parent[b]!]!)
          .add(p[fit.parent[b]!]!);
    return { w, p };
  };
  const feetLow = (x: ReturnType<typeof decode>) =>
    Math.min(
      ...["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"].map(
        (b) => x.p[b]!.y - fit.foot[b]!,
      ),
    );
  /** The lowest point of the body's surface over some bones (cm). */
  const skinLow = (x: ReturnType<typeof decode>, which: string[]) => {
    let low = Infinity;
    for (const b of which) {
      const pts = fit.skin[b];
      if (!pts) continue;
      const Q = x.w[b]!.clone().multiply(fit.restActual[b]!.clone().invert());
      for (const o of pts)
        low = Math.min(low, x.p[b]!.y + av.copy(o).applyQuaternion(Q).y);
    }
    return low;
  };
  let standLift = 0;
  if (!contact.length && file.stand) {
    // the floor from the clip's standing (or sitting) pose, on these legs
    standLift = -feetLow(decode(file.stand, 0, 0));
    if (Math.abs(standLift) > 15) standLift = 0;
    for (let i = 0; i < n; i++) hips[i * 3 + 1]! += standLift;
  }
  let seat = 0;
  const hasSkin = Object.keys(fit.skin).length > 0;
  if (
    hasSkin &&
    file.stand &&
    (file.rest === "seat" || file.seatAt === "stand")
  )
    seat = skinLow(decode(file.stand, 0, standLift), BUTTOCKS);
  if (hasSkin && file.lie) {
    // his pelvis and back on the floor (the middle of the two half a centimetre above it: a body whose back curves off
    // the pelvis has one a little up, the other a little in), as far as he lies
    const surface = file.rest === "seat" ? seat : 0;
    const lay = decode(file, 0, standLift);
    // (on a couch, the pelvis on the seat exactly, as he'll sit there: the back settles into the cushion instead)
    const dl =
      surface +
      0.5 -
      (file.rest === "seat"
        ? skinLow(lay, BUTTOCKS)
        : (skinLow(lay, BUTTOCKS) + skinLow(lay, BACK)) / 2);
    const lie = (i: number) =>
      file.lie!.length > 1 ? file.lie![i]! : file.lie![0]!;
    if (file.rest === "seat") {
      // (on a couch, frame by frame, smoothed over 7 frames: rolling over or stirring, the side he lies on changes)
      const c = Array.from({ length: n }, (_, i) =>
        lie(i) > 0
          ? surface + 0.5 - skinLow(decode(file, i, standLift), BUTTOCKS)
          : 0,
      );
      for (let i = 0; i < n; i++) {
        let sum = 0,
          cnt = 0;
        for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++)
          ((sum += c[j]!), cnt++);
        const v = sum / cnt;
        if (Math.abs(v) < 25) hips[i * 3 + 1]! += v * lie(i);
      }
    } else if (Math.abs(dl) < 25)
      for (let i = 0; i < n; i++) hips[i * 3 + 1]! += dl * lie(i);
    // and while he gets up off it, no part of the torso goes more than a centimetre into it (the hips lifted where it
    // would, eased over 7 frames)
    const need = new Float32Array(n);
    const cm = {
      bones: file.bones,
      hips: Array.from(hips, (x) => (x * 1e4) / fit.hipY),
    };
    // (on a couch the pelvis only: the back may settle into the cushion, and the thighs hang over its front edge)
    const guard = file.rest === "seat" ? ["Hips"] : BODY;
    for (let i = 0; i < n; i++)
      if (lie(i) < 1 && lie(i) > 0)
        need[i] = Math.max(0, surface - 1 - skinLow(decode(cm, i, 0), guard));
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++)
        m = Math.max(m, need[j]! * Math.min(1, 1.5 - Math.abs(j - i) / 3));
      hips[i * 3 + 1]! += m;
    }
  }
  if (hasSkin && file.lie && file.settle) {
    // the limbs settled on the surface, for this body (its legs and arms are its own lengths and girths)
    const surface = file.rest === "seat" ? seat : 0;
    const lie = (i: number) =>
      file.lie!.length > 1 ? file.lie![i]! : file.lie![0]!;
    const cm = {
      bones: file.bones,
      hips: Array.from(hips, (x) => (x * 1e4) / fit.hipY),
    };
    const turned = (
      x: ReturnType<typeof decode>,
      chain: string[],
      R: THREE.Quaternion,
    ) => {
      const w = { ...x.w };
      for (const b of chain) w[b] = R.clone().multiply(x.w[b]!);
      const p = { ...x.p };
      for (const b of chain.slice(1))
        p[b] = fit.offset[b]!.clone()
          .applyQuaternion(w[fit.parent[b]!]!)
          .add(p[fit.parent[b]!]!);
      return { w, p };
    };
    const f0 = decode(cm, 0, 0);
    for (const { limb, mode } of file.settle) {
      const L = LIMBS[limb];
      if (!L || !L.end.every((b) => fit.skin[b])) continue;
      const root = L.chain[0]!,
        tip = L.chain[L.chain.length - 1]!;
      const axis = f0.p[tip]!.clone()
        .sub(f0.p[root]!)
        .cross(av.set(0, 1, 0));
      if (axis.lengthSq() < 1e-6) continue;
      axis.normalize();
      const low = (th: number) =>
        skinLow(
          turned(
            f0,
            L.chain,
            new THREE.Quaternion().setFromAxisAngle(axis, th),
          ),
          L.end,
        );
      const target = mode === "rest" ? surface + 0.3 : surface - 1;
      const now = low(0);
      if (mode === "lift" && now >= target) continue;
      // which way raises it, then halve the step to the angle (up to 0.6 rad, about 35 degrees)
      const up = low(0.05) > now ? 1 : -1;
      let a = 0,
        b = 0.6 * (now < target ? up : -up);
      if ((low(b) - target) * (now - target) > 0) continue;
      for (let k = 0; k < 24; k++) {
        const m = (a + b) / 2;
        if ((low(m) - target) * (now - target) > 0) a = m;
        else b = m;
      }
      const th = (a + b) / 2;
      const p0 = fit.parent[root]!;
      for (let i = 0; i < n; i++) {
        const wgt = lie(i);
        if (!wgt) continue;
        const x = decode(cm, i, 0);
        const W = new THREE.Quaternion()
          .setFromAxisAngle(axis, th * wgt)
          .multiply(x.w[root]!);
        aq.copy(x.w[p0]!)
          .invert()
          .multiply(W)
          .toArray(local[root]!, i * 4);
      }
    }
  }
  if (hasSkin && typeof file.seatAt === "number") {
    const at = file.seatAt;
    const lifted = {
      bones: file.bones,
      hips: Array.from(hips, (x) => (x * 1e4) / fit.hipY),
    };
    seat = skinLow(decode(lifted, at, 0), BUTTOCKS);
  }
  // (keep quaternion signs continuous, for the interpolation)
  for (const b of order) {
    const a = local[b]!;
    for (let i = 1; i < n; i++) {
      const o = i * 4;
      if (
        a[o]! * a[o - 4]! +
          a[o + 1]! * a[o - 3]! +
          a[o + 2]! * a[o - 2]! +
          a[o + 3]! * a[o - 1]! <
        0
      )
        for (let c = 0; c < 4; c++) a[o + c] = -a[o + c]!;
    }
  }
  const tracks: THREE.KeyframeTrack[] = order.map(
    (b) =>
      new THREE.QuaternionKeyframeTrack(
        `${bones[b]!.name}.quaternion`,
        times,
        local[b]!,
      ),
  );
  tracks.push(
    new THREE.VectorKeyframeTrack(
      `${bones["Hips"]!.name}.position`,
      times,
      hips,
    ),
  );
  return {
    clip: new THREE.AnimationClip(file.name, (n - 1) / file.fps, tracks),
    speed,
    seat,
  };
}

/** Dennis: the retro pack's older, bald man in the navy shirt ("retro-m3"; see `extra`), on his skeleton and walk. */
export const DENNIS = "retro-m3";

/** Dennis (the clothes are from his old model, and no longer change anything). */
export async function person(_look: Look = {}): Promise<Person> {
  return extra(DENNIS);
}

// ---------------------------------------------------------------- the other people (the bought packs)

/** One character of public/models/npc/cast.json (made by scripts/convert-npcs.mjs). */
export interface CastEntry {
  file: string;
  sex: "m" | "f";
  /** crowd: BitSoft's NPCs (one body, dressed from 6 clothes x 6 skins); worker; featured: the distinctive ones. */
  kind: "crowd" | "worker" | "featured";
  pack: string;
  label: string;
  tex?: string;
  /** (Agora) A model from elsewhere: how much bigger to make it (its own metres x this). */
  scale?: number;
  clothing?: string[];
  skin?: string[];
}
let castFile: Promise<{ people: Record<string, CastEntry> }> | null = null;
const loadCast = () =>
  (castFile ??= fetch(assetUrl("models/npc/cast.json")).then(
    (r) => r.json() as Promise<{ people: Record<string, CastEntry> }>,
  ));

/**
 * Names of the people of a kind: for the crowd, every dressing of the BitSoft man and woman ("crowd-male.3.5":
 * clothes 3, skin 5); otherwise the characters' ids ("police", "retro-m2", ..).
 */
export async function extraNames(
  kind: CastEntry["kind"] = "crowd",
): Promise<string[]> {
  const { people } = await loadCast();
  const out: string[] = [];
  for (const [id, e] of Object.entries(people)) {
    if (e.kind !== kind) continue;
    if (e.clothing && e.skin)
      for (let c = 1; c <= e.clothing.length; c++)
        for (let s = 1; s <= e.skin.length; s++) out.push(`${id}.${c}.${s}`);
    else out.push(id);
  }
  return out;
}

/** The deforming bones, in the order the converted meshes' weights are given here. */
const BONES = [
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "LeftToeBase",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
  "RightToeBase",
];
/** The torso's bones: what lies on a floor (their skin, see `AnimFit.skin`). */
const BODY = [
  "Hips",
  "LeftUpLeg",
  "RightUpLeg",
  "Spine",
  "Spine1",
  "Spine2",
  "LeftShoulder",
  "RightShoulder",
];
/** What sits on a seat. */
const BUTTOCKS = ["Hips", "LeftUpLeg", "RightUpLeg"];
/** Every bone whose skin is kept for the clips' fitting (the torso, and the limbs that rest on things). */
const SKIN = [
  ...BODY,
  "LeftFoot",
  "RightFoot",
  "LeftToeBase",
  "RightToeBase",
  "LeftForeArm",
  "RightForeArm",
  "LeftHand",
  "RightHand",
];
/** The limb chains a clip can settle (see `AnimFile.settle`): the bones turned together, and those whose skin is its end. */
const LIMBS: Record<string, { chain: string[]; end: string[] }> = {
  LeftLeg: {
    chain: ["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"],
    end: ["LeftFoot", "LeftToeBase"],
  },
  RightLeg: {
    chain: ["RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"],
    end: ["RightFoot", "RightToeBase"],
  },
  LeftArm: {
    chain: ["LeftArm", "LeftForeArm", "LeftHand"],
    end: ["LeftForeArm", "LeftHand"],
  },
  RightArm: {
    chain: ["RightArm", "RightForeArm", "RightHand"],
    end: ["RightForeArm", "RightHand"],
  },
};
/** The back, above the pelvis. */
const BACK = ["Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder"];

/** Bones turned (at rest) to point at their child's joint, as the character's own rig does. */
const AIM: Record<string, string> = {
  Spine: "Spine1",
  Spine1: "Spine2",
  Spine2: "Neck",
  Neck: "Head",
  LeftShoulder: "LeftArm",
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  RightShoulder: "RightArm",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
  RightFoot: "RightToeBase",
};

/** A converted character: its body parts (cm, facing +z, feet at 0; weights on BONES) and its rig's joints (cm). */
interface NpcBody {
  parts: { g: THREE.BufferGeometry; mat: string; color: number }[];
  joints: Record<string, THREE.Vector3>;
}
const bodies = new Map<string, Promise<NpcBody>>();
/** (Agora) A bone's name as Mixamo has it: Sketchfab's exports add "_012" and write "Left_Arm". */
const boneName = (n: string) =>
  n.replace(/_\d+$/, "").replace(/^(Left|Right)_/, "$1");

function loadBody(file: string, scale = 1): Promise<NpcBody> {
  let p = bodies.get(file);
  if (!p) {
    p = (async () => {
      // a GLB, base64 in a JSON file (the artifact host doesn't serve .glb)
      const { glb } = (await (await fetch(assetUrl(file))).json()) as {
        glb: string;
      };
      const buf = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0)).buffer;
      const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) =>
        new GLTFLoader().parse(buf, "", (g) => res(g), rej),
      );
      gltf.scene.updateMatrixWorld(true);
      const joints: Record<string, THREE.Vector3> = {};
      const meshes: THREE.SkinnedMesh[] = [];
      gltf.scene.traverse((o) => {
        if ((o as THREE.Bone).isBone)
          joints[boneName(o.name)] = o
            .getWorldPosition(new THREE.Vector3())
            .multiplyScalar(100 * scale);
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
          meshes.push(o as THREE.SkinnedMesh);
      });
      const parts = meshes.map((m) => {
        // the rest pose's vertex positions: any joint's bind (it undoes the file's quantization too)
        const sk = m.skeleton;
        const Q = new THREE.Matrix4()
          .multiplyMatrices(sk.bones[0]!.matrixWorld, sk.boneInverses[0]!)
          .multiply(m.bindMatrix);
        const src = m.geometry;
        const n = src.attributes["position"]!.count;
        const pos = new Float32Array(n * 3);
        const nor = new Float32Array(n * 3);
        const uv = new Float32Array(n * 2);
        const si = new Uint16Array(n * 4);
        const sw = new Float32Array(n * 4);
        const v = new THREE.Vector3();
        const map = sk.bones.map((b) => {
          const n = boneName(b.name);
          // (Agora) fingers go with their hand: the skeleton here has none
          const to =
            n === "HeadTop_End"
              ? "Head"
              : /^(Left|Right)Hand./.test(n)
                ? n.slice(0, n.indexOf("Hand") + 4)
                : n;
          return Math.max(0, BONES.indexOf(to));
        });
        const a = src.attributes;
        const uvs = a["uv"];
        for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(a["position"] as THREE.BufferAttribute, i)
            .applyMatrix4(Q)
            .multiplyScalar(100 * scale)
            .toArray(pos, i * 3);
          v.fromBufferAttribute(a["normal"] as THREE.BufferAttribute, i)
            .transformDirection(Q)
            .toArray(nor, i * 3);
          if (uvs) {
            uv[i * 2] = uvs.getX(i);
            uv[i * 2 + 1] = uvs.getY(i);
          }
          let sum = 0;
          for (let k = 0; k < 4; k++) {
            si[i * 4 + k] = map[a["skinIndex"]!.getComponent(i, k)]!;
            const w = a["skinWeight"]!.getComponent(i, k);
            sw[i * 4 + k] = w;
            sum += w;
          }
          for (let k = 0; k < 4; k++)
            sw[i * 4 + k] = sw[i * 4 + k]! / (sum || 1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
        g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
        if (src.index) g.setIndex(Array.from(src.index.array));
        g.computeBoundingSphere();
        const srcMat = (
          Array.isArray(m.material) ? m.material[0]! : m.material
        ) as THREE.MeshStandardMaterial;
        return {
          g,
          mat: srcMat.name,
          color: srcMat.color?.getHex() ?? 0xcccccc,
        };
      });
      return { parts, joints };
    })();
    bodies.set(file, p);
  }
  return p;
}

const npcTextures = new Map<string, THREE.Texture>();
function npcTexture(url: string): THREE.Texture {
  let t = npcTextures.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(assetUrl(url));
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // (glTF's UVs)
    t.wrapS = t.wrapT = THREE.RepeatWrapping; // (BitSoft's run off the edge)
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
    npcTextures.set(url, t);
  }
  return t;
}
const npcMats = new Map<string, THREE.Material>();
const npcMat = (url: string) => {
  let m = npcMats.get(url);
  if (!m)
    npcMats.set(
      url,
      (m = new THREE.MeshLambertMaterial({ map: npcTexture(url) })),
    );
  return m;
};

/** Dennis's walk with its hip height scaled to someone else's (cached by the ratio). */
const walks = new Map<string, THREE.AnimationClip>();
function scaledWalk(
  clip: THREE.AnimationClip | undefined,
  r: number,
): THREE.AnimationClip[] {
  if (!clip) return [];
  const key = r.toFixed(3);
  let c = walks.get(key);
  if (!c) {
    c = clip.clone();
    for (const t of c.tracks)
      if (/Hips\.position$/.test(t.name)) t.values = t.values.map((x) => x * r);
    walks.set(key, c);
  }
  return [c];
}

const fq = new THREE.Quaternion();
const fq2 = new THREE.Quaternion();
const fq3 = new THREE.Quaternion();
const fm = new THREE.Matrix4();
const fv = new THREE.Vector3();

/**
 * One of the packs' people (public/models/npc/; see scripts/convert-npcs.mjs): a copy of Dennis's skeleton, its joints
 * moved to this character's and its bones turned to lie along this character's limbs (its own rest pose: so his
 * Mixamo walk and every pose in code work on it as on him), the character's mesh bound to it there.
 * `name`: an id from cast.json ("retro-m2"), or a dressed crowd body ("crowd-male.3.5"). `height`: a scale on its own.
 */
export async function extra(name: string, height = 1): Promise<Person> {
  const [id, c, s] = name.split(".");
  const { people } = await loadCast();
  const e = people[id!];
  if (!e) throw new Error(`no such person: ${name}`);
  const [body, base] = await Promise.all([
    loadBody(e.file, e.scale ?? 1),
    loadPersonModel(),
  ]);
  const J = body.joints;
  // Dennis's skeleton, his mesh taken out
  const model = clone(base.scene);
  const bones: Record<string, THREE.Bone> = {};
  const drop: THREE.Object3D[] = [];
  model.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) bones[b.name.replace(/^mixamorig:?/, "")] = b;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  // fitted to the character (in the model's own frame: cm, while it's unscaled)
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  for (const n of BONES) {
    const b = bones[n];
    const p = J[n];
    if (!b || !p || !b.parent) continue;
    b.parent.updateWorldMatrix(true, false);
    b.position.copy(p).applyMatrix4(fm.copy(b.parent.matrixWorld).invert());
    const cn = AIM[n];
    const child = cn ? bones[cn] : undefined;
    if (cn && child && J[cn]) {
      b.updateWorldMatrix(false, false);
      const bw = b.getWorldQuaternion(fq);
      const now = fv.copy(child.position).normalize().applyQuaternion(bw);
      const want = J[cn].clone().sub(p).normalize();
      const pw = b.parent.getWorldQuaternion(fq2).invert();
      b.quaternion.copy(
        pw.multiply(fq3.setFromUnitVectors(now, want)).multiply(bw),
      );
      b.updateWorldMatrix(false, false);
    }
  }
  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]!));
  for (const part of body.parts) {
    let mat: THREE.Material;
    if (e.clothing && e.skin) {
      const list = part.mat.includes("skin") ? e.skin : e.clothing;
      const k =
        Math.min(
          list.length,
          Math.max(1, Number(part.mat.includes("skin") ? s : c) || 1),
        ) - 1;
      mat = npcMat(list[k]!);
    } else
      mat = e.tex
        ? npcMat(e.tex)
        : new THREE.MeshLambertMaterial({ color: part.color }); // (Agora) an untextured model: its own colours
    const mesh = new THREE.SkinnedMesh(part.g, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    model.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
  }
  model.scale.setScalar(SCALE * height);
  const hips =
    base.scene.getObjectByName("mixamorigHips") ??
    base.scene.getObjectByName("mixamorig:Hips");
  const r = hips ? (J["Hips"]?.y ?? hips.position.y) / hips.position.y : 1;
  return new Person(model, scaledWalk(base.animations[0], r));
}
