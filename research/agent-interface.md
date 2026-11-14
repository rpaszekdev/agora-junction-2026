# Agora as the agent door to European marketplaces: research (as of 2026-11-14)

Evidence grade used below: [P] primary source (spec, official docs, vendor's own page); [S] secondary (news, blog, third-party summary); [U] unverified or single weak source. Every claim carries a URL. Anything marked [U] should not go on a slide without a second check.

---

## 0. One-screen summary

```
LAYER            WHO                          CALLABLE BY A THIRD-PARTY AGENT?   PRIVATE SELLERS / 2ND-HAND?
---------------  ---------------------------  ---------------------------------  ---------------------------
checkout         OpenAI ACP (+Stripe)         no: ChatGPT is the agent           no (merchant feed + PSP)
checkout+disc.   Google/Shopify UCP           yes (MCP binding, open profile)    no (businesses only)
catalog          Shopify Global Catalog       yes, keyless, MCP                  no (Shopify merchants, new goods)
catalog          Klarna Product Search MCP    inside ChatGPT app; protocol open  no (retailer feeds, 13 markets)
auth/mandates    Google AP2, Visa TAP/VIC,    n/a (payment authority)            n/a
                 Mastercard Agent Pay
micropayments    x402 (Linux Fdn), MPP, L402  yes (HTTP 402)                     n/a
marketplaces     eBay (official, gated),      eBay: selected agents only         eBay yes (but gated)
                 Allegro (ChatGPT app)        Allegro: ChatGPT app only          Allegro mostly merchants
                 Vinted/Kleinanzeigen/Tori/   community scrapers, Apify actors   yes, but unofficial, no
                 Marktplaats                                                      provenance guarantees
```

Gap Agora can honestly claim: live, cross-site, normalised, evidence-backed reading of private-seller and second-hand classifieds in Europe, exposed as one MCP door. Honest caveats: (1) unofficial scrapers of Vinted/Kleinanzeigen/Marktplaats already exist as MCP servers and Apify actors, so "first" is not a claim; (2) the ChatGPT and Claude directories reportedly reject connectors that scrape without permission, which is a distribution risk (section 5); (3) no protocol covers payment for peer-to-peer classifieds, so "buying" in a demo must mean "hand the verified listing to the human".

---

## 1. State of agent commerce, November 2026

### 1.1 OpenAI Agentic Commerce Protocol (ACP)

- What it is: open standard (Apache 2.0) co-developed by OpenAI and Stripe, launched 2025-09-29, powers Instant Checkout in ChatGPT. [S] https://nventory.io/blog/acp-ucp-agentic-commerce-protocols-guide
- Two specs: Agentic Checkout (agent <-> seller, session lifecycle) and Delegate Payment (agent <-> PSP, scoped single-use token with amount/currency/expiry/merchant allowance). [P] https://www.agenticcommerce.dev/docs/concepts/architecture
- What an agent can call: nothing as a *third-party* agent. ACP endpoints are implemented by the merchant and called by ChatGPT. OpenAI is not merchant of record; merchant and its PSP handle settlement, refunds, chargebacks. [P] https://developers.openai.com/commerce/specs/payment
- Who can list: merchants who sign up at chatgpt.com/merchants and push a product feed (TSV/CSV/XML/JSON, accepted every 15 minutes). [P] https://agentic-commerce-protocol.com/docs/commerce/specs/feed (the snippet is dated 2026-08-21)
- Checkout eligibility needs `seller_privacy_policy` and `seller_tos`; a 3rd-party-seller feed must also name a `marketplace_seller` as point of checkout. [P] https://developers.openai.com/commerce/specs/file-upload/products?view=table
- Offer/product schema (feed record, JSON): `item_id, group_id, listing_has_variations, variant_dict, offer_id, title, description, url, brand, seller_name, image_url, price ("79.99 USD"), availability, condition (new|refurbished|used), product_category, shipping ("country:region:service_class:price:min_handling:max_handling:min_transit:max_transit"), return_deadline_in_days, target_countries (ISO 3166-1; docs example is "US", first entry used), geo_price, geo_availability`. [P] https://developers.openai.com/commerce/specs/file-upload/products
- Second-hand / private sellers: the schema has `condition: used|refurbished` and a doc note "always specify used or refurbished". But the onboarding path assumes a registered merchant with PSP and legal pages, so private individuals cannot list. Peer-to-peer coverage: none found. [P] same URL as above; the "no private sellers" part is my inference.
- Product-feed geo looks US-first (target_countries documented as US). EU rollout status: [U], not verified.

### 1.2 Google Universal Commerce Protocol (UCP)

- Announced Jan 2026 (NRF), co-developed with Shopify, Etsy, Wayfair, Target, Walmart; endorsed by Adyen, Amex, Best Buy, Mastercard, Stripe, Visa, Zalando and others; compatible with A2A, AP2, MCP. [P] https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/
- Discovery: businesses publish a profile at `/.well-known/ucp`; platform identifies itself per request via `UCP-Agent` header; both sides publish `signing_keys`. Capabilities are namespaced, e.g. `dev.ucp.shopping.checkout`, `.cart`, `.order`. [P] https://ucp.dev/specification/overview/
- Checkout has an MCP binding (`create_checkout`, `update_checkout`, `complete_checkout`, `cancel_checkout`; idempotency-key header; AP2 mandate extension). [P] https://github.com/universal-commerce-protocol/ucp/blob/98607bc53f6f5e43ec15b9f96b82cba4912f0fe4/docs/specification/shopping/checkout/mcp.md
- March 2026 additions: Cart (draft), Catalog (draft; live query of variants, price, stock), Identity Linking (stable, OAuth 2.0). Merchant Center onboarding via `native_commerce` attribute. [S] https://www.searchenginejournal.com/googles-ucp-update-carts-catalogs-and-loyalty-in-ai-shopping/571496/
- Google I/O May 2026: "Universal Cart" across retailers; UK/Canada/Australia rollout of UCP checkout "in coming months", hotels and food delivery next. [P] https://blog.google/intl/it-it/le-nuove-funzionalita-di-ucp-e-gli-strumenti-di-ai-di-google-per-i-retailer/ (Italian; summarised)
- Who can list: businesses acting as seller of record ("retailers remain the seller of record"). Poshmark appears in Google's Business Agent list (a branded chat agent, not a UCP catalog of private listings). [P] https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/
- Second-hand / private: not covered as a category. [my inference from "businesses only"]

### 1.3 Google AP2 and the payment-authority layer

- AP2 (Sept 2025): mandate model (Intent, Cart, Payment), payment-method agnostic, extension of A2A and MCP; v0.2 adds "human not present". Donated into FIDO Alliance working groups (Apr 2026) alongside Mastercard Verifiable Intent; x402 is an AP2 extension for stablecoins. [S] https://forkast.news/fido-alliance-bets-that-architecture-can-do-what-regulation-hasnt/
- Consumer trust datapoint: only 14% trust AI to execute purchases without direct verification (Product.ai survey, Apr 2026, as quoted). [S] same Forkast URL. Supports the "hand back to human" design.
- Visa: Intelligent Commerce (Apr 2025), Trusted Agent Protocol with Cloudflare (Oct 2025) to separate sanctioned agents from scrapers, Intelligent Commerce Connect (2026-04-08). Mastercard: Agent Pay (Apr 2025, agentic tokens), BVNK acquisition agreed Mar 2026. [S] https://www.forbes.com/sites/digital-assets/2026/06/07/visa-mastercard-and-coinbase-are-fighting-over-how-ai-agents-pay/ and https://github.com/custena/agent-payment-protocols
- Relevance to Agora: these answer "may this agent spend, and prove it". None of them find listings.

### 1.4 Shopify

- Global Catalog (all Shopify merchants, clustered by Universal Product ID): `https://catalog.shopify.com/api/ucp/mcp`; Storefront Catalog per shop: `https://{shop}/api/ucp/mcp`. Both expose `search_catalog`, `lookup_catalog` (50 ids global, 10 storefront), `get_product`. Keyless; agent profile required. [P] https://shopify.dev/docs/agents/catalog
- `search_catalog` input is wrapped in `catalog`: `query`, `context {address_country, language, currency, intent}`, `pagination {cursor, limit (default 10, max 250)}`. Response follows UCP catalog search: product with title, description, price range in minor units, media, variants, taxonomy, rating, cursor. [P] https://shopify.dev/docs/agents/catalog/storefront-catalog.md
- Old Storefront MCP catalog/cart tools were removed in favour of UCP. [P] https://shopify.dev/docs/apps/build/storefront-mcp.md
- Spring '26 Edition (June 2026): UCP and Catalog open to every developer, no approval; image search; "promoted placements" as future revenue path for builders; "AI searches powered by Shopify Catalog convert at 2x scraped data" (vendor claim). [P-vendor] https://www.shopify.com/news/spring-26-edition-dev
- Terms that matter to Agora's design: price/availability cache max 15 min, metadata 24 h, no standing product database or index without consent, no redistribution or resale, keep attribution params. [P] https://shopify.dev/docs/agents/catalog
- Second-hand: Shopify merchants only; some resale shops exist but no private-seller layer. [my inference]

### 1.5 Klarna

- Agentic Product Protocol (Dec 2025): open schema for products with persistent product IDs and multiple offers (price, stock, merchant) per product; attributes include brand, model, condition; claims 100M+ products, 400M+ prices. [P] https://www.klarna.com/international/press/introducing-klarnas-agentic-product-protocol/
- Klarna Shopping Search app in ChatGPT (2026-05-20) runs on Klarna's Product Search MCP server, 13 markets; user is redirected to merchant site for checkout; sponsored merchants labelled. [S] https://www.digitalcommerce360.com/2026/05/20/klarna-ai-shopping-search-app-openai-chatgpt/ and https://thepaypers.com//payments/news/klarna-rolls-out-shopping-search-app-in-chatgpt
- Merchants share feeds with Klarna; no private-seller path described. [P] press release above.
- Design lesson to copy: persistent product reference for "save for later / price alert", and redirect-to-merchant handoff. Same pattern Agora needs.

### 1.6 Amazon

- Closed to outside agents. Blocked Meta's Muse agent (Sept 2026, "unauthorised AI agent", agent allegedly did not identify itself). Own agents: Rufus (now Alexa for Shopping), Buy for Me (500k+ products from brand sites). [S] https://www.retailgazette.co.uk/blog/2026/09/amazon-blocks-metas-new-ai-shopping-agent-from-its-website/
- Perplexity Comet suit: preliminary injunction March 2026; Newsweek reports an appeals court vacated it in August, reasoning the customer is the one accessing the site. [S for injunction] https://hk.marketscreener.com/news/a-judge-temporarily-blocks-perplexity-s-ai-shopping-agent-on-amazon-ce7e5fdfdd8df426 ; [S/U for vacatur, single source] https://www.newsweek.com/how-ai-agents-are-changing-online-shopping-12590296
- Conflict to flag: Shopify's post lists Amazon among UCP supporters, while a Feb 2026 guide says Amazon joined neither ACP nor UCP. [S, conflicting] https://www.shopify.com/news/spring-26-edition-dev vs https://nventory.io/blog/acp-ucp-agentic-commerce-protocols-guide
- Lesson for Agora: read-side agent access to retail sites is legally and technically contested; identify your agent honestly and respect robots/ToS where you can.

### 1.7 Marketplace MCP servers

| Marketplace | What exists | Evidence |
|---|---|---|
| eBay | Official: "Agency Gateway" for selected external agents, local developer MCP for API discovery/testing, shopping agent to 3% of US users. Browse API search exists (OAuth app keys). Community `ebay-mcp` is seller-management. | [P] https://developer.ebay.com/cms/files/connect-2026/ebay_connect_nitzan.pdf ; [S] https://www.npmjs.com/package/ebay-mcp/v/1.16.0 ; https://composio.dev/toolkits/ebay |
| Allegro | ChatGPT app (2026-05-12), OpenAI partnership; 80M products, 150k+ merchants. Seller-side community connector on REST. | [P] https://en.media.allegro.pl/457628-allegro-launches-app-on-chatgpt-to-create-a-new-standard-in-conversational-e-commerce ; https://github.com/helpcode-ai/anythingmcp/blob/7d6395f08937de9528937ac436e5bc0bb7c0a16a/docs/catalog/connectors/allegro.md |
| Vinted | No official API; community MCP servers scrape (search_items, get_item, get_seller, compare_prices across 19-26 countries). One states "anti-bot protection" is the main pain. Another reads Vinted's page RSC data and fails with an explicit error if the page changes. | [S] https://github.com/DataKazKN/vinted-mcp-server ; https://pypi.org/project/vinted-search-mcp/0.1.0/ |
| Kleinanzeigen, Marktplaats, Subito, Wallapop, willhaben, Blocket, DBA, Finn, OLX | Apify actor "EU Second-Hand Marketplaces Scraper", 18 countries, deal score, alerts, MCP via Apify, from $0.70 per 1,000 listings delivered. | [S] https://apify.com/euroscrape/eu-marketplace-deals/api/mcp |
| Multi-site | `secondhand-mcp` (Facebook Marketplace, eBay Browse API, Depop, Poshmark), cloud tier $4.99. ToolRouter `marketplace-search` (eBay, FB Marketplace, Vinted, Gumtree, OLX...) says prices come from indexed listing text and can be stale. | [S] https://www.npmjs.com/package/secondhand-mcp ; https://skillhub.360.com/skills/blakefolgado/ecommerce-scraper |
| OLX | Seller-side connector only. | [S] https://github.com/helpcode-ai/anythingmcp/blob/f2d775bfa0917ed1b385c14b2ecec4cc8873cf29/docs/catalog/e-commerce.md |
| Tori (FI) | Nothing found. [U: absence of evidence] | search above |

Implication: the closest competitors are cheap per-listing scrapers. Agora's differentiators must be the things they do not promise: live verification with evidence, one normalised schema across sites, total cost with shipping, watches that notify, and a clean handoff.

### 1.8 Schema comparison (what an "offer" means today)

```
field            ACP feed        UCP/Shopify catalog       Klarna APP         Agora needs
---------------  --------------  ------------------------  -----------------  ------------------------
id               item_id/offer   gid://shopify/Variant     product id + offer stable offer_id (site+listing)
price            "79.99 USD"     minor units + currency    price per offer    amount + currency + EUR norm
condition        new/refurb/used (variant option, weak)    condition attr     5-step scale + raw text
seller           seller_name     shop                      merchant           type: private|business, rating
location         target_countries  address_country context  market             city/region/country, pickup
shipping         structured str  fulfillment (checkout)     -                  cost, method, known/unknown
freshness        feed 15 min     live query, cache 15 min  refreshed feeds    fetched_at per offer
provenance       -               attribution params        -                  source_url, evidence[], confidence
uniqueness       stock count     stock count               stock              single item, can vanish
```
All three assume many identical units from a merchant. A classified listing is a single unique item that can be sold in minutes; that is the schema gap.

---

## 2. How buying agents search today and where they fail

- Browser agents are being folded into super-apps: OpenAI said it would shut ChatGPT Atlas (stop date 2026-08-09) and fold Operator into ChatGPT agent; Google retired Project Mariner (2026-05-04) into Gemini agent/Chrome auto-browse. Single Chinese-language source with no cited primary link. [U] https://jishuzhan.net/article/2086311480948834306
- Anthropic's own docs: computer use is "the most general option and also the slowest", fresh screenshot after each batch of actions; "prefer narrower tools". [P] https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-combinations
- Success rates (all secondary, treat as ranges, not facts):
  - Live-web benchmark Online-Mind2Web: Operator 61%, Claude computer use 3.7 56.3%; only 2 of 6 agents over 50%; failed tasks used about 2x the steps of successful ones. [S] https://aiunpacker.com/guides/can-ai-browser-agents-actually-complete-tasks
  - Practitioner ranges: read-only research 80-90%, standard form-filling 70-85%, multi-step checkout 50-70%, with CAPTCHAs and bot detection named as causes. [U, blog] https://wowhow.cloud/blogs/computer-use-ai-agents-browser-desktop-automation-2026
  - One claim: 78 on WebArena but 22% real shopping-site order success. [U, no primary link] http://mp.weixin.qq.com/s?__biz=Mzk0MjY4MjcwOQ==&mid=2247483995&idx=1&sn=1050f675137f7c62ea48869f521fd7c7
- Cost: author's own estimate, not measured: 20-turn browser task about $0.21 (cached) to $1.06 (uncached) versus about $0.014 for one equivalent API call, i.e. 15x-75x. [U, calculation] https://aiunpacker.com/guides/can-ai-browser-agents-actually-complete-tasks . Anthropic's browser toolset adds about 6,600 input tokens per request (same source) [U].
- Speed and hallucination in production-style tests: Yutori's evaluation shows baseline agents stopping early and hallucinating a $255 fare, returning stale job listings, shifting return dates by one day from UI misgrounding. [P-vendor] https://yutori.com/blog/introducing-navigator
- Bot blocks: Visa launched Trusted Agent Protocol with Cloudflare to separate sanctioned agents from scrapers after a cited 4,700% surge in AI traffic to US retail. [S] https://www.forbes.com/sites/digital-assets/2026/06/07/visa-mastercard-and-coinbase-are-fighting-over-how-ai-agents-pay/ . Vinted scrapers cite anti-bot as the main failure. [S] https://github.com/DataKazKN/vinted-mcp-server
- Readiness testing vendor lists the failure stages agents hit on stores: delegated payment not accepted, CAPTCHA on returns, authorization header rejected. [S-vendor] https://tragent.io/
- Security: Anthropic's red-team figure for Claude in Chrome is referenced but truncated in my source. [U]
- Context.dev side: JS rendering, anti-bot and proxies included; blocked and failed requests not billed. [P-vendor] https://www.context.dev/web-scraping-api

Takeaway: for read tasks an API/tool call is cheaper, faster, and more testable than driving a browser; for the final purchase on a classifieds site the human is still needed. Numbers to use on stage should be ones we measure Friday (same query: Claude in Chrome vs Agora MCP, seconds and tokens).

---

## 3. Designing tools LLM agents use well

### 3.1 Anthropic, "Writing effective tools for agents" [P]
Source: https://www.anthropic.com/engineering/writing-tools-for-agents

- Build few, high-impact tools around workflows, not 1:1 API wrappers (`schedule_event` beats `list_users + list_events + create_event`; `search_contacts` beats `list_contacts`).
- Namespace by service/resource; prefix vs suffix has measurable effect, test it.
- Return high-signal context: names over UUIDs; offer a `response_format` enum (`concise`/`detailed`; their example 72 vs 206 tokens).
- Token efficiency: pagination, filtering, range selection, truncation with sensible defaults; Claude Code caps tool responses at 25,000 tokens by default; truncated responses should steer the agent ("make narrower searches").
- Errors: actionable, specific, not tracebacks or opaque codes.
- Descriptions: write them like onboarding a new hire; unambiguous parameter names (`user_id` not `user`); strict data models.
- Evaluate with realistic multi-call tasks, verifiable outcomes, and track runtime, number of calls, tokens, errors.

### 3.2 OpenAI function calling guidance [P]
Source: https://developers.openai.com/api/docs/guides/function-calling

- Fewer than 20 functions available per turn (soft); use tool search / `defer_loading` for the rest; namespaces for grouping.
- `strict: true` recommended; requires `additionalProperties: false` and all fields in `required` (optional = nullable type).
- Use enums and object structure so invalid states are unrepresentable; do not make the model fill values your code already knows; merge functions always called in sequence; "pass the intern test".

### 3.3 MCP specification features (2025-11-25) [P]
- Tools: names 1-128 chars from `[A-Za-z0-9_.-]`; `outputSchema` (JSON Schema) with `structuredContent`; servers MUST conform, clients SHOULD validate; also return serialised JSON in a text block for backward compatibility. https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Errors: tool execution errors use `isError: true` and "contain actionable feedback that language models can use to self-correct"; protocol errors are for malformed requests. Same URL.
- Annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`, `idempotentHint`) are untrusted unless the server is trusted; directories check them (3.4).
- Resource links in results let you return a pointer instead of a payload (e.g. a full evidence bundle). Same URL.
- Elicitation: form mode (flat primitive schema, never for secrets) and URL mode (out-of-band: OAuth, payment pages; `-32042 URLElicitationRequiredError`; optional `notifications/elicitation/complete`). https://raw.githubusercontent.com/xiaolai/anthropic-docs/refs/heads/main/skills/mcp-spec/SKILL-tools-resources-prompts.md (summary of the spec) and https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- Tasks (experimental in 2025-11-25): task-augmented requests; states `working | input_required | completed | failed | cancelled`; `ttl`, `pollInterval`, `tasks/get`, `tasks/result`, `tasks/cancel`, `tasks/list`; per-tool `taskSupport: forbidden|optional|required`; IDs must be bound to auth context or be high-entropy. https://modelcontextprotocol.org/specification/2025-11-25/basic/utilities/tasks . SDK exposes it under an experimental namespace. [S] https://safeguard.sh/resources/blog/mcp-tasks-explained-long-running-tool-calls-polling-cancellation-and-how-to-secure-them
- Notifications: `notifications/tasks/created` in the earlier SEP; whether Claude/ChatGPT/Gemini hosts surface server-initiated notifications to the model mid-conversation is [U]. Design for polling plus webhook, not notifications alone.

### 3.4 Directory-driven requirements [S]
Every tool needs a title, accurate annotations, narrow inputs, outputs free of debug metadata and internal ids, `structuredContent` valid against `outputSchema`. https://sunpeak.ai/blogs/pre-submission-testing-mcp-apps/ and https://www.agno.com/kb/guide/when-a-directory-rejects-your-submission

### 3.5 Concrete rules adopted for Agora (derived)

```
RULE                               WHY / SOURCE
---------------------------------  ----------------------------------------------
5 tools, prefix agora_             <20 (OpenAI), namespaced (Anthropic)
workflow tools, not site tools     one find_offers fans out to all sites internally
no site-specific params in input   agent states constraints, Agora picks sources
enums for condition, seller_type   invalid states unrepresentable (OpenAI)
default limit 10, max 25           keeps concise response well under 25k tokens
response_format concise|detailed   Anthropic; concise ~100 tokens/offer target
cursor pagination (opaque)         Shopify/UCP convention, Anthropic pagination
stable offer_id, human-readable    agents re-use ids across calls (Klarna lesson)
outputSchema + structuredContent   MCP spec; plus JSON in text block
errors: isError + "what to change" Anthropic + MCP spec
every offer carries evidence{}     section 4
watch = task-like handle + webhook polling-safe, spec-compatible
```

---

## 4. What an agent needs that a human page does not

```
HUMAN PAGE                           AGENT TOOL (Agora must give)
-----------------------------------  -------------------------------------------------
type in a search box, eyeball        structured constraints: price cap + currency,
                                     condition floor, country, max distance, seller type,
                                     must_have / exclude, max listing age
trust the logo                       machine-checkable evidence: source_url, fetched_at,
                                     extraction_method, checks[] (price_present,
                                     currency_matches_site, photo_reachable,
                                     listing_not_sold), confidence 0-1, why_matched
read "Good condition" in 8 languages one condition scale + raw text kept
see price, imagine shipping          price in one currency + FX date, total_cost with
                                     shipping known/unknown flag
bookmark                             stable offer_id that survives repeated calls
refresh the tab                      freshness guarantee: max_age_seconds input,
                                     fetched_at output, stale flagged
check back tomorrow                  async watch: create_watch + webhook or poll
click "Buy"                          handoff: structured summary + link + human confirm;
                                     never silent purchase
```
Supporting evidence for the "never silent purchase" and evidence design:
- Gartner (645 buyers): 67% prefer buying without a sales rep, yet 69% turned to a human to check what AI told them. [S] https://www.newsweek.com/how-ai-agents-are-changing-online-shopping-12590296
- AP2 models user authority as explicit mandates; "human not present" is a separate opt-in. [S] https://forkast.news/fido-alliance-bets-that-architecture-can-do-what-regulation-hasnt/
- Shopify's catalog marks AI-inferred fields with an "Inferred" label: the same idea as our `extraction_method` and `confidence`. [P] https://shopify.dev/docs/agents/catalog
- Honest limit: classifieds payment (Vinted buyer protection, in-person cash, bank transfer) has no agent protocol; handoff is the only responsible endpoint. [my inference]

---

## 5. Discovery and trust: how agents find and choose tools

| Channel | Facts | Use for Agora |
|---|---|---|
| Official MCP Registry | Preview; `server.json`; reverse-DNS names verified by GitHub or DNS; supports closed-source if the remote server is publicly reachable; meant to be consumed by downstream aggregators, not hosts directly. [P] https://modelcontextprotocol.io/registry/about.md | Publish `com.<yourdomain>/agora` Saturday if domain exists |
| Claude connectors directory | Remote MCP via claude.ai admin settings; two tiers (Community after automated scan, Verified by Anthropic); user-consent OAuth, no pure client_credentials; submission reportedly needs a Teams account. [S] https://vindler.solutions/blog/mcp-directories-2026-07-29-shipping-guide and https://node8.ai/kb/publishing-mcp-connectors-claude-chatgpt-copilot/ . Custom connectors can be added directly without listing. [S] node8 URL | Demo via custom connector, not directory |
| ChatGPT apps directory | Publisher verification, domain challenge, >=5 positive and 3 negative test cases, physical goods only for commerce, external checkout, advertising prohibited. [S] vindler URL above | Post-hackathon |
| Scraping risk | "Both directories reject connectors that act as unofficial pass-throughs to a third party's API or scrape sites without permission." [S, single secondary source] https://www.agno.com/kb/guide/when-a-directory-rejects-your-submission | Real risk for listing; ask Context.dev about permission posture. [U whether it applies to Context.dev-mediated reads] |
| A2A Agent Card | JSON at `/.well-known/agent-card.json`: name, description, `skills[]` (id, description, tags, examples), capabilities (streaming, pushNotifications), securitySchemes. [S] https://raw.githubusercontent.com/agentpatterns-ai/website/refs/heads/main/standards/agent-cards.md | Cheap to add; discovery value [U] |
| UCP `/.well-known/ucp` | For businesses that sell; Agora is not a seller of record | Do not claim it |
| llms.txt | Ahrefs: 97% of llms.txt files never fetched by anyone meaningful; agentic/coding tools are the main real consumers (10.5% of requests), AI retrieval bots 1.1%. [S] https://ahrefs.com/blog/llmstxt-study/ . Another report: 408 fetches in 500M AI-bot visits over 90 days. [S] https://raw.githubusercontent.com/oaknational/oak-open-curriculum-ecosystem/refs/heads/main/.agent/plans-backlog-2026-07/discovery/current/standards-verification-2026-09-09.report.md | Write one for coding agents integrating Agora, not for discovery |
| Tool search | OpenAI `tool_search` lets models load deferred tools by need. [P] https://developers.openai.com/api/docs/guides/function-calling | Good descriptions are the ranking signal |

What makes an agent prefer one source (evidence is thin; mostly inference):
1. Description clarity and non-overlap (Anthropic, OpenAI guidance above) [P].
2. Correct annotations so hosts can auto-approve read-only calls; Claude uses hints for auto-permissions. [S] https://www.agno.com/kb/guide/when-a-directory-rejects-your-submission
3. Fresher, evidence-bearing, smaller responses (token cost, fewer retries). [my inference]
4. Verified namespace/publisher identity. [P] https://modelcontextprotocol.io/registry/about.md
5. Retailer-side protocols win on "can complete checkout"; Agora wins only where they have no inventory. [my inference]
No public data found on host-side ranking of competing MCP servers. [U]

---

## 6. Business model options when the customer is an agent

Cost floor (Context.dev): 1 credit per page; 5 with AI JSON extraction; blocked/failed not billed; paid plans from $20/month for 10,000 credits and 1,000 free credits/month per its own page [P-vendor] https://www.context.dev/web-scraping-api . A third-party profile says $25 Developer and 500 one-time free credits [S, conflicting] https://www.respan.ai/market-map/context-dev . Check the live pricing page. At $0.002/credit (from $20/10k), a find_offers fan-out of 8 pages is about $0.016 with CSS parse, about $0.08 with AI JSON per page [my calculation; verify].

| Model | What exists | Notes |
|---|---|---|
| Per-call, API key credits | Apify actor $0.70 per 1,000 listings delivered; secondhand-mcp cloud $4.99 after free tier; ToolRouter credits, `discover` shows live price, anonymous account auto-provisioned, claim link for human to add credits. [S] Apify, secondhand-mcp, skillhub URLs in 1.7 | Price pressure: scrapers are ~$0.0007/listing. Sell verified + normalised, not raw rows |
| x402 micropayments | HTTP 402 with USDC on Base/Solana/Stellar; x402 Foundation under Linux Foundation (2026-04-02) with Visa, Mastercard, Stripe, Google, AWS, Cloudflare, Coinbase; V2 Dec 2025. Reported adoption: 100M+ payments, but CoinDesk found declining weekly counts, ~$0.20 average, much test traffic. [S] https://github.com/custena/agent-payment-protocols . Stripe added x402 USDC on Base (Mar 2026). [S] https://www.chaincatcher.com/ru/article/2278782 | Real MCP examples price at $0.003-$0.015/call with spend caps and payTo allowlists (swaphunt-mcp). [S] https://pypi.org/project/swaphunt-mcp/ ; middleware like payclaw exists [S] https://pypi.org/project/payclaw/0.1.0/ |
| Referral / commission | Shopify "promoted placements": future commission path for catalog builders; Klarna labels sponsored merchants; Google "Direct Offers" ads in AI Mode. [P/S] Shopify, Klarna, Google URLs above | For classifieds: affiliate programs at Vinted/Kleinanzeigen/Tori unknown [U]. Paid ranking would damage the "verified, neutral" pitch |
| Merchant-side fees | Shopify, Klarna monetise sellers/ads | Not applicable to private sellers |

Recommendation (my judgement): free tier (e.g. 20 calls/day) plus API-key credits at roughly $0.02-0.05 per find_offers and cheaper verify/watch ticks; add x402 as an opt-in second rail only if time allows, since agent-paid volume is still unproven. Skip referral until the data is clean.

---

## (a) Agora MCP, proposed

Five tools, prefix `agora_`. All annotated read-only except create_watch (additive write). Schemas are JSON Schema 2020-12; every input object has `additionalProperties: false`; optional fields have explicit defaults. Money is `{amount, currency}` with amount as a decimal string to avoid float drift.

Shared definitions (referenced as `$defs`):

```json
{
  "$defs": {
    "Money": {
      "type": "object",
      "properties": {
        "amount": { "type": "string", "pattern": "^[0-9]+(\\.[0-9]{1,2})?$", "description": "Decimal string, e.g. \"149.00\"." },
        "currency": { "type": "string", "pattern": "^[A-Z]{3}$", "description": "ISO 4217, e.g. EUR, SEK, PLN." }
      },
      "required": ["amount", "currency"],
      "additionalProperties": false
    },
    "Condition": {
      "type": "string",
      "enum": ["new", "like_new", "good", "fair", "for_parts"],
      "description": "Agora's single scale. new=sealed or unused with tags; like_new=no visible wear; good=light wear, fully working; fair=heavy wear, fully working; for_parts=broken or incomplete. Order is best to worst."
    },
    "Evidence": {
      "type": "object",
      "properties": {
        "source_url": { "type": "string", "format": "uri", "description": "The exact page the data was read from." },
        "fetched_at": { "type": "string", "format": "date-time", "description": "UTC time this offer was read live." },
        "age_seconds": { "type": "integer", "minimum": 0 },
        "extraction_method": { "type": "string", "enum": ["css_rules", "ai_json_schema", "site_api"], "description": "How fields were extracted. ai_json_schema fields may be wrong; check confidence." },
        "checks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "enum": ["price_present", "currency_matches_site", "photo_reachable", "listing_not_sold", "title_matches_query", "location_parsed"] },
              "passed": { "type": "boolean" }
            },
            "required": ["name", "passed"],
            "additionalProperties": false
          }
        },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1, "description": "Agora's estimate that price, condition and availability are correct right now. Below 0.6: call agora_verify_offer before recommending." }
      },
      "required": ["source_url", "fetched_at", "age_seconds", "extraction_method", "checks", "confidence"],
      "additionalProperties": false
    },
    "Offer": {
      "type": "object",
      "properties": {
        "offer_id": { "type": "string", "description": "Stable id like tori:5821734. Same listing gives the same id across calls. Pass it to the other tools." },
        "title": { "type": "string" },
        "price": { "$ref": "#/$defs/Money" },
        "price_eur": { "type": ["string", "null"], "description": "Price converted to EUR for comparison; null if FX unavailable." },
        "fx": { "type": ["object", "null"], "properties": { "rate": { "type": "number" }, "date": { "type": "string", "format": "date" } }, "additionalProperties": false },
        "shipping": {
          "type": "object",
          "properties": {
            "mode": { "type": "string", "enum": ["pickup_only", "shipping_available", "shipping_included", "unknown"] },
            "cost": { "anyOf": [{ "$ref": "#/$defs/Money" }, { "type": "null" }], "description": "null when mode is unknown or the site shows no fixed cost." }
          },
          "required": ["mode", "cost"],
          "additionalProperties": false
        },
        "total_cost_eur": { "type": ["string", "null"], "description": "price + shipping in EUR to the buyer's delivery_country; null if shipping cost is unknown. Never guessed." },
        "condition": { "$ref": "#/$defs/Condition" },
        "condition_raw": { "type": "string", "description": "Seller's own wording, original language." },
        "seller_type": { "type": "string", "enum": ["private", "business", "unknown"] },
        "location": {
          "type": "object",
          "properties": { "city": { "type": ["string", "null"] }, "region": { "type": ["string", "null"] }, "country": { "type": "string", "pattern": "^[A-Z]{2}$" }, "distance_km": { "type": ["number", "null"] } },
          "required": ["city", "region", "country", "distance_km"],
          "additionalProperties": false
        },
        "site": { "type": "string", "description": "e.g. tori.fi, vinted.de, kleinanzeigen.de, marktplaats.nl." },
        "url": { "type": "string", "format": "uri", "description": "Direct listing link. Agora never redirects through its own domain." },
        "photo_url": { "type": ["string", "null"], "format": "uri" },
        "listed_at": { "type": ["string", "null"], "format": "date-time" },
        "match": {
          "type": "object",
          "properties": {
            "score": { "type": "number", "minimum": 0, "maximum": 1 },
            "reasons": { "type": "array", "items": { "type": "string" }, "description": "Plain sentences, e.g. \"Model WH-1000XM5 in title\"." },
            "unmet_constraints": { "type": "array", "items": { "type": "string" }, "description": "Soft constraints this offer misses, e.g. \"distance 212 km > 150 km\"." }
          },
          "required": ["score", "reasons", "unmet_constraints"],
          "additionalProperties": false
        },
        "evidence": { "$ref": "#/$defs/Evidence" }
      },
      "required": ["offer_id", "title", "price", "shipping", "condition", "seller_type", "location", "site", "url", "match", "evidence"],
      "additionalProperties": false
    }
  }
}
```

### Tool 1: `agora_find_offers`

Description (as the model sees it): "Search live European second-hand and refurbished listings (Tori, Vinted, Kleinanzeigen, Marktplaats and more) for one product need and return verified, comparable offers. Use this first for any 'find me a used/refurbished X' request. Returns at most `limit` offers sorted by total_cost_eur (cheapest first, unknown shipping last), each with the source URL, fetch time and confidence. Prices are read live (default max age 15 minutes), not from a stored index. Do not use it to check one known listing (use agora_verify_offer) or to wait for a future price drop (use agora_create_watch). If sites_failed is non-empty, results are partial; say so to the user. Does not buy anything."

Input schema:

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "minLength": 2, "maxLength": 200, "description": "Product wanted, as specific as possible: brand, model, variant. Example: \"Sony WH-1000XM5 black\". Do not put prices or places here; use the fields below." },
    "max_price": { "anyOf": [{ "$ref": "#/$defs/Money" }, { "type": "null" }], "default": null, "description": "Highest item price. null = no cap." },
    "min_condition": { "$ref": "#/$defs/Condition", "default": "fair", "description": "Worst acceptable condition; offers at this level or better are returned." },
    "countries": { "type": "array", "items": { "type": "string", "pattern": "^[A-Z]{2}$" }, "minItems": 1, "maxItems": 10, "default": ["FI"], "description": "ISO 3166-1 alpha-2 countries whose marketplaces to search, e.g. [\"FI\",\"DE\",\"NL\"]." },
    "delivery_country": { "type": "string", "pattern": "^[A-Z]{2}$", "default": "FI", "description": "Where the buyer wants the item. Used for shipping cost and total_cost_eur." },
    "near": { "anyOf": [{ "type": "object", "properties": { "city": { "type": "string" }, "max_distance_km": { "type": "integer", "minimum": 1, "maximum": 1000 } }, "required": ["city", "max_distance_km"], "additionalProperties": false }, { "type": "null" }], "default": null, "description": "For pickup-only listings. null = ignore distance." },
    "seller_type": { "type": "string", "enum": ["any", "private", "business"], "default": "any" },
    "max_listing_age_days": { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 },
    "must_include": { "type": "array", "items": { "type": "string" }, "maxItems": 5, "default": [], "description": "Words that must appear in the title or description, e.g. [\"box\",\"warranty\"]." },
    "must_exclude": { "type": "array", "items": { "type": "string" }, "maxItems": 5, "default": [], "description": "e.g. [\"defect\",\"for parts\",\"case only\"]." },
    "max_age_seconds": { "type": "integer", "minimum": 0, "maximum": 3600, "default": 900, "description": "Freshness limit. 0 forces a live re-read (slower, costs more)." },
    "limit": { "type": "integer", "minimum": 1, "maximum": 25, "default": 10 },
    "cursor": { "type": ["string", "null"], "default": null, "description": "next_cursor from a previous response; keep all other fields identical." },
    "response_format": { "type": "string", "enum": ["concise", "detailed"], "default": "concise", "description": "concise omits condition_raw, photo_url, listed_at, evidence.checks and match.reasons (about 100 tokens per offer). detailed returns everything." }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

Output schema:

```json
{
  "type": "object",
  "properties": {
    "offers": { "type": "array", "items": { "$ref": "#/$defs/Offer" } },
    "summary": {
      "type": "object",
      "properties": {
        "returned": { "type": "integer" },
        "total_matches_found": { "type": "integer" },
        "sites_queried": { "type": "array", "items": { "type": "string" } },
        "sites_failed": { "type": "array", "items": { "type": "object", "properties": { "site": { "type": "string" }, "reason": { "type": "string", "enum": ["blocked", "timeout", "layout_changed", "rate_limited"] } }, "required": ["site", "reason"], "additionalProperties": false } },
        "price_eur": { "type": "object", "properties": { "p25": { "type": ["string", "null"] }, "median": { "type": ["string", "null"] }, "p75": { "type": ["string", "null"] } }, "additionalProperties": false, "description": "Distribution of all matches found, not just returned; lets the agent judge whether a price is a bargain." },
        "searched_at": { "type": "string", "format": "date-time" }
      },
      "required": ["returned", "total_matches_found", "sites_queried", "sites_failed", "searched_at"],
      "additionalProperties": false
    },
    "next_cursor": { "type": ["string", "null"] },
    "guidance": { "type": ["string", "null"], "description": "Plain-language hint when results are truncated, empty or partial, e.g. how to widen the search." }
  },
  "required": ["offers", "summary", "next_cursor", "guidance"],
  "additionalProperties": false
}
```

Error style (returned with `isError: true`, text block): `"max_price.currency must be an ISO 4217 code such as EUR; got 'euros'. Retry with currency \"EUR\"."` and for zero results: `"No offers matched in FI, DE. 41 were excluded by min_condition=good. Retry with min_condition=fair, or add countries such as NL, SE."`

Example call and response (illustrative data; every value is invented for documentation):

```json
{
  "name": "agora_find_offers",
  "arguments": {
    "query": "Sony WH-1000XM5",
    "max_price": { "amount": "180.00", "currency": "EUR" },
    "min_condition": "good",
    "countries": ["FI", "DE"],
    "delivery_country": "FI",
    "must_exclude": ["defekt", "vika"],
    "limit": 2
  }
}
```

```json
{
  "structuredContent": {
    "offers": [
      {
        "offer_id": "tori:61827340",
        "title": "Sony WH-1000XM5 kuulokkeet, musta, laatikko mukana",
        "price": { "amount": "139.00", "currency": "EUR" },
        "price_eur": "139.00",
        "fx": null,
        "shipping": { "mode": "shipping_available", "cost": { "amount": "6.90", "currency": "EUR" } },
        "total_cost_eur": "145.90",
        "condition": "like_new",
        "seller_type": "private",
        "location": { "city": "Espoo", "region": "Uusimaa", "country": "FI", "distance_km": 18 },
        "site": "tori.fi",
        "url": "https://www.tori.fi/item/61827340",
        "match": { "score": 0.96, "reasons": ["Model WH-1000XM5 in title", "Black matches query", "Box included"], "unmet_constraints": [] },
        "evidence": {
          "source_url": "https://www.tori.fi/item/61827340",
          "fetched_at": "2026-11-14T10:41:07Z",
          "age_seconds": 12,
          "extraction_method": "css_rules",
          "checks": [],
          "confidence": 0.93
        }
      },
      {
        "offer_id": "kleinanzeigen:2874412901",
        "title": "Sony WH-1000XM5 Kopfhörer silber, wenig benutzt",
        "price": { "amount": "128.00", "currency": "EUR" },
        "price_eur": "128.00",
        "fx": null,
        "shipping": { "mode": "unknown", "cost": null },
        "total_cost_eur": null,
        "condition": "good",
        "seller_type": "private",
        "location": { "city": "Hamburg", "region": "Hamburg", "country": "DE", "distance_km": null },
        "site": "kleinanzeigen.de",
        "url": "https://www.kleinanzeigen.de/s-anzeige/2874412901",
        "match": { "score": 0.81, "reasons": ["Model WH-1000XM5 in title"], "unmet_constraints": ["colour silver, query said black is not required but listing differs from usual black"] },
        "evidence": {
          "source_url": "https://www.kleinanzeigen.de/s-anzeige/2874412901",
          "fetched_at": "2026-11-14T10:41:09Z",
          "age_seconds": 10,
          "extraction_method": "ai_json_schema",
          "checks": [],
          "confidence": 0.71
        }
      }
    ],
    "summary": {
      "returned": 2,
      "total_matches_found": 17,
      "sites_queried": ["tori.fi", "vinted.fi", "kleinanzeigen.de", "vinted.de"],
      "sites_failed": [{ "site": "vinted.de", "reason": "blocked" }],
      "price_eur": { "p25": "142.00", "median": "163.00", "p75": "178.00" },
      "searched_at": "2026-11-14T10:41:10Z"
    },
    "next_cursor": "ag_c_8f31d0",
    "guidance": "Partial: vinted.de was blocked. 15 more matches available via next_cursor. Kleinanzeigen shipping cost is unknown; ask the seller or open the listing."
  },
  "content": [{ "type": "text", "text": "2 offers returned (17 found). Cheapest total: tori:61827340 at 145.90 EUR. vinted.de failed (blocked). Full JSON in structuredContent." }]
}
```
(The `checks` arrays are empty here because `response_format` defaulted to concise.)

### Tool 2: `agora_verify_offer`

Description: "Re-read one known listing live and report whether it is still available and whether price or condition changed since Agora last saw it. Call this before telling the user an offer is good, and always before agora_prepare_handoff. Takes an offer_id from agora_find_offers, or a listing URL on a supported site. Read-only. Typical latency 3-10 seconds."

Input:
```json
{
  "type": "object",
  "properties": {
    "offer_id": { "type": "string", "description": "From agora_find_offers. Provide exactly one of offer_id or url." },
    "url": { "type": "string", "format": "uri", "description": "Listing URL on a supported marketplace." }
  },
  "oneOf": [{ "required": ["offer_id"] }, { "required": ["url"] }],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "offer_id": { "type": "string" },
    "status": { "type": "string", "enum": ["active", "sold", "removed", "reserved", "blocked", "unknown"], "description": "active = listing page shows it purchasable now. blocked/unknown = Agora could not tell; do not present as available." },
    "changes": {
      "type": "array",
      "items": { "type": "object", "properties": { "field": { "type": "string", "enum": ["price", "condition", "shipping", "title"] }, "was": { "type": "string" }, "now": { "type": "string" } }, "required": ["field", "was", "now"], "additionalProperties": false }
    },
    "offer": { "anyOf": [{ "$ref": "#/$defs/Offer" }, { "type": "null" }], "description": "Current state; null if removed." },
    "recommendation": { "type": "string", "enum": ["safe_to_hand_off", "recheck_with_seller", "do_not_proceed"] }
  },
  "required": ["offer_id", "status", "changes", "offer", "recommendation"],
  "additionalProperties": false
}
```

### Tool 3: `agora_create_watch`

Description: "Start a background watch for a product need and get notified when a matching offer appears or its price drops. Use when the user says 'tell me when' or nothing acceptable exists today. Returns a watch_id at once; checking happens every 15 minutes for up to expires_in_days. Results arrive by webhook if webhook_url is given, otherwise fetch them with agora_check_watches. Additive write: creates one watch; does not buy or contact sellers."

Input:
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "minLength": 2, "maxLength": 200 },
    "max_price": { "$ref": "#/$defs/Money" },
    "min_condition": { "$ref": "#/$defs/Condition", "default": "good" },
    "countries": { "type": "array", "items": { "type": "string", "pattern": "^[A-Z]{2}$" }, "minItems": 1, "maxItems": 10, "default": ["FI"] },
    "delivery_country": { "type": "string", "pattern": "^[A-Z]{2}$", "default": "FI" },
    "trigger": { "type": "string", "enum": ["new_match", "price_drop", "either"], "default": "either" },
    "expires_in_days": { "type": "integer", "minimum": 1, "maximum": 30, "default": 14 },
    "webhook_url": { "type": ["string", "null"], "format": "uri", "default": null, "description": "HTTPS endpoint. Agora POSTs {watch_id, event_id, offer} signed with header X-Agora-Signature (HMAC-SHA256). null = poll only." }
  },
  "required": ["query", "max_price"],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "watch_id": { "type": "string" },
    "status": { "type": "string", "enum": ["active"] },
    "expires_at": { "type": "string", "format": "date-time" },
    "check_interval_minutes": { "type": "integer" },
    "delivery": { "type": "string", "enum": ["webhook", "poll"] },
    "baseline_offers_seen": { "type": "integer", "description": "Matches already live now; these will not trigger events." }
  },
  "required": ["watch_id", "status", "expires_at", "check_interval_minutes", "delivery", "baseline_offers_seen"],
  "additionalProperties": false
}
```
Spec note: this could instead be an MCP task (task-augmented `tools/call`, `ttl` up to 30 days); I recommend plain tool + watch_id for the weekend because host support for Tasks is [U].

### Tool 4: `agora_check_watches`

Description: "List the user's active Agora watches and any new events (new matching offer or price drop) since a cursor. Read-only. Call it when the user asks 'any news on my alerts' or at the start of a session that mentions a previous search."

Input: `{ "watch_id": {"type":["string","null"],"default":null,"description":"null = all watches"}, "since_cursor": {"type":["string","null"],"default":null} }` with `additionalProperties:false`.
Output: `{ "watches": [ { "watch_id", "query", "status": "active|expired", "expires_at" } ], "events": [ { "event_id", "watch_id", "type": "new_match|price_drop", "offer": Offer, "previous_price": Money|null, "occurred_at" } ], "next_cursor": string|null }`.

### Tool 5: `agora_prepare_handoff`

Description: "Prepare the purchase for the human to complete. Call only after agora_verify_offer returned recommendation=safe_to_hand_off and the user said they want this item. Agora does not pay, message the seller, or reserve the item. Returns a one-page summary link and the direct listing link; show both to the user and tell them the last step happens on the marketplace. Read-only except for creating the summary page."

Input:
```json
{
  "type": "object",
  "properties": {
    "offer_id": { "type": "string" },
    "buyer_note": { "type": ["string", "null"], "maxLength": 500, "default": null, "description": "Optional: what the user asked for, e.g. 'must include box'. Shown on the summary page." }
  },
  "required": ["offer_id"],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "handoff_url": { "type": "string", "format": "uri", "description": "Agora page with the verified summary, evidence, checklist and one button to open the listing. Expires in 24 h." },
    "listing_url": { "type": "string", "format": "uri" },
    "summary": { "type": "string", "description": "Two sentences the agent can read aloud." },
    "total_cost_eur": { "type": ["string", "null"] },
    "checklist_for_human": { "type": "array", "items": { "type": "string" }, "description": "e.g. 'Ask seller for serial number', 'Use the platform's buyer protection, not bank transfer'." },
    "risk_flags": { "type": "array", "items": { "type": "string", "enum": ["private_seller_no_protection", "shipping_cost_unknown", "price_far_below_median", "low_confidence_extraction", "new_seller_account"] } },
    "agora_took_payment": { "type": "boolean", "const": false },
    "expires_at": { "type": "string", "format": "date-time" }
  },
  "required": ["handoff_url", "listing_url", "summary", "total_cost_eur", "checklist_for_human", "risk_flags", "agora_took_payment", "expires_at"],
  "additionalProperties": false
}
```
Optional upgrade: if the client declared the `elicitation` capability with URL mode, also open `handoff_url` via `elicitation/create {mode:"url"}`; client support is [U], so the URL stays in the output regardless. https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation

Annotations: find/verify/check/prepare: `readOnlyHint:true, openWorldHint:true`; create_watch: `readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:false`.

---

## (b) Why an agent would choose Agora

1. Retailer protocols (ACP, UCP, Shopify Catalog, Klarna) already cover new goods from merchants who opted in, and an agent should use them first for those. 2. None of them lists a single used item from a private seller on Tori, Vinted, Kleinanzeigen or Marktplaats, which is where much European second-hand supply sits, so for "find me a used X" Agora fills a hole instead of competing. 3. Community scrapers and Apify actors reach some of those sites too, but they return raw rows, so Agora's pitch is one normalised schema with total cost, condition on one scale, and per-offer evidence (source URL, fetch time, confidence) the agent can check instead of trusting. 4. It is one tool call that fans out to many sites and returns a short ranked list, which costs the agent a fraction of the tokens, time and bot-block risk of driving a browser through each site. 5. It will not pretend to buy: it verifies the listing is still live and hands the final step to the human, because no protocol exists for paying private sellers and agents that over-promise lose the user's trust.

Risks to say out loud if asked: unofficial access to marketplaces can break or be blocked, directories may reject scraping-based connectors, and a platform could ship an official agent API tomorrow (eBay and Allegro are already moving).

---

## (c) Build this weekend: minimum for a convincing 30-second demo

Goal: Claude (or Gemini CLI) with the Agora MCP attached finds, verifies and prepares a purchase in one conversation, faster and with better evidence than a browser agent doing the same.

Build list (in order, cut from the bottom):

1. Remote MCP server, Streamable HTTP, TypeScript or Python SDK, three tools only: `agora_find_offers`, `agora_verify_offer`, `agora_prepare_handoff`. Each with `outputSchema`, `structuredContent` plus text block, `isError` messages with "what to change". Test every tool in MCP Inspector first. Spec: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
2. Three live sources through Context.dev, e.g. Tori, Kleinanzeigen, Vinted (or the three you already have working). Use `formats.parse` CSS rules where stable (no extra credits) and JSON-schema extraction as fallback (5 credits). Return `sites_failed` honestly instead of hiding a block. https://www.context.dev/data-extraction-api
3. Normalisation: condition map to the 5-step enum, EUR conversion with FX date, `total_cost_eur` null when shipping unknown, stable `offer_id = site:listing_id`.
4. Evidence block populated for real: `fetched_at`, `source_url`, `extraction_method`, `checks`, `confidence` (simple heuristic is fine: css_rules and all checks pass = 0.9+, AI extraction = 0.6-0.8).
5. Handoff page: one static-style page at `handoff_url` with photo, price, total, evidence, checklist, big "Open on Tori" button. Reuse the existing chat page styles.
6. Connect it: Claude custom connector (supported without directory listing per https://node8.ai/kb/publishing-mcp-connectors-claude-chatgpt-copilot/) and Claude Code `claude mcp add --transport http agora <url>`. Gemini CLI as the second client if it takes under 30 minutes [U on setup details]. Run once with a real demo account, record a backup video.
7. Cache layer with `max_age_seconds` honoured (in-memory is fine) and pre-warmed fixtures for the demo query so the live call cannot embarrass you.
8. Only if time remains: `agora_create_watch` with a fake trigger button on the handoff page that fires one webhook/poll event, to show the async story. Do not build x402, OAuth, registry publishing, or A2A card this weekend.

Demo script (about 30 seconds):

```
0:00  User types to Claude (Agora connector attached):
      "Find a used Sony WH-1000XM5 under 180 euros, deliverable to Helsinki. Check it's
       still for sale and get me ready to buy the best one."
0:05  Claude calls agora_find_offers   -> screen shows 3 sources, 2 offers,
                                          confidence and fetch time visible
0:12  Claude calls agora_verify_offer  -> status active, price unchanged
0:17  Claude calls agora_prepare_handoff -> link
0:20  Claude: "Best total 145.90 EUR on Tori, verified 10 s ago. Agora doesn't pay;
       open the page to finish."
0:23  Click handoff_url: summary, evidence, checklist, button to the Tori listing
0:30  Split-screen caption: same task in Claude in Chrome = N minutes (measure Friday)
```
Success criteria: three tool calls visible, evidence fields visible, total wall time measured, handoff page opens the exact live listing, one failure path shown (e.g. one site reported as `blocked` and the agent saying so).

Pre-flight checks Saturday: (1) confirm Context.dev permits this use and what the real pricing and rate limit are on your plan (conflicting figures above), (2) confirm you can legally and ToS-wise read each demo site at demo volume, (3) pick the demo query where all three sites genuinely have fresh listings, (4) time the Claude in Chrome baseline once so the claim on the slide is yours, not a blog's.

---

## Open questions and unverified items

- ACP feed geography beyond the US and EU availability: [U].
- Whether Amazon is a UCP participant: sources conflict (section 1.6).
- Appeals court vacating the Amazon v. Perplexity injunction: single source (Newsweek).
- Atlas shutdown and Mariner retirement: single non-English source.
- Browser-agent success and cost figures: all secondary or author estimates.
- Host support for MCP Tasks, server notifications, and URL-mode elicitation across Claude, ChatGPT, Gemini: not verified.
- Whether directories treat Context.dev-mediated reads as "scraping without permission": not verified; the rejection rule comes from one secondary guide.
- Context.dev pricing: two sources disagree (1,000 free credits per month at $20 vs 500 one-time at $25).
- No Tori-specific MCP or API found; official eBay agent access is gated ("selected external agents").
- Illustrative example data in section (a) is invented; do not present it as real listings.
