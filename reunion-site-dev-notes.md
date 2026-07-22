# Reunion Site — Dev Notes & Migration Plan

Reference doc for taking the reunion RSVP/payment tracker from a Claude
artifact prototype to a standalone, reusable web app.

---

## 1. Current state (prototype)

- **File**: `reunion.html` — single self-contained HTML/CSS/JS file, no build step.
- **Persistence**: Claude artifact `window.storage` API (key-value, shared across
  users). Only works inside Claude.ai — **will not run anywhere else as-is**.
- **Data shape**: three JSON blobs under keys `members`, `expenses`, `config`.
- **Purpose**: working demo to validate the RSVP + payment + expense flow before
  building the real thing.

This file is a good source for **copy-pasting the HTML/CSS structure and UI
logic** — the visual design and interaction flow don't need to change. Only the
data layer needs to be swapped out.

---

## 2. Target architecture

**Stack**: Cloudflare Pages (static frontend) + Cloudflare Workers (API) +
Cloudflare D1 (SQLite database). All free-tier, all one Cloudflare account, no
separate hosting/db provider to manage.

```
Browser (reunion.html, plain JS)
   |
   |  fetch('/api/...')
   v
Cloudflare Worker (API layer, JS)
   |
   |  SQL queries
   v
Cloudflare D1 (SQLite)
```

Why this over the artifact storage or a raw KV store:
- Real relational schema → data is reusable for future reunions, not locked
  into one big JSON blob.
- D1 databases can be **exported to a plain `.sqlite` file** anytime — this is
  your long-term archive/backup, independent of whether the Cloudflare project
  itself stays alive.
- Everything free-tier at this scale (60 members, a handful of requests).

---

## 3. Database schema (D1 / SQLite)

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  venue TEXT,
  event_date TEXT,
  contribution_amount INTEGER,
  upi_id TEXT,
  admin_pin TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE rsvps (
  event_id INTEGER NOT NULL REFERENCES events(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  status TEXT CHECK(status IN ('pending','yes','no')) DEFAULT 'pending',
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE payments (
  event_id INTEGER NOT NULL REFERENCES events(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  paid INTEGER DEFAULT 0,          -- 0/1 boolean
  amount INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT,
  description TEXT,
  amount INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Why `members` is separate from `events`**: next reunion (5-10 years out),
you insert one new row in `events` and reuse the same `members` table instead
of re-entering 60 names and phone numbers again. `rsvps`/`payments`/`expenses`
all key off `event_id`, so history per-event stays intact.

---

## 4. API endpoints to build (Cloudflare Worker)

Keep it small — one Worker script, a handful of routes:

| Method | Route                          | Purpose                                  | Auth |
|--------|---------------------------------|-------------------------------------------|------|
| GET    | `/api/event`                   | current event + members + rsvp + payment status (joined) | none (public read) |
| POST   | `/api/rsvp`                     | `{ member_id, status }` — self-service RSVP | none, but consider phone-last-4 check |
| POST   | `/api/admin/payment`           | `{ member_id, paid, amount }`             | PIN header |
| POST   | `/api/admin/expense`           | `{ category, description, amount }`       | PIN header |
| POST   | `/api/admin/event`             | update contribution amount / UPI id / pin | PIN header |

Auth approach for admin routes: pass the PIN in a header
(`X-Admin-Pin`) and check it against `events.admin_pin` server-side in the
Worker before writing. Simple, no session/login system needed for this scale.

---

## 5. Migration steps from the prototype

1. Keep `reunion.html`'s markup/CSS as-is — it's just presentation.
2. Replace every `window.storage.get(...)` / `window.storage.set(...)` call
   with a `fetch('/api/...')` call to the Worker instead.
3. Replace the single `members` JSON blob with data fetched from
   `/api/event` (joined members + rsvp + payment in one response, to keep the
   frontend simple).
4. Move the PIN check from client-side JS (currently trivially bypassable by
   reading the source) into the Worker, so the real PIN never ships to the
   browser.

---

## 6. Setup steps (once you're ready to build this)

1. Create a free Cloudflare account → dashboard → **Workers & Pages**.
2. Install Wrangler CLI locally: `npm install -g wrangler`, then `wrangler login`.
3. Create the D1 database:
   ```
   wrangler d1 create reunion-db
   ```
   This gives you a `database_id` to put in `wrangler.toml`.
4. Run the schema from Section 3 against it:
   ```
   wrangler d1 execute reunion-db --file=./schema.sql
   ```
5. Write the Worker script (`worker.js` or `src/index.js`) implementing the
   routes in Section 4, using `env.DB.prepare(...)` for queries.
6. `wrangler deploy` to publish the Worker.
7. Push `reunion.html` (+ any JS/CSS split out) to a GitHub repo.
8. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → connect
   to GitHub repo** → deploy. Point the frontend's `fetch` calls at the
   Worker's URL (or set up a Pages Function route so frontend + API share one
   domain).
9. Test end-to-end: RSVP as a member, mark a payment as admin, add an expense,
   confirm it all reads back correctly.

---

## 7. Archiving after the reunion

When you're ready to turn the site down:
```
wrangler d1 export reunion-db --output=reunion-backup.sqlite
```
This gives you a portable SQLite file with everything — members, RSVPs,
payments, expenses — that you can open anytime (e.g. with the `sqlite3` CLI
or a free SQLite browser tool) without needing Cloudflare or any hosting at
all. Keep this file somewhere safe; it's your 5-10-year-later starting point.

---

## 8. Open questions to settle before building

- Should self-service RSVP have any identity check (e.g. confirm last 4
  digits of phone) to stop someone from changing another member's status?
- Do you want the admin PIN to be a single shared PIN (current design) or
  per-organizer PINs now that "organizers are many"?
- Should past-event data (previous reunions) be visible on the public page,
  or only the current/latest event?
