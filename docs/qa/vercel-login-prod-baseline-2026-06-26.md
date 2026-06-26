# Vercel Login Production Baseline

Date: 2026-06-26

Production URL:

```text
https://recoup-self-eta.vercel.app/login
```

Linked Vercel project:

```text
hackathonopenai/recoup
```

No product code was changed before this baseline was captured.

## HTTP Timing Baseline

Command shape:

```powershell
curl.exe -L -s -o NUL -w "status=%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download} url=%{url_effective}" https://recoup-self-eta.vercel.app/login
```

| Attempt | Status | TTFB | Total | Notes |
|---:|---:|---:|---:|---|
| 1 | 200 | 64.129s | 64.198s | Cold production path reproduced the slow login symptom. |
| 2 | 200 | 0.550s | 0.550s | Warm path. |
| 3 | 200 | 0.591s | 0.591s | Warm path. |
| 4 | 200 | 0.761s | 0.761s | Warm path. |
| 5 | 200 | 0.610s | 0.610s | Warm path. |

Header check:

```text
HTTP/1.1 200 OK
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
Server: Vercel
X-Matched-Path: /login
X-Vercel-Cache: MISS
```

## Real-Browser Baseline

Tool: Playwright Chromium, 1440 x 1000 viewport.

Artifacts:

```text
output/playwright/prod-vercel-login-baseline/login-baseline-1440.png
output/playwright/prod-vercel-login-baseline/login-baseline-summary.json
```

Observed browser metrics after the HTTP baseline had warmed the route:

| Metric | Value |
|---|---:|
| Browser wall-clock navigation | 4195 ms |
| Response status | 200 |
| responseStart | 2809 ms |
| DOMContentLoaded | 3403 ms |
| loadEventEnd | 3686 ms |
| Console messages | 0 |
| Page errors | 0 |
| Non-2xx browser responses | 0 |
| Browser-visible Render/API URLs | 0 |

Visible login text includes persona/demo-oriented labels:

```text
Workspace
Forensics
Persona
Investigator
Reviewer
Maya
User ID
Password
Open Forensics Workspace
```

## Baseline Interpretation

- The slow production login issue is real: the first measured `/login` request took 64.198 seconds.
- Warm requests are fast enough to hide the issue during repeated manual checks.
- Browser network does not show `recoup-api.onrender.com` because any Render dependency during `/login` would happen server-side inside the Vercel render path.
- The current login route is server-rendered with `no-store`, so every login page request can execute server-side data fetch logic.
- The next fix should make `/login` render from Vercel-local login metadata and keep submit-time auth on the existing Supabase-backed `/api/demo-login` route.

