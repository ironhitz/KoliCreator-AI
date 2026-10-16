# KoliCreator AI

KoliCreator AI is a mobile-first creator storefront and monetisation workspace. Creators can publish priced offers, accept PayPal sandbox payments, review server-verified captures, and use an AI revenue agent to draft ideas and campaigns from creator-reported inputs.

> **Hackathon sandbox build.** PayPal is locked to sandbox credentials. Sandbox checkout is not a production payment service and no real money moves. Creator payouts, subscriptions, digital-file delivery, and production payment processing are not implemented.

## What works

- Supabase email/password sign-up and sign-in; creator profiles are created by a database trigger.
- Public creator URLs at `/creator/{username}`, published products, optional public cover images in Supabase Storage, and fixed tip options.
- Private digital product files for PDF, EPUB, ZIP, MP3, M4A and MP4 offers; verified buyers receive expiring signed downloads after capture confirmation.
- PayPal Orders v2 order creation on the server, buyer approval at PayPal, server-side capture, order/amount/currency verification, and idempotent capture records.
- PayPal webhook signature verification, duplicate event handling, and completed/partial/full refund tracking.
- RLS-protected creator product and transaction access, database-backed API rate limits, and basic audit records.
- Verified revenue summaries with configurable estimated fees, date and offer filters, product performance, and server-paginated AG Grid Community transaction details.
- Authenticated server-side AI revenue plans, deterministic target-gap sales arithmetic, editable product suggestions, launch steps, campaign drafts, and transaction insights.
- Responsive dashboard, storefront, sign-in, checkout-return and cancellation screens.
- Creator social profile links on public pages and a downloadable QR/share card for cross-platform sharing; creators keep publishing and managing their audiences on the external platforms.

AI inputs are creator-reported, not verified audience analytics. Sales quantities are arithmetic scenarios, not conversion estimates or revenue guarantees. Campaigns are never published automatically.

The AI revenue planner and transaction insight use the creator's verified sales, refunds, and product catalogue from the six calendar months ending in the current month. This context is re-read and aggregated in the database for each request; no separate AI memory is stored and data is not used to fine-tune a model.

## Stack

- Next.js App Router, TypeScript, React
- Supabase Auth, PostgreSQL, Row Level Security, and Storage
- PayPal Orders v2 API, sandbox only
- OpenAI API, server-side only
- AG Grid Community for transaction analytics
- Render Blueprint in `render.yaml`

## Local setup

Prerequisites: Node.js 22 and npm.

1. Create a Supabase project.
2. Apply the SQL files in [`supabase/migrations/`](supabase/migrations/) in filename order, using the Supabase SQL Editor or Supabase CLI. The initial migration creates the tables, RLS policies, profile trigger, rate-limit function, storage bucket and storage policies; later migrations add the service-role-only AI learning aggregate, creator social-profile links, database security hardening, private digital-product delivery, saved Revenue Agent plans, and transaction analytics. Before applying `202610160004_database_security_hardening.sql`, `202610160005_digital_product_delivery.sql`, `202610160006_creator_ai_plans.sql`, or `202610160007_transaction_analytics.sql` to an existing project, take a database backup and review the policies they replace or add. These later migrations are provided for manual application and have not been run against a live Supabase project.
3. Create `.env.local` using the variable names in the [Environment variables](#environment-variables) table. Keep the service-role key server-side; local environment files are ignored by Git and must never be committed.
4. Create PayPal sandbox REST app credentials and set `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`. Do not use live credentials.
5. Set `OPENAI_API_KEY` for AI routes. The dashboard and payment routes can be explored without AI, but generation returns a setup error until the key is configured.
6. Install and run:

   ```bash
   npm ci
   npm run dev
   ```

7. Sign up in the app with a demo creator email, password, display name and unique lowercase username. The database trigger creates the creator profile. For a hackathon test account, use a dedicated email and never put a real person's password in this repository. If Supabase email confirmation is enabled, confirm the address before signing in.
8. Create a published offer in the dashboard. Open its public storefront URL and use a PayPal sandbox personal/buyer account to approve the checkout. The return page asks the server to capture and verify the approved order; only a completed PayPal capture appears in revenue.

For a repeatable demo, create one creator test account and one PayPal sandbox buyer account in the respective provider dashboards. No credentials or fake transaction rows are committed here.

## Environment variables

| Variable | Used for | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project endpoint | Browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser auth/RLS client | Browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted payment, webhook and AI data operations | Server only; bypasses RLS |
| `PAYPAL_ENV` | Must be `sandbox`; the API helper rejects other values | Server only |
| `PAYPAL_CLIENT_ID` | PayPal sandbox OAuth client | Server only in this implementation |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox OAuth secret | Server only |
| `PAYPAL_WEBHOOK_ID` | Registered PayPal sandbox webhook identifier | Server only |
| `OPENAI_API_KEY` | Server-side Revenue Agent and transaction insights | Server only |
| `OPENAI_MODEL` | Model name; defaults to `gpt-4o-mini` | Server only |
| `NEXT_PUBLIC_PLATFORM_FEE_RATE` | Planning-only fee assumption; defaults to `0.05` | Browser-visible assumption |

The public fee rate is an estimate, not PayPal's actual processing fee or a creator payout calculation. New offers can be priced in USD, EUR, GBP, CAD, or AUD. Revenue Agent inputs and its target-gap arithmetic remain USD-based; dashboard totals keep currencies separate rather than converting them.

Social links are public profile URLs only: no social-platform OAuth, audience import, analytics sync, or automatic publishing is performed. The creator page and its QR code are designed to be shared from social bios, posts, messages, or printed materials while creators continue using their existing platforms.

## PayPal sandbox test

1. In the PayPal Developer Dashboard, create a sandbox REST app and copy its client ID and secret into server environment variables.
2. Deploy the Render service or use a secure public tunnel for local testing. Register `{APP_URL}/api/paypal/webhook` as a sandbox webhook, subscribe to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and `PAYMENT.REFUND.COMPLETED`, then set the resulting webhook ID as `PAYPAL_WEBHOOK_ID` and redeploy.
3. Sign in as the creator, publish an offer, and open the storefront in a separate/private browser session.
4. Start checkout and approve it with a sandbox buyer account. Confirm the return view says **Payment verified**, then confirm the capture ID and amount appear in the creator dashboard.
5. Use the Postman collection at [`postman/KoliCreator AI Sandbox.postman_collection.json`](postman/KoliCreator%20AI%20Sandbox.postman_collection.json). Set `baseUrl`, `creatorUsername`, and `productId`; run **1. Create product order**, open the returned `approvalUrl` in a browser and approve with the sandbox buyer, then run **3. Capture approved order**. It also succeeds idempotently if the browser return already captured the order. AI requests additionally need a current Supabase access token in `supabaseAccessToken`.
6. Test cancellation by cancelling at PayPal. Test refunds through the PayPal sandbox account/API and verify the signed refund webhook updates the refund column and estimated net. Do not fabricate webhook headers in Postman; invalid signatures are rejected.

The Postman collection is supplied for repeatable requests. It has not been executed against a live sandbox from this workspace because provider credentials and an accessible webhook URL are not configured.

## Render deployment

This project is configured for Render in [`render.yaml`](render.yaml). In Render, create a Blueprint from the GitHub repository, enter the secret values when prompted, and deploy. `NEXT_PUBLIC_*` variables must be available at build time as well as runtime. Apply the Supabase migrations before using the service. After the first deployment, register the public PayPal webhook URL, add the webhook ID, and redeploy.

Render was selected as the requested hosting target, but this workspace has not created a Render service or a public demo URL. A Render account and Supabase, PayPal sandbox, and OpenAI credentials are required to complete that external setup.

## Development checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The unit suite covers payment capture validation, digital delivery eligibility, currency aggregation, and money formatting. End-to-end PayPal, Storage, and webhook testing still requires the external sandbox setup above.

## Sponsor tools: actual status

| Tool | Status |
| --- | --- |
| AG Grid | **Used in the running app.** AG Grid Community renders sortable, filterable and paginated transaction analytics. |
| Postman | **Collection provided.** The collection covers order creation, capture and authenticated AI routes. Postman itself was not run in this workspace because sandbox credentials are unavailable. |
| APIMatic Context Plugin | **Not used.** The plugin was not available in this coding environment; no APIMatic-assisted implementation is claimed. |
| Render | **Deployment target configured.** A Blueprint is included, but the service has not been deployed and no hosted URL is claimed. |

The YouTube demo video is also an external deliverable and has not been recorded or published from this workspace.

## Security and production boundary

- PayPal client secrets, service-role credentials and the AI key are only read in server modules. The frontend never receives a service-role key or PayPal secret.
- Product prices and currencies are loaded from published server-side product records. Tip values are bounded and persisted before order creation.
- Captures must match a stored checkout and PayPal order, custom checkout reference, expected amount, currency and completed status. Browser return parameters alone cannot mark an order paid.
- Capture IDs, checkout IDs, refund IDs and webhook event IDs are unique in the database. PayPal request IDs are deterministic per checkout.
- Webhook signatures are verified using PayPal's verification API. Creator product and payment records are protected by RLS; server routes use the service role only after validating the request/user or PayPal event.
- The app does not collect or store card credentials. Rate limits are database-backed; audit logs contain event metadata, not secrets.
- The later database-hardening migration explicitly separates API grants from row-level policies, removes unexpected legacy policies on KoliCreator application tables, restricts profile updates to public profile fields, limits product image size/types in Storage, and keeps payment/refund/audit/rate-limit data unavailable to anonymous and authenticated table access except for creator-owned read policies.
- Default privileges for objects created by the `postgres` role in `public` are tightened. Future tables, sequences, and RPC functions must receive deliberate grants and RLS policies; do not assume an unreviewed migration is safely exposed to API roles.
- Sandbox captures are clearly labeled. The configurable fee estimate is not a PayPal fee, actual balance, or payout. There are no live payments, subscriptions, creator payouts, tax calculations, chargeback workflows, or production fulfilment guarantees.

## Hackathon submission summary

KoliCreator AI helps creators turn self-reported audience and revenue context into monetisation experiments, publish reviewed offers, and inspect verified PayPal sandbox transactions. PayPal Orders v2 is used for server-created orders and server-side capture; signed webhook events provide a second verified event path. AI suggestions and campaigns are drafts requiring creator review. AG Grid is the live analytics sponsor integration, the Postman collection is included for reproducible sandbox calls, and Render is the configured deployment target. APIMatic was not used; no deployed demo or public video is claimed until those external steps are completed.