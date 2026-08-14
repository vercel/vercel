/**
 * Strict 7-character hex color (e.g. `#1A2B3C`). Lowercase letters allowed.
 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

/**
 * Throws a user-facing error if the value is set and not a valid hex color.
 * The `flag` argument is included in the message so the user knows which input
 * was rejected (e.g. `Invalid background color "red". Expected 6-digit hex like #1A2B3C.`).
 */
export function validateHexColor(
  value: string | undefined,
  label: string
): void {
  if (value === undefined) {
    return;
  }
  if (!isValidHexColor(value)) {
    throw new Error(
      `Invalid ${label} "${value}". Expected 6-digit hex like #1A2B3C.`
    );
  }
}
