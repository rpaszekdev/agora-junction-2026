import type { MxClip } from "./mixamo";

/**
 * Her gestures, chosen for what she says: the first sentence of each reply goes to Gemini's Decisions API
 * (gemini-decision-1, through POST /api/gesture: ../vite.config.ts), which says which of these options fits and how
 * surely. About 0.2 s a call; most sentences get none. The voice itself knows nothing of this.
 * Tried and dropped: a `gesture` tool for the voice (NON_BLOCKING with a SILENT answer: gemini-3.8-live ended its
 * turn at the call and said nothing).
 */

export const NONE = "none";
/** What the model is asked about a sentence. */
export const QUESTION =
  "A shopping guide is saying this sentence aloud. Which body gesture goes with it?";
/**
 * The options, and when each fits (this is what the model reads). One option a meaning: two that mean the same
 * would share its probability, and neither would be sure enough.
 */
export const CRITERIA = {
  [NONE]:
    "no gesture fits: a plain statement, a detail, a price, most sentences",
  wave: "saying hello or goodbye",
  nod: "saying yes, agreeing, confirming",
  no: "saying no, or that nothing was found",
  acknowledge: "got it, understood, will do",
  shrug: "not sure, it could go either way",
  point: "pointing something out: this one, look here",
  count: "listing several things one after another",
  dismiss: "never mind, not worth it, forget that",
  thanks: "thanking, or you are welcome",
  laugh: "laughing at something funny",
  happy: "good news, a great find, excitement",
  ask: "asking the user a question",
  think: "hmm, weighing it up, let me think",
} as const;
type Option = Exclude<keyof typeof CRITERIA, typeof NONE>;

/** Each option's clips (./mixamo.ts): one of them, at random. */
const CLIPS = {
  wave: ["wave", "greet"],
  nod: ["nod-yes"],
  no: ["shake-no"],
  acknowledge: ["acknowledge"],
  shrug: ["shrug"],
  point: ["point"],
  count: ["count"],
  dismiss: ["dismiss"],
  thanks: ["thankful"],
  laugh: ["laugh"],
  happy: ["happy-hands"],
  ask: ["ask-one-hand", "ask-two-hands"],
  think: ["thinking"],
} as const satisfies Record<Option, readonly MxClip[]>;
const isOption = (name: string): name is Option => Object.hasOwn(CLIPS, name);

/** Less sure than this (the chosen option's probability), and she keeps still. */
const SURE = 0.5;
/** The route takes no more of a sentence than this. */
export const MAX_SENTENCE = 300;
/** A reply's first sentence, once its end has come... */
const FIRST = /^(.{2,}?[.!?…])(?:\s|$)/s;
/** ...or this much of it, when no end comes. */
const LONG = 90;
/** A choice that has not come by then is given up (ms): late, the gesture would go with other words. */
const TIMEOUT_MS = 1500;

/** The clip for a sentence, or null: none fits, the model is not sure, or the route failed (she keeps still). */
export async function pickGesture(sentence: string): Promise<MxClip | null> {
  try {
    const r = await fetch("/api/gesture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sentence.slice(0, MAX_SENTENCE) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const { name, p, error } = (await r.json()) as {
      name?: string;
      p?: number;
      error?: string;
    };
    if (!r.ok) throw new Error(error ?? `the gesture route said ${r.status}`);
    if (!name || !isOption(name) || (p ?? 0) < SURE) return null;
    const clips = CLIPS[name];
    return clips[Math.floor(Math.random() * clips.length)] ?? null;
  } catch (e) {
    console.error("[gesture]", e);
    return null;
  }
}

/**
 * Follows what is said (./live.ts `onWords`) and has `play` called with a clip for each of her replies that
 * deserves one.
 * ponytail: one gesture a reply (its first sentence), which keeps a free key's requests low; ask for each sentence
 * if a long reply should move more. A reply is new when her words no longer go on from what she had said.
 */
export function watchReplies(
  play: (clip: MxClip) => void,
): (who: "you" | "guide", text: string) => void {
  let said = ""; // her words so far this reply
  let turn = 0; // counts her replies and the user's turns: a choice made for an older one is dropped
  let asked = false; // this reply's gesture has been asked for
  return (who, text) => {
    const hers = who === "guide";
    if (!hers || !text.startsWith(said)) {
      asked = false;
      turn += 1;
    }
    said = hers ? text : "";
    if (!hers || asked) return;
    const first =
      FIRST.exec(text)?.[1] ?? (text.length >= LONG ? text : undefined);
    if (!first) return;
    asked = true;
    const mine = turn;
    void pickGesture(first).then((clip) => {
      if (clip && mine === turn) play(clip);
    });
  };
}
