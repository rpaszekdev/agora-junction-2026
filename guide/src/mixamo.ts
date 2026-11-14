import type * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { assetUrl } from "./character/assets";
import { Person } from "./character/person";

/**
 * Michelle (Mixamo), on her own skeleton, moved by Mixamo's clips as they are: they were exported for her, so
 * nothing is retargeted and her fingers move too. The files (public/models/mixamo/) are Mixamo's own, which may not
 * be passed on: they are kept out of the repository (../../.gitignore).
 *   michelle.fbx          the character, T-posed, with skin
 *   anims/<clip>.fbx      one clip each, without skin, 30 fps
 */
export const MICHELLE = "michelle";
const DIR = "models/mixamo/";
/** Mixamo's files are in centimetres. */
const SCALE = 0.01;

/** Her clips: whether each loops (the others play once). */
export const MX_CLIPS = {
  "idle-breathing": true,
  "idle-weight-shift": true,
  talk: true,
  thinking: true,
  "ask-one-hand": false,
  "ask-two-hands": false,
  "nod-yes": false,
  "shake-no": false,
  acknowledge: false,
  wave: true, // (half a second: one swing of the raised hand)
  greet: false,
  thankful: false,
  laugh: false,
  point: false,
  count: false,
  shrug: false,
  dismiss: false,
  "happy-hands": false,
} as const satisfies Record<string, boolean>;
export type MxClip = keyof typeof MX_CLIPS;

const loader = new FBXLoader();
const load = (path: string): Promise<THREE.Group> =>
  loader.loadAsync(assetUrl(DIR + path)).catch((e: unknown) => {
    console.error(e);
    throw new Error(
      `could not load ${DIR}${path} (Mixamo's files are not in the repository)`,
    );
  });

/** Michelle, as a Person: the poses in code (her head, the hand held out) go on top of her clips as on anyone's. */
export async function michelle(): Promise<Person> {
  const names = Object.keys(MX_CLIPS) as MxClip[];
  const [model, ...files] = await Promise.all([
    load("michelle.fbx"),
    ...names.map((n) => load(`anims/${n}.fbx`)),
  ]);
  model.scale.setScalar(SCALE);
  const p = new Person(model, []);
  names.forEach((n, i) => {
    const clip = files[i]?.animations[0];
    if (!clip) throw new Error(`no motion in ${DIR}anims/${n}.fbx`);
    p.addClip(n, clip, MX_CLIPS[n]);
  });
  return p;
}
