
# Hyuna Telegram Store Bot 🌸

Cute Telegram store bot built with Node.js + Telegraf.

## Included

- `/start` pink/cute welcome menu
- Products:
  - Gemini Pro / Flow — ₱100
  - CapCut Pro — ₱150
  - ChatGPT Shared — ₱450
  - Canva Pro — ₱30
- My Orders
- Payment Guide
- Channel button
- Contact Admin
- Order IDs like `HYU-AB12`
- ChatGPT manual delivery up to 12 hours
- Canva Gmail collection + manual invite flow
- Gemini/CapCut stock-based delivery
- Admin payment confirmation
- Admin credential delivery
- Order status tracking

## Setup

1. Install Node.js 18+.
2. Run:

```bash
npm install
```

3. Copy `.env.example` to `.env`.
4. Put your Telegram bot token and admin details in `.env`.
5. Put your welcome image at:

```text
assets/hyuna-welcome.png
```

6. Start:

```bash
npm start
```

## Admin Commands

```text
/paid HYU-XXXX
```
Marks payment as confirmed and triggers the correct product flow.

```text
/deliver HYU-XXXX email@example.com password
```
Delivers a manual account to the buyer.

```text
/canva_done HYU-XXXX
```
Marks Canva invitation as delivered.

```text
/stockadd gemini email@example.com password
/stockadd capcut email@example.com password
```
Adds stock for automatic delivery after payment confirmation.

```text
/orders
```
Shows recent orders.

## Payment Integration

The project currently includes `/paid` as the admin/manual payment confirmation hook.

Later, if you connect a payment provider webhook, call the same `confirmPayment(order)` flow after the provider confirms that an order is paid.

## Security

Never commit your `.env` file or bot token to GitHub.

This starter stores data in `data/db.json`. For production, move orders and credentials to a proper database and encrypt sensitive credentials at rest.
