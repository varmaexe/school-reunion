import { json, getCurrentEvent, isAdmin } from "../../_lib.js";

// GET /api/admin/verify — checks the X-Admin-Pin header without mutating
// anything. Used by the frontend to validate a PIN before unlocking the
// organizer view.
export async function onRequestGet({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);
  return json({ ok: true });
}
