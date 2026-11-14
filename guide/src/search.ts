/**
 * One search on the wall (../../wall.py /search): the sites are read live and the events come back one JSON line each.
 * `?mock` swaps the network for a canned stream of the same events, so the page runs the same code either way.
 */

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
function mockBody(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const line = (ev: object) => enc.encode(`${JSON.stringify(ev)}\n`);
  const sites = [...new Set(MOCK.map((o) => o.site))];
  return new ReadableStream({
    async start(c) {
      for (const site of sites) c.enqueue(line({ type: 'read_start', site }));
      for (const site of sites) {
        await sleep(MOCK_STEP_MS);
        c.enqueue(line({ type: 'read_done', site, status: 200, ok: true }));
        for (const o of MOCK.filter((m) => m.site === site)) c.enqueue(line({ type: 'offer', ...o }));
      }
      c.enqueue(line({ type: 'done' }));
      c.close();
    },
  });
}

function isOffer(o: unknown): o is Offer {
  const x = o as Partial<Offer> & { type?: string };
  return x?.type === 'offer' && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.price === 'number' && typeof x.url === 'string' && /^https:\/\//.test(x.url);
}

/** Run one search to its end. Throws when the wall cannot be reached or reports an error with nothing found. */
export async function runSearch(request: string, mock: boolean, signal: AbortSignal, onProgress: (p: Progress) => void): Promise<Found> {
  let body: ReadableStream<Uint8Array>;
  if (mock) body = mockBody();
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
