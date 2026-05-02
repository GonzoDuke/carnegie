/**
 * Carnegie tartan SVGs — used in two places per the v3 redesign spec.
 *
 * The official thread count (Y/4 G4 R4 G4 R4 G12 K12 R4 B12 R4 B4 R4 B/6)
 * is simplified here for a 32px icon — exact reproduction would dissolve
 * into noise at this scale. We use the five clan colors at moderate
 * opacity so the cross-hatch reads as plaid without overwhelming the
 * "C" glyph that sits on top.
 *
 *   Navy   #1B3A5C  (base + B threads)
 *   Green  #2D5A3A  (G threads)
 *   Red    #B83232  (R threads)
 *   Black  #141414  (K threads)
 *   Gold   #C4A35A  (Y threads)
 */
const NAVY = '#1B3A5C';
const GREEN = '#2D5A3A';
const RED = '#B83232';
const BLACK = '#141414';
const GOLD = '#C4A35A';

/**
 * 32×32 rounded square with the tartan pattern + a centered white "C".
 * The horizontal and vertical stripes overlap (vertical stripes inherit
 * a darker mix from the horizontal layer below them) which is exactly
 * how a real woven tartan reads to the eye.
 */
export function TartanLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id="carnegie-tartan-logo-clip">
          <rect width="32" height="32" rx="8" />
        </clipPath>
      </defs>
      <g clipPath="url(#carnegie-tartan-logo-clip)">
        {/* Base */}
        <rect width="32" height="32" fill={NAVY} />

        {/* Horizontal stripes (the warp). Spacing roughly mirrors the thread-
            count proportions: a thin gold accent, a green band, a wider
            black middle, a red lower band, another thin gold near the foot. */}
        <rect x="0" y="2" width="32" height="2" fill={GOLD} opacity="0.55" />
        <rect x="0" y="7" width="32" height="3" fill={GREEN} opacity="0.5" />
        <rect x="0" y="13" width="32" height="5" fill={BLACK} opacity="0.55" />
        <rect x="0" y="21" width="32" height="3" fill={RED} opacity="0.55" />
        <rect x="0" y="27" width="32" height="2" fill={GOLD} opacity="0.55" />

        {/* Vertical stripes (the weft). Same color order, slightly offset
            from the horizontal so the crossings produce the plaid grid. */}
        <rect x="3" y="0" width="2" height="32" fill={GOLD} opacity="0.4" />
        <rect x="9" y="0" width="3" height="32" fill={GREEN} opacity="0.4" />
        <rect x="15" y="0" width="5" height="32" fill={BLACK} opacity="0.45" />
        <rect x="23" y="0" width="3" height="32" fill={RED} opacity="0.4" />
        <rect x="29" y="0" width="2" height="32" fill={GOLD} opacity="0.4" />
      </g>

      {/* "C" glyph. paint-order: stroke gives it a faint dark halo so the
          letter stays readable over the busiest tartan crossings. */}
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily='"JetBrains Mono", ui-monospace, monospace'
        fontSize="16"
        fontWeight="600"
        fill="#FFFFFF"
        style={{ paintOrder: 'stroke', stroke: 'rgba(20,20,20,0.55)', strokeWidth: 0.7 }}
      >
        C
      </text>
    </svg>
  );
}

/**
 * Full-width, 4px-tall sidebar accent stripe. A repeating pattern of
 * vertical clan-color bands so the line reads as tartan even at the
 * smallest legible height. The pattern tile repeats horizontally so
 * the stripe scales cleanly to any sidebar width.
 */
export function TartanStripe({ height = 4 }: { height?: number }) {
  // Tile width chosen so the pattern repeats roughly every ~3rd of the
  // 200px sidebar — gives the eye enough rhythm to recognize tartan.
  const TILE = 64;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${TILE} ${height}`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: 'block' }}
    >
      <defs>
        <pattern
          id="carnegie-tartan-stripe-tile"
          patternUnits="userSpaceOnUse"
          width={TILE}
          height={height}
        >
          <rect width={TILE} height={height} fill={NAVY} />
          {/* Gold thin */}
          <rect x="2" y="0" width="2" height={height} fill={GOLD} opacity="0.85" />
          {/* Green wider */}
          <rect x="8" y="0" width="4" height={height} fill={GREEN} opacity="0.85" />
          {/* Red */}
          <rect x="16" y="0" width="3" height={height} fill={RED} opacity="0.9" />
          {/* Black thicker (the K block in the thread count) */}
          <rect x="24" y="0" width="6" height={height} fill={BLACK} opacity="0.95" />
          {/* Red */}
          <rect x="34" y="0" width="3" height={height} fill={RED} opacity="0.9" />
          {/* Green */}
          <rect x="42" y="0" width="4" height={height} fill={GREEN} opacity="0.85" />
          {/* Gold thin */}
          <rect x="50" y="0" width="2" height={height} fill={GOLD} opacity="0.85" />
          {/* Navy gap before the next tile boundary lets the base color
              bleed through, which is what makes the pattern read as
              "navy ground crossed with clan accents". */}
        </pattern>
      </defs>
      <rect width={TILE} height={height} fill="url(#carnegie-tartan-stripe-tile)" />
    </svg>
  );
}
