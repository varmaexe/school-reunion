import { json, badRequest, readJson, getCurrentEvent, isAdmin } from "../_lib.js";

const TYPES = ["proposal", "kindwords", "feedback"];

// POST /api/board — { type, message, member_id, phone_last4 }
// Identity is always confirmed the same way as /api/rsvp, by matching the
// last 4 digits of the member's phone on file. For "proposal" and
// "kindwords" the resolved name is stored publicly as author_name. For
// "feedback" the post is anonymous to everyone — author_name stays NULL —
// but the resolved name is still written to hidden_author. No API route
// selects hidden_author, so there is no path through the app (guest or
// organizer) that ever exposes it; it can only be read via a direct D1
// query against the database.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const { type, message, member_id, phone_last4 } = body;
  if (!TYPES.includes(type)) return badRequest("type must be one of 'proposal', 'kindwords', 'feedback'");
  if (!message || !String(message).trim()) return badRequest("message is required");
  if (!member_id) return badRequest("member_id is required");
  if (!phone_last4 || !/^\d{4}$/.test(String(phone_last4))) {
    return badRequest("phone_last4 (4 digits) is required to confirm identity");
  }

  const event = await getCurrentEvent(env);
  if (!event) return badRequest("No active event", 404);

  const member = await env.DB.prepare(`SELECT id, name, phone FROM members WHERE id = ?1`)
    .bind(member_id)
    .first();
  if (!member) return badRequest("Member not found", 404);
  const last4 = (member.phone || "").replace(/\D/g, "").slice(-4);
  if (!last4 || last4 !== String(phone_last4)) {
    return json({ error: "Phone number does not match our records" }, 403);
  }

  const authorName = type === "feedback" ? null : member.name;
  const hiddenAuthor = type === "feedback" ? member.name : null;

  const result = await env.DB.prepare(
    `INSERT INTO board_posts (event_id, type, author_name, hidden_author, message, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
  )
    .bind(event.id, type, authorName, hiddenAuthor, String(message).trim())
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}

// DELETE /api/board?id=123 — organizer moderation (X-Admin-Pin header)
export async function onRequestDelete({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id query param is required");

  await env.DB.prepare(`DELETE FROM board_posts WHERE id = ?1 AND event_id = ?2`)
    .bind(id, event.id)
    .run();

  return json({ ok: true });
}
