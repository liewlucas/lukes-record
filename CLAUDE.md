# The Cabin at Golden Hour

3D interactive portfolio: Astro 7 (static-first) + Cloudflare Workers + Storyblok CMS,
with a single React Three Fiber island for the scene.

**Source of truth:** [docs/BRIEF.md](docs/BRIEF.md). Read it fully before writing code.
Design tokens, content model, routes, performance budget, and acceptance criteria all live there.

## Conventions
- No Claude attribution in commits or PRs. No Co-Authored-By trailers, no "generated with" footers.
- Before adding or bumping any dependency, check the latest version and known vulnerabilities
  (web search + `npm audit`) and record the checked version in the PR description.
- Secrets live in `.env` (gitignored) locally and in Wrangler/Cloudflare secrets in production. Never commit them.
- No portfolio copy in code. All content comes from Storyblok. `src/lib/placeholders.ts` exists only
  so the build passes without a token and must not grow into a content store.
- Palette: use the CSS tokens in `src/styles/tokens.css`. Never use `#D97757`.
- Package manager: npm (lockfile is `package-lock.json`).

## Commands
- `npm run dev` — Astro dev server (workerd runtime). It daemonizes: use `npx astro dev status|logs|stop`. Binds IPv6 loopback, so curl `localhost`, not `127.0.0.1`.
- `npm run build` — static build + Worker bundle into `dist/`
- `npm run preview` — serve the built site with wrangler locally
- `npm run deploy:dry` — `wrangler deploy --dry-run` (pipeline check without deploying)
- `npm run check` — `astro check`

## Architecture notes
- Pages and design components consume the normalised model in `src/lib/types.ts`, never raw bloks. `src/lib/content.ts` maps Storyblok fields (brief names preferred, the space's older names accepted). `src/storyblok/*.astro` are thin Visual Editor wrappers over `src/components/*`.
- Zone theming: `<body data-zone>`; cabin and porch backgrounds are set on `html:has(body[data-zone=…])` so they cover the whole canvas.
- The site is ONE continuous scroll (`src/components/Journey.astro`): vista → trail → cabin door → vinyl → photos → books → desk → porch. Sections carry `data-scene` keys; the 3D camera follows scroll through them. Routes `/`, `/trail`, `/cabin`, `/cabin/photos`, `/cabin/books`, `/porch` all render the journey scrolled to their section. Only `/cabin/vinyl/{slug}` and `/cabin/photos/{slug}` are separate detail pages.
- When the scene is on (`html[data-scene='on']`), `.flat` visuals hide and `.index` link lists show, so the 3D objects are the showpiece while every item stays reachable by keyboard.
- The 3D island lives in `src/scene/` and mounts via `src/components/SceneMount.astro` behind the HTML layer; content reaches it through `getSceneData()`.
- Storyblok is fetched at build time only (`src/lib/storyblok.ts`). The one runtime consumer is
  `src/pages/preview/[...slug].astro` (`prerender = false`, draft content, noindex) for the Visual Editor.
- Publishing in Storyblok fires a webhook to a Cloudflare deploy hook, which rebuilds the site.
- `session: false` in astro.config keeps the Cloudflare adapter from provisioning a KV namespace. Re-enable only if a feature needs sessions.
- `imageService: 'passthrough'` for now. Images come from Storyblok's CDN or R2. Revisit when the photo wall lands.
- `sharp` is overridden to 0.35.4 in package.json because miniflare pins a version with libheif advisories. Drop the override once miniflare updates.
