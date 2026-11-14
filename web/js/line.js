// THE LINE (B2). One euro ruler; every offer is an object standing on it.
// Start: a log-scale shelf of real cutouts. Hunt: offers fly in from the ticker and land at their
// tag price. The Turn: every object slides once to what you actually pay, all in (or per job).
// See DESIGN.md sections 1, 2, 3 and 6. Shelf idea and cutouts: our teammate rpaszekdev.
import { S, on, emit, cutSrc, isSetAside, eur, condLetter, domainOf, CUT_MIN_PX, allIn, pickUrl, shipsUnconfirmed, shipNote, trustMark, isUnsure } from './core.js';
import { flagHtml, originFor, countryName } from './flags.js';

const NS = 'http://www.w3.org/2000/svg';
const EASE = 'cubic-bezier(.2,.7,.2,1)';
const T_DROP = 450, T_TURN = 900, T_STAG = 30, T_DRIP = 70, T_RING = 600, T_MODE = 300;
const H = 340;            // tallest stage (desktop); the real height is measured from what stands on it
const AX_MIN = 150, AX_MAX = 250;
const AXB = 90;           // axis distance from the stage bottom
const FULL_MAX = 5;
const TIER = 64;          // full cutouts: collision distance and tier rise
const BEAD = 30;          // dots: stack step
const RD_ZONE = 44, RD_COLS = 4, RD_STEP = 11, RD_MAX = 8;    // reading dots: reserved zone at the dearer end
const HOLD_MS = 350;
const COND_WORD = { n: 'new', r: 'refurb', u: 'used', rent: 'rental', svc: 'service' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- state ----------
let root, caption, stage, svg, gHl, gHlIn, gGhost, gBand, gAxis, gTicks, gNotch, figs, axisLab, axisLabA, axisLabB, axisRight, tray, trayChip, sw, moreBtn;
let trayOpen = false;
let W = 0, AX = H - AXB, axFloor = AX_MIN, vertical = false;
let cheapKey = null;               // the lowest tag, when it is not the winner and costs more all in: "€633 tag → €795"
let expanded = false, swLocked = false, turnCapTimer = 0;
let brands = null;                 // assets/brands.json by domain
let vmode = 'tag';                 // the mode the picture shows (S.mode can run ahead during the Turn)
let scale = null;                  // {log, d0, d1, r0, r1, ticks, step}
let phase = 'start';               // 'start' | 'hunt'
let gen = 0;                       // bumps on reset; stale timers check it
let dripAt = 0;
let turned = false, turning = false, turnTimer = 0, turnBusyUntil = 0, relayoutTimer = 0;
let winner = null, leaderShown = null;
let lit = null;                    // highlightBelow (tag EUR)
let notchEur = null, selected = null;
let focusDom = null;               // the finale's close-up: [lo, hi] tag euros around your price
let ghostDomain = null;            // tag-scale domain frozen at the Turn
const objs = new Map();            // key -> Obj
let rdLayer = null, readingOn = false;   // pages being read: a pulsing dot each, in a zone at the end of the line
const reading = new Map();         // domain -> {urls:Set, el, slot}
const rdRecent = new Map();        // domain -> {rect, t}: a dot that just became an object (B4 flies a pill to it)
let gSplit = null, split = null, holdT = 0, hold = null, eatClick = false, srLive = null;
let shelf = null;                  // shelf.json rows (cached)
let marksReady = null;
// Hundreds of offers: past DENSE on the line, the beads become small pips stacked into a dot plot (a density
// silhouette of the market), and only the story's plates and a few beads carry photos.
const DENSE = 40, PIP = 7, PIP_MAX = 14, BEADS_DENSE = 12;
let dense = false;

// Obj = {key, item|null, extra|null, shelf|null, el, face, img, kind:'full'|'dot', x, lvl, y,
//        placed:bool, tray:bool, cur:'transform string', ghost: tagEur|null}

// ---------- tiny helpers ----------
function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function div(cls, parent, tag = 'div') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const unitJob = () => S.unit === 'job' || [...objs.values()].some(o => o.item && o.item.tc && o.item.tc.true_cost && o.item.tc.true_cost.per === 'job');
function tagOf(o) {
  if (o.extra) return o.extra.eur;
  if (o.shelf) return num(o.shelf.price_eur ?? o.shelf.price);
  const p = num(o.item && o.item.offer && o.item.offer.price_eur);
  return p != null && p > 0 ? p : null;     // a €0 tag is a missing price, not the cheapest offer
}
// "late" is a quiet note for an offer that came after the answer. The pick and the leader are never
// shrunk or labelled late: in a live hunt most offers land after the first answer.
function isLate(o) { return !!(o && o.item && o.item.late && o.key !== winner && o.key !== S.leader); }
function trueOf(o) {
  if (o.extra) return num(o.extra.trueEur);   // extras are placed in tag euros; hidden in true view unless given one
  return o.item ? num(allIn(o.item)) : null;
}
function valOf(o, mode = vmode) { return mode === 'true' ? trueOf(o) : tagOf(o); }
function condOf(o) {
  if (o.extra) return '';
  if (o.shelf) return o.shelf.cond || o.shelf.condition || '';
  return (o.item && o.item.offer && o.item.offer.condition) || '';
}
function siteOf(o) {
  if (o.extra) return o.extra.label || '';
  if (o.shelf) return o.shelf.site_label || o.shelf.source || o.shelf.domain || (o.shelf.site || '').replace(/_/g, '.');
  return (o.item.offer && o.item.offer.source) || domainOf(o.key);
}
function fmtVal(v, mode = vmode, o) {
  if (v == null) return '';
  if (mode === 'true') {
    if (unitJob()) return eur(v, { dp: v < 100 && Math.abs(v % 1) > 0.004 ? 2 : 0 }) + ' a job';
    // whole euros, paid once; a shop abroad that does not confirm shipping says so
    const sn = o && o.item ? shipNote(o.item) : '';
    return eur(Math.round(v), { dp: 0 }) + (vertical ? sn.replace(' · no shipping to FI', ' · not to FI') : sn);
  }
  const u = o && o.item && o.item.offer && o.item.offer.unit;
  return eur(v, { dp: v < 10 && v % 1 ? 2 : 0 }) + (u === 'hour' ? '/h' : '');
}

// ---------- scales ----------
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function range() {
  if (vertical) return [0, 0];
  const pad = Math.max(48, Math.min(96, W * 0.06));
  const zone = readingOn && phase === 'hunt' ? RD_ZONE : 0;
  return [pad, Math.max(pad + 10, W - pad - zone)];
}
function linScale(vals, minSpan = false) {
  let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 100;
  // close offers sit close: a few cents apart never spread across the whole page
  if (minSpan && vals.length && hi - lo < 0.4 * ((hi + lo) / 2)) {
    const mid = (hi + lo) / 2; lo = Math.min(lo, mid * 0.8); hi = Math.max(hi, mid * 1.2);
  }
  if (hi - lo < Math.max(1, Math.abs(hi) * 0.06)) {
    const c = (hi + lo) / 2, half = Math.max(Math.abs(c) * 0.12, 5);
    lo = c - half; hi = c + half;
  }
  const minV = lo;
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  if (minV >= 0 && lo < 0) lo = 0;
  const [r0, r1] = range();
  const step = niceStep(hi - lo, Math.max(3, Math.min(9, Math.floor((r1 - r0) / 120))));
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(+t.toFixed(6));
  return { log: false, d0: lo, d1: hi, r0, r1, ticks, step };
}
function logScale(vals) {
  const lo = Math.max(1, Math.min(...vals) / 1.6), hi = Math.max(...vals) * 1.5;
  const [r0, r1] = range();
  const ticks = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 3]) { const t = m * Math.pow(10, e); if (t >= lo && t <= hi) ticks.push(t); }
  }
  return { log: true, d0: lo, d1: hi, r0, r1, ticks, step: 0 };
}
function sx(sc, v) {
  if (!sc || v == null) return null;
  const f = sc.log ? (Math.log10(v) - Math.log10(sc.d0)) / (Math.log10(sc.d1) - Math.log10(sc.d0))
                   : (v - sc.d0) / (sc.d1 - sc.d0);
  return sc.r0 + f * (sc.r1 - sc.r0);
}
function sinv(sc, px) {
  if (!sc) return null;
  const f = (px - sc.r0) / (sc.r1 - sc.r0);
  return sc.log ? Math.pow(10, Math.log10(sc.d0) + f * (Math.log10(sc.d1) - Math.log10(sc.d0)))
                : sc.d0 + f * (sc.d1 - sc.d0);
}
function tickLabel(t, i) {
  if (scale.log) return t >= 1000 ? '€' + (t / 1000) + 'k' : '€' + t;
  // bare amounts; the unit is said once, in the caption under the axis
  void i;
  return eur(t, { dp: Math.abs(t - Math.round(t)) < 1e-6 ? 0 : 2 });
}

// ---------- marks sprite (assets/marks.svg) ----------
function loadMarks() {
  if (marksReady) return marksReady;
  marksReady = fetch(new URL('../assets/marks.svg', import.meta.url))
    .then(r => r.ok ? r.text() : Promise.reject(r.status))
    .then(t => { const d = div('ln-sprite'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = t; document.body.appendChild(d); })
    .catch(() => {});
  return marksReady;
}

// ---------- mount ----------
export function mountLine(el) {
  root = el;
  root.classList.add('ln');
  root.innerHTML = '';
  root.tabIndex = -1;
  caption = div('ln-caption', root, 'p');
  caption.setAttribute('aria-live', 'polite');
  stage = div('ln-stage', root);
  svg = svgEl('svg', { class: 'ln-svg', 'aria-hidden': 'true' }, stage);
  gBand = svgEl('g', { class: 'ln-band' }, svg);
  gHl = svgEl('g', { class: 'ln-hlg' }, svg);
  gHlIn = svgEl('g', { class: 'ln-hlin' }, gHl);
  svgEl('use', { href: '#ln-highlighter', x: -52, y: -9, width: 104, height: 18 }, gHlIn);
  gGhost = svgEl('g', { class: 'ln-ghosts' }, svg);
  gAxis = svgEl('g', { class: 'ln-axis' }, svg);
  gTicks = svgEl('g', { class: 'ln-ticks' }, svg);
  gNotch = svgEl('g', { class: 'ln-notch' }, svg);
  gSplit = svgEl('g', { class: 'ln-split' }, svg);
  rdLayer = div('ln-reading', stage);
  rdLayer.setAttribute('aria-hidden', 'true');
  figs = div('ln-figs', stage);
  srLive = div('ln-sr', root, 'span');
  srLive.setAttribute('aria-live', 'polite');
  figs.setAttribute('role', 'list');
  moreBtn = div('ln-more', root, 'button');
  moreBtn.type = 'button'; moreBtn.hidden = true;
  moreBtn.addEventListener('click', () => {
    if (moreBtn.dataset.to === 'ledger') { emit('ledger:show', {}); return; }
    expanded = true; layout({ dur: 0 });
  });
  axisLab = div('ln-axislab', root);
  // the pivot, under your control: flip the line between the tag and what you actually pay, all in
  sw = div('ln-switch', axisLab, 'span');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'Which price the line shows');
  sw.innerHTML = '<button type="button" data-m="tag" aria-pressed="false">Price on the tag</button>' +
                 '<button type="button" data-m="true" aria-pressed="true">What you actually pay</button>';
  sw.addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b || b.disabled || swLocked) return;
    line.setMode(b.dataset.m);
    emit('line:mode', { mode: b.dataset.m, by: 'user' });
  });
  const labs = div('ln-labs', axisLab, 'span');
  axisLabA = div('ln-lab a on', labs, 'span');
  axisLabB = div('ln-lab b', labs, 'span');
  axisRight = div('ln-dearer', axisLab, 'span');
  axisRight.hidden = true;                 // "dearer →" is drawn under the axis end (drawAxis)
  // the set-aside offers: a compact chip in the toolbar that opens its list inline, under the toolbar
  trayChip = div('ln-trayc', axisLab, 'button');
  trayChip.type = 'button'; trayChip.hidden = true;
  trayChip.setAttribute('aria-expanded', 'false');
  trayChip.setAttribute('aria-controls', 'tray');
  trayChip.addEventListener('click', () => { trayOpen = !trayOpen; syncTray(); });
  tray = div('ln-tray', root);
  tray.id = 'tray';
  tray.hidden = true;
  fetch(new URL('../assets/brands.json', import.meta.url)).then(r => r.ok ? r.json() : {}).then(j => {
    brands = {};
    for (const b of Object.values(j || {})) if (b && b.domain) brands[b.domain.replace(/^www\./, '')] = b;
    for (const o of objs.values()) if (o.el.classList.contains('mono')) monogram(o);
  }).catch(() => { brands = {}; });

  loadMarks();
  measure();
  new ResizeObserver(() => {
    const w = root.clientWidth;
    const v = isVertical();
    if (Math.abs(w - W) < 1 && v === vertical) return;
    measure();
    layout({ dur: 0 });
  }).observe(root);

  figs.addEventListener('keydown', onKey);
  figs.addEventListener('keyup', onKeyUp);
  figs.addEventListener('click', onClick, true);
  figs.addEventListener('pointerdown', onDown);
  const wake = e => { const f = e.target.closest && e.target.closest('.ln-o'); const o = f && objs.get(f.dataset.key); if (o && !o.img && o.src) ensureImg(o); };
  figs.addEventListener('pointerover', wake, { passive: true });
  figs.addEventListener('focusin', wake);
  figs.addEventListener('pointermove', onMove);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) figs.addEventListener(t, onUp);
  figs.addEventListener('contextmenu', e => { if (hold || split) e.preventDefault(); });
  window.addEventListener('blur', () => endSplit());

  on('reset', d => reset(d || {}));
  on('offer', it => it && phase === 'hunt' && addItem(it));
  on('truecost', it => it && onTruecost(it));
  on('rank', d => onRank(d));
  on('verdict', () => onVerdict());
  on('turn', () => scheduleTurn());
  on('late', d => onLate(d));
  on('review', () => relabelAll());
  on('reviews', () => relabelAll());
  on('recheck', () => { if (syncWinner()) setCaption('re-checked after reviews'); });
  on('offer-removed', it => onRemoved(it));
  on('select', url => { selected = url; drawNotch(); });
  on('agent', d => {
    root.classList.toggle('ln-agent', !!(d && d.on));
    // the JSON is ranked by what it really costs: the line it says it mirrors must be on that view too
    if (d && d.on && turned && vmode !== 'true' && !swLocked) line.setMode('true');
  });
  on('source', d => d && readStart(d));
  on('skip', d => d && readStop(d));
  on('done', () => readEnd());
  on('mode', () => endSplit());

  if (S.phase === 'start' && !S.offers.size) showShelf();
  else { phase = 'hunt'; for (const it of S.offers.values()) addItem(it, { instant: true }); }
  setAxisLabel(true);
  return line;
}

function isVertical() { return (root ? root.clientWidth : innerWidth) < 640 || innerWidth < 640; }
function measure() {
  W = root.clientWidth || innerWidth;
  const v = isVertical();
  if (v !== vertical) { vertical = v; root.classList.toggle('ln-v', v); }
  AX = H - AXB;
}

// ---------- reset / shelf ----------
function clearAll() {
  gen++;
  clearTimeout(turnTimer); clearTimeout(relayoutTimer);
  for (const o of objs.values()) o.el.remove();
  objs.clear();
  gGhost.textContent = ''; gBand.textContent = ''; gNotch.textContent = '';
  endSplit(); readClear();
  tray.textContent = ''; tray.hidden = true; trayOpen = false; syncTray();
  turned = false; turning = false; turnBusyUntil = 0; winner = null; leaderShown = null;
  cheapKey = null; expanded = false; axFloor = AX_MIN; clearTimeout(turnCapTimer);
  clearTimeout(ghostTimer); ghostsSettled = false;
  if (moreBtn) moreBtn.hidden = true;
  lit = null; notchEur = null; selected = null; ghostDomain = null; focusDom = null;
  vmode = 'tag'; dripAt = 0;
  root.classList.remove('ln-turned', 'ln-lit', 'ln-calm', 'ln-focus', 'ln-turning');
  setCaption('');
}
function reset(d) {
  const old = [...objs.values()];
  const wasShelf = phase === 'start';
  // the shelf (or the previous hunt) sinks, then goes
  if (old.length && reduced()) old.forEach(o => o.el.remove());
  else if (old.length) {
    const g = div('ln-sink', stage);
    old.forEach(o => { g.appendChild(o.el); });
    g.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(40px)', opacity: 0 }],
      { duration: wasShelf ? 380 : 220, easing: EASE, fill: 'forwards' }).finished.then(() => g.remove(), () => g.remove());
  }
  objs.clear();
  clearAll();
  if (d.q && !d.empty) {
    readingOn = true;
    phase = 'hunt';
    root.dataset.lnPhase = 'hunt';
    scale = linScale([]);
    drawAxis();
    setAxisLabel(true);
  } else {
    showShelf();
  }
}
async function showShelf() {
  phase = 'start';
  root.dataset.lnPhase = 'start';
  setAxisLabel(true);
  const my = gen;
  if (!shelf) {
    try {
      const r = await fetch(new URL('../assets/shelf.json', import.meta.url));
      const j = r.ok ? await r.json() : [];
      shelf = (Array.isArray(j) ? j : (j.items || [])).filter(s => num(s.price_eur ?? s.price) > 0 && s.img);
    } catch { shelf = []; }
  }
  if (my !== gen || phase !== 'start') return;
  const rows = vertical ? shelf.slice(0, 6) : shelf;
  rows.forEach((s, i) => {
    const o = makeObj('shelf:' + i, { shelf: s });
    o.idx = i;
    o.kind = 'full';
    o.placed = true;
  });
  layout({ dur: 0 });
  if (!reduced()) {
    [...objs.values()].sort((a, b) => a.x - b.x).forEach((o, i) => {
      o.face.animate([{ opacity: 0, transform: `translateY(${-o.lvl + 18}px)` }, { opacity: 1, transform: `translateY(${-o.lvl}px)` }],
        { duration: 600, delay: 120 + i * 45, easing: EASE, fill: 'backwards' });
    });
  }
}
// The shelf fills the whole ruler: each cutout keeps its price order and sits as close to its log-scale
// spot as a calm gap allows (least-squares fit under a minimum spacing). Too narrow for all of them:
// an even pick across the price range stays, the rest sit this one out.
const SHELF_GAP = 92, SHELF_ROOM = 112;  // minimum and most generous centre-to-centre spacing
function spreadShelf(list) {
  if (vertical || !list.length) return;
  const [r0, r1] = range();
  const lo = r0 + 30, hi = r1 - 30;
  const all = list.slice().sort((a, b) => a.x - b.x);
  const fit = Math.max(1, Math.floor((hi - lo) / SHELF_GAP) + 1);
  const keep = new Set();
  if (all.length <= fit) all.forEach(o => keep.add(o));
  else {
    for (let i = 0; i < fit; i++) keep.add(all[Math.round(i * (all.length - 1) / Math.max(1, fit - 1))]);
    // a recorded example always stays: it trades places with its nearest unrecorded neighbour
    all.forEach((o, i) => {
      if (!o.shelf.recording || keep.has(o)) return;
      const swap = all.map((k, j) => [k, Math.abs(j - i)]).filter(([k]) => keep.has(k) && !k.shelf.recording)
        .sort((a, b) => a[1] - b[1])[0];
      if (swap) { keep.delete(swap[0]); keep.add(o); }
    });
  }
  all.forEach(o => { o.shelfOff = !keep.has(o); });
  const on = all.filter(o => keep.has(o)), n = on.length;
  const g = n > 1 ? Math.min(SHELF_ROOM, (hi - lo) / (n - 1)) : 0;
  // isotonic regression on y_i = x_i - i*g gives the closest positions with gaps >= g
  const blocks = [];
  on.forEach((o, i) => {
    blocks.push({ sum: Math.min(hi - (n - 1) * g, Math.max(lo, o.x - i * g)), cnt: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].cnt > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].cnt) {
      const b = blocks.pop(); blocks[blocks.length - 1].sum += b.sum; blocks[blocks.length - 1].cnt += b.cnt;
    }
  });
  let i = 0;
  for (const b of blocks) for (let k = 0; k < b.cnt; k++, i++) on[i].x = b.sum / b.cnt + i * g;
}
function runShelf(s) {
  const q = s.query_en || s.label_query || s.query || s.title;
  const input = document.getElementById('q'), form = document.getElementById('ask');
  if (!q || !input || !form) return;
  input.value = q;
  if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
}

// ---------- objects ----------
function imgSrcFor(o) {
  if (o.extra) return o.extra.img || null;
  if (o.shelf) {
    const i = o.shelf.img;
    return /^(https?:)?\/|^data:/.test(i) ? i : new URL('../assets/shelf/' + encodeURIComponent(i), import.meta.url).href;
  }
  const im = o.item.offer && o.item.offer.image;
  // you asked for a body and this listing is a kit: its photo is often the lens. Show the shop's mark.
  if (/\bbody\b/i.test(S.q || '') && /\bkit\b/i.test((o.item.offer && o.item.offer.title) || '')) return null;
  return im ? cutSrc(im) : null;
}
function makeObj(key, from) {
  const o = { key, item: from.item || null, extra: from.extra || null, shelf: from.shelf || null,
              kind: 'dot', x: 0, y: 0, lvl: 0, placed: false, tray: false, cur: '', ghost: null };
  const el = o.el = document.createElement('figure');
  el.className = 'ln-o';
  el.dataset.key = key;
  el.tabIndex = -1;
  el.setAttribute('role', 'listitem');
  el.innerHTML =
    '<i class="ln-stem" aria-hidden="true"></i>' +
    '<span class="ln-val" aria-hidden="true"></span>' +
    '<div class="ln-face"><i class="ln-shadow" aria-hidden="true"></i><div class="ln-pic"></div>' +
    '<span class="ln-flag" aria-hidden="true"></span>' +
    '<b class="ln-cond" aria-hidden="true"><span class="l"></span><span class="w"></span></b>' +
    '<svg class="ln-ring" viewBox="0 0 200 132" preserveAspectRatio="none" aria-hidden="true"><use href="#ln-ink-circle"/></svg>' +
    '<figcaption class="ln-cap"><span class="p"></span><span class="f" aria-hidden="true"></span><span class="d"></span><span class="x"></span></figcaption></div>';
  o.face = el.querySelector('.ln-face');
  const pic = el.querySelector('.ln-pic');
  const letter = condLetter(condOf(o));
  el.querySelector('.ln-cond .l').textContent = letter;
  el.querySelector('.ln-cond .w').textContent = COND_WORD[letter] || condOf(o);
  if (!letter || letter === 'svc') el.querySelector('.ln-cond').hidden = true;   // every service is a service
  el.querySelector('.ln-cap .d').textContent = siteOf(o);
  if (o.shelf) el.classList.add('ln-shelfo');
  if (o.extra) el.classList.add('ln-extra');
  const src = imgSrcFor(o);
  if (src) {
    // photos load when the object shows one (a plate, a bead); a pip in a dense line loads on hover
    o.src = src;
    o.pic = pic;
    if (!o.item) ensureImg(o);        // offers: applyKind() loads it once the object is shown
  } else monogram(o, pic);
  label(o);
  figs.appendChild(el);
  objs.set(key, o);
  return o;
}
function ensureImg(o) {
  if (o.img || !o.src) return;
  const el = o.el, pic = o.pic || el.querySelector('.ln-pic'), src = o.src;
  {
    const img = o.img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.onload = () => {
      // a cut-out of a thumbnail is a grey blob: below CUT_MIN_PX on the long side show the photo as it is
      const raw = o.item && o.item.offer && o.item.offer.image;
      const long = Math.max(img.naturalWidth || 0, img.naturalHeight || 0);
      if (raw && img.dataset.tried !== '1' && long && long < CUT_MIN_PX) {
        img.dataset.tried = '1'; el.classList.add('raw'); img.src = raw; return;
      }
      classify(o);
    };
    img.onerror = () => {
      const raw = o.item && o.item.offer && o.item.offer.image;
      if (raw && img.dataset.tried !== '1') { img.dataset.tried = '1'; el.classList.add('raw'); img.src = raw; }
      else monogram(o, pic);
    };
    img.src = src;
    pic.appendChild(img);
  }
}
function monogram(o, pic) {
  pic = pic || o.el.querySelector('.ln-pic');
  o.el.classList.add('mono');
  o.el.classList.remove('raw');
  const d = (siteOf(o) || '?').replace(/^www\./, '');
  const b = brands && (brands[d] || brands[domainOf(o.key)]);
  if (b && b.logo) {
    // a known shop: its logo on its own colour, not a lonely letter
    pic.style.background = b.color || '';
    pic.innerHTML = `<img class="ln-logo" alt="" src="${esc(b.logo)}" draggable="false">`;
    o.el.classList.add('logo');
    return;
  }
  // unknown seller: the domain as a wordmark (dots keep the letter)
  const wm = d.replace(/\.[a-z]{2,6}$/, '');
  pic.innerHTML = `<span class="l">${esc(d.charAt(0).toUpperCase())}</span><span class="wm${wm.length > 9 ? ' long' : ''}">${esc(wm)}</span>`;
}
// a real cutout has transparent corners; a raw photo (no cutout, or a cross-origin redirect) gets a plate
function classify(o) {
  const img = o.img;
  const before = o.vis ? `${o.vis.t}|${o.vis.l}|${o.vis.r}` : '';
  try {
    const n = 32, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, n, n);
    const d = x.getImageData(0, 0, n, n).data;
    let clear = 0, t = n, l = n, r = -1;
    for (let p = 0; p < n * n; p++) {
      if (d[p * 4 + 3] < 24) { clear++; continue; }
      const px = p % n, py = (p / n) | 0;
      if (py < t) t = py; if (px < l) l = px; if (px > r) r = px;
    }
    const raw = clear / (n * n) < 0.06;
    o.el.classList.toggle('raw', raw);
    // where the object really is inside its box: a landscape camera in a square box leaves air on top,
    // and its caption must sit on the camera, not on the air
    o.ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    o.vis = raw || r < 0 ? null : { t: t / n, l: l / n, r: (r + 1) / n };
  } catch { o.el.classList.add('raw'); o.vis = null; }
  const after = o.vis ? `${o.vis.t}|${o.vis.l}|${o.vis.r}` : '';
  if (after !== before && o.kind === 'full' && phase === 'hunt' && !vertical) {
    if (turning) scheduleRelayout(); else queueLayout(T_DROP);
  }
}
// the face box of a full object, and what is visible inside it (px above the face bottom, width, centre shift)
function faceH(o) {
  if (o.shelf) return 86;
  if (o.extra) return 96;
  if (isLate(o)) return 64;
  return o.el.classList.contains('mono') ? 76 : 104;
}
function visBox(o, fh = faceH(o)) {
  const v = o.vis;
  if (!v || o.el.classList.contains('raw') || o.el.classList.contains('mono')) return { h: fh, w: fh, dx: 0 };
  const ar = o.ar || 1;
  const iw = fh * Math.min(1, ar), ih = fh * Math.min(1, 1 / ar);
  return { h: Math.max(16, ih * (1 - v.t)), w: Math.max(16, iw * (v.r - v.l)), dx: iw * ((v.l + v.r) / 2 - 0.5) };
}
let measureCtx = null;
function textW(text, font) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
function capWidth(o) {
  const txt = o.el.querySelector('.ln-cap .p').textContent;
  const isWin = turned && o.key === winner;
  const withSite = (turned ? o.key === winner : o.key === S.leader) || o.el.classList.contains('mono') || o.key === cheapKey;
  let w = textW(txt, `${isWin ? 500 : 400} ${isWin ? 13 : 12}px "JetBrains Mono", ui-monospace, monospace`);
  if (withSite) w += 6 + textW(siteOf(o), '400 12px "Inter Tight", system-ui, sans-serif');
  return w + 6;
}
function label(o) {
  const v = valOf(o);
  const isCheap = turned && vmode === 'true' && o.key === cheapKey && !vertical;
  o.el.classList.toggle('cheapest', isCheap);
  o.el.querySelector('.ln-cap .p').textContent = isCheap ? `${eur(tagOf(o), { dp: 0 })} tag → ${fmtVal(v, vmode, o)}` : fmtVal(v, vmode, o);
  o.el.querySelector('.ln-val').textContent = v == null ? '' : eur(v, { dp: v < 100 && Math.abs(v % 1) > 0.004 ? 2 : 0 });
  const x = o.el.querySelector('.ln-cap .x');
  if (o.shelf) x.textContent = vertical ? (COND_WORD[condLetter(condOf(o))] || '') : '';
  else if (vertical && !o.extra) {
    // phones: no badge, the condition is a word in the caption ("tori.fi · used · tag €825")
    const cw = COND_WORD[condLetter(condOf(o))] || '';
    const hourly = o.item && o.item.offer && o.item.offer.unit === 'hour';
    const tag = turned && vmode === 'true' && o.item && tagOf(o) != null ? (hourly ? fmtVal(tagOf(o), 'tag', o) + ' listed' : 'tag ' + eur(tagOf(o), { dp: 0 })) : '';
    // a late row says so in a word: in a live hunt most rows come after the first answer
    // the shop's trust mark, short, right after the condition ("used · ★ 4.1 solid · tag €229")
    const tm0 = o.item ? trustMark(o.item) : null;
    const tm = tm0 && tm0.state !== 'none' ? tm0 : null;   // "no reviews" is noise on a phone row (the receipt says it)
    x.textContent = cw === 'service' ? '' : cw;
    if (tm) {
      const t = document.createElement('span');
      t.className = 'tmark'; t.textContent = tm.short || tm.text; t.dataset.state = tm.state; t.dataset.label = tm.label;
      if (x.textContent) x.append(' · ');
      x.append(t);
    }
    const rest = [tag, isLate(o) ? 'late' : ''].filter(Boolean).join(' · ');
    if (rest) x.append((x.textContent ? ' · ' : '') + rest);
  }
  else x.textContent = '';
  // where it ships from: a 14 px flag on the plate (dots show it when they grow), before the domain on phones
  const fh = o.item && !o.extra ? flagHtml(o.item) : '';
  if (o.flagK !== fh) {
    o.flagK = fh;
    o.el.querySelector('.ln-flag').innerHTML = fh;
    o.el.querySelector('.ln-cap .f').innerHTML = fh;
  }
  const org = o.item && !o.extra ? originFor(o.item) : null;
  const from = org && org.country_code ? `from ${org.country_name || countryName(org.country_code)}${org.confident === false ? ' (a guess)' : ''}` : '';
  const cond = COND_WORD[condLetter(condOf(o))] || condOf(o);
  const bits = o.shelf
    ? [eur(tagOf(o), { dp: 0 }), siteOf(o), cond, 'try: ' + (o.shelf.query_en || o.shelf.query || '')]
    : [fmtVal(v, vmode, o), cond, siteOf(o), from, isLate(o) ? 'arrived late' : '',
       (o.item && trustMark(o.item) || {}).text || ''];
  o.el.setAttribute('aria-label', bits.filter(Boolean).join(', '));
  o.el.title = o.shelf ? bits.slice(0, 3).filter(Boolean).join(' · ') : '';
}

function addItem(it, { instant = false } = {}) {
  if (!it || !it.url || objs.has(it.url)) return;
  const o = makeObj(it.url, { item: it });
  o.el.style.opacity = '0';
  const my = gen;
  const now = performance.now();
  const at = Math.max(now, dripAt);
  dripAt = at + T_DRIP;
  const go = () => {
    if (my !== gen || !objs.has(o.key)) return;
    o.el.style.opacity = '';
    if (turned && (isSetAside(it) || trueOf(o) == null)) {
      if (it.tc && isSetAside(it)) toTray(o, { instant: true });
      else o.pending = true;   // waits for its truecost
      relabelAll();
      return;
    }
    o.placed = true;
    o.fly = !instant;
    if (!instant) o.flyFrom = readTake(it);
    queueLayout(instant ? 0 : T_DROP);
  };
  if (instant || at - now < 4) go(); else setTimeout(go, at - now);
}

// ---------- layout ----------
let layoutQueued = 0;
function queueLayout(dur) {
  if (layoutQueued) return;
  layoutQueued = requestAnimationFrame(() => { layoutQueued = 0; layout({ dur }); });
}
// an extra that stands for a real offer (the finale's shop playing the pick) takes that offer's place,
// but only where it is shown: in the true view (no true cost for the extra) the real offer comes back
function stoodIn() { const s = new Set(); for (const o of objs.values()) if (o.extra && o.extra.stands && valOf(o) != null) s.add(o.extra.stands); return s; }
function visible() { const st = stoodIn(); return [...objs.values()].filter(o => o.placed && !o.tray && valOf(o) != null && !st.has(o.key)); }

function chooseFull(list) {
  if (phase === 'start') { list.forEach(o => { o.kind = 'full'; }); return; }
  const want = [];
  const add = o => { if (o && !want.includes(o) && want.length < FULL_MAX) want.push(o); };
  const notLate = list.filter(o => !isLate(o));
  add(list.find(o => o.extra));
  if (turned) add(objs.get(winner));
  add(objs.get(S.leader));
  const sus = suspects(list);
  const byTag = notLate.filter(o => tagOf(o) != null && !o.extra && !sus.has(o)).sort((a, b) => tagOf(a) - tagOf(b));
  add(byTag.find(o => !(o.item && o.item.tc && isSetAside(o.item))));
  const best = {};
  notLate.filter(o => !o.extra && !sus.has(o)).sort((a, b) => valOf(a) - valOf(b)).forEach(o => {
    const c = condLetter(condOf(o)) || '?';
    if (!best[c]) best[c] = o;
  });
  Object.values(best).sort((a, b) => valOf(a) - valOf(b)).forEach(add);
  // services have no photos: give the cheapest few a labelled plate
  if (unitJob()) notLate.filter(o => !o.extra).sort((a, b) => valOf(a) - valOf(b)).forEach(add);
  list.forEach(o => { o.kind = want.includes(o) ? 'full' : 'dot'; });
}
// Offers that will tip into "not counted" at the Turn: set aside once costed; before that, a tag far
// under everyone else's (under 45% of the median). They stay small dots until the Turn says why.
function suspects(list) {
  const s = new Set();
  if (unitJob()) return s;
  const tags = list.filter(o => o.item && !o.extra).map(tagOf).filter(v => v != null).sort((a, b) => a - b);
  const med = tags.length >= 4 ? tags[Math.floor(tags.length / 2)] : null;
  for (const o of list) {
    if (!o.item || o.extra || o.key === S.leader) continue;
    if (o.item.tc) { if (isSetAside(o.item)) s.add(o); continue; }
    const t = tagOf(o);
    if (med != null && t != null && t < 0.45 * med) s.add(o);
  }
  return s;
}
function assignLevels(list) {
  // full cutouts stand on the line, rising 1 or 2 tiers when within 64 px, then become dots;
  // dots are beads on the line and stack upward in their own column
  if (phase === 'start') {
    // the shelf never stacks: an object that would crowd its neighbour sits this one out
    const keep = [];
    const order = list.slice().sort((a, b) => (b.shelf.recording ? 1 : 0) - (a.shelf.recording ? 1 : 0) || a.idx - b.idx);
    for (const o of order) {
      const crowd = !vertical && (o.shelfOff || keep.some(k => Math.abs(k.x - o.x) < SHELF_GAP - 12));
      o.el.classList.toggle('ln-off', crowd);
      if (!crowd) keep.push(o);
    }
    return;
  }
  // Full cutouts, most important first, each at the lowest height where its visible body, its caption
  // (which sits right on top of it) and, when raised, its stem down to its price clear everything placed.
  // Boxes are in px above the axis. No room under the ceiling: it becomes a dot.
  const fulls = list.filter(o => o.kind === 'full').sort((a, b) => prio(a) - prio(b));
  const boxes = [];
  const hits = (b, kinds) => boxes.some(p => kinds.includes(p.k) && b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  const ceil = AX_MAX - 10;
  // the finale's shop object owns its spot: a neighbour standing on top of it would hide its price
  const ex = fulls.find(o => o.extra);
  for (const o of fulls) {
    o.top = 0;
    if (ex && o !== ex && Math.abs(o.x - ex.x) < TIER) { o.kind = 'dot'; continue; }
    const fh = faceH(o), v = visBox(o, fh);
    const isWin = turned && o.key === winner;
    const capOff = isWin ? 22 : 6, cw = capWidth(o);
    // only the story's objects (the finale's shop, the pick, the leader, the cheap tag) may rise off the
    // line; anything else that has no room standing on it becomes a bead, so nothing floats on a stick
    // after the night shift only the pick (and the shop playing it) may: no tall stem beside the ring
    const mayRise = prio(o) < (S.phase === 'finale' ? 2 : 3);
    const cands = mayRise ? [...new Set([0, ...boxes.filter(p => p.k !== 'stem').map(p => Math.ceil(p.y1 + 4))])].sort((a, b) => a - b) : [0];
    // a wide caption may slide sideways (flush with the body's left or right edge) before the object rises
    const bx0 = o.x + v.dx - v.w / 2, bx1 = o.x + v.dx + v.w / 2;
    const clampX = d => Math.max(6 + cw / 2, Math.min(W - 6 - cw / 2, o.x + d)) - o.x;
    const shifts = [...new Set([0, cw > v.w ? bx0 + cw / 2 - o.x : 0, cw > v.w ? bx1 - cw / 2 - o.x : 0].map(d => Math.round(clampX(d))))];
    let ok = null;
    for (const L of cands) {
      const body = { k: 'body', x0: bx0, x1: bx1, y0: L, y1: L + v.h };
      const ring = isWin ? { k: 'ring', x0: o.x - (fh + 56) / 2, x1: o.x + (fh + 56) / 2, y0: L - 16, y1: L + v.h + 24 } : null;
      const stem = L > 0 ? { k: 'stem', x0: o.x - 2, x1: o.x + 2, y0: 0, y1: L } : null;
      if (L + v.h + capOff + 16 > ceil) break;
      if (hits(body, ['body', 'cap', 'ring'])) continue;
      if (ring && hits(ring, ['body', 'cap'])) continue;
      let cap = null, sh = 0;
      for (const d of shifts) {
        const c = { k: 'cap', x0: o.x + d - cw / 2, x1: o.x + d + cw / 2, y0: L + v.h + capOff, y1: L + v.h + capOff + 16 };
        if (hits(c, ['body', 'cap', 'ring', 'stem'])) continue;
        cap = c; sh = d; break;
      }
      if (!cap) continue;
      if (stem && hits(stem, ['cap'])) continue;
      ok = [L, sh, body, cap, ring, stem];
      break;
    }
    if (!ok) { o.kind = 'dot'; o.capx = 0; continue; }
    const [L, sh, ...bs] = ok;
    bs.forEach(b => b && boxes.push(b));
    o.lvl = L; o.top = bs[1].y1; o.capx = sh;
    o.capdrop = fh - v.h;
  }
  // dots are beads on the line and stack upward in their own column, never over a caption
  let dots = list.filter(o => o.kind === 'dot').sort((a, b) => a.x - b.x);
  if (dense) {
    // a dense line: the cheapest few stay photo beads, the rest are pips stacked per 7 px column
    // photo beads spread along the line: the cheapest dot in each 90 px stretch, clear of the plates
    const beads = new Set(), seg = new Map();
    const nearPlate = o => list.some(p => p.kind === 'full' && Math.abs(p.x - o.x) < 64);
    for (const o of dots.slice().sort((a, b) => valOf(a) - valOf(b))) {
      if (beads.size >= BEADS_DENSE || nearPlate(o)) continue;
      const k = Math.floor(o.x / 90);
      if (seg.has(k)) continue;
      seg.set(k, o); beads.add(o);
    }
    const bins = new Map();
    for (const o of dots) {
      const pip = !beads.has(o);
      o.el.classList.toggle('pip', pip);
      if (!pip) continue;
      o.el.classList.toggle('unsure-pip', !!(o.item && o.item.tc && isUnsure(o.item)));
      const b = Math.round(o.x / PIP);
      const k = bins.get(b) || 0;
      bins.set(b, k + 1);
      o.el.classList.remove('tuck');
      o.lvl = Math.min(k, PIP_MAX - 1) * PIP; o.top = o.lvl + 6; o.capdrop = 0; o.capx = 0;
    }
    dots = dots.filter(o => beads.has(o));
  } else for (const o of dots) o.el.classList.remove('pip');
  const cols = [];
  for (const o of dots) {
    let k = 0;
    // a stacked bead keeps clear of captions and of the cutouts' bodies and rings; with no clear
    // height under the ceiling it stays a bead on the axis, tucked behind its neighbour
    const busy = k => cols.some(c => c.k === k && Math.abs(c.x - o.x) < BEAD - 2) ||
      (k > 0 && hits({ x0: o.x - 14, x1: o.x + 14, y0: k * BEAD - 14, y1: k * BEAD + 14 }, ['cap', 'body', 'ring']));
    while (busy(k) && k < 7) k++;
    // the true view stays calm: at most two beads stacked; the rest tuck in on the axis
    if (busy(k) || k > (vmode === 'true' ? 1 : 3)) k = 0;
    o.el.classList.toggle('tuck', k === 0 && cols.some(c => c.k === 0 && Math.abs(c.x - o.x) < BEAD - 2));
    cols.push({ x: o.x, k }); o.lvl = k * BEAD; o.top = o.lvl + 14; o.capdrop = 0; o.capx = 0;
  }
}
function prio(o) {
  if (o.extra) return 0;
  if (o.key === winner) return 1;
  if (o.key === S.leader) return 2;
  if (o.key === cheapKey) return 2.5;
  return 3 + (valOf(o) || 0) / 1e6;
}

function layout({ dur = T_DROP, stagger = 0, order = null } = {}) {
  if (!root) return;
  let list = visible();
  // the finale's close-up: only what stands near your price, so a €40 move is a long glide
  const focusing = focusDom && vmode === 'tag' && phase === 'hunt' && !vertical;
  if (focusing) list = list.filter(o => { const v = valOf(o); return v >= focusDom[0] && v <= focusDom[1]; });
  // anything not on the line right now (pending a true cost, an extra in the true view) is hidden
  for (const o of objs.values()) if (!o.tray) o.el.classList.toggle('ln-gone', !list.includes(o) && !o.pending);
  const rm = reduced();
  cheapKey = findCheap(list);
  if (vertical) return layoutVertical({ dur, stagger, list, rm });
  moreBtn.hidden = true;
  for (const o of objs.values()) if (o.el.classList.contains('ln-gone') && list.includes(o)) o.el.classList.remove('ln-gone');
  const vals = list.map(o => valOf(o));
  const extraVals = notchEur != null && vmode === 'tag' ? [notchEur] : [];
  scale = phase === 'start' ? (vals.length ? logScale(vals) : logScale([10, 10000]))
        : focusing ? linScale(focusDom) : linScale(vals.concat(extraVals), vmode === 'true');
  list.forEach(o => { o.x = sx(scale, valOf(o)); o.lvl = 0; });
  dense = phase === 'hunt' && list.length > DENSE;
  root.classList.toggle('ln-dense', dense);
  if (phase === 'start') spreadShelf(list);
  chooseFull(list);
  list.forEach(label);
  assignLevels(list);
  fitStage(list);
  const seq = order || list.slice().sort((a, b) => a.x - b.x);
  // read every in-flight position first (one style pass), then write: no read/write thrash per object
  for (const o of seq) o.from0 = anims(o).length ? getComputedStyle(o.el).transform : undefined;
  const t0 = turnBusyUntil;
  seq.forEach((o, i) => {
    const to = `translate(${o.x.toFixed(1)}px, ${AX}px)`;
    applyKind(o);
    o.el.classList.toggle('late', isLate(o));
    o.el.classList.toggle('late-lab', isLate(o) && lateRoom(o, list));
    o.el.style.setProperty('--lvl', o.lvl);
    o.el.style.setProperty('--capdrop', (o.kind === 'full' && phase === 'hunt' ? (o.capdrop || 0) : 0).toFixed(1) + 'px');
    o.el.style.setProperty('--capx', (o.kind === 'full' && phase === 'hunt' ? (o.capx || 0) : 0) + 'px');
    o.el.classList.toggle('raised', o.kind === 'full' && o.lvl > 0);
    if (o.fly && !rm) { flyIn(o, to); o.fly = false; return; }
    o.fly = false; o.flyFrom = null;
    move(o, to, rm ? 0 : dur, stagger * i);
  });
  placeCaps(list);
  readPlace();
  drawAxis();
  drawGhosts(false);
  drawBand();
  drawNotch();
  markLeader();
  applyLit();
  syncTabStop();
  emit('line:layout', {});
  void t0;
}
// the small "late" word above a bead only where nothing else stands within reach of it
function lateRoom(o, list) {
  if (o.kind === 'full') return false;
  return !list.some(p => p !== o && Math.abs(p.x - o.x) < (p.kind === 'full' ? 70 : 34));
}
// The stage is as tall as what stands on it (plus room for its labels), never a fixed 340 px band.
// During a hunt it only grows, so objects do not bob up and down as offers arrive.
function fitStage(list) {
  let top = 0;
  for (const o of list) {
    if (phase === 'hunt' && o.top) { top = Math.max(top, o.top); continue; }
    const fh = o.kind !== 'full' ? 28 : faceH(o);
    const cap = o.kind !== 'full' ? 8 : (turned && o.key === winner) ? 44 : 26;
    top = Math.max(top, o.lvl + fh + cap);
  }
  const need = Math.max(S.phase === 'finale' && !vertical ? 112 : AX_MIN, Math.min(AX_MAX, Math.ceil(top + 12)));
  // the night shift wants band, line, tag and receipt on one screen: there the stage may shrink to fit
  const snug = phase === 'start' || S.phase === 'finale';
  AX = snug ? need : Math.max(axFloor, need);
  if (!snug) axFloor = AX;
  stage.style.height = (AX + AXB) + 'px';
}
function findCheap(list) {
  if (!turned) return null;
  const w = objs.get(winner);
  const cands = list.filter(o => o.item && !o.extra && tagOf(o) != null && trueOf(o) != null);
  if (!w || !cands.length || unitJob()) return null;
  // the lowest tag jumps right once shipping and import VAT are on it: that is the Turn's story
  const c = cands.reduce((a, b) => tagOf(b) < tagOf(a) ? b : a);
  return c.key !== w.key && (trueOf(c) - tagOf(c) > 0.5 || shipsUnconfirmed(c.item)) ? c.key : null;
}

// captions: assignLevels already put every caption right on its own figure, clear of the others
function placeCaps(list) {
  for (const o of list) { o.el.classList.remove('nocap', 'capside'); }
}
function applyKind(o) {
  o.el.classList.toggle('full', o.kind === 'full');
  o.el.classList.toggle('dot', o.kind !== 'full');
  if (o.kind === 'full') o.el.classList.remove('pip');
  if (!o.img && o.src && !o.el.classList.contains('pip')) ensureImg(o);
  if (o.el.tabIndex !== 0) o.el.tabIndex = -1;
}
// Each object keeps its own animations: element.getAnimations() forces a style pass per call, and with
// hundreds of offers on the line that was most of the main thread (16 s of a 24 s hunt).
function oAnim(o, kf, opts) {
  const a = o.el.animate(kf, opts);
  (o.anims || (o.anims = [])).push(a);
  return a;
}
function anims(o) {
  if (!o.anims || !o.anims.length) return [];
  o.anims = o.anims.filter(a => {
    const st = a.playState;
    if (st === 'running' || st === 'pending' || st === 'paused') return true;
    if (st !== 'finished') return false;
    const f = a.effect && a.effect.getTiming ? a.effect.getTiming().fill : 'none';
    return f === 'forwards' || f === 'both';
  });
  return o.anims;
}
function move(o, to, dur, delay = 0) {
  const busy = anims(o).length > 0;
  const pre = o.from0; o.from0 = undefined;
  if (o.cur === to && !busy) return;
  // where it stands mid-glide: read before any write (layout() reads them all in one pass)
  const from = busy ? (pre !== undefined ? pre : getComputedStyle(o.el).transform) : o.cur;
  anims(o).forEach(a => a.cancel());
  o.el.style.transform = to;
  o.cur = to;
  if (dur > 0 && from && from !== 'none' && from !== to) {
    oAnim(o, [{ transform: from }, { transform: to }], { duration: dur, delay, easing: EASE, fill: 'backwards' });
  }
}
function flyIn(o, to) {
  const sr = stage.getBoundingClientRect();
  let src = null;
  const tk = document.getElementById('ticker');
  if (o.flyFrom) {
    // the page's reading dot glides to its price and becomes the object
    const f = o.flyFrom; o.flyFrom = null;
    const s0 = o.kind === 'full' ? Math.max(0.06, 8 / faceH(o)) : 0.3;
    anims(o).forEach(a => a.cancel());
    o.el.style.transform = to; o.cur = to;
    oAnim(o, [
      { transform: `translate(${f.x}px, ${f.y}px) scale(${s0})`, opacity: 1 },
      { transform: `translate(${o.x}px, ${AX}px) scale(${Math.min(1, s0 * 3)})`, opacity: 1, offset: 0.62 },
      { transform: to, opacity: 1 },
    ], { duration: T_DROP + 150, easing: EASE, fill: 'backwards' });
    return;
  }
  if (tk && !tk.hidden && tk.offsetParent !== null) {
    const dom = siteOf(o);
    const hit = [...tk.querySelectorAll('*')].reverse().find(e => e.children.length === 0 && dom && e.textContent.includes(dom));
    const r = (hit || tk).getBoundingClientRect();
    if (r.width) src = { x: (hit ? r.left + r.width / 2 : r.left + 60) - sr.left, y: r.top + r.height / 2 - sr.top };
  }
  if (!src) src = { x: o.x, y: AX - 160 };
  anims(o).forEach(a => a.cancel());
  o.el.style.transform = to; o.cur = to;
  oAnim(o, [
    { transform: `translate(${src.x}px, ${src.y}px) scale(.3)`, opacity: 0 },
    { transform: `translate(${o.x}px, ${AX - 24}px) scale(1)`, opacity: 1, offset: 0.72 },
    { transform: to, opacity: 1 },
  ], { duration: T_DROP, easing: EASE, fill: 'backwards' });
}

let listH = 0;
// vertical (phones): ruler down the left, cheapest on top, full rows 76 px, dot rows 44 px
function layoutVertical({ dur, stagger, list, rm }) {
  // all in, the phone's list reads like the ledger: offers you can surely buy first (the pick on top),
  // then the cheaper-maybe ones whose shipping to Finland is not confirmed
  const un = o => (turned && vmode === 'true' && o.item && o.item.tc && isUnsure(o.item)) ? 1 : 0;
  list.sort((a, b) => un(a) - un(b) || valOf(a) - valOf(b));
  // a phone shows the cheapest 8; the rest wait behind "+N dearer" (hundreds: the full list below has them)
  dense = false; root.classList.remove('ln-dense');
  const cut = phase === 'hunt' && (!expanded || list.length > DENSE) && list.length > 10 ? 8 : list.length;
  const hidden = list.splice(cut);
  hidden.forEach(o => o.el.classList.add('ln-gone'));
  moreBtn.hidden = !hidden.length;
  moreBtn.dataset.to = hidden.length + cut > DENSE ? 'ledger' : '';
  if (hidden.length) moreBtn.textContent = moreBtn.dataset.to ? `all ${S.offers.size} listings ↓` : `+${hidden.length} dearer`;
  chooseFull(list);
  let y = 8;
  list.forEach((o, i) => {
    o.lvl = 0;
    applyKind(o);
    o.el.classList.toggle('late', isLate(o));
    o.el.classList.remove('late-lab');
    o.el.style.setProperty('--lvl', 0);
    o.y = y;
    const to = `translate(0px, ${y}px)`;
    label(o);
    if (o.fly && !rm) {
      anims(o).forEach(a => a.cancel());
      o.el.style.transform = to; o.cur = to;
      const f = o.flyFrom; o.flyFrom = null;
      if (f) {
        // glide up from the reading dot under the list: animate the face, the row is already in place
        const fl = o.face.offsetLeft, fw = o.face.offsetWidth || 32, fh = o.face.offsetHeight || 32, s0 = Math.max(0.12, 8 / fw);
        o.face.animate([{ transform: `translate(${f.x - fl - s0 * fw / 2}px, ${f.y - y - fh / 2}px) scale(${s0})` }, { transform: 'none' }],
          { duration: T_DROP + 100, easing: EASE });
      } else {
        oAnim(o, [{ transform: `translate(0px, ${y - 24}px)`, opacity: 0 }, { transform: to, opacity: 1 }],
          { duration: T_DROP, easing: EASE, fill: 'backwards' });
      }
    } else move(o, to, rm ? 0 : dur, stagger * i);
    o.fly = false; o.flyFrom = null;
    y += o.kind === 'full' ? 76 : 44;
  });
  listH = y + 8;
  const rdH = reading.size ? 30 : 0;
  stage.style.height = Math.max(phase === 'start' ? 120 : 80, y + 8 + rdH) + 'px';
  scale = null;
  readPlace();
  drawAxis(y + 8 + (rdH ? 18 : 0));
  gGhost.textContent = ''; gBand.textContent = '';
  drawNotch();
  markLeader();
  applyLit();
  syncTabStop();
  emit('line:layout', {});
}

// ---------- axis, ticks, labels ----------
function drawAxis(vh) {
  gAxis.textContent = '';
  gTicks.textContent = '';
  if (vertical) {
    svgEl('line', { x1: 58, x2: 58, y1: 0, y2: vh || 80, class: 'ln-rule' }, gAxis);
    return;
  }
  const x0 = 12, x1 = W - 12;
  svgEl('line', { x1: x0, x2: x1, y1: AX, y2: AX, class: 'ln-rule' }, gAxis);
  if (phase === 'hunt') {
    const d = svgEl('text', { x: x1, y: AX + 17, class: 'ln-dearer-t', 'text-anchor': 'end' }, gAxis);
    d.textContent = 'dearer →';
  }
  if (!scale) return;
  scale.ticks.forEach((t, i) => {
    const x = sx(scale, t);
    if (x < x0 + 4 || x > x1 - 4) return;
    svgEl('line', { x1: x, x2: x, y1: AX, y2: AX + 6, class: 'ln-tk' }, gTicks);
    const tx = svgEl('text', { x, y: AX + 30, class: 'ln-tl', 'text-anchor': 'middle' }, gTicks);
    tx.textContent = tickLabel(t, i);
  });
}
function axisText() {
  if (phase === 'start') return 'your results land on this line · cheaper ← → dearer';
  if (!turned) return vmode === 'true' ? '' : 'tags for now, as the shops list them · all in once each offer is costed';
  if (vmode === 'true') return unitJob() ? 'For the whole job, every fee in' : 'You pay, all in: tag + shipping + import VAT + fees';
  return unitJob() ? 'As the shops list it' : 'On the tag, before shipping and import VAT';
}
function syncSwitch() {
  if (!sw) return;
  sw.hidden = !turned || phase !== 'hunt';
  root.classList.toggle('ln-hasswitch', !sw.hidden);
  // one wording for products and services: the true view is always "What you actually pay";
  // for a service that is the whole job (rate x hours + call-out), and the tag view is the listed rate
  const job = unitJob();
  for (const b of sw.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.m === vmode));
    b.disabled = swLocked;
    const label = b.dataset.m === 'true' ? 'What you actually pay' : (job ? 'Rate as listed' : 'Price on the tag');
    if (b.textContent !== label) b.textContent = label;
    b.title = b.dataset.m === 'true'
      ? (job ? 'the whole job: rate x hours, call-out fees in' : 'tag + shipping + import VAT + fees')
      : (job ? 'the price per hour, m² or job as the provider lists it' : 'the price as the shop lists it');
  }
}
function setAxisLabel(instant) {
  syncSwitch();
  const text = axisText();
  axisRight.textContent = '';
  const on = axisLabA.classList.contains('on') ? axisLabA : axisLabB;
  const off = on === axisLabA ? axisLabB : axisLabA;
  if (on.textContent === text) return;
  if (instant || reduced()) { on.textContent = text; off.textContent = ''; return; }
  off.textContent = text;
  off.classList.add('on'); on.classList.remove('on');
}
function setCaption(text) {
  if (caption.dataset.t === text) return;
  caption.dataset.t = text;
  if (!text) { caption.classList.remove('on'); return; }
  caption.classList.remove('on');
  requestAnimationFrame(() => { caption.textContent = text; caption.classList.add('on'); });
}

// ---------- leader highlighter, winner ring, band, ghosts, notch ----------
function markLeader() {
  const lead = turned ? null : S.leader;
  let lo = null;
  for (const o of objs.values()) {
    const on = o.key === lead && o.placed && !o.tray;
    if (on) lo = o;
    o.el.classList.toggle('lead', on);
  }
  // the yellow highlighter swipe lives in the svg, under the axis ink, and follows the leader
  if (lo && !vertical && lo.x != null) {
    const first = !gHl.classList.contains('on');
    gHl.style.transition = first ? 'none' : '';
    gHl.style.transform = `translate(${lo.x.toFixed(1)}px, ${AX}px)`;
    if (first) void gHl.getBoundingClientRect();
    gHl.style.transition = '';
    gHl.classList.add('on');
    if (leaderShown !== lo.key && !reduced()) {
      gHlIn.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 360, easing: EASE, delay: first ? 200 : 120, fill: 'backwards' });
    }
  } else gHl.classList.remove('on');
  leaderShown = lo ? lo.key : null;
  for (const o of objs.values()) o.el.classList.toggle('win', turned && o.key === winner && o.placed && !o.tray);
}
function drawBand() {
  gBand.textContent = '';
  // the bracket is in tag euros: it only makes sense on the tag view (and never as an hourly band under jobs)
  if (vertical || !scale || vmode !== 'tag' || unitJob()) return;
  const v = S.verdict && S.verdict.verdict;
  const b = v && v.price_band;
  if (!b || b.p25 == null || b.p75 == null) return;
  // anchored to the band's own euros, not to whoever stands in it (the finale steps the pick aside)
  let x0 = sx(scale, b.p25), x1 = sx(scale, b.p75);
  if (x0 == null || x1 == null || x1 < 0 || x0 > W) return;
  if (x1 - x0 < 36) { const c = (x0 + x1) / 2; x0 = c - 18; x1 = c + 18; }
  x0 = Math.max(4, x0 - 10); x1 = Math.min(W - 4, x1 + 10);
  const y = AX + 40;
  const g = svgEl('g', { class: 'ln-bracket' }, gBand);
  svgEl('path', { d: `M${x0} ${y - 5} V${y} H${x1} V${y - 5}` }, g);
  const t = svgEl('text', { x: (x0 + x1) / 2, y: y + 14, 'text-anchor': 'middle' }, g);
  const what = b.what || b.condition || '';
  t.textContent = `typical ${what} ${eur(b.p25, { dp: 0 })}–${eur(b.p75, { dp: 0 })}`.replace(/\s+/g, ' ');
}
// The arcs show the slide while it happens. Once everything has landed they fade, and only the pick's
// and the cheap tag's arc (with their ghost dots) stay as a quiet trace of the Turn.
let ghostsSettled = false, ghostTimer = 0;
function settleGhosts(delay) {
  clearTimeout(ghostTimer);
  const my = gen;
  ghostTimer = setTimeout(() => {
    if (my !== gen) return;
    ghostsSettled = true;
    for (const e of gGhost.querySelectorAll(':scope > :not(.keep)')) {
      if (reduced()) { e.classList.add('gone'); continue; }
      const op = getComputedStyle(e).opacity;
      e.animate([{ opacity: op }, { opacity: 0 }], { duration: 700, easing: 'linear' }).finished.then(() => e.classList.add('gone'), () => {});
      e.classList.add('gone');
    }
  }, Math.max(0, delay));
}
function drawGhosts(animate) {
  gGhost.textContent = '';
  if (!turned || vertical || !ghostDomain || vmode !== 'true') return;
  const gs = { ...ghostDomain, ...(() => { const [r0, r1] = range(); return { r0, r1 }; })() };
  const rm = reduced();
  if (animate) ghostsSettled = false;
  for (const o of objs.values()) {
    if (o.ghost == null || o.tray || !o.placed) continue;
    const gx = sx(gs, o.ghost), x = o.x;
    if (gx == null || x == null) continue;
    const keep = o.key === winner || o.key === cheapKey;
    const cls = keep ? ' keep' : ghostsSettled ? ' gone' : '';
    svgEl('circle', { cx: gx, cy: AX, r: 3.2, class: 'ln-gdot' + cls }, gGhost);
    if (Math.abs(gx - x) < 6) continue;
    // low and flat: an arc passes behind the cutouts, under their captions, never through the words
    const h = Math.min(46, 10 + Math.abs(gx - x) * 0.12);
    const p = svgEl('path', { d: `M${gx} ${AX - 4} Q${(gx + x) / 2} ${AX - 4 - h * 2} ${x} ${AX - 4}`, class: 'ln-arc' + cls, pathLength: 1 }, gGhost);
    if (animate && !rm) {
      p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1';
      p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: T_TURN, delay: o.turnDelay || 0, easing: EASE, fill: 'forwards' });
    }
  }
}
function drawNotch() {
  gNotch.textContent = '';
  if (notchEur == null || vertical || !scale) return;
  let x, text;
  if (vmode === 'tag') { x = sx(scale, notchEur); text = `${eur(notchEur, { dp: 0 })} would win`; }
  else {
    const w = objs.get(winner) || objs.get(S.leader);
    if (!w) return;
    x = w.x - 2; text = `at ${eur(notchEur, { dp: 0 })} it would win`;
  }
  if (x == null) return;
  svgEl('line', { x1: x, x2: x, y1: AX - 46, y2: AX + 6, class: 'ln-notchl' }, gNotch);
  const t = svgEl('text', { x: x + 6, y: AX - 38, class: 'ln-notcht' }, gNotch);
  t.textContent = text;
}

// ---------- stream events ----------
function onRank(d) {
  if (phase !== 'hunt') return;
  if (d && d.reason && !turned) setCaption(String(d.reason).replace(/\s*€[\d.,]+\/(mo|job)\s*/g, ' ').replace(/takes the lead/, 'took the lead').replace(/\s+/g, ' ').trim());
  queueLayout(T_DROP);
}
function onTruecost(it) {
  const o = objs.get(it.url);
  if (!o) return;
  if (!turned || turning) return;
  if (isSetAside(it)) { toTray(o); scheduleRelayout(); return; }
  if (o.pending && trueOf(o) != null) {
    o.pending = false; o.placed = true; o.fly = true; o.el.style.opacity = ''; o.ghost = null;
  }
  syncWinner();
  scheduleRelayout();
}
function onLate(d) {
  const o = d && objs.get(d.url);
  if (o) { label(o); if (turning) scheduleRelayout(); else queueLayout(T_DROP); }
}
// an offer that failed the final check: it leaves the line (and the tray), and the line closes up
function onRemoved(it) {
  const o = it && objs.get(it.url);
  if (!o) return;
  objs.delete(o.key);
  if (winner === o.key) winner = null;
  if (cheapKey === o.key) cheapKey = null;
  const el = o.el;
  if (reduced() || !el.isConnected) el.remove();
  else el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 220, fill: 'forwards' })
    .finished.then(() => el.remove(), () => el.remove());
  const row = tray.querySelector(`.ln-tray-i[data-key="${CSS.escape(o.key)}"]`);
  if (row) {
    row.remove();
    const list = tray.querySelector('.ln-tray-l'), head = tray.querySelector('.ln-tray-h');
    if (list && head) { head.textContent = `not counted (${list.children.length})`; syncTray(); }
  }
  if (phase === 'hunt') { if (turning) scheduleRelayout(); else queueLayout(T_DROP); }
}
function onVerdict() {
  const v = S.verdict && S.verdict.verdict;
  if (!turned || turning || !v) return;
  if (!syncWinner()) drawBand();
}
// the pick follows the costs as they land: the lowest all-in price you can surely buy
function syncWinner() {
  if (!turned || turning) return false;
  const w = pickUrl() || S.leader;
  if (w && w !== winner && objs.has(w)) { winner = w; ringWinner(); scheduleRelayout(); return true; }
  return false;
}
function scheduleRelayout() {
  clearTimeout(relayoutTimer);
  const wait = Math.max(60, turnBusyUntil - performance.now());
  relayoutTimer = setTimeout(() => layout({ dur: T_DROP }), wait);
}


// ---------- pages being read: a pulsing dot each, at the dearer end (desktop) or under the list (phone) ----------
const bareDom = d => String(d || '').toLowerCase().replace(/^www\./, '');
function readDomOf(d) { return bareDom(d.domain || domainOf(d.url)); }
function readStart(d) {
  if (phase !== 'hunt' || !readingOn) return;
  const dom = readDomOf(d);
  if (!dom) return;
  let r = reading.get(dom);
  if (!r) {
    const el = div('ln-rd', rdLayer, 'i');
    el.dataset.d = dom;
    r = { urls: new Set(), el, slot: -1, born: true };
    reading.set(dom, r);
  }
  r.urls.add(d.url || dom);
  readPack();
}
function readStop(d) {
  const dom = readDomOf(d);
  const r = reading.get(dom);
  if (!r) return;
  r.urls.delete(d.url || dom);
  if (!r.urls.size) readDrop(dom, true);
}
function readDrop(dom, fade) {
  const r = reading.get(dom);
  if (!r) return;
  reading.delete(dom);
  const el = r.el;
  if (fade && !reduced() && el.isConnected && !el.hidden) {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  } else el.remove();
  readPack();
}
// an offer landed: its domain's dot gives up its place (stage px) and goes; the object flies from there
function readTake(it) {
  const doms = [bareDom(it.offer && it.offer.source), bareDom(domainOf(it.url))].filter(Boolean);
  const dom = doms.find(d => reading.has(d));
  if (!dom) return null;
  const r = reading.get(dom);
  const at = r.pos && !r.el.hidden ? { x: r.pos.x, y: r.pos.y } : null;
  try { rdRecent.set(dom, { rect: r.el.getBoundingClientRect(), t: performance.now() }); } catch { /* detached */ }
  reading.delete(dom);
  r.el.classList.add('took');
  setTimeout(() => r.el.remove(), reduced() ? 0 : 160);
  readPack();
  return at;
}
function readEnd() {
  readingOn = false;
  for (const dom of [...reading.keys()]) readDrop(dom, true);
  if (phase === 'hunt') { if (turning) scheduleRelayout(); else queueLayout(T_DROP); }
}
function readClear() {
  for (const r of reading.values()) r.el.remove();
  reading.clear(); rdRecent.clear();
  if (rdLayer) rdLayer.textContent = '';
  readingOn = false;
}
function readPack() {
  let i = 0;
  for (const r of reading.values()) { r.slot = i < RD_MAX ? i : -1; i++; }
  const wasVert = vertical && phase === 'hunt';
  readPlace();
  // the phone list grows a row for the dots, and gives it back
  if (wasVert) queueLayout(0);
}
function readPos(slot) {
  if (vertical) {
    const per = Math.max(4, Math.floor((W - 90) / RD_STEP));
    return { x: 76 + (slot % per) * RD_STEP, y: listH + 12 + Math.floor(slot / per) * RD_STEP };
  }
  return { x: W - 18 - (slot % RD_COLS) * RD_STEP, y: AX - Math.floor(slot / RD_COLS) * RD_STEP };
}
function readPlace() {
  if (!rdLayer) return;
  for (const r of reading.values()) {
    if (r.slot < 0) { r.el.hidden = true; continue; }
    const p = readPos(r.slot);
    r.pos = p;
    r.el.hidden = false;
    r.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    if (r.born) { r.born = false; r.el.classList.add('in'); }
  }
}

// ---------- THE TURN ----------
function scheduleTurn() {
  if (turned || turning || phase !== 'hunt') return;
  turning = true;
  // the first truecost usually arrives in a burst with the rest: collect them, then move each object once
  const my = gen;
  const drain = Math.max(0, dripAt - performance.now());
  turnTimer = setTimeout(() => { if (my === gen) doTurn(); }, 260 + drain);
}
function doTurn() {
  const rm = reduced();
  const before = visible();
  // 1. remember where everything was (tag scale), freeze that domain for the ghost dots
  ghostDomain = scale ? { log: false, d0: scale.d0, d1: scale.d1 } : null;
  before.forEach(o => { o.ghost = tagOf(o); if (o.item) o.item.ghostX = o.x; });
  // 2. set-aside offers tip off the line; offers without a true cost wait
  const aside = before.filter(o => o.item && o.item.tc && isSetAside(o.item));
  aside.forEach((o, i) => toTray(o, { delay: i * 60, fast: true }));
  before.forEach(o => { if (!aside.includes(o) && trueOf(o) == null) { o.placed = false; o.pending = true; fadeOut(o); } });
  // 3. compute the true-mode scale first, then animate each object once from tag x to true x
  vmode = 'true'; S.mode = 'true';
  turned = true;
  emit('mode', { mode: 'true', turn: true });
  const v = S.verdict && S.verdict.verdict;
  void v;
  const pk = pickUrl();
  winner = pk && objs.has(pk) ? pk : S.leader;
  root.classList.add('ln-turned');
  // the axis caption under the switch says what the numbers are; no second sentence repeats it
  clearTimeout(turnCapTimer); root.classList.remove('ln-turncap'); setCaption('');
  root.classList.add('ln-turning');
  setAxisLabel(false);
  const movers = visible().slice().sort((a, b) => a.x - b.x);
  movers.forEach((o, i) => { o.turnDelay = rm ? 0 : i * T_STAG; });
  const total = rm ? 300 : T_TURN + movers.length * T_STAG;
  turnBusyUntil = performance.now() + total;
  if (rm) {
    figs.animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], { duration: 300 });
    setTimeout(() => layout({ dur: 0 }), 150);
  } else if (vertical) {
    // phones: rows sliding through each other read as a pile-up; the list dips, re-sorts, and rises row by row
    const my0 = gen;
    figs.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'linear', fill: 'forwards' }).finished.then(() => {
      if (my0 !== gen) return;
      layout({ dur: 0 });
      figs.getAnimations().forEach(a => a.cancel());
      [...objs.values()].filter(o => o.placed && !o.tray && !o.el.classList.contains('ln-gone')).sort((a, b) => a.y - b.y).forEach((o, i) => {
        o.face.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: Math.min(i, 10) * 45, easing: EASE, fill: 'backwards' });
      });
    }, () => {});
  } else {
    fadeTicks();
    layout({ dur: T_TURN, stagger: T_STAG, order: movers });
  }
  drawGhosts(true);
  const my = gen;
  setTimeout(() => {
    if (my !== gen) return;
    turning = false;
    root.classList.remove('ln-turning');
    ringWinner();
    root.dataset.lnTurned = '1';
    // truecosts that landed during the animation
    for (const o of objs.values()) {
      if (o.pending && o.item && o.item.tc) {
        if (isSetAside(o.item)) toTray(o);
        else if (trueOf(o) != null) { o.pending = false; o.placed = true; o.fly = true; o.el.style.opacity = ''; }
      }
    }
    layout({ dur: T_DROP });
    settleGhosts(rm ? 0 : 500);
    emit('line:turned', { winner });
    setTimeout(() => { if (my === gen) root.classList.add('ln-calm'); }, 2200);
  }, rm ? 320 : total);
}
function fadeTicks() {
  gTicks.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: T_TURN, easing: 'linear' });
}
function fadeOut(o) {
  if (reduced()) { o.el.style.opacity = '0'; return; }
  oAnim(o, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
}
function ringWinner() {
  for (const o of objs.values()) o.el.classList.remove('ringed');
  const w = objs.get(winner);
  markLeader();
  if (!w) return;
  // restart the draw
  void w.el.offsetWidth;
  w.el.classList.add('ringed');
}

// ---------- set aside tray ----------
function trayReason(it) {
  const flags = [].concat((it.tc && it.tc.flags) || []).map(String);
  const f = flags.find(x => /too good to be true/i.test(x));
  if (f) return 'too good to be true';
  if (flags.some(x => /price disagrees|unconfirmed|not costed/i.test(x))) return 'price unconfirmed';
  if (flags.some(x => /from-price/i.test(x))) return 'from-price only, no clear unit';
  if (flags.some(x => /unit/i.test(x))) return 'different unit';
  return (flags[0] || 'could not be costed').split(':')[0];
}
function toTray(o, { delay = 0, instant = false, fast = false } = {}) {
  if (o.tray) return;
  o.tray = true;
  const wasPlaced = o.placed;
  o.placed = false;
  const done = () => { o.el.style.visibility = 'hidden'; addTrayRow(o); };
  if (instant || reduced() || !wasPlaced) { o.el.style.opacity = '0'; done(); return; }
  const from = getComputedStyle(o.el).transform;
  anims(o).forEach(a => a.cancel());
  const m = new DOMMatrix(from === 'none' ? undefined : from);
  const tx = m.e, ty = m.f;
  // down and out, under everything else, gone before the winner glides into its place
  o.el.style.zIndex = '0';
  const cap = o.el.querySelector('.ln-cap');
  if (cap) cap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay, fill: 'forwards' });
  const a = oAnim(o, [
    { transform: `translate(${tx}px, ${ty}px) rotate(0deg)`, opacity: 1 },
    { transform: `translate(${tx + 4}px, ${ty + 14}px) rotate(8deg)`, opacity: .8, offset: 0.3 },
    { transform: `translate(${tx + 8}px, ${ty + 60}px) rotate(8deg)`, opacity: 0 },
  ], { duration: fast ? 450 : 700, delay, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
  a.finished.then(done, done);
}
// the toolbar chip says how many; the list under the toolbar opens on demand
function syncTray() {
  if (!trayChip) return;
  const list = tray.querySelector('.ln-tray-l');
  const n = list ? list.children.length : 0;
  trayChip.hidden = !n;
  if (!n) trayOpen = false;
  trayChip.textContent = `not counted (${n})`;
  trayChip.setAttribute('aria-expanded', String(trayOpen));
  trayChip.classList.toggle('open', trayOpen);
  tray.hidden = !n || !trayOpen;
}
function addTrayRow(o) {
  const it = o.item;
  let head = tray.querySelector('.ln-tray-h');
  let list = tray.querySelector('.ln-tray-l');
  if (!head) {
    head = div('ln-tray-h', tray, 'span');
    list = div('ln-tray-l', tray, 'span');
  }
  // the same listing seen twice (same shop, same price) is one row "×2"
  const sig = `${siteOf(o)}|${Math.round(tagOf(o) || 0)}|${trayReason(it)}`;
  const dup = [...list.children].find(x => x.dataset.sig === sig);
  if (dup) {
    const n = (+dup.dataset.n || 1) + 1;
    dup.dataset.n = n;
    let c = dup.querySelector('.ln-x2'); if (!c) { c = document.createElement('span'); c.className = 'ln-x2'; dup.appendChild(c); }
    c.textContent = ` ×${n}`;
    head.textContent = `not counted (${list.children.length})`;
    syncTray();
    return;
  }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ln-tray-i';
  b.dataset.key = o.key;
  b.dataset.sig = sig;
  const pic = o.img && o.img.complete && o.img.naturalWidth ? `<img alt="" src="${esc(o.img.src)}">` : '<i></i>';
  b.innerHTML = `${pic}<span>${esc(siteOf(o))} <span class="ln-q">“${esc(eur(tagOf(o), { dp: 0 }))}”</span> ${esc(trayReason(it))}</span>`;
  b.addEventListener('click', () => emit('select', o.key));
  list.appendChild(b);
  head.textContent = `not counted (${list.children.length})`;
  syncTray();
  if (!reduced()) b.animate([{ opacity: 0, transform: 'translateY(-12px) rotate(8deg)' }, { opacity: 1, transform: 'none' }], { duration: T_DROP, easing: EASE });
}
function relabelAll() { for (const o of objs.values()) label(o); }

// ---------- dim / lit (watch tag) ----------
function applyLit() {
  root.classList.toggle('ln-lit', lit != null);
  for (const o of objs.values()) {
    const t = tagOf(o);
    o.el.classList.toggle('dim', lit != null && !o.extra && t != null && t > lit);
  }
}

// ---------- input ----------
function ordered() {
  const list = [...objs.values()].filter(o => o.placed && !o.tray && o.el.style.visibility !== 'hidden' && !o.el.classList.contains('ln-gone'));
  return list.sort((a, b) => vertical ? a.y - b.y : (a.x - b.x) || (a.lvl - b.lvl));
}
function focusObj(o) {
  for (const x of objs.values()) x.el.tabIndex = -1;
  o.el.tabIndex = 0;
  o.el.focus({ preventScroll: true });
}
function onKey(e) {
  const fig = e.target.closest && e.target.closest('.ln-o');
  if (!fig) return;
  const list = ordered();
  const i = list.findIndex(o => o.el === fig);
  const fwd = e.key === 'ArrowRight' || (vertical && e.key === 'ArrowDown');
  const back = e.key === 'ArrowLeft' || (vertical && e.key === 'ArrowUp');
  if (fwd || back) {
    e.preventDefault();
    const n = list[Math.max(0, Math.min(list.length - 1, i + (fwd ? 1 : -1)))];
    if (n) focusObj(n);
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault(); const n = e.key === 'Home' ? list[0] : list[list.length - 1]; if (n) focusObj(n);
  } else if (e.key === ' ' && canSplit(objs.get(fig.dataset.key))) {
    // Space held on a full cutout in the true view: split what it really costs; Enter still opens it
    e.preventDefault();
    if (!e.repeat) showSplit(objs.get(fig.dataset.key));
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); activate(fig);
  }
}
function onKeyUp(e) { if (e.key === ' ' && split) { e.preventDefault(); endSplit(); } }
function onClick(e) {
  const fig = e.target.closest && e.target.closest('.ln-o');
  if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault(); return; }
  if (fig) activate(fig);
}

// ---------- hold to split: what you pay, taken apart on the axis (tag + shipping & import VAT) ----------
function canSplit(o, anyKind = false) {
  return !!(o && o.item && !o.extra && !o.shelf && (anyKind || o.kind === 'full') && turned && vmode === 'true' &&
    o.placed && !o.tray && num(allIn(o.item)) != null);
}
function onDown(e) {
  eatClick = false;
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const fig = e.target.closest && e.target.closest('.ln-o');
  const o = fig && objs.get(fig.dataset.key);
  if (!canSplit(o)) return;
  clearTimeout(holdT);
  hold = { o, id: e.pointerId, x: e.clientX, y: e.clientY };
  holdT = setTimeout(() => { if (hold && hold.o === o) { showSplit(o); try { fig.setPointerCapture(hold.id); } catch { /* gone */ } } }, HOLD_MS);
}
function onMove(e) {
  if (!hold || split || e.pointerId !== hold.id) return;
  if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) { clearTimeout(holdT); hold = null; }
}
function onUp(e) {
  if (hold && e.pointerId !== hold.id) return;
  clearTimeout(holdT); hold = null;
  if (split && split.by === 'hold') { eatClick = e.type === 'pointerup'; endSplit(); }
}
function splitParts(o) {
  const t = o.item.tc.true_cost;
  const job = t.per === 'job';
  const stk = num(t.sticker_eur) ?? tagOf(o) ?? 0;
  const net = num(allIn(o.item));
  const ext = net - stk;
  const fees = Math.max(0, ext), back = Math.max(0, -ext);
  const w = n => eur(n >= 100 ? Math.round(n) : n, { dp: n >= 100 || Math.abs(n % 1) < 0.005 ? 0 : 2 });
  const added = (t.receipt || []).slice(1).filter(([, v]) => v > 0.5).map(([l]) => String(l).toLowerCase());
  const what = added.some(l => /vat|dut/.test(l)) ? (added.some(l => /ship/.test(l)) ? 'shipping & import VAT' : 'import VAT')
    : added.some(l => /ship|deliver/.test(l)) ? 'shipping' : 'fees';
  const unconf = shipsUnconfirmed(o.item);
  return { stk, fees, back, net, gross: stk + fees, job,
    a: `${w(stk)} ${job ? 'price' : 'tag'}`, b: fees > 0.005 ? `+ ${w(fees)} ${what}` : '',
    c: back > 0.005 ? `− ${w(back)} VAT back` : '',
    n: job ? `= ${fmtVal(net, 'true', o)}` : `= ${w(net)} all in${unconf ? ' + shipping' : ''}` };
}
function showSplit(o, anyKind = false) {
  if (!canSplit(o, anyKind)) return;
  if (split && split.o === o) return;
  endSplit();
  const P = splitParts(o);
  if (!(P.gross > 0)) return;
  split = { o, by: hold ? 'hold' : 'key' };
  root.classList.add('ln-splitting');
  o.el.classList.add('splitting');
  gSplit.textContent = '';
  const rm = reduced();
  const font = '400 11px "JetBrains Mono", ui-monospace, monospace';
  let x0, k, yb, rows;
  if (vertical) {
    // clear of the winner's ink ring, which reaches 17 px past the photo
    const cl = o.face.offsetLeft + o.face.offsetWidth + (o.el.classList.contains('win') ? 22 : 12), cr = W - 16;
    k = (cr - cl) / P.gross; x0 = cl;
    yb = o.y + 14; rows = [o.y + 40, o.y + 53, o.y + 66];
  } else {
    // anchored so the net lands exactly under the object, on one euro scale of its own
    const ox = o.x;
    k = Math.min(300 / P.gross, P.net > 0 ? (ox - 14) / P.net : Infinity, P.back > 0 ? (W - 14 - ox) / P.back : Infinity);
    if (!isFinite(k) || k <= 0) k = 300 / P.gross;
    x0 = ox - k * P.net;
    yb = AX + 8; rows = [AX + 34, AX + 48, AX + 62];
  }
  const xa = x0, xb = x0 + k * P.stk, xc = x0 + k * P.gross, xn = x0 + k * P.net;
  const g = svgEl('g', { class: 'ln-sp' }, gSplit);
  const bar = (cls, a, b, y, h, origin, delay) => {
    if (b - a < 0.5) return null;
    const r = svgEl('rect', { class: cls, x: a.toFixed(1), y, width: (b - a).toFixed(1), height: h, rx: 1 }, g);
    if (!rm) {
      r.style.transformOrigin = `${origin === 'r' ? b : a}px ${y}px`;
      r.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 220, delay, easing: EASE, fill: 'backwards' });
    }
    return r;
  };
  // a phone gets hairlines (the same weight as THE LINE), the desktop small bars
  const bh = vertical ? 2 : 6, bg = vertical ? 5 : 9;
  bar('ln-sp-a', xa, xb, yb, bh, 'l', 0);
  bar('ln-sp-b', xb, xc, yb, bh, 'l', 160);
  bar('ln-sp-c', xn, xc, yb + bg, bh, 'r', 300);
  // where it nets out: the object's own price, marked through both bars
  svgEl('line', { class: 'ln-sp-n', x1: xn, x2: xn, y1: yb - 4, y2: yb + 19 }, g);
  // tiny mono labels, each under its own piece, pushed down a row when they would touch
  const labs = [[P.a, (xa + xb) / 2, 'm'], [P.b, (xb + xc) / 2, 'm'], [P.c, (xn + xc) / 2, 'm'], [P.n, xn, 'n']].filter(l => l[0]);
  const taken = [];
  const minX = vertical ? x0 : 12, maxX = W - 12;
  labs.forEach(([text, cx, kind], i) => {
    const t = svgEl('text', { class: 'ln-sp-t' + (kind === 'n' ? ' n' : ''), x: 0, y: rows[0] }, g);
    t.textContent = text;
    // the real rendered width (the canvas guess runs short); a label wider than the room shrinks to fit
    let w = textW(text, font);
    try { w = Math.max(w, t.getComputedTextLength() || 0); } catch { /* not laid out */ }
    const room = maxX - minX;
    if (w > room && room > 40) { t.style.fontSize = Math.max(8, 11 * room / w).toFixed(2) + 'px'; w = room; }
    // the net keeps clear air from the tick and the formula beside it
    const gap = kind === 'n' ? 10 : 0, pad = kind === 'n' ? 16 : 8;
    let lx = kind === 'n' ? cx - w - gap : cx - w / 2;
    if (kind === 'n' && lx < minX) lx = cx + gap;
    lx = Math.max(minX, Math.min(maxX - w, lx));
    let row = 0;
    while (row < rows.length - 1 && taken.some(x => x.row === row && lx < x.x1 + (x.n ? 16 : pad) && lx + w > x.x0 - (x.n ? 16 : pad))) row++;
    taken.push({ row, x0: lx, x1: lx + w, n: kind === 'n' });
    t.setAttribute('x', lx.toFixed(1)); t.setAttribute('y', rows[row]);
    if (!rm) t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 120 + i * 80, fill: 'backwards' });
  });
  srLive.textContent = [P.a, P.b, P.c, P.n].filter(Boolean).join(', ');
  if (!rm) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
}
function endSplit() {
  clearTimeout(holdT);
  if (!split) return;
  const { o } = split;
  split = null;
  o.el.classList.remove('splitting');
  root.classList.remove('ln-splitting');
  const kids = [...gSplit.children];
  if (reduced() || !kids.length) gSplit.textContent = '';
  else kids.forEach(k => k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => k.remove(), () => k.remove()));
  if (srLive) srLive.textContent = '';
}
function activate(fig) {
  const o = objs.get(fig.dataset.key);
  if (!o) return;
  if (o.shelf) return runShelf(o.shelf);
  if (o.extra) return;
  emit('select', o.key);
}
function syncTabStop() {
  const list = ordered();
  if (!list.length || list.some(o => o.el.tabIndex === 0)) return;
  const first = objs.get(turned ? winner : S.leader) || list[0];
  first.el.tabIndex = 0;
}

// ---------- public API ----------
export const line = {
  /** setMode(mode, {calm}): calm (the tour's hand-back) glides without redrawing the Turn's arcs. */
  setMode(mode, { calm = false } = {}) {
    if (mode !== 'tag' && mode !== 'true') return;
    if (mode === 'true' && !turned) return;
    if (vmode === mode) return;
    vmode = mode; S.mode = mode;
    root.classList.toggle('ln-tagview', turned && mode === 'tag');
    setAxisLabel(false);
    // a user flip is the Turn again, on demand: glide along the same arcs, a little slower than a drag
    const quiet = swLocked || calm;
    layout({ dur: quiet ? T_MODE : T_TURN * 0.7, stagger: quiet ? 0 : T_STAG / 2 });
    if (mode === 'true' && calm) root.classList.add('ln-calm');
    else if (mode === 'true' && !swLocked) {
      root.classList.remove('ln-calm');
      const my = gen;
      setTimeout(() => { if (my === gen && vmode === 'true') root.classList.add('ln-calm'); }, 2600);
    }
    if (calm) ghostsSettled = true;      // the arcs were told once: they come back already faded
    drawGhosts(mode === 'true' && !quiet);
    if (mode === 'true') settleGhosts(quiet ? 0 : T_TURN * 0.7 + visible().length * T_STAG / 2 + 400);
    emit('mode', { mode });
  },
  lockSwitch(on) { swLocked = !!on; syncSwitch(); },
  highlightBelow(v) { lit = num(v); applyLit(); },
  xFor(v) {
    if (v == null) return null;
    if (vertical) return yFor(v);
    return sx(scale, v);
  },
  eurFor(px) {
    if (px == null) return null;
    if (vertical) return eurForY(px);
    return sinv(scale, px);
  },
  axisY() { return vertical ? null : (stage.offsetTop + AX); },
  rect(url) {
    const o = objs.get(url);
    if (!o || o.tray || !o.placed) return null;
    return o.el.querySelector('.ln-pic').getBoundingClientRect();
  },
  placeExtra(id, { img, eur: e, label: lab, stands = null } = {}) {
    const key = 'extra:' + id;
    let o = objs.get(key);
    if (o) { o.extra = { img, eur: e, label: lab, stands }; }
    else { o = makeObj(key, { extra: { img, eur: e, label: lab, stands } }); o.placed = true; o.fly = true; }
    o.el.style.opacity = '';
    queueLayout(T_DROP);
    return {
      el: o.el,
      moveTo(v, { ghost = true } = {}) {
        if (ghost && !vertical && o.x != null) {
          const c = svgEl('circle', { cx: o.x, cy: AX, r: 3.2, class: 'ln-gdot ln-gdot-x' }, gGhost);
          void c;
        }
        o.extra.eur = v; layout({ dur: T_DROP });
      },
      remove() {
        const done = () => { o.el.remove(); objs.delete(key); layout({ dur: T_DROP }); };
        if (reduced()) return done();
        oAnim(o, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(done, done);
      },
    };
  },
  ghostNotch(v) { notchEur = num(v); drawNotch(); },
  /** The finale's close-up on the tag view: focus(lo, hi) in tag euros; focus(null) restores. */
  focus(lo, hi) {
    const next = lo == null || hi == null || !(hi > lo) ? null : [lo, hi];
    if (JSON.stringify(next) === JSON.stringify(focusDom)) return;
    focusDom = next;
    if (vertical) return;
    root.classList.toggle('ln-focus', !!focusDom);
    layout({ dur: reduced() ? 0 : T_TURN * 0.7 });
  },
  /** Show the hold-to-split for an offer (default: the winner) as if held; returns a closer, or null. */
  split(url = winner) {
    const o = objs.get(url);
    // asked for by name (the tour): a bead may show its split too
    if (!canSplit(o, true)) return null;
    showSplit(o, true);
    return () => { if (split && split.o === o) endSplit(); };
  },
  /** The pulsing dot of a page being read (viewport rect), or null. A dot that just became an object answers for 1 s. */
  readingDot(domain) {
    const dom = bareDom(domain);
    const r = reading.get(dom);
    if (r && !r.el.hidden && r.el.isConnected) return r.el.getBoundingClientRect();
    const rec = rdRecent.get(dom);
    return rec && performance.now() - rec.t < 1000 ? rec.rect : null;
  },
  /** true when the line is the phone's vertical list */
  isVertical() { return vertical; },
  /** viewport rect of the vertical list column (rows only); yFor(v) / eurForY(y) are px from its top. null on desktop. */
  listRect() {
    if (!vertical || !stage) return null;
    const r = stage.getBoundingClientRect();
    return new DOMRect(r.left, r.top, r.width, listH || r.height);
  },
  yFor(v) { return v == null || !vertical ? null : yFor(v); },
  /** phone: y (px from the list's top) of the seam between the rows priced ≤ v and those above v, so a
   * rule drawn there never runs through a row. null on desktop. */
  gapY(v) {
    if (v == null || !vertical) return null;
    const rows = ordered().filter(o => tagOf(o) != null || valOf(o) != null);
    if (!rows.length) return null;
    const val = o => valOf(o);
    const fh = o => o.face.offsetHeight || (o.kind === 'full' ? 64 : 32);
    let prev = null, next = null;
    for (const o of rows) { if (val(o) <= v) prev = o; else if (!next) next = o; }
    if (!prev) return Math.max(0, next.y - 4);
    if (!next) return clampY(prev.y + fh(prev) + 6);
    return clampY((prev.y + fh(prev) + next.y) / 2);
  },
  eurForY(y) { return y == null || !vertical ? null : eurForY(y); },
  pulse() {
    if (reduced()) return;
    gAxis.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], { duration: 320, easing: EASE });
    gTicks.animate([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 320 });
  },
  refresh() { relabelAll(); layout({ dur: T_DROP }); },
  get mode() { return vmode; },
  get winner() { return winner; },
};

// vertical mapping for the tag: piecewise linear over the sorted rows
function rowsVals() {
  return ordered().map(o => [valOf(o), o.y + (o.face.offsetHeight || (o.kind === 'full' ? 64 : 32)) / 2])
    .filter(r => r[0] != null).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const clampY = y => Math.max(0, Math.min(listH || y, y));
function yFor(v) {
  const y = yForRaw(v);
  return y == null ? null : clampY(y);
}
function yForRaw(v) {
  const r = rowsVals(); if (!r.length) return null;
  if (r.length === 1) return r[0][1];
  for (let i = 0; i < r.length - 1; i++) if (v <= r[i + 1][0]) {
    const [a, ya] = r[i], [b, yb] = r[i + 1];
    return b === a ? ya : ya + (Math.max(v, i === 0 ? -Infinity : a) - a) / (b - a) * (yb - ya);
  }
  const [a, ya] = r[r.length - 2], [b, yb] = r[r.length - 1];
  return yb + (v - b) / ((b - a) || 1) * (yb - ya);
}
function eurForY(y) {
  y = clampY(y);
  const r = rowsVals(); if (!r.length) return null;
  if (r.length === 1) return r[0][0];
  for (let i = 0; i < r.length - 1; i++) if (y <= r[i + 1][1]) {
    const [a, ya] = r[i], [b, yb] = r[i + 1];
    return yb === ya ? a : a + (y - ya) / (yb - ya) * (b - a);
  }
  const [a, ya] = r[r.length - 2], [b, yb] = r[r.length - 1];
  return b + (y - yb) / ((yb - ya) || 1) * (b - a);
}
