/**
 * One search on the wall (../../wall.py /search): the sites are read live and the events come back one JSON line each.
 * `?mock` swaps the network for a canned stream of the same events, so the page runs the same code either way.
 * `?embed`: this page is a frame inside the wall's own page (../../wall.html). The wall runs the search and shows it,
 * and passes each event on as a message: one search, seen by both (a second one would use up the minute's reads).
 */

/** Where a search's events come from: the wall's /search, the canned stream, or the wall's page around this one. */
export type Source = 'wall' | 'mock' | 'page';

/** The wall's address (../vite.config.ts): the only page whose messages are heard. */
declare const __WALL__: string;
/** A message to or from the wall's page: ready, search, picks go up; start, event, end, theme come down. */
export type PageMsg = { agora: string } & Record<string, unknown>;
export const toPage = (m: PageMsg): void => parent.postMessage(m, __WALL__);
/** Hear the wall's page, and nobody else. Returns how to stop. */
export function onPage(cb: (m: PageMsg) => void): () => void {
  const hear = (ev: MessageEvent) => {
    const m = ev.data as PageMsg | null;
    if (ev.source === parent && ev.origin === __WALL__ && typeof m?.agora === 'string') cb(m);
  };
  addEventListener('message', hear);
  return () => removeEventListener('message', hear);
}

export interface Offer {
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  site: string;
  country: string;
  eur?: number | null;
  image?: string;
  kind?: string;
  location?: string;
  delivery?: string;
}

export interface Progress {
  /** Sites being read, and how many of them have answered. */
  sites: number;
  read: number;
  offers: number;
}

/** One line of the wall's stream (../../wall.py search()): plan, find_start, find_done, read_start, read_done, offer,
 * error, done. The page adds its own { type: "start" } when a search begins. */
export type SearchEvent = { type: string } & Record<string, unknown>;

export interface Found {
  offers: Offer[];
  /** A site refused because of the key's read limit (10 reads a minute): with nothing found, the user should wait, not rephrase. */
  limited: boolean;
}

const RATE_LIMITED = 429;
/** How long the canned search takes (ms): long enough for the guide's "still looking" line. */
const MOCK_STEP_MS = 3000;

const MOCK: Offer[] = [
  { id: 'o1', title: 'Gazelle Champion Mondial road bike, 57 cm', price: 180, eur: 180, currency: 'EUR', url: 'https://www.marktplaats.nl/', site: 'marktplaats', country: 'NL', kind: 'used', location: 'Utrecht' },
  { id: 'o2', title: 'Peugeot vintage Rennrad, new tyres', price: 240, eur: 240, currency: 'EUR', url: 'https://www.kleinanzeigen.de/', site: 'kleinanzeigen', country: 'DE', kind: 'used', location: 'Berlin' },
  { id: 'o3', title: 'Bianchi Via Nirone 7, Shimano Sora', price: 420, eur: 420, currency: 'EUR', url: 'https://www.subito.it/', site: 'subito', country: 'IT', kind: 'used', location: 'Bologna' },
  { id: 'o4', title: 'Trek 1.1 alu road bike 54', price: 310, eur: 310, currency: 'EUR', url: 'https://www.tori.fi/', site: 'tori', country: 'FI', kind: 'used', location: 'Espoo' },
  { id: 'o5', title: 'Road bike inner tube 700x25', price: 6, eur: 6, currency: 'EUR', url: 'https://www.tori.fi/', site: 'tori', country: 'FI', kind: 'new' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The canned stream: four sites answer one after another, each with its offers. */
function mockBody(request: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const line = (ev: object) => enc.encode(`${JSON.stringify(ev)}\n`);
  const sites = [...new Set(MOCK.map((o) => o.site))];
  return new ReadableStream({
    async start(c) {
      c.enqueue(line({ type: 'plan', request, product: request, condition: 'used', max_price_eur: null }));
      for (const site of sites) c.enqueue(line({ type: 'read_start', site }));
      for (const site of sites) {
        await sleep(MOCK_STEP_MS);
        c.enqueue(line({ type: 'read_done', site, status: 200, ok: true, n: MOCK.filter((m) => m.site === site).length }));
        for (const o of MOCK.filter((m) => m.site === site)) c.enqueue(line({ type: 'offer', ...o }));
      }
      c.enqueue(line({ type: 'done' }));
      c.close();
    },
  });
}

/** The wall's page runs the search (`ask`: it is asked to; else it began one itself) and its events come as messages. */
function pageBody(request: string, ask: boolean): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const line = (ev: unknown) => enc.encode(`${JSON.stringify(ev)}\n`);
  let stop = (): void => undefined;
  return new ReadableStream({
    start(c) {
      stop = onPage((m) => {
        if (m.agora === 'event') c.enqueue(line(m['ev']));
        else if (m.agora === 'end') {
          if (m['error']) c.enqueue(line({ type: 'error', text: String(m['error']) }));
          stop();
          c.close();
        }
      });
      if (ask) toPage({ agora: 'search', q: request });
    },
    cancel: () => stop(),
  });
}

function isOffer(o: unknown): o is Offer {
  const x = o as Partial<Offer> & { type?: string };
  return x?.type === 'offer' && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.price === 'number' && typeof x.url === 'string' && /^https:\/\//.test(x.url);
}

/** Run one search to its end. Throws when the wall cannot be reached or reports an error with nothing found. */
export async function runSearch(
  request: string,
  from: Source,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
  onEvent: (ev: SearchEvent) => void = () => undefined,
  /** With 'page': ask the wall's page for the search (false: it has begun this one itself). */
  ask = true,
): Promise<Found> {
  let body: ReadableStream<Uint8Array>;
  if (from === 'mock') body = mockBody(request);
  else if (from === 'page') body = pageBody(request, ask);
  else {
    const r = await fetch('/search', { method: 'POST', body: JSON.stringify({ q: request, pick: false }), signal });
    if (!r.ok || !r.body) throw new Error(`the search answered ${r.status}`);
    body = r.body;
  }
  const reader = body.getReader();
  const cancel = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', cancel);
  const text = new TextDecoder();
  let buf = '';
  let offers: Offer[] = [];
  let p: Progress = { sites: 0, read: 0, offers: 0 };
  let limited = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += text.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const raw of lines) {
        if (!raw.trim()) continue;
        let ev: { type?: string; status?: number; ok?: boolean; text?: string };
        try {
          ev = JSON.parse(raw) as typeof ev;
        } catch {
          continue; // a broken line of the stream: the rest still counts
        }
        // the page shows the search as it happens: every event, and an offer only once it has passed the check
        if (typeof ev.type === 'string' && (ev.type !== 'offer' || isOffer(ev))) onEvent(ev as SearchEvent);
        if (isOffer(ev)) offers = [...offers, ev];
        else if (ev.type === 'read_start') p = { ...p, sites: p.sites + 1 };
        else if (ev.type === 'read_done') {
          p = { ...p, read: p.read + 1 };
          if (ev.status === RATE_LIMITED) limited += 1;
        } else if (ev.type === 'error' && !offers.length) throw new Error(String(ev.text ?? 'the search failed'));
        else continue;
        p = { ...p, offers: offers.length };
        onProgress(p);
      }
    }
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  if (signal.aborted) throw new DOMException('the search was replaced', 'AbortError');
  return { offers, limited: limited > 0 };
}
