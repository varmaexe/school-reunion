import { json, badRequest, readJson, getCurrentEvent, isAdmin } from "../../_lib.js";

const STATUSES = ["planned", "in_progress", "dropped"];

// POST /api/admin/todo — create { title } or update { id, title?, status? }  (X-Admin-Pin header)
// DELETE /api/admin/todo?id=123                                              (X-Admin-Pin header)
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return badRequest("status must be one of 'planned', 'in_progress', 'dropped'");
  }

  if (body.id) {
    const fields = [];
    const values = [];
    if (body.title !== undefined) { fields.push("title = ?"); values.push(String(body.title).trim()); }
    if (body.status !== undefined) { fields.push("status = ?"); values.push(body.status); }
    if (!fields.length) return badRequest("No fields to update");
    values.push(body.id, event.id);
    await env.DB.prepare(`UPDATE todos SET ${fields.join(", ")} WHERE id = ? AND event_id = ?`)
      .bind(...values)
      .run();
    return json({ ok: true });
  }

  if (!body.title || !String(body.title).trim()) return badRequest("title is required");

  const result = await env.DB.prepare(
    `INSERT INTO todos (event_id, title, status, created_at) VALUES (?1, ?2, 'planned', datetime('now'))`
  )
    .bind(event.id, String(body.title).trim())
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestDelete({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!isAdmin(request, event)) return json({ error: "Invalid admin PIN" }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id query param is required");

  await env.DB.prepare(`DELETE FROM todos WHERE id = ?1 AND event_id = ?2`)
    .bind(id, event.id)
    .run();

  return json({ ok: true });
}
