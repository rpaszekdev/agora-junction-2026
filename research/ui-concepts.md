# Agora: live-fetch UI concepts borrowed from other fields

Goal: make the 5-20s fetch (30-50 EU shops, 1-15s each) the show.
Build cost: L = low, M = medium, H = high (one weekend, small team, web tech).

## Ideas (18)

### 1. Labor illusion ticker
- Source: travel search (Kayak shows each airline being asked). Buell & Norton research.
- Pattern: show the work, not a spinner. Each line: `asking Zalando.de ........ 1.2s ✓ 1 offer`.
- Why it feels good: visible effort makes waits feel shorter and results feel more valuable. Their experiments found people preferred a slower site that showed its work over an instant one that hid it.
- Agora: left column log streams one line per shop as it responds. Failures show `timeout 15s` honestly.
- Build: L. HTML/CSS, a plain list with CSS transitions. Reference: https://kayak.com (search results page).

### 2. Split-flap offer board
- Source: airport Solari departure boards.
- Pattern: each shop is a row; characters flip through the drum before settling on the price.
- Why: mechanical flip + click sound is a strong "something is happening" cue, and the sound is the reward.
- Agora: row per shop: `DE · MediaMarkt · 649 EUR`. Flip on arrival; the price digits settle last.
- Build: L-M. CSS 3D transforms. Libraries: `@oceanswave/solari-split-flap` (React, Web Audio clicks, `flipTo()` API), `split-flap-display` (web component). Also: FlipOff (github.com/magnum6actual/flipoff, vanilla JS, no build step).

### 3. Radar sweep over the price ladder
- Source: Flightradar24 / MarineTraffic live maps. Sweep line with afterglow; blips appear when the sweep passes.
- Pattern: a rotating line over the ladder. Dots are invisible until the sweep crosses them, then fade out over one revolution.
- Why: the sweep gives a rhythm you can predict, so each dot is a small surprise, not a random pop. Afterglow shows recency.
- Agora: the ladder is the radar; a sweep runs top to bottom (or clockwise on a circular price scale). A new offer lights up as the sweep reaches its price.
- Build: M. Canvas 2D (or SVG with a rotating `<line>`). Reference: https://www.flightradar24.com (map view); https://www.marinetraffic.com.

### 4. Live order book (depth curve)
- Source: Bloomberg terminal price cells and NinjaTrader depth chart.
- Pattern: cumulative curve of offers from cheapest up. Each new offer adds a step. Cells flash on change and persist for a moment.
- Bloomberg's patent (US10185989B2) describes bid/offer cells whose background persists briefly after a price moves, so the eye tracks the change.
- Why: a growing curve shows how much supply exists; the shape is itself the story (cliff vs plateau).
- Agora: under the ladder, a cumulative "how many offers under €X" curve grows as offers land.
- Build: M. SVG path updated per offer; CSS background flash for changed cells.
- References: https://static.ninjatrader.com/ru/support/helpGuides/nt8/using_the_depth_chart_window.htm (depth chart section); patent link https://patentimages.storage.googleapis.com/4c/d0/fd/8acc77e56b2b89/US10185989.pdf

### 5. Price graph that draws itself
- Source: Google Flights price graph and date grid (Google's cache lets it populate instantly).
- Pattern: a line/range chart that fills in, with low-price valleys highlighted.
- Agora: the ladder's price axis gets a density "fog" that thickens as shops answer; the cheapest-so-far valley is labeled.
- Build: L-M. SVG or canvas. Reference: https://www.google.com/travel/flights (Price Graph, Date Grid).

### 6. Hopper "buy or wait" verdict
- Source: Hopper app, with a buy/wait recommendation, a deals calendar and a price freeze.
- Pattern: one final card: BUY NOW or WAIT plus a target price.
- Agora: after the last shop answers, show a verdict from the agent's own history (lowest seen, how it moved). Let the user "freeze" the verdict. Reference: https://apps.apple.com/app/hopper-flights-hotels-cars/id904052407
- Build: M. Needs at least a simple rule (e.g. price vs median of past 5 checks). The verdict is a payoff; it is the goal the whole wait is building toward.

### 7. Speedtest needle on a price scale
- Source: Ookla Speedtest gauge. Needle sweeps up; the arc fills behind it as the value grows.
- Pattern: a gauge whose needle is the current lowest price. It drops (sweeps left) each time a cheaper offer lands; the arc shows the range seen so far.
- Why: a needle that moves with each reading gives a clear "still going" signal and a physical sense of new lows.
- Agora: needle = "best price so far". Each new low swings it with a spring.
- Build: L. SVG arc + CSS transform on the needle. Reference: https://www.speedtest.net (gauge while testing); CSS class names in https://support.ookla.com/hc/en-us/articles/44440441806093-CSS-Hierarchy (`.gauge-needle`, `.gauge-path-current-speed`).

### 8. F1 timing tower with re-sorting rows
- Source: F1 TV timing tower; live leaderboard with gaps and tyre compounds.
- Pattern: rows re-sort with animation as positions change; a gap column; purple highlight for a new fastest lap.
- Agora: shops are drivers. Rows re-sort by price as results come in; the "fastest lap" purple becomes "new lowest offer" purple. Gap column: `+€34 vs best`.
- Build: M. Framer Motion `layout` or FLIP animation. Reference: "undercut-f1" open-source TUI timing tower, described at https://ja.news.hada.io/topic?id=20433 (sector colors, gap column, stint bars).

### 9. Shazam listening state, then match handoff
- Source: Shazam listening screen. Pulse rings, three-bar audio visualizer, handoff to the result.
- Pattern: pulse rings radiate while the agent listens. The bars morph to loading dots, then a bottom sheet slides up.
- Agora: the pulse is the "still asking" state. When the last shop answers, the rings collapse into the verdict card.
- Build: L. CSS keyframes. References: https://60fps.design/shots/shazam-listening-to-music-interaction ; https://dribbble.com/shots/3315169-Shazam-for-Apple-Watch/

### 10. Traceroute / htop log with latency bars
- Source: `traceroute` and `htop`. Each hop has a latency; the list grows downward.
- Pattern: each shop is a hop with a latency bar. Slow shops show a long bar; a hop that times out is red.
- Agora: a terminal-style table: `shop · latency bar · status`. Gives the 15-second straggler a visible place.
- Build: L. HTML table + CSS width transitions. Monospace font.

### 11. ECG / seismograph alarm line
- Source: ECG and seismograph traces. A flat line that spikes on an event.
- Pattern: a live trace of the best price so far. A new low spikes the line; going under "your price" makes a sharp QRS-like spike plus a beep.
- Agora: "your price" is a threshold drawn as a dashed line. The trace is the agent watching. The alert is the spike crossing it.
- Build: L-M. Canvas 2D; WebAudio beep. Reference: https://en.wikipedia.org/wiki/Electrocardiography (waveform reference only).

### 12. Slot-machine reels with near misses
- Source: casino slot reels. Reels spin, then stop left to right, with anticipation on near-misses.
- Pattern: each condition column (NEW / REFURBISHED / USED) is a reel. A column stops when its last shop answers. Near-misses: two shops within 2% of the best price make the last reel slow down.
- Agora: the reels end on the lowest price in each column. Anticipation on the final reel.
- Build: M. CSS transforms; a stop-order rule. Keep the pattern honest: the stop is the real data arriving.

### 13. Loot drop with rarity colors
- Source: game loot drops. Items drop from the sky with rarity colors (gold, purple, blue, grey) and a light beam on rare ones.
- Pattern: each offer falls in as a drop. Color = condition (NEW gold, REFURB blue, USED grey). The lowest-ever offer gets a beam and a sound.
- Agora: each offer drops onto the ladder at its price height. The beam flags a new low.
- Build: L-M. CSS keyframes or canvas particles.

### 14. Poker reveal: face-down cards that flip
- Source: poker TV. Hole cards are face down; flips happen one at a time; the "river" is last.
- Pattern: all shops start as face-down cards. Each flips to show the price when its shop answers. The last card is the big reveal.
- Agora: a tray of 30-50 face-down cards that flip one by one. Lowest flips last for maximum suspense (or flips in with a delay).
- Build: L. CSS 3D rotateY; a small queue.

### 15. "Going once" auction countdown
- Source: live auction houses. Lots move through a countdown, and the hammer is a sound.
- Pattern: the price drops (Dutch auction) and the countdown resets on each new low; "going once... going twice... sold" with the buy button.
- Agora: when the last shop answers, a "going once" countdown runs on the best offer. A new low resets it.
- Build: L. CSS animation; timer resets.

### 16. Count-up totals (Spotify Wrapped)
- Source: Spotify Wrapped. Big numbers count up with reveal transitions.
- Pattern: "You checked 41 shops. You saved €112 vs the median." Numbers count up as shops respond.
- Agora: a tiny stats strip: shops checked, offers found, savings vs median. Each counter ticks up.
- Build: L. requestAnimationFrame tween.

### 17. Map pins dropping on Europe
- Source: map apps. Pins drop with a bounce at each location.
- Pattern: each shop has a country; a pin drops on a stylized Europe map. Country colors fill as offers land.
- Agora: a country heatmap of where cheap offers come from; a pin per shop that bounces when it answers.
- Build: M. SVG Europe map (simplified paths); CSS bounce keyframes. Reference: https://www.google.com/maps (pin drop).

### 18. Package-tracking milestones
- Source: DHL/UPS tracking. A horizontal progress track with stations.
- Pattern: stations are countries (DE → FR → NL → ...). A marker moves as each country's shops answer.
- Agora: the progress track fills by country. Clear progress without a percentage spinner.
- Build: L. SVG/CSS. Reference: https://www.dhl.com (tracking page).

### 19. Search that shows its work
- Source: Perplexity Pro Search (lists steps and sources) and agent "thinking" traces.
- Pattern: a step list that grows: `searching 42 shops`, `read 12 pages`, `found 3 at 12% below median`. The user can expand a step.
- Agora: an agent trace panel. Each finished shop is a step with its source domain and time.
- Build: L. Plain list; reference https://www.perplexity.ai/help-center/en/articles/10352903-what-is-pro-search

### 20. Swipe to keep or dismiss (Tinder)
- Source: Tinder swipe deck.
- Pattern: each new offer appears as a card; swipe right = watch, left = ignore. Good as a secondary action.
- Agora: "keep" a found offer for alerts. Lower priority for the live fetch itself.
- Build: L-M. Pointer events or a gesture library.

### 21. Weather radar fade
- Source: weather radar loops. Old frames fade as new ones land.
- Pattern: each fetch round is a frame; older dots fade back to a ghost tint.
- Agora: after the first round, older dots fade so the new arrivals stand out. Good for a "history of checks" view.
- Build: L. CSS opacity transitions.

## Top 5 to build (ranked by wow per hour)

1. Split-flap offer board (2) — L-M, instantly recognizable, sound sells it. ~3h with the npm package.
2. Radar sweep over the ladder (3) — M, matches the ladder concept exactly. ~4h.
3. Labor illusion log with latency bars (1 + 10) — L, cheap and backed by research. ~2h.
4. Live depth curve with flashing cells (4) — M, makes supply visible. ~4h.
5. Loot-drop landings with rarity colors and new-low beam (13) — L-M, rewards each arrival. ~3h.

Skip for weekend: 8 (needs re-sort choreography), 17 (map data), 20 (not core).

## The live fetch, second by second

Combined from ideas 1, 2, 3, 11, 13, 6.

```
TIME  SCREEN                                        SOUND/CUE
0s    key press. Ladder columns NEW|REF|USED draw   soft tick
      in. Radar sweep starts. Log: "asking 42 shops"
      Split-flap counter: 00 → 42 flips
1s    first shop returns: board row flips to price  flip click
      first drop lands on ladder (loot-drop beam  
      if it's a new low). ECG line starts beating   
3s    ~6 shops in. Depth curve appears. Log lines   soft pings
      show latency bars (2.1s, 0.8s, 3.4s)
8s    ~25 shops. Your-price line visible. A dot     alarm beep,
      lands BELOW it → ECG spike, row flashes,      ECG spike
      "alert: €599 at Coolblue.nl" in log
15s   stragglers: "still asking" pulse on 3 rows    slow pulse
      with ETA. Sweep ends. Verdict card:
      "Best €589 · median €649 · WAIT / BUY NOW"
      + freeze button
```

Notes:
- 0.1s and 1.0s NN/g limits: each action must feel instant, so the key press itself draws the skeleton within 100ms.
- After 10s, the wait needs visible progress (NN/g: percent-done or running count). The counter and log cover that.

## Why waiting feels good (UX research)

- Labor illusion (operational transparency): Buell & Norton showed users a visible search of airlines, or a running list of tasks, and rated it higher even when it took up to a minute. A majority preferred the slower site that showed its work. Sources: HBR "Think Customers Hate Waiting? Not So Fast..." (May 2011), PDF at https://www.hbs.edu/faculty/Publication%20Files/think%20customers%20hate%20waiting_20d66186-ad13-4af6-93d7-c712dd409bd9.pdf ; Management Science 57(9):1564-1579, https://doi.org/10.1287/mnsc.1110.1376
- Response-time limits: 0.1s instant, 1.0s flow, 10s attention limit. Above ~10s, use a percent-done or running count. Source: Nielsen Norman Group, https://www.nngroup.com/articles/response-times-3-important-limits/
- Goal gradient: effort rises as the goal nears. Kivetz, Urminsky & Zheng (2006) also found an illusion of progress (a coffee card with two pre-filled "bonus" stamps sped up purchases). Source: Journal of Marketing Research 43 (2006): 39-58, https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal
  Agora use: the progress bar starts with a few stamps already filled (e.g. "3 of 45 already checked from cache").
- Skeleton screens and perceived progress: not verified in this run; common practice in web UX. Treat as unverified until checked.
- Practical rule: show a fast, real action on every second. Never show a spinner without a count or a name.

## Notes on sources

- Flight radar sweep details (blip colors, afterglow, 8s sweep period) came from a hardware user guide for a DIY FlightRadar device (topbytes.net), not from Flightradar24 itself. Treat as a pattern reference only.
- Google Flights "400ms" and loader colors came from a third-party UX case study (Medium, 2021), not from Google.
- Hopper facts are from its App Store and Play Store listings.
- Patent US10185989B2 (Bloomberg) describes persistence of changed price cells in a display.
