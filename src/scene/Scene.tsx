/**
 * The 3D layer: one continuous, scroll-driven camera path through the journey sections
 * (see src/components/Journey.astro and ./types.ts).
 *
 * Work in progress. The zone-per-page gray-box was retired in favour of a single scroll journey
 * with a procedural art pass; the helpers in this folder (capabilities, rig, journey, textures,
 * noise, world/*) are the start of that pass. Until the pass lands this entry renders nothing,
 * so the 2D layer stands alone.
 */
import type { SceneProps } from './types';

export default function Scene(_props: SceneProps) {
  return null;
}
