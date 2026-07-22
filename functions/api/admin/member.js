import { json, badRequest, readJson, getCurrentEvent, isAdmin } from "../../_lib.js";

// POST /api/admin/member — { name, phone } (X-Admin-Pin header)
// Adds a member to the shared roster (not tied to a single event), so
// future reunions can reuse the same list.
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const body = await readJson(request);
  if (!body || !body.name || !String(body.name).trim()) {
    return badRequest("name is required");
  }

  const phone = body.phone ? String(body.phone).replace(/\D/g, "") : null;
  if (phone && phone.length < 4) {
    return badRequest("phone must have at least 4 digits");
  }

  try {
    const result = await env.DB.prepare(
      `INSERT INTO members (name, phone, created_at) VALUES (?1, ?2, datetime('now'))`
    )
      .bind(String(body.name).trim(), phone)
      .run();

    return json({ ok: true, id: result.meta.last_row_id });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) {
      return badRequest("A member with this phone number already exists", 409);
    }
    throw err;
  }
}
