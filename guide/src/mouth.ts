import * as THREE from "three";
import type { Person } from "./character/person";

/**
 * A painted mouth. No body here has a jaw bone or mouth shapes (checked: Michelle and the game's bodies), so a
 * small dark patch sits on the face, fixed to the head bone, and opens with the loudness of the voice: the old
 * consoles' trick. Shut, it is hidden, and the mouth painted on the face shows.
 * ponytail: loudness only, one shape. If it reads as flapping, take the shape from the sound itself
 * (wass08/wawa-lipsync, met4citizen/HeadAudio): that needs several mouth pictures, not a new body.
 */

/**
 * Where a body's mouth is and how big, in shares of its head's height: from the head bone (the top of the neck) to
 * the top of the body, hair and hat included, so a body with big hair needs its own numbers. Found by eye.
 */
export interface MouthLook {
  /** How far up the head it is: 0 at the head bone, 1 at the top. */
  up: number;
  /** Its width, and its height wide open. */
  wide: number;
  tall: number;
  color: number;
}
/** The game's bodies (set on "retro-m3", the default). */
const LOOK: MouthLook = { up: 0.11, wide: 0.26, tall: 0.1, color: 0x3b1a16 };
/**
 * The mouth's own ear. Wide open is her loudest sound of late, and shut is `RANGE` dB under it: measured from a
 * fixed loudness instead, the mouth hung wide open through every sentence (traced: open on all frames of a reply).
 */
const EAR = {
  /** From shut to wide open (dB): the dip between a vowel and the consonant after it is about this deep. */
  RANGE: 14,
  /** The loudest of late forgets this fast (dB a second), and never falls under the floor (a hiss is not speech). */
  PEAK_FALL: 3,
  FLOOR_DB: -38,
  /** Her loudest before she has said anything (dB): from the floor, her first word would be all wide open. */
  START_DB: -12,
  /** How fast it opens and shuts (1/s): opening is the quicker. */
  RISE: 40,
  FALL: 22,
};

/** How open the mouth is (0..1) for the voice's loudness now (dB, or null: silent). Call it once a frame. */
export function createOpening(): (level: number | null, dt: number) => number {
  let peak = EAR.START_DB;
  let open = 0;
  return (level, dt) => {
    if (level !== null)
      peak = Math.max(level, peak - EAR.PEAK_FALL * dt, EAR.FLOOR_DB);
    const want =
      level === null
        ? 0
        : Math.max(0, Math.min(1, (level - peak + EAR.RANGE) / EAR.RANGE));
    open +=
      (want - open) * Math.min(1, dt * (want > open ? EAR.RISE : EAR.FALL));
    return open;
  };
}

/** It sits this far in front of the skin (m): clear of the curve of the face. */
const PROUD = 0.004;
/** Quieter than this (0..1) and it is shut. */
const SHUT = 0.04;

/**
 * Put a mouth on `p`, who stands upright facing +z and is `top` metres tall. The function it returns sets how open
 * the mouth is, 0..1. A body with no head bone, or no face where the mouth should be, gets none.
 */
export function createMouth(
  p: Person,
  top: number,
  look: Partial<MouthLook> = {},
): (open: number) => void {
  const { up, wide, tall, color } = { ...LOOK, ...look };
  const head = p.bones["Head"];
  if (!head) {
    console.warn("no mouth: this body has no Head bone");
    return () => {};
  }
  p.root.updateMatrixWorld(true);
  const at = head.getWorldPosition(new THREE.Vector3());
  const size = top - at.y;
  // the skin at the mouth's height, looked for from the front
  const ray = new THREE.Raycaster(
    new THREE.Vector3(at.x, at.y + size * up, at.z + 2),
    new THREE.Vector3(0, 0, -1),
  );
  const hit = ray.intersectObject(p.root, true)[0];
  if (size <= 0 || !hit) {
    console.warn("no mouth: no face was found in front of the head bone");
    return () => {};
  }
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  mouth.position.copy(hit.point).setZ(hit.point.z + PROUD);
  mouth.visible = false;
  head.attach(mouth); // it stays where it is, and from now on moves with the head
  const unit = mouth.scale.clone(); // (a metre, in the head bone's own units)
  return (open) => {
    const k = Math.max(0, Math.min(1, open));
    mouth.visible = k > SHUT;
    // wide and flat when barely open, rounder as it opens
    mouth.scale.set(
      unit.x * size * wide * (1 - 0.3 * k),
      unit.y * size * tall * k,
      unit.z,
    );
  };
}

/** The check: `node src/mouth.ts`. Syllables must open and shut it, and silence must shut it. */
function check(): void {
  const hear = createOpening();
  const dt = 1 / 60;
  const seen: number[] = [];
  // two seconds of "ba ba ba": a vowel at -14 dB and a consonant at -32 dB, five a second
  for (let i = 0; i < 120; i++)
    seen.push(hear(Math.floor(i / 6) % 2 ? -32 : -14, dt));
  const late = seen.slice(60);
  const fail = (what: string) => {
    throw new Error(`mouth check: ${what}`);
  };
  if (Math.max(...late) < 0.7) fail("a vowel does not open it");
  if (Math.min(...late) > 0.2) fail("a consonant does not shut it");
  let after = 1;
  for (let i = 0; i < 18; i++) after = hear(null, dt); // 0.3 s of silence
  if (after > 0.05) fail("silence does not shut it");
  console.info("mouth check: ok");
}
if (typeof process !== "undefined" && process.argv[1]?.endsWith("mouth.ts"))
  check();
