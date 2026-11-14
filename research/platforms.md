# European online shopping platforms: scraper map

Checked: 2026-11-13. Method: DeepSeek search/fetch, plus three live fetches. Most rows are NOT live-tested; the live scraping team owns that.

Legend
- verified = I fetched the page or read the official doc myself
- secondary = third-party article, vendor page or aggregator; treat as a lead
- unverified = from memory or not found; cell left blank where no source was found
- "inferred" URL = pattern guessed from the site's known scheme, not fetched

## 1. Platform table

Columns: Platform | Domain | Countries | Type | Owner | Size (year, source) | Search URL | Bot wall | API / feed / affiliate | ToS on scraping

### 1a. Used / classifieds, local

| Platform | Domain | Countries | Type | Owner | Size (year, source) | Search URL | Bot wall | API / feed / affiliate | ToS on scraping |
|---|---|---|---|---|---|---|---|---|---|
| Tori | tori.fi | FI | used | Schibsted | | https://www.tori.fi/recommerce/forsale/search?q=iphone+15 **verified** (fetched: 1,045 results) | none seen in server-side fetch; not browser-tested | none found | unverified |
| Blocket | blocket.se | SE | used | Schibsted | 5M unique visitors/week (Schibsted CMD 2019, dated; secondary) | inferred: https://www.blocket.se/annonser?q=iphone+15 | unverified | unverified | unverified |
| FINN | finn.no | NO | used | Schibsted | group: 31M MAU 2024 (secondary blog) | inferred: https://www.finn.no/bap/forsale/search.html?q=iphone+15 | unverified | Schibsted partner APIs for dealers (secondary, no public read API found) | unverified |
| DBA | dba.dk | DK | used | | | | | | |
| Kleinanzeigen | kleinanzeigen.de | DE | used | Adevinta (Adevinta ASA now subsidiary of Aurelia Bidco Norway, 2024; secondary) | | inferred: https://www.kleinanzeigen.de/s-suchanfrage.html?keywords=iphone+15 | IP-range blocks ("IP-Bereich vorübergehend gesperrt"), reported 2025 (secondary, giga.de) | no public API (secondary, 2026: none offered to outside developers) | AGB text (quoted 2021, dated) bans crawlers, spiders and scrapers without written consent. Secondary. |
| Leboncoin | leboncoin.fr | FR | used | Adevinta / Aurelia (secondary) | | inferred: https://www.leboncoin.fr/recherche?text=iphone+15 | unverified | unverified | unverified |
| Wallapop | wallapop.com | ES | used | unverified | 23.8M (WebVetted, Nov 2025), 25.8M (Crustdata), 26.7M (thecompanycheck, 2026). Third-party, conflicting | inferred: https://es.wallapop.com/app/search?keywords=iphone%2015. Fetch returned only the JS shell, so the pattern is not confirmed | JS-rendered SPA (fetch shell) | unverified | unverified |
| Milanuncios | milanuncios.com | ES | used | Adevinta Spain, sale to EQT announced 21 Jul 2025, close expected Q1 2026; completion unverified | 14.9M monthly visits (thecompanycheck, undated, secondary) | inferred: https://www.milanuncios.com/anuncios/iphone-15.htm | unverified | unverified | unverified |
| Subito | subito.it | IT | used | unverified (Adevinta group, from memory) | | inferred: https://www.subito.it/annunci-italia/vendita/usato/?q=iphone+15 | unverified | unverified | unverified |
| Marktplaats | marktplaats.nl | NL | used | Adevinta / Aurelia (Adevinta job ad, secondary) | 11M monthly unique users (Adevinta job ad, undated). 8M+ uniques/month 2024 (buy-european, secondary) | https://www.marktplaats.nl/q/iphone+15/ **verified** (fetched: 7,077 offers, average price shown EUR 444, Nov 2026) | none seen in fetch | unverified | unverified |
| 2dehands | 2dehands.be (also 2ememain.be) | BE | used | Adevinta; shares a multi-tenant platform with Marktplaats (Adevinta job ad, secondary) | 3.2M monthly users (2020 CMO deck, dated) | inferred: https://www.2dehands.be/q/iphone+15/ | unverified | unverified | unverified |
| OLX | olx.pl / olx.pt / olx.ro | PL, PT, RO | used | OLX Group (Prosus, from memory) | | | unverified | unverified | unverified |
| Allegro Lokalnie | allegrolokalnie.pl | PL | used | Allegro (from memory) | | | unverified | unverified | unverified |
| willhaben | willhaben.at | AT | used | Adevinta. 50% stake sale planned Mar 2025 to Styria Media Group / Sprints (GlobalData, secondary) | | | unverified | unverified | unverified |
| Ricardo | ricardo.ch | CH | used | | | | | | |
| tutti.ch | tutti.ch | CH | used | | | | | | |
| Bazos | bazos.cz / bazos.sk | CZ, SK | used | | | | | | |
| Jofogas | jofogas.hu | HU | used | | | | | | |
| Gumtree | gumtree.com | UK | used | Adevinta (from memory) | | | unverified | unverified | unverified |
| Adverts | adverts.ie | IE | used | | | | | | |
| DoneDeal | donedeal.ie | IE | used | | | | | | |
| Skelbiu | skelbiu.lt | LT | used | | | | | | |
| SS.lv | ss.lv | LV | used (OCAS, classifieds only) | | 4.49M average monthly visits from Latvia, Jan-Dec 2025 (OECD market study, May 2026, secondary-official) | | unverified | unverified | unverified |
| Okidoki | okidoki.ee | EE | used | | | | | | |

### 1b. Used, pan-EU

| Platform | Domain | Countries | Type | Owner | Size (year, source) | Search URL | Bot wall | API / feed / affiliate | ToS on scraping |
|---|---|---|---|---|---|---|---|---|---|
| Vinted | vinted.de / .fr / .co.uk / etc. | 10 EU markets per DSA page, plus US (Jan 2026) and AU (Jul 2026) (secondary) | used (C2C fashion and goods) | Vinted Group | 31M average monthly active users in the EU, 6 months to 31 Jul 2026 (Vinted DSA info page, secondary via vtdbot). 75M+ members worldwide (CEO, Jul 2024, secondary) | inferred: https://www.vinted.de/catalog?search_text=iphone+15 (catalog path taken from a third-party doc) | unverified | no public API found | Vinted terms **verified** (Vinted SK terms text in search index, also cached DE terms): bans bots, extraction and crawler tools, and data mining/extraction without consent. robots.txt blocks AI-training crawlers (secondary). |
| eBay | ebay.de / .co.uk / .fr / .it / .es | multi | used + new | eBay Inc. | | inferred: https://www.ebay.de/sch/i.html?_nkw=iphone+15 | unverified | Browse API **verified** (developer.ebay.com; needs free developer keyset, OAuth bearer). eBay Partner Network affiliate **verified** (same docs). | unverified |
| Facebook Marketplace | facebook.com/marketplace | multi | used | Meta | | | login wall (from memory, unverified) | none found for search | Meta ToS bans scraping (from memory, unverified) |
| Vestiaire Collective | vestiairecollective.com | multi | used (luxury fashion) | | | | | | |
| Depop | depop.com | UK, IE, DE, FR, IT, ES (from memory) | used (fashion) | eBay (from memory) | | | | | |

### 1c. Refurbished

| Platform | Domain | Countries | Type | Owner | Size (year, source) | Search URL | Bot wall | API / feed / affiliate | ToS on scraping |
|---|---|---|---|---|---|---|---|---|---|
| Swappie | swappie.com | FI, DE, SE, NL, others | refurbished | Swappie (independent) | FY2024 net loss EUR 24.0M (finsur, secondary) | | | | |
| Back Market | backmarket.com (+ country domains) | 18 markets (secondary); HQ France | refurbished marketplace | Back Market (independent) | GMV EUR 3.5bn in 2025, 32% growth, about 17M customers (company release via GMI and finsur, secondary) | inferred: https://www.backmarket.de/de-de/search?q=iphone+15 | Cloudflare hosting **verified** (PCrisk scan). Cloudflare Bot Management claimed only on vendor marketing pages (unverified). | no public API found; affiliate via AWIN (vendor page, unverified) | unverified |
| Refurbed | refurbed.com | EU | refurbished marketplace | refurbed (independent) | FY2024 revenue EUR 72.3M (finsur, secondary, audited accounts) | | | | |
| Rebuy | rebuy.de | DE + others | refurbished, integrated | | FY2024 net loss EUR 4.75M (finsur, secondary) | | | | |
| asgoodasnew | asgoodasnew.com | DE | refurbished | | | | | | |
| CeX / WeBuy | cex.co.uk / webuy.com | UK, IE, others | used + refurbished (buy-back) | CeX group (from memory) | | | | | |
| musicmagpie | musicmagpie.co.uk | UK | refurbished, buy-back | AO World (finsur, secondary) | | | | | |
| Flip | flip.ro | RO (and CEE) | refurbished, integrated | | FY2024 net loss EUR 4.1M (finsur, secondary) | | | | |

### 1d. New: big retailers and marketplaces

| Platform | Domain | Countries | Type | Owner | Size (year, source) | Search URL | Bot wall | API / feed / affiliate | ToS on scraping |
|---|---|---|---|---|---|---|---|---|---|
| Amazon | amazon.de / .fr / .it / .es / .nl / .se / .pl | 7 EU stores | new (+ 3P) | Amazon | | inferred: https://www.amazon.de/s?k=iphone+15 | unverified | PA-API v5 retirement: 15 May 2026 (secondary, several plugin vendors). Successor Creators API needs 10 qualifying sales in last 30 days (secondary). Associates affiliate programme exists (secondary). | unverified |
| Allegro | allegro.pl | PL; also allegro-cz / -sk / -hu | new + used | Allegro.eu group (Mind study, secondary) | | inferred: https://allegro.pl/listing?string=iphone+15 | unverified | Public Offer Listing API **verified** (developer.allegro.pl; `/offers/listing`, "verified applications only", 270 req/s, offset cap 600). | unverified |
| bol.com | bol.com | NL, BE | new (+ 3P) | unverified (Ahold Delhaize, from memory) | | inferred: https://www.bol.com/nl/nl/s/?searchtext=iphone+15 | unverified | Marketing Catalog API v1 **verified** (api.bol.com docs; search, product and offer endpoints, country NL/BE). Partner product feeds **verified** (developers.bol.com PDF; whitelisted partners only, updated every 2 hours). | unverified |
| Cdiscount | cdiscount.com | FR | new + 3P | unverified | | | unverified | feed via ChannelEngine (secondary) | unverified |
| Fnac | fnac.com | FR, BE, ES, IT, PT (from memory) | new | | | | unverified | feed via ChannelEngine (secondary) | unverified |
| Otto | otto.de | DE | new + 3P | Otto Group (from memory) | | | unverified | unverified | unverified |
| MediaMarkt | mediamarkt.de + country domains | DE, EU | new | Ceconomy (from memory) | | | unverified | unverified | unverified |
| Zalando | zalando.* | EU | new (fashion) | public company | | | unverified | Zalando Partner Programme (secondary, via ChannelEngine) | unverified |
| eMAG | emag.ro | RO (+BG, HU; from memory) | new + 3P | eMAG (from memory) | | | | | |
| Gigantti | gigantti.fi | FI | new | | | | | | |
| Verkkokauppa | verkkokauppa.com | FI | new | | | | | | |
| Power | power.fi | FI | new | | | | | | |
| Elgiganten | elgiganten.se / .dk / .no / .fi | Nordics | new | | | | | | |
| Komplett | komplett.no | NO | new | | | | | | |

### 1e. Price comparison sites

| Platform | Domain | Countries | Type | Owner | Size (year, source) | Search URL | Bot wall | API / feed / affiliate | ToS on scraping |
|---|---|---|---|---|---|---|---|---|---|
| Idealo | idealo.de / .fr / .it / .es / .at / .co.uk (+ others) | DE, FR, IT, ES, AT, UK, others | comparison | Axel Springer (Reuters 2019; Il Sole 24 Ore 2025, both secondary) | | inferred: https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=iphone+15 | unverified | Partner API v2 **verified** (Productsup docs). Merchant-side only: it pushes offers TO idealo. No read API for prices found. Affiliate programme: unverified. | unverified |
| PriceRunner | pricerunner.se / .dk / .no / .co.uk (+ others) | SE, others | comparison | Klarna (bought Nov 2021, SEK 9.2bn, finanswatch, secondary) | | inferred: https://www.pricerunner.se/results?q=iphone+15 | unverified | unverified | unverified |
| Hintaopas / Prisjakt | hintaopas.fi / prisjakt.nu | FI / SE | comparison | Prisjakt: eEquity is major owner (placera, Oct 2026, secondary). Hintaopas: unverified | | | unverified | unverified | unverified |
| Geizhals | geizhals.de / .at | DE, AT | comparison | unverified | | | | | |
| Ceneo | ceneo.pl | PL | comparison | Allegro.eu group (Mind study, secondary) | | inferred: https://www.ceneo.pl/;szukaj-iphone+15 | unverified | unverified | unverified |
| Heureka | heureka.cz | CZ, SK | comparison | Heureka Group (Mind study, secondary) | | inferred: https://www.heureka.cz/?h[fraze]=iphone+15 | unverified | unverified | unverified |
| Skroutz | skroutz.gr | GR | comparison | | | | | | |
| Tweakers Pricewatch | tweakers.net/pricewatch | NL | comparison | | | | | | |
| Kelkoo | kelkoo.* | multi | comparison | unverified (Yahoo bought 2005, secondary; current owner not checked) | | | | | |
| Google Shopping | shopping.google.com | all | comparison | Alphabet | | | unverified | no public results API for consumers found (unverified) | Google Terms bar scraping (from memory, unverified) |

### 1f. Added by me (not on the original list, unverified)

| Platform | Domain | Type | Note |
|---|---|---|---|
| Temu | temu.com | new marketplace | large EU traffic (secondary: OECD report on Latvia/Lithuania, Temu 2nd-largest marketplace in Latvia, traffic share only) |
| Shein | shein.com | new marketplace | unverified |
| Coolblue | coolblue.nl / .be / .de | new | unverified |
| Currys | currys.co.uk | new | unverified |
| Shpock | shpock.com | used | Adevinta-group (from memory) |
| mobile.de | mobile.de | used (cars) | Adevinta / eBay Classifieds (Adevinta Q4 2021 report, secondary) |
| AutoScout24 | autoscout24.* | used (cars) | unverified |
| Etsy | etsy.com | new + vintage | unverified |

## 2. Ownership clusters (shared tech = likely shared page structure and bot wall)

```
CLUSTER              MEMBERS                                   SHARED TECH (evidence)
Adevinta / Aurelia   kleinanzeigen.de, leboncoin.fr,          Marktplaats + 2dehands: one multi-tenant
                     marktplaats.nl, 2dehands.be,              platform (job ad, secondary). Rest: unverified,
                     milanuncios.com (EQT deal), willhaben.at,  but same group = likely similar stack.
                     gumtree.com, subito.it, mobile.de, shpock
Schibsted            finn.no, blocket.se, tori.fi             Group only (verified). Tech sharing: unverified.
Allegro.eu           allegro.pl, ceneo.pl, allegrolokalnie.pl  Group only (secondary).
Axel Springer        idealo (all country sites)               Group (secondary). Sites likely share stack.
Klarna               pricerunner                              Group (secondary).
eBay                 ebay.* (eBay Classifieds sold to Adevinta 2021) Group (verified via Adevinta report).
Standalone           vinted, back market, refurbed, swappie,  one scraper per site
                     rebuy, asgoodasnew, bol.com, amazon
```

Unverified: whether one Adevinta scraper transfers across its portals. Test one Marktplaats-style page first, then Kleinanzeigen.

## 3. Coverage by country (12 largest by population, from memory)

Format: used | refurbished | new | comparison. Empty = nothing verified on the list.

```
COUNTRY  USED                      REFURB                         NEW                   COMPARISON
DE       kleinanzeigen.de          back market / refurbed /       otto.de, mediamarkt   idealo.de
                                   asgoodasnew / rebuy
FR       leboncoin.fr              back market                    cdiscount, fnac       idealo.fr
UK       gumtree.com, ebay.co.uk   musicmagpie, CeX, back market  (amazon.co.uk: add)    (none verified)
IT       subito.it                 back market                    amazon.it             idealo.it
ES       wallapop, milanuncios     back market                    amazon.es             idealo.es
PL       olx.pl, allegrolokalnie   (none verified)                allegro.pl            ceneo.pl
RO       olx.ro                    flip.ro                        emag.ro               (none verified)
NL       marktplaats.nl            back market                    bol.com               tweakers pricewatch
BE       2dehands.be               back market                    bol.com               (none verified)
CZ       bazos.cz                  (none verified)                (alza.cz: add)        heureka.cz
SE       blocket.se                swappie / (none verified)      elgiganten            pricerunner.se
PT       olx.pt                    (none verified)                (worten.pt: add)      (none verified)
```

## 4. Easiest wins (hypotheses to test live)

| # | Platform | Why | Evidence |
|---|---|---|---|
| 1 | Marktplaats | server-side fetch gave full search page, stats and average price, no challenge | verified fetch |
| 2 | Tori.fi | server-side fetch gave full search results with prices and locations | verified fetch |
| 3 | Allegro | public Offer Listing API, search by phrase or category, JSON, documented | verified doc (needs app registration) |
| 4 | eBay | Browse API, search with OAuth bearer token from free developer keyset | verified doc |
| 5 | bol.com | Marketing Catalog API (NL/BE) with search and offer price fields | verified doc (partner access likely needed) |
| 6 | SS.lv | classifieds-only, no login or payments, 4.49M monthly visits (OECD) | secondary |
| 7 | Idealo | big-name comparison, but read access unknown; use only as a price reference | unverified |
| 8 | Blocket / FINN | traditional classifieds (Schibsted), same group as Tori | unverified |
| 9 | Ceneo / Heureka | comparison sites, likely feed-friendly | unverified |
| 10 | Pricerunner | comparison site, Klarna-owned | unverified |

Not verified as easy: 8-10 are guesses. Confirm with a live test.

## 5. Hard targets

| Platform | Why | Official route |
|---|---|---|
| Kleinanzeigen | no public API; crawler ban in terms (dated quote); IP-range blocks reported 2025 | none for outside developers. Third-party paid APIs and scrapers exist (secondary, not vetted). |
| Vinted | terms ban bots and extraction tools (verified); no public search API found | none found. Only DSA user-count disclosure. |
| Back Market | Cloudflare hosting verified; Bot Management claimed by vendor pages only | no public API found; affiliate via AWIN (unverified) |
| Amazon | PA-API v5 retired (secondary, May 2026); Creators API needs 10 qualifying sales in 30 days | Creators API (only if eligible) |
| Wallapop | JS-rendered SPA; fetch returned shell only | none found |
| Google Shopping | no consumer results API | Merchant-side feeds only (unverified) |
| Idealo | no read API found; partner API is merchant-side (push) | feed push only |

## 6. Totals

- Platforms listed: about 70 rows (original list plus Depop, Flip and 8 added in 1f). Verified in-scope facts: about 12 (fetched or official docs). The rest are secondary or unverified.
- Searches run: about 24 DeepSeek searches, 3 fetches (Tori, Wallapop, Marktplaats). Only Tori and Marktplaats returned usable search results; Wallapop returned a JS shell.
- Not verified: most search URL patterns (marked "inferred"), most bot-wall claims, owners of 15+ platforms.
