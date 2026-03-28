import { describe, test, expect } from "vitest";
import {
  parseTheme,
  serializeTheme,
  themeToCssVars,
  primaryTint,
  isValidHeaderImage,
  DEFAULT_THEME,
  COLOR_PRESETS,
  BG_PRESETS,
  HEADER_IMAGE_MAX_BYTES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  type FormTheme,
} from "../lib/theme";

// ─── parseTheme ─────────────────────────────────────────────────────

describe("parseTheme", () => {
  test("returns default theme for null/undefined/empty", () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
    expect(parseTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(parseTheme("")).toEqual(DEFAULT_THEME);
  });

  test("returns default theme for invalid JSON", () => {
    expect(parseTheme("not-json")).toEqual(DEFAULT_THEME);
    expect(parseTheme("{broken")).toEqual(DEFAULT_THEME);
  });

  test("returns default theme for non-object JSON", () => {
    expect(parseTheme('"string"')).toEqual(DEFAULT_THEME);
    expect(parseTheme("42")).toEqual(DEFAULT_THEME);
    expect(parseTheme("null")).toEqual(DEFAULT_THEME);
    expect(parseTheme("true")).toEqual(DEFAULT_THEME);
  });

  test("parses valid theme JSON", () => {
    const theme: FormTheme = {
      primaryColor: "#e11d48",
      backgroundColor: "#ffffff",
      fontFamily: "serif",
      borderRadius: "lg",
      headerImage: "",
    };
    expect(parseTheme(JSON.stringify(theme))).toEqual(theme);
  });

  test("parses theme with valid headerImage", () => {
    const theme: FormTheme = {
      ...DEFAULT_THEME,
      headerImage: "/uploads/abc-123.png",
    };
    expect(parseTheme(JSON.stringify(theme))).toEqual(theme);
  });

  test("rejects invalid headerImage paths", () => {
    const result = parseTheme(JSON.stringify({ ...DEFAULT_THEME, headerImage: "https://evil.com/img.jpg" }));
    expect(result.headerImage).toBe("");
  });

  test("rejects non-string headerImage", () => {
    const result = parseTheme(JSON.stringify({ ...DEFAULT_THEME, headerImage: 42 }));
    expect(result.headerImage).toBe("");
  });

  test("falls back to defaults for invalid individual fields", () => {
    const partial = JSON.stringify({
      primaryColor: "not-hex",
      backgroundColor: "#fff",       // 3-char hex — invalid
      fontFamily: "comic-sans",      // not in allowed set
      borderRadius: "xl",            // not in allowed set
    });
    expect(parseTheme(partial)).toEqual(DEFAULT_THEME);
  });

  test("mixes valid and invalid fields correctly", () => {
    const partial = JSON.stringify({
      primaryColor: "#2563eb",       // valid
      backgroundColor: "invalid",    // falls back
      fontFamily: "mono",            // valid
      borderRadius: "nope",          // falls back
    });
    const result = parseTheme(partial);
    expect(result.primaryColor).toBe("#2563eb");
    expect(result.backgroundColor).toBe(DEFAULT_THEME.backgroundColor);
    expect(result.fontFamily).toBe("mono");
    expect(result.borderRadius).toBe(DEFAULT_THEME.borderRadius);
  });

  test("returns a new object each time (no shared references)", () => {
    const a = parseTheme(null);
    const b = parseTheme(null);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ─── serializeTheme ─────────────────────────────────────────────────

describe("serializeTheme", () => {
  test("serializes default theme to valid JSON", () => {
    const json = serializeTheme(DEFAULT_THEME);
    expect(JSON.parse(json)).toEqual(DEFAULT_THEME);
  });

  test("round-trips through parse", () => {
    const theme: FormTheme = {
      primaryColor: "#059669",
      backgroundColor: "#eff6ff",
      fontFamily: "mono",
      borderRadius: "sm",
      headerImage: "/uploads/test-img.gif",
    };
    expect(parseTheme(serializeTheme(theme))).toEqual(theme);
  });
});

// ─── themeToCssVars ─────────────────────────────────────────────────

describe("themeToCssVars", () => {
  test("returns correct CSS variables for default theme", () => {
    const vars = themeToCssVars(DEFAULT_THEME);
    expect(vars["--theme-primary"]).toBe("#4f46e5");
    expect(vars["--theme-bg"]).toBe("#f9fafb");
    expect(vars["--theme-font"]).toContain("sans-serif");
    expect(vars["--theme-radius"]).toBe("0.5rem");
  });

  test("returns correct CSS variables for custom theme", () => {
    const theme: FormTheme = {
      primaryColor: "#e11d48",
      backgroundColor: "#ffffff",
      fontFamily: "serif",
      borderRadius: "lg",
      headerImage: "",
    };
    const vars = themeToCssVars(theme);
    expect(vars["--theme-primary"]).toBe("#e11d48");
    expect(vars["--theme-bg"]).toBe("#ffffff");
    expect(vars["--theme-font"]).toContain("Georgia");
    expect(vars["--theme-radius"]).toBe("0.75rem");
  });

  test("maps mono font family correctly", () => {
    const vars = themeToCssVars({ ...DEFAULT_THEME, fontFamily: "mono" });
    expect(vars["--theme-font"]).toContain("monospace");
  });

  test("maps sm border radius correctly", () => {
    const vars = themeToCssVars({ ...DEFAULT_THEME, borderRadius: "sm" });
    expect(vars["--theme-radius"]).toBe("0.375rem");
  });

  test("always returns exactly 4 CSS variables", () => {
    const vars = themeToCssVars(DEFAULT_THEME);
    expect(Object.keys(vars)).toHaveLength(4);
  });
});

// ─── primaryTint ────────────────────────────────────────────────────

describe("primaryTint", () => {
  test("converts hex to rgba with default opacity", () => {
    expect(primaryTint("#ff0000")).toBe("rgba(255,0,0,0.1)");
  });

  test("respects custom opacity", () => {
    expect(primaryTint("#00ff00", 0.5)).toBe("rgba(0,255,0,0.5)");
  });

  test("handles indigo-600 correctly", () => {
    expect(primaryTint("#4f46e5")).toBe("rgba(79,70,229,0.1)");
  });

  test("returns fallback for invalid hex", () => {
    expect(primaryTint("not-hex")).toBe("rgba(79,70,229,0.1)");
    expect(primaryTint("#fff")).toBe("rgba(79,70,229,0.1)");
    expect(primaryTint("")).toBe("rgba(79,70,229,0.1)");
  });

  test("handles edge case colors", () => {
    expect(primaryTint("#000000")).toBe("rgba(0,0,0,0.1)");
    expect(primaryTint("#ffffff")).toBe("rgba(255,255,255,0.1)");
  });
});

// ─── Presets ────────────────────────────────────────────────────────

describe("presets", () => {
  test("COLOR_PRESETS all have valid hex values", () => {
    for (const preset of COLOR_PRESETS) {
      expect(preset.value).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  test("BG_PRESETS all have valid hex values", () => {
    for (const preset of BG_PRESETS) {
      expect(preset.value).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  test("default primary color is in COLOR_PRESETS", () => {
    expect(COLOR_PRESETS.some((p) => p.value === DEFAULT_THEME.primaryColor)).toBe(true);
  });

  test("default background color is in BG_PRESETS", () => {
    expect(BG_PRESETS.some((p) => p.value === DEFAULT_THEME.backgroundColor)).toBe(true);
  });
});

// ─── isValidHeaderImage ─────────────────────────────────────────────

describe("isValidHeaderImage", () => {
  test("accepts empty string", () => {
    expect(isValidHeaderImage("")).toBe(true);
  });

  test("accepts valid /uploads/ paths", () => {
    expect(isValidHeaderImage("/uploads/abc-123.jpg")).toBe(true);
    expect(isValidHeaderImage("/uploads/my_image.png")).toBe(true);
    expect(isValidHeaderImage("/uploads/anim.gif")).toBe(true);
    expect(isValidHeaderImage("/uploads/photo.webp")).toBe(true);
    expect(isValidHeaderImage("/uploads/icon.svg")).toBe(true);
    expect(isValidHeaderImage("/uploads/photo.jpeg")).toBe(true);
  });

  test("rejects external URLs", () => {
    expect(isValidHeaderImage("https://example.com/img.jpg")).toBe(false);
    expect(isValidHeaderImage("http://evil.com/a.png")).toBe(false);
  });

  test("rejects paths outside /uploads/", () => {
    expect(isValidHeaderImage("/etc/passwd")).toBe(false);
    expect(isValidHeaderImage("/public/uploads/img.jpg")).toBe(false);
    expect(isValidHeaderImage("uploads/img.jpg")).toBe(false);
  });

  test("rejects path traversal attempts", () => {
    expect(isValidHeaderImage("/uploads/../etc/passwd")).toBe(false);
    expect(isValidHeaderImage("/uploads/../../secret.jpg")).toBe(false);
  });

  test("rejects paths with invalid characters", () => {
    expect(isValidHeaderImage("/uploads/img file.jpg")).toBe(false);
    expect(isValidHeaderImage("/uploads/img<script>.jpg")).toBe(false);
  });
});

// ─── Constants ──────────────────────────────────────────────────────

describe("constants", () => {
  test("HEADER_IMAGE_MAX_BYTES is 5 MB", () => {
    expect(HEADER_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  test("ALLOWED_IMAGE_TYPES contains expected MIME types", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("image/gif")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("image/webp")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("image/svg+xml")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("application/pdf")).toBe(false);
  });

  test("ALLOWED_IMAGE_EXTENSIONS contains expected extensions", () => {
    expect(ALLOWED_IMAGE_EXTENSIONS.has("jpg")).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has("jpeg")).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has("png")).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has("gif")).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has("webp")).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has("svg")).toBe(true);
    expect(ALLOWED_IMAGE_EXTENSIONS.has("bmp")).toBe(false);
    expect(ALLOWED_IMAGE_EXTENSIONS.has("exe")).toBe(false);
  });
});

// ─── Performance ────────────────────────────────────────────────────

describe("performance", () => {
  test("parseTheme is O(1) — 10k calls under 50ms", () => {
    const json = serializeTheme(DEFAULT_THEME);
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) parseTheme(json);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("themeToCssVars is O(1) — 10k calls under 50ms", () => {
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) themeToCssVars(DEFAULT_THEME);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("primaryTint is O(1) — 10k calls under 50ms", () => {
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) primaryTint("#4f46e5", 0.1);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
