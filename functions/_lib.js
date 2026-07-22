// Shared helpers for Pages Functions routes under functions/api/**.
// Files/dirs prefixed with "_" are not routable, so this is import-only.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function badRequest(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function getCurrentEvent(env) {
  return env.DB.prepare(`SELECT * FROM events ORDER BY id DESC LIMIT 1`).first();
}

// Admin routes are PIN-gated via the X-Admin-Pin header, checked against
// events.admin_pin server-side — the real PIN never ships to the browser.
export function isAdmin(request, event) {
  const pin = request.headers.get("X-Admin-Pin");
  return Boolean(pin && event && pin === event.admin_pin);
}
