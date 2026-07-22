import { json, getCurrentEvent } from "../_lib.js";

// GET /api/event — current event + members joined with rsvp/payment status,
// plus expenses, todos, and misc board posts. Public read, no auth.
export async function onRequestGet({ env }) {
  const event = await getCurrentEvent(env);

  if (!event) {
    return json({ event: null, members: [], expenses: [], todos: [], posts: [], pocs: [] });
  }

  const { results: members } = await env.DB.prepare(
    `SELECT m.id, m.name,
            COALESCE(r.status, 'pending') AS rsvp_status,
            COALESCE(p.paid, 0) AS paid,
            COALESCE(p.amount, 0) AS amount_paid,
            COALESCE(m.can_manage_payments, 0) AS can_manage_payments
     FROM members m
     LEFT JOIN rsvps r ON r.member_id = m.id AND r.event_id = ?1
     LEFT JOIN payments p ON p.member_id = m.id AND p.event_id = ?1
     ORDER BY m.name COLLATE NOCASE`
  )
    .bind(event.id)
    .all();

  const { results: expenses } = await env.DB.prepare(
    `SELECT id, category, description, amount, created_at
     FROM expenses WHERE event_id = ?1 ORDER BY id DESC`
  )
    .bind(event.id)
    .all();

  const { results: todos } = await env.DB.prepare(
    `SELECT id, title, status, created_at
     FROM todos WHERE event_id = ?1 ORDER BY id DESC`
  )
    .bind(event.id)
    .all();

  const { results: posts } = await env.DB.prepare(
    `SELECT p.id, p.type, p.author_name, p.message, p.created_at,
            COALESCE((SELECT COUNT(*) FROM board_votes v WHERE v.post_id = p.id AND v.vote = 1), 0) AS upvotes,
            COALESCE((SELECT COUNT(*) FROM board_votes v WHERE v.post_id = p.id AND v.vote = -1), 0) AS downvotes
     FROM board_posts p WHERE p.event_id = ?1 ORDER BY p.id DESC`
  )
    .bind(event.id)
    .all();

  const { results: pocs } = await env.DB.prepare(
    `SELECT id, category, name FROM poc_entries
     WHERE event_id = ?1 ORDER BY category COLLATE NOCASE, name COLLATE NOCASE`
  )
    .bind(event.id)
    .all();

  return json({
    event: {
      id: event.id,
      name: event.name,
      venue: event.venue,
      maps_url: event.maps_url,
      event_date: event.event_date,
      contribution_amount: event.contribution_amount,
      payment_phone: event.payment_phone,
      welcome_note: event.welcome_note,
    },
    members,
    expenses,
    todos,
    posts,
    pocs,
  });
}
