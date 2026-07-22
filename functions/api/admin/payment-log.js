import { json, getCurrentEvent, isAdmin } from "../../_lib.js";

// GET /api/admin/payment-log — recent payment-toggle history (X-Admin-Pin
// header — the general organizer PIN, not the Payments PIN, since this is
// transparency for the whole organizer team: anyone who can unlock the
// Organizer tools can see who changed what, even if they can't act on it
// themselves without also knowing the Payments PIN).
export async function onRequestGet({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const { results } = await env.DB.prepare(
    `SELECT id, target_member_name, changed_by_name, paid, amount, created_at
     FROM payment_activity_log WHERE event_id = ?1 ORDER BY id DESC LIMIT 100`
  )
    .bind(event.id)
    .all();

  return json({ log: results });
}
