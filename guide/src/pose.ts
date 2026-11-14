import * as THREE from 'three';
import type { GestureFrame } from './character/gestures';
import type { Person } from './character/person';

/**
 * Posing on top of a clip: the talking hands (./character/gestures.ts) and the "here are your picks" arm.
 * The bone helpers are the ones in albertmajor/apartment-ps1 (src/retro/characters/friend.ts), on a Person.
 * Directions are in his own frame: x his left, y up, z ahead.
 */

const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const mq = new THREE.Quaternion();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const tmp = new THREE.Vector3();

/** Point a hand along a direction, by `k` (it has no bone beyond it: at rest it carries on from the forearm). */
function aimHand(p: Person, name: string, dir: THREE.Vector3, k: number): void {
  const b = p.bones[name];
  if (!b || !b.parent || k <= 0 || dir.lengthSq() === 0) return;
  b.parent.updateWorldMatrix(true, false);
  p.model.getWorldQuaternion(mq);
  v1.copy(dir).normalize().applyQuaternion(mq);
  b.parent.getWorldQuaternion(q2);
  v1.applyQuaternion(q2.invert());
  v2.copy(b.position).normalize();
  q.setFromUnitVectors(v2, v1).multiply(b.quaternion);
  b.quaternion.slerp(q, Math.min(1, k));
}

/** Roll a bone about its own length (the forearm: palm up or down). */
function roll(p: Person, name: string, child: string, angle: number): void {
  const b = p.bones[name];
  const c = p.bones[child];
  if (b && c && angle !== 0) b.quaternion.multiply(q.setFromAxisAngle(v1.copy(c.position).normalize(), angle));
}

/** The hands explaining: `g` 0..1 is how much he is talking with them. */
export function applyGesture(p: Person, f: GestureFrame, g: number): void {
  if (g <= 0.001) return;
  p.add('Spine2', f.lean * g, f.twist * g, f.roll * g);
  for (const [n, s] of [[0, 1], [1, -1]] as const) {
    const side = s > 0 ? 'Left' : 'Right';
    const a = f.arms[n]!;
    const k = g * a.act;
    if (k <= 0.001) continue;
    p.aim(`${side}Arm`, `${side}ForeArm`, tmp.set(a.up[0], a.up[1], a.up[2]), k);
    p.aim(`${side}ForeArm`, `${side}Hand`, tmp.set(a.fore[0], a.fore[1], a.fore[2]), k);
    roll(p, `${side}ForeArm`, `${side}Hand`, -s * a.twist * k);
    aimHand(p, `${side}Hand`, tmp.set(a.hand[0], a.hand[1], a.hand[2]), k);
  }
}

/** His right hand held out, palm up, for the picks to sit on: `k` 0..1. */
export function applyPresent(p: Person, k: number): void {
  if (k <= 0.001) return;
  p.aim('RightArm', 'RightForeArm', tmp.set(-0.45, -0.75, 0.5), k);
  p.aim('RightForeArm', 'RightHand', tmp.set(-0.35, 0.25, 1), k);
  roll(p, 'RightForeArm', 'RightHand', 1.4 * k);
  p.add('Spine2', 0, -0.12 * k, 0);
}

/** His head: turned to the viewer, nodding with the voice, moved by the gesture. `open` 0..1: how loud he is now. */
export function applyHead(p: Person, f: GestureFrame | null, g: number, open: number, t: number): void {
  const sway = Math.sin(t * 0.7) * 0.03;
  const pitch = open * 0.06 + (f ? f.pitch * g : 0);
  const yaw = sway + (f ? f.yaw * g : 0);
  const tilt = f ? f.tilt * g : 0;
  p.add('Neck', pitch * 0.4, yaw * 0.4, tilt * 0.4);
  p.add('Head', pitch * 0.6, yaw * 0.6, tilt * 0.6);
}

/** Where a bone is on screen (CSS pixels), or null when it is behind the camera. */
export function onScreen(p: Person, bone: string, camera: THREE.Camera, w: number, h: number): { x: number; y: number } | null {
  const b = p.bones[bone];
  if (!b) return null;
  b.updateWorldMatrix(true, false);
  v1.setFromMatrixPosition(b.matrixWorld).project(camera);
  if (v1.z > 1) return null;
  return { x: (v1.x * 0.5 + 0.5) * w, y: (-v1.y * 0.5 + 0.5) * h };
}
