/**
 * Whether an optional money field actually carries a published figure.
 *
 * Buy-in / entry fee are optional: a tournament states one, an event has none
 * to state. Two stored values mean "nothing was published", and neither may be
 * rendered as a price:
 *
 *   null / undefined / ''  the column is nullable, and this is the real
 *                          "left blank in the Back Office" value;
 *   0                      the placeholder the old NOT NULL column defaulted
 *                          to. Migration 0099 rewrites those rows to NULL, but
 *                          a 0 can still reach a card from an older cached
 *                          payload, and it never meant a genuine freeroll.
 *
 * Lives in one place because every surface that prints a buy-in has to agree:
 * a card that hides the line while its details page prints "$0" is the exact
 * inconsistency this replaces. The Andhar Bahar card already applied this rule
 * inline and is the precedent.
 */
export function hasAmount(value) {
  if (value == null || value === '') return false
  const num = Number(value)
  return Number.isFinite(num) && num > 0
}
