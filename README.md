# Beeper: private, uncensored AI credit marketplace

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

## Database
Postgres stores users, balances (integer micro-dollars), an append-only ledger, API keys (SHA-256 hashes only),
orders, usage logs and listings. Schema lives in `db/migrations/*.sql`; `npm run build` applies pending
migrations automatically when `DATABASE_URL` is set (or run `npm run db:migrate`).

On Vercel: **Storage → Create Database → Neon (Postgres)** and connect it to the project: that sets
`DATABASE_URL`. Supabase works too (use the pooled connection string). Then redeploy.

Payments:
- **USDG on Robinhood Chain** (chain 4663): each order asks for a unique exact amount (total + sub-cent suffix)
  sent to `NEXT_PUBLIC_PAYMENT_ADDRESS`. The buyer pays from their Privy-connected wallet or any wallet/exchange;
  `POST /api/orders/:id/confirm` verifies the Transfer on-chain (by tx hash or by scanning logs) and credits once.
- **Card via Whop**: `POST /api/orders` creates a Whop checkout; the signed `payment.succeeded` webhook
  (`/api/payments/whop`) re-fetches the payment from Whop, checks order/amount and credits once.
- `PAYMENTS_MODE=test` settles orders instantly: local testing only.

Local dev without Privy:
```bash
DATABASE_URL=postgres://... DEV_AUTH_BYPASS=1 NEXT_PUBLIC_DEV_USER=did:privy:dev PAYMENTS_MODE=test npm run dev
```

## AI gateway
`POST /v1/chat/completions` and `GET /v1/models` are OpenAI-compatible. Requests authenticate with a Beeper key
(`sk-beeper-…`), are forwarded to OpenRouter (`OPENROUTER_API_KEY`) with `data_collection: deny`, and are billed
per token at the catalogue price in `lib/data.ts`. `max_tokens` is capped to what the balance can pay for;
streaming responses are billed from the final usage chunk (or an estimate if the client disconnects).

## Images
`POST /v1/images/generations` and the chat's image mode use the Venice API (`VENICE_API_KEY`), billed per image
(Venice price + margin). Prompts referencing minors are rejected for every model.

## Structure
- `app/page.tsx`: landing: hero chat demo, buy card, liquidity book, live buys, privacy tiers, model catalogue, API snippets, FAQ
- `app/sell`: list unused credits · `app/dashboard`: balance/usage (demo data)
- `app/api/me` · `keys` · `orders` · `listings` · `quote`: account & marketplace API (Postgres)
- `lib/data.ts`: models, liquidity book, fee & order-fill logic
- `lib/db.ts` · `lib/billing.ts` · `lib/keys.ts` · `lib/auth.ts`: database, ledger, API keys, Privy auth

## Before production
- Build the actual OpenAI-compatible gateway (`/v1/chat/completions`) that meters usage against keys and routes upstream.
- Write real Terms / Acceptable Use / Privacy pages, and check credit resale is allowed by each upstream provider's ToS.
