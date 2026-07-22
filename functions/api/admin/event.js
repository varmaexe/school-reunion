import { json, badRequest, readJson, getCurrentEvent, isAdmin } from "../../_lib.js";

// POST /api/admin/event — update event details and/or rotate the admin PIN.
// Body fields are all optional; only provided ones are updated.
// { name, venue, maps_url, event_date, contribution_amount, payment_phone, welcome_note, new_admin_pin }
// Payment access is intentionally not manageable here — see members.can_manage_payments in schema.sql.
// Points of contact are managed separately — see /api/admin/poc.
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const fields = [];
  const values = [];
  for (const key of ["name", "venue", "maps_url", "event_date", "contribution_amount", "payment_phone", "welcome_note"]) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (body.new_admin_pin) {
    fields.push(`admin_pin = ?`);
    values.push(String(body.new_admin_pin));
  }
  if (!fields.length) return badRequest("No fields to update");

  values.push(event.id);
  await env.DB.prepare(`UPDATE events SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return json({ ok: true });
}
