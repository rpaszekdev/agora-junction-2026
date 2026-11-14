# Agora: personalization research (Nov 2026)

Scope: personalizing an LLM shopping agent that reads European marketplace search pages, with no login and no purchase history. Sources are cited inline. Anything marked `unverified` is my inference or a source I could not confirm. Items marked `our proposal` are design suggestions with no external source.

---

## 0. Summary

```
SIGNAL STRENGTH (what the evidence supports)
  explicit profile + consent UI        ██████ strong (Stitch Fix, Rufus, ChatGPT/Gemini all ship it)
  critiquing ("cheaper", "like this")  █████  strong (decades of CRS research)
  constraint extraction from query     █████  strong (ShopSimulator, Gao 2026)
  implicit clicks/dwell as signal      ████   medium (session-based RS literature, noisy)
  ask 1-2 clarifying questions         ███    mixed: LLMs ask too rarely; asking has a cost
  auto-learned memory without control  █      risky: inaccurate summaries, GDPR exposure
```

Key finding: the failure mode in the 2026 shopping benchmarks is not missing personalization. It is preference hallucination and under- or over-use of stored preferences. Ship explicit, visible, editable constraints first.

---

## 1. Techniques (Q1)

| Technique | What it is | Evidence / source | Fit for Agora |
|---|---|---|---|
| Explicit profile + onboarding quiz | User states size, budget, location, brands | Stitch Fix collects 85+ style data points via profile; Freestyle uses a style quiz then "continues to evolve" <https://stitchfix.gcs-web.com/static-files/c6015118-0b5d-4c27-be81-aafd4929f653#15#52#15>, and the 2022 10-K describes the same Freestyle quiz and feedback loop <http://stocklight.com/stocks/us/nasdaq-sfix/stitch-fix/annual-reports/nasdaq-sfix-2022-10K-221257411.pdf#2#19#2>. A LinkedIn summary claims a longer intake survey won over a short one; treat as anecdote, not data <https://www.linkedin.com/posts/ecarls1_want-better-customer-retention-ask-the-right-activity-7249418237346549760--HoY#1> | High. Keep it to 3-5 fields, not 85 |
| Implicit signals (click, dwell, skip, purchase) | Weighted events turned into interest scores | Session RS thesis maps dwell time and purchase to interest levels, weights tuned by CV <https://pure.port.ac.uk/ws/portalfiles/portal/43265290/thesis_ramazan_final.pdf#9#15#9>. Patent weights: open page 0.5, cart/wishlist 1.0, hover 0.1, scroll past = dislike <https://patentimages.storage.googleapis.com/8a/4f/f2/03a5a21c3943b8/US20220156302A1.pdf#17#18#17> (patent, weak evidence) | Low here: no clicks inside the agent. Use only for in-session result clicks |
| Session-based personalization | Recency inside one chat | Session-based RS literature: short-term intent dominates; Jannach et al. "short-term intents, reminders, trends and discounts" (title seen in reference list, not fetched) <https://dl.acm.org/doi/10.1007/s42979-023-01752-x> | High: free, no consent issue |
| Context signals (locale, language, timezone, rough location, device, season) | Defaults for currency, marketplaces, shipping radius, language of results | Used by Gemini/ChatGPT as context; no direct shopping study found | High for defaults. Use as priors, never as hard filters without asking |
| Query understanding / constraint extraction | Turn "red jacket under 80 for hiking, size M, not Zara" into typed fields | ShopSimulator scores agents on category, attribute, option and price constraints; main failure is weak attribute/option matching <https://export.arxiv.org/pdf/2601.18225#1#6#1> | High, and visible in a demo |
| Clarifying questions | Ask 1-2 questions when the request is underspecified | REVOIR asks about five times fewer questions than baselines and infers when asking is not worth it <https://arxiv.org/abs/2609.37588>. LLMs "recognize ambiguity but rarely ask" <https://arxiv.org/abs/2605.25284> (cited in a Zenodo doc, not fetched, `unverified`) | Use a rule: ask only when the answer changes ranking |
| Critiquing ("like this but cheaper") | User critiques a shown item; system returns the nearest item that satisfies the critique | Classic CRS: "like this but cheaper" maps to price < X; critiquing failure occurs when no item satisfies; repeated cheaper critiques can exhaust options <https://www.ijcai.org/Proceedings/07/Papers/155.pdf#1#2#1>. Diminishing-choices problem when eliminated items are needed again (same source) | High. Price, brand, condition, distance critiques are all expressible as constraints |
| Collaborative filtering | Users like you bought X | Needs a user-item matrix. Agora has none | Not applicable now |
| Content-based | Match item attributes to stated profile | Standard; CBF suffers from low serendipity (summarized in the Esmeli thesis above) | Yes, this is what the agent already does via query |
| Cold start | Ask, default by locale, use population priors (e.g. popular brands in country) | Stitch Fix and Freestyle use quiz plus aggregate data for new users (10-K above) | Use locale priors + quiz |
| Re-ranking with user vector | Score retrieved listings against a profile vector or constraint set | Session re-ranking with interest scores (Esmeli thesis above) | Do it as a constraint score, not an embedding, at this scale |
| LLM memory: ChatGPT | Saved memories plus chat-history references; memory summary; user can correct, delete, "don't mention this" | OpenAI help center <https://help.openai.com/en/articles/8590148-memory-in-chatgpt>. Memory summary is "not a complete inventory" (same page) | Copy the controls, not the auto-learning |
| LLM memory: ChatGPT "Dreaming" (2026) | Background synthesis of a profile | ZDNet reports a wrong "Kasa/Home Assistant" claim and a summary that omits facts <https://www.zdnet.com/article/chatgpts-new-memory-upgrade-can-also-worsen-answers/> | Warning: auto-synthesized profiles hallucinate |
| LLM memory: Gemini personal context | "Past chats" and "Memory" settings, on by default for non-EEA users; memory import from other apps | Google blog Feb and Apr 2026 <https://blog.google/intl/en-ca/feed/use-past-chats-to-get-more-personalized-responses/>, <https://blog.google/company-news/inside-google/around-the-globe/google-europe/united-kingdom/gemini-launches-new-personalisation-features-in-the-uk/>. Support page says the feature is not available in the EEA, UK or Switzerland <https://support.google.com/gemini/answer/15637730?hl=zh-&co=GENIE.Platform%3DDesktop> (conflicts with the UK blog; current EU status `unverified`) | Relevant as EU precedent: memory was withheld from EEA users |
| Amazon Rufus, now "Alexa for Shopping" | Account memory of family, pets, diet; memories can be inspected and edited by asking; past orders used for reorder | Amazon (Nov 2025) <https://www.aboutamazon.com/news/retail/amazon-rufus-ai-assistant-personalized-shopping-features>. 2026 rename and "inspect and edit" features <https://www.azoma.ai/insights/amazon-rufus-comes-out-of-beta-as-alexa-for-shopping>. Japan launch Nov 12 2026 says memories can be reviewed, updated and deleted in conversation <https://ai.watch.impress.co.jp/docs/news/2155952.html> | Pattern to copy: "what do you know about me" and editable memory |
| Klarna | SKU-level transaction data feeds personalized shopping feeds; AI shopping assistant for merchants; Shopping Search app in ChatGPT since May 2026 | Klarna F-1 <https://content.edgar-online.com/ExternalLink/EDGAR/0002003292-25-000015.html?hash=98aef1c6372a0e6d77a2f4d81f06ca13eb350540b33d23f78be0887c30457c59&dest=exhibit412-fx1a2_htm#exhibit412-fx1a2_htm#42>; <https://www.bankingnewsai.com/fintech/klarna/payment-ecosystem-ai> | Not copyable: needs their transaction graph |
| Shopify | Not researched | unverified | - |
| Critique of personalization itself | Over-personalized agents fail on preference use | ShopSimulator: failures come from imbalance between under-using and over-reasoning preferences <https://export.arxiv.org/pdf/2601.18225#1#6#1>. Shopping Companion Bench: "preference hallucination" causes cascading errors; cross-session memory is hard <https://aclanthology.org/people/kejun-xiao/> | Verify every profile-driven filter against the user's current message |
| Long-horizon personalized shopping (2026) | Dialogue state tracking, retrieval of user history, role decomposition | Gao et al., "Personalization Matters" <https://aclanthology.org/2026.findings-aacl.199/>; arXiv copy <https://browse-export.arxiv.org/pdf/2610.11375#1#9#1>. Retrieval gave the largest gain; n=5 user study | Supports: keep a small explicit state object, retrieve it per turn |

---

## 2. WHEN to personalize, and when not (Q2)

### 2.1 Subjective vs commodity query

No validated classifier found. Heuristic (our proposal):

```
TASTE / SUBJECTIVE         COMMODITY / SPEC
- style, look, vibe        - model, part number, size, spec
- "nice", "cozy", "gift"   - "iPhone 14 128GB"
- "something for me"       - "USB-C cable 2m"
=> personalize ranking     => ignore taste profile, use hard constraints only
```

### 2.2 Ask vs answer

- REVOIR: ask only if expected task reward gain outweighs asking cost; cheap post-hoc correction can replace asking <https://arxiv.org/abs/2609.37588>.
- Our rule (proposal): ask when the missing field changes the top-5 result set materially (size for clothing, storage for phones). Otherwise answer with the default and state it ("showing EU-wide, size M assumed").
- Asking cost: each question is a turn the user may not answer. Cap at 2 per query.

### 2.3 Gift detection

No LLM-specific study found. Patents describe recipient-based gift selection using a "gift" intent and recipient profile, and separating buyer and recipient preferences <https://patents.google.com/patent/US20200020015A1#3>. Practical rule: the buyer's profile must not apply to the recipient's item. (Our proposal; signal words below.)

### 2.4 Durable fact vs one-off constraint

ChatGPT, Gemini and Amazon each save durable facts (location, family, diet) with user controls. Warning from a 2026 Zenodo thesis (`unverified`, low-quality source): "incorrect or stale memory can be worse than a brief clarification" <https://www.zenodo.org/records/23085343/files/R145_Thesis_Publish_Ready_v1_0_CORRECTED_2026-10-01.pdf?download=1#7#13#7>. Rule: save only when the user explicitly says it, and show it.

### 2.5 Over-personalization and filter bubble

- Serendipity study on news: users opted out of increasingly similar content; content monotony hurt engagement <https://edepot.wur.nl/702630#2#2#2>.
- Diversity-aware re-ranking reduces echo-chamber effects in lexicase-selection work <https://ar5iv.labs.arxiv.org/html/2305.11044#1>.
- For shopping: always keep at least one out-of-profile option (cheapest, or different brand) in the top results and label it.

### 2.6 Privacy and GDPR / DSA (EU)

- DSA Art. 26(3): no ads based on profiling using Art. 9 special-category data. Art. 27: recommender main parameters must be explained in terms and a non-profiling option offered <https://eur-lex.europa.eu/legal-content/HU-EN/TXT/?uri=CELEX%3A32022R2065#44>.
- EDPB Guidelines 3/2025 on DSA-GDPR interplay: Art. 22 applies to decisions with significant effects; consent remains key for tracking-based profiling <https://lagen.nu/guidance/edpb/riktlinjer/03-2025>, <https://www.lewissilkin.com/insights/2025/11/12/edpb-guidelines-on-the-dsagdpr-interplay-what-platforms-advertisers-and-resear-102lu87>.
- Inferred special-category data counts when the inference reveals a category (ICO guidance, e.g. medical sites inferring a condition) <https://icosearch.ico.org.uk/s/search.html?query=%60inferred+special+category%60&collection=ico-meta>. Agora implication: never infer health, religion, sexuality, political view from a query (e.g. "halal", "wheelchair ramp", "pregnancy" items). Treat as special category; do not store.
- Right to see and delete: the ChatGPT and Amazon designs above are the reference UI. Store only what the user typed or confirmed; show a "What I remember" panel with delete.

---

## 3. Mechanisms: signal -> action (Q3)

### 3.1 Classification schema (one LLM call, JSON out)

```json
{
  "intent": "commodity | taste | gift | mixed",
  "for_whom": "self | other | unknown",
  "constraints": {"budget_max": null, "size": null, "condition_min": null,
                  "radius_km": null, "shipping_ok": null, "brand": null, "language": null},
  "constraint_scope": "durable | this_search",
  "missing_for_ranking": ["size"],
  "critique_of": null
}
```

### 3.2 Signal words (rules, run before the LLM)

| Signal in message | Read as |
|---|---|
| "for my wife/mum/friend/kid/colleague", "birthday", "present", "gift", "as a gift" | gift, for_whom=other |
| "for me", "my size", "I live in", "I'm in", "my", "I have a (device)" | durable fact or self |
| "this time", "just now", "today", "under 50 for this one", "budget is" | this_search constraint |
| "like this but cheaper", "more like", "not this one", "something else", "different" | critique_of = last shown item |
| "pick up", "near me", "within X km", "collect" | radius constraint |
| "ship", "delivery", "from Germany", "customs" | shipping / landed cost constraint |
| "nice", "cozy", "vibe", "style", "I like" | taste |
| model number, EAN, "128GB", "USB-C 2m" | commodity: ignore taste |

### 3.3 Decision table

```
MESSAGE SIGNAL                         -> AGENT ACTION
-----------------------------------------------------------------
commodity + spec given                 -> answer, ignore profile taste
taste/style, no profile fields         -> answer + ask 1 question if it changes top-5
gift signal ("for my mum")             -> gift mode: profile OFF for taste,
                                          keep only recipient constraints; banner it
durable fact stated ("I live in Helsinki") -> ask "Save for future chats?" Y/N
one-off constraint ("under 100 this time") -> apply once, do NOT save
critique ("like this but cheaper")     -> keep item, add price<X, re-rank
size/brand/condition in profile, query commodity -> use profile hard constraint only
sensitive inference (health, religion)  -> do not use, do not store
conflict (profile says M, message says L) -> message wins, apply once, ask "update profile?"
ambiguous + high-cost field (size, storage) -> ask 1 question, max 2 per turn
ambiguous + low-cost field (color)     -> answer with default, state the assumption
```

### 3.4 Prompt patterns (paste-ready)

Memory gate:
```
Before saving any fact, check: (a) user stated it about themselves, (b) it is durable
(location, size, household), (c) not a special category. If (b) is false, apply to this search
only. Never save a fact the user has not confirmed in this turn.
```

Gift guard:
```
If the message names another person as recipient, set for_whom=other. Do not apply the
profile's taste, size or style fields. Apply only constraints the user states about the recipient.
```

Ask rule:
```
Ask at most one question, only if the answer changes the top-5 results. Otherwise answer now
and state the assumption in one line.
```

---

## 4. Levers that matter for second-hand and cross-border (Q4)

| Lever | Why it matters | Source | Agora action |
|---|---|---|---|
| Distance and pickup vs shipping | Second-hand listings often pickup-only; cost of shipping can exceed item | Finnish second-hand study: price, convenience, availability dominate <https://osuva.uwasa.fi/bitstreams/ab7da243-c9d4-4555-920b-b4a4eedd3116/download#10#13#10> (Finnish) | Ask home city once; show km and pickup flag |
| Total landed cost | From 1 July 2026, EUR 3 flat duty per item (per tariff line) on consignments up to EUR 150, through 1 July 2028 <https://globalimportblog.bakermckenzie.com/2026/07/02/eu-low-value-consignment-relief-abolished-and-eur-3-customs-duty-introduced-from-1-july-2026/>; Reg. (EU) 2026/382 <https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=OJ:L_202600382> | Non-EU sellers now cost more. Show price + shipping + EUR 3/item. Note: some member states add handling fees (France EUR 2 per tariff line, per AVASK, `unverified`) <https://avask.com/blog/eu-customs-duty-2026-new-rules/> |
| Condition tolerance | "Used but good" vs "for parts"; users differ | Second-hand trust/risk study <https://www.usenix.org/system/files/soups2026-zarkalam.pdf#4#6#4> | Parse "new/like new/used OK/no defects" as a constraint; default: used OK, no parts |
| Risk tolerance: private sellers | Scams and personal safety are the top concerns for German second-hand users | SOUPS 2026 interview study (n=20) <https://www.usenix.org/system/files/soups2026-zarkalam.pdf> | Badge escrow/buyer protection; rank with seller reviews; flag "private, no protection" |
| Platform protection | Marktplaats escrow and buyer guarantee reduce perceived risk (Dutch interview study, low n) <https://research.ou.nl/ws/portalfiles/portal/82264672/Schrotenboer_A_IM9806_BPMIT_AF_Scriptie_PURE.pdf#7#12#7> | Use as a ranking tie-breaker |
| Language | Listings are in the local language; user may not read German, Finnish, Dutch | Our observation; no study | Translate titles, keep original link; search in local language |
| Sizes | Size tables differ by brand and country (EU vs UK vs US) | Unverified (no source fetched) | Store one size scheme per user; convert on query |
| Brand ecosystem | Owning Apple devices narrows accessories and compatibility | Amazon "knows your devices" examples (Alexa for Shopping, Yahoo) <https://tech.yahoo.com/ai/apple-intelligence/articles/amazons-search-bar-now-ai-191830498.html> | Only use if user states it; compatibility constraint, not taste |
| Review trust | Pre-set ratings ("on time", "honest") preferred over AI summaries by some users | SOUPS 2026 <https://www.usenix.org/system/files/soups2026-zarkalam.pdf#4#6#4> | Show seller rating, not AI summary, as the trust signal |

---

## 5. What to build this weekend

1. **Constraint chips (visible).** Show the extracted JSON as chips above results: `Helsinki 50km`, `size M`, `< EUR 80`, `used OK`. Click a chip to remove it and re-rank. Demo effect: immediate, shows the agent understood.
2. **Memory card with delete.** After the user says a durable fact, show "Save: lives in Helsinki? [Y] [N]". Settings panel lists saved facts with delete. Matches ChatGPT/Amazon pattern and EU consent expectations.
3. **Gift switch.** When the message contains "for my mum", show banner "Gift mode: your size and style are off" and re-run without the profile. Demo: one query, visibly different results.
4. **Critique buttons on result cards.** `Cheaper`, `More like this`, `Other brand`, `Pickup only`. Each sets a constraint from the critique and re-ranks; cheaper = price < shown price.
5. **Landed-cost line on every non-EU listing.** Show `price + shipping + EUR 3 duty` (per item) and a pickup distance in km for local listings. Demo: cross-border offers reorder once the user's country is known.

---

## Source list (all URLs above, consolidated)

- https://pure.port.ac.uk/ws/portalfiles/portal/43265290/thesis_ramazan_final.pdf
- https://dl.acm.org/doi/10.1007/s42979-023-01752-x
- https://stitchfix.gcs-web.com/static-files/c6015118-0b5d-4c27-be81-aafd4929f653
- https://export.arxiv.org/pdf/2601.18225
- https://aclanthology.org/2026.findings-aacl.199/
- https://aclanthology.org/people/kejun-xiao/
- https://arxiv.org/abs/2609.37588
- https://arxiv.org/abs/2605.25284 (unverified, seen via Zenodo)
- https://www.ijcai.org/Proceedings/07/Papers/155.pdf
- https://help.openai.com/en/articles/8590148-memory-in-chatgpt
- https://www.zdnet.com/article/chatgpts-new-memory-upgrade-can-also-worsen-answers/
- https://blog.google/intl/en-ca/feed/use-past-chats-to-get-more-personalized-responses/
- https://support.google.com/gemini/answer/15637730
- https://www.aboutamazon.com/news/retail/amazon-rufus-ai-assistant-personalized-shopping-features
- https://www.azoma.ai/insights/amazon-rufus-comes-out-of-beta-as-alexa-for-shopping
- https://ai.watch.impress.co.jp/docs/news/2155952.html
- https://www.bankingnewsai.com/fintech/klarna/payment-ecosystem-ai
- https://eur-lex.europa.eu/legal-content/HU-EN/TXT/?uri=CELEX%3A32022R2065
- https://lagen.nu/guidance/edpb/riktlinjer/03-2025
- https://icosearch.ico.org.uk/s/search.html?query=%60inferred+special+category%60&collection=ico-meta
- https://edepot.wur.nl/702630
- https://globalimportblog.bakermckenzie.com/2026/07/02/eu-low-value-consignment-relief-abolished-and-eur-3-customs-duty-introduced-from-1-july-2026/
- https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=OJ:L_202600382
- https://www.usenix.org/system/files/soups2026-zarkalam.pdf
- https://osuva.uwasa.fi/bitstreams/ab7da243-c9d4-4555-920b-b4a4eedd3116/download
- https://research.ou.nl/ws/portalfiles/portal/82264672/Schrotenboer_A_IM9806_BPMIT_AF_Scriptie_PURE.pdf

Not verified: Shopify personalization, EU size-conversion standards, the current EU availability of Gemini memory, the exact French handling fee.
