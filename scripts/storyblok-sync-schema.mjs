#!/usr/bin/env node
/**
 * Align the Storyblok space with the content model in docs/BRIEF.md §6.
 *
 * Idempotent and additive: components that do not exist are created; components that do exist
 * gain any missing fields. Nothing is renamed or deleted, so the fields the space already uses
 * (settings.site_title, projects.subtitle, …) keep working alongside the brief's names.
 *
 * Usage:
 *   STORYBLOK_MANAGEMENT_TOKEN=… STORYBLOK_SPACE_ID=… node scripts/storyblok-sync-schema.mjs [--dry-run] [--seed]
 *
 * The management token is a *personal access token* (My account → Security), not the preview
 * token. Both values can also live in .env. --seed creates draft starter stories (trail, porch,
 * one photo, one book) only where none exist yet.
 */
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TOKEN = process.env.STORYBLOK_MANAGEMENT_TOKEN;
const SPACE = process.env.STORYBLOK_SPACE_ID;
const REGION = (process.env.STORYBLOK_REGION || 'eu').toLowerCase();
const DRY = process.argv.includes('--dry-run');
const SEED = process.argv.includes('--seed');

if (!TOKEN || !SPACE) {
  console.error('Set STORYBLOK_MANAGEMENT_TOKEN and STORYBLOK_SPACE_ID (in .env or the environment).');
  process.exit(1);
}

const HOST = { eu: 'mapi.storyblok.com', us: 'api-us.storyblok.com', ca: 'api-ca.storyblok.com', ap: 'api-ap.storyblok.com', cn: 'app.storyblokchina.cn' }[REGION] ?? 'mapi.storyblok.com';
const BASE = `https://${HOST}/v1/spaces/${SPACE}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  await sleep(400); // management API allows ~3 requests/second
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// ---- Field helpers --------------------------------------------------------------------------
const text = (extra = {}) => ({ type: 'text', ...extra });
const textarea = () => ({ type: 'textarea' });
const richtext = () => ({ type: 'richtext' });
const number = () => ({ type: 'number' });
const boolean = () => ({ type: 'boolean' });
const asset = () => ({ type: 'asset', filetypes: ['images'] });
const link = () => ({ type: 'multilink' });
const bloks = (...whitelist) => ({ type: 'bloks', restrict_components: true, component_whitelist: whitelist });
const option = (...values) => ({ type: 'option', options: values.map((v) => ({ name: v, value: v })) });
const options = (...values) => ({ type: 'options', options: values.map((v) => ({ name: v, value: v })) });

const PALETTE = ['moss', 'pine-shadow', 'burnt-sienna', 'walnut', 'ridge-haze', 'lamp-amber', 'kraft'];

// ---- Desired components (docs/BRIEF.md §6) ------------------------------------------------
// `aliases` are component names the space already uses for the same thing; missing fields are
// added to those too so existing stories gain the new fields without migration.
const COMPONENTS = [
  { name: 'plaque', display_name: 'Plaque', is_nestable: true, is_root: false, schema: { label: text(), url: link() } },
  { name: 'feature', display_name: 'Feature (track)', is_nestable: true, is_root: false, schema: { name: text(), description: textarea() } },
  { name: 'signpost', display_name: 'Signpost', is_nestable: true, is_root: false, schema: { heading: text(), body: richtext(), distance_label: text({ description: 'Optional, for skill posts, e.g. "5 km"' }) } },
  {
    name: 'project', display_name: 'Project (record)', is_root: true, is_nestable: false, aliases: ['projects'],
    schema: {
      title: text(), year: text({ description: 'A year or range, e.g. 2025 or 2024–2025' }), cover: asset(), one_liner: text(),
      liner_notes: richtext(), tracklist: bloks('feature'), stack: options(), links: bloks('plaque'), featured: boolean(), order: number(),
    },
  },
  {
    name: 'photo', display_name: 'Photo (print)', is_root: true, is_nestable: false,
    schema: { image: asset(), image_url: text({ description: 'Optional full-res URL on R2' }), caption: text(), alt: text(), camera: text(), film_stock: text(), location: text(), year: text(), order: number() },
  },
  {
    name: 'book', display_name: 'Book', is_root: true, is_nestable: false,
    schema: { title: text(), author: text(), note: richtext(), status: option('reading', 'finished', 'favorite'), spine_color: option(...PALETTE) },
  },
  {
    name: 'site_settings', display_name: 'Site settings', is_root: true, is_nestable: false, aliases: ['settings'],
    schema: { owner_name: text(), tagline: text(), hero_skip_label: text({ default_value: 'skip to the work →' }), email: text(), social: bloks('plaque'), ambient_sound_enabled: boolean(), footer_text: text() },
  },
  { name: 'page', display_name: 'Page', is_root: true, is_nestable: false, schema: { title: text(), body: bloks('signpost', 'plaque', 'feature') } },
];

// ---- Sync -----------------------------------------------------------------------------------
const existing = (await api('GET', '/components')).components;
const byName = new Map(existing.map((c) => [c.name, c]));

for (const desired of COMPONENTS) {
  const targets = [desired.name, ...(desired.aliases ?? [])].filter((n) => byName.has(n));
  if (targets.length === 0) {
    console.log(`create  ${desired.name}`);
    if (!DRY) {
      const { component } = await api('POST', '/components', { component: { name: desired.name, display_name: desired.display_name, is_root: desired.is_root, is_nestable: desired.is_nestable, schema: desired.schema } });
      byName.set(component.name, component);
    }
    continue;
  }
  for (const name of targets) {
    const current = byName.get(name);
    const missing = Object.entries(desired.schema).filter(([field]) => !(field in (current.schema ?? {})));
    if (missing.length === 0) {
      console.log(`ok      ${name}`);
      continue;
    }
    console.log(`update  ${name}: + ${missing.map(([f]) => f).join(', ')}`);
    if (!DRY) {
      await api('PUT', `/components/${current.id}`, { component: { ...current, schema: { ...current.schema, ...Object.fromEntries(missing) } } });
    }
  }
}

// ---- Optional seed --------------------------------------------------------------------------
if (SEED) {
  const stories = (await api('GET', '/stories?per_page=100')).stories;
  const has = (slug) => stories.some((s) => s.full_slug === slug || s.slug === slug);
  const folderId = async (slug, name) => {
    const f = stories.find((s) => s.is_folder && s.slug === slug);
    if (f) return f.id;
    console.log(`folder  ${slug}`);
    if (DRY) return null;
    const { story } = await api('POST', '/stories', { story: { name, slug, is_folder: true } });
    return story.id;
  };
  const paragraph = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const seeds = [];
  if (!has('trail')) seeds.push({ name: 'Trail', slug: 'trail', content: { component: 'page', title: 'The trail', body: [
    { component: 'signpost', heading: 'About', body: paragraph('A few lines about who lives here.') },
    { component: 'signpost', heading: 'Machine learning', distance_label: '5 km' },
  ] } });
  if (!has('porch')) seeds.push({ name: 'Porch', slug: 'porch', content: { component: 'page', title: 'The porch', body: [] } });
  if (!stories.some((s) => s.full_slug.startsWith('photos/') && !s.is_folder)) {
    seeds.push({ name: 'First print', slug: 'first-print', parent_id: await folderId('photos', 'photos'), content: { component: 'photo', caption: 'First print', camera: 'Camera', film_stock: 'Film stock', location: 'Location', year: '2026', order: 1 } });
  }
  const readingFolder = stories.find((s) => s.is_folder && (s.slug === 'reading' || s.slug === 'books'));
  if (!stories.some((s) => (s.full_slug.startsWith('reading/') || s.full_slug.startsWith('books/')) && !s.is_folder)) {
    seeds.push({ name: 'First book', slug: 'first-book', parent_id: readingFolder?.id ?? (await folderId('reading', 'reading')), content: { component: 'book', title: 'First book', author: 'Author', note: paragraph('What stayed with me.'), status: 'reading', spine_color: 'moss' } });
  }
  for (const seed of seeds) {
    console.log(`seed    ${seed.slug}`);
    if (!DRY) await api('POST', '/stories', { story: seed });
  }
}

console.log(DRY ? 'Dry run complete. Re-run without --dry-run to apply.' : 'Done.');
