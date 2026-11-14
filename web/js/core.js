// PriceMonkey web core: event bus, shared store, small helpers.
// This file is the contract between the modules (see DESIGN.md, "The contract").

// The product name: data-brand on <html> in index.html is the one edit point. main.js writes it into
// <title> and the logo at boot; the static text there is only the no-JS fallback.
export const BRAND = (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.brand) || 'PriceMonkey';

export const bus = new EventTarget();
export function emit(type, detail) { bus.dispatchEvent(new CustomEvent(type, { detail })); }
export function on(type, fn) { bus.addEventListener(type, e => fn(e.detail)); }

export const S = {
  q: '', slug: null, live: false,
  phase: 'start',            // 'start'|'hunting'|'turned'|'watch'|'finale'
  mode: 'tag',               // 'tag'|'true'  (which x the line uses)
  unit: 'month',             // 'month'|'job'
  need: null,
  offers: new Map(),         // url -> Item
  leader: null,              // url
  verdict: null,             // last verdict event data
  rank: null, depreciation: null,
  sources: [], skips: [], lanes: [], budget: null, late: [],
  turned: false,
  you: null,                 // your-price EUR (tag price)
  watch: null,               // {id, max_eur, action}
  reviews: new Map(),        // shop host -> `review` event data (GET /reviews after the hunt)
  reviewTargets: new Set(),  // hosts asked about
  reviewsState: null,        // null | 'checking' | 'done'
  recheck: null,             // {from, to, domain} when reviews moved the pick
  scope: null,               // `scope` event: {scope: 'home'|'eu', country, reason, eu_included, bulky, size}
  market: null,              // `market` event: {sources:[{domain,country,total,at_least,read,pages,extra}], total, read, at_least, scope}
  depth: 1,                  // 1 = a normal hunt; 2+ = "Compare more" asked for deeper pages
};
// Item = {url, offer, tc, setAside, full, ghostX, arrived, late}

export function resetStore(q = '') {
  Object.assign(S, {
    q, slug: null, phase: 'start', mode: 'tag', unit: 'month', need: null,
    leader: null, verdict: null, rank: null, depreciation: null,
    sources: [], skips: [], lanes: [], budget: null, late: [],
    turned: false, you: null, watch: null, reviewsState: null, recheck: null,
    scope: null, market: null, depth: 1,
  });
  S.offers = new Map();
  S.reviews = new Map();
  S.reviewTargets = new Set();
}

// A shop's logo, social card or placeholder is not a photo of the thing: show the shop's mark instead.
const NOT_A_PHOTO = /(^|[\/_.-])(logo|logos|og[_-]?image|og[_-]?logo|ogimage|placeholder|no[_-]?image|fallback[_-]?images?|favicon|sprite|banner|header|lifestyle)([\/_.-]|$)|\/plp\/og/i;
export function isProductPhoto(url) {
  if (!url || typeof url !== 'string') return false;
  let path = url;
  try { const u = new URL(url, 'https://x.invalid'); path = u.pathname; } catch { /* keep raw */ }
  return !NOT_A_PHOTO.test(path);
}
/** Under this many px on the long side a background cut-out turns into a grey blob: show the plain photo. */
export const CUT_MIN_PX = 300;

/** Background removal (macOS Vision cutouts via /cut). Temporarily off: plain listing photos are shown.
 *  Turn back on with CUTOUTS = true, or per page with ?cutouts=1. */
export const CUTOUTS = typeof location !== "undefined" && /[?&]cutouts=1\b/.test(location.search);

/** Cutout URL for an image. Also accepts an Item or an offer (listing) URL: then its offer.image is used. */
export function cutSrc(x) {
  let url = x;
  if (x && typeof x === 'object') url = (x.offer && x.offer.image) || x.image || null;
  else if (x && S.offers.has(x)) url = S.offers.get(x).offer.image || null;
  if (!url || !isProductPhoto(url)) return null;
  return CUTOUTS ? '/cut?u=' + encodeURIComponent(url) : url;
}

/** x on the line: the tag price, or (S.mode 'true') what you pay all in. */
export function xValue(item) {
  if (!item) return null;
  if (S.mode === 'true') return allIn(item);
  const p = item.offer && item.offer.price_eur;
  return (typeof p === 'number' && isFinite(p)) ? p : null;
}

// ---------- what you pay, all in ----------
// The one number we lead with: the tag + shipping + import VAT/duties + fees, paid once.
// Resale and per-month figures are a secondary option (sheet only), never the ranking.
const fin = v => (typeof v === 'number' && isFinite(v)) ? v : null;
function flagsOf(item) {
  const tc = item && item.tc;
  return [].concat((tc && tc.flags) || [], (tc && tc.true_cost && tc.true_cost.flags) || [])
    .map(f => typeof f === 'string' ? f : JSON.stringify(f));
}
/** A service priced per job: its all-in figure is the whole job. */
export function isJobItem(item) {
  const t = item && item.tc && item.tc.true_cost;
  return !!(t && t.per === 'job');
}
/** All-in euros: tag + shipping + import VAT/duties + fees (net of VAT refunded on export). null until costed. */
export function allIn(item) {
  const t = item && item.tc && item.tc.true_cost;
  if (!t) return null;
  if (t.per === 'job') return fin(t.total_eur) ?? fin(t.per_month_eur);
  const tag = fin(t.sticker_eur) ?? fin(item.offer && item.offer.price_eur);
  if (tag == null) return null;
  return tag + (fin(t.extras_eur) || 0);
}
/** What it costs net if you resell it after t.months (default a year): the old "true cost", now an option. */
export function netAfterResale(item) {
  const t = item && item.tc && item.tc.true_cost;
  if (!t || t.per === 'job' || !(fin(t.resale_eur) > 0)) return null;
  return fin(t.total_eur);
}
/** Shipping to you is not on the page (counted as €0 in the all-in figure). */
export function shippingUnknown(item) {
  if (!item || isJobItem(item)) return false;
  if (fin(item.offer && item.offer.shipping_eur) != null) return false;
  const t = item.tc && item.tc.true_cost;
  const rec = (t && t.receipt) || [];
  if (rec.some(([l]) => /ship|deliver|postage/i.test(String(l)))) return false;
  return /shipping unknown/i.test((t && t.basis) || '') || flagsOf(item).some(f => /shipping to Finland unconfirmed/i.test(f));
}
const UNSURE_RE = /does not ship|shipping to Finland unconfirmed|out of stock|from-price/i;
/** Costed, but we cannot say you can surely buy it at that price (abroad and shipping unconfirmed,
 *  does not ship to you, out of stock, a "from" price, a seller whose reviews show red flags).
 *  It stays on the line; it is not the pick. */
export function isUnsure(item) { return flagsOf(item).some(f => UNSURE_RE.test(f)) || reviewWatchOut(item); }

// ---------- seller reviews (GET /reviews after the hunt) ----------
function hostOf(item) {
  return String((item && item.offer && item.offer.source) || domainOf(item && item.url) || '').toLowerCase().replace(/^www\./, '');
}
/** The `review` data for this offer's shop (exact host, then its parent domains), or null. */
export function reviewFor(item) {
  let h = hostOf(item);
  if (!h) return null;
  if (!S.reviews.has(h)) { const u = domainOf(item.url); if (u && S.reviews.has(u)) h = u; }
  while (h && !S.reviews.has(h) && h.split('.').length > 2) h = h.slice(h.indexOf('.') + 1);
  return S.reviews.get(h) || null;
}
/** Reviews say this shop has red flags (scam, never delivered, refunds refused): never the pick. */
export function reviewWatchOut(item) {
  const r = reviewFor(item);
  if (r && r.label === 'watch out') return true;
  const tc = item && item.tc;
  return !!(tc && (tc.flags || []).some(f => /^reviews: red flags/i.test(String(f))));
}
export function fmtCount(n) {
  n = Math.round(n || 0);
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
/** The small trust mark for an offer's shop: {state, label, text} or null when we are not checking it.
 *  "checking reviews…" → "★ 4.1 · 12k · solid" | "watch out" | "few reviews" | "no reviews found". */
export function trustMark(item) {
  const r = reviewFor(item);
  if (!r || r.status === 'checking') {
    const asked = S.reviewTargets.has(hostOf(item)) || !!r;
    return asked && S.reviewsState === 'checking' ? { state: 'checking', label: '', text: 'checking reviews…', short: 'reviews…' } : null;
  }
  const stars = typeof r.rating === 'number' && r.count ? `★ ${r.rating.toFixed(1)} · ${fmtCount(r.count)}`
    : (r.count ? `${fmtCount(r.count)} reviews` : '');
  const pre = r.platform ? 'platform · ' : '';      // a marketplace: the platform is rated, not the seller
  if (r.status === 'none' || (!stars && r.label === 'unknown')) return { state: 'none', label: 'unknown', text: pre + 'no reviews found', short: 'no reviews' };
  const word = r.label === 'unknown' ? 'few reviews' : r.label;
  const short = (typeof r.rating === 'number' ? `★ ${r.rating.toFixed(1)} ` : '') + word;   // phones
  return { state: 'done', label: r.label, text: pre + [stars, word].filter(Boolean).join(' · '), short };
}
/** Why an offer is unsure, in two or three words (ledger, verdict); '' when it is sure. */
export function unsureWhy(item) {
  const fl = flagsOf(item);
  if (fl.some(f => /does not ship/i.test(f))) return 'no shipping to FI';
  if (reviewWatchOut(item)) return 'reviews: red flags';
  if (fl.some(f => /out of stock/i.test(f))) return 'out of stock';
  if (fl.some(f => /from-price/i.test(f))) return 'a “from” price';
  if (fl.some(f => /shipping to Finland unconfirmed/i.test(f))) return 'ships to FI?';
  return '';
}
/** Abroad and the shop does not confirm shipping to you: its all-in figure is "+ shipping". */
export function shipsUnconfirmed(item) { return flagsOf(item).some(f => /shipping to Finland unconfirmed/i.test(f)); }
/** The few words after an all-in figure that keep it honest: " + shipping" or " · no shipping to FI". */
export function shipNote(item) {
  if (!item || isJobItem(item)) return '';
  if (flagsOf(item).some(f => /does not ship/i.test(f))) return ' · no shipping to FI';
  return shipsUnconfirmed(item) ? ' + shipping' : '';
}

function pickable(it) { return it && !isSetAside(it) && allIn(it) != null; }
/** The pick: the lowest all-in price you can surely buy (not set aside, not unsure).
 *  If nothing is sure, the lowest all-in that is not set aside. Ties go to the engine's pick. */
export function pickUrl(offers = S.offers) {
  const v = S.verdict && S.verdict.verdict;
  const pref = v && (v.best_offer_url || v.best_true_cost_url);
  const all = [...offers.values()].filter(pickable);
  const sure = all.filter(it => !isUnsure(it));
  const pool = sure.length ? sure : all;
  let best = null;
  for (const it of pool) {
    const a = allIn(it), b = best ? allIn(best) : Infinity;
    if (a < b - 0.005 || (Math.abs(a - b) <= 0.005 && it.url === pref)) best = it;
  }
  return best ? best.url : null;
}
/** The cheapest all-in offer per condition ('new' | 'refurbished' | 'used' | …), sure ones first. */
export function cheapestByCondition(offers = S.offers) {
  const out = {};
  const all = [...offers.values()].filter(pickable);
  for (const it of all) {
    const c = String((it.offer && it.offer.condition) || '').toLowerCase().replace(/^refurb.*/, 'refurbished');
    if (!c) continue;
    const sure = !isUnsure(it), cur = out[c];
    if (!cur || (sure && !cur.sure) || (sure === cur.sure && allIn(it) < allIn(cur.it))) out[c] = { it, sure };
  }
  return out;
}
/** The tag price at which this offer would beat the pick, all in (extras assumed to scale with the tag). */
export function beatAllIn(item, pick = S.offers.get(pickUrl())) {
  const a = allIn(item), p = pick && allIn(pick);
  const tag = fin(item && item.offer && item.offer.price_eur);
  if (a == null || p == null || tag == null || !pick || pick.url === item.url) return null;
  if (a < p) return { beat: tag, gap: 0 };
  const beat = Math.floor((p - 1) * tag / a);
  return beat > 0 ? { beat, gap: tag - beat } : null;
}

// ---------- all listings: groups, reasons, filters (ledger.js, market.js) ----------
/** Domains whose pages are the bulky "also in the EU" set (source/market `extra: true`, never also read as home). */
export function extraDomains() {
  const ex = new Set(), home = new Set();
  const bare = d => String(d || '').toLowerCase().replace(/^www\./, '');
  for (const s of S.sources || []) {
    const d = bare(s.domain || domainOf(s.url));
    if (!d) continue;
    if (s.extra) ex.add(d); else if (s.direct || s.list_page) home.add(d);
  }
  for (const m of (S.market && S.market.sources) || []) if (m && m.extra) ex.add(bare(m.domain));
  for (const d of home) ex.delete(d);
  return ex;
}
/** In the separate "Also in the EU (+ shipping est.)" group: read from an extra marketplace page. */
export function isExtra(item, ex = extraDomains()) {
  if (!ex.size || !item) return false;
  return ex.has(hostOf(item)) || ex.has(domainOf(item.url));
}
/** Pickup only: the seller does not ship to you (flag, or the engine's origin says no). */
export function isPickupOnly(item) {
  const fl = flagsOf(item);
  if (fl.some(f => /pickup only|does not ship/i.test(f))) return true;
  const o = (item && item.tc && item.tc.origin) || (item && item.offer && item.offer.origin);
  return !!(o && o.ships_to_fi === false);
}
/** Risky / not comparable: set aside (too good to be true, price unconfirmed, price disagrees), reviews with
 *  red flags, or very low trust. These go to the bottom of the list, dimmed, with their reason. */
export function isRisky(item) {
  if (!item || !item.tc) return false;
  if (isSetAside(item) || reviewWatchOut(item)) return true;
  const t = item.tc.trust;
  return typeof t === 'number' && t < 0.3;
}
/** Why it is set aside or risky, in a few plain words (the first flag that explains it). */
export function riskWhy(item) {
  const fl = flagsOf(item);
  const pick = re => fl.find(f => re.test(f));
  let f;
  if ((f = pick(/too good to be true/i))) {
    const m = /(\d+)% under/.exec(f);
    return m ? `too cheap to trust: ${m[1]}% under the usual price` : 'too cheap to trust';
  }
  if (pick(/^not costed/i)) return 'price unconfirmed: far off the market';
  if (pick(/price disagrees/i)) return 'the page shows two different prices';
  if (reviewWatchOut(item)) return 'reviews: red flags';
  if (pick(/scam pattern/i)) return 'looks like a scam pattern';
  if (pick(/photo copied/i)) return 'photo copied from another listing';
  if (pick(/shop name looks like/i)) return 'shop name imitates another';
  if (pick(/only \d+ days old/i)) return 'very new shop domain';
  if (item && item.tc && item.tc.true_cost == null) return 'could not cost it honestly';
  return 'low trust';
}

const SET_ASIDE_RE = /too good to be true|price disagrees/i;
export function isSetAside(item) {
  const tc = item && item.tc;
  if (!tc) return false;
  if (tc.true_cost == null) return true;
  const flags = [].concat(tc.flags || [], (tc.true_cost && tc.true_cost.flags) || []);
  return flags.some(f => SET_ASIDE_RE.test(typeof f === 'string' ? f : JSON.stringify(f)));
}

const NF = {};
export function eur(n, { dp } = {}) {
  if (n == null || !isFinite(n)) return '€–';
  const neg = n < 0; const a = Math.abs(n);
  const d = dp != null ? dp : (a < 100 && a % 1 !== 0 ? 2 : 0);
  // one formatter per precision: toLocaleString builds a new one per call (hundreds of offers, many labels)
  const nf = NF[d] || (NF[d] = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const s = nf.format(a);
  return (neg ? '−' : '') + '€' + s;
}

export function goHref(url) {
  const bytes = new TextEncoder().encode(url || '');
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return '/go/-/' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function condLetter(c) {
  const k = String(c || '').toLowerCase();
  if (k.startsWith('new')) return 'n';
  if (k.startsWith('refurb')) return 'r';
  if (k.startsWith('used') || k === 'second-hand' || k === 'secondhand') return 'u';
  if (k.startsWith('rent')) return 'rent';
  if (k.startsWith('serv')) return 'svc';
  return k ? k[0] : '';
}

export function slugify(q) {
  return String(q || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
