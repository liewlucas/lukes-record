/** Content handed to the 3D island. Small, serialisable, built once per page in src/lib/storyblok.ts. */
/** Section keys along the one continuous journey; also the starting section for deep links. */
export type Zone = 'vista' | 'trail' | 'cabin' | 'vinyl' | 'photos' | 'books' | 'desk' | 'porch';

export interface SceneRecord {
  slug: string;
  title: string;
  year?: string;
  featured: boolean;
  cover?: string;
  href: string;
}

export interface ScenePrint {
  slug: string;
  src?: string;
  caption?: string;
  tilt: number;
  href: string;
}

export interface SceneBook {
  slug: string;
  title: string;
  spineColor: string;
  href: string;
}

export interface SceneSignpost {
  heading: string;
  distanceLabel?: string;
}

export interface SceneData {
  ownerName: string;
  tagline?: string;
  records: SceneRecord[];
  prints: ScenePrint[];
  books: SceneBook[];
  signposts: SceneSignpost[];
}

export interface SceneProps {
  zone: Zone;
  /** Deep-link focus: a project slug, `photo:<slug>`, `photos`, or `books`. */
  focus?: string;
  data: SceneData;
}
