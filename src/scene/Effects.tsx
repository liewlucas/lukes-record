/**
 * The grade. Tiered, because the difference between a laptop that can afford ambient occlusion
 * and one that cannot is the difference between 60 fps and 20.
 *
 *  high — N8AO at half resolution, a narrow bloom that only the lamp, the fire, the screen and
 *         the sun can reach, AgX tone mapping, film grain, vignette.
 *  mid  — tone mapping, bloom, grain, vignette.
 *  low  — nothing; three tone-maps straight to the canvas and the scene is drawn plain.
 *
 * Depth of field is off during the walk. On a scroll-driven camera it smears the wall behind the
 * subject as the focus distance chases the look-at, and the effect is invisible at these
 * distances anyway; it only earns its place on a deep link, where the camera is parked on one
 * object and the shallow plane is the whole point.
 *
 * Tone mapping has to happen *here* rather than in the renderer: three only applies its tone
 * mapping curve when it draws directly to the canvas, so the moment a composer is in the way,
 * anything brighter than white would clip per channel and go technicolour.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type DepthOfFieldEffect } from 'postprocessing';
import { journeyState } from './journey';
import type { Budget } from './capabilities';

/** Faint means faint: this should read as paper, not as static (docs/BRIEF.md §4.3). */
const GRAIN_OPACITY = 0.08;
const VIGNETTE_OFFSET = 0.3;
const VIGNETTE_DARKNESS = 0.46;

/** Keeps the depth of field locked onto the framed object. */
function FocusPuller({ effect }: { effect: React.RefObject<DepthOfFieldEffect | null> }) {
  useFrame(() => {
    const dof = effect.current;
    if (!dof) return;
    dof.target = journeyState.focus;
  });
  return null;
}

export default function Effects({ budget, deepLink = false }: { budget: Budget; deepLink?: boolean }) {
  const dof = useRef<DepthOfFieldEffect>(null);
  const wantsDof = budget.dof && deepLink;

  useEffect(() => {
    if (dof.current) dof.current.target = journeyState.focus;
  }, [wantsDof]);

  if (!budget.post) return null;

  return (
    <>
      {wantsDof && <FocusPuller effect={dof} />}
      <EffectComposer multisampling={budget.ao ? 0 : 4} enableNormalPass={false} depthBuffer stencilBuffer={false}>
        {budget.ao ? (
          <N8AO
            aoRadius={1.3}
            distanceFalloff={0.85}
            intensity={1.7}
            quality="low"
            halfRes
            depthAwareUpsampling
            color="#2B2119"
            screenSpaceRadius={false}
          />
        ) : (
          <></>
        )}
        <ToneMapping mode={ToneMappingMode.AGX} />
        {budget.bloom ? (
          // Threshold high enough that only the bulb, the coals, the screen and the sun lift.
          <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.12} intensity={0.45} radius={0.66} levels={6} />
        ) : (
          <></>
        )}
        {wantsDof ? <DepthOfField ref={dof} focusDistance={2} focusRange={6} bokehScale={1} resolutionScale={0.5} /> : <></>}
        <Noise premultiply blendFunction={BlendFunction.NORMAL} opacity={GRAIN_OPACITY} />
        <Vignette eskil={false} offset={VIGNETTE_OFFSET} darkness={VIGNETTE_DARKNESS} blendFunction={BlendFunction.NORMAL} />
      </EffectComposer>
    </>
  );
}
