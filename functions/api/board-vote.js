import { json, badRequest, readJson, getCurrentEvent } from "../_lib.js";

// POST /api/board-vote — { post_id, vote, member_id, phone_last4 }
// vote is 1 (up), -1 (down), or 0 (remove my vote). Only allowed on
// "proposal" and "feedback" posts — not "kindwords". Identity is confirmed
// the same way as /api/rsvp, purely to enforce one vote per person; the
// voter's identity is never returned by any route, including for votes on
// anonymous feedback posts.
export async function onRequestPost({ request, env }) {
  const event = await getCurrentEvent(env);
  if (!event) return badRequest("No active event", 404);

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const { post_id, vote, member_id, phone_last4 } = body;
  if (!post_id) return badRequest("post_id is required");
  if (![1, -1, 0].includes(vote)) return badRequest("vote must be 1, -1, or 0");
  if (!member_id) return badRequest("member_id is required");
  if (!phone_last4 || !/^\d{4}$/.test(String(phone_last4))) {
    return badRequest("phone_last4 (4 digits) is required to confirm identity");
  }

  const post = await env.DB.prepare(`SELECT id, type FROM board_posts WHERE id = ?1 AND event_id = ?2`)
    .bind(post_id, event.id)
    .first();
  if (!post) return badRequest("Post not found", 404);
  if (post.type === "kindwords") return badRequest("Voting isn't available on kind words");

  const member = await env.DB.prepare(`SELECT id, phone FROM members WHERE id = ?1`)
    .bind(member_id)
    .first();
  if (!member) return badRequest("Member not found", 404);
  const last4 = (member.phone || "").replace(/\D/g, "").slice(-4);
  if (!last4 || last4 !== String(phone_last4)) {
    return json({ error: "Phone number does not match our records" }, 403);
  }

  if (vote === 0) {
    await env.DB.prepare(`DELETE FROM board_votes WHERE post_id = ?1 AND member_id = ?2`)
      .bind(post_id, member_id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO board_votes (post_id, member_id, vote, created_at) VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(post_id, member_id) DO UPDATE SET vote = excluded.vote`
    )
      .bind(post_id, member_id, vote)
      .run();
  }

  return json({ ok: true });
}
