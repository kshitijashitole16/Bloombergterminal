# Bloombergterminal
A Bloomberg Terminal-inspired financial dashboard for real-time stock data, charts, and market news.

## Email + OTP login

1. **Start the backend** (`cd backend && npm install && npm start`) on port **4010** (see `backend/.env`).
2. **Start the frontend** (`cd finance-dashboard && npm start`). API calls use **`http://localhost:4010`** in dev (`src/apiBase.js`); `package.json` also sets **`proxy`** to 4010 as a fallback. **404 on `/api/...` at :3000** means the browser was hitting the React server — keep the backend running on **4010**.
3. **Futures & options calculator** (after login): open **`/calculator`** — uses ~1 year of daily closes for historical volatility, then Black–Scholes call/put and cost-of-carry futures fair value (`GET /api/derivatives/calculator`).
4. **Where is the OTP?**
   - **Development** (`NODE_ENV` ≠ `production` on the server): the API returns **`devOtp`** and the login screen shows **Your code: ****** so you don’t need the terminal.
   - **Backend terminal**: always logs `[OTP] email → 123456`.
   - **Real email**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `backend/.env` (optional `nodemailer`). Response includes `emailSent: true` when mail goes out.
5. **Production**: set `NODE_ENV=production` on the backend and **do not** rely on `devOtp` (set `OTP_DEBUG=0` to force-hide). Configure SMTP or another provider for delivery.
6. First successful verify **creates** the user if they don’t exist.

See `backend/.env.example` and `finance-dashboard/.env.example`.

## Stock options OI (ceQt / peQt)

The **Stock Options OI** tab reads `finance-dashboard/src/data/stockOptionsOiLive.json` — same shape as your API (`revampOiGainersLosersResponseDao`: `data.ceQt`, `data.peQt`).

To load your full snapshot:

```bash
node scripts/import-stock-options-oi.mjs /path/to/your-api-response.json
```

Then restart the frontend. The strip groups CE/PE by chunks of 12 `tsym`s; the blotter shows full **CE** and **PE** tables.
