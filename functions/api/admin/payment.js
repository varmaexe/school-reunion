import { json, badRequest, readJson, getCurrentEvent, isAdmin } from "../../_lib.js";

// POST /api/admin/payment — { member_id, paid, amount, actor_member_id, actor_phone_last4, device_secret }
// (X-Admin-Pin header — the general organizer PIN is still the front door)
//
// The general PIN alone is not enough, though: the acting member must ALSO
// have can_manage_payments set on their own row (settable only via a direct
// DB query by the site owner — never through any app UI or API) — a
// per-person permission layered on top of the shared PIN, tied to their
// real identity rather than another secret that could itself be shared.
//
// actor_member_id/actor_phone_last4 confirm who the acting organizer is, the
// same way as /api/rsvp. On top of that, device_secret implements trust-on-
// first-use device pinning: the first successful call for a given actor
// binds a random secret to their member row and returns it so the frontend
// can remember it; every later call must present the same secret, so
// merely knowing that person's name + last-4-phone from another device
// isn't enough to act as them.
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!event) return badRequest("No active event", 404);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const { member_id, paid, amount, actor_member_id, actor_phone_last4, device_secret } = body;
  if (!member_id) return badRequest("member_id is required");
  if (!actor_member_id || !actor_phone_last4) return badRequest("actor identity is required");

  const target = await env.DB.prepare(`SELECT id, name FROM members WHERE id = ?1`)
    .bind(member_id)
    .first();
  if (!target) return badRequest("Member not found", 404);

  const actor = await env.DB.prepare(
    `SELECT id, name, phone, can_manage_payments, payment_device_secret FROM members WHERE id = ?1`
  )
    .bind(actor_member_id)
    .first();
  if (!actor) return badRequest("Actor not found", 404);
  const actorLast4 = (actor.phone || "").replace(/\D/g, "").slice(-4);
  if (!actorLast4 || actorLast4 !== String(actor_phone_last4)) {
    return json({ error: "Could not verify who is making this change" }, 403);
  }

  if (!actor.can_manage_payments) {
    return json({ error: "You don't have permission to change payments" }, 403);
  }

  let issuedSecret = null;
  if (!actor.payment_device_secret) {
    issuedSecret = crypto.randomUUID();
    await env.DB.prepare(`UPDATE members SET payment_device_secret = ?1 WHERE id = ?2`)
      .bind(issuedSecret, actor.id)
      .run();
  } else if (!device_secret || device_secret !== actor.payment_device_secret) {
    return json(
      { error: "This can only be done from the device you first used for payments. Ask the site owner to reset device access." },
      403
    );
  }

  const paidInt = paid ? 1 : 0;
  const amountInt = Number(amount) || 0;

  await env.DB.prepare(
    `INSERT INTO payments (event_id, member_id, paid, amount, updated_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))
     ON CONFLICT(event_id, member_id) DO UPDATE SET paid = excluded.paid, amount = excluded.amount, updated_at = excluded.updated_at`
  )
    .bind(event.id, member_id, paidInt, amountInt)
    .run();

  await env.DB.prepare(
    `INSERT INTO payment_activity_log
       (event_id, target_member_id, target_member_name, changed_by_member_id, changed_by_name, paid, amount, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))`
  )
    .bind(event.id, member_id, target.name, actor_member_id, actor.name, paidInt, amountInt)
    .run();

  return json(issuedSecret ? { ok: true, device_secret: issuedSecret } : { ok: true });
}
