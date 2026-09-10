/**
 * Raw Storyblok blok → internal model.
 *
 * Two schemas are accepted for every type: the brief's (docs/BRIEF.md §6, preferred) and the
 * fields that already exist in the connected space. Missing values fall back per field, so a
 * half-filled story still renders as a complete object.
 */
import type { ISbStoryData, SbBlokData } from '@storyblok/astro';
import type { Book, BookStatus, Feature, Page, Photo, Plaque, Project, RichText, Settings, Signpost } from './types';
import { SPINE_COLORS } from './types';

type Blok = SbBlokData & Record<string, unknown>;
type StoryLike = Pick<ISbStoryData, 'slug' | 'full_slug' | 'name' | 'content'>;

const str = (v: unknown): string | undefined => {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
};

const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const richText = (v: unknown): RichText | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const doc = v as { type?: string; content?: unknown[] };
  if (doc.type !== 'doc') return undefined;
  // Storyblok stores an empty richtext field as a doc with one empty paragraph.
  const hasText = JSON.stringify(doc.content ?? []).includes('"text"');
  return hasText ? (v as RichText) : undefined;
};

const asset = (v: unknown): { src: string; alt: string } | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as { filename?: string; alt?: string; title?: string };
  const src = str(a.filename);
  return src ? { src, alt: str(a.alt) ?? str(a.title) ?? '' } : undefined;
};

const href = (v: unknown): string | undefined => {
  if (typeof v === 'string') return str(v);
  if (!v || typeof v !== 'object') return undefined;
  const l = v as { url?: string; cached_url?: string; email?: string; linktype?: string };
  if (l.linktype === 'email' && l.email) return `mailto:${l.email}`;
  return str(l.url) ?? str(l.cached_url);
};

const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => str(x)).filter((x): x is string => Boolean(x));
  const s = str(v);
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

const bloks = (v: unknown): Blok[] => (Array.isArray(v) ? (v.filter((b) => b && typeof b === 'object') as Blok[]) : []);

/** Stable pseudo-random in [-1, 1] from a string, so tilts do not change between builds. */
export function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2000) / 1000 - 1;
}

export function plaque(b: Blok): Plaque | undefined {
  const label = str(b.label) ?? str(b.title) ?? str(b.name);
  const link = href(b.url) ?? href(b.link);
  return label && link ? { label, href: link } : undefined;
}

export function feature(b: Blok): Feature | undefined {
  const name = str(b.name) ?? str(b.title);
  return name ? { name, description: str(b.description) ?? str(b.text) } : undefined;
}

export function signpost(b: Blok): Signpost | undefined {
  const heading = str(b.heading) ?? str(b.title) ?? str(b.headline) ?? str(b.name);
  if (!heading) return undefined;
  return { heading, body: richText(b.body) ?? richText(b.text), distanceLabel: str(b.distance_label) };
}

export function settings(story: StoryLike | null, fallback: Settings): Settings {
  const c = (story?.content ?? {}) as Blok;
  const social = bloks(c.social).map(plaque).filter((p): p is Plaque => Boolean(p));
  const email = str(c.email);
  if (email && !social.some((p) => p.href.startsWith('mailto:'))) social.push({ label: 'Email', href: `mailto:${email}` });
  const portrait = asset(c.portrait) ?? asset(c.profile_image);
  return {
    ownerName: str(c.owner_name) ?? str(c.site_title) ?? fallback.ownerName,
    tagline: str(c.tagline) ?? str(c.intro_line) ?? fallback.tagline,
    heroSkipLabel: str(c.hero_skip_label) ?? fallback.heroSkipLabel,
    social: social.length ? social : fallback.social,
    email: email ?? fallback.email,
    ambientSoundEnabled: bool(c.ambient_sound_enabled, fallback.ambientSoundEnabled),
    portrait: portrait ? { ...portrait, caption: str(c.profile_caption) } : fallback.portrait,
    footerText: str(c.footer_text) ?? fallback.footerText,
  };
}

export function project(story: StoryLike): Project {
  const c = story.content as Blok;
  const links = bloks(c.links).map(plaque).filter((p): p is Plaque => Boolean(p));
  const gh = href(c.github_url);
  const ext = href(c.external_url) ?? href(c.demo_url);
  if (gh && !links.some((l) => l.href === gh)) links.push({ label: 'Repository', href: gh });
  if (ext && !links.some((l) => l.href === ext)) links.push({ label: 'Live', href: ext });
  const cover = asset(c.cover) ?? asset(c.cover_image);
  const title = str(c.title) ?? story.name;
  return {
    slug: story.slug,
    title,
    year: str(c.year),
    cover: cover ? { src: cover.src, alt: cover.alt || `${title} record sleeve` } : undefined,
    oneLiner: str(c.one_liner) ?? str(c.subtitle) ?? str(c.summary),
    linerNotes: richText(c.liner_notes) ?? richText(c.body),
    tracklist: bloks(c.tracklist).map(feature).filter((f): f is Feature => Boolean(f)),
    stack: list(c.stack),
    links,
    featured: bool(c.featured),
    order: num(c.order, Number.MAX_SAFE_INTEGER),
  };
}

export function photo(story: StoryLike): Photo {
  const c = story.content as Blok;
  const image = asset(c.image);
  const src = str(c.image_url) ?? image?.src;
  const caption = str(c.caption) ?? str(c.title);
  return {
    slug: story.slug,
    src,
    thumb: image?.src ?? src,
    alt: str(c.alt) ?? image?.alt ?? caption ?? story.name,
    caption,
    camera: str(c.camera),
    filmStock: str(c.film_stock) ?? str(c.film),
    location: str(c.location),
    year: str(c.year),
    order: num(c.order, Number.MAX_SAFE_INTEGER),
    tilt: Math.round(hashUnit(story.full_slug) * 2 * 10) / 10,
  };
}

const STATUSES: BookStatus[] = ['reading', 'finished', 'favorite'];

export function book(story: StoryLike): Book {
  const c = story.content as Blok;
  const status = str(c.status);
  const spine = str(c.spine_color);
  const fallbackSpine = SPINE_COLORS[Math.abs(Math.round(hashUnit(story.full_slug) * 100)) % SPINE_COLORS.length];
  return {
    slug: story.slug,
    title: str(c.title) ?? story.name,
    author: str(c.author),
    note: richText(c.note) ?? richText(c.body),
    status: STATUSES.includes(status as BookStatus) ? (status as BookStatus) : 'finished',
    spineColor: spine && (SPINE_COLORS as readonly string[]).includes(spine) ? spine : fallbackSpine,
  };
}

export function page(story: StoryLike): Page {
  const c = story.content as Blok;
  const signposts = bloks(c.body).map(signpost).filter((s): s is Signpost => Boolean(s));
  return {
    slug: story.slug,
    title: str(c.title) ?? story.name,
    signposts,
    body: richText(c.body) ?? richText(c.text),
  };
}
