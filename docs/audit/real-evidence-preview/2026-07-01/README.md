# 2026-07-01 Real Evidence Preview Capture

Status: pending.

This directory is reserved for the Phase 7 preview/staging capture required before touching or declaring the public production alias fixed.

Current state:

- No preview deploy or preview smoke has been run.
- `manifest.json` is intentionally absent until a generated preview URL is captured.
- Preview proof must run before production alias promotion.

Capture command after explicit preview approval:

```powershell
$env:RECOUP_CAPTURE_KIND="preview"
$env:RECOUP_CAPTURE_BASE_URL=$env:RECOUP_PREVIEW_URL
npm.cmd run capture:real-evidence-audit
npm.cmd run verify:real-evidence-hardening
```

The preview manifest must record route status, console errors, visible `EVD-*` IDs, visible `RECON-*` IDs, POD media/document load proof, and screenshots for the Phase 0 route inventory.
