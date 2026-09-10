/**
 * The whole-scene grade: faint film grain + a subtle vignette (docs/BRIEF.md §4.3).
 * Faint means faint — it should read as texture. Only mounted on the high tier.
 */
import { EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';

/** Tunables, kept together so the art pass has one place to nudge. */
const GRAIN_OPACITY = 0.24; // soft-light, so this lands far lower than it reads
const VIGNETTE_OFFSET = 0.32;
const VIGNETTE_DARKNESS = 0.42;

export default function Effects({ multisampling = 4 }: { multisampling?: number }) {
  return (
    <EffectComposer multisampling={multisampling} enableNormalPass={false} depthBuffer stencilBuffer={false}>
      {/* three only tone-maps when it draws straight to the canvas, so the composer has to do it
          itself — without this, anything brighter than white clips per channel and goes technicolour. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={GRAIN_OPACITY} />
      <Vignette eskil={false} offset={VIGNETTE_OFFSET} darkness={VIGNETTE_DARKNESS} blendFunction={BlendFunction.NORMAL} />
    </EffectComposer>
  );
}
