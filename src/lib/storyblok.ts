/**
 * Build-time content access.
 *
 * Every function here runs during `astro build` (or `astro dev`). Production visitors are served
 * static output and never trigger a Storyblok request; the only runtime consumer is
 * src/pages/preview/[...slug].astro. Responses are memoised per build so each list is fetched
 * once regardless of how many pages use it (free-tier API cap, docs/BRIEF.md §3).
 *
 * Folder names: the brief specifies projects/, photos/, books/. The connected space already uses
 * work/ and reading/, so both are read and merged.
 */
import { useStoryblokApi, type ISbStoriesParams, type ISbStoryData } from '@storyblok/astro';
import * as normalise from './content';
import type { Book, Page, Photo, Project, Settings } from './types';
import { defaultSettings, placeholderBooks, placeholderPages, placeholderPhotos, placeholderProjects } from './placeholders';

export const storyblokEnabled: boolean = __STORYBLOK_ENABLED__;

/** From STORYBLOK_VERSION, defaulting to draft in dev and published in production builds. */
export const contentVersion: 'draft' | 'published' = __STORYBLOK_VERSION__;

const memo = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key) as Promise<T>;
}

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; response?: { status?: number }; message?: string };
  return e?.status === 404 || e?.response?.status === 404 || /\b404\b/.test(String(e?.message ?? err));
}

async function fetchFolder(startsWith: string, params: ISbStoriesParams = {}): Promise<ISbStoryData[]> {
  const api = useStoryblokApi();
  return (await api.getAll('cdn/stories', { version: contentVersion, starts_with: startsWith, ...params })) as ISbStoryData[];
}

async function fetchFolders(folders: string[]): Promise<ISbStoryData[]> {
  const results = await Promise.all(folders.map((f) => fetchFolder(f)));
  const seen = new Set<string>();
  return results.flat().filter((s) => (seen.has(s.uuid) ? false : (seen.add(s.uuid), true)));
}

async function fetchOne(slug: string): Promise<ISbStoryData | null> {
  const api = useStoryblokApi();
  try {
    const { data } = await api.get(`cdn/stories/${slug}`, { version: contentVersion });
    return data.story as ISbStoryData;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export function getSettings(): Promise<Settings> {
  return once('settings', async () => {
    if (!storyblokEnabled) return defaultSettings;
    const story = await fetchOne('settings');
    if (!story) console.warn('[storyblok] No `settings` story found. Using defaults.');
    return normalise.settings(story, defaultSettings);
  });
}

export function getProjects(): Promise<Project[]> {
  return once('projects', async () => {
    if (!storyblokEnabled) return placeholderProjects;
    const stories = await fetchFolders(['projects/', 'work/']);
    if (!stories.length) return placeholderProjects;
    return stories.map(normalise.project).sort((a, b) => a.order - b.order || Number(b.featured) - Number(a.featured));
  });
}

export async function getProject(slug: string): Promise<Project | undefined> {
  return (await getProjects()).find((p) => p.slug === slug);
}

export function getPhotos(): Promise<Photo[]> {
  return once('photos', async () => {
    if (!storyblokEnabled) return placeholderPhotos;
    const stories = await fetchFolders(['photos/']);
    if (!stories.length) return placeholderPhotos;
    return stories.map(normalise.photo).sort((a, b) => a.order - b.order);
  });
}

export async function getPhoto(slug: string): Promise<Photo | undefined> {
  return (await getPhotos()).find((p) => p.slug === slug);
}

export function getBooks(): Promise<Book[]> {
  return once('books', async () => {
    if (!storyblokEnabled) return placeholderBooks;
    const stories = await fetchFolders(['books/', 'reading/']);
    if (!stories.length) return placeholderBooks;
    return stories.map(normalise.book);
  });
}

export function getPage(slug: 'trail' | 'porch'): Promise<Page> {
  return once(`page:${slug}`, async () => {
    if (!storyblokEnabled) return placeholderPages[slug];
    const story = await fetchOne(slug);
    return story ? normalise.page(story) : placeholderPages[slug];
  });
}

/** Everything the 3D island needs, trimmed to what it draws. */
export async function getSceneData(): Promise<import('../scene/types').SceneData> {
  const [settings, projects, photos, books, trail] = await Promise.all([getSettings(), getProjects(), getPhotos(), getBooks(), getPage('trail')]);
  return {
    ownerName: settings.ownerName,
    tagline: settings.tagline,
    records: projects.map((p) => ({ slug: p.slug, title: p.title, year: p.year, featured: p.featured, cover: p.cover?.src, href: `/cabin/vinyl/${p.slug}` })),
    prints: photos.map((p) => ({ slug: p.slug, src: p.thumb, caption: p.caption, tilt: p.tilt, href: `/cabin/photos/${p.slug}` })),
    books: books.map((b) => ({ slug: b.slug, title: b.title, spineColor: b.spineColor, href: `/cabin/books#${b.slug}` })),
    signposts: trail.signposts.map((s) => ({ heading: s.heading, distanceLabel: s.distanceLabel })),
  };
}
