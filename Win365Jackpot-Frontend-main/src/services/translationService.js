// MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
//
// Translation itself always happens server-side (keeps provider API keys
// off the client, and means messages are translated as part of the same
// authenticated request that stores them — no separate round-trip). This
// module is just the thin client for the one config read every caller needs
// before deciding whether to render anything new.
const API = import.meta.env.VITE_API_URL || "";

// Deliberately NOT cached across the page session: an admin can flip
// SupportSettings.enabled at any time from another tab, and a customer's
// already-open Support tab needs to pick that up on its next mount/poll
// rather than being stuck on whatever the flag was when the page first
// loaded. It's a tiny local JSON GET — cheap enough to just always fetch.
export async function fetchSupportConfig() {
  try {
    const res = await fetch(`${API}/api/support/config/`);
    if (!res.ok) throw new Error("config fetch failed");
    return await res.json();
  } catch {
    // Network hiccup or the endpoint not existing yet (flag fully off) both
    // fail safe to "feature disabled" — never block the existing support UI.
    return { enabled: false, supported_languages: [], default_language: "en" };
  }
}
