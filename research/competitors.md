# Agora: competitor research

Date: 2026-11-13. Method: about 29 DeepSeek search calls (results read as snippets; no full pages fetched). Vendor pages, Apify/PyPI/npm/Chrome Web Store listings, and press were treated as sources. Anything marked UNVERIFIED is a vendor claim or was not confirmed in a source I read. Coverage is not exhaustive.

Legend: USED = used/refurbished offers present. CL = private classifieds (Vinted, Kleinanzeigen, Leboncoin, Tori, Marktplaats, etc.). XB = cross-border.

---

## 1. Price comparison in Europe

### idealo (DE, AT, UK, FR, IT, ES)
- URL: https://www.idealo.de
- What: price comparison with price alarm (Preiswecker) and up to 12-month price history.
- Data: shop offers; method UNVERIFIED (crawl vs feed).
- USED: yes. A "Gebraucht" section exists (getestet.de, dated 2011). The 2026 Apify scraper schema has a usedOnly flag and offers with used/refurb condition.
- CL: not found (UNVERIFIED).
- XB: DE, AT, UK, FR, IT, ES (Apify scraper covers 6 country sites).
- Model: UNVERIFIED (shop-paid listings is the usual model; not confirmed here).
- Sources: https://apify.com/scrapifier/idealo-scraper/output-schema ; https://www.getestet.de/idealo-test/

### Geizhals (AT, DE, UK, PL)
- URL: https://geizhals.at , https://geizhals.de
- What: price comparison, price history, price alarms, EU-country offers in the app, trader ratings.
- Data: editorial product database plus trader offers (Wikipedia; offer method UNVERIFIED).
- USED: UNVERIFIED. No source confirmed used or refurbished offers on Geizhals. A 2026 B-Ware article benchmarks against Geizhals new prices.
- CL: no.
- XB: AT, DE, UK, PL (Wikipedia, 2022).
- Model: traders pay per click or per order; also display ads (Wikipedia).
- Sources: https://en.wikipedia.org/?title=Geizhals&oldid=1179029016 ; https://buy-european.net/de/produkt/geizhals ; https://notebooks-und-mobiles.de/sparen-mit-b-ware

### PriceRunner (SE, DK, UK) and Klarna Price Comparison (DE, AT, NL, FI, NO, FR, IT, ES, IE, US)
- URL: https://www.pricerunner.se , https://www.klarna.com (shopping)
- What: price comparison; Klarna-owned per Apify listing. Every store's offer per product, with shipping, stock and delivery days.
- Data: scraped server-rendered JSON on third-party actors; ReefAPI wraps the same offers.
- USED: yes at data level. ReefAPI offers endpoint filters by condition new, used, refurbished. Partner site Hittabillig states it shows new products only and excludes used and refurbished from its lowest price.
- CL: none found.
- XB: 13 markets (Apify actor).
- Model: UNVERIFIED (merchant-paid click-out is the usual model).
- Sources: https://reefapi.com/docs/pricerunner ; https://apify.com/normdata/pricerunner-scraper ; https://hittabillig.se/information/sa-har-jamfor-vi-priser

### Prisjakt / Hintaopas (FI, SE, NO, UK, NZ)
- URL: https://hintaopas.fi (Finnish brand of Prisjakt)
- What: Nordic price comparison; price alerts; 2-year price history (in scraper schema); reviews. The site says it shows all prices it knows, and profiled shops pay per click or a share of the order.
- Data: store prices, refreshed 3 to 5 times a day (site statement).
- USED: yes in data. The Apify scraper has lowestRefurbishedPrice and lowestUsedPrice fields. Whether the consumer site displays used offers: UNVERIFIED.
- CL: no. Not in Hintaopas. B2BLIX lists Hintaopas, Vertaa.fi, Hinta.fi and Kelkoo.fi as Finnish sources, with no Tori.
- XB: Nordics and UK, Ireland (site claim).
- Model: profiled stores pay per click or a share of order value (Hintaopas page).
- Sources: https://hintaopas.fi/information/nain-vertailemme-hintoja ; https://apify.com/normdata/prisjakt-scraper ; https://reefapi.com/docs/prisjakt ; http://b2blix.com/en/aggregators/countries/finland

### Tweakers Pricewatch (NL, BE)
- URL: https://tweakers.net/pricewatch/
- What: Dutch and Belgian price comparison, spec database, shop reviews. Separate classifieds section (Vraag & Aanbod) is not part of Pricewatch.
- Data: shop prices. An undocumented price-history endpoint exists (tweakers.net/ajax/price_chart/{id}/nl/), per a 2024 hobby project.
- USED: yes, refurbished. Refurbished Pricewatch launched in 2019 and is a separate table. Used offers are not in Pricewatch.
- CL: no evidence in Pricewatch. The Vraag & Aanbod classifieds sit on the same site.
- XB: NL and BE (since 2014).
- Model: affiliate click-out links (Awin in the example). Tweakers said in 2024 that Pricewatch income partly offsets lost ad revenue.
- Sources: https://github.com/tychobrouwer/tweakers-pricewatch ; https://www.daansmagazijn.nl/blogs/artikelen/ook-op-tweakers-te-vinden ; https://inct.nl:443/news/pdf/9757 ; https://en.wikipedia.org/wiki/Tweakers

### Skroutz (GR; also skroutz.mt)
- URL: https://www.skroutz.gr
- What: Greek price comparison plus marketplace. Launched cardom, a used-car platform with Avis (Feb 2025).
- USED: yes. Refurbished Grade A phones and laptops listed on skroutz.gr and skroutz.mt marketplace.
- CL: a forum post refers to "αγγελίες" (classifieds) in a Skroutz context. UNVERIFIED.
- XB: Greece and Malta seen.
- Model: marketplace commission. UNVERIFIED (a forum post with a commission claim is not a source).
- Sources: https://www.gocar.gr/news/feed/49455,skroutz_Ti_aytokinhta_poylaei_Se_poies_t.html ; https://www.skroutz.gr/c/5067/refurbished-kinhta-thlefwna/ ; https://www.skroutz.mt/s/69554928/

### Heureka (CZ, SK) and Ceneo (PL)
- URLs: https://www.heureka.cz , https://www.ceneo.pl
- What: national price comparison leaders. Heureka holds about 80% share in CZ. Ceneo lists offers from 18,000+ shops and belongs to the Allegro group.
- USED: UNVERIFIED for both. No used offers seen in sources.
- CL: no.
- XB: CZ and SK (Heureka); PL (Ceneo).
- Model: pay per click (Heureka: free up to 20 CZK, flat 3.49 CZK in search; Heureka help centre via getprofit). Marketplace commission (Heureka). Paid bidding for position.
- Sources: https://getprofit.pro/blog/comparison-shopping-engines-europe-ukraine ; https://www.woxo.cz/heureka-cz-czeskie-ceneo-pl/ ; https://www.similarweb.com/top-websites/e-commerce-and-shopping/price-comparison/

### Google Shopping (EU)
- URL: https://shopping.google.com
- What: product results with price, store and condition filter. Google Merchant Center requires a condition attribute (new, refurbished, used) for non-new items.
- USED: yes. Refurbished and used are supported in Merchant Center and the Google Ads API enum (NEW, REFURBISHED, USED). Demand Gen Discover does not show them yet.
- CL: no. Merchant feed only.
- XB: multi-country via Merchant Center.
- Model: CPC shopping ads paid by merchants.
- Sources: https://support.google.com/merchants/answer/6324469 ; https://developers.google.cn/google-ads/api/reference/rpc/v25/ListingGroupFilterProductConditionEnum.ListingGroupFilterProductCondition ; https://apify.com/parsebird/google-shopping-scraper

Also seen (not profiled): Hinta.fi and Vertaa.fi (FI, UNVERIFIED scope); Kelkoo (FR); Akakce, Cimri, Compari.ro, Pazaruvaj, PriceRunner, Geizhals, Heureka, Ceneo aggregated by the "European Price Comparison" Apify actor (https://apify.com/studio-amba/european-price-comparison).

**Answer to the key question (group 1):** none of the price engines above lists private classifieds (Vinted, Kleinanzeigen, Leboncoin, Tori, Marktplaats) in its lowest-price or ladder data as far as I could find. Used offers in these engines come from shops. Hittabillig explicitly excludes used.

---

## 2. Second-hand aggregators and meta-search

### euroscrape "EU Second-Hand Marketplaces Scraper" (Apify actor)
- URL: https://apify.com/euroscrape/eu-marketplace-deals
- What: searches EU second-hand marketplaces (incl. Vinted and OLX PL, PT, RO, BG) in parallel, converts prices to EUR, scores each listing against comparables (dealScore, priceVsMarketPct, priceAnomaly), builds a market summary across 18 countries, shows the best resale country and margin, and sends Telegram alerts on a schedule.
- Data: scraping (method not stated in snippet).
- USED: yes (used-focused, conditionNormalized, sellerType private/business).
- CL: yes. Vinted and OLX confirmed; full list UNVERIFIED.
- XB: yes, 18 countries.
- Model: Apify pay-per-result. Price UNVERIFIED.
- Note: no MCP interface mentioned. This is the closest existing data engine to Agora.

### Skarply
- URL: https://skarply.com
- What: paste a listing URL (Vinted, DBA, Kleinanzeigen); returns a fair-price range, a trust score (red, yellow, green), scam signals, and cheaper alternatives including refurbished or new. Chrome extension.
- Data: scrapes the listing; compares against similar sold or listed items across platforms (vendor claim).
- USED: yes.
- CL: yes. Vinted in 21 countries, DBA (DK), Kleinanzeigen (DE). Blocket, FINN, Marktplaats listed as coming.
- XB: yes (Vinted EU).
- Model: free plus EUR 1.99 per Pro analysis. Affiliate links for refurbished and new alternatives (Refurbed, Amazon) per FAQ.
- No watch-until-target evidence.

### All Second Hand
- URL: https://allsecondhand.app
- What: fans out one search across eBay, Kleinanzeigen, Marktplaats, Leboncoin, Vinted, Wallapop, Subito, Finn, Blocket, OLX, Reverb; saved auto-scans alert by email, Telegram, Discord, Slack or RSS. Solo-founder project, web app live about Aug 2026.
- USED: yes. NEW: no.
- CL: yes, all of the above.
- XB: yes.
- Model: pricing asked as a question on Indie Hackers: EUR 7 / 19 / 39 per month (UNVERIFIED as final).
- Price history, anomaly flag, MCP: not mentioned.
- Sources: https://www.indiehackers.com/product/all-second-hand ; https://www.indiehackers.com/post/how-all-second-hand-started-out-0R6FGhOsd6nevUe4zVEg

### GrailHound
- URL: https://apptopia.com/ios/app/6793456775/about (launched 18 Aug 2026)
- What: iOS app and web alerts across 50+ resale marketplaces (eBay, Facebook Marketplace, Vinted, Grailed, Kleinanzeigen, Leboncoin, Wallapop, Marktplaats, Subito, Willhaben, OLX and others). Price-cap alerts and natural-language AI filtering.
- USED: yes (resale-focused). NEW: partial via eBay.
- CL: yes.
- XB: yes (global).
- Model: first tracker free, Starter and Pro subscriptions.
- Price history, anomaly flag, MCP: not mentioned.
- Source: https://mwm.ai/it/apps/grailhound-marketplace-alerts/6793456775

### BuyHub
- URL: https://buyhub.app (listings: https://fastlaunch.io/projects/buyhub ; https://saasfame.com/item/buyhub)
- What: search for collectors and resellers across 100+ marketplaces in 110 countries. Radars alert on new matches; auction alarms; positive and negative keyword filters; results translated; Chrome and Firefox extension.
- USED: yes (auctions and resale). NEW: partial (eBay, Catawiki).
- CL: yes (Kleinanzeigen, Vinted, Wallapop, Leboncoin listed).
- XB: yes.
- Model: free plan (eBay and Catawiki, one radar). Starter USD 9.99 per month or 99 per year; Pro 199 per year; Max 299 per year (saasfame).
- Launched 7 Oct 2026. Directory copies of the same text: treat features as vendor claims. Mechanism UNVERIFIED.

### FlowMarket
- URL: https://flow-market.org
- What: Android app; one search across eBay, Vinted, Wallapop, Facebook Marketplace, Subito, Ricardo, Tutti, Anibis; 29 countries. Background alerts checked up to every 15 minutes.
- USED: yes.
- CL: yes.
- XB: yes (29 countries).
- Model: search free. Background alerts on paid Base plan.
- Price history and anomaly flag: not mentioned.

### Mira (mirasearch.ai, Italy)
- URL: https://www.mirasearch.ai
- What: AI search over second-hand listings from marketplaces, brands and independent shops (Vinted, Wallapop, Vestiaire Collective named). Launched 27 Oct 2025.
- USED: yes (second-hand and vintage). NEW: no.
- CL: yes.
- XB: European vision; scope UNVERIFIED.
- Model: B2B-first (traffic partnerships, affiliate commission, lead generation, data services). Free to end users.
- Claims over 1 billion products indexed (vendor claim, UNVERIFIED).
- Sources: https://www.startupbusiness.it/en/look-heres-the-ai-search-engine-for-second-hand-goods/148908/ ; https://www.adnkronos.com/Archivio/tecnologia/mira-laggregatore-ai-per-gli-acquisti-second-hand-in-italia_6T9JPDh03y5qHBc1o7qpsW

### AuctionMate (browser extension, Chrome and Edge)
- URL: https://microsoftedge.microsoft.com/addons/detail/auctionmate-%e2%80%94-price-track/nalllhnoohifibgekknbdplnjnnaklpk
- What: hides and highlights listings; price-change charts and background price checks; notes.
- USED: yes (auctions and classifieds). Polish focus.
- CL: yes (vinted.pl, kleinanzeigen.de, gumtree, Allegro Lokalnie, OLX).
- XB: per-site, no unified ladder.
- Model: free plus AuctionMate Pro.

### Also seen (not profiled)
- SecondMain (Chrome, FR): detects product on Amazon, searches Leboncoin, Vinted, Facebook Marketplace, eBay for used. v1.3.0, Feb 2026. https://chromewebstore.google.com/detail/secondmain-trouve-en-occa/ibnnihglegjopmhimecbaflodcfghecj
- FlipTip AI: photo-based resale scanner; sold-price comps; local marketplaces in 50+ countries incl. Vinted, Kleinanzeigen, Leboncoin, Wallapop, Marktplaats. USD 9.99 to 39.99 per month. https://theresanaiforthat.com/ai/fliptip-ai/
- Underpriced AI: photo valuation from eBay sold prices. https://underpricedai.com/whats-it-worth
- Tori Scraper (Apify, Finland): Tori new-listing alerts, price drops, "gone" listings as a sold signal. https://apify.com/accountable_eel/tori-listing-lookup
- refurbito.com (DE): comparison of refurbished providers (Back Market, Rebuy, Refurbed, Swappie, etc.). Refurbished only. https://refurbito.com/en/posts/best-refurbished-providers-germany

---

## 3. AI shopping agents

### ChatGPT shopping (OpenAI)
- URL: https://chatgpt.com/merchants/
- What: product discovery in chat. Instant Checkout launched 29 Sep 2025 on ACP (with Stripe) for Etsy and about 30 Shopify merchants. Retired or pivoted in March 2026 to discovery plus merchant-owned checkout (redirect to merchant site or a merchant app in ChatGPT).
- Data: merchant product feeds (ACP feed); Shopify Catalog auto-syndication for Shopify merchants. No live scraping evidenced.
- USED: UNVERIFIED (Etsy vintage is possible; not confirmed).
- CL: no.
- XB: US only per sources.
- Model: Instant Checkout had a 4% merchant fee (per UCP site). Discovery described as unsponsored (UCP site). Klarna's app in ChatGPT does take sponsored placements, so sponsored placement exists at least in apps.
- Sources: https://www.factualminds.com/blog/chatgpt-shopping-for-merchants-2026/ ; https://debutify.com/blog/ai-shopping-agents-guide-2026 ; https://theuniversalcommerceprotocol.com/what-is-agentic-ai-checkout-2026/ ; https://checkout.com/blog/openai-agentic-commerce-shift

### Google AI Mode and Universal Cart (UCP and AP2)
- URL: https://blog.google (UCP and Universal Cart announcements)
- What: UCP (Google with Shopify and others) launched Jan 2026. Universal Cart announced at I/O, May 2026: one cart across Search, Gemini, YouTube, Gmail; tracks price drops and price history; back-in-stock alerts; compatibility checks. Checkout via Google Pay or merchant site.
- Data: Shopping Graph (60B+ listings per Promptwatch, May 2026), Merchant Center feeds, UCP merchant endpoints at /.well-known/ucp, conversational attributes in Merchant Center.
- USED: Merchant Center supports the condition attribute. AI Mode coverage of used goods UNVERIFIED.
- CL: no.
- XB: UCP checkout US now, Canada and Australia next, UK later.
- Model: ads (Shopping, Direct Offers, YouTube Shopping) and Google Pay. Organic inclusion model UNVERIFIED.
- AP2 v0.2.0 (Apr 2026) adds "Human Not Present" payments: agents buy at a set time or price within mandate limits. Donated to the FIDO Alliance (TNW).
- Sources: https://thenextweb.com/news/google-universal-cart-agent-payments-shopping-io-2026 ; https://developers.googleblog.com/en/under-the-hood-universal-commerce-protocol-ucp/ ; https://promptwatch.com/glossary/ai-shopping

### Amazon: Alexa for Shopping (formerly Rufus), Buy for Me, Auto Buy
- URL: https://www.amazon.com (Alexa for Shopping)
- What: Rufus renamed Alexa for Shopping on 13 May 2026. Auto Buy: set a price target and the agent buys when the price is hit. Buy for Me: the agent navigates third-party brand sites, adds to basket and checks out inside Amazon.
- Data: first-party Amazon catalog; Buy for Me uses live navigation of third-party sites.
- USED: Amazon marketplace has used offers. Alexa coverage of used UNVERIFIED.
- CL: no.
- XB: Buy for Me reaches third-party retailer sites (country coverage UNVERIFIED for EU).
- Model: Amazon retail and ads. Amazon withdrew from Google Shopping ads in the US in July 2025.
- Legal: Amazon v Perplexity (Comet agent). Ninth Circuit vacated the preliminary injunction, Aug 2026.
- Sources: https://www.alixpartners.com/insights/102mvwb/ ; https://promptwatch.com/glossary/ai-shopping ; https://wizium.ai/no-mercy-from-machines

### Perplexity Shopping (Buy with Pro, Comet)
- URL: https://www.perplexity.ai
- What: shopping answers with PayPal checkout (Pro subscribers, US). Comet browser agent can shop on retail sites.
- Data: Shopify integration and web structured data (primary); limited feed.
- USED: UNVERIFIED.
- CL: no.
- XB: US focus.
- Model: subscription (Pro); Stellagent says zero fees to merchants (UNVERIFIED in detail).
- Sources: https://stellagent.ai/insights/ai-shopping-assistant-comparison-2026 ; https://promptwatch.com/glossary/ai-shopping

### Klarna Shopping Search (app in ChatGPT, launched 20 May 2026)
- URL: https://investors.klarna.com (press release)
- What: search inside ChatGPT over Klarna's Product Search MCP server: 100M+ products, 400M merchant listings, 13 markets. Results show price, availability and offers; click-through to merchant checkout.
- Data: Klarna's own commerce data feed (merchant-supplied, method UNVERIFIED).
- USED: UNVERIFIED.
- CL: no.
- XB: 13 markets incl. Nordics.
- Model: organic results by relevance plus labelled sponsored placements. Klarna is also a BNPL provider.
- Vipps (Nordic wallet) integrated Klarna's agentic search in Nov 2025 and reports 200k+ shoppers and about 8% conversion (third-party LinkedIn post; UNVERIFIED).
- Sources: https://investors.klarna.com/News--Events/news/news-details/2026/Klarna-launches-AI-powered-Shopping-Search-app-in-ChatGPT/default.aspx ; https://www.digitaltransactions.net/klarna-offers-a-shopping-search-app-as-bnpl-rivalry-grows/

### Phia (US; app and Chrome/Safari extension)
- URL: not captured in sources
- What: AI price check for new and resale items. "Should I buy this?" button; resale value; price-drop tracking and alerts; international shipping and tariff math.
- Data: scraping and partner data (method UNVERIFIED). Baidu Baike says it uses RealReal and Vestiaire Collective data (UNVERIFIED, weak source).
- USED: yes (resale datasets).
- CL: resale platforms, not peer classifieds.
- XB: US-based; international shipping calc.
- Model: commission on purchases through partners (Baidu Baike; UNVERIFIED). About 9,600 retail brand partners (People).
- Traction: 1.5M+ users, Series A USD 35M at USD 185M valuation (Jan 2026), total funding about USD 43.5M (People, May 2026). Founders Phoebe Gates and Sophia Kianni. Fashion-first.
- Baidu Baike reports fraud allegations in Aug 2026. UNVERIFIED, single source.
- Sources: https://www.businessoffashion.com/news/technology/phoebe-gates-co-founded-phia-raises-35-million-series-a/ ; https://people.com/phoebe-gates-shopping-app-phia-announces-35-million-new-funding-exclusive-11985884 ; https://www.tipranks.com/private-companies/phia

### Microsoft Copilot Checkout
- URL: not captured in sources
- What: checkout in Copilot for select merchants; MCP connectivity added in 2026.
- Data: Bing Shopping feed and web structured data.
- USED: UNVERIFIED. CL: no. XB: UNVERIFIED.
- Source: https://www.searchenginejournal.com/selling-to-ai-the-complete-guide-to-agentic-commerce/570452/

### NorthCinder (open-source agent layer)
- URL: https://github.com/cinderline/northcinder
- What: open-source MCP server that compares products from sources you choose and shows why it ranked them. Asks for a fresh, single-use approval per exact offer before any purchase. Local audit log. No hosted service.
- Data: Shopify, WooCommerce, eBay, Etsy adapters and read-only Amazon comparison.
- USED: eBay yes (UNVERIFIED for others). CL: no. XB: UNVERIFIED (US-centric adapters).
- Model: none (self-hosted).
- Closest architecture match to Agora's "agent shops and buys with approval" idea.

### Protocols (context)
- ACP: OpenAI with Stripe; Apache 2.0; beta. Spec tree 2026-04-17 adds feeds, carts, orders, auth, MCP (factualminds).
- UCP: Google with Shopify, Etsy, Wayfair, Target; launched Jan 2026; /.well-known/ucp discovery.
- AP2: Google; 60+ partners; v0.2.0 Apr 2026; FIDO Alliance.
- Visa Trusted Agent Protocol and Mastercard Agent Pay for payment credentials.
- Used-goods coverage: none of the protocols evidenced for used goods. They are built around merchant catalogs.

**Product data routes used by agents:** (a) merchant feeds (ChatGPT, Google); (b) protocol endpoints (UCP, Shopify Catalog); (c) first-party catalog (Amazon); (d) live site navigation (Amazon Buy for Me, Perplexity Comet); (e) licensed third-party catalog (Klarna, Phia). None showed a live EU classifieds feed.

---

## 4. Shopping MCP servers and agent-commerce tools

### Klarna Product Search MCP
- URL: https://investors.klarna.com (press)
- What: MCP server behind the Klarna Shopping Search app in ChatGPT. 100M+ products, 400M merchant listings, 13 markets.
- Data: Klarna commerce data (merchant-supplied; method UNVERIFIED).
- USED: UNVERIFIED. CL: no. XB: 13 markets incl. Nordics.
- Access: whether third-party agents can connect directly is UNVERIFIED.

### Shopify Global Catalog MCP and Storefront Catalog MCP
- URL: https://catalog.shopify.com/api/ucp/mcp ; https://shopify.dev/docs/agents/catalog
- What: tools search_catalog, lookup_catalog, get_product (UCP). No API key (agent profile header). Global covers all Shopify merchants; Storefront covers one store.
- USED: UNVERIFIED. CL: no.
- XB: Shopify merchants in many countries (EU coverage UNVERIFIED).
- Model: Shopify-managed; developer revenue share "coming" (Spring 26 Edition).
- Constraints that matter for Agora:
  - Price and availability cache limit: 10 to 15 minutes.
  - Product metadata cache: 24 hours.
  - "No bulk harvesting."
  - No use to build a standing product database or to train models.
  - REST Global Catalog API stops serving traffic on 2 Nov 2026.
- Sources: https://shopify.dev/docs/agents/catalog ; https://shopify-dev.shopifycloud.com/changelog/posts/global-catalog-rest-api-stops-serving-traffic-on-november-2-2026

### ShopSavvy Data API and MCP
- URL: https://shopsavvy.com/data/for-shopping-assistants
- What: product search, offers across tens of thousands of retailers, price history since 2011, deals feed. MCP connector free without a key (10 calls/min). Starter USD 49/mo, 1,000 credits.
- Data: retailer APIs and scraped offers (method UNVERIFIED for each).
- USED: UNVERIFIED.
- CL: no.
- XB: offers returned in USD only. US-centric.

### BuyWhere MCP
- URL: https://www.npmjs.com/package/@buywhere/mcp-server
- What: search, compare, get_price, affiliate link, catalog. Claims 11M+ products across Singapore, SEA and US (Lazada, Shopee, Amazon). Free API key.
- USED: UNVERIFIED. CL: no. XB: not Europe.

### NorthCinder
- See section 3. Open-source MCP; keyless local mode (`npx northcinder init`).

### pcprice.watch MCP (Claude connector)
- URL: https://www.pcprice.watch/check/mcp ; listing: https://agentdiscoverability.com/track/claude/pcprice-watch
- What: tools get_used_price (sold median and p25 to p75 over 30 and 90 days), check_ebay_listing (great, fair, above typical, overpriced; cheaper live listings that ship to the buyer), list_tracked_models. Free, no key.
- Data: eBay sold and active listings in US, UK, DE, FR, IT, ES, PL, every 8 hours; data CC BY 4.0.
- USED: yes (sold used PC parts and iPhones). NEW: no.
- CL: no (eBay only).
- XB: yes, 7 eBay markets converted to EUR.
- Model: free (UNVERIFIED how it is funded).
- Closest existing used-price verdict tool, but narrow category and one marketplace.

### Finland Shopping MCP
- URL: https://himcp.ai/server/finland-shopping-mcp ; https://github.com/xtofuub/suomi-shopping-mcp
- What: find_best_prices returns cheapest overall, cheapest new, cheapest used and used savings vs new. Sources: Hinta.fi (new), Tori.fi (used), Huuto.net (search link only, because of bot blocking).
- Data: HTML scraping; README warns selectors may break.
- USED: yes. NEW: yes. CL: yes (Tori). XB: no (Finland).
- Model: open-source (MIT per listing).
- Closest local analogue to Agora's MCP plus Finland new and used angle. Small project.

### Tori MCP (zeriaxdev)
- URL: https://glama.ai/mcp/servers/zeriaxdev/tori-scraper
- What: search Tori, get_item, analyze_price (percentile vs comparables). Asking prices only.
- USED: yes. CL: yes (Tori only). XB: no.

### Pricewatcha API and alerts
- URL: https://pricewatcha.com/api/v1/openapi.json ; listing: https://claudemarketplaces.com/mcp/io.github.pricewatcha/pricewatcha
- What: you add products; alerts on drop, rise, min or max threshold via email or webhook. Watch engine, not a listings source.
- USED: UNVERIFIED. CL: no. XB: UNVERIFIED.

### Other MCP and API tools seen
- Torob MCP (Iran, unofficial, 26 read-only tools; used via condition=used): https://pypi.org/project/torob-mcp/0.1.2/
- Shopino MCP (Iran, 14 read-only tools): https://pypi.org/project/shopino-mcp/0.4.1/
- datawebot (shop discovery; no price history by its own statement): https://github.com/datawebot/datawebot-mcp
- Forage Shopping MCP (search, compare, find_deals; no key; GBP examples): https://skillhub.360.com/skills/forage-shopping
- Price Tracker AI MCP (MEOK): track_price, get_price_history, set_alert, compare_prices. Data source UNVERIFIED: https://pypi.org/project/price-tracker-ai-mcp/1.0.6/
- E-Commerce Price Tracker (Apify MCP, Shopify stores): buy, wait or skip verdict. https://apify.com/ryanclinton/ecommerce-price-monitor/api/mcp
- Deal Quality Scorer (Apify MCP): fake-discount detection. https://apify.com/trovevault/deal-quality-scorer/api/mcp

Gap in this group: no EU-wide MCP with classifieds found.

---

## 5. Price trackers and alerts

### Keepa
- URL: https://keepa.com
- What: Amazon price history with separate lines for Amazon, new third-party, used, warehouse deals, BSR, Buy Box. Alerts by email, Telegram, push, RSS.
- Data: Amazon price capture (method UNVERIFIED).
- USED: yes (used price line on Amazon). CL: no.
- XB: 11+ Amazon locales.
- Model: free tier with charts and alerts. Premium about EUR 19.89 per month (per cheapcharts). API on paid plan (EUR 29 per month per ipdeep).
- Sources: https://www.cheapcharts.com/blog/amazon-price-tracker-5-best-tools-2026/ ; https://www.informedrepricer.com/blog/camelcamelcamel-vs-keepa-which-is-better-for-amazon-price-tracking

### CamelCamelCamel
- URL: https://camelcamelcamel.com
- What: free Amazon price history; email alerts (free account); Camelizer extension.
- Data: Amazon price capture (method UNVERIFIED).
- USED: yes (third-party used line). CL: no. XB: 8 Amazon locales.
- Model: free; no API.
- Sources: https://www.ipdeep.com/resources/amazon-price-trackers ; https://www.theverge.com/rss/how-to/index.xml

### PayPal Honey (Droplist)
- URL: https://www.joinhoney.com
- What: coupon auto-apply plus Droplist price tracking (Amazon and select stores). Price history 30 to 120 days on Amazon. Compares Amazon sellers including shipping.
- USED: not stated. CL: no. XB: 30,000+ sites (vendor claim).
- Model: affiliate commissions shared as Honey Gold rewards (its own description).
- Controversy: a 2024 investigation (MegaLag) alleged affiliate-cookie overwrite. Reported second-hand via a blog; UNVERIFIED primary.
- Sources: https://chromewebstore.google.com/detail/honey-automated-coupons-r/bmnlcjabgnpnenekpadlanbbkooimhnj ; https://frugalissimo.com/blog/honey-is-dead-what-actually-works/

### Amazon Auto Buy (Alexa for Shopping)
- URL: https://www.amazon.com
- What: sets a price target; the agent buys when it is met. The only mainstream "watch until under target, then buy" loop found.
- USED: UNVERIFIED. CL: no. XB: Amazon only.
- Source: https://www.alixpartners.com/insights/102mvwb/

### Zinc (Amazon price tracker with auto-buy)
- URL: https://www.zinc.com
- What: alerts, then purchase via API when rule fires (vendor blog). Mechanics UNVERIFIED.
- Source: https://www.zinc.com/blog/amazon-price-tracker-auto-buy

### Google Universal Cart price tracking and back-in-stock alerts (US, 2026)
- What: price-drop and back-in-stock alerts for items in the cart. Listed in section 3.
- Source: https://thenextweb.com/news/google-universal-cart-agent-payments-shopping-io-2026

### EU retail price alarms (idealo Preiswecker, Hintaopas hintavahti, Geizhals price alarm, Prisjakt)
- What: target-price alerts on comparison sites, mostly new goods. idealo shows price history up to 12 months.
- Sources: https://www.idealo.de/services/vorteile/idealo-app ; https://www.geizhals.de (app description)

### Travel "wait or buy" predictors (Hopper, Google Flights)
- What: predictive buy-or-wait for flights. The only consumer "wait or buy" prediction found; no retail equivalent.
- Source: https://smartwallettopic.com/price-drop-alert-tools-browser-extensions-time-big-purchases-sale-cycles (secondary)

---

## The gap

Agora as described has four parts. None of the players above does all four:
1. One ladder of new, refurbished and used offers across EU countries, including private classifieds.
2. A suspicious-cheap flag across that ladder.
3. A persistent watch that fires when any offer (classifieds included) falls under the user's target.
4. The same as an MCP tool for other agents.

Parts exist separately:
- Ladder of new and some used, no classifieds: idealo, Geizhals (used UNVERIFIED), PriceRunner/Klarna, Prisjakt/Hintaopas, Tweakers, Skroutz, Google Shopping.
- Classifieds, used only, no new ladder: All Second Hand, GrailHound, BuyHub, FlowMarket, Mira, AuctionMate, SecondMain, Tori Scraper.
- Fair-price or scam verdict: Skarply (single listing, no watch), euroscrape (EU-wide scores and anomaly flag, scraper actor), FlipTip and Underpriced AI (photo, eBay sold), pcprice.watch (eBay, PC parts, MCP).
- Watch to target: Keepa, CamelCamelCamel, Amazon Auto Buy, idealo, GrailHound, Pricewatcha.
- MCP: Klarna (new goods, 13 markets), ShopSavvy (US), BuyWhere (SEA), NorthCinder (open-source, US adapters), Finland Shopping MCP (FI, scraping), pcprice.watch (eBay).

Closest, ranked:
1. euroscrape EU Second-Hand Marketplaces Scraper: EU classifieds, deal score, anomaly flag, market summary, scheduled alerts. Closest engine; not a consumer product; no MCP mentioned.
2. Skarply: closest user-facing check on EU classifieds (fair price, trust score, cheaper alternatives). No watch, no MCP.
3. Klarna Shopping Search and Product Search MCP: closest on multi-merchant EU ladder through MCP and an agent. New goods only, sponsored placements.
4. Finland Shopping MCP: closest on Finland new plus used via MCP. Small, scraping, fragile.
5. NorthCinder: closest on "agent asks before buying" and neutral ranking. Self-hosted; no EU classifieds.
6. All Second Hand, GrailHound, BuyHub: closest on multi-classifieds alerts. Used only, no ladder or anomaly flag evident.
7. idealo and Prisjakt/Hintaopas: closest on ladder plus history plus alarm. No classifieds.

Finland specifically: Hintaopas and Hinta.fi cover new goods; Tori and Huuto are separate; the Finland Shopping MCP is the only tool found that puts Hinta.fi new and Tori used side by side. No consumer product does it.

Surprising:
- Klarna's MCP is already live inside ChatGPT (May 2026) and covers 13 markets including the Nordics. The new-goods ladder via agent exists.
- ChatGPT pulled back from in-chat checkout (March 2026). Google's UCP and Universal Cart now carry price-drop alerts and checkout for new goods.
- Amazon's Auto Buy is the one shipping "buy when under target" loop, Amazon-only.
- The euroscrape actor already runs EU-wide used deal scoring with Telegram alerts. The engine is commoditised; differentiation has to come from the new and used ladder, the watch, and the MCP layer.
- Shopify's Catalog terms cap price caching at 10 to 15 minutes and forbid building a standing product database. Any Agora design that uses Shopify catalog data must respect this.
- Phia has raised about USD 43.5M in total (fashion-first, US). Investors are funding the price-check-for-resale category.

Caveats: search snippets only, about 29 queries. Several claims are vendor marketing; flagged UNVERIFIED where not confirmed. No single product was found doing the full idea.
