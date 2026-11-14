import * as THREE from 'three';
import type { Person } from './character/person';

/**
 * Hands for a short-armed cartoon body (the chibi): big, simple poses held away from the body, where a human's
 * gestures (./character/gestures.ts: hands to the face, arms folded) would sink into the belly or the head.
 * - talking: a new pose at each pause in his voice (or every couple of seconds), a bounce on the loud syllables;
 * - searching: both hands rummaging in front of him, his head looking from side to side;
 * - presenting: his right arm out to the side, palm up, for the picks to float over;
 * - hello: a wave.
 * Directions are in his own frame (x: outward from his body for either arm, y: up, z: ahead).
 */

export type Act = 'idle' | 'talking' | 'searching' | 'presenting' | 'hello';
type V = readonly [number, number, number];
interface Arm {
  up: V;
  fore: V;
}
interface Pose {
  l: Arm;
  r: Arm;
}

const HANG: Arm = { up: [0.4, -1, 0.05], fore: [0.3, -1, 0.25] };
const OPEN: Arm = { up: [0.9, -0.3, 0.4], fore: [0.7, 0.35, 0.65] };
const HIGH: Arm = { up: [0.85, 0.35, 0.2], fore: [0.3, 1, 0.25] };
const POINT: Arm = { up: [0.35, -0.25, 1], fore: [0.1, 0.1, 1] };
const SHRUG: Arm = { up: [1, -0.5, 0.1], fore: [1, 0.45, 0.25] };
const CHEER: Arm = { up: [0.75, 0.65, 0.1], fore: [0.45, 1, 0.1] };
const OFFER: Arm = { up: [1, 0.05, 0.4], fore: [0.8, 0.55, 0.4] };
const DIG: Arm = { up: [0.45, -0.6, 0.75], fore: [0.1, 0.1, 1] };
const WAVE: Arm = { up: [0.85, 0.5, 0.1], fore: [0.3, 1, 0.1] };

/** What he does with his hands while he talks: never the same one twice running. */
const TALK: Pose[] = [
  { l: OPEN, r: OPEN },
  { l: HANG, r: HIGH },
  { l: HIGH, r: HANG },
  { l: HANG, r: POINT },
  { l: SHRUG, r: SHRUG },
  { l: OPEN, r: HIGH },
  { l: CHEER, r: CHEER },
  { l: POINT, r: HANG },
];

/** A pose is kept at least this long, and changed after this long without a pause (s). */
const MIN_HOLD = 0.7;
const MAX_HOLD = 2.4;
/** Quieter than this (dB) for this long (s) is a pause between phrases. */
const PAUSE_DB = -42;
const PAUSE = 0.16;
/** How fast the arms ease to a pose (1/s). */
const EASE = 9;

const tmp = new THREE.Vector3();
const flat = (p: Pose): number[] => [...p.l.up, ...p.l.fore, ...p.r.up, ...p.r.fore];

export function createCartoon(rand: () => number = Math.random) {
  let now = flat({ l: HANG, r: HANG });
  let weight = 0;
  let talk = 0;
  let held = 0;
  let quiet = 0;
  let headYaw = 0;
  let headPitch = 0;
  let t = 0;

  return {
    /** Pose `p` for this frame: `level` his voice (dB, null when quiet), `open` its loudness eased (0..1);
     * `holding`: the picks are over his right hand, so it stays out whatever else he does. */
    apply(p: Person, dt: number, act: Act, level: number | null, open: number, holding = false): void {
      t += dt;
      // talking: the next pose at a pause, or when this one has been held long enough
      if (act === 'talking') {
        held += dt;
        quiet = level === null || level < PAUSE_DB ? quiet + dt : 0;
        if ((quiet > PAUSE && held > MIN_HOLD) || held > MAX_HOLD) {
          talk = (talk + 1 + Math.floor(rand() * (TALK.length - 1))) % TALK.length;
          held = 0;
          quiet = 0;
        }
      }
      let want: Pose = { l: HANG, r: HANG };
      let yaw = 0;
      let pitch = 0;
      if (act === 'talking') want = TALK[talk]!;
      else if (act === 'presenting') want = { l: HANG, r: OFFER };
      else if (act === 'hello') want = { l: HANG, r: { up: WAVE.up, fore: [WAVE.fore[0] + 0.55 * Math.sin(t * 10), WAVE.fore[1], WAVE.fore[2]] } };
      else if (act === 'searching') {
        const paddle = 0.45 * Math.sin(t * 7);
        want = { l: { up: DIG.up, fore: [DIG.fore[0], DIG.fore[1] + paddle, 1] }, r: { up: DIG.up, fore: [DIG.fore[0], DIG.fore[1] - paddle, 1] } };
        yaw = 0.4 * Math.sin(t * 1.4);
        pitch = 0.16;
      }
      if (holding && act !== 'searching') want = { l: want.l, r: OFFER };
      const k = 1 - Math.exp(-dt * EASE);
      const target = flat(want);
      now = now.map((v, i) => v + (target[i]! - v) * k);
      weight += ((act === 'idle' ? 0 : 1) - weight) * (1 - Math.exp(-dt * 5));
      headYaw += (yaw - headYaw) * (1 - Math.exp(-dt * 4));
      headPitch += (pitch - headPitch) * (1 - Math.exp(-dt * 4));
      if (weight < 0.002) return;

      // a bounce on the loud syllables: the forearms lift, he bobs
      const beat = act === 'talking' ? open : 0;
      p.add('Spine', -0.05 * beat * weight, 0, 0);
      for (const [side, s, o] of [['Left', 1, 0], ['Right', -1, 6]] as const) {
        p.aim(`${side}Arm`, `${side}ForeArm`, tmp.set(s * now[o]!, now[o + 1]!, now[o + 2]!), weight);
        p.aim(`${side}ForeArm`, `${side}Hand`, tmp.set(s * now[o + 3]!, now[o + 4]! + 0.3 * beat, now[o + 5]!), weight);
      }
      p.add('Head', headPitch * weight, headYaw * weight, 0);
    },
  };
}

/** A body is a cartoon when its arms are short for its height (the chibi's are a fifth of it; a person's a third). */
export function isCartoon(p: Person, height: number): boolean {
  const a = p.bones['RightArm'];
  const h = p.bones['RightHand'];
  if (!a || !h) return false;
  p.root.updateMatrixWorld(true);
  const arm = a.getWorldPosition(new THREE.Vector3()).distanceTo(h.getWorldPosition(new THREE.Vector3()));
  return arm / height < 0.26;
}
