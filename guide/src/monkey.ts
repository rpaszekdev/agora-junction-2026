/**
 * Price Monkey (?who=monkey): a drawing in place of a 3D body. His clips are animated WebPs in public/, made from the
 * GIFs in ../../assets/ (1228×2048, 20 frames a second), all cut to the same band (the full width, y 386..1752: the
 * found clip reaches far to the left) and 600 px tall, so he stands on the same spot in every one.
 * Every clip starts and ends on the idle pose, so one can follow another without a jump.
 *   idle        breathing: also while he talks
 *   thinking    taps his chin with the banana: the search has begun, no site is being read yet
 *   searching   the banana as a telescope: sites are being read
 *   found       points the banana at the board: once, when his picks are marked
 * On top of the idle clip he bobs a little while his voice plays, and a dark oval opens on his drawn mouth with the
 * voice (the same 0..1 opening the 3D mouths get from ./mouth.ts). Styled in ../index.html (#monkey).
 */
export type MonkeyMood = "idle" | "talking" | "thinking" | "searching";
type Clip = "idle" | "thinking" | "searching" | "found";

const CLIPS: Record<Clip, string> = {
  idle: "/monkey-idle.webp",
  thinking: "/monkey-thinking.webp",
  searching: "/monkey-searching.webp",
  found: "/monkey-found-it.webp",
};
/** The found clip plays once and is this long (ms). */
const FOUND_MS = 2000;
/** His drawn mouth on the idle clip's first frame, in shares of the picture: centre, width (the line is 0.115; wider
 * covers its sway in the animation), the line's thickness. */
const MOUTH = { x: 0.534, y: 0.204, wide: 0.142, line: 0.018 };
/** How far the mouth opens at the loudest, in shares of the picture's height. */
const MOUTH_OPEN = 0.04;
/** Below this opening the oval is hidden: his head sways a few pixels in the animation, its own line stays exact. */
const MOUTH_SHOWN = 0.06;

export type Monkey = {
  /** Each frame: his mood, the mouth's opening 0..1, now in ms. */
  draw(mood: MonkeyMood, open: number, now: number): void;
  /** His picks are on the board: the found clip, once. */
  found(): void;
};

/** Puts him on the page. */
export function createMonkey(): Monkey {
  const box = document.createElement("div");
  box.id = "monkey";
  const img = new Image();
  img.alt = "Price Monkey, the guide";
  const mouth = document.createElement("div");
  mouth.className = "mouth";
  mouth.style.left = `${(MOUTH.x - MOUTH.wide / 2) * 100}%`;
  mouth.style.top = `${MOUTH.y * 100}%`;
  mouth.style.width = `${MOUTH.wide * 100}%`;
  box.append(img, mouth);
  document.body.prepend(box);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches; // then only the mouth moves

  const missing = new Set<Clip>(); // a clip whose file is not there: he stays on idle instead of a broken picture
  let shown: Clip | null = null;
  let plays = 0;
  let foundUntil = 0;
  const show = (clip: Clip): void => {
    if (clip === shown) return;
    shown = clip;
    // (a new address each time for the one-shot: the browser would go on from where the animation was)
    img.src = clip === "found" ? `${CLIPS.found}?n=${++plays}` : CLIPS[clip];
  };
  img.addEventListener("error", () => {
    if (!shown || shown === "idle") return;
    missing.add(shown);
    show("idle");
  });
  for (const src of Object.values(CLIPS)) new Image().src = src; // fetched ahead: no blank moment at the first swap
  show("idle");

  return {
    draw(mood, open, now) {
      const want: Clip =
        now < foundUntil
          ? "found"
          : mood === "thinking" || mood === "searching"
            ? mood
            : "idle";
      show(missing.has(want) ? "idle" : want);
      // the mouth's place is known on the idle clip only: in the others his head turns away from it
      const speaks = shown === "idle" && open > MOUTH_SHOWN;
      mouth.style.opacity = speaks ? "1" : "0";
      mouth.style.height = `${(MOUTH.line + MOUTH_OPEN * open) * 100}%`;
      if (still) return;
      const bob =
        speaks && mood === "talking"
          ? Math.abs(Math.sin((now / 1000) * 7)) * 3 * open
          : 0;
      box.style.transform = `translateY(${-bob}px)`;
    },
    found() {
      foundUntil = performance.now() + FOUND_MS;
    },
  };
}
