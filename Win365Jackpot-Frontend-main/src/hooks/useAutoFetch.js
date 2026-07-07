import { useState, useEffect, useRef, useCallback } from "react"

/**
 * useAutoFetch(fetchFn, params, { intervalMs })
 *
 * Loads once, exposes loading/error/data state, and re-fetches on an
 * interval (bypassing the service-level cache) so Events/Poker/Promotions
 * stay "live" without the user having to refresh the page. Pass
 * intervalMs: 0 to disable auto-refresh.
 */
export function useAutoFetch(fetchFn, params, { intervalMs = 60_000 } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const paramsKey = JSON.stringify(params)
  const paramsRef = useRef(params)
  paramsRef.current = params

  const load = useCallback(async (force = false) => {
    if (force) setLoading(prev => prev); else setLoading(true)
    setError(null)
    try {
      const result = await fetchFn(paramsRef.current, { force })
      setData(result)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [fetchFn])

  useEffect(() => {
    load(false)
    if (!intervalMs) return undefined
    const id = setInterval(() => load(true), intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, paramsKey, intervalMs])

  return { data, loading, error, reload: () => load(true) }
}
