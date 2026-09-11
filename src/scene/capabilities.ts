/**
 * Capability probe. Runs once on the client before the Canvas is created (docs/BRIEF.md §5
 * "Fallbacks": decide by device capability, not user agent).
 *
 * Three independent answers:
 *  - `webgl2`        no WebGL2 context -> the island renders nothing and the 2D layer is the site.
 *  - `reducedMotion` -> scene still draws, but no idle animation and camera cuts are instant.
 *  - `tier`          how much scene there is to draw. See `budget()`.
 *
 * Deliberately no drei `useDetectGPU`: that hook fetches a ~100 KB benchmark table over the
 * network and suspends the tree until it lands, which is a poor trade for a first paint budget
 * of 2.5 MB. The heuristic below costs one throwaway canvas and reads only local hints —
 * WEBGL_debug_renderer_info, deviceMemory, hardwareConcurrency, pointer type and DPR.
 */
import { useEffect, useState } from 'react';

export type Tier = 'low' | 'mid' | 'high';

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
  /** The driver refused a high-performance context, or exposes tiny limits. */
  weak: boolean;
  renderer?: string;
}

const SOFTWARE = /swiftshader|llvmpipe|softwarerasterizer|angle \(software|microsoft basic render|paravirtual/i;
/** Discrete or Apple-silicon class parts. Anything here gets the full scene on a fine pointer. */
const STRONG = /(apple m\d)|(geforce|rtx|gtx)|(radeon (rx|pro))|(arc a\d)|(quadro)|(radeon.*(6[5-9]|7[0-9])\d\d)/i;
/** Integrated parts that can draw the scene but should skip AO and depth of field. */
const INTEGRATED = /(intel.*(uhd|hd graphics|iris|xe))|(vega \d)|(radeon graphics)|(mali)|(adreno)|(powervr)/i;

function probeGL(): GlProbe {
  if (typeof document === 'undefined') return { webgl2: false, software: false, weak: true };
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false, powerPreference: 'high-performance' });
    if (!gl) return { webgl2: false, software: false, weak: true };
    let renderer: string | undefined;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
    const textureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0);
    const varyings = Number(gl.getParameter(gl.MAX_VARYING_VECTORS) ?? 0);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      webgl2: true,
      software: Boolean(renderer && SOFTWARE.test(renderer)),
      weak: textureSize < 8192 || varyings < 15,
      renderer,
    };
  } catch {
    return { webgl2: false, software: false, weak: true };
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
  }
}

function probeTier(gl: GlProbe): Tier {
  if (gl.software || gl.weak) return 'low';

  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8;
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const name = gl.renderer ?? '';

  // Phones and tablets: a lot of fragments, a small thermal budget, no post-processing.
  if (coarse) return 'low';
  if (memory <= 4 || cores <= 2) return 'low';

  if (STRONG.test(name) && memory >= 8 && cores >= 6) return 'high';
  if (INTEGRATED.test(name)) return 'mid';
  // Unknown desktop GPU (privacy.resistFingerprinting hides the string): trust the CPU hints.
  return cores >= 8 && memory >= 8 ? 'high' : 'mid';
}

export function probeCapabilities(): Capabilities {
  const gl = probeGL();
  if (!gl.webgl2) return { webgl2: false, reducedMotion: true, tier: 'low' };
  return {
    webgl2: true,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    tier: probeTier(gl),
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

export interface Budget {
  /** Ceiling handed to the Canvas as `dpr={[1, max]}`. */
  dpr: number;
  shadows: boolean;
  shadowMapSize: number;
  /**
   * Penumbra width in shadow-map texels. three 0.186 dropped PCFSoftShadowMap; softness now
   * comes from a five-tap Vogel disk scaled by `light.shadow.radius` under PCFShadowMap.
   */
  shadowRadius: number;
  post: boolean;
  ao: boolean;
  dof: boolean;
  bloom: boolean;
  /** Cubemap side length for the procedural environment. */
  envResolution: number;
  trees: number;
  terrainSegments: number;
  pathSegments: number;
  mist: number;
  motes: number;
  smoke: number;
  embers: number;
  /** Physically-based glass costs a transmission pass per frame; only the high tier gets it. */
  glass: boolean;
}

export function budget(tier: Tier): Budget {
  if (tier === 'high') {
    return {
      dpr: 1.75,
      shadows: true,
      shadowMapSize: 2048,
      shadowRadius: 5,
      post: true,
      ao: true,
      dof: true,
      bloom: true,
      envResolution: 256,
      trees: 250,
      terrainSegments: 132,
      pathSegments: 140,
      mist: 12,
      motes: 220,
      smoke: 60,
      embers: 40,
      glass: true,
    };
  }
  if (tier === 'mid') {
    return {
      dpr: 1.25,
      shadows: true,
      shadowMapSize: 1024,
      shadowRadius: 2.4,
      post: true,
      ao: false,
      dof: false,
      bloom: true,
      envResolution: 128,
      trees: 170,
      terrainSegments: 112,
      pathSegments: 90,
      mist: 7,
      motes: 90,
      smoke: 34,
      embers: 20,
      glass: false,
    };
  }
  return {
    dpr: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowRadius: 0,
    post: false,
    ao: false,
    dof: false,
    bloom: false,
    envResolution: 64,
    trees: 90,
    terrainSegments: 72,
    pathSegments: 56,
    mist: 4,
    motes: 0,
    smoke: 18,
    embers: 0,
    glass: false,
  };
}
