# Agora: how to return EXACTLY what the user wants

Research date: 2026-11-14. Method: web search plus primary-source fetches, and live HTTP probes of marketplace URLs from this machine (plain curl, desktop Chrome user agent, 2026-11-14). Every claim carries a URL. Tags: **[V]** = I fetched or tested it myself, **[S]** = stated in a fetched primary source or search snippet, **[U]** = unverified (third-party docs, memory, or blocked).

---

## 0. Headline findings (read this first)

1. **Your biggest accuracy gap is not the LLM, it is that you throw away filters.** Tori, Kleinanzeigen, Marktplaats and Vinted all accept price, category and sort in the URL, and I confirmed the results change (section 4). "iphone 15" with a price floor of 300 EUR removes cases and repair services before the LLM sees them.
2. **Marktplaats has a clean JSON search endpoint** (`/lrp/api/search`) that returned structured listings with price in cents, category id, condition and image URLs, with working price, sort, category, condition and postcode-distance filters [V]. Reading it costs one HTTP call and zero 40k-character markdown pages. Check Context.dev and the site's terms before relying on it; I only tested a handful of requests from one IP.
3. **Tori already ships schema.org JSON-LD**: a `CollectionPage` with `ItemList` of `Product` items (`description`, `offers.price`, `priceCurrency`) [V]. That is the cheapest structured source; parse it instead of sending markdown to the LLM.
4. **The industry pattern is the same everywhere: understand the query into structure, retrieve wide, then verify and rerank with a stronger model** (Exa Websets, Perplexity, Zalando's judge, ChatGPT shopping research). Your pipeline does "retrieve narrow, one LLM pass".
5. **Accessory-versus-product is a solved labeling problem**: the Amazon ESCI scheme (Exact / Substitute / Complement / Irrelevant). "Case for iPhone 15" is a Complement. Use those four labels in your verifier prompt.
6. **Direct fetches to eBay, Back Market and Amazon.de were blocked (403 / 403 / 503) and OLX returned 403.** Their parameter names below are therefore [U] except where an official doc was fetched (eBay Browse API).

---

## 1. Query understanding: request to structured intent

### What the big systems do
- **Zalando** runs a Named Entity Recognition engine over queries that tags category, type, brand, season etc. (e.g. "Kids Winter Jacket" becomes `category: kids, type: jacket, season: winter`). Queries sharing a tag set are treated as the same intent. Source: https://frutik.github.io/awesome-search/Articles/Search-Quality-Assurance-with-AI-as-a-Judge (summary of a Zalando talk) [S, secondary].
- **Etsy** has no SKUs, so it uses LLMs to extract structured attributes (size, colour, material) from titles, descriptions and photos; attribute coverage in target categories rose from 31% to 91% per the Etsy engineering post. They use few-shot examples, taxonomy business rules, Pydantic validation, and gate the pipeline on precision/recall against a labeled sample. Source: https://www.etsy.com/codeascraft/understanding-etsyas-vast-inventory-with-llms and https://www.zenml.io/llmops-database/llm-powered-product-attribute-extraction-from-unstructured-marketplace-data [S]. Lesson for you: extract attributes from the listing as well as from the query, so both sides are structured and can be compared field by field.
- **Zalando (older, still relevant)**: classic symbolic search is "index attributes, parse query into attributes, filter by attributes"; their post argues this pipeline is brittle across languages. https://engineering.zalando.com/posts/2018/02/search-deep-neural-network.html [S]. Relevant because you are multilingual (FI, DE, NL...): let the LLM do the parse instead of per-language rules.
- **Amazon** published the ESCI benchmark (Shopping Queries Dataset) with queries deliberately chosen for negation and attribute parsing. https://export.arxiv.org/pdf/2206.06588 [S]. Its code and dataset are a free source of hard query test cases (see section 6).
- **eBay** exposes the structure of its own search: category ids, item "aspects" (brand, colour...) and condition refinements are first-class API filters (`category_ids`, `aspect_filter`, `filter=price:[a..b]`, `conditionIds`). https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search [V, fetched]. This shows what a structured intent must be able to express: category, aspect values, condition, price, location.
- **Google AI Mode / Shopping Graph**: for "bag for a May trip to Portland" it fans out simultaneous searches to learn what makes a bag good for rain and long journeys, then uses those criteria to filter. https://business.google.com/uk/think/search-and-video/google-shopping-ai-mode-virtual-try-on-update/ [S].
- **LLM-to-filter research**: a 2026 IEEE paper reports a retrieval-augmented LLM parser that turns natural-language queries into attribute filters (category, price, colour) and cut no-result rate 47% and raised filter accuracy 22% on a simulated 50k-query fashion set. https://xplorestaging.ieee.org/document/11539805 [S, simulated data, treat the numbers as indicative only].

### Recommended intent schema for Agora (one LLM call, JSON mode)
```
intent = {
  need_type: "specific_product" | "product_family" | "need_based" | "browse",
  product: {brand, family, model, variant_must: [..], variant_forbidden: [..],  # e.g. forbidden: ["Pro","Plus","Max"] for "iphone 15"
            attrs_must: {storage_gb: 256, ...}, attrs_nice: {...}},
  excluded_kinds: ["accessory","case","repair","parts","wanted_ad","empty_box"],
  price: {min, max, currency},
  condition: ["new","like_new","used_ok","for_parts_ok"],
  location: {country, city, radius_km} | "any",
  markets: [..3-5 of the 18..],
  queries: [{market, language, keyword_query, filters_to_apply}],   # 2 per market (see section 2)
  clarify: null | {question, options}
}
```
Key design rule: `variant_must` and `variant_forbidden` are the thing that fixes "Pro vs non-Pro". The words "pro", "max", "plus", "mini", "se" are exactly the tokens that decide variant identity for phones; keep a small per-category list of variant tokens and let the LLM extend it.

### Vague need-based queries ("laptop for video editing")
Resolve first, search second. Step A: one LLM call (no web) names 3-6 concrete candidate models/families that satisfy the need within the budget (for example "MacBook Air M2/M3 16 GB", "ThinkPad T14 / P14s with 32 GB", "ASUS Vivobook Pro 15"). Step B: each candidate becomes a normal `specific_product` search. This is the same idea as Google's fan-out (decompose into criteria, then search each) and ChatGPT shopping research (clarify, then multi-step discovery): https://help.openai.com/en/articles/12911370-using-shopping-research-in-chatgpt [S]. Risk: the LLM's model list is frozen at its training cutoff, so mark candidates "suggested, confirm availability" and prefer families over exact generations when the LLM is unsure. [My inference, not a cited result.]

---

## 2. Retrieval, then re-ranking

### How the reference systems are structured
| System | Pipeline | Source |
|---|---|---|
| Exa Websets | Dozens of embedding searches to get candidates, then an agent verifies each result against each criterion; each match carries supporting references. Per-criterion verdict values `yes / no / unclear`. Runs minutes to hours. | Exa's Hacker News launch post (text seen via https://hn.algolia.com/ search result) and https://exa.ai/docs/websets/api-guide , https://exa.ai/docs/websets/api-guide-for-coding-agents [S] |
| Perplexity | Query goes to hybrid retrieval (lexical + semantic merged), then prefilter (stale/non-responsive removal), then several ranking stages, cheap lexical/embedding scorers first, cross-encoder rerankers last; works on sub-document spans. Pro Search adds a planner that decomposes into sub-queries and runs dependent steps in sequence. | https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api , https://blog.vespa.ai/perplexity-show-what-great-rag-takes/ , https://theaiengineer.substack.com/p/how-perplexity-built-their-search (secondary) [S] |
| Google AI Mode | "Query fan-out": split the question into subtopics and issue many queries simultaneously; Deep Search runs hundreds. | https://blog.google/intl/en-mena/product-updates/explore-get-answers/introducing-ai-mode-in-arabic/ [S] |
| ChatGPT shopping research | Asks clarifying questions (brands, size, budget), then multi-step discovery reading product pages and merchant feeds; user can veto items mid-run. Model is a GPT-5 mini variant trained for shopping. | https://help.openai.com/en/articles/12911370-using-shopping-research-in-chatgpt , https://www.eweek.com/fr/news/openai-chatgpt-holiday-shopping-assistant-black-friday/ [S] |
| Kagi | Calls about a dozen sources in parallel per query, then its own ranking (down-ranks ad/tracker-heavy pages). Not product-specific. | https://help.kagi.com/kagi/search-details/search-sources.html [S] |

### Anthropic's measured evidence for hybrid + rerank
BM25 plus embeddings with rank fusion beats either alone, and adding a reranker on the top 20 cut retrieval failures by 67% versus baseline (contextual embeddings alone 35%, plus BM25 49%). https://www.anthropic.com/research/contextual-retrieval [S].

### Reciprocal rank fusion (RRF)
`score(d) = sum over lists of 1 / (k + rank)`, k = 60. Needs no comparable scores across lists, which is why it suits merging results from different marketplaces and different queries. Paper: https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/ ; k=60 convention: https://pkg.go.dev/github.com/mathomhaus/lore@v0.1.1/pkg/lore/retrieve/rrf [S].

### What is worth copying with ~10 page reads per minute
You cannot afford web-scale fan-out. The budget is the constraint, so spend reads where they buy accuracy:

1. **Fan-out in the LLM, not on the web.** Generating 2 query variants per site is free (tokens). Fetching them is not. So: query A = precise (brand + model + variant, quoted tokens), query B = broader (family only) used only if A returns fewer than ~8 plausible hits. That is adaptive fan-out; most requests will cost 1 read per site.
2. **Cheap first-stage filter before the LLM.** Parse the JSON-LD/JSON/HTML into rows (title, price, url, image), then apply deterministic rules from the intent (price range, `variant_forbidden` tokens, accessory keywords, "wanted" ads). This drops most junk for free and shrinks 40k chars to ~60 rows of 200 chars, which also removes the page-truncation problem.
3. **RRF across sites is mostly unnecessary** (you want listings, not one fused list of documents). Use RRF only to merge the two query variants on one site, or to merge "marketplace rank" with "LLM verifier score" (section 5). A weighted score is fine too; do not build more.
4. **LLM re-ranker over rows, not pages.** One cheap model call over ~60-100 compact rows with the structured intent beats one call over five 40k pages. This is the "cross-encoder" slot, filled by an LLM.
5. **Skip embeddings.** With under ~200 candidates per request there is nothing to index. A cross-encoder/embedding stack (Perplexity, Vespa) pays off at web scale, not here. [My judgment.]

---

## 3. Product identity and matching

### How comparison engines do it
- **GTIN/EAN/MPN is the primary key where available, titles are the fallback.** Marketplace and comparison feeds put GTIN in schema.org JSON-LD (billiger.de exposes `gtin13`), but merchant GTINs are often wrong, so the engine's own matched product id (not GTIN) was the reliable cluster key in one dataset analysis: https://github.com/ephes/llm-benchpacks/blob/39a78307282dd298d134e5e322aad96d199e8845/docs/benchmarks/product-offer-matching/dataset-sourcing-analysis.md [S, third-party analysis of billiger.de, not idealo].
- **Price-comparison matching research** (PriceRunner, Skroutz datasets) first classifies the offer into a category, then applies a per-category matcher, because the attributes that matter differ (colours/dimensions for furniture, ingredients for food). https://repository-api.ihu.gr/server/api/core/bitstreams/a3e95ed5-633b-4cf6-b435-4cba266de13c/content and https://people.iee.ihu.gr/~lakritidis/downloads/slides/IISA_2023_ab_slides.pdf [S].
- **Offer-vs-product validation with an AI classifier**: PricePirate's Idealo connector classifies each offer as `same_variant`, `multipack`, `different_product` with a confidence, because a lookup that lands on a search page mixes in accessories, multipacks and lookalikes. This is almost exactly your failure mode. https://pricepirate.com/docs/en/solutions/price-data-api [S, vendor doc].
- **PreisHoheit's PMX** scores the match between merchant offer title and manufacturer product title as a percentage and lets you drop offers below a threshold (their example: under 40%). https://www.preishoheit.com/de/aktuelles/blog/?Wie-der-PMX-das-Matching-revolutioniert&post=8 [S, vendor blog].
- Idealo, Geizhals and PriceRunner do not publish their matcher internals in the sources I found. [U] I did not find a primary engineering write-up for any of the three.
- Etsy has no global SKU at all and relies on LLM attribute extraction instead (section 1), which is closest to second-hand marketplaces like yours.

### What this means for second-hand marketplaces (no GTIN on most listings)
Identity is a normalized tuple, not an id: `(brand, family, model, variant_flags, capacity)`.
- Normalize titles with the same LLM extraction used on the query: `"Apple iPhone 15 Pro Max 256 GB schwarz"` becomes `{brand: Apple, family: iPhone 15, variant: Pro Max, storage: 256}`. Compare tuples, not strings.
- **Variant tokens decide identity**: "15" vs "15 Plus" vs "15 Pro" vs "15 Pro Max". Real Kleinanzeigen results for the query "iphone 15" in my probe include listings titled "iPhone 15 Pro 128GB", "iPhone 15 Plus 128 GB" and "iPhone 15 Pro Max 256GB" next to plain iPhone 15 [V], which reproduces your Pro/non-Pro problem live.
- **Accessory vs product**: use the ESCI definitions in the verifier prompt. Exact = satisfies all specs; Substitute = functional substitute missing some aspect; Complement = used together with the item (a case for an iPhone 15); Irrelevant. https://export.arxiv.org/pdf/2206.06588 [S]. Cheap pre-filter signals: category (Marktplaats puts cases in "Hoesjes en Frontjes | Apple iPhone", id 829, a different category than phones, id 1953 [V]), price far below the median, words like case/hoesje/hülle/kuori/cover/protector/reparatie/Reparatur/defekt/suche/gezocht.
- **Dedup across sites**: key = `normalize(brand, model, variant, storage, colour)` plus price within ~3% plus matching first photo hash (perceptual hash) or seller+city. Cross-posted ads (same seller on Kleinanzeigen and eBay) usually share photos. Keep the cheapest, list the others as "also on". This is a heuristic design of mine, not a cited system.
- **Price sanity**: compute the median price per normalized product from the candidate set; flag items under ~40% of median as probable accessory/scam/parts (PMX uses a similar threshold idea, above).

---

## 4. Use the marketplaces' own filters (parameter table)

Probe method: `curl` with a desktop Chrome user agent, then I inspected the returned prices, counts and titles to see whether the filter really applied. A parameter echoed in the page but with unchanged results is marked as not working.

| Marketplace | Parameter | Status | Evidence |
|---|---|---|---|
| **tori.fi** | `https://www.tori.fi/recommerce/forsale/search?q=iphone+15&price_from=300&price_to=600&sort=PRICE_ASC` | **[V]** price_from, price_to, sort=PRICE_ASC | Returned listing prices started at 300 and rose (300,300,...308,310,...); the page's embedded state shows `searchParams:{q, price_from, price_to, sort}`. |
| tori.fi | `trade_type`, `location`, `product_category` | **[V] recognized, values unknown** | Result count changed (trade_type=2 gave 6, location=0.100003 gave 4, product_category=2.93.3217 gave 0 vs 1,045 unfiltered), so the names are accepted but I do not know the valid values; discover them by clicking filters in a browser once and copying the URL. |
| tori.fi | `condition`, `radius`, `published_today` | **[V] no visible effect** | Count unchanged or equal to the price-filter count; treat as unsupported until you find the real names. |
| tori.fi | JSON-LD | **[V]** | `CollectionPage > mainEntity > ItemList > itemListElement[].item = Product {description, offers{price, priceCurrency, availability}}` plus a `BreadcrumbList`. Note the JSON-LD `url` omits the filters even when filters applied, so do not use it to verify them. |
| **kleinanzeigen.de** | Path segments: `/s-{category-slug}/preis:300:600/{keyword}/k0c{categoryId}` e.g. `https://www.kleinanzeigen.de/s-handy-telekom/preis:300:600/iphone-15/k0c173` | **[V]** price path, category id c173 | All sampled prices were between 315 and 600 EUR; title "Handy, Smartphone & Telefon". |
| kleinanzeigen.de | Location + radius: `/s-berlin/preis:300:600/iphone-15/k0l3331r20` (`l`=location id, `r`=radius km) | **[V]** | Title became "Iphone 15 in Berlin"; the pattern `l3331r20` appeared in the returned links. |
| kleinanzeigen.de | Seller type: `/s-anbieter:privat/...` and `/s-anbieter:gewerblich/...` | **[V] link exists** | Both appear as links in the filtered page; I did not compare result sets. |
| kleinanzeigen.de | Facets like `+global.farbe:blau` appended to the category path | **[V] link exists** | Appear in the page's link/state data; not result-tested. |
| kleinanzeigen.de | Sort (`sortingField=PRICE_AMOUNT`) | **[U]** | My test URL returned a "Preisfilter anwenden" page, so it was not accepted in that form; find the real sort URL in a browser. |
| **marktplaats.nl** | HTML URL params (`?priceFrom=`, `?PriceCentsFrom=`, `#PriceCentsFrom:30000|...` hash, `?sortBy=`) | **[V] NOT applied server-side** | Results identical to unfiltered (prices 0, 99900, 100000 still present). Do not use. |
| marktplaats.nl | **JSON API** `https://www.marktplaats.nl/lrp/api/search?query=iphone+15&limit=30&offset=0` | **[V]** | Returns `listings[]` (itemId, title, priceInfo.priceCents, location{cityName,distanceMeters}, imageUrls, categoryId, attributes, vipUrl), plus `facets`, `sortOptions`, `totalResultCount`. |
| marktplaats.nl API | `&attributeRanges[]=PriceCents:30000:60000` | **[V]** | Total fell from 7,065 to 2,447; prices 350, 475, 470, 550, 600... |
| marktplaats.nl API | `&sortBy=PRICE&sortOrder=INCREASING` (also `SORT_INDEX`, `OPTIMIZED`, `DECREASING`) | **[V]** | Combined with price range the first results were 300, 300, ...; the `sortOptions` array lists the valid pairs. Without a price floor the cheapest results are priceCents 0 (listings with "bid"/no price), so always set a floor. |
| marktplaats.nl API | `&l1CategoryId=820&l2CategoryId=823` (ids from the `RelevantCategories` facet) | **[V]** | With a category the total dropped to 1,110 and titles included phones and "Mouse Case Iphone 15 pro" (25 EUR), showing category alone does not remove cases; use price floor plus a verifier as well. Category ids seen: 820 Telecommunicatie, 1953 Mobiele telefoons Apple iPhone, 829 hoesjes. |
| marktplaats.nl API | `&attributesByKey[]=condition:Gebruikt` (values from the `condition` facet: Nieuw, Refurbished, Zo goed als nieuw, ...) | **[V]** | Total fell to 1,139. |
| marktplaats.nl API | `&postcode=1012AB&distanceMeters=5000` | **[V]** | Total fell to 359; all sampled cities were Amsterdam. |
| marktplaats.nl API | `attributesByKey[]=offeredSince:Vandaag`, `buyitnow:Direct Kopen` | **[V] facets exist** | Listed in `facets`; not result-tested. |
| **vinted.de** | `https://www.vinted.de/catalog?search_text=iphone+15&price_from=200&price_to=500&order=price_low_to_high&status_ids[]=2` | **[V]** price_from, price_to, order | Embedded prices started at 200 EUR (200.00 x many, then 210,70). Params preserved in the page canonical. |
| vinted.de | `order` values: `relevance`, `newest_first`, `price_low_to_high`, `price_high_to_low` | **[V] two, [S] rest** | price_low_to_high tested; list from https://scrapeatlas.com/docs/platforms/vinted/search/ |
| vinted.de | `status_ids[]` (condition: 6 new with tags, 1 new, 2 very good, 3 good, 4 satisfactory), `catalog[]`/`catalog_ids`, `brand_ids`, `color_ids`, `size_ids`, `currency` | **[S]** names appear in the page's script data and in three third-party docs; not result-tested | https://swamp-club.com/extensions/@magistr/vinted , https://pub.dev/documentation/scrapebadger/latest/scrapebadger/VintedApi/vintedSearchVintedItems.html |
| **ebay (official API)** | Browse API `GET /buy/browse/v1/item_summary/search`: `q` (max 100 chars, space = AND, `(a,b)` = OR), `category_ids`, `filter=price:[10..50]` (needs `priceCurrency`), `filter=conditionIds:{...}`, `filter=buyingOptions:{FIXED_PRICE|AUCTION}`, `aspect_filter=categoryId:X,Brand:{Apple}`, `gtin=`, `epid=`, `sort=price` / `-price` / `distance` / `newlyListed` / `endingSoonest`, `limit` max 200 | **[V] official doc fetched** | https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search . Requires an OAuth app token and `X-EBAY-C-MARKETPLACE-ID` (e.g. EBAY_DE). `gtin`/`epid` cannot be combined with `q`. Note: by default only Buy It Now listings are returned. |
| ebay.de website URL | `_nkw`, `_udlo`, `_udhi`, `LH_ItemCondition` (1000 new, 3000 used, 7000 for parts), `_sop` (sort), `LH_BIN=1` | **[U]** | My direct fetch returned 403. Names are from third-party scraper docs (https://serpapi.com/ebay-search-api ); sort codes were inconsistent between sources. Prefer the official API. |
| **backmarket.de** | URL form `...?price_min=200&price_max=500&condition=good&sort=price-asc` (condition values premium/excellent/good/fair) | **[U]** | Direct fetch 403. Source: Apify actor doc https://apify.com/silentflow/backmarket-scraper . Back Market grades are the key attribute: the same phone differs by grade (one example 258 EUR good to 365 EUR premium) per https://reefapi.com/docs/backmarket.md . Search page also has filters for brand, series, model, storage, colour, SIM (official help: https://help.backmarket.com/hc/en-us/articles/4407526743314-Can-you-help-me-find-the-right-item ). |
| **amazon.de** | `https://www.amazon.de/s?k=iphone+15&low-price=300&high-price=600&s=price-asc-rank`, `rh=p_72:...` (rating), `rh=p_n_condition-type:...`, sort values `price-asc-rank`, `price-desc-rank`, `review-rank`, `date-desc-rank`, `exact-aware-popularity-rank`, `i=` department | **[U]** | Direct fetch returned 503. Sources: https://dev.to/pangolinfo/amazon-url-parameter-construction-a-complete-guide-for-data-scraping-22i0 (that guide says cents for low/high-price in most categories, which is not reliable on the German site; test with one query) and https://reduck.ai/explore/scripts/reduck/amazon.de/search-products . The official Product Advertising API has `min_price`/`max_price`/`min_reviews_rating` but needs an associates account. |
| **olx.pl / olx.ro etc.** | `?search[filter_float_price:from]=1500&search[filter_float_price:to]=2500&search[order]=filter_float_price:asc`, `category_id`, `city_id`, `region_id`; sort values `created_at:desc`, `relevance:desc`, `filter_float_price:asc|desc` | **[U]** | My fetch returned 403. Source: Apify OLX actor docs https://apify.com/datahamster/olx-europe-listings/input-schema . |

Practical rules from the probes:
- **Always send a price floor** (for example 40% of the expected price). Without it price-sorted lists start with free/zero-price ads (Marktplaats) and accessories.
- **Category filtering alone is not enough** because accessories sit in sibling categories only sometimes (Marktplaats "iPhone" category still contained a 25 EUR case). Combine category plus price floor plus verifier.
- **Do one browser pass per marketplace now** (30 minutes total) to record the exact URL for category, condition and location for your top 6 markets; the table shows where I could not.
- **Cache category ids** per marketplace for ~20 product types (phones, laptops, bikes, consoles, furniture...). The LLM picks the type, code picks the id. Do not let the LLM invent ids.

---

## 5. Verification as its own step

### Prior art
- **Exa Websets**: each candidate is checked against each user criterion by an agent; result values `satisfied: yes | no | unclear`; matches keep their supporting references. https://exa.ai/docs/websets/api-guide-for-coding-agents [S]. Copy the three-valued verdict: `unclear` is what stops hallucinated matches and tells you which items deserve a page read.
- **Zalando LLM judge**: an LLM first writes query-specific guidelines (identifies requirements and importance, e.g. product type, sleeve length, pattern), then a multimodal model scores each product on text plus image as highly relevant / acceptable substitute / irrelevant. Reported as up to 1,000x cheaper than humans, 20,000 pairs in about 20 minutes. https://engineering.zalando.com/posts/2024/11/llm-as-a-judge-relevance-assessment-paper-announcement.html [S]. Their other write-up scored 0-4 on top-25 results using product images and metadata, around 250 USD for 1,500 query segments x 25 results: https://frutik.github.io/awesome-search/Articles/Search-Quality-Assurance-with-AI-as-a-Judge [S, secondary].
- **ChatGPT shopping research** reads product pages directly and cites sources, and says it can still err on price and availability, advising users to confirm on the retailer page. https://help.openai.com/en/articles/12911370-using-shopping-research-in-chatgpt [S].
- **PricePirate** classifies each offer `same_variant / multipack / different_product` with confidence: https://pricepirate.com/docs/en/solutions/price-data-api [S].

### Design for Agora (cost-ordered ladder, stop as soon as the verdict is certain)
1. **Rule check on the row** (free): price in range, forbidden variant tokens absent, not an accessory category, not a "wanted" ad.
2. **LLM verdict on the compact row** (cheap, batched): per criterion `yes/no/unclear` using the ESCI label. Rows with all `yes` and high confidence pass; any `no` is dropped; `unclear` goes to step 3.
3. **Read the single listing page** for `unclear` items among the top ~5-8 (this is where your page-read budget goes: at 10 reads/minute that is under a minute). Look for storage, battery health, defects, "includes charger", model number in the description. Prefer structured data first: a listing page usually has JSON-LD or an embedded JSON state; Marktplaats' API already returns `attributes` and `extendedAttributes` per listing, and the Tori JSON-LD has only description/price, so Tori needs the page read for details [V].
4. **Vision check on the photo** (only for the final 3-6, only where the criterion is visual): colour, "is this the actual device or a stock image", visible damage, box vs phone, model number on the screen. Send the already-extracted image URL to a vision model (Gemini). Zalando's use of images in judging (above) supports vision for relevance, but I did not find a source that quantifies vision-check accuracy for second-hand photos, so treat it as a tie-breaker, not a gate. [U]
5. **Link and price liveness** (you already do the link check): re-confirm price and availability for the top results immediately before display, as ChatGPT itself recommends.

Show the verdict to the user: "Matches: 256 GB, price, condition. Not confirmed: battery health." That converts a wrong guess into an honest label.

---

## 6. Evaluation: the 2-hour harness

### How search teams measure
- Graded relevance labels (ESCI or 0-4) per query-result pair, then **precision@k, NDCG@k** (rank-aware), recall where the set is known. The Amazon KDD Cup task used nDCG for ranking and micro-F1 for classification: https://amazonkddcup.github.io/posters/8572.pdf [S].
- **Golden query set**: a fixed list of queries with labeled results, rerun after every change. Vespa recommends a broad base of test queries with many wordings, and warns that testing only favourite queries is rarely thorough: https://vespa.ai/solutions/retrieval-augmented-generation/the-rag-blueprint/ [S].
- **LLM-as-judge** to scale labeling: Zalando (above) reports comparable quality to humans; Etsy uses an LLM for "silver labels" reviewed by domain experts because human labels also contained errors (a light fixture mislabeled at 1/2 inch instead of 5.5 inches): https://www.etsy.com/codeascraft/understanding-etsyas-vast-inventory-with-llms [S].
- **Query selection**: Zalando clusters queries by their NER tag sets so the test set has distinct intents instead of near-duplicates; Amazon sampled queries that production models got wrong (negation, attribute parsing): https://export.arxiv.org/pdf/2206.06588 [S].

### Smallest harness (2 people, 2 hours)
```
T+0:00  Write 30 queries in a CSV (id, user_text, must, must_not, price_max). Mix:
        10 exact product ("iPhone 15 128GB", "PlayStation 5 disc edition")
        6  variant traps ("iPhone 15" must_not Pro/Plus/Max; "MacBook Air M2 not M1")
        5  accessory traps ("Nintendo Switch console" must_not case/dock-only/game)
        5  need-based ("laptop for video editing under 900 EUR")
        4  non-English markets (Tori, Marktplaats, Kleinanzeigen, Vinted)
T+0:20  Freeze the retrieval: run each query once and SAVE the raw candidate rows to JSON
        (this makes later runs free and deterministic; page reads are your scarce resource).
T+0:40  Label: an LLM judge (strong model, ESCI prompt with the query's must / must_not)
        labels every returned listing E/S/C/I. Two people spot-check 60 labels
        (about 15 minutes) and fix the judge prompt until agreement is high.
T+1:20  Script prints per query and in total:
        precision@5, precision@10 (E only), accessory rate (C share), wrong-variant rate,
        empty-result rate, pages read, seconds. One table, one number to beat.
T+1:50  Commit baseline. Rule: no pipeline change merges without rerunning the table.
```
Why this works: it measures your exact complaints (accessory rate, wrong-variant rate) and the frozen candidate cache lets you test the verification/ranking steps without spending reads. Use the Amazon ESCI dataset only if you want extra hard queries; it is English/Japanese/Spanish and Amazon-specific, so your own 30 queries matter more: https://github.com/amazon-research/esci-code [S via the paper].

Stats caution: 30 queries x ~10 results is only 300 judgments. Report differences below a few points as noise. [My judgment.]

---

## 7. Clarifying questions versus searching

Evidence:
- A CIKM 2024 study of 904 human-assisted conversational shopping sessions found asking clarifying questions early and recommending later improved search performance and satisfaction; clarifying questions help when needs are vague and are unnecessary when the first message is clear; but **more questions, more turns and longer waits lowered satisfaction**, and extra conversation time showed diminishing returns. Fine-grained keywords (more, narrower searches per turn) also raised the number of relevant products found (relevant products 1.24 / 2.17 / 3.41 for 1 / 2 / 3 keywords). https://pure.uva.nl/ws/files/292941595/3627673.3679875.pdf and https://dare.uva.nl/id/70b80505-4b22-4388-b918-57f94291aebe [S]. Caveat: wizard-of-oz setup, human assistants, not your agent.
- A student study in laptop shopping found users prefer to state their preferences first and then answer questions about what is missing or vague; closed (yes/no or option) questions are lighter than open ones: http://essay.utwente.nl/96002/1/Ignat_BA_EEMCS.pdf [S, small bachelor thesis, 9 participants, weak evidence].
- Production: ChatGPT shopping research asks follow-ups (brands, size ranges, performance vs price) at the start, then lets the user veto items while it runs: https://help.openai.com/en/articles/12911370-using-shopping-research-in-chatgpt [S].

### Decision rule for Agora
```
specific_product (brand+model given)        -> search now, no question
product_family, 1 key dimension missing     -> search now with the likeliest default,
  e.g. "iPhone 15"                             show a one-tap chip row: [128 GB] [256 GB] [Pro too?]
need_based ("laptop for video editing")     -> ask ONE question with 3-4 option buttons
                                               (budget range is the highest value one),
                                               then resolve to candidate models and search
contradictory/impossible (price too low)    -> say so, offer the nearest feasible option
```
Principle: **search first, refine after.** Show results immediately and put the open choice (storage, Pro or not, budget) as chips above them, so a miss costs one tap instead of one blocking question. Never ask more than one question before the first results. [Design synthesis from the sources above.]

---

# (a) Agora accuracy pipeline

Constraints: about 10 page reads per minute, 2 days, 2 people. Cost tags: R = page reads, T = LLM tokens only.

1. **Parse intent into JSON** (`need_type`, brand/family/model, `variant_must`, `variant_forbidden`, attributes, `excluded_kinds`, price min/max, condition, location, markets). One LLM call, JSON mode, schema above. T only. *Fixes:* wrong variant (Pro vs non-Pro, storage), accessories (via excluded_kinds), no use of numeric filters. Keeps everything downstream deterministic.
2. **Clarify only when needed**: need-based or contradictory requests get ONE option-button question; everything else searches immediately and shows adjustment chips. T only. *Fixes:* vague queries returning noise, without the satisfaction loss from long interviews.
3. **Resolve need-based requests to 3-6 concrete candidate models** (LLM, no web), then treat each as a specific product. T only. *Fixes:* "laptop for video editing" returning random laptops.
4. **Build per-marketplace requests from a small adapter table**: keyword query + price floor/ceiling + category id + condition + sort + radius, using the verified parameters in section 4 (Tori price/sort, Kleinanzeigen path filters, Vinted price/order, Marktplaats JSON API, eBay Browse API if you have an app token). Query A precise, query B broader only if A returns fewer than ~8 plausible rows. 1 R per site normally, 2 R worst case. *Fixes:* marketplaces' crude keyword search, accessories and repair services, one-query-per-site, 40k truncation (filtered pages are shorter and more relevant).
5. **Parse the page into compact rows, not markdown** (title, price, url, image, city, date): Tori JSON-LD, Marktplaats JSON `listings`, Kleinanzeigen/Vinted from embedded state or HTML. Drop to ~60-100 rows of ~200 chars. 0 extra R. *Fixes:* 40k-character cut-off, token waste, link/photo attachment (you already have url and image in the row, no HTML re-matching).
6. **Deterministic pre-filter**: price in range, forbidden variant tokens, accessory/repair/"wanted" words per language, price under ~40% of the candidate median, remove duplicates by normalized `(brand, model, variant, storage)` + price within 3% + same image/seller. 0 R, no tokens. *Fixes:* accessories and repair services mixed in, no dedup across sites.
7. **LLM verdict per row against the structured intent** (batched, one call for all rows): ESCI label E/S/C/I plus per-criterion `yes/no/unclear` for variant, storage, condition, price. Keep E (and S only if the user allows substitutes). T only. *Fixes:* wrong model variants, cases returned for "iphone 15", honest handling of missing info.
8. **Spend the page reads on the top ~6 `unclear` candidates**: fetch the listing page (or Marktplaats `attributes`), re-judge. At 10 R/min this is about 40 seconds. *Fixes:* storage/battery/defect uncertainty hidden in descriptions; stops guesses.
9. **Vision check on the final 3-6 photos** only for visual criteria (colour, actual item vs stock image, damage, box only). Tie-breaker, not a gate. *Fixes:* photo-only details (colour, scratches), scammy stock-photo listings.
10. **Rank and present**: score = verdict strength (E=1, S=0.5) + price rank within range + freshness + seller/condition; return 6-12 with per-item "matches / not confirmed" labels and group "also on" duplicates. Re-check link and price immediately before display (you already verify links). *Fixes:* unexplained results, stale items, duplicates.
11. **Offline eval harness** (section 6): 30 queries, frozen candidate cache, LLM-judge ESCI labels, report precision@5/10, accessory rate, wrong-variant rate, empty rate, reads used. Run after every change. *Fixes:* "no evaluation set", regressions, argument by anecdote.

# (b) Order to build (accuracy gained per hour of work, best first)

| Rank | Step | Est. work | Why it ranks here |
|---|---|---|---|
| 1 | Price floor/ceiling + sort + category in URLs for Tori, Kleinanzeigen, Vinted (step 4, partial) | 2-3 h | Verified parameters; removes cases and zero-price junk before the LLM; immediate visible win. |
| 2 | Structured intent JSON with `variant_must` / `variant_forbidden` / `excluded_kinds` (step 1) | 2 h | Single prompt change; unlocks every later step; directly fixes Pro/non-Pro. |
| 3 | Compact-row parsing, Tori JSON-LD and Marktplaats JSON API (step 5, Marktplaats API call in step 4) | 3-4 h | Kills the 40k truncation and the HTML photo matching; cheaper tokens; biggest per-request reliability gain. |
| 4 | LLM per-row ESCI verdict (step 7) | 2 h | The accessory/variant fix at the LLM level; reuses rows from step 3. |
| 5 | Deterministic pre-filter + dedup (step 6) | 2-3 h | Cheap rules catch most remaining junk for free; dedup is user-visible. |
| 6 | Eval harness, 30 queries (step 11) | 2 h | Build it right after step 3 so steps 4-6 are measured, not guessed; do it earlier if only one person is free. |
| 7 | Listing-page read for `unclear` items (step 8) | 2-3 h | Biggest boost for hard cases, but uses the scarce read budget, so after the cheap steps. |
| 8 | Clarify-vs-search logic and chips (step 2) | 2 h | Good UX and fixes vague queries, but only affects part of traffic. |
| 9 | Need-based candidate resolution (step 3) | 2 h | Impressive in a demo; do it if the demo includes need-based prompts. |
| 10 | Vision check (step 9) | 3 h | Lowest accuracy per hour; add only for final results and visual criteria. |
| 11 | eBay API, Back Market, Amazon, OLX adapters (rest of step 4) | 3-5 h each | Blocked from plain fetch or needs keys; do them only after a browser pass confirms the URLs. |

Suggested split for 2 people over 2 days: Person 1 does 1, 3, 5, 7. Person 2 does 2, 4, 6, then 8/9. Day 1 target: ranks 1-6 working with the eval table showing before/after. Day 2: ranks 7-9 plus demo rehearsal.

# (c) Systems to steal from

1. **Exa Websets**: after retrieval, verify every candidate against each user criterion with a three-valued verdict (`yes / no / unclear`) and keep the evidence, instead of trusting the retrieval rank. https://exa.ai/docs/websets/api-guide
2. **Amazon ESCI (Shopping Queries Dataset)**: label results Exact / Substitute / Complement / Irrelevant, so "case for iPhone 15" is a Complement and gets dropped. https://export.arxiv.org/pdf/2206.06588
3. **Zalando LLM-as-judge**: have the LLM write query-specific relevance guidelines (requirements with importance), then score each result on text plus image; use the same judge as your offline evaluator. https://engineering.zalando.com/posts/2024/11/llm-as-a-judge-relevance-assessment-paper-announcement.html
4. **Perplexity**: multi-stage funnel, wide cheap candidate set first, strongest model last, and work on small units (rows/spans) rather than whole pages. https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api
5. **Google AI Mode query fan-out / ChatGPT shopping research**: decompose a vague need into concrete criteria or candidates and search each one, asking one clarifying question up front only when needed. https://business.google.com/uk/think/search-and-video/google-shopping-ai-mode-virtual-try-on-update/ and https://help.openai.com/en/articles/12911370-using-shopping-research-in-chatgpt

(Honorable mentions: Etsy for LLM attribute extraction from listings, https://www.etsy.com/codeascraft/understanding-etsyas-vast-inventory-with-llms ; PricePirate/Idealo style `same_variant / multipack / different_product` offer classification, https://pricepirate.com/docs/en/solutions/price-data-api .)

---

## Caveats and gaps
- Probes were from one IP with plain curl; production access from Context.dev may behave differently. The Marktplaats JSON endpoint is undocumented and could change or be restricted; check site terms and rate limits before depending on it. [U]
- I found no primary engineering write-up for how idealo, Geizhals or PriceRunner match offers; section 3 relies on research papers, a vendor doc and a third-party dataset analysis. [U]
- Vision-check accuracy on second-hand photos is not quantified in any source I found. [U]
- The "forbidden variant tokens", "40% of median" and "3% price" thresholds are my heuristics, not published figures; tune them on the eval set.
- eBay, Back Market, Amazon.de and OLX parameters are unverified by me except the official eBay Browse API doc.
