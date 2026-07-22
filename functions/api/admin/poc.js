import { json, badRequest, readJson, getCurrentEvent, isAdmin } from "../../_lib.js";

// POST /api/admin/poc — { category, name }   (X-Admin-Pin header)
// DELETE /api/admin/poc?id=123                (X-Admin-Pin header)
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const { category, name } = body;
  if (!category || !String(category).trim()) return badRequest("category is required");
  if (!name || !String(name).trim()) return badRequest("name is required");

  const result = await env.DB.prepare(
    `INSERT INTO poc_entries (event_id, category, name, created_at)
     VALUES (?1, ?2, ?3, datetime('now'))`
  )
    .bind(event.id, String(category).trim(), String(name).trim())
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestDelete({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id query param is required");

  await env.DB.prepare(`DELETE FROM poc_entries WHERE id = ?1 AND event_id = ?2`)
    .bind(id, event.id)
    .run();

  return json({ ok: true });
}
