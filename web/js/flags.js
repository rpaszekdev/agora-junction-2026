// flags.js: where an offer ships from, as a small country flag (line, ledger, sheet, verdict).
// The engine sends `origin` on offer and truecost events (docs/UI_ROUND_A.md section 6). Until it does,
// and for old recordings, we make a quiet guess here from the domain, the currency and the listing's
// location, and always mark it as a guess. See section 5 for the look and the tooltip wording.
import { domainOf } from './core.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EU = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
// names that read better with "the" in a sentence ("Probably the United States: …")
const THE = new Set(['US', 'GB', 'NL', 'AE', 'PH', 'BS', 'DO']);
const NAMES = { FI: 'Finland', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', DE: 'Germany', NL: 'Netherlands', BE: 'Belgium',
  FR: 'France', IT: 'Italy', ES: 'Spain', PT: 'Portugal', PL: 'Poland', AT: 'Austria', CH: 'Switzerland', IE: 'Ireland',
  GB: 'United Kingdom', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', CZ: 'Czechia', SK: 'Slovakia', HU: 'Hungary',
  GR: 'Greece', US: 'United States', CA: 'Canada', AU: 'Australia', JP: 'Japan', ZA: 'South Africa', CN: 'China' };
let dn = null;
try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { dn = null; }

/** English short name for an ISO code ("FI" → "Finland"). */
export function countryName(cc) {
  cc = String(cc || '').toUpperCase();
  if (!cc) return '';
  if (NAMES[cc]) return NAMES[cc];
  try { const n = dn && dn.of(cc); if (n && n !== cc) return n; } catch { /* unknown code */ }
  return cc;
}

// ---------- the client guess (only when the engine has not sent an origin) ----------
const TLD = { fi: 'FI', de: 'DE', se: 'SE', ee: 'EE', nl: 'NL', fr: 'FR', it: 'IT', es: 'ES', uk: 'GB', pl: 'PL', dk: 'DK',
  no: 'NO', at: 'AT', be: 'BE', ie: 'IE', pt: 'PT', cz: 'CZ', sk: 'SK', hu: 'HU', gr: 'GR', lt: 'LT', lv: 'LV', ch: 'CH',
  za: 'ZA', jp: 'JP', ca: 'CA', au: 'AU', lu: 'LU', si: 'SI', hr: 'HR', ro: 'RO', bg: 'BG' };
const CUR = { USD: 'US', GBP: 'GB', ZAR: 'ZA', JPY: 'JP', CAD: 'CA', AUD: 'AU', CHF: 'CH', SEK: 'SE', NOK: 'NO', DKK: 'DK',
  PLN: 'PL', CZK: 'CZ', HUF: 'HU' };
const CUR_WORD = { USD: 'US dollars', GBP: 'pounds', ZAR: 'rand', JPY: 'yen', CAD: 'Canadian dollars', AUD: 'Australian dollars',
  CHF: 'Swiss francs', SEK: 'Swedish kronor', NOK: 'Norwegian kroner', DKK: 'Danish kroner', PLN: 'złoty', CZK: 'koruna', HUF: 'forint' };
const KNOWN = { 'bhphotovideo.com': 'US', 'adorama.com': 'US', 'keh.com': 'US', 'walmart.com': 'US', 'newegg.com': 'US',
  'buydig.com': 'US', 'mpex.com': 'US', 'allenscamera.net': 'US', 'swappa.com': 'US', 'gazelle.com': 'US',
  'jessops.com': 'GB', 'wexphotovideo.com': 'GB', 'cvp.com': 'GB' };
const FI_CITIES = ['Helsinki', 'Espoo', 'Vantaa', 'Tampere', 'Turku', 'Oulu', 'Jyväskylä', 'Lahti', 'Kuopio', 'Pori',
  'Joensuu', 'Lappeenranta', 'Hämeenlinna', 'Vaasa', 'Rovaniemi', 'Seinäjoki', 'Kotka', 'Porvoo', 'Kerava', 'Tuusula'];

function flagsOf(item) {
  const tc = item && item.tc;
  return [].concat((tc && tc.flags) || [], (tc && tc.true_cost && tc.true_cost.flags) || [], (item && item.offer && item.offer.flags) || [])
    .map(f => typeof f === 'string' ? f : JSON.stringify(f));
}
function shipsFor(item, cc) {
  const fl = flagsOf(item);
  if (fl.some(f => /does not ship/i.test(f))) return [false, 'no, the shop does not ship to Finland'];
  if (fl.some(f => /shipping to Finland unconfirmed/i.test(f))) return [null, 'not confirmed by the shop'];
  if (fl.some(f => /\bships to Finland\b/i.test(f))) return [true, 'yes, the shop says so'];
  if (cc === 'FI') return [true, 'yes, domestic'];
  if (!cc || EU.has(cc)) return [null, 'not stated'];
  return [null, 'not confirmed by the shop'];
}

/** A guess at the origin from what the browser can see. Always confident: false. */
export function guessOrigin(item) {
  if (!item) return null;
  const o = item.offer || {};
  const host = String(o.source || domainOf(item.url) || '').toLowerCase().replace(/^www\./, '');
  const isJob = !!(item.tc && item.tc.true_cost && item.tc.true_cost.per === 'job') || /^serv/i.test(String(o.condition || ''));
  const parts = host.split('.');
  const tld = parts[parts.length - 1] || '';
  const tldCc = TLD[tld] || null;
  const known = KNOWN[host] || KNOWN[parts.slice(-2).join('.')] || null;
  const cur = String(o.currency || '').toUpperCase();
  const curCc = CUR[cur] || null;
  const loc = String(o.location || '');
  const city = FI_CITIES.map(c => [c, loc.indexOf(c)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0];
  const tldWord = host.endsWith('.co.uk') ? '.co.uk' : host.endsWith('.com.au') ? '.com.au' : '.' + tld;
  let cc = null, basis = 'unknown', text = 'not stated', cityName = null;
  if (city && (!tldCc || tldCc === 'FI')) {
    cc = 'FI'; cityName = city[0];
    basis = isJob ? 'service_area' : 'listing_location';
    text = isJob ? `from the provider's service area: ${loc.length > 48 ? cityName + ' region' : loc}` : "from the listing's location";
  } else if (tldCc && curCc === tldCc) {
    cc = tldCc; basis = 'domain_currency'; text = `from the ${tldWord} domain and prices in ${CUR_WORD[cur] || cur}`;
  } else if (tldCc) {
    cc = tldCc; basis = 'domain'; text = `from the ${tldWord} domain`;
  } else if (known) {
    cc = known; basis = 'known_shop'; text = 'from what we know about this shop';
  } else if (curCc) {
    cc = curCc; basis = 'currency';
    text = (tld === 'com' || tld === 'net') && curCc ? `from the .${tld} domain and prices in ${CUR_WORD[cur] || cur}` : `from prices in ${CUR_WORD[cur] || cur}`;
  }
  const [ships, shipsText] = shipsFor(item, cc);
  return {
    country_code: cc, country_name: cc ? countryName(cc) : null, city: cityName,
    basis, basis_text: text, confident: false, eu: cc ? EU.has(cc) : null,
    ships_to_fi: ships, ships_text: shipsText, _client: true,
  };
}

/** The engine's origin for an item: truecost first (recomputed after judge), then the offer's. */
export function originOf(item) {
  return (item && item.tc && item.tc.origin) || (item && item.offer && item.offer.origin) || null;
}
/** The origin to show: the engine's, or our guess. */
export function originFor(item) {
  const o = originOf(item);
  if (o && (o.country_code || o.basis)) return o;
  return guessOrigin(item);
}

const ccOf = o => (o && o.country_code ? String(o.country_code).toUpperCase().replace(/^UK$/, 'GB') : null);

/** The basis in plain words; a guess says so ("a guess from the .com domain and prices in US dollars"). */
export function basisWords(o) {
  const t = String((o && o.basis_text) || '').trim();
  if (!t) return o && o.confident === false ? 'a guess' : '';
  if (o.confident === false && !/^a guess\b/i.test(t)) return 'a guess ' + t;
  return t;
}

/** Tooltip / aria-label: two plain sentences (section 5). */
export function originTitle(origin) {
  const o = origin || {};
  const cc = ccOf(o);
  const ships = `Ships to Finland: ${o.ships_text || 'not stated'}.`;
  if (!cc) return `Where it ships from is not stated. ${ships}`;
  const name = (THE.has(cc) ? 'the ' : '') + (o.country_name || countryName(cc));
  const where = name + (o.city ? ` (${o.city})` : '');
  if (o.confident === false) return `Probably ${where}: ${basisWords(o)}. ${ships}`;
  const lead = o.basis === 'seller_address' || o.basis === 'known_shop' ? 'Shop based in'
    : o.basis === 'service_area' ? 'Provider in' : 'Seller in';
  return `${lead} ${where}, ${String(o.basis_text || '').trim() || 'as the listing says'}. ${ships}`;
}

/** The flag markup for an item. Unknown origin: '' (or, with `unknown: true`, a neutral globe chip that says
 *  "origin not stated", so a gap reads as unknown, not as an oversight). While an offer is still being costed
 *  and nothing is known, a blank slot keeps the width so nothing moves when the flag arrives.
 *  A guess is marked by a dotted rule under the flag; the tip (hover, focus or tap) says what it is based on. */
export function flagHtml(item, { size = 14, noFi = false, origin = null, unknown = false } = {}) {
  const o = origin || originFor(item);
  const cc = ccOf(o);
  const w = size >= 18 ? 18 : size, h = size >= 18 ? 13 : 10;
  if (!cc) {
    if (item && !item.tc && !origin) return `<span class="flag is-pending" data-size="${w}" aria-hidden="true"></span>`;
    if (!unknown) return '';
    const t = originTitle(o);
    return `<span class="flag is-unknown" data-size="${w}" data-tip="${esc(t)}" tabindex="0" role="img" aria-label="${esc(t)}"><svg viewBox="0 0 14 10" width="${w}" height="${h}" aria-hidden="true"><rect x=".5" y=".5" width="13" height="9" rx="2"/><path d="M7 2.2c1.2 0 2 .7 2 1.6 0 1.2-1.5 1.3-1.5 2.3M7.5 7.7v.1"/></svg></span>`;
  }
  const sure = o.confident === false ? '0' : '1';
  const fi = o.ships_to_fi === true ? 'yes' : o.ships_to_fi === false ? 'no' : 'unknown';
  const title = originTitle(o);
  return `<span class="flag" data-size="${w}" data-sure="${sure}" data-fi="${fi}" data-cc="${esc(cc)}" role="img" tabindex="0" data-tip="${esc(title)}" aria-label="${esc(title)}">` +
    `<img src="${flagSrc(cc)}" alt="" width="${w}" height="${h}" decoding="async" referrerpolicy="no-referrer">` +
    `<span class="flag-cc">${esc(cc)}</span>` +
    `${noFi && fi === 'no' ? '<span class="flag-nofi" aria-hidden="true">no FI</span>' : ''}</span>`;
}

// flags are served from this app (web/assets/flags/xx.svg) when we ship that country; else flagcdn
const LOCAL_FLAGS = new Set('fi se no dk de nl be fr it pt pl at ch ie gb ee lv lt cz sk hu gr us ca au jp za cn lu si ro bg'.split(' '));
export function flagSrc(cc) {
  const c = String(cc || '').toLowerCase();
  return LOCAL_FLAGS.has(c) ? `/web/assets/flags/${c}.svg` : `https://flagcdn.com/${encodeURIComponent(c)}.svg`;
}

/** Same as flagHtml, as an element (for modules that build DOM). */
export function flagEl(item, opts) {
  const html = flagHtml(item, opts);
  if (!html || typeof document === 'undefined') return null;
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.firstElementChild;
}

// ---------- the flag tip: hover or focus on desktop, tap on touch (a native title is slow, and dead on touch) ----------
let tip = null, tipFor = null, lastPt = 'mouse';
function showTip(el) {
  if (!el || !el.dataset.tip) return;
  if (!tip) { tip = document.createElement('div'); tip.className = 'flag-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  tipFor = el;
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect(), W = Math.min(280, innerWidth - 24);
  tip.style.maxWidth = W + 'px';
  const tw = Math.min(W, tip.offsetWidth || W);
  const left = Math.max(12, Math.min(innerWidth - tw - 12, r.left + r.width / 2 - tw / 2));
  const below = r.bottom + 8 + tip.offsetHeight < innerHeight;
  tip.style.left = left + 'px';
  tip.style.top = (below ? r.bottom + 8 : r.top - 8 - tip.offsetHeight) + 'px';
  tip.classList.add('on');
}
function hideTip() { if (tip) { tip.classList.remove('on'); tip.hidden = true; } tipFor = null; }
if (typeof document !== 'undefined') {
  document.addEventListener('mouseover', e => { const f = e.target.closest && e.target.closest('.flag[data-tip]'); if (f) showTip(f); else if (tipFor) hideTip(); }, { passive: true });
  document.addEventListener('focusin', e => { const f = e.target.closest && e.target.closest('.flag[data-tip]'); if (f) showTip(f); });
  document.addEventListener('focusout', e => { if (e.target === tipFor) hideTip(); });
  document.addEventListener('pointerdown', e => { lastPt = e.pointerType || 'mouse'; }, { capture: true, passive: true });
  // a tap on a flag explains the flag (and does not open the row under it); a mouse already has the hover tip
  document.addEventListener('click', e => {
    const f = e.target.closest && e.target.closest('.flag[data-tip]');
    if (!f) { if (tipFor && lastPt !== 'mouse') hideTip(); return; }
    if (lastPt === 'mouse') return;
    e.preventDefault(); e.stopPropagation();
    if (tipFor === f && tip && tip.classList.contains('on')) hideTip(); else showTip(f);
  }, true);
  addEventListener('scroll', () => { if (tipFor) hideTip(); }, { passive: true, capture: true });
}

// a flag image that does not load (offline, blocked) becomes its two-letter code in a small pill
if (typeof document !== 'undefined') {
  document.addEventListener('error', e => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.parentNode && img.parentNode.classList && img.parentNode.classList.contains('flag')) {
      img.parentNode.classList.add('noimg');
    }
  }, true);
}
