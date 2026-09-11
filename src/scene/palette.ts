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

/**
 * Derived surfaces. Everything here is a mix of two palette tokens or a value the palette
 * implies (the sun is a hotter parchment, the dusk is a colder ridge-haze), so the scene never
 * introduces a ninth colour.
 */
export const SURFACE = {
  /** Wood, warmest first. */
  woodLight: '#7A5C3C',
  woodMid: '#5C4633',
  woodDark: '#3F2F22',
  woodFloor: '#4E3A29',
  bark: '#493525',
  /** Masonry and hearth. */
  stone: '#6A6058',
  stoneDark: '#4A423B',
  soot: '#241E19',
  ember: '#C24A22',
  flame: '#F0A03C',
  /** Sky, golden hour. */
  skyZenith: '#9FB6C4',
  skyMid: '#F0CE9C',
  skyHorizon: '#F7DCB4',
  skyBelow: '#B9A585',
  sunCore: '#FFF1D2',
  sunHalo: '#FFCE86',
  /** Sky, dusk on the porch. */
  duskZenith: '#1E2833',
  duskMid: '#41525F',
  duskHorizon: '#B5713F',
  duskBelow: '#1B2019',
  /** Interiors. */
  cabinDark: '#2B322A',
  plaster: '#8C7B63',
  glassLit: '#F2CE8A',
  brass: '#C9A15A',
  /** Ground cover. */
  meadow: '#7C8A5F',
  dirt: '#9B7F58',
  dirtDark: '#6E5637',
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

/** Sleeve colours for the record spines, cycled so a shelf never reads as one block. */
export const SLEEVE_CYCLE = [
  PALETTE.burntSienna,
  PALETTE.moss,
  PALETTE.walnut,
  PALETTE.ridgeHaze,
  PALETTE.pineShadow,
  PALETTE.lampAmber,
] as const;

/** Painted before the first frame so nothing flashes black while the island boots. */
export const CLEAR_COLOUR = SURFACE.skyHorizon;
