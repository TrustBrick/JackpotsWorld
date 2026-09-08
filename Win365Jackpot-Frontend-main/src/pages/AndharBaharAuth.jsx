import React from 'react'
import AuthPage from './AuthPage'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchAndharBaharContent } from '../services/andharBaharService'

/**
 * The Andhar Bahar section's own sign-in / sign-up doorway.
 *
 * ── Why a section route at all ────────────────────────────────────────────
 * A visitor who arrived for Andhar Bahar and is asked to sign up should be
 * told what they are signing up FOR, and should land back on Andhar Bahar
 * afterwards. The site-wide /sign-up does neither: it is generic, and it drops
 * you on the dashboard, which loses both the event you were looking at and the
 * reason you registered.
 *
 * ── One account, not one per game ─────────────────────────────────────────
 * This is a different DOORWAY, not a different account system. The same
 * credentials work across Poker, Teen Patti and Andhar Bahar, so a member who
 * signs up here can register for a poker tournament tomorrow without a second
 * account, and their wallet, VIP level and affiliate attribution follow them.
 * Per-game accounts would fragment every one of those, and would mean a player
 * who forgets which door they used cannot get back in.
 *
 * ── The prompt is Back Office copy ────────────────────────────────────────
 * `signup_prompt` comes from AndharBaharContent, so the wording is an admin's
 * to change. The fallback below is used only while the request is in flight or
 * if it fails — never merged with live content.
 */

const FALLBACK_PROMPT =
  'Interested in Andhar Bahar? Sign up to find out where the events are '
  + 'happening and where the tables are live.'

export default function AndharBaharAuth({ tab }) {
  const { data } = useAutoFetch(fetchAndharBaharContent, {}, { intervalMs: 0 })
  const prompt = data?.content?.signup_prompt || FALLBACK_PROMPT

  return (
    <AuthPage
      tab={tab}
      // Back to the section, not the dashboard — see the note above.
      returnTo="/andhar-bahar"
      prompt={prompt}
    />
  )
}
