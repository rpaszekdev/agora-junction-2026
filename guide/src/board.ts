import type { Offer, SearchEvent } from "./search";
import type { Pick } from "./shop";

/**
 * The left side of the page: what the search understood (the chips), what it is doing (the log: every site as
 * Context.dev reads it) and what it found (the cards, their photos lifted off their backgrounds by the wall's /cut).
 * All of it comes from the wall's own events (../../wall.py search()), as they arrive. Whatever a site or a model
 * wrote goes in as text, never as markup.
 */

/** Photos lifted at once. The brain, her gestures and the search itself share the browser's six connections to
 * this server: more photos than this, and her answer waits behind them. */
const PHOTOS_AT_ONCE = 3;
/** How much of a page's raw text the tape shows (characters). */
const RAW_SHOWN = 150;
const IDLE = "ASK HER FOR A PRODUCT. THE SITES ARE READ LIVE.";

interface Brand {
  name?: string;
  logo?: string;
  domain?: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const num = (n: number) => Math.round(n).toLocaleString("en");
const str = (v: unknown) => (typeof v === "string" ? v : "");
const numberOf = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const cost = (o: Offer) => o.eur ?? o.price;
const offersOf = (n: number) => `${n} ${n === 1 ? "OFFER" : "OFFERS"}`;
const isHttps = (u: unknown): u is string =>
  typeof u === "string" && u.startsWith("https://");

export interface Board {
  /** One event of a search: the wall's own, or { type: "start" } when one begins. */
  event(ev: SearchEvent): void;
  /** Her picks: marked, said why, and moved to the front. */
  picks(list: Pick[]): void;
}

/** `photos` false: no photo is asked for (the canned search has none). */
export function createBoard(
  root: HTMLElement,
  o: { photos: boolean },
): Board {
  const chips = el("div", "chips");
  const log = el("div", "log sk");
  const head = el("div", "head");
  const sum = el("span", "sum");
  head.append(el("b", "", "LIVE · POWERED BY CONTEXT.DEV"), sum);
  const rows = el("ul");
  const tape = el("div", "tape");
  log.append(head, rows, tape);
  log.hidden = true;
  const count = el("div", "count", IDLE);
  const cardsEl = el("div", "cards");
  root.append(chips, log, count, cardsEl);

  let brands: Record<string, Brand> = {};
  // the sites' logos (Context.dev's Brand API, ../../brands.py): without them a site shows its initials
  fetch("/shelf/brands.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((b: Record<string, Brand>) => {
      const byDomain = Object.fromEntries(
        Object.values(b)
          .filter((x) => x.domain)
          .map((x) => [x.domain as string, x]),
      );
      brands = { ...byDomain, ...b };
    })
    .catch((e: unknown) => console.warn("[board] no site logos", e));

  let cards: { offer: Offer; node: HTMLAnchorElement; pick: boolean }[] = [];
  let siteRows: Record<string, HTMLLIElement> = {};
  let findRow: HTMLLIElement | undefined; // Context.dev's own search for pages, before the sites are read
  let read = 0;
  let chars = 0;
  let max: number | null = null; // the budget she understood (EUR), and whether it hides the dearer cards
  let maxOn = true;
  let waiting: (() => void)[] = [];
  let loading = 0;

  const pump = (): void => {
    while (loading < PHOTOS_AT_ONCE && waiting.length) {
      const [next, ...rest] = waiting;
      waiting = rest;
      loading += 1;
      next?.();
    }
  };
  const photo = (box: HTMLElement, url: string): void => {
    waiting = [
      ...waiting,
      () => {
        const img = new Image();
        img.alt = "";
        const done = () => {
          loading -= 1;
          pump();
        };
        img.onload = () => {
          box.append(img);
          done();
        };
        img.onerror = () => {
          box.hidden = true; // no photo: the card is its price and title
          done();
        };
        img.src = `/cut?u=${encodeURIComponent(url)}`;
      },
    ];
    pump();
  };

  const logo = (site: string): HTMLElement => {
    const box = el("span", "lg");
    const b = brands[site] ?? brands[site.replace(/^www\./, "")];
    const initials = () => (box.textContent = site.slice(0, 2).toUpperCase());
    if (isHttps(b?.logo)) {
      const img = new Image();
      img.alt = "";
      img.onerror = initials;
      img.src = b.logo;
      box.append(img);
    } else initials();
    return box;
  };

  const row = (name: string, state: string, lead?: HTMLElement): HTMLLIElement => {
    const li = el("li");
    li.append(lead ?? el("span", "lg", "↯"), el("b", "", name), el("span", "st", state));
    rows.append(li);
    return li;
  };
  const setRow = (li: HTMLLIElement | undefined, state: string, cls: string): void => {
    if (!li) return;
    li.className = cls;
    const st = li.querySelector(".st");
    if (st) st.textContent = state;
  };

  const apply = (): void => {
    const hides = maxOn && max !== null;
    let shown = 0;
    for (const c of cards) {
      c.node.hidden = hides && !c.pick && cost(c.offer) > (max as number);
      if (!c.node.hidden) shown += 1;
    }
    const n = cards.length;
    count.textContent = !n
      ? ""
      : hides && shown < n
        ? `${shown} OF ${offersOf(n)} AT OR UNDER ${num(max as number)} EUR${shown ? "" : ": TAP THE PRICE TO SEE ALL"}`
        : offersOf(n);
    sum.textContent = `${read}/${Object.keys(siteRows).length} SITES · ${offersOf(n)}${chars ? ` · ${num(chars)} CHARACTERS READ` : ""}`;
  };

  const chip = (text: string): HTMLSpanElement => {
    const c = el("span", "chip sk", text.toUpperCase());
    chips.append(c);
    return c;
  };
  const plan = (ev: SearchEvent): void => {
    chips.textContent = "";
    const product = str(ev["product"]) || str(ev["request"]);
    if (product) chip(product.slice(0, 60));
    const condition = str(ev["condition"]);
    if (condition && condition !== "any") chip(condition);
    max = numberOf(ev["max_price_eur"]);
    if (max !== null) {
      // the one chip that is a switch: the dearer offers are found too, and it hides them
      const b = el("button", "chip sk", `AT OR UNDER ${num(max)} EUR`);
      b.type = "button";
      b.setAttribute("aria-pressed", "true");
      b.onclick = () => {
        maxOn = !maxOn;
        b.setAttribute("aria-pressed", String(maxOn));
        apply();
      };
      chips.append(b);
    }
    const delivery = str(ev["delivery"]);
    if (delivery) chip(delivery.slice(0, 40));
  };

  const card = (offer: Offer): void => {
    const a = el("a", "card sk");
    a.href = offer.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    const box = el("div", "ph");
    if (o.photos && isHttps(offer.image)) photo(box, offer.image);
    else box.hidden = true;
    const where = [offer.site, offer.country].filter(Boolean).join(" · ");
    a.append(
      box,
      el("b", "", `${num(offer.price)} ${offer.currency}`),
      el("span", "ttl", offer.title.slice(0, 70)),
      el("i", "", where),
      el("em", "why"),
    );
    a.setAttribute("aria-label", `${offer.title}, ${num(offer.price)} ${offer.currency}, ${where}`);
    cardsEl.append(a);
    cards = [...cards, { offer, node: a, pick: false }];
  };

  return {
    event(ev) {
      const site = str(ev["site"]);
      switch (ev.type) {
        case "start":
          chips.textContent = "";
          rows.textContent = "";
          tape.textContent = "";
          cardsEl.textContent = "";
          cards = [];
          siteRows = {};
          findRow = undefined;
          waiting = [];
          read = 0;
          chars = 0;
          max = null;
          maxOn = true;
          log.hidden = false;
          count.textContent = "";
          if (str(ev["request"])) chip(str(ev["request"]).slice(0, 60));
          break;
        case "plan":
          plan(ev);
          break;
        case "find_start":
          findRow = row("CONTEXT.DEV SEARCH", "LOOKING FOR PAGES…");
          break;
        case "find_done": {
          const n = numberOf(ev["n"]) ?? 0;
          const added = numberOf(ev["added"]) ?? 0;
          const state = ev["limit"]
            ? "RATE LIMIT: READING THE MARKETPLACES WE KNOW"
            : `${n} PAGES IN ${numberOf(ev["secs"]) ?? "?"} S${added ? ` · +${added} KNOWN MARKETPLACES` : ""}`;
          setRow(findRow, state, ev["limit"] ? "no" : "ok");
          break;
        }
        case "read_start":
          if (site && !siteRows[site])
            siteRows = { ...siteRows, [site]: row(site, "READING…", logo(site)) };
          break;
        case "read_done": {
          read += 1;
          chars += numberOf(ev["chars"]) ?? 0;
          const n = numberOf(ev["n"]) ?? 0;
          const ok = ev["ok"] === true;
          const size = numberOf(ev["chars"]);
          setRow(
            siteRows[site],
            ok
              ? `${offersOf(n)}${size ? ` · ${num(size)} CHARS` : ""}${numberOf(ev["secs"]) !== null ? ` · ${numberOf(ev["secs"])} S` : ""}`
              : (str(ev["note"]) || `NOTHING (${String(ev["status"] ?? "?")})`).toUpperCase().slice(0, 60),
            ok ? "ok" : "no",
          );
          const raw = str(ev["raw"]);
          if (raw) tape.textContent = `${site}: ${raw.slice(0, RAW_SHOWN)}…`;
          break;
        }
        case "offer":
          card(ev as unknown as Offer); // (./search.ts hands over only what passed its own check of an offer)
          break;
        case "error":
          row("SEARCH", (str(ev["text"]) || "FAILED").toUpperCase().slice(0, 80)).className = "no";
          break;
        case "done":
          tape.textContent = "";
          break;
        default:
          return;
      }
      apply();
    },
    picks(list) {
      const why = new Map(list.map((p) => [p.offer.id, p.why]));
      cards = cards.map((c) => ({ ...c, pick: why.has(c.offer.id) }));
      for (const c of cards) {
        c.node.classList.toggle("pick", c.pick);
        const note = c.node.querySelector(".why");
        if (note) note.textContent = c.pick ? (why.get(c.offer.id) ?? "") : "";
      }
      // her first pick first
      for (const p of [...list].reverse()) {
        const c = cards.find((x) => x.offer.id === p.offer.id);
        if (c) cardsEl.prepend(c.node);
      }
      apply();
    },
  };
}
