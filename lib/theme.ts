/**
 * Form theme configuration — pure helpers for validation, defaults, and CSS generation.
 *
 * All functions are O(1) time and space (fixed-size theme objects).
 */

export interface FormTheme {
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
  borderRadius: "sm" | "md" | "lg";
  headerImage: string;
}

export const DEFAULT_THEME: FormTheme = {
  primaryColor: "#4f46e5",
  backgroundColor: "#f9fafb",
  fontFamily: "sans",
  borderRadius: "md",
  headerImage: "",
};

/** Max header image size: 5 MB. */
export const HEADER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types for header image upload. */
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

/** Allowed file extensions for header images. */
export const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"]);

/** Validate a header image path — must start with /uploads/ or be empty. */
export function isValidHeaderImage(path: string): boolean {
  if (!path) return true;
  return /^\/uploads\/[a-zA-Z0-9_-]+\.[a-z]{3,4}$/.test(path);
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FONT_FAMILIES = new Set(["sans", "serif", "mono"]);
const BORDER_RADII = new Set(["sm", "md", "lg"]);

/** Parse and validate a theme JSON string. Returns DEFAULT_THEME for invalid input. */
export function parseTheme(raw: string | null | undefined): FormTheme {
  if (!raw) return { ...DEFAULT_THEME };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_THEME };
    return {
      primaryColor: HEX_COLOR_RE.test(parsed.primaryColor) ? parsed.primaryColor : DEFAULT_THEME.primaryColor,
      backgroundColor: HEX_COLOR_RE.test(parsed.backgroundColor) ? parsed.backgroundColor : DEFAULT_THEME.backgroundColor,
      fontFamily: typeof parsed.fontFamily === "string" && parsed.fontFamily.trim() ? parsed.fontFamily : DEFAULT_THEME.fontFamily,
      borderRadius: BORDER_RADII.has(parsed.borderRadius) ? parsed.borderRadius : DEFAULT_THEME.borderRadius,
      headerImage: typeof parsed.headerImage === "string" && isValidHeaderImage(parsed.headerImage) ? parsed.headerImage : DEFAULT_THEME.headerImage,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/** Serialize a theme to a JSON string for storage. */
export function serializeTheme(theme: FormTheme): string {
  return JSON.stringify(theme);
}

const FONT_STACKS: Record<string, string> = {
  sans: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, 'Courier New', monospace",
};

const RADIUS_MAP: Record<string, string> = {
  sm: "0.375rem",
  md: "0.5rem",
  lg: "0.75rem",
};

/** Built-in font family keys. */
export const BUILT_IN_FONTS = new Set(["sans", "serif", "mono"]);

/** Convert a FormTheme into CSS custom property key-value pairs. */
export function themeToCssVars(theme: FormTheme): Record<string, string> {
  const fontStack = FONT_STACKS[theme.fontFamily]
    || `"${theme.fontFamily}", ${FONT_STACKS.sans}`;
  return {
    "--theme-primary": theme.primaryColor,
    "--theme-bg": theme.backgroundColor,
    "--theme-font": fontStack,
    "--theme-radius": RADIUS_MAP[theme.borderRadius] || RADIUS_MAP.md,
  };
}

/** Derive a lighter tint of the primary color for hover/focus states. */
export function primaryTint(hex: string, opacity = 0.1): string {
  if (!HEX_COLOR_RE.test(hex)) return `rgba(79,70,229,${opacity})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

/** Color presets for the theme editor. */
export const COLOR_PRESETS = [
  { label: "Indigo", value: "#4f46e5" },
  { label: "Blue", value: "#2563eb" },
  { label: "Emerald", value: "#059669" },
  { label: "Rose", value: "#e11d48" },
  { label: "Amber", value: "#d97706" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Teal", value: "#0d9488" },
  { label: "Slate", value: "#475569" },
];

export const BG_PRESETS = [
  { label: "Light Gray", value: "#f9fafb" },
  { label: "White", value: "#ffffff" },
  { label: "Warm", value: "#fef7ed" },
  { label: "Cool", value: "#eff6ff" },
  { label: "Mint", value: "#ecfdf5" },
  { label: "Lavender", value: "#f5f3ff" },
];
