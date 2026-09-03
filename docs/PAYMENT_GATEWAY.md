# Payment Gateway

The order flow now stops at `pending_payment` until a real payment provider is configured. The server creates a Stripe PaymentIntent and stores its provider/id/client secret on the order. It never changes an order to `paid` from a browser request.

## Production setup

1. Apply `supabase/migrations/003_create_orders.sql` and then `supabase/migrations/004_add_payment_intents.sql` to the production project.
2. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_PUBLISHABLE_KEY` on the server runtime.
3. Set `STRIPE_SECRET_KEY` as a server-only Vercel variable. Do not use a `VITE_` prefix.
4. Set `STRIPE_WEBHOOK_SECRET` and register `POST /api/webhooks/stripe` in the Stripe dashboard.
5. Add the Stripe publishable key and Stripe.js integration in the checkout UI. The client helper `createCustomerPaymentIntent()` returns the PaymentIntent client secret for that integration.

## API

`POST /api/orders/:id/payment-intent`

Requires the customer HttpOnly session cookie and the order owner. The endpoint is idempotent per order through Stripe's idempotency key. With no `STRIPE_SECRET_KEY`, it returns HTTP `503` with `stripe payment is not configured`.

Only verified `payment_intent.succeeded` events set `payment_status=paid`, `status=paid`, and `paid_at`; failed events return the order to `pending_payment`. The browser must not perform either transition.
