/**
 * Crossing status colours.
 *
 * These are the product's core vocabulary (SOW M2) and are used identically on both platforms
 * and in the admin panel. Contrast matters more than usual here: a driver reads these markers in
 * direct sunlight, at a glance, while driving.
 */
export const statusColors = {
  /** Fresh blocked report. */
  red: '#D7262F',
  /** Blocked, aged past the freshness window — blocked but unconfirmed. */
  yellow: '#E8A317',
  /** A clear report was received. */
  green: '#1F9D55',
  /** No reports at all — unconfirmed, NOT clear. Deliberately desaturated. */
  unknown: '#8A94A6',
} as const;

export const palette = {
  ...statusColors,
  background: '#0B1F33',
  surface: '#13293D',
  surfaceRaised: '#1B3A52',
  border: '#274B66',
  text: '#F2F6FA',
  textMuted: '#9DB0C2',
  accent: '#D7262F',
} as const;
