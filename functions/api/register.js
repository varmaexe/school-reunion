import { json, badRequest, readJson, getCurrentEvent } from "../_lib.js";

// POST /api/register — { name, phone }
// Public self-service signup for guests who aren't on the organizer's
// roster yet — no admin PIN required. A real phone number is required
// (not just last 4 digits) so the person can sign back in later the same
// way everyone else does.
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!event) return badRequest("No active event", 404);

  const body = await readJson(request);
  if (!body || !body.name || !String(body.name).trim()) {
    return badRequest("name is required");
  }

  const phone = body.phone ? String(body.phone).replace(/\D/g, "") : "";
  if (phone.length < 4) {
    return badRequest("A phone number (at least 4 digits) is required so you can sign back in later");
  }

  try {
    const result = await env.DB.prepare(
      `INSERT INTO members (name, phone, created_at) VALUES (?1, ?2, datetime('now'))`
    )
      .bind(String(body.name).trim(), phone)
      .run();

    return json({ ok: true, id: result.meta.last_row_id, phone_last4: phone.slice(-4) });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) {
      return badRequest("That phone number is already registered — try signing in with your name instead", 409);
    }
    throw err;
  }
}
