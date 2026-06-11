# Docs landing page — v2 promoted to `/`

## Goal
Replace the legacy home landing page with the engineering-grade v2 design as the primary `/` route.

## Done
- [x] Move v2 page to `app/(home)/page.tsx` with scoped layout + `v2.css`
- [x] Remove legacy `app/page.tsx`, `sections/hero.tsx`, `sections/cta.tsx`
- [x] Update site default metadata to v2 copy
- [x] Point nav logo to `/`; remove footer "Current landing" link
- [x] Keep `/v2` as client redirect to `/` for bookmarks
- [x] Verify build

## Review
- Primary landing is now at `/` using all `src/components/v2/*` sections.
- Secondary marketing pages (`/pricing`, `/faq`, etc.) still use `LandingLayout` + legacy emerald styling.
- `/v2` redirects to `/`.
