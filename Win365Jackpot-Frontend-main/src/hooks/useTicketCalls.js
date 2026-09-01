// src/hooks/useTicketCalls.js
//
// VOICE-CALL: the calls that happened on one conversation, for showing them
// inside the transcript.
//
// Reads the endpoint that already exists (TicketCallListCreateView.get) rather
// than adding one: it is scoped server-side to the requester's own ticket, so
// this hook cannot be pointed at somebody else's conversation whatever it is
// handed.

import { useCallback, useEffect, useState } from "react"

export function useTicketCalls({ fetcher, apiBase, ticketId, refreshKey = 0, enabled = true }) {
  const [calls, setCalls] = useState([])

  const load = useCallback(async () => {
    if (!enabled || !ticketId) { setCalls([]); return }
    try {
      const res = await fetcher(`${apiBase}/api/live-chat/${ticketId}/calls/`)
      if (!res?.ok) return
      const json = await res.json()
      // Tolerates the bare list and DRF's paginated envelope alike, since this
      // endpoint sits under the project-wide pagination default.
      setCalls(Array.isArray(json) ? json : (json?.results || []))
    } catch {
      // A transcript that is missing its call lines is worth far less than one
      // that fails to render, so this stays quiet and keeps the last result.
    }
  }, [fetcher, apiBase, ticketId, enabled])

  useEffect(() => { load() }, [load, refreshKey])

  return calls
}
