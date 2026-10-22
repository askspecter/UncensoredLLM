# Umbra — private, uncensored AI credit marketplace

Next.js 15 + Tailwind 4. Buy discounted LLM inference credits (filled from a liquidity order book, 5% fee) or sell unused credits.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

## Structure
- `app/page.tsx` — landing: hero chat demo, buy card, liquidity book, live buys, privacy tiers, model catalogue, API snippets, FAQ
- `app/sell` — list unused credits · `app/dashboard` — balance/usage (demo data)
- `app/api/quote` · `app/api/orders` · `app/api/listings` — marketplace API
- `lib/data.ts` — models, liquidity book, fee & order-fill logic · `lib/store.ts` — in-memory store

## Before production
- Replace `lib/store.ts` with a real database.
- Issue API keys only after payment confirmation (BTCPay / NOWPayments / Stripe) — see TODO in `app/api/orders/route.ts`.
- Build the actual OpenAI-compatible gateway (`/v1/chat/completions`) that meters usage against keys and routes upstream.
- Write real Terms / Acceptable Use / Privacy pages, and check credit resale is allowed by each upstream provider's ToS.
