import * as THREE from "three";
import { createBoard } from "./board";
import { createCartoon, isCartoon, type Act } from "./cartoon";
import { createGestures, type GestureFrame } from "./character/gestures";
import { extra, loadAnim, type Person } from "./character/person";
import { watchReplies } from "./gesture";
import { connectLive, type Live } from "./live";
import { MICHELLE, michelle, type MxClip } from "./mixamo";
import { createMouth, createOpening } from "./mouth";
import { applyGesture, applyHead, applyPresent } from "./pose";
import { onPage, toPage } from "./search";
import { createShop, DECLARATIONS, INSTRUCTION, type Pick } from "./shop";

/** One search is the key's whole minute of reads (10 a minute): the next one waits this long after the last began (ms). */
const COOLDOWN_MS = 62_000;

/**
 * The guide: a character standing on the right of the Agora page, talking through Gemini Live. On the left
 * (./board.ts) the search shows as it happens: what she understood, each site as it is read, the offers and their
 * photos. She holds her hand out to them once she has chosen.
 *   ?who=michelle   Mixamo's Michelle (./mixamo.ts), moved by Mixamo's clips: the voice picks her gestures
 *                   (./gesture.ts). The default where her files are (they are not in the repo: see ./mixamo.ts)
 *   ?who=retro-m3   Albert's character (albertmajor/apartment-ps1), or another body of public/models/npc/cast.json:
 *                   his hands follow his own voice (./character/gestures.ts). The default without Michelle's files
 *   ?mock           a canned search (no site is read; the brain is real): for trying the voice and the hand
 *   ?cool=20        with ?mock: searches at least 20 s apart, to try the wait
 *   ?nomic          no microphone: type to talk
 *   ?embed          she is a frame inside the wall's own page (../../wall.html puts her there): the wall runs the
 *                   search and shows it, so here is no board, only she. Her picks go to the wall (./search.ts)
 */

const params = new URLSearchParams(location.search);
/** Michelle's files are on this machine (../vite.config.ts looks: Mixamo's terms keep them out of the repo). */
declare const __HAS_MICHELLE__: boolean;
const WHO = params.get("who") ?? (__HAS_MICHELLE__ ? MICHELLE : "retro-m3");
const EMBED = params.has("embed");
/** The character's share of the window's width: she stands on the right, the search is on the left (index.html). */
const STAGE = EMBED ? 1 : 0.4;
const MOCK = params.has("mock") && !EMBED; // (inside the wall's page the search is the wall's: a real one)
const TALK = EMBED ? "TALK" : "TALK TO THE GUIDE";
const WITH_MIC = !params.has("nomic");
/** Michelle: her clips are her gestures, and the voice chooses them (no hands made from its loudness). */
const MX = WHO === MICHELLE;
type Mood = "idle" | "talking" | "searching";
const MX_MOOD = {
  idle: "idle-breathing",
  talking: "talk",
  searching: "thinking",
} as const satisfies Record<Mood, MxClip>;
/** Michelle's mouth (./mouth.ts): her head is measured with her hair buns on, so it is lower and smaller in shares. */
const MX_MOUTH = { up: 0.07, wide: 0.19, tall: 0.06, color: 0x1a0705 };
/** Clips per mood: Michelle's (./mixamo.ts), or the baked ones (public/models/anims/). */
const CLIP: Record<Mood, string> = MX
  ? MX_MOOD
  : { idle: "idle", talking: "idle-talking", searching: "idle-phone" };
/** A gesture's cross-fade in, and back out to the mood's clip before its own end (s). */
const GESTURE_FADE = 0.3;
/** A gesture whose clip is a loop (her wave is one swing of the hand) is held this long (s). */
const GESTURE_LOOP = 2.2;
/** Michelle is taken to be talking for this long after her voice was last heard (ms): the gaps between words. */
const TALK_HOLD_MS = 700;

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const statusEl = el<HTMLDivElement>("status");
const wordsEl = el<HTMLDivElement>("words");
const talkBtn = el<HTMLButtonElement>("talk");
const textIn = el<HTMLInputElement>("text");
const setStatus = (t: string) => (statusEl.textContent = t);
document.body.classList.toggle("embed", EMBED);
talkBtn.textContent = TALK;

// ---------------------------------------------------------------- the scene
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c9a8, 2.2));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
sun.position.set(2, 4, 5);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 1.32, 3.1);
camera.lookAt(0, 1.12, 0);
const resize = () => {
  const w = Math.round(innerWidth * STAGE);
  renderer.setSize(w, innerHeight);
  camera.aspect = w / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------- state
let live: Live | null = null;
let searching = false;
let picksN = 0; // how many of the offers on the left she has chosen
let mood: Mood = "idle";
let talkK = 0; // how much he is talking with his hands (0..1)
let presentK = 0; // how far his hand is held out (0..1)
let open = 0; // his voice's loudness, eased (0..1)
let energy = 0;
let helloUntil = 0; // he waves until then (ms): the session just opened
let body: Person | null = null; // the character, once loaded
let acting = 0; // a gesture for what she says plays until then (ms; 0: none)
let spokeAt = -Infinity; // when her voice was last heard (ms)

/** A gesture for what she is saying (./gesture.ts): its clip once, then (in the frame loop) back to the mood's. */
function act(name: MxClip): void {
  const p = body;
  if (!p || acting) return; // (one at a time: a second would cut the first short, or stretch its hold)
  acting = performance.now() + 1000; // (until the clip says how long it is)
  p.play(name, { fade: GESTURE_FADE })
    .then((a) => {
      if (!a) return; // (a later call for the same gesture took over)
      const once = a.loop === THREE.LoopOnce;
      const hold = once
        ? Math.max(GESTURE_FADE, a.getClip().duration - GESTURE_FADE)
        : GESTURE_LOOP;
      acting = performance.now() + hold * 1000;
    })
    .catch((e: unknown) => {
      console.error(e);
      acting = performance.now(); // the frame loop puts her back on the mood's clip
    });
}

const board = EMBED ? null : createBoard(el("board"), { photos: !MOCK });
function showPicks(list: Pick[]): void {
  picksN = list.length;
  if (board) board.picks(list);
  else
    toPage({
      agora: "picks",
      picks: list.map((p) => ({ id: p.offer.id, why: p.why })),
    });
}

const watch = watchReplies((clip) => {
  if (live) act(clip); // (not after the session was stopped)
});

const shop = createShop(
  {
    onStatus: setStatus,
    onSearching: (on) => (searching = on),
    onPicks: showPicks,
    onEvent: (ev) => board?.event(ev),
    voiceFree: () => !!live && !live.busy(),
    note: (text) => live?.note(text),
  },
  {
    from: EMBED ? "page" : MOCK ? "mock" : "wall",
    cooldownMs: MOCK
      ? Math.max(0, Number(params.get("cool")) || 0) * 1000
      : COOLDOWN_MS,
  },
);

if (EMBED) {
  onPage((m) => {
    const q = m["q"];
    // a search typed into the wall's own bar: she follows it, so she knows what is on the wall
    if (m.agora === "start" && !m["asked"] && typeof q === "string")
      shop.follow(q);
    else if (m.agora === "theme")
      document.documentElement.classList.toggle("dark", m["dark"] === true);
  });
  toPage({ agora: "ready" });
}

/** Open the session (`withMic` false: typing only, no microphone asked for), or close the one that is open. */
async function start(withMic: boolean, toggle = true): Promise<void> {
  if (live && !toggle) return;
  if (live) {
    live.close();
    live = null;
    talkBtn.setAttribute("aria-pressed", "false");
    talkBtn.textContent = TALK;
    setStatus("STOPPED");
    return;
  }
  talkBtn.disabled = true;
  try {
    live = await connectLive(
      {
        instruction: INSTRUCTION,
        declarations: DECLARATIONS,
        tools: shop.tools,
        onMissed: (text) => void shop.heard(text),
        onTurn: (lines) => shop.said(lines),
        onWords(who, text) {
          wordsEl.className = who;
          wordsEl.textContent = text;
          if (MX) watch(who, text);
        },
        onStatus: setStatus,
        onClose(reason) {
          live = null;
          talkBtn.setAttribute("aria-pressed", "false");
          talkBtn.textContent = TALK;
          setStatus(`ENDED: ${reason}`.slice(0, 120));
        },
      },
      withMic,
    );
    talkBtn.setAttribute("aria-pressed", "true");
    talkBtn.textContent = "STOP";
    helloUntil = performance.now() + 1600;
  } catch (e) {
    console.error(e);
    setStatus(
      `COULD NOT START: ${e instanceof Error ? e.message : String(e)}`.slice(
        0,
        160,
      ),
    );
  } finally {
    talkBtn.disabled = false;
  }
}
talkBtn.addEventListener("click", () => void start(WITH_MIC));
el<HTMLFormElement>("bar").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const t = textIn.value.trim();
  if (!t) return;
  textIn.value = "";
  wordsEl.className = "you";
  wordsEl.textContent = t;
  // typing needs no microphone: with no session open, one is opened without it
  void start(false, false).then(() => live?.say(t));
});

// ---------------------------------------------------------------- the character, each frame
async function main(): Promise<void> {
  const p = MX ? await michelle() : await extra(WHO);
  if (!MX) await Promise.all(Object.values(CLIP).map((c) => loadAnim(c)));
  body = p;
  scene.add(p.root);
  await p.play(CLIP.idle, { fade: 0 });
  // frame whoever it is (Dennis is 1.75 m, the chibi 1.2 m with a big head): the same share of the window
  p.reset(0);
  p.root.updateMatrixWorld(true);
  let height = 0; // the rest pose's top (a skinned mesh's own box: cm, in the model's frame)
  p.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.geometry.computeBoundingBox();
    height = Math.max(
      height,
      (m.geometry.boundingBox?.max.y ?? 0) * p.model.scale.y,
    );
  });
  height ||= 1.75;
  // the whole of him, his feet above the bar
  camera.position.set(0, height * 0.5, height * 2.6);
  camera.lookAt(0, height * 0.44, 0);
  const hands = createGestures();
  // a short-armed body gets its own hands (./cartoon.ts) and keeps to the idle clip: a person's would sink into it
  const cartoon = isCartoon(p, height) ? createCartoon() : null;
  const mouth = createMouth(p, height, MX ? MX_MOUTH : {});
  const opening = createOpening();
  let mouthTry: number | null = null; // set by hand (window.guide.mouth): the voice is not asked
  setStatus(MOCK ? "READY (MOCK SEARCH)" : "READY");
  (window as unknown as { guide: unknown }).guide = {
    person: p,
    showPicks,
    get mood() {
      return mood;
    },
    cartoon: !!cartoon,
    heard: shop.heard,
    act,
    /** Hold the mouth this far open (0..1) to look at it; null gives it back to the voice. */
    mouth: (k: number | null) => (mouthTry = k),
    set searching(v: boolean) {
      searching = v;
    },
  };

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const level = live?.level() ?? null;
    const speaking = level !== null && level > -50;
    if (speaking) spokeAt = now;
    // her talk clip is her arms: a breath between words must not send her to idle and start the clip over
    const talking = MX ? now - spokeAt < TALK_HOLD_MS : speaking;
    const want: Mood = searching ? "searching" : talking ? "talking" : "idle";
    const acted = acting > 0 && now >= acting; // her gesture is over: back to the mood's clip
    if (acted) acting = 0;
    if (want !== mood || acted) {
      mood = want;
      if (!cartoon && !acting) void p.play(CLIP[mood], { fade: 0.35 });
    }
    const target =
      level === null ? 0 : Math.max(0, Math.min(1, (level + 40) / 24));
    open += (target - open) * Math.min(1, dt * (target > open ? 30 : 14));
    energy += (target - energy) * Math.min(1, dt * 1.5);
    talkK +=
      ((speaking && !searching ? 1 : 0) - talkK) *
      Math.min(1, dt * (speaking ? 2.5 : 1.2));
    presentK +=
      ((picksN && !searching ? 1 : 0) - presentK) * Math.min(1, dt * 3);

    p.reset(dt);
    if (cartoon) {
      const act: Act = searching
        ? "searching"
        : now < helloUntil
          ? "hello"
          : speaking
            ? "talking"
            : picksN
              ? "presenting"
              : "idle";
      cartoon.apply(p, dt, act, level, open, picksN > 0);
      applyHead(p, null, 0, open, now / 1000);
    } else if (MX) {
      // her clips are her gestures: only the hand held out and the head go on top
      applyPresent(p, presentK);
      applyHead(p, null, 0, open, now / 1000);
    } else {
      const frame: GestureFrame = hands.update(dt, level, false, energy);
      applyGesture(p, frame, talkK * (1 - 0.6 * presentK));
      applyPresent(p, presentK);
      applyHead(p, frame, talkK, open, now / 1000);
    }
    const heard = opening(level, dt); // (every frame: it keeps its own measure of how loud she is)
    mouth(mouthTry ?? heard);
    p.root.updateMatrixWorld(true);
    shop.tick();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

main().catch((e: unknown) => {
  console.error(e);
  setStatus(
    `ERROR: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160),
  );
});
