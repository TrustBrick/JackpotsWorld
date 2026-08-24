// Fetching a support-chat attachment.
//
// The API returns attachments as a path to an authorised endpoint rather than
// a storage URL, precisely so that possessing the link is not the same as
// being allowed to read the document (see LiveChatAttachmentView). That means
// a plain <a href> cannot work: the session lives in a bearer token, not a
// cookie, so the browser would send an unauthenticated request and get a 404.
//
// So we fetch it ourselves with the Authorization header, then hand the
// resulting bytes to the browser as an object URL. The object URL is local to
// this tab and is revoked afterwards, so nothing durable and shareable is
// created.

const API = import.meta.env.VITE_API_URL || ""

// Object URLs pin their blob in memory until revoked. A minute is far longer
// than the browser needs to start the download, and short enough that opening
// a run of documents does not accumulate.
const REVOKE_AFTER_MS = 60000

export async function fetchAttachment(path, token) {
  if (!path) throw new Error("No attachment")
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error("Your session has expired. Please sign in again.")
  }
  if (res.status === 404) {
    throw new Error("This document is no longer available.")
  }
  if (!res.ok) throw new Error("Could not download the document.")
  return res.blob()
}

// Downloads the attachment and saves it under its original name.
export async function openAttachment(path, filename, token) {
  const blob = await fetchAttachment(path, token)
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = filename || "attachment"
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_AFTER_MS)
}
