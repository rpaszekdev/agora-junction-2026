/**
 * Dennis's hands while he talks (./friend.ts poses them): what a person does with their hands explaining something,
 * moved on by the speech itself.
 *
 * - The ear: his voice's loudness (dB, each frame, from the analyser on his mouth) is followed for the phrases in it.
 *   A dip under the speech's level (well under its recent peaks, with hysteresis) for a fifth of a second or so is a
 *   pause between phrases; over a second, a long pause; a quick jump in loudness is a stressed syllable (a beat).
 * - The hands: a repertoire of gestures (open palms, a chopping hand, counting on his fingers, shaping a box, a
 *   shrug, pointing at you, a hand on his hip, rolling hands, a dismissive flick, rubbing his neck or his face,
 *   arms folded, a "come on"), a new one at each pause (weighted, never the same one twice running, mirrored now
 *   and then, a little different each time), eased into; beats are small strokes of the hand on top; a long pause and
 *   his arms drop. He's impatient and fed up, and it shows.
 * - Never still: a little slow drift on everything, so a held gesture isn't frozen.
 *
 * Directions are in his own frame (x: his left, y: up, z: ahead), as friend.ts aims his bones; a gesture's arms are
 * written for either arm with x outward (away from his body), so the same numbers serve both sides.
 */

/** The ear's settings (dB, seconds). */
export const EAR = {
  /** A pause: this far under the speech's recent peak level… */
  PAUSE_DB: 15,
  /** …and back to speech this much above that again (the hysteresis). */
  HYSTERESIS_DB: 6,
  /** Never take anything quieter than this for speech (whatever the peaks). */
  FLOOR_DB: -52,
  /** A pause is this long a dip (shorter: a gap between words). */
  PAUSE: 0.2,
  /** A long pause: the hands drop to rest. */
  LONG: 1.1,
  /** Speech again: this long over the threshold. */
  ONSET: 0.04,
  /** The peak level falls back this fast (dB/s) when he's quieter. */
  PEAK_FALL: 2,
  /** A beat: the loudness jumps this much over its last quarter second… */
  BEAT_DB: 6,
  /** …near his loudest (within this of the peak), at most this often. */
  BEAT_NEAR_DB: 9,
  BEAT_GAP: 0.28,
};

/** The hands' settings. */
const HANDS = {
  /** A gesture is held at least this long before another (pauses closer together don't change it). */
  MIN_HOLD: 0.8,
  /** One phrase going on this long without a pause: a new gesture on its next beat. */
  LONG_PHRASE: 3.2,
  /** Easing into a gesture (the spring's speed: about 4.7 / this seconds to settle, ~0.35 s). */
  OMEGA: 13.5,
  /** The drift on a held pose. */
  NOISE: 0.045,
};

type V = readonly [number, number, number];
/** An arm: the upper arm's and forearm's directions (x outward), the hand's (bent at the wrist; else straight on from
 * the forearm), the forearm's roll (+: palm up), the shoulder raised. */
interface Arm {
  up: V;
  fore: V;
  hand?: V;
  twist?: number;
  shrug?: number;
}
/** His body in a gesture (radians), towards his main hand's side where it has one: */
interface Body {
  /** Leaning forward (−: back). */
  lean?: number;
  /** His main hand's shoulder brought forward. */
  twist?: number;
  /** Leaning over to his main hand's side. */
  side?: number;
  /** His head: down (−: chin up), turned towards his main hand's side, tilted that way. */
  pitch?: number;
  yaw?: number;
  roll?: number;
}
interface Gesture {
  name: string;
  /** How often he reaches for it. */
  weight: number;
  /** One hand or two (for the mix: he goes back and forth between them). */
  hands: 1 | 2;
  /** Fine sitting on the toilet (elbows on his knees). */
  seated: boolean;
  /** His main hand (the right, unless mirrored), and the other. */
  main: Arm;
  other: Arm;
  body?: Body;
  /** Movement within it, by its age (s): offsets to the main and other forearm (x outward). */
  move?: (age: number, main: number[], other: number[]) => void;
  /** Which hands take the beats, and which way the stroke goes (on the forearm; x outward). */
  beat: 'main' | 'both' | 'none';
  beatDir?: V;
  /** A passing gesture (the shrug, the flick): over after this long, and on to another. */
  life?: number;
  /** Its own speed into it (a flick is quick). */
  omega?: number;
  /** Taken more on longer pauses (a breath between thoughts). */
  calm?: boolean;
}

// ---------------------------------------------------------------- the arms
/** Hanging at his side (as friend.ts stands him). */
const REST: Arm = { up: [0.2, -1, 0.04], fore: [0.1, -1, 0.15] };
/** Loosely forward at his waist (the hand that isn't doing anything). */
const LOW: Arm = { up: [0.22, -1, 0.2], fore: [0.08, -0.65, 1], twist: 0.3 };
/** Half up in front, loose, explaining. */
const LOOSE: Arm = { up: [0.3, -0.85, 0.4], fore: [0.3, 0.05, 1], twist: 0.5 };

// ---------------------------------------------------------------- the repertoire
const GESTURES: Gesture[] = [
  {
    // "look,": both hands out, palms up
    name: 'open palms',
    weight: 1.2,
    hands: 2,
    seated: true,
    main: { up: [0.38, -0.85, 0.32], fore: [0.55, 0.0, 1], twist: 1.0 },
    other: { up: [0.38, -0.85, 0.32], fore: [0.55, 0.0, 1], twist: 1.0 },
    body: { lean: -0.03, pitch: -0.04, roll: 0.06 },
    beat: 'both',
    beatDir: [0.15, -0.35, 0],
  },
  {
    // "this. is. how. it. is.": the edge of his hand chopping down on each word
    name: 'chop',
    weight: 1.3,
    hands: 1,
    seated: true,
    main: { up: [0.12, -0.8, 0.5], fore: [-0.08, 0.3, 1], twist: 0 },
    other: LOW,
    body: { lean: 0.06, twist: 0.08, pitch: 0.05 },
    beat: 'main',
    beatDir: [0, -0.9, 0.1],
  },
  {
    // "one, two": ticking off points on the fingers of his other hand
    name: 'counting',
    weight: 0.8,
    hands: 2,
    seated: true,
    main: { up: [0.16, -0.85, 0.5], fore: [-0.5, 0.2, 1], twist: 0.2 },
    other: { up: [0.16, -0.85, 0.5], fore: [-0.45, 0.4, 1], twist: 0.6 },
    body: { lean: 0.04, pitch: 0.12, yaw: -0.08 },
    move: (a, m) => {
      m[1]! += 0.12 * Math.max(0, Math.sin(a * 7.5));
    },
    beat: 'main',
    beatDir: [0.1, -0.3, 0],
  },
  {
    // "the whole thing": both hands holding a box in front of him
    name: 'box',
    weight: 0.9,
    hands: 2,
    seated: true,
    main: { up: [0.3, -0.8, 0.45], fore: [-0.05, 0.15, 1], twist: -0.5 },
    other: { up: [0.3, -0.8, 0.45], fore: [-0.05, 0.15, 1], twist: -0.5 },
    body: { lean: 0.03, pitch: 0.03 },
    move: (a, m, o) => {
      const sq = 0.1 * Math.sin(a * 3.2);
      m[0]! += sq;
      o[0]! += sq;
    },
    beat: 'both',
    beatDir: [-0.1, -0.35, 0],
  },
  {
    // "what do you want me to do": shoulders up, forearms out, palms up, head on one side
    name: 'shrug',
    weight: 0.8,
    hands: 2,
    seated: true,
    main: { up: [0.3, -0.95, 0.15], fore: [0.7, -0.05, 0.75], twist: 1.1, shrug: 1 },
    other: { up: [0.3, -0.95, 0.15], fore: [0.7, -0.05, 0.75], twist: 1.1, shrug: 1 },
    body: { lean: -0.05, pitch: -0.06, roll: 0.16 },
    beat: 'none',
    life: 1.2,
  },
  {
    // "you": jabbing a finger at you
    name: 'point',
    weight: 0.9,
    hands: 1,
    seated: false,
    main: { up: [0.12, -0.35, 1], fore: [-0.08, 0.05, 1], twist: 0 },
    other: REST,
    body: { lean: 0.07, twist: 0.14, pitch: 0.08 },
    beat: 'main',
    beatDir: [0, -0.3, 0.2],
  },
  {
    // "I'm waiting": a hand on his hip, the other one going
    name: 'hand on hip',
    weight: 1.0,
    hands: 1,
    seated: false,
    main: LOOSE,
    other: { up: [0.8, -0.55, -0.3], fore: [-0.65, -0.7, 0.1], twist: 0 },
    body: { side: -0.05, roll: -0.08, pitch: -0.02 },
    beat: 'main',
    beatDir: [0.1, -0.45, 0],
    calm: true,
  },
  {
    // "and so on, and so on": his hand rolling over and over
    name: 'rolling',
    weight: 0.8,
    hands: 1,
    seated: true,
    main: { up: [0.25, -0.8, 0.45], fore: [0.2, 0.05, 1], twist: 0.6 },
    other: LOW,
    body: { yaw: 0.06, roll: 0.05 },
    move: (a, m) => {
      m[1]! += 0.35 * Math.cos(a * 7);
      m[2]! += 0.3 * Math.sin(a * 7);
    },
    beat: 'none',
  },
  {
    // the same, both hands, out of step
    name: 'rolling, both',
    weight: 0.5,
    hands: 2,
    seated: true,
    main: { up: [0.3, -0.8, 0.45], fore: [0.2, 0.05, 1], twist: 0.6 },
    other: { up: [0.3, -0.8, 0.45], fore: [0.2, 0.05, 1], twist: 0.6 },
    move: (a, m, o) => {
      m[1]! += 0.3 * Math.cos(a * 6.5);
      m[2]! += 0.25 * Math.sin(a * 6.5);
      o[1]! += 0.3 * Math.cos(a * 6.5 + Math.PI);
      o[2]! += 0.25 * Math.sin(a * 6.5 + Math.PI);
    },
    beat: 'none',
  },
  {
    // "ach, whatever": the back of his hand flicked out and away, his head turning away
    name: 'flick',
    weight: 0.7,
    hands: 1,
    seated: true,
    main: { up: [0.4, -0.85, 0.15], fore: [0.95, -0.35, 0.35], twist: -0.8 },
    other: REST,
    body: { yaw: -0.22, pitch: -0.06, lean: -0.03 },
    // first the hand comes up in front of him, then it's flicked out (the main forearm's offset from where it ends)
    move: (a, m) => {
      const k = a < 0.22 ? 1 : 0;
      m[0]! += k * -1.3;
      m[1]! += k * 0.7;
      m[2]! += k * 0.65;
    },
    beat: 'none',
    life: 0.9,
    omega: 20,
  },
  {
    // "God, man": rubbing the back of his neck, looking down
    name: 'neck rub',
    weight: 0.6,
    hands: 1,
    seated: true,
    main: { up: [0.75, -0.05, 0.35], fore: [-0.67, 0.33, -0.67], hand: [-0.6, -0.1, -0.8], twist: 0 },
    other: REST,
    body: { lean: 0.04, pitch: 0.22, roll: -0.1 },
    move: (a, m) => {
      m[1]! += 0.1 * Math.sin(a * 9);
    },
    beat: 'none',
    calm: true,
  },
  {
    // "I can't believe this": a hand over his eyes and forehead
    name: 'face rub',
    weight: 0.5,
    hands: 1,
    seated: true,
    main: { up: [0, -0.85, 0.5], fore: [-0.4, 0.75, 0.35], hand: [-0.1, 0.6, -0.8], twist: -0.3 },
    other: LOW,
    body: { lean: 0.05, pitch: 0.28 },
    move: (a, m) => {
      m[0]! += 0.08 * Math.sin(a * 6);
    },
    beat: 'none',
    calm: true,
  },
  {
    // arms folded, chin up: talking at you
    name: 'arms folded',
    weight: 0.6,
    hands: 2,
    seated: false,
    main: { up: [0.12, -0.9, 0.38], fore: [-1, 0.2, 0.32], twist: 0 },
    other: { up: [0.12, -0.9, 0.38], fore: [-1, 0.02, 0.38], twist: 0 },
    body: { lean: -0.05, pitch: -0.06 },
    beat: 'none',
    calm: true,
  },
  {
    // "come on": both hands up, palms up, shaking impatiently
    name: 'come on',
    weight: 0.8,
    hands: 2,
    seated: true,
    main: { up: [0.3, -0.85, 0.35], fore: [0.25, 0.3, 1], twist: 0.9 },
    other: { up: [0.3, -0.85, 0.35], fore: [0.25, 0.3, 1], twist: 0.9 },
    body: { lean: 0.04, pitch: -0.04 },
    move: (a, m, o) => {
      const sh = 0.16 * Math.sin(a * 11);
      m[1]! += sh;
      o[1]! += sh;
    },
    beat: 'both',
    beatDir: [0, -0.3, 0],
  },
];
/** Not gesturing (a long pause, or before he starts). */
const RESTING: Gesture = { name: 'rest', weight: 0, hands: 2, seated: true, main: REST, other: REST, beat: 'none' };

// ---------------------------------------------------------------- the springs
/** Each value eased towards its target on a critically damped spring (no snapping, no overshoot). */
const ARM_N = 11; // up (3), fore (3), twist, shrug, hand (3)
const N = ARM_N * 2 + 6 + 2; // the arms (left, right), the body (6), how far each arm is from hanging (2)
const B0 = ARM_N * 2;
const ACT = B0 + 6;

export interface GestureFrame {
  /** Left and right: the upper arm's and forearm's directions (his frame, not normalised), the forearm's roll (+:
   * palm up on either side), the shoulder raised (0..1), and how much the arm is gesturing at all (0..1). */
  arms: { up: [number, number, number]; fore: [number, number, number]; hand: [number, number, number]; twist: number; shrug: number; act: number }[];
  /** His upper body (lean forward, turn to his left, lean to his right: radians, as `add` on the spine). */
  lean: number;
  twist: number;
  roll: number;
  /** His head (down, to his left, tilt to his right). */
  pitch: number;
  yaw: number;
  tilt: number;
  /** What he's doing with his hands, in words (and what the ear last heard). */
  name: string;
  heard: string;
}

export interface Gestures {
  /** Each frame: `level` the voice's loudness (dB), null when he's not talking; `seated` on the toilet; `energy`
   * how loud, slowly (0..1). */
  update(dt: number, level: number | null, seated: boolean, energy: number): GestureFrame;
  /** The ear's counts (pauses, long pauses, beats, gestures), for testing. */
  counts: { pauses: number; long: number; beats: number; changes: number };
  /** (For testing.) Hold one gesture by name (mirrored: in the other hand), whatever he says; null lets go. */
  hold(name: string | null, mirrored?: boolean): void;
  /** The repertoire's names. */
  names: string[];
}

export function createGestures(rand: () => number = Math.random): Gestures {
  // ---- the ear
  let peak = -22; // the speech's recent loudest (dB)
  let fast = -60; // loudness over the last few frames
  let slow = -60; // over the last quarter second
  let speaking = false;
  let below = 0; // how long under the threshold
  let above = 0; // how long over it
  let longDone = true;
  let sinceBeat = 1;
  let wasTalking = false;
  let held: Gesture | null = null;
  let heard = '';
  const counts = { pauses: 0, long: 0, beats: 0, changes: 0 };

  // ---- the hands
  const pos = new Float64Array(N);
  const vel = new Float64Array(N);
  const target = new Float64Array(N);
  let current: Gesture = RESTING;
  let previous: Gesture = RESTING;
  let mirror = false;
  let age = 10;
  let omega = HANDS.OMEGA;
  /** This time round: a little different from the last (scaled, nudged). */
  let amp = 1;
  const jitter = new Float64Array(12);
  let beat = 0; // the stroke (a damped spring, kicked)
  let beatV = 0;
  let nod = 0;
  let nodV = 0;
  let t = rand() * 100;
  const main = [0, 0, 0];
  const other = [0, 0, 0];
  const frame: GestureFrame = {
    arms: [0, 1].map(() => ({ up: [0, 0, 0] as [number, number, number], fore: [0, 0, 0] as [number, number, number], hand: [0, 0, 0] as [number, number, number], twist: 0, shrug: 0, act: 0 })),
    lean: 0,
    twist: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
    tilt: 0,
    name: 'rest',
    heard: '',
  };
  // start at rest
  setTargets(0);
  pos.set(target);

  /** Pick another gesture: weighted, not the one he's doing or the one before, one hand and two in turn more or less. */
  function choose(seated: boolean, calm: boolean) {
    if (held) return;
    // (the one-handed and two-handed versions of a gesture count as the same one)
    const kind = (g: Gesture) => g.name.split(',')[0];
    const pool = GESTURES.filter((g) => kind(g) !== kind(current) && kind(g) !== kind(previous) && (!seated || g.seated));
    const weights = pool.map((g) => {
      let w = g.weight;
      if (calm && g.calm) w *= 2.5;
      if (current !== RESTING && g.hands === current.hands) w *= 0.7; // a change of hands is more of a change
      return w;
    });
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    let pick = pool[pool.length - 1]!;
    for (let n = 0; n < pool.length; n++) if ((r -= weights[n]!) <= 0) {
      pick = pool[n]!;
      break;
    }
    go(pick);
  }
  function go(g: Gesture) {
    if (g !== current) {
      previous = current;
      current = g;
      counts.changes++;
    }
    age = 0;
    omega = g.omega ?? HANDS.OMEGA * (0.85 + 0.3 * rand());
    mirror = rand() < (g.hands === 1 ? 0.35 : 0.5);
    amp = 0.85 + 0.3 * rand();
    for (let n = 0; n < jitter.length; n++) jitter[n] = (rand() - 0.5) * 0.16;
  }

  /** The current gesture's pose as the springs' targets (`a`: its age). */
  function setTargets(a: number) {
    const g = current;
    main.fill(0);
    other.fill(0);
    g.move?.(a, main, other);
    // the main hand: the right (n = 1), or mirrored the left
    const mainN = mirror ? 0 : 1;
    const sm = mainN === 0 ? 1 : -1; // its side (x: +1 his left)
    for (const n of [0, 1]) {
      const isMain = n === mainN;
      const arm = isMain ? g.main : g.other;
      const off = isMain ? main : other;
      const s = n === 0 ? 1 : -1;
      const j = isMain ? 0 : 6;
      const o = n * ARM_N;
      const rest = arm === REST;
      const k = rest ? 1 : amp; // how big this time
      const jit = rest ? 0 : 1;
      // (scaled about the hanging arm, so smaller is nearer his side)
      target[o] = s * (REST.up[0] + (arm.up[0] - REST.up[0]) * k + jit * jitter[j]!);
      target[o + 1] = REST.up[1] + (arm.up[1] - REST.up[1]) * k + jit * jitter[j + 1]!;
      target[o + 2] = REST.up[2] + (arm.up[2] - REST.up[2]) * k + jit * jitter[j + 2]!;
      target[o + 3] = s * (arm.fore[0] + off[0]! + jit * jitter[j + 3]!);
      target[o + 4] = arm.fore[1] + off[1]! + jit * jitter[j + 4]!;
      target[o + 5] = arm.fore[2] + off[2]! + jit * jitter[j + 5]!;
      target[o + 6] = arm.twist ?? 0;
      target[o + 7] = arm.shrug ?? 0;
      // the hand: bent, or straight on from the forearm
      const hd = arm.hand;
      target[o + 8] = hd ? s * hd[0] : target[o + 3]!;
      target[o + 9] = hd ? hd[1] : target[o + 4]!;
      target[o + 10] = hd ? hd[2] : target[o + 5]!;
      target[ACT + n] = rest ? 0 : 1;
    }
    const b = g.body ?? {};
    target[B0] = (b.lean ?? 0) * amp;
    target[B0 + 1] = -sm * (b.twist ?? 0) * amp; // his main shoulder forward: turned towards the other side
    target[B0 + 2] = -sm * (b.side ?? 0) * amp;
    target[B0 + 3] = (b.pitch ?? 0) * amp;
    target[B0 + 4] = sm * (b.yaw ?? 0) * amp;
    target[B0 + 5] = -sm * (b.roll ?? 0) * amp;
  }

  const update = (dt: number, level: number | null, seated: boolean, energy: number): GestureFrame => {
    t += dt;
    age += dt;
    sinceBeat += dt;
    const talking = level !== null;
    if (talking && !wasTalking) {
      // he starts: straight into something
      speaking = false;
      below = above = 0;
      longDone = true;
      peak = Math.max(peak, -26);
    }
    if (!talking && wasTalking && !held) go(RESTING);
    wasTalking = talking;

    // ---- the ear
    if (level !== null) {
      // the loudest lately: up at once, down slowly (so a quieter stretch still has its pauses)
      if (level > peak) peak += (level - peak) * Math.min(1, dt * 10);
      else peak = Math.max(EAR.FLOOR_DB + EAR.PAUSE_DB, peak - EAR.PEAK_FALL * dt);
      fast += (level - fast) * Math.min(1, dt * 30);
      slow += (level - slow) * Math.min(1, dt * 4);
      const off = Math.max(EAR.FLOOR_DB, peak - EAR.PAUSE_DB);
      const on = off + EAR.HYSTERESIS_DB;
      if (level < off) {
        below += dt;
        above = 0;
      } else if (level > on) {
        above += dt;
        below = 0;
      } else above = 0; // in between: neither
      // a phrase starts: from rest (or the very first words), into a gesture
      if (!speaking && above >= EAR.ONSET) {
        speaking = true;
        if (current === RESTING) {
          choose(seated, false);
          heard = 'speech';
        }
      }
      // a pause: a new gesture (as people change their hands between phrases)
      if (speaking && below >= EAR.PAUSE) {
        speaking = false;
        longDone = false;
        counts.pauses++;
        heard = 'pause';
        if (age > HANDS.MIN_HOLD && current !== RESTING) choose(seated, false);
      }
      // a long pause: his arms drop (or, now and then, he folds them, or rubs his neck)
      if (!speaking && !longDone && below >= EAR.LONG) {
        longDone = true;
        counts.long++;
        heard = 'long pause';
        if (held) {
          /* (testing: holding one) */
        } else if (rand() < 0.7) go(RESTING);
        else choose(seated, true);
      }
      // a stressed syllable: a beat (a stroke of the hand, a nod)
      if (speaking && fast - slow > EAR.BEAT_DB && fast > peak - EAR.BEAT_NEAR_DB && sinceBeat > EAR.BEAT_GAP) {
        sinceBeat = 0;
        counts.beats++;
        const strength = Math.min(1, 0.45 + (fast - slow - EAR.BEAT_DB) / 8);
        beatV += 9 * strength;
        nodV += 6 * strength;
        heard = 'beat';
        // one long phrase: a new gesture on its next beat
        if (age > HANDS.LONG_PHRASE + rand() && current !== RESTING) choose(seated, false);
      }
    }
    // a passing gesture over: on to another (or rest, if he's quiet)
    if (current.life && age > current.life && !held) {
      if (talking && speaking) choose(seated, false);
      else go(RESTING);
    }

    // ---- the pose
    setTargets(age);
    const w = omega;
    const h = Math.min(dt, 1 / 30);
    for (let step = dt; step > 1e-6; step -= h) {
      const d = Math.min(h, step);
      for (let n = 0; n < N; n++) {
        vel[n]! += (w * w * (target[n]! - pos[n]!) - 2 * w * vel[n]!) * d;
        pos[n]! += vel[n]! * d;
      }
      // the beat and the nod: springy, quick strokes that settle back
      beatV += (-260 * beat - 26 * beatV) * d;
      beat += beatV * d;
      nodV += (-200 * nod - 22 * nodV) * d;
      nod += nodV * d;
    }

    // out: the springs, the beats on the hands that take them, the drift, a touch higher the louder he is
    const mainN = mirror ? 0 : 1;
    const bd = current.beatDir ?? [0, -0.4, 0];
    const lift = 0.15 * (energy - 0.4);
    for (const n of [0, 1]) {
      const a = frame.arms[n]!;
      const o = n * ARM_N;
      const s = n === 0 ? 1 : -1;
      const act = pos[ACT + n]!;
      const beats = current.beat === 'both' || (current.beat === 'main' && n === mainN) ? beat : 0;
      const ph = n * 2.3;
      const drift = HANDS.NOISE * (0.4 + 0.6 * act);
      a.up[0] = pos[o]! + drift * 0.5 * Math.sin(t * 0.7 + ph);
      a.up[1] = pos[o + 1]! + drift * 0.6 * Math.sin(t * 0.53 + ph * 1.7) + beats * 0.25 * bd[1];
      a.up[2] = pos[o + 2]! + drift * 0.6 * Math.sin(t * 0.91 + ph * 0.6);
      a.fore[0] = pos[o + 3]! + s * (drift * Math.sin(t * 1.13 + ph) + beats * bd[0]);
      a.fore[1] = pos[o + 4]! + drift * Math.sin(t * 0.83 + ph * 1.3) * Math.sin(t * 0.29 + ph) + beats * bd[1] + lift * act;
      a.fore[2] = pos[o + 5]! + drift * 0.7 * Math.sin(t * 1.37 + ph * 0.4) + beats * bd[2];
      a.twist = pos[o + 6]!;
      a.shrug = pos[o + 7]!;
      // (straight on from the forearm, but for the bend: the drift and the beats go with it)
      a.hand[0] = a.fore[0] + pos[o + 8]! - pos[o + 3]!;
      a.hand[1] = a.fore[1] + pos[o + 9]! - pos[o + 4]!;
      a.hand[2] = a.fore[2] + pos[o + 10]! - pos[o + 5]!;
      a.act = act;
    }
    frame.lean = pos[B0]! + 0.012 * Math.sin(t * 0.47);
    frame.twist = pos[B0 + 1]! + 0.02 * Math.sin(t * 0.31);
    frame.roll = pos[B0 + 2]!;
    frame.pitch = pos[B0 + 3]! + 0.05 * nod;
    frame.yaw = pos[B0 + 4]! + 0.03 * Math.sin(t * 0.43);
    frame.tilt = pos[B0 + 5]! + 0.02 * Math.sin(t * 0.37 + 1);
    frame.name = current.name;
    frame.heard = heard;
    return frame;
  };

  const hold = (name: string | null, mirrored = false) => {
    held = name ? (GESTURES.find((g) => g.name === name) ?? null) : null;
    if (held) {
      go(held);
      mirror = mirrored;
    }
  };
  return { update, counts, hold, names: GESTURES.map((g) => g.name) };
}
