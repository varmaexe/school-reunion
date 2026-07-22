import { json, badRequest, readJson, getCurrentEvent } from "../_lib.js";

// POST /api/rsvp — { member_id, status, phone_last4 }
// Self-service RSVP. Identity is confirmed by matching the last 4 digits of
// the member's phone number on file, so one member can't change another's
// status just by knowing their name.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const { member_id, status, phone_last4 } = body;

  if (!member_id || !["yes", "no", "pending"].includes(status)) {
    return badRequest("member_id and a valid status ('yes'|'no'|'pending') are required");
  }
  if (!phone_last4 || !/^\d{4}$/.test(String(phone_last4))) {
    return badRequest("phone_last4 (4 digits) is required to confirm identity");
  }

  const member = await env.DB.prepare(`SELECT id, phone FROM members WHERE id = ?1`)
    .bind(member_id)
    .first();
  if (!member) return badRequest("Member not found", 404);

  const last4 = (member.phone || "").replace(/\D/g, "").slice(-4);
  if (!last4 || last4 !== String(phone_last4)) {
    return json({ error: "Phone number does not match our records" }, 403);
  }

  const event = await getCurrentEvent(env);
  if (!event) return badRequest("No active event", 404);

  await env.DB.prepare(
    `INSERT INTO rsvps (event_id, member_id, status, updated_at)
     VALUES (?1, ?2, ?3, datetime('now'))
     ON CONFLICT(event_id, member_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
  )
    .bind(event.id, member_id, status)
    .run();

  return json({ ok: true });
}
