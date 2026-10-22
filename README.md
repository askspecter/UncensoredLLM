# Beeper — private, uncensored AI credit marketplace

Next.js 15 + Tailwind 4. Buy discounted LLM inference credits (filled from a liquidity order book, 5% fee) or sell unused credits.

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_PRIVY_APP_ID
npm run dev     # http://localhost:3000
npm run build && npm start
```

## Sign in (Privy)
Login uses [Privy](https://privy.io) with Google, email and wallet. Create an app at dashboard.privy.io,
enable Google / Email / External wallets under *Login methods*, add your domain (and `http://localhost:3000`)
under *Allowed origins*, then set `NEXT_PUBLIC_PRIVY_APP_ID`. Without it the site runs with sign-in disabled.
`POST /api/orders` requires a Privy access token, verified server-side against Privy's JWKS (`lib/auth.ts`).

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
