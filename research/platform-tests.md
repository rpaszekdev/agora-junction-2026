# Live test: can Context.dev read European shopping sites?

Run Fri 13 Nov 2026, ~23:15. One call per site to `POST /v1/web/scrape` (markdown output, fresh fetch, country set to the site's own), on the search page for "iphone 15". 1 credit per call.

How to read it: "iphone" and "prices" are simple counts of matches in the returned text. They show the page came back with listings on it. They do not prove every listing parses cleanly; nobody has read the pages line by line yet.

## Result: 34 of 43 clearly readable, 4 need a closer look, 5 failed

| Site | Country | Type | Seconds | "iphone" | Prices | Verdict |
|---|---|---|---|---|---|---|
| tori.fi | FI | used | 2.5 | 72 | 54 | works |
| blocket.se | SE | used | 5.4 | 73 | 54 | works |
| finn.no | NO | used | 10.7 | 73 | 54 | works |
| dba.dk | DK | used | 6.6 | 91 | 54 | works |
| kleinanzeigen.de | DE | used | 2.4 | 214 | 28 | works |
| leboncoin.fr | FR | used | 13.8 | 47 | 122 | works |
| wallapop.com | ES | used | 10.8 | 160 | 44 | works |
| subito.it | IT | used | 12.8 | 123 | 42 | works |
| marktplaats.nl | NL | used | 5.0 | 515 | 99 | works |
| 2dehands.be | BE | used | 5.2 | 364 | 187 | works |
| olx.pl | PL | used | 7.4 | 261 | 50 | works |
| willhaben.at | AT | used | 4.3 | 50 | 11 | works |
| gumtree.com | GB | used | 5.3 | 143 | 45 | works |
| bazos.cz | CZ | used | 2.9 | 205 | 40 | works |
| vinted.fi | FI | used | 4.8 | 550 | 576 | works |
| facebook marketplace | FI | used | 5.8 | 24 | 34 | works, short page (likely only the first few listings before the login wall) |
| milanuncios.com | ES | used | 13.4 | 15 | 5 | check: few listings |
| ricardo.ch | CH | used | 4.6 | 126 | 2 | check: listings present, price format not matched |
| ebay.de | DE | used | 5.4 | 749 | 3 | check: listings present, price format not matched |
| swappie.com | FI | refurbished | 8.9 | 310 | 23 | works |
| backmarket.de | DE | refurbished | 8.3 | 61 | 41 | works |
| rebuy.de | DE | refurbished | 7.0 | 444 | 55 | works |
| refurbed.de | DE | refurbished | 3.7 | 0 | 0 | failed (my search URL was a guess; retry with the right one) |
| cex / webuy.com | GB | refurbished | 15.5 | 0 | 0 | failed: near-empty page |
| amazon.de | DE | new | 6.5 | 596 | 87 | works |
| allegro.pl | PL | new | 32.7 | 505 | 233 | works, slow |
| verkkokauppa.com | FI | new | 8.8 | 190 | 49 | works |
| power.fi | FI | new | 4.5 | 204 | 93 | works |
| mediamarkt.de | DE | new | 20.7 | 93 | 59 | works, slow |
| otto.de | DE | new | 59.1 | 116 | 44 | works, far too slow for a live demo |
| fnac.com | FR | new | 32.8 | 157 | 55 | works, slow |
| cdiscount.com | FR | new | 3.3 | 133 | 128 | works |
| emag.ro | RO | new | 16.2 | 425 | 148 | works |
| bol.com | NL | new | 7.0 | 281 | 1 | check: listings present, price format not matched |
| gigantti.fi | FI | new | 3.9 | 4 | 0 | failed: near-empty page |
| idealo.de | DE | comparison | 5.3 | 84 | 61 | works |
| pricerunner.se | SE | comparison | 6.4 | 68 | 35 | works |
| geizhals.de | DE | comparison | 22.9 | 272 | 30 | works, slow |
| ceneo.pl | PL | comparison | 10.2 | 263 | 59 | works |
| heureka.cz | CZ | comparison | 16.5 | 111 | 22 | works |
| skroutz.gr | GR | comparison | 31.5 | 351 | 31 | works, slow |
| hintaopas.fi | FI | comparison | 3.5 | 0 | 0 | failed (URL was a guess; retry) |
| tweakers.net | NL | comparison | 4.6 | 0 | 0 | failed: 24 characters back (consent wall?) |

## What this means

- The feared bot walls did not show up. Vinted, Kleinanzeigen, Leboncoin, Wallapop and Amazon all came back with listings on the first try, with no captcha text in the page.
- Speed: about 25 sites answer in under 10 seconds, the fastest in 2.5. Six take 20-60 seconds. For the live show, fire everything at once and let the slow ones arrive late or drop them.
- The Schibsted sites (Tori, Blocket, Finn, DBA) use the same URL pattern and returned near-identical page sizes, so one reader should cover four countries.

## Blocker to fix first

The API key is limited to 10 requests per minute. The first run of 43 parallel calls got 33 rejections ("10 request units are allowed per minute"). The challenge brief promises 50 at once, so the JUNCTION26 code is probably not redeemed on this account yet, or the limit needs raising by the Context.dev mentors. Until that is fixed, a 40-site live fetch is impossible.

## Not tested yet

- Structured extraction (`formats.json` with a schema, +4 credits; `formats.product`, +1) on these pages.
- Single listing pages (as opposed to search pages).
- Monitors and webhooks on a listing.
- Exa as the finder.
- The three failed URLs with corrected search paths.

Raw responses are in the session scratchpad, not in the repo.
