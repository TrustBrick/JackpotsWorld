# Media Architecture

How every image and video in JackpotsWorld is stored, addressed, served and
cached. **Read this before adding, moving or serving any media.** The rules
here exist because each was violated at least once and broke production.

There is exactly **one** media system. Do not add a second one.

---

## 1. The two kinds of media (they are not interchangeable)

| | **Bundled assets** | **Uploaded media** |
|---|---|---|
| What | Brand images, page artwork, watermark footage — anything shipped by developers | Anything an admin uploads through the Back Office |
| Lives in | `Win365Jackpot-Frontend-main/public/assets/` | S3 bucket `jackpotsworld-media` |
| Reaches production via | The deploy artifact | The upload API |
| URL shape | `/assets/...` | `/media/...` → S3 |
| Present on a brand-new instance? | **Yes, always** | Yes (shared storage) |
| Changed by | A commit + deploy | A Back Office upload |

If a piece of media must be reliably present with no dependency on an
upload having succeeded or survived — a fallback, a watermark, a logo — it
is a **bundled asset**. Everything an admin manages is **uploaded media**.

---

## 2. Bundled assets — every URL starts with `/assets/`

Source of truth: `Win365Jackpot-Frontend-main/public/assets/`

```
public/assets/
  images/          → /assets/images/...
  videos/          → /assets/videos/...
  icons/           → /assets/icons/...   (favicon, apple-touch-icon, site.webmanifest)
```

Vite copies `public/` verbatim into `dist/`, so the on-disk path under
`public/` **is** the production URL path.

### Why the `/assets/` prefix is mandatory

`jackpotsworld.vip` is behind Cloudflare, and Cloudflare is configured to
issue a **bot challenge** on static paths. Measured against production on
2026-08-18, with an ordinary Chrome UA and full browser headers:

| Path | Result |
|---|---|
| `/assets/**` (any depth) | **200**, or a real **404** if the file is not on disk — see §2.1 |
| `/api/**`, `/media/**`, `/robots.txt`, `/` | **200** |
| `/images/**`, `/videos/**`, `/static/**` | **403** `Cf-Mitigated: challenge` |
| `/favicon.ico`, `/site.webmanifest`, `/apple-touch-icon.png` | **403** `Cf-Mitigated: challenge` |

The origin served **all** of these correctly with `200`; the 403 is added by
Cloudflare's edge and the request never reaches Django.

This is not a cosmetic problem. A challenge is solvable only by a **page
navigation** that can execute the challenge JavaScript. A subresource
request — `<img src>`, `<video src>`, `fetch()` — cannot solve it. The
browser gets an HTML challenge page where it expected image or video bytes:
the image is broken, and a `<video>` reports `error.code 4`
(`MEDIA_ELEMENT_ERROR: Format error`).

The reason this looked like "works on my machine": once a browser passes a
challenge on any navigation, Cloudflare sets a `cf_clearance` cookie, and
subsequent subresource requests carry it and succeed. A developer's browser
has that cookie. **A fresh device, a new browser, an incognito window, or a
different network does not** — which is precisely the reported symptom, and
why "refresh two or three times" sometimes appeared to fix it.

> **Rule:** never reference a bundled asset at a path outside `/assets/`.
> A new top-level directory under `public/` will be challenged and will
> fail for every visitor who has not already passed a challenge.

Cloudflare's rule is configuration, not code, and could be changed in the
dashboard. **Fixing it there is still worth doing** (see §7), but keeping
assets under `/assets/` is correct regardless and does not depend on it.

---

### 2.1 A missing asset must 404, never return the SPA shell

`/assets/` is excluded from the SPA catch-all in `backend/urls.py`. Whitenoise
serves the files that exist before the resolver ever runs, so anything
reaching the catch-all under that prefix is a file that is **not on disk**.

Until this exclusion existed, those requests were answered with `index.html`:
`200 text/html` where image or video bytes were expected. That is the worst
available outcome —

- an `<img>` is silently broken with no failed request to point at,
- a `<video>` fails with the same generic `MEDIA_ELEMENT_ERROR: Format error`
  that a Cloudflare challenge produces, so the two are indistinguishable,
- and DevTools shows `200`, so a missing asset does not look like a problem
  at all.

Measured on production 2026-08-19, before the fix:
`/assets/images/definitely-not-real-xyz123.jpg` → `200 text/html`, 11568 bytes.

> **Rule:** when auditing media, check the **Content-Type**, not just the
> status code. A `200 text/html` on an image URL is a missing file.
> `authapp/tests_spa_routing.py` locks this in from both directions: missing
> assets 404, existing assets still serve as `image/*`.

---

## 3. Uploaded media — S3, not instance disk

Production is Elastic Beanstalk, **load-balanced with an Auto Scaling
Group**. That means more than one instance can serve traffic, and instances
are replaced without warning (health check failure, AZ rebalance, platform
update, scale-in).

Local-disk media is therefore unusable in production, and this is not
theoretical — both failure modes happened:

- **2026-08-17** — the instance was replaced. Every uploaded file on its
  local disk was destroyed. The database rows survived (RDS is separate),
  so the API kept serving URLs for files that no longer existed. Five
  references were permanently lost.
- **2026-08-18** — with two instances running, an upload landed on only one
  of them. Twenty identical requests for the same file returned **ten
  `200`s and ten `404`s**: the load balancer alternated between the
  instance that had the file and the one that did not. This is the true
  cause of "the image appears if I refresh a few times".

### How it works now

`AWS_STORAGE_BUCKET_NAME` is set on the environment, so
`STORAGES["default"]` resolves to `authapp.storage_backends`:

- **`PublicMediaStorage`** — no key prefix, `querystring_auth = False`, so
  URLs are stable and non-expiring. Non-expiry is load-bearing: a presigned
  URL embedded in a long-lived page or a `<video>` mid-playback would die on
  a timer, which is exactly the "video cuts off" failure mode.
- **`PrivateMediaStorage`** — key prefix `private/`, presigned URLs with a
  1 hour expiry. Used for KYC documents (`doc_front`, `doc_back`, `selfie`,
  `id_proof_file`) and support ticket attachments.

The bucket policy grants anonymous `GetObject` **only** on the known-public
prefixes (`landing/`, `promotions/`, `teenpatti/`, `poker/`, `events/`,
`spin/`, `wheel/`, `avatars/`). `private/` is deliberately absent and
returns `403` to anonymous requests — verified.

> **Security note:** while media was on local disk, KYC documents were
> served through the same fully-public, zero-auth path as marketing images.
> Enabling S3 is what actually closes that exposure, because
> `PrivateMediaStorage` is inert until `AWS_STORAGE_BUCKET_NAME` is set.

No static AWS keys exist anywhere. boto3 picks up the EC2 instance role
(`aws-elasticbeanstalk-ec2-role`, policy `jackpotsworld-media-s3-access`).

### Verifying the bucket policy — read this before concluding it is broken

An anonymous `GET` of a **nonexistent** key returns **`403 AccessDenied`**,
not `404`, even when the public-read policy is perfectly correct. S3 only
answers `404 NoSuchKey` to a caller that also holds `s3:ListBucket`; without
it, S3 deliberately refuses to confirm whether a key exists. The policy
grants `s3:GetObject` alone, by design.

So `403` on a made-up key proves **nothing**, and a sweep of invented keys
across every prefix returning `403` is the expected result of a *correct*
configuration. Distinguishing a real permissions fault requires a key that
genuinely exists:

```bash
aws s3 ls s3://jackpotsworld-media/ --recursive --region ap-south-1 | head
# then, against a real key from that listing — no credentials:
curl -s -o /dev/null -w '%{http_code}
'   https://jackpotsworld-media.s3.ap-south-1.amazonaws.com/<a-real-key-from-above>
```

`200` = public read is working. `403` on a key that is definitely present =
a genuine fault, and the two things to check are the bucket policy itself
and S3 **Block Public Access**, which silently overrides a public policy:

```bash
aws s3api get-bucket-policy --bucket jackpotsworld-media --region ap-south-1 --query Policy --output text
aws s3api get-public-access-block --bucket jackpotsworld-media --region ap-south-1
```

---

### Range requests

S3 answers `Range` requests natively (`206 Partial Content`), which is what
makes video seeking and resume-after-stall work.

Before S3, `/media/` was served by `authapp/views/media_serve_views.py`,
which exists because Django's `django.views.static.serve` ignores `Range`
entirely and returns the whole file with a `200`. A browser that asked for
bytes 40000000–41000000 and receives the whole file from byte 0 treats the
stream as broken. That view is still the fallback for local dev and any
environment without S3 — do not route `/media/` back through
`django.views.static.serve`.

---

## 4. URL generation — one path, no special cases

Uploaded media URLs are produced in exactly one way: DRF serializers call
`FileField.url` with the request in context, so Django builds an absolute
URI from the incoming request.

This is already correct and **must not** be replaced with a hardcoded
domain, an environment-specific base URL, or string concatenation.
Verified against production:

- Requested via `https://jackpotsworld.vip` → `https://jackpotsworld.vip/media/...`
- Requested via the EB CNAME → that host

`SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` is set in
`backend/settings.py`, which is what keeps the scheme `https` behind the
load balancer and Cloudflare. **Without it every media URL would be `http://`
and browsers would block them all as mixed content.** Do not remove it.

There is no `localhost`, `127.0.0.1`, or hardcoded IP anywhere in media URL
generation, and none should be introduced.

### The one duplicated URL: server-rendered SEO tags

`authapp/views/spa_seo.py` is a **hand-maintained mirror** of
`src/config/seo.js` — it re-renders `og:image`, `twitter:image` and the
schema.org Organization logo server-side, because social scrapers never run
JS. The Python copy wins: it rewrites the tags Vite put in `index.html`.

That mirror is the one place a bundled-asset URL is written twice, and it
drifted exactly as you would expect. When the frontend icons moved under
`/assets/`, the Python side was missed and kept emitting
`https://jackpotsworld.vip/web-app-manifest-512x512.png` — a **403** for
every scraper, so every WhatsApp/Telegram/Slack/LinkedIn link preview and
Google's brand logo silently had no image. Nothing failed loudly; the site
looked fine to a human.

`authapp/tests_spa_seo_assets.py` now asserts structurally that **no bundled
asset URL emitted by that module sits outside `/assets/`**, rather than
matching one hardcoded string that would have to be edited in lockstep.
If you add an asset URL to either file, add it to both.

---

## 5. Caching

| Asset | `Cache-Control` | Why |
|---|---|---|
| `index.html` | `no-cache` | Always revalidated, so a deploy is picked up immediately. **Never** give this a long max-age — visitors would hold a stale document pointing at hashed bundles that no longer exist. |
| `/assets/<name>-<hash>.js\|css` | `max-age=31536000` | Vite content-hashes the filename; new build ⇒ new URL. |
| `/assets/images/**`, `/assets/videos/**`, `/assets/icons/**` | `max-age=31536000` (`WHITENOISE_MAX_AGE`) | Stable filenames. To replace the *bytes* at an existing name, bump the `?v=N` query string at every reference — see `index.html` and `src/components/Hero.jsx`. |
| `/media/**` (S3) | `max-age=86400` | `AWS_S3_OBJECT_PARAMETERS`. A day, not forever: Django renames on key collision (`file_overwrite = False`), so a *replacement* normally gets a new URL anyway. The bounded window only covers delete-then-re-upload under the identical filename. |

The frontend layer: `src/services/landingService.js` caches API responses
for 60s; hero sections re-poll via `useAutoFetch` so a Back Office change is
picked up without a navigation; `invalidateLandingCache()` is called after
an admin write so the change appears immediately.

**Never** "fix" a media caching problem with `window.location.reload()`, a
`setTimeout` retry, or asking users to hard-refresh. Every one of those
hides a real cause.

---

## 6. Uploads and storage keys

`upload_to` puts files under a per-feature prefix (`landing/`,
`landing/section_media/`, `promotions/`, …). Django sanitises the filename
and, with `file_overwrite = False`, appends a random suffix on collision —
so two uploads of `photo.jpg` never overwrite each other.

File-name fields are `max_length=255`, not Django's 100-char default,
because real uploads exceed it: an 86-character filename under a 22-char
`upload_to` is already 108 before any dedup suffix.

Long names, spaces and mixed case are handled and are **not** a cause of
the 403/404s — those were Cloudflare and instance-local storage
respectively. Verified: `star-cruises.jpg` and a 92-character
`WhatsApp_Video_…` name behaved identically.

---

## 7. Operating it

**Adding a bundled asset** — drop it under `public/assets/…`, reference it
as `/assets/…`, rebuild, and copy `dist/` into
`Win365Jackpot-Backend-main/jackpotsworld_frontend_dist/`.

**Hero watermark videos** — Poker and Teen Patti each have their own, and
must never share one (`src/config/heroWatermarks.js`). A Back Office upload
into the `background` slot overrides the bundled default; if that upload
fails to load, `HeroBackgroundVideo` falls back to the bundled file, then to
a poster, then renders nothing. Sources are tried in order exactly once, so
a broken source can never cause a retry loop.

**Diagnostics**

```bash
python manage.py audit_media_files            # read-only: DB refs whose file is missing
python manage.py clear_dangling_media         # dry run
python manage.py clear_dangling_media --apply # clear refs whose file is gone
```

`clear_dangling_media` refuses to run against non-S3 storage without
`--allow-local-storage`, because on a multi-instance environment a file
sitting on *another* instance looks missing and its reference would be
wrongly cleared.

**Storage cutover, in this order — never bundle these steps**

1. Copy the files into the bucket.
2. **Verify they are actually there** (`aws s3 ls`, plus an anonymous GET).
3. Only then set `AWS_STORAGE_BUCKET_NAME` / `AWS_S3_REGION_NAME`.

Step 2 is not optional. On 2026-08-18 the switch was flipped on the
assumption that a deploy hook had populated the bucket. It had not, and
every image and video on the site 404'd until an emergency rollback. The
hook had exited 0 because the migration command no-ops when S3 is
unconfigured — indistinguishable from success. That is now fixed
(`--require-s3`, and a versioned marker file), but the ordering rule stands.

Rollback is `eb setenv AWS_STORAGE_BUCKET_NAME= AWS_S3_REGION_NAME=`. Have
it ready before starting.

**Cloudflare** — the challenge on `/images/**`, `/videos/**`, `/static/**`
and the root icons is still active and is worth removing at the source:
in the Cloudflare dashboard, either turn off Bot Fight Mode
(Security → Bots) or add a WAF custom rule that **skips** security checks
for static asset paths. Keep serving from `/assets/` regardless.

**Known follow-ups (not media bugs, but they interact with this)**

- `videos/hero-background.mp4` is ~37 MB and loads on the landing page. The
  ASG scales out on `NetworkOut` averaging 6 MB over 5 minutes, so a handful
  of concurrent viewers can trigger a new instance. Harmless now that media
  is shared, but it is a real cost and latency issue; the file should be
  re-encoded much smaller.
- Deployment policy is `AllAtOnce` on a single instance, so each deploy has
  a 2–5s outage. Now that media is on S3, an instance-replacing policy
  (`Rolling`, `Immutable`) is finally safe and would remove that blip.
