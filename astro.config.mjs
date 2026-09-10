// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import cloudflare from '@astrojs/cloudflare';
import { storyblok } from '@storyblok/astro';
import react from '@astrojs/react';

// Build-time env. Locally this comes from `.env`; on Cloudflare Workers Builds it comes
// from the Worker's build variables. Runtime (the preview route) uses the same token,
// which the Storyblok integration bakes into the server bundle.
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
/** @param {...string} keys */
const pick = (...keys) => keys.map((k) => env[k] ?? process.env[k]).find((v) => v && v.trim()) ?? '';
// Preview token (reads draft + published). Either variable name works.
const STORYBLOK_TOKEN = pick('STORYBLOK_PREVIEW_TOKEN', 'STORYBLOK_TOKEN');
const STORYBLOK_REGION = pick('STORYBLOK_REGION') || 'eu';
// draft | published. Defaults: draft in dev, published in production builds.
const STORYBLOK_VERSION = pick('STORYBLOK_VERSION') || (process.env.NODE_ENV === 'development' ? 'draft' : 'published');
const SITE_URL = pick('SITE_URL', 'PUBLIC_SITE_URL') || 'https://the-cabin-at-golden-hour.workers.dev';

if (!STORYBLOK_TOKEN) {
  console.warn(
    '[storyblok] No STORYBLOK_PREVIEW_TOKEN set. Building with placeholder content from src/lib/placeholders.ts.',
  );
}

export default defineConfig({
  site: SITE_URL,
  // No sessions: without this the Cloudflare adapter provisions a KV namespace on deploy.
  session: false,
  // Static-first. Only routes that opt out with `export const prerender = false`
  // (currently /preview/*) run on the Worker at request time.
  adapter: cloudflare({
    // Images are served from Storyblok's CDN / R2, so no build-time processing yet.
    imageService: 'passthrough',
  }),
  integrations: [
    // One React island for the 3D scene (src/scene). Everything else is static HTML.
    react(),
    storyblok({
      accessToken: STORYBLOK_TOKEN,
      // Skip creating an API client when there is no token (placeholder builds).
      useCustomApi: !STORYBLOK_TOKEN,
      // Keep the Visual Editor bridge out of the static site. The preview route
      // loads it explicitly so production pages ship no CMS JavaScript.
      bridge: false,
      apiOptions: {
        region: /** @type {'eu' | 'us' | 'ca' | 'ap' | 'cn'} */ (STORYBLOK_REGION),
      },
      // Components in src/storyblok/*.astro are auto-registered by file name.
      enableFallbackComponent: true,
    }),
  ],
  vite: {
    define: {
      __STORYBLOK_ENABLED__: JSON.stringify(Boolean(STORYBLOK_TOKEN)),
      __STORYBLOK_VERSION__: JSON.stringify(STORYBLOK_VERSION),
    },
  },
});
