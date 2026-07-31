// src/services/liveChatMessages.js
//
// Shared list-handling for the Live Support Chat transcript, used by both
// ends of the conversation (components/ChatBot.jsx for the player,
// admin/tabs/LiveSupportTab.jsx for the agent) so the two can't drift apart
// on how they dedupe and order messages.

/**
 * Normalises a message-list response.
 *
 * The live-chat list endpoints set `pagination_class = None`, so they return
 * a bare array. The paginated envelope is still tolerated: this list used to
 * inherit the project-wide PageNumberPagination, and reading `{count, next,
 * results}` as if it were an array is what made the player's chat blow up on
 * its first poll (`liveMessages.map is not a function`).
 */
export function asMessageArray(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.results)) return json.results
  return []
}

/**
 * Highest server-assigned id currently held, for use as ?after_id=.
 * Optimistic bubbles carry string ids ("pending-…") and are skipped.
 */
export function highestRealId(list) {
  return list.reduce((max, m) => (typeof m.id === "number" && m.id > max ? m.id : max), 0)
}

/**
 * Appends only messages we don't already have, keeping server order.
 * Used by the agent side, which has no optimistic placeholders to
 * reconcile — the player side layers pending-bubble matching on top.
 */
export function mergeById(prev, incoming) {
  if (!incoming.length) return prev
  const seen = new Set(prev.map(m => m.id))
  const added = incoming.filter(m => !seen.has(m.id))
  return added.length ? [...prev, ...added] : prev
}
