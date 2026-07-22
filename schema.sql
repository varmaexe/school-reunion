-- Reunion site schema (D1 / SQLite)
-- Apply with: wrangler d1 execute reunion-db --file=./schema.sql [--remote]

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  venue TEXT,
  maps_url TEXT,
  event_date TEXT,
  contribution_amount INTEGER,
  payment_phone TEXT,
  admin_pin TEXT NOT NULL,
  welcome_note TEXT,
  poc_name TEXT,
  poc_contact TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- can_manage_payments and payment_device_secret are never settable through
-- any app UI or API — only via a direct DB query run by the site owner.
-- can_manage_payments: 1 for the small set of people trusted to toggle
-- paid/unpaid. payment_device_secret: a random token bound to whichever
-- device that person first successfully used for a payment action (trust
-- on first use) — every subsequent payment action from them must present
-- the same token, so knowing their name + last-4-phone alone (the gate's
-- identity check) is not enough to act on their behalf from another device.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  can_manage_payments INTEGER DEFAULT 0,
  payment_device_secret TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rsvps (
  event_id INTEGER NOT NULL REFERENCES events(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  status TEXT CHECK(status IN ('pending','yes','no')) DEFAULT 'pending',
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE IF NOT EXISTS payments (
  event_id INTEGER NOT NULL REFERENCES events(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  paid INTEGER DEFAULT 0,          -- 0/1 boolean
  amount INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT,
  description TEXT,
  amount INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Points-of-contact directory, grouped by category (Venue, Catering,
-- Transport, Payments, etc.) — several people can share a category.
-- Organizer-managed (add/delete), visible to everyone.
CREATE TABLE IF NOT EXISTS poc_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_poc_entries_event ON poc_entries(event_id);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  title TEXT NOT NULL,
  status TEXT CHECK(status IN ('planned','in_progress','dropped')) DEFAULT 'planned',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Misc board: event proposals, guestbook "kind words", and anonymous feedback.
-- author_name is NULL for feedback by design — no API route ever selects
-- hidden_author, so it is never returned to the app (guests or organizers).
-- It exists purely so the site owner can look up who wrote what by querying
-- D1 directly (wrangler d1 execute), a channel organizers don't have access to.
CREATE TABLE IF NOT EXISTS board_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  type TEXT CHECK(type IN ('proposal','kindwords','feedback')) NOT NULL,
  author_name TEXT,
  hidden_author TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Upvote/downvote on "propose an event" and "feedback" board posts (not
-- kindwords — a guestbook message isn't something you'd vote on). One vote
-- per member per post, enforced by the unique index; voting again with the
-- same value removes the vote, a different value changes it. Voter identity
-- is tracked only to prevent double-voting — never exposed, even for votes
-- on otherwise-anonymous feedback posts.
CREATE TABLE IF NOT EXISTS board_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES board_posts(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  vote INTEGER NOT NULL CHECK(vote IN (1, -1)),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_votes_unique ON board_votes(post_id, member_id);

-- Audit trail for the paid/unpaid toggle, which requires the acting member
-- to have can_manage_payments set. Names are denormalized snapshots so
-- entries stay readable even if a member is later removed.
CREATE TABLE IF NOT EXISTS payment_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  target_member_id INTEGER NOT NULL,
  target_member_name TEXT NOT NULL,
  changed_by_member_id INTEGER NOT NULL,
  changed_by_name TEXT NOT NULL,
  paid INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_payments_event ON payments(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_event ON expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_todos_event ON todos(event_id);
CREATE INDEX IF NOT EXISTS idx_board_posts_event ON board_posts(event_id, type);
CREATE INDEX IF NOT EXISTS idx_payment_log_event ON payment_activity_log(event_id);
