/**
 * Scene palette. The hexes mirror src/styles/tokens.css (docs/BRIEF.md §4.1) so the 3D layer
 * and the 2D layer are lit by the same eight colours. Never #D97757.
 */
export const PALETTE = {
  parchment: '#F5EFE2',
  kraft: '#E9DCC5',
  lampAmber: '#D9A441',
  burntSienna: '#B85C38',
  moss: '#6B7D5C',
  pineShadow: '#3E4A3D',
  walnut: '#5C4633',
  ridgeHaze: '#8FA3B0',
} as const;

/** Derived surfaces, matched to the 2D layer's --cabin-dark / --cabin-wood / --dusk. */
export const SURFACE = {
  cabinDark: '#2B322A',
  cabinWood: '#4A3828',
  dusk: '#566A75',
  duskDeep: '#39464C',
  skyHigh: '#F3D6A6',
  skyLow: '#F5E3C4',
  sunCore: '#FFE7B3',
  glass: '#F0C46B',
} as const;

/** Storyblok `spine_color` is a palette token name (src/lib/types.ts SPINE_COLORS). */
const SPINE_HEX: Record<string, string> = {
  moss: PALETTE.moss,
  'pine-shadow': PALETTE.pineShadow,
  'burnt-sienna': PALETTE.burntSienna,
  walnut: PALETTE.walnut,
  'ridge-haze': PALETTE.ridgeHaze,
  'lamp-amber': PALETTE.lampAmber,
  kraft: PALETTE.kraft,
  parchment: PALETTE.parchment,
};

export function spineHex(token: string | undefined): string {
  if (!token) return PALETTE.moss;
  return SPINE_HEX[token] ?? (/^#[0-9a-f]{3,8}$/i.test(token) ? token : PALETTE.moss);
}

/** Sleeve colours for the vinyl spines, cycled so a shelf never reads as one block. */
export const SLEEVE_CYCLE = [PALETTE.burntSienna, PALETTE.moss, PALETTE.walnut, PALETTE.ridgeHaze, PALETTE.pineShadow, PALETTE.lampAmber] as const;

/** Clear colour per zone, painted before the zone chunk has loaded so nothing flashes black. */
export const ZONE_BACKDROP = {
  vista: SURFACE.skyLow,
  trail: '#C9B48A',
  cabin: '#171712',
  porch: SURFACE.duskDeep,
} as const;
