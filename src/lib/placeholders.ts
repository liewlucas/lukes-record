/**
 * Per-field defaults used when the CMS has no value yet. Deliberately generic.
 * Real portfolio content lives in Storyblok (docs/BRIEF.md §6).
 */
import type { Book, Page, Photo, Project, Settings } from './types';

export const defaultSettings: Settings = {
  ownerName: 'Your name',
  tagline: 'AI engineer with an analog heart.',
  heroSkipLabel: 'skip to the work →',
  social: [
    { label: 'GitHub', href: 'https://github.com' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com' },
  ],
  ambientSoundEnabled: false,
};

export const placeholderProjects: Project[] = [
  {
    slug: 'placeholder-record',
    title: 'Placeholder record',
    year: '2026',
    oneLiner: 'A sample record that stands in until the first real project is published.',
    tracklist: [
      { name: 'Side A', description: 'First feature.' },
      { name: 'Side B', description: 'Second feature.' },
    ],
    stack: ['Python', 'PyTorch'],
    links: [{ label: 'Repository', href: 'https://github.com' }],
    featured: true,
    order: 1,
  },
];

export const placeholderPhotos: Photo[] = [
  {
    slug: 'placeholder-print',
    alt: 'Placeholder print',
    caption: 'Placeholder print',
    camera: 'Camera',
    filmStock: 'Film stock',
    location: 'Location',
    year: '2026',
    order: 1,
    tilt: -1.2,
  },
];

export const placeholderBooks: Book[] = [
  {
    slug: 'placeholder-book',
    title: 'Placeholder book',
    author: 'Author',
    status: 'reading',
    spineColor: 'moss',
  },
];

export const placeholderPages: Record<string, Page> = {
  trail: {
    slug: 'trail',
    title: 'The trail',
    signposts: [
      { heading: 'About', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A signpost carries a short paragraph about the owner. Publish a trail page in Storyblok to replace it.' }] }] } as Page['body'] },
      { heading: 'Machine learning', distanceLabel: '5 km' },
      { heading: 'Photography', distanceLabel: '12 km' },
    ],
  },
  porch: { slug: 'porch', title: 'The porch', signposts: [] },
};
