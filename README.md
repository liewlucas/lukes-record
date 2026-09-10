# The Cabin at Golden Hour

A 3D interactive portfolio for an AI engineer with an analog heart. One continuous walk:
a golden-hour vista, a pine trail, a lamp-lit cabin where projects are vinyl records, and a
porch with a letterbox.

The design brief and build plan live in [docs/BRIEF.md](docs/BRIEF.md). It is the source of truth.

## Shape of the site

One continuous scroll: vista, trail, the cabin door, then the vinyl shelf, photo wall, bookshelf and desk, and out to the porch. The 3D camera follows the scroll; the HTML underneath is the same walk as a warm 2D site, which is what search engines, screen readers and devices without WebGL get. Zone URLs deep-link to a point on the walk; records and prints have their own pages.

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 7, static-first |
| 3D | React Three Fiber island (Phase 3) |
| CMS | Storyblok, Community plan, fetched at build time |
| Hosting | Cloudflare Workers with static assets, one server route for `/preview/*` |
| Deploys | Workers Builds from git; Storyblok publish webhook → Cloudflare deploy hook |

## Local development

```sh
cp .env.example .env      # add STORYBLOK_PREVIEW_TOKEN (preview token) to see real content
npm install
npm run dev               # http://localhost:4321, runs on Cloudflare's workerd runtime
```

Without a token the site builds from the thin placeholders in `src/lib/placeholders.ts`.

Astro 7 runs the dev server as a background daemon: `npm run dev` returns immediately, then
`npx astro dev status`, `npx astro dev logs`, and `npx astro dev stop` manage it. It listens on
`http://localhost:4321` (IPv6 loopback), so use `localhost` rather than `127.0.0.1`.

| Script | What it does |
|---|---|
| `npm run dev` | Astro dev server |
| `npm run build` | Static pages + Worker bundle into `dist/` |
| `npm run preview` | Build, then serve with `wrangler dev` |
| `npm run check` | `astro check` (types + templates) |
| `npm run deploy:dry` | Build, then `wrangler deploy --dry-run` |
| `npm run deploy` | Build and deploy with wrangler (normally left to Workers Builds) |

## Storyblok setup

1. Create a space (Community plan). Note its region; set `STORYBLOK_REGION` if it is not EU.
2. Settings → Access tokens: copy the **preview** token into `.env` as `STORYBLOK_PREVIEW_TOKEN`.
   The preview token reads draft and published content, which the Visual Editor needs.
3. Align the space with the content model in [docs/BRIEF.md §6](docs/BRIEF.md):
   create a personal access token (My account → Security), put it in `.env` as
   `STORYBLOK_MANAGEMENT_TOKEN` with `STORYBLOK_SPACE_ID`, then run
   `node scripts/storyblok-sync-schema.mjs --dry-run` and, when happy, without the flag.
   The script is additive: it creates missing components and adds missing fields to existing
   ones (including the older `settings` and `projects` components), never deleting anything.
   `--seed` adds draft starter stories where a folder is empty. Components are rendered by the
   matching file in `src/storyblok/`, for example `site_settings` → `SiteSettings.astro`.
4. Content layout: a `settings` story, a `trail` page, a `porch` page, and folders for projects
   (`projects/` or `work/`), `photos/`, and books (`books/` or `reading/`). `src/lib/content.ts`
   reads both the brief's field names and the older ones, preferring the brief's.
5. Settings → Visual Editor: set the preview URL to `https://<your-site>/preview/`.
   Storyblok appends the story's full slug, so `projects/my-record` previews at
   `/preview/projects/my-record`. Locally, Storyblok requires https; use `vite-plugin-mkcert`
   or the Storyblok CLI proxy.

The `/preview/*` route is the only page rendered on the Worker at request time and the only
runtime caller of the Storyblok API. It rejects requests that do not come from the Visual
Editor, sends `noindex`, and is never cached.

## Cloudflare setup

1. Workers & Pages → Create → Import a repository → pick this repo.
   Build command `npm run build`, deploy command `npx wrangler deploy` (the default).
2. Worker → Settings → Build → **Build variables and secrets**: add `STORYBLOK_PREVIEW_TOKEN`,
   `STORYBLOK_REGION`, and `PUBLIC_SITE_URL`. These are build-time values; the Storyblok integration
   bakes the token into the server bundle so the preview route can use it.
3. Worker → Settings → Builds → **Deploy Hooks** → create one for `main`, name it
   `storyblok-publish`, copy the URL.
4. Storyblok → Settings → Webhooks → new webhook. Endpoint: the deploy hook URL. Triggers:
   story published, story unpublished, story moved/deleted. Storyblok sends a POST, which is
   what the deploy hook expects.

Publishing in Storyblok now rebuilds and redeploys the site with no code change.

## Dependency versions (checked 10 Sep 2026)

| Package | Version | Notes |
|---|---|---|
| astro | 7.3.2 | Brief said 5.x; 7.x is current and all SDKs below support it |
| @astrojs/cloudflare | 14.3.1 | Requires wrangler ≥ 4.125 |
| @storyblok/astro | 10.3.1 | Astro 3–7 |
| wrangler | 4.130.0 | dev dependency |
| typescript | 6.0.3 | `@astrojs/check` does not accept TypeScript 7 yet |
| @astrojs/check | 0.9.10 | dev dependency |
| sharp (override) | 0.35.4 | miniflare pins 0.35.2, which carries libheif advisories GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545 |

`npm audit` reports 0 vulnerabilities with the override in place.

For Phase 3: `@react-three/fiber` 9.7.0 currently requires React ≥ 19 and < 19.3, so pin
React 19.2.x rather than 19.3.0 when the island is added.
