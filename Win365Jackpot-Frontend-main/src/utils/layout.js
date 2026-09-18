// src/utils/layout.js
// Single source of truth for the page's horizontal alignment and vertical
// rhythm.
//
// WHY THIS EXISTS. Every landing section used to carry its own numbers, and
// they all disagreed: outer containers ran 860, 900, 980, 1080, 1180, 1200,
// 1240, 1280 and 1320px, with side gutters of 16, 20 and 24px on top. The
// result was a ragged left edge — "Beyond the Casino" started 60px from the
// viewport edge, Luxury Travel 130px, Stays 180px — which is visible as the
// page scrolls even though no single section looks wrong on its own.
//
// "Beyond the Casino" is the agreed reference (maxWidth 1320 inside a
// clamp(14px, 4vw, 20px) gutter), so its geometry is what everything else now
// imports. A narrower *measure* inside a section (a 620px paragraph, a 860px
// FAQ column) is still fine — that is typography, not page alignment — but the
// container it sits in is the same everywhere.
//
// THE VERTICAL NUMBER IS DELIBERATELY SMALLER THAN IT WAS. Sections carried
// 80-120px of padding top AND bottom, so consecutive sections were separated by
// 160-208px of empty page plus their own header margins. Halving it keeps the
// sections distinct without making a visitor scroll through dead space, and it
// is what makes scrolling to a section actually land on that section: with the
// old padding, the top of a section under the navbar was a screen of nothing.

/** Outer content width, matching "Beyond the Casino". */
export const CONTAINER_MAX = 1320

/** Side gutter, matching "Beyond the Casino". */
export const GUTTER = 'clamp(14px, 4vw, 20px)'

/** Space above and below a section's content. */
export const SECTION_PAD_Y = 'clamp(30px, 4.2vw, 52px)'

/** Shorthand for a section shell: `padding: SECTION_PAD`. */
export const SECTION_PAD = `${SECTION_PAD_Y} ${GUTTER}`

/**
 * The container every section's content sits in. Spread it rather than
 * copying the numbers:  <div style={{ ...CONTAINER }}>
 */
export const CONTAINER = {
  maxWidth: CONTAINER_MAX,
  margin: '0 auto',
  width: '100%',
}

/**
 * Gap between a section's header block and the content under it. Sections
 * were each inventing their own (30-60px); one value keeps the rhythm even.
 */
export const HEADER_GAP = 'clamp(22px, 3.4vw, 36px)'
