import { json, badRequest, readJson } from "../_lib.js";

// POST /api/identify — { member_id, phone_last4 }
// Read-only identity check used by the sign-in gate to confirm a guest is
// who they claim to be, without touching their RSVP status (unlike
// /api/rsvp, which would overwrite it on every re-login).
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const { member_id, phone_last4 } = body;
  if (!member_id) return badRequest("member_id is required");
  if (!phone_last4 || !/^\d{4}$/.test(String(phone_last4))) {
    return badRequest("phone_last4 (4 digits) is required");
  }

  const member = await env.DB.prepare(`SELECT id, phone FROM members WHERE id = ?1`)
    .bind(member_id)
    .first();
  if (!member) return badRequest("Member not found", 404);

  const last4 = (member.phone || "").replace(/\D/g, "").slice(-4);
  if (!last4 || last4 !== String(phone_last4)) {
    return json({ error: "Those last 4 digits don't match our records" }, 403);
  }

  return json({ ok: true });
}
