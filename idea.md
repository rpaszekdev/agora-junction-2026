# Agora — type a thing, see the whole European market

Status: idea agreed Fri 13 Nov 2026, ~23:00. Research in `research/`.

## One line
Type a product. Agora reads the live web and puts every offer (new, refurbished, used, across EU countries) on one price ladder, then watches the market for you.

## Two doors, one engine
- Web screen for people: a browser-like view where site tiles fly in live and drop onto the ladder.
- MCP tool for agents: `find_offers("iphone 15", max 500)`, `watch_price(...)`. Any agent shops through Agora instead of visiting each platform.

## What is on screen
- Ladder: price on the vertical axis, columns NEW / REFURBISHED / USED, one dot per offer with its source site.
- "Fair used price" line, "too cheap?" flag on suspicious listings.
- Price history and a one-sentence verdict.
- "Your price" line (borrowed from stock trading): drag it; offers under the line are buy-now with a pre-written seller message. Nothing under it? The agent keeps watching and pings you when one lands.
- The live fetch must be extremely satisfying to watch. This is what Context.dev wants from us.

## One job per sponsor
- Exa: finds every page selling it, small shops too; notices new listings. (Main: The Internet Butler)
- Context.dev: reads each page into price / condition / stock; watches known listings for change. (Main: The Web Is Your Real-Time Database, plus Tech)
- Gemini: turns a need ("laptop for video editing under €900") into a pick with reasons; reads listing photos. (Tech)
- Later, only if the core works: Nemotron (photos), Aiven (history + cache), Oxylabs (bot-walled sites; needs a credit card).

## What the briefs score (checked in challenges/)
- Context.dev: real-timeness 20% ("react to change over time, not a one-off snapshot"), creative mix of sources 20%, latency and accuracy 20%.
- Exa: use of Exa 20%, usefulness to real people 20%, showing sources 20%, originality 20%, works on judges' own live queries 20%.

## Cut for 36 hours
- "Everything + services": pitch one question instead — new, refurbished or used, and where in Europe?
- Checkout and the 0.01% fee: one slide (referral links now, fee later).
- Polish electronics, but keep search open because Exa judges type their own queries.

## Open questions
- Which European platforms can Context.dev actually read (Tori, Vinted, Kleinanzeigen ...)? See `research/platform-tests.md`.
- Who already mixes used listings into price comparison? See `research/competitors.md`.

## Deadlines
Draft + challenge pick Fri 23:59 (changeable later, several challenges allowed). Final submission Sun 15 Nov 10:00.
