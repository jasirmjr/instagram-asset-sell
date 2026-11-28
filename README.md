# Editing Assets Store (React + Tailwind + Razorpay)

Instagram comment → auto DM with link → this page → Razorpay payment → download unlocked forever on that browser.

## How it works

```
Browser (React)                     Server (/api on Vercel)              Razorpay
─────────────────                   ────────────────────────             ────────
"Buy now" ───────────────────────▶  /api/create-order  ───────────────▶  creates order (price set on server)
Razorpay popup  ◀─────────────────  orderId + key
user pays ───────────────────────────────────────────────────────────▶  payment
handler ─────────────────────────▶  /api/verify-payment (checks signature)
token saved in localStorage ◀────   signed access token
"Download" ──────────────────────▶  /api/download?token=…  → 302 redirect to ASSET_URL (secret)
Next visit: token checked by /api/access → download button shows immediately
New phone: "Restore access" + Payment ID → /api/restore asks Razorpay → new token
```

No database needed. The download link is only stored on the server.

## Setup (about 20 minutes)

1. **Razorpay**: sign up at razorpay.com, finish KYC. In Dashboard → Account & Settings → API Keys, generate **Test** keys first.
2. **Upload your assets** as one .zip (Google Drive with "Anyone with link" + direct download link, Dropbox, or Cloudflare R2).
3. **Install & run locally**
   ```bash
   npm install
   npm i -g vercel
   cp .env.example .env.local   # fill in your values
   vercel dev                   # opens http://localhost:3000
   ```
   Test a payment using Razorpay's test UPI / test cards.
4. **Edit the page**: `src/config.js` (name, price, features, preview image in `public/`).
5. **Deploy**: push to GitHub → import in vercel.com → add the same environment variables → Deploy.
6. **Go live**: switch to `rzp_live_` keys in Vercel env vars and redeploy.

## Selling a new pack later
Duplicate the project (or change `PRODUCT_ID`, `PRICE_INR`, `ASSET_URL`). Changing `PRODUCT_ID` means old buyers won't unlock the new pack.

## Influencer tracking
Each influencer gets a link (`yoursite.com/?ref=rahul`) and a code (`RAHUL`) to say in their video, since Reels/Shorts have no clickable links. Buyers can type the code under "Buy now". The code is remembered for 30 days; the last link or code used wins.

- **Price**: without a code buyers pay `FULL_PRICE_INR` (₹99); with an active code they pay `PRICE_INR` (₹49), shown as ~~₹99~~ ₹49. If a saved code was paused, the page shows the full price before taking payment.
- **Visits**: counted once per browser per code (`/api/visit`).
- **Sales**: saved when payment is verified, and again by the Razorpay webhook as a backup (each payment counts once). Refunds are removed via the webhook. The code is also saved in the Razorpay order notes (`ref`), so you can cross-check in the Razorpay export.
- **Commission**: `percent` of the sale price, frozen at sale time. A sale can be paid out after 7 days.
- **Admin page** `yoursite.com/stats?admin=ADMIN_KEY`: add influencers (name, code, %), edit their %, pause/resume them, see everyone's numbers, copy their links and record payouts after you pay them by UPI/bank. Changes work instantly (saved in Upstash, no redeploy). A new % applies to new sales only; pausing stops new visits/sales but keeps their history.
- **Influencer stats** `yoursite.com/stats?code=rahul&key=THEIR_KEY`: copy it from the admin page and send it to them. "New stats link" makes the old one stop working.

Setup:
1. Vercel → project → **Storage** → add **Upstash (Redis)** and connect it to the project.
2. Add `ADMIN_KEY` and `RAZORPAY_WEBHOOK_SECRET` in Vercel environment variables (see `.env.example`).
3. Razorpay Dashboard → **Webhooks** → add `https://yoursite.com/api/webhook` with events `payment.captured` and `refund.processed`, same secret.
4. Redeploy once, then open `yoursite.com/stats?admin=ADMIN_KEY` and add your influencers.
