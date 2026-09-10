/**
 * Capability probe. Runs once on the client before the Canvas is created (docs/BRIEF.md §5
 * "Fallbacks": decide by device capability, not user agent).
 *
 * Three independent answers:
 *  - `webgl2`      no WebGL2 context -> the island renders nothing and the 2D layer is the site.
 *  - `reducedMotion` -> scene still draws, but no idle animation and camera cuts are instant.
 *  - `tier`        'low' -> no post-processing, no shadows, fewer instances, dpr pinned to 1.
 *
 * Deliberately no `useDetectGPU`: drei's hook fetches a benchmark table over the network and
 * suspends. The heuristic below costs one throwaway canvas and reads only local hints.
 */
import { useEffect, useState } from 'react';

export type Tier = 'low' | 'high';

export interface Capabilities {
  webgl2: boolean;
  reducedMotion: boolean;
  tier: Tier;
  /** Renderer string when the driver exposes it — useful in dev, not used for anything else. */
  renderer?: string;
}

interface GlProbe {
  webgl2: boolean;
  software: boolean;
  renderer?: string;
}

const SOFTWARE = /swiftshader|llvmpipe|softwarerasterizer|angle \(software|microsoft basic render/i;

function probeGL(): GlProbe {
  if (typeof document === 'undefined') return { webgl2: false, software: false };
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) return { webgl2: false, software: false };
    let renderer: string | undefined;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, software: Boolean(renderer && SOFTWARE.test(renderer)), renderer };
  } catch {
    return { webgl2: false, software: false };
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
  }
}

function probeTier(software: boolean): Tier {
  if (software) return 'low';
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return 'low';
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return 'low';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.max(window.innerWidth, window.innerHeight) < 900;
  if (coarse && small) return 'low';
  // A phone-sized viewport at a high pixel ratio is a lot of fragments for a mid-range GPU.
  if (coarse && window.devicePixelRatio > 2.5) return 'low';
  return 'high';
}

export function probeCapabilities(): Capabilities {
  const gl = probeGL();
  if (!gl.webgl2) return { webgl2: false, reducedMotion: true, tier: 'low' };
  return {
    webgl2: true,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    tier: probeTier(gl.software),
    renderer: gl.renderer,
  };
}

/** `undefined` until the probe has run — the island renders nothing in the meantime. */
export function useCapabilities(): Capabilities | undefined {
  const [caps, setCaps] = useState<Capabilities>();

  useEffect(() => {
    const probed = probeCapabilities();
    setCaps(probed);
    if (!probed.webgl2) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setCaps((prev) => (prev ? { ...prev, reducedMotion: motion.matches } : prev));
    motion.addEventListener('change', onChange);
    return () => motion.removeEventListener('change', onChange);
  }, []);

  return caps;
}

/** Instance budgets, kept well inside the ≤ 400 trees ceiling. */
export function budget(tier: Tier) {
  return {
    trees: tier === 'high' ? 320 : 110,
    motes: tier === 'high' ? 160 : 0,
    ridgeSegments: tier === 'high' ? 48 : 24,
    pathSegments: tier === 'high' ? 96 : 40,
    post: tier === 'high',
    shadows: tier === 'high',
  } as const;
}
