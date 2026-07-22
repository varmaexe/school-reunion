-- Sample data for local development/testing only.
-- Apply with: wrangler d1 execute reunion-db --local --file=./seed.sql

INSERT INTO events (name, venue, event_date, contribution_amount, payment_phone, admin_pin)
VALUES ('Class of 2010 Reunion', 'Green Valley Banquet Hall', '2026-12-20', 1500, '9000000000', '1234');

INSERT INTO members (name, phone) VALUES
  ('Aarav Sharma', '9876543210'),
  ('Priya Nair', '9876501234'),
  ('Rohit Verma', '9123456789');
