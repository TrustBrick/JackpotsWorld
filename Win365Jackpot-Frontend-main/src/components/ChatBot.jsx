// src/components/ChatBot.jsx
//
// The support widget's public face. Navbar, the user Dashboard and the
// affiliate panel all render <ChatBot /> exactly as before; this file is what
// decides how much of it actually downloads.
//
// WHAT CHANGED AND WHY
// ─────────────────────────────────────────────────────────────────────────────
// The implementation (ChatBotPanel) is the largest module in the app and drags
// the live-chat socket, the voice-call hook and the call modal in with it.
// Navbar puts the widget on every page, so all of it used to sit in the entry
// chunk that every visitor downloads before first paint — while most visitors
// never open the chat at all.
//
// Splitting it is safe because the panel is genuinely inert until opened: the
// socket is only created inside startLiveChat (a click), pollLiveMessages only
// runs as that socket's callback, and the unread counter can only move once a
// conversation exists. There is no background work to preserve, so nothing has
// to stay eager except the launcher you can see.
//
// The one behaviour that had to be re-homed is the "open-chat" event, which the
// Dashboard's Support tab dispatches to open this widget from elsewhere. That
// listener lives here now, so it works whether or not the panel has loaded yet.

import { Suspense, lazy, useCallback, useEffect, useState } from "react"
import ChatBotLauncher from "./ChatBotLauncher"

const importPanel = () => import("./ChatBotPanel")
const ChatBotPanel = lazy(importPanel)

export default function ChatBot({ portal = "player" }) {
  const [activated, setActivated] = useState(false)

  // Warm the chunk on hover/focus so the click that follows usually finds it
  // already there. import() is memoised, so this is free to call repeatedly and
  // costs nothing for visitors who never point at the launcher. On touch this
  // fires with the tap rather than before it, which is simply the un-warmed
  // case — correct either way, just not early.
  const prefetch = useCallback(() => { importPanel() }, [])

  // The Dashboard's Support tab opens this widget by dispatching "open-chat"
  // rather than reaching through a shared context. ChatBotPanel keeps its own
  // listener for the already-loaded case; this one covers the case where the
  // panel has not been fetched yet, which is the whole point of the split.
  useEffect(() => {
    const handler = () => setActivated(true)
    window.addEventListener("open-chat", handler)
    return () => window.removeEventListener("open-chat", handler)
  }, [])

  if (!activated) {
    return <ChatBotLauncher onOpen={() => setActivated(true)} onPrefetch={prefetch} />
  }

  // Fallback is the same launcher, so the corner does not go empty during the
  // fetch. It is inert on purpose: the open it would request is already in
  // flight, and a second click should not queue a second one.
  return (
    <Suspense fallback={<ChatBotLauncher onOpen={() => {}} />}>
      <ChatBotPanel portal={portal} initialOpen />
    </Suspense>
  )
}
