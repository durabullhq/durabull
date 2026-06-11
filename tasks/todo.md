# New Landing Page v2 (`/v2` in apps/docs)

## Goal
Build an entirely new, high-conversion, visually striking landing page for Durabull (BullMQ SaaS) at a new route in the docs Next.js app, viewable alongside the current `/` landing page. New aesthetic — no inspiration from current page other than product content.

## Design Direction
- **Aesthetic**: "Mission control / molten signal" — deep warm-black ink with hot amber→crimson gradient accents (bull energy, throughput heat). Editorial display serif (Instrument Serif italics) for headlines, Geist Mono for data labels, Geist Sans body.
- **Motion**: framer-motion staggered reveals, animated queue-flow hero visual (jobs flowing through lanes, failures flashing + retried), capability ticker marquee, scroll-triggered sections, hover glow micro-interactions. Reduced-motion respected.
- Distinct from current page (dark slate + emerald, Vercel/Linear style).

## Plan
- [x] Explore docs app + extract full product story (subagent)
- [ ] `src/styles/v2.css` — scoped `.v2` design tokens, keyframes, textures
- [ ] `app/v2/layout.tsx` — Instrument Serif via next/font, metadata, css import
- [ ] `app/v2/page.tsx` — section composition (server component)
- [ ] `src/components/v2/*` — nav, hero (animated queue flow), marquee, problem/solution, bento features (7), fleet analytics deep dive, incident workflow, deploy-your-way, zero-code 3-step, pricing ($0 beta), FAQ (reuse `src/lib/faqs.ts`), final CTA, footer
- [ ] Verify: `bun run dev:docs` (port 3002), browser screenshots at `/v2`, fix lints

## Review (done)
- Built `/v2` standalone (own nav/footer, no LandingLayout) — all sections shipped.
- Verified in browser at http://localhost:3002/v2/ with screenshots of every section.
- Biome clean, `tsc --noEmit` clean, `NEXT_OUTPUT=export bun run build` passes (`/v2` = 11.6 kB route).
- Only dev-overlay "issue" was a hydration diff on `data-cursor-ref` injected by browser tooling — not page code.

## Content sources
- `docs/marketing/landing-page-ai-prompt.md` (product bible)
- `src/lib/faqs.ts`, `src/lib/config.ts` (URLs)
- Real screenshots in `public/screenshots/`
