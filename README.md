# Profolio

A crypto portfolio tracker with P&L analytics, historical snapshots, and project tracking.
Live at [profolio-ashy-one.vercel.app](https://profolio-ashy-one.vercel.app/).

## Architecture

The whole app is a single Express instance in `server.js`. On Vercel it is exported as a
serverless function rather than a long-running server, so there is no always-on process:

```js
if (!process.env.VERCEL) {
    app.listen(PORT, ...);   // local development only
}
module.exports = app;        // Vercel wraps this via @vercel/node
```

`vercel.json` routes every path to that function and declares the keep-alive cron.

Storage goes through a small abstraction (`getData` / `setData`) with two backends:

| Environment | Backend | Location |
| --- | --- | --- |
| Vercel (`KV_REST_API_URL` set) | Upstash Redis | `portfolio`, `transactions`, `projects`, `snapshots`, `heartbeat` |
| Local (no Redis credentials) | Filesystem | `data/*.json`, `snapshot/*.json` |

The two backends are entirely separate stores. Running locally without Redis credentials
shows local files, not production data — that is by design, not a bug.

Snapshots live in a **single** `snapshots` key as one JSON array, not one key per snapshot.
An earlier version used 148 individual keys; `/api/consolidate-snapshots` performed that
migration.

## Features

- **Portfolio** (`index.html`) — holdings with cost basis, live CoinGecko prices, P&L per
  asset and in total, distribution and P&L charts. Negative amounts are allowed so sells
  can be recorded.
- **History** (`portfolio-history.html`) — total value and P&L over time, built from
  snapshots. Snapshots are captured on page refresh and on demand.
- **Projects** (`projects.html`) — tracked projects with tags.
- **Transactions** — trade history with filtering.

Prices come from the CoinGecko public API. Symbols are mapped to CoinGecko ids in
`script.js`; a symbol missing from that map will show no price, so new holdings may need an
entry added there.

## Local development

```bash
npm install
node server.js        # or ./start.sh
```

Serves on `http://localhost:3000` in filesystem mode, creating `data/` and `snapshot/` as
needed. To run against production data instead, pull the real credentials:

```bash
vercel login && vercel link
vercel env pull .env.local
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL` | Upstash Redis REST endpoint. Its presence is what selects the Redis backend. |
| `KV_REST_API_TOKEN` | Upstash Redis REST token. |
| `SITE_PASSWORD` | Password for the login gate. **Set this** — `server.js` falls back to a hardcoded default when it is missing. |
| `CRON_SECRET` | Shared secret for the keep-alive cron. Vercel sends it automatically as `Authorization: Bearer <secret>`. |
| `BOT_API_KEY` | Bearer key for `POST /api/trade` (trading bots) and `POST /api/balances` (NAS sync). Unset = the endpoint rejects everything. |

`KV_URL` and `REDIS_URL` are also stored for tooling but the app does not read them.

## Keeping the database alive

Upstash archives free-tier databases after prolonged inactivity. This happened once: after
the last visit on 2026-06-08 the database was archived, and the dashboard came back empty
while the site itself stayed up. Recovery required creating a new database through the
Vercel dashboard to restore console access, restoring the archived one from Upstash's
inactive list, and repointing `KV_REST_API_URL` — the restored database gets a **new
hostname**, so the old value resolves to NXDOMAIN and must be updated.

To prevent a repeat, `vercel.json` runs a daily cron against `/api/keepalive`:

```json
"crons": [{ "path": "/api/keepalive", "schedule": "0 12 * * *" }]
```

Two details matter. The handler issues real Redis commands, because Upstash measures
database activity, not HTTP traffic — pinging an endpoint that never touches storage would
not prevent archival. And the route is registered *before* the auth middleware, since that
middleware compares bearer tokens against `SITE_PASSWORD` and would otherwise reject
`CRON_SECRET`.

Each run writes a `heartbeat` key with a timestamp, so confirming the cron is alive is just
a matter of reading that key rather than digging through logs:

```bash
node redis-cli.js get heartbeat
```

## Data integrity

When a CoinGecko lookup fails, every holding prices at zero. Snapshots taken in that state
used to be stored as genuine datapoints — two of them (2026-01-31 and 2026-02-01) recorded
`totalValue: 0` against `totalCost: 605,773` and drew as a total collapse on the history
chart. `POST /api/snapshots` now rejects any snapshot that claims holdings but has no
positive total value; a portfolio that is legitimately empty still records normally.

## Helper scripts

```bash
node redis-cli.js list                 # list keys
node redis-cli.js get portfolio        # read a key
node redis-cli.js set portfolio f.json # overwrite a key from a JSON file
node redis-cli.js delete <key>         # delete a key
```

Both scripts read `.env.local`. `migrate-to-kv.js` is the one-off import that moved local
JSON files into Redis.

## API

All routes except `/login`, `/api/keepalive`, `/api/trade` and `POST /api/balances` sit behind the password gate.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/login` | Exchange the password for a token |
| `POST` | `/logout` | Clear the auth cookie |
| `GET` | `/api/keepalive` | Cron target; requires `CRON_SECRET` |
| `POST` | `/api/trade` | Bot trade ingest; requires `BOT_API_KEY` (see below) |
| `POST` | `/api/balances` | Traditional-asset ingest from the NAS; requires `BOT_API_KEY` (see below) |
| `GET` | `/api/balances` | Latest traditional balances (Redis key `balances`) |
| `GET` `POST` | `/api/portfolio` | Read / write holdings |
| `GET` `POST` | `/api/transactions` | Read / append transactions |
| `GET` `POST` | `/api/projects` | Read / write projects |
| `POST` | `/api/projects/tags` | Update project tags |
| `GET` `POST` | `/api/snapshots` | Read all / save snapshots |
| `GET` | `/api/latest-totalcost` | Total cost from the newest snapshot |
| `GET` | `/api/cashflows` | Deposit/withdrawal ledger (Redis key `cashflows`, written with `redis-cli.js set`) |
| `GET` | `/api/export` | Export current portfolio |
| `GET` | `/api/export-history` | Export snapshot history |
| `POST` | `/api/import` | Import portfolio data |
| `POST` | `/api/migrate` | Migrate filesystem data into Redis |
| `POST` | `/api/consolidate-snapshots` | Fold legacy `snapshot:*` keys into `snapshots` |

## Deployment

```bash
vercel --prod
```

Environment variable changes do **not** apply to existing deployments. After editing them,
redeploy — `vercel redeploy <url>` reuses the same source and only picks up the new values,
which is safer than `vercel --prod` when the working tree has uncommitted changes.

## File structure

```
profolio/
├── index.html              # Portfolio dashboard
├── portfolio-history.html  # History charts
├── projects.html           # Project tracker
├── script.js               # Frontend logic, CoinGecko id map
├── styles.css
├── server.js               # Express app, storage layer, API
├── vercel.json             # Serverless build, routes, cron
├── redis-cli.js            # Redis inspection helper
├── migrate-to-kv.js        # One-off filesystem to Redis import
├── start.sh                # Local startup script
├── backup/                 # Local snapshot backups (gitignored)
└── data/, snapshot/        # Local filesystem storage (gitignored)
```

## License

MIT

## Bot trade ingest

`POST /api/trade` with `Authorization: Bearer <BOT_API_KEY>` applies one filled trade in a single
atomic Redis `MULTI`:

```json
{ "id": "binance-BTCUSDC-10402908348", "timestamp": "2026-09-24T19:59:23Z",
  "symbol": "BTC", "amount": 0.00118, "price": 84337.07,
  "quoteSymbol": "USDC", "quoteAmount": 99.5177426, "note": "DCA" }
```

- The `symbol` holding (note `''`) gains `amount` at `price`, averaged the same way as adding a coin in the UI.
- The `quoteSymbol` holding (note `''`) loses `quoteAmount` at its own average cost. If it doesn't exist the request gets a `422`.
- Two transactions are appended: a `buy` with id `id`, and a `sell` with id `id-<quoteSymbol>`.
- A repeated `id` returns `{"success": true, "duplicate": true}` and changes nothing, so callers can retry safely.

Used by the BTC DCA bot (`~/git/btc_binance_DCA`).

## Traditional assets

Bank, brokerage, retirement, property and loan balances are not fetched by profolio. The NAS
service `profolio-sync` (`~/git/monarch_money/profolio_sync.py`) reads them from Monarch once a
day at 07:00 ET and pushes them to `POST /api/balances` with `Authorization: Bearer <BOT_API_KEY>`:

```json
{ "asOf": "2026-10-27T11:00:00Z", "source": "monarch",
  "accounts": [{ "id": "123", "name": "Roth IRA", "institution": "Fidelity", "type": "brokerage",
                 "subtype": "Roth IRA", "isAsset": true, "isManual": false, "balance": 10000.43,
                 "lastSyncedAt": "2026-10-27T08:13:10Z", "needsReconnect": false,
                 "holdings": [{ "ticker": "VTI", "name": "Vanguard Total Stock", "type": "ETF",
                                "quantity": 30, "price": 280.1, "value": 8403, "basis": 6100 }] }] }
```

- Balances are signed: assets positive, liabilities negative. A `basis` of `null` means unknown.
- The payload replaces the `balances` key, then the server takes a `Daily Sync` snapshot (live
  CoinGecko prices, same rules as the page), so history gets a point even on days nobody visits.
  If prices can't be fetched, no snapshot is taken (`"snapshot": null`), but the balances are still stored.
- Every snapshot, including the ones the page takes, gets `traditional` (`assets`, `liabilities`,
  `net`, `byType`) and `netWorth` = crypto `totalValue` + traditional `net`. The crypto fields keep
  their crypto-only meaning, so older history and the cash-flow cost basis still line up.
- The homepage panel (`balances.js`) warns when a linked account needs reconnecting or hasn't synced
  in 3 days, and when no push has arrived in 36 hours.

The CoinGecko symbol map lives in `coin-ids.js`, shared by the page and the server.
