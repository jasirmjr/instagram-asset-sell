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
