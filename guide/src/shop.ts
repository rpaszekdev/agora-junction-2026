import { Type, type FunctionDeclaration } from "@google/genai";
import type { Tool } from "./live";
import {
  runSearch,
  type Found,
  type Offer,
  type Progress,
  type SearchEvent,
  type Source,
} from "./search";

/**
 * The switchboard between the voice (Gemini Live: ears and mouth) and the brain (DeepSeek, ../../wall.py /brain).
 * The voice has one tool, ask_agora: it hands over the user's sentence and gets back, within a second, what to say.
 * The page does the rest itself: it runs the search, holds up the picks and tells the voice what happened in short
 * [AGORA] notes. So a search never hangs on a half-minute tool call, and a tool call the voice forgot is caught here.
 */

const MAX_REQUEST = 300; // the wall refuses longer
// ponytail: the brain gets the last 60 lines of the talk (about 30 exchanges), not a summary; summarise the older part if a talk outgrows it
const MAX_TURNS = 60;
const MAX_TURN_CHARS = 1000; // the wall cuts a line there anyway
const MAX_PICKS = 3;
const BRAIN_TIMEOUT_MS = 12_000;
/** One "still looking" line, this long into a search (ms). */
const MID_MS = 9000;
const LAST_KEY = "agora-last-search";
const NOTE = "[AGORA]";

export type { Offer };
export interface Pick {
  offer: Offer;
  why: string;
}

export interface ShopHooks {
  onStatus(text: string): void;
  /** He is reading the sites (his body rummages), or has stopped. */
  onSearching(on: boolean): void;
  onPicks(picks: Pick[]): void;
  /** What the search is doing: the wall's own events as they come (./search.ts), and { type: "start" } when one begins. */
  onEvent(ev: SearchEvent): void;
  /** A session is open and nobody is speaking: a note would not cut in. */
  voiceFree(): boolean;
  /** Hand the voice a note to say aloud. */
  note(text: string): void;
}

export interface ShopOptions {
  /** Where a search runs (./search.ts). 'mock': canned, no site is read; the brain is still the real one. */
  from: Source;
  /** Searches start at least this far apart (ms): one search is the key's whole minute of reads. */
  cooldownMs: number;
}

export const INSTRUCTION = `You are the voice of Agora's shopping guide: a friendly, quick-witted helper standing in front of the user.
Agora reads European second-hand and shop sites live. You know no offers and no prices yourself: Agora's brain does.
Whenever the user says anything about a product, an offer, a price, a site, a budget, or asks you to look, find, compare or choose: call ask_agora at once with their sentence, word for word, before you say anything. It answers within a second.
Then say the "say" text of its answer aloud, naturally, in the user's language, and nothing more. If the answer has "wait_seconds", add that the sites can be read again in that many seconds and that you start then.
Messages that begin with ${NOTE} come from Agora itself, not from the user: they report what the search is doing. Say what they tell you to say, in one or two short sentences, in the user's language. Never call ask_agora because of such a message.
Never invent an offer, a price or a site. Greetings and small talk you answer yourself, in one short sentence.`;

export const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "ask_agora",
    description:
      "Agora's brain. It starts searches, knows every offer that is loaded and decides what to tell the user. Returns within a second: { say: what to tell the user }.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        request: {
          type: Type.STRING,
          description: "The user's last sentence, word for word.",
        },
      },
      required: ["request"],
    },
  },
];

interface Turn {
  role: "user" | "assistant";
  content: string;
}
interface Move {
  action: "search" | "answer" | "ask";
  request: string;
  say: string;
  show: { id: string; why: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
/** What the brain needs of an offer (the wall keeps only these fields anyway). */
const brief = ({
  id,
  title,
  price,
  eur,
  currency,
  kind,
  site,
  country,
  delivery,
  location,
}: Offer) => ({
  id,
  title,
  price,
  eur,
  currency,
  kind,
  site,
  country,
  delivery,
  location,
});

function toMove(raw: unknown): Move {
  const x = (raw ?? {}) as Partial<Move>;
  if (x.action !== "search" && x.action !== "answer" && x.action !== "ask")
    throw new Error("the brain sent no action");
  const show = (Array.isArray(x.show) ? x.show : [])
    .filter((s) => typeof s?.id === "string")
    .map((s) => ({ id: s.id, why: String(s.why ?? "") }));
  return {
    action: x.action,
    request: String(x.request ?? ""),
    say: String(x.say ?? ""),
    show,
  };
}

function storedStart(): number {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0;
  } catch {
    return 0; // storage is off: the wait lasts for this page only
  }
}

export function createShop(hooks: ShopHooks, o: ShopOptions) {
  let offers: Offer[] = [];
  let turns: Turn[] = [];
  let searchId = 0; // each search has a number: whatever an older one still reports is dropped
  let running: { id: number; request: string; abort: AbortController } | null =
    null;
  const mock = o.from === "mock";
  let lastStart = mock ? 0 : storedStart(); // a reload does not reset the key's minute
  // notes waiting for a quiet moment: the newest status replaces the older one, a result replaces both
  let status: string | null = null;
  let result: string | null = null;

  const remember = (...added: Turn[]) =>
    (turns = [...turns, ...added.filter((t) => t.content)].slice(-MAX_TURNS));
  const toPicks = (show: Move["show"]): Pick[] =>
    show
      .map((s) => ({
        offer: offers.find((f) => f.id === s.id),
        why: s.why.slice(0, 60),
      }))
      .filter((p): p is Pick => !!p.offer)
      .slice(0, MAX_PICKS);

  /** Ask the brain: about what the user said, or (found) about the search that just ended. Null when it is down. */
  async function decide(q: string, found: boolean): Promise<Move | null> {
    try {
      const r = await fetch("/brain", {
        method: "POST",
        body: JSON.stringify({
          q: q.slice(0, MAX_REQUEST),
          messages: turns,
          offers: offers.map(brief),
          busy: !found && !!running,
          ...(found ? { event: "found" } : {}),
        }),
        signal: AbortSignal.timeout(BRAIN_TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`the brain answered ${r.status}`);
      return toMove(await r.json());
    } catch (e) {
      console.error("[brain]", e);
      return null;
    }
  }

  /** Tell the user what a finished search found: the brain's three picks, or the cheapest three when it is down. */
  async function present(
    id: number,
    request: string,
    found: Found,
  ): Promise<void> {
    const n = found.offers.length;
    if (!n) {
      hooks.onStatus(
        found.limited
          ? "THE SITES REFUSED: TOO MANY READS THIS MINUTE"
          : "NOTHING FOUND",
      );
      result = found.limited
        ? `${NOTE} The search for "${request}" could not read the sites: too many reads this minute. Tell the user, and to ask again in a minute.`
        : `${NOTE} The search for "${request}" found nothing. Tell the user and suggest other words.`;
      return;
    }
    const m = await decide(request, true);
    if (id !== searchId) return;
    const picks = m
      ? toPicks(m.show)
      : [...found.offers]
          .sort((a, b) => (a.eur ?? a.price) - (b.eur ?? b.price))
          .slice(0, MAX_PICKS)
          .map((offer) => ({ offer, why: "cheapest" }));
    const say =
      m?.say ||
      `I found ${n} offers. The cheapest: ${picks.map((p) => `${p.offer.title.slice(0, 40)} for ${Math.round(p.offer.price)} ${p.offer.currency} on ${p.offer.site}`).join("; ")}.`;
    hooks.onPicks(picks);
    hooks.onStatus(`${n} OFFERS FOUND`);
    result = `${NOTE} The search for "${request}" finished with ${n} offers. Tell the user this, in their language: ${say}`;
  }

  async function run(
    id: number,
    request: string,
    waitMs: number,
    signal: AbortSignal,
    ask: boolean,
  ): Promise<void> {
    const mine = () => id === searchId;
    try {
      for (
        const until = Date.now() + waitMs;
        Date.now() < until;
        await sleep(500)
      ) {
        if (!mine()) return;
        hooks.onStatus(
          `THE SITES CAN BE READ AGAIN IN ${Math.ceil((until - Date.now()) / 1000)} S`,
        );
      }
      if (!mine()) return;
      lastStart = Date.now();
      if (!mock) {
        try {
          localStorage.setItem(LAST_KEY, String(lastStart));
        } catch {
          /* storage is off: the wait lasts for this page only */
        }
      }
      hooks.onSearching(true);
      hooks.onEvent({ type: "start", request });
      const label = request.toUpperCase().slice(0, 40);
      hooks.onStatus(`READING THE SITES FOR "${label}"`);
      let p: Progress = { sites: 0, read: 0, offers: 0 };
      const mid = setTimeout(() => {
        if (mine())
          status = `${NOTE} Still searching for "${request}": ${p.read} of ${p.sites} sites have answered, ${p.offers} offers so far. Tell the user in one short line that you are still looking.`;
      }, MID_MS);
      let found: Found;
      try {
        found = await runSearch(
          request,
          o.from,
          signal,
          (now) => {
            if (!mine()) return;
            p = now;
            hooks.onStatus(
              `READING THE SITES FOR "${label}" · ${p.read}/${p.sites} SITES · ${p.offers} OFFERS`,
            );
          },
          (ev) => {
            if (mine()) hooks.onEvent(ev);
          },
          ask,
        );
      } finally {
        clearTimeout(mid);
      }
      if (!mine()) return;
      status = null;
      offers = found.offers;
      await present(id, request, found);
    } catch (e) {
      if (!mine()) return; // replaced by a newer search
      console.error("[search]", e);
      hooks.onStatus(
        `THE SEARCH FAILED: ${e instanceof Error ? e.message : String(e)}`.slice(
          0,
          120,
        ),
      );
      status = null;
      result = `${NOTE} The search for "${request}" failed. Tell the user it did not work, and to ask again.`;
    } finally {
      if (mine()) {
        running = null;
        hooks.onSearching(false);
      }
    }
  }

  /**
   * Begin a search (the one running is dropped). Returns the seconds until the sites may be read again (0: now).
   * `begun`: the wall's page has begun it itself (typed into its bar), so there is no wait and it is not asked for.
   */
  function startSearch(request: string, begun = false): number {
    running?.abort.abort();
    searchId += 1;
    const abort = new AbortController();
    const waitMs = begun
      ? 0
      : Math.max(0, lastStart + o.cooldownMs - Date.now());
    running = { id: searchId, request, abort };
    status = null;
    result = null;
    hooks.onSearching(false);
    hooks.onPicks([]);
    void run(searchId, request, waitMs, abort.signal, !begun);
    return Math.ceil(waitMs / 1000);
  }

  /** The user's sentence, through the brain. `quiet`: nobody asked (the voice forgot its tool), so only a search counts. */
  async function turn(
    q: string,
    quiet: boolean,
  ): Promise<Record<string, unknown>> {
    const m = await decide(q, false);
    if (!m) {
      // ponytail: the brain is down. With nothing loaded the sentence is most likely a request: search for it as it is
      if (quiet || offers.length || running)
        return {
          say: "Sorry, I lost my thread for a moment. Could you say that again?",
        };
      const wait = startSearch(q.slice(0, MAX_REQUEST));
      return { say: "Let me look.", ...(wait ? { wait_seconds: wait } : {}) };
    }
    if (quiet && m.action !== "search") return {};
    if (m.action === "search" && running && same(running.request, m.request))
      return quiet ? {} : { say: m.say };
    if (m.action === "search") {
      const wait = startSearch(m.request);
      return { say: m.say, ...(wait ? { wait_seconds: wait } : {}) };
    }
    if (m.show.length) hooks.onPicks(toPicks(m.show));
    return { say: m.say };
  }

  const tools: Record<string, Tool> = {
    async ask_agora(args) {
      const q = String(args["request"] ?? "").trim();
      if (!q) return { say: "I did not catch that. What are you looking for?" };
      if (q.startsWith(NOTE))
        return {
          error:
            "That was a note from Agora, not the user. Just say what it asks.",
        };
      return turn(q, false);
    },
  };

  return {
    tools,
    /** A turn of the talk ended: keep what was really said (the voice's transcripts and what was typed), in order.
     * This is all the brain knows of the conversation: small talk, the user's own words, what she answered aloud. */
    said(lines: Turn[]): void {
      remember(
        ...lines
          .map((l) => ({
            role: l.role,
            content: l.content.trim().slice(0, MAX_TURN_CHARS),
          }))
          .filter((l) => !l.content.startsWith(NOTE)),
      );
    },
    /** The user said `text` and the voice called no tool for it: run it past the brain here; only a search counts. */
    async heard(text: string): Promise<void> {
      const q = text.trim();
      if (q && !q.startsWith(NOTE)) await turn(q, true);
    },
    /** The wall's page began a search of its own: follow it, so she knows its offers and picks from them. */
    follow(request: string): void {
      const q = request.trim().slice(0, MAX_REQUEST);
      if (!q) return;
      remember({ role: "user", content: q }); // typed, into the wall's bar: the brain answers in its language
      startSearch(q, true);
    },
    /** Each frame: hand over the waiting note once nobody is speaking. The result is kept until it can be said. */
    tick(): void {
      const next = result ?? status;
      if (!next || !hooks.voiceFree()) return;
      if (result) result = null;
      status = null;
      hooks.note(next);
    },
  };
}
