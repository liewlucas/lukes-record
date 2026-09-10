/**
 * Internal content model. Source: docs/BRIEF.md §6.
 *
 * Pages and design components consume these normalised shapes only. Raw Storyblok bloks are
 * mapped into them by src/lib/content.ts, which also knows about the field names that already
 * exist in the connected space (an earlier schema) and treats the brief's names as preferred.
 */
import type { StoryblokRichTextInput } from '@storyblok/astro';

export type RichText = Exclude<StoryblokRichTextInput, null>;

export interface Plaque {
  label: string;
  href: string;
}

export interface Feature {
  name: string;
  description?: string;
}

export interface Signpost {
  heading: string;
  body?: RichText;
  distanceLabel?: string;
}

export interface Project {
  slug: string;
  title: string;
  year?: string;
  cover?: { src: string; alt: string };
  oneLiner?: string;
  linerNotes?: RichText;
  tracklist: Feature[];
  stack: string[];
  links: Plaque[];
  featured: boolean;
  order: number;
}

export interface Photo {
  slug: string;
  src?: string;
  thumb?: string;
  alt: string;
  caption?: string;
  camera?: string;
  filmStock?: string;
  location?: string;
  year?: string;
  order: number;
  /** Deterministic tilt in degrees, ±2, as if pegged by hand. */
  tilt: number;
}

export type BookStatus = 'reading' | 'finished' | 'favorite';

export interface Book {
  slug: string;
  title: string;
  author?: string;
  note?: RichText;
  status: BookStatus;
  /** Palette token name, e.g. "moss" */
  spineColor: string;
}

export interface Settings {
  ownerName: string;
  tagline?: string;
  heroSkipLabel: string;
  social: Plaque[];
  email?: string;
  ambientSoundEnabled: boolean;
  portrait?: { src: string; alt: string; caption?: string };
  footerText?: string;
}

export interface Page {
  slug: string;
  title: string;
  signposts: Signpost[];
  body?: RichText;
}

export const SPINE_COLORS = ['moss', 'pine-shadow', 'burnt-sienna', 'walnut', 'ridge-haze', 'lamp-amber', 'kraft'] as const;
