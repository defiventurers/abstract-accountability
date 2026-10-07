# Abstract Accountability

A public community hub for wallet receipts, candid experiences, sourced statements, and questions for **@LucaNetz** and **@AbstractChain**. Anyone can use it without a ChatGPT account, wallet connection, or wallet signature.

The receipt expresses the visitor’s loss of trust in Luca Netz and Pudgy Penguins, features the supplied Retsba artwork, and ends with **“Never bite a hand that feeds you.”** The removed satire section is no longer part of the site.

## Deploy to Vercel

[Import abstract-accountability into Vercel](https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Fdefiventurers%2Fabstract-accountability)

1. Import this repository. Use the root directory, **Other** framework preset, and **Node.js 24.x**. `vercel.json` already sets the build command, output directory, and routes.
2. Connect a [Turso database](https://docs.turso.tech/integrations/vercel) to the project, or create a cloud database and add its URL and token as the variables below. This is the persistent storage for the shared community features.
3. Add a private `ADMIN_TOKEN` before launch. Generate it locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it out of GitHub and browser code.
4. Deploy. With the database variables present, the build applies the checked-in migrations automatically. If you add variables after the first deployment, redeploy.
5. Visit `/community`, submit a test voice, and use `/moderate` to review a test evidence submission. Delete your test voice using its private edit access.

| Server environment variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` | Cloud `libsql://…` database URL. Required for shared posting and totals. |
| `TURSO_AUTH_TOKEN` | Database token. Required for the cloud database. |
| `ADMIN_TOKEN` | A long random owner token for `/moderate`. Required to review evidence and reports. |
| `SITE_URL` | Optional canonical origin, such as `https://your-domain.com`, for RSS and the sitemap. |

Apply the variables to Production and the preview environments you use. A separate preview database keeps test posts out of the live community. Never prefix secrets with a public-client variable prefix.

Without a database, the wallet lookup, card, curated record, and updates still work. Shared totals display as unavailable, and posting fails clearly; no sample people or totals are fabricated. A local file database is rejected on Vercel because its filesystem cannot provide durable community storage.

## What people can do

| Page | Experience |
| --- | --- |
| `/` | Choose dark or light, look up an AGW username or wallet, see a compact green first-interaction summary, download a PNG, and open an X draft. Browse the hub below. |
| `/community` | Voluntarily add a verified wallet receipt to the shared days ledger, or vent on the wallet-free voice wall. Edit or remove personal entries with private access keys. |
| `/record` | Read the sourced record for the wind-down, funding explanation, Phase 2/3 thesis, Quantum evidence gap, and XP terms. See published community submissions. |
| `/updates` | Follow topics on this browser, see new items since marking the feed read, and subscribe through RSS. |
| `/evidence` | Submit a dated public statement for owner review. Pending submissions are not publicly listed. |
| `/action` | Find ways to contribute and read Bearorca Maxpain’s linked organizing statement. |
| `/moderate` | Owner-only API access using the private moderation token: publish/reject sources and hide/restore reported community entries. |
| `/method` | Inspect the receipt calculation, coverage limits, and data practices. |

The legal initiative panel attributes the organizing plans to **Bearorca Maxpain (@degenlegendmfer)** and links his [own statement](https://x.com/degenlegendmfer/status/2107582275072528598). It does not describe a lawsuit as already filed or collect legal claims, fees, or identity documents on his behalf.

## Run locally

Use Node.js 24.x:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:3000`. To exercise shared features locally, create `.env.local` with:

```dotenv
TURSO_DATABASE_URL=file:local.db
ADMIN_TOKEN=replace-with-a-long-random-local-token
```

Then run `npm run db:migrate` before `npm run dev`. Those commands load `.env.local` automatically. Local database files and environment files are ignored by Git. For a cloud database, use the cloud URL and token instead.

## Keep the hub current

- Edit curated updates, topics, and the six unanswered questions in `worker/hub.js`. Give new updates a unique ID, a dated source, and an accurate publication timestamp. Update `reviewedAt` when you review the record.
- Edit the curated statement cards in `SOURCES` inside `worker/index.js`. Preserve original source links and separate exact commitments from visions, allegations, and evidence gaps.
- Review new submissions at `/moderate`. Open the source, check the date and precise wording, and add a public review note before publishing. Published submissions join `/record`, `/updates`, and `/feed.xml`.
- Accepted public-source hosts are listed in `sourceUrl()` in `worker/hub-api.js`. Extend that list deliberately when a new primary source is needed. The form never downloads submitted URLs.
- The feed is curated plus reviewed submissions; it does not scrape X automatically. Topic follows and “read” state are stored on each browser, without an account or push notifications.
- Question support is one signal per browser key and question. It is **not** a count of unique humans. Neither it nor a public wallet establishes identity or wallet ownership.

Published evidence corrections currently require an owner database update or a dated correction in the curated record. The review desk handles pending submissions and reported voices, not general case management.

## Data and moderation

The shared ledger counts each voluntarily submitted wallet once. The server rechecks the transaction history before adding it and ignores caller-supplied day totals. Days are whole elapsed UTC days since the earliest verified indexed normal transaction; the hours conversion is **days × 24**. Incoming transfers and included failed transactions count. Older internal transactions, token transfers, or missing network history may exist.

Totals represent **combined wallet age**, not active work hours, distinct people, money lost, or a verified measure of time stolen. Wallet-free messages never add days. Hidden ledger entries are excluded from the displayed total.

Messages are plain text, up to 2,500 characters, displayed in full. They are contributors’ own accounts. Searching and opening an X draft do not publish anything to this site. Posting requires explicit consent. Private edit keys stay with the contributor; the database stores their hashes. Save the private access file before changing browser or device. The owner can hide reported posts; a contributor can still remove their own entry.

IP-based submission limits store hashed window identifiers, not raw IPs. Vercel and upstream services may keep their own request logs. Evidence submissions stay pending until review. Anonymous reports go to the private review desk. The moderation token is held only for the current page session.

## Sharing the receipt

The PNG is prepared as soon as a receipt or theme changes. **Draft + PNG** uses the native share sheet with an actual PNG file where file sharing is supported; select X as the target and review the draft. The device and X app determine available targets and whether they retain both the file and text.

Desktop browsers without file sharing download the PNG and open an editable X text draft. **Copy PNG** lets supported browsers paste the image into X. An X intent URL cannot attach a local file; the app does not pretend otherwise and never publishes a post automatically. No X login or posting credentials are stored.

## Security controls

- HTML uses SHA-256 script hashes in its Content Security Policy, with inline event handlers and embedding blocked. All responses include frame, MIME, referrer, resource, and feature restrictions. Sharing and clipboard writing remain available.
- Requests use strict same-origin checks, JSON-only bodies capped at 16 KiB, bounded plain text, strict route IDs, and parameterized SQL. Submitted source links are allowlisted and never fetched by the server.
- Cloud-backed IP limits are atomic and shared across function instances: 60 lookups, 30 edit attempts per entry type, and 60 moderation requests per 15 minutes. Existing posting limits remain in place. A bounded in-process fallback protects lookup when storage is disconnected; it cannot enforce a global distributed limit.
- Vercel’s trusted forwarded IP is used; caller-supplied platform identity headers are discarded. Private edit capabilities are 256-bit random values stored as hashes. Moderation requires a private server token of at least 32 characters; token digests are compared without an early exit.
- Secrets stay out of Git and client code. Vercel requires cloud database credentials, rejects local file storage, and refreshes the database client on credential rotation. Private and API responses are not cached.
- Tests cover injection, origin checks, private edits, key guessing, streamed payloads, security headers, and rate limits. CI audits production and development dependencies. The esbuild override removes the development-server advisory inherited through Drizzle Kit.

These controls reduce risk; they do not guarantee that an app is impossible to exploit. Keep dependencies current, review reported content, rotate a disclosed owner token, and review Vercel traffic and usage. A database must be connected before shared posting can work.

## Project map and checks

- `worker/index.js`: receipt lookup, share card, wallet ledger, page shell.
- `worker/hub.js`: hub sections, curated updates, and browser interactions.
- `worker/hub-api.js`: voice wall, evidence, question signals, moderation, RSS.
- `worker/security.js`: request validation, rate limits, secret comparison, and security headers.
- `worker/sharing.js`: X copy and native/file-sharing flow.
- `api/index.js`: public Vercel Web Standard function and routing adapter.
- `lib/database.js`: Turso/libSQL adapter for the existing SQLite queries.
- `db/schema.ts`, `drizzle/`: schema and generated, ordered migrations.
- `scripts/migrate.mjs`: transactional migration runner with applied-file hash checks.
- `tests/`: receipt verification, identity resolution, consent, persistence, community access, moderation, and browser-script interaction tests.

`npm test` checks the actual SQLite/libSQL adapter as well as mocked upstream explorer/RPC responses. `npm run build` validates all public HTML pages and parses the browser scripts. GitHub Actions runs tests, build validation, and a dependency audit on pushes and pull requests. SVG card layouts were rendered in both themes. These checks do not replace a real Vercel deployment smoke test or a full browser/device review.

The original `assets/angry-retsba.png` is preserved and embedded in the card so PNG downloads need no external image request. Changing the asset also requires regenerating `RETSBA_DATA_URI` in `worker/index.js`.

## Next return habits to build

1. Publish a consistent weekly **“What changed / what is still unanswered”** digest with original sources.
2. Give each builder story a dated promise/outcome record, then invite a public team response beside it.
3. Add explicit opt-in email or Telegram delivery for followed topics and legal-initiative updates.
4. Create shareable weekly community-total milestones without ranking people by alleged losses.
5. Support operating costs through clearly labelled sponsors or optional reader support, while keeping the core record and participation free.
