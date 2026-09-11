/**
 * Same-origin image proxy for the 3D scene.
 *
 * Storyblok's asset CDN sends no CORS headers, so WebGL cannot use the covers and prints as
 * textures directly. This route fetches a whitelisted Storyblok asset and returns it from our own
 * origin with long cache headers, so Cloudflare's edge cache serves repeat requests. Only the
 * scene uses it; the HTML layer keeps linking to the CDN directly.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const ALLOWED_HOST = 'a.storyblok.com';
const MAX_EDGE = 1024;

export const GET: APIRoute = async ({ params, url }) => {
  const path = (params.path ?? '').replace(/^\/+/, '');
  // Storyblok asset paths look like f/<space>/<w>x<h>/<hash>/<file>[.ext]
  if (!/^f\/\d+\/\d+x\d+\/[a-f0-9]+\/[^/]+$/i.test(path)) {
    return new Response('Not an asset path', { status: 400 });
  }
  const edge = Math.min(Number(url.searchParams.get('w') ?? MAX_EDGE) || MAX_EDGE, MAX_EDGE);
  const upstream = `https://${ALLOWED_HOST}/${path}/m/${edge}x0`;

  const res = await fetch(upstream, {
    headers: { Accept: 'image/*' },
    // Cloudflare-specific: cache the upstream fetch at the edge for a year.
    cf: { cacheEverything: true, cacheTtl: 31536000 },
  } as RequestInit);
  if (!res.ok) return new Response('Upstream error', { status: 502 });

  const headers = new Headers();
  headers.set('Content-Type', res.headers.get('Content-Type') ?? 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(res.body, { status: 200, headers });
};
