# The Cabin at Golden Hour — design brief & build plan

A 3D interactive portfolio for an AI engineer with an analog heart. The site is one continuous
walk: a golden-hour alpine vista, a pine trail, a warm cabin where the work lives in analog
objects (projects as vinyl records, photography as prints on a line, reading on a bookshelf),
and a porch with a letterbox for contact.

This document is the source of truth for Claude Code. Read it fully before writing code.

---

## 1. Concept

- Working title: **The Cabin at Golden Hour**
- One-liner shown on the hero: "AI engineer with an analog heart." (owner may replace)
- Feeling: warm, unhurried, tactile. Field notes, not billboards. Nothing snaps; everything
  settles like a needle dropping onto a record.
- The 3D space is the navigation. The CMS holds the content. The scene never hardcodes
  portfolio content.

## 2. Audience & goals

Primary visitors, in order of importance:

1. **Recruiter / hiring manager in a hurry** — must reach projects in ≤ 2 interactions.
   A visible "skip to the work →" link on the hero jumps straight inside the cabin.
2. **Peer / fellow engineer** — will explore, click records, read liner notes.
3. **Casual visitor from social** — arrives on a deep link, e.g. a single project record.

Hard requirements that follow:

- Every zone and every project is deep-linkable:
  `/` (vista) · `/trail` · `/cabin` · `/cabin/vinyl/{slug}` · `/cabin/photos` ·
  `/cabin/photos/{slug}` · `/cabin/books` · `/porch`
- Deep links load their zone directly (camera already positioned) — no forced walk-through.
- The full walk is the delight path, never a toll gate.

## 3. Tech stack & architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Astro (latest v5.x) | Static-first, islands for 3D |
| 3D | React island with React Three Fiber + drei | Single island; rest of the site ships ~zero JS |
| CMS | Storyblok (free Community plan) | `@storyblok/astro` |
| Hosting | Cloudflare Workers (static assets + one SSR preview route) | `@astrojs/cloudflare` adapter |
| Large assets | Cloudflare R2 behind the CDN | GLB models, KTX2 textures, HDRs, full-res photos |
| Deploys | Git integration or `wrangler`; Storyblok publish webhook → Cloudflare deploy hook | Publish in CMS = rebuild |

Content flow (static-first to stay inside Storyblok's free-tier API cap):

1. Build time: Astro fetches all stories once via the Content Delivery API and bakes pages.
2. Runtime: visitors hit Cloudflare-cached static output. Storyblok receives ~0 calls.
3. Preview: one SSR route (`/preview/*`, noindex) renders draft content live for the
   Storyblok Visual Editor. This is the only runtime consumer of the API.
4. Publishing: Storyblok webhook calls a Cloudflare deploy hook → site rebuilds.

Version policy (org rule): before installing or pinning any package, check the latest
version and any known vulnerabilities via a quick web search. R3F has strict peer-dependency
pairing with `three` — verify the compatible pair before pinning either.

## 4. Design system

### 4.1 Palette tokens

```css
:root {
  --parchment:    #F5EFE2; /* page base, print borders */
  --kraft:        #E9DCC5; /* panels, record sleeves */
  --lamp-amber:   #D9A441; /* glow, highlights, focus rings */
  --burnt-sienna: #B85C38; /* accents, links, active states */
  --moss:         #6B7D5C; /* nature accents, success */
  --pine-shadow:  #3E4A3D; /* deep greens, dusk UI */
  --walnut:       #5C4633; /* wood, primary text on light */
  --ridge-haze:   #8FA3B0; /* distant mountains, cool rest notes */
}
```

Usage rules: `--burnt-sienna` is an accent, never a background wash. Text on `--parchment`
is `--walnut`, not near-black gray. Cool tones (`--ridge-haze`) exist to give the warmth
something to rest against — distant ridges, dusk sky, disabled states.

### 4.2 Typography

- Display / headings: **Fraunces** (variable; use the optical-size axis, soft-ink feel).
- Body: **Karla** (or Work Sans), sentence case everywhere.
- Mono: **IBM Plex Mono** for captions, film metadata, dates, code — the typewriter voice.
- Line length < 80ch; serif body (if used in liner notes) gets extra line-height.

### 4.3 Texture, light, motion, sound

- Post-processing: faint film-grain pass over the whole scene + subtle vignette. Faint means
  faint — it should read as texture, not noise.
- Lighting: permanent golden hour. Warm directional key, long soft shadows, light haze/fog on
  the vista, dust motes in lamp beams inside the cabin.
- Photo treatment: gallery images graded Portra-like (lifted blacks, warm mids, muted greens);
  white print borders; slight random rotation (±2°) as if pegged up by hand.
- Motion: slow, heavy easing (`cubic-bezier(0.22, 1, 0.36, 1)` family). One orchestrated
  page-load moment on the hero (name settling in); after that, motion only answers user
  actions. Respect `prefers-reduced-motion`: no idle animation, instant camera cuts.
- Sound: off by default. A small brass toggle enables an ambient layer — wind + birdsong
  outdoors, vinyl crackle + faint fire indoors. Never autoplay.

### 4.4 Distinctiveness guardrails (important)

Warm-cream + serif + terracotta is a known generic-AI-design cluster. The warmth here is the
owner's explicit brief, so keep it — but earn it through specifics:

- No SaaS-card kit: no grids of identical rounded cards with soft gray shadows. UI panels are
  kraft paper, record sleeves, signposts, letter paper — objects, not cards.
- No ALL-CAPS eyebrow labels, no `A · B · C` middle-dot meta strings, no decorative `→`
  suffixes on every link (the one honest exception: "skip to the work →" on the hero).
- Do not use #D97757 anywhere.
- No numbered section markers (01/02/03) — the journey is spatial, not enumerated.
- Spend boldness in one place: the cabin interior is the memorable thing. Everything around
  it stays quiet.

## 5. Scene map & interactions

### Zone 1 — Arrival vista (`/`)
Wide alpine panorama, mist in the valleys, sun low. Name settles in (the single page-load
moment), one-liner beneath, two affordances: "follow the trail" (scroll cue) and
"skip to the work →" (jump to `/cabin`).

### Zone 2 — The trail (`/trail`)
Scroll-driven camera down a pine path. Wooden signposts carry About content; distance-marker
posts carry skills ("Machine learning — 5 km"). The cabin appears ahead, windows lit.

### Zone 3 — The cabin (`/cabin`) — the hub
Lamp-lit interior with three interactive corners:

- **Vinyl shelf → projects.** Records on a shelf, spines readable. Pull one out → case study
  opens as liner notes on a kraft sleeve: tracklist = feature list, "recorded with" = tech
  stack, credits = collaborators/links, the record spinning on the player while reading.
- **Photo wall → photography.** Prints pegged on a line. Click → lightbox with film metadata
  (camera, stock, location, year) set in mono.
- **Bookshelf → reading & writing.** Pullable spines; a note tucked inside each like a
  bookmark (short review / takeaway). Optional: owner's longer writing as "journals".

Also in the room: a desk with a warm amber terminal glow — a wink at the day job (can link
to GitHub). Every interactive object gets a hover glow + cursor change + visible focus state.

### Zone 4 — The porch (`/porch`)
Dusk. A letterbox opens the contact form styled as writing a letter (paper texture, mono
type, "Send letter" action). Brass plaques for GitHub / LinkedIn / email. Optional guest book.

### Fallbacks
- **Mobile / low-power:** lighter scene (reduced geometry, no post-processing) or a 2D
  "illustrated map" mode with the same zones and content. Decide by device capability probe,
  not user agent alone.
- **No WebGL / reduced motion:** fully functional 2D version. The CMS-driven content is
  identical; only the shell differs. SEO reads the 2D/HTML layer.

## 6. Storyblok content model

Space: one space, free Community plan, single locale. Components below (field name — type):

**`project`** (content type; folder `projects/`)
- `title` — text
- `year` — number
- `cover` — asset (record-sleeve art, square)
- `one_liner` — text (spine label + link previews)
- `liner_notes` — richtext (the case study)
- `tracklist` — table or blocks of `feature` (name, short description) = feature list
- `stack` — multi-option or comma text ("recorded with")
- `links` — blocks of `plaque` (label, url) (repo, demo, paper)
- `featured` — boolean (front of shelf)
- `order` — number

**`photo`** (content type; folder `photos/`)
- `image` — asset (full-res lives in R2; store the R2 URL in `image_url` — text — if
  bypassing Storyblok's asset CDN to save quota; thumbnails may stay in Storyblok)
- `caption` — text
- `camera` — text · `film_stock` — text · `location` — text · `year` — number
- `order` — number

**`book`** (content type; folder `books/`)
- `title` — text · `author` — text
- `note` — richtext (the bookmark note)
- `status` — single-option: reading | finished | favorite
- `spine_color` — single-option from palette tokens

**`signpost`** (block, used on the trail page)
- `heading` — text · `body` — richtext · `distance_label` — text (optional, for skill posts)

**`site_settings`** (singleton story `settings`)
- `owner_name` — text · `tagline` — text
- `hero_skip_label` — text (default "skip to the work →")
- `social` — blocks of `plaque` (label, url)
- `ambient_sound_enabled` — boolean (master switch)

**`page`** (generic, for porch copy / guest book intro / anything else)
- `body` — blocks

Rules: the 3D scene reads only these stories; no portfolio copy in code. Slugs are stable
(they are public URLs). Editors never touch code to add a record, photo, or book.

## 7. Performance budget

- First view (vista): ≤ 2.5 MB transferred on desktop, ≤ 1.2 MB on mobile fallback.
- GLB: Draco or Meshopt compressed; textures KTX2/Basis; single environment HDR ≤ 1.5 MB.
- Target 60 fps desktop, 30+ fps mid-range mobile; frame budget checked with r3f-perf in dev.
- Zone-based lazy loading: trail and cabin assets load while the visitor is on the vista
  (suspense + preload), never blocking first paint.
- Lighthouse (2D/HTML layer): Performance ≥ 90 on the fallback, Accessibility ≥ 95 everywhere.

## 8. Accessibility

- Full keyboard path through every zone; interactive objects are real buttons/links under the
  hood with visible amber focus rings.
- All content readable without WebGL (the 2D layer is the accessible + SEO surface).
- `prefers-reduced-motion` honored globally; sound opt-in only; alt text mandatory on photos
  (use `caption` as default, override allowed).

## 9. Build phases

Phase 0 — Scaffold: Astro + Cloudflare adapter + Storyblok SDK wired; deploy pipeline and
preview route working end-to-end with placeholder content. (Prove the plumbing first.)

Phase 1 — Content model: create components in Storyblok (via Management API script or
manually), seed 2–3 sample stories per type, build-time fetch utilities.

Phase 2 — 2D layer: the full site as its warm, styled HTML fallback — every route, every
piece of content. This is the SEO/accessibility floor and the mobile insurance policy.

Phase 3 — The scene: vista → trail → cabin → porch in R3F. Start gray-boxed (camera work,
zones, interactions with placeholder geometry), then art pass (models, lighting, grain).

Phase 4 — The corners: vinyl pull-out + liner notes, photo lightbox, bookshelf. This phase
carries the memorability — budget the most iteration here.

Phase 5 — Polish: performance passes, fallback probes, sound layer, deep-link camera
positioning, acceptance checks.

Suggested orchestration (owner preference): plan each phase in the main session (plan mode,
higher-tier model); delegate implementation-heavy tasks (Phases 3–4 scene work, Storyblok
integration) to Opus-class subagents defined in `.claude/agents/` with explicit `model`
fields; use Sonnet-class subagents for quick checks — lint, `wrangler deploy --dry-run`,
Lighthouse runs, link checks.

## 10. Repo conventions

- No Claude attribution in commits or PRs (org policy) — no Co-Authored-By trailers, no
  "generated with" footers.
- Before adding any dependency, search for its latest version and known vulnerabilities;
  record the checked version in the PR description.
- Secrets (Storyblok tokens, deploy hooks) live in Cloudflare/Wrangler secrets and `.env`
  (gitignored) — never committed.

## 11. Acceptance criteria

1. Recruiter path: hero → cabin projects in ≤ 2 interactions; a specific project shareable
   by URL and loads directly into its opened record.
2. Publishing a new project in Storyblok appears on the live site with zero code changes.
3. Free tiers respected: production serves from cache; Storyblok API calls occur only at
   build time and in the preview route.
4. The 2D fallback is a complete, warm, presentable site on its own — not an apology page.
5. Reduced-motion, keyboard-only, and no-WebGL visits can reach 100% of the content.
6. First vista paint feels instant on desktop broadband; no loading spinner longer than a
   branded micro-moment (e.g. a record starting to spin).
