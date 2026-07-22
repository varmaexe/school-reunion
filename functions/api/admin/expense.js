import { json, badRequest, readJson, getCurrentEvent, isAdmin } from "../../_lib.js";

// POST   /api/admin/expense — { category, description, amount }  (X-Admin-Pin header)
// DELETE /api/admin/expense?id=123                                (X-Admin-Pin header)
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const { category, description, amount } = body;
  if (!amount || Number(amount) <= 0) return badRequest("amount must be greater than 0");

  const result = await env.DB.prepare(
    `INSERT INTO expenses (event_id, category, description, amount, created_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))`
  )
    .bind(event.id, category || null, description || null, Number(amount))
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestDelete({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id query param is required");

  await env.DB.prepare(`DELETE FROM expenses WHERE id = ?1 AND event_id = ?2`)
    .bind(id, event.id)
    .run();

  return json({ ok: true });
}
