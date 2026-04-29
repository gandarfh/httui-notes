import { describe, it, expect } from "vitest";

import {
  ATOMS,
  FONT_MARKDOWN_BODY,
  FONT_MONO,
  FONT_SANS,
  FONT_SERIF,
  FUJI_BG_DARK,
  FUJI_BG_LIGHT,
  METHOD_COLORS,
  METHOD_PILL_STYLE,
  RADII,
  SPACING,
  STATE_COLORS,
  THEME_DARK,
  THEME_LIGHT,
  TYPE_SCALE,
} from "@/theme/tokens";

describe("font stacks", () => {
  it("sans starts with Geist and falls back to system-ui", () => {
    expect(FONT_SANS).toMatch(/^"Geist"/);
    expect(FONT_SANS).toContain("-apple-system");
    expect(FONT_SANS).toContain("system-ui");
    expect(FONT_SANS).toMatch(/sans-serif$/);
  });

  it("mono starts with Geist Mono and includes JetBrains/SF Mono fallbacks", () => {
    expect(FONT_MONO).toMatch(/^"Geist Mono"/);
    expect(FONT_MONO).toContain("JetBrains Mono");
    expect(FONT_MONO).toContain("SF Mono");
    expect(FONT_MONO).toMatch(/monospace$/);
  });

  it("serif uses Source Serif 4 then legacy Source Serif Pro", () => {
    expect(FONT_SERIF).toMatch(/^"Source Serif 4"/);
    expect(FONT_SERIF).toContain("Source Serif Pro");
    expect(FONT_SERIF).toMatch(/serif$/);
  });

  it("markdown body prefers Latin Modern Roman", () => {
    expect(FONT_MARKDOWN_BODY).toMatch(/^"Latin Modern Roman"/);
    expect(FONT_MARKDOWN_BODY).toMatch(/serif$/);
  });
});

describe("type scale", () => {
  it("matches the canvas px values exactly", () => {
    expect(TYPE_SCALE).toEqual({
      xs: "11px",
      sm: "12px",
      base: "13px",
      md: "14px",
      lg: "16px",
      xl: "20px",
      "2xl": "28px",
    });
  });
});

describe("method colors", () => {
  it("covers every HTTP method spec'd in canvas §0", () => {
    for (const m of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
    ] as const) {
      expect(METHOD_COLORS[m]).toMatch(/^oklch\(/);
    }
  });

  it("covers query block types (sql, mongo, ws, gql, sh)", () => {
    for (const m of ["sql", "mongo", "ws", "gql", "sh"] as const) {
      expect(METHOD_COLORS[m]).toMatch(/^oklch\(/);
    }
  });

  it("GET is sky 215 hue", () => {
    expect(METHOD_COLORS.get).toBe("oklch(0.78 0.07 215)");
  });

  it("DELETE is sunset red 15 hue", () => {
    expect(METHOD_COLORS.delete).toBe("oklch(0.66 0.18 15)");
  });

  it("pill atom uses currentColor color-mix at 16%", () => {
    expect(METHOD_PILL_STYLE.background).toBe(
      "color-mix(in oklab, currentColor 16%, transparent)",
    );
    expect(METHOD_PILL_STYLE.font).toMatch(/^600 10px\/1 /);
    expect(METHOD_PILL_STYLE.letterSpacing).toBe("0.04em");
  });
});

describe("state colors", () => {
  it("ok=moss, warn=canola, err=sunset, info=sky (canvas §0)", () => {
    expect(STATE_COLORS.ok).toBe("oklch(0.66 0.11 145)");
    expect(STATE_COLORS.warn).toBe("oklch(0.78 0.15 75)");
    expect(STATE_COLORS.err).toBe("oklch(0.66 0.18 15)");
    expect(STATE_COLORS.info).toBe("oklch(0.74 0.07 215)");
  });
});

describe("dark theme (Fuji at dusk)", () => {
  it("has bg ramp 0.16 → 0.295 stone-blue", () => {
    expect(THEME_DARK.bg).toBe("oklch(0.16 0.012 230)");
    expect(THEME_DARK.bg1).toBe("oklch(0.185 0.012 230)");
    expect(THEME_DARK.bg2).toBe("oklch(0.215 0.012 230)");
    expect(THEME_DARK.bg3).toBe("oklch(0.245 0.012 230)");
    expect(THEME_DARK.bgHi).toBe("oklch(0.295 0.012 230)");
  });

  it("has fg ramp 0.50 → 0.96 warm snow", () => {
    expect(THEME_DARK.fg).toBe("oklch(0.96 0.008 80)");
    expect(THEME_DARK.fg1).toBe("oklch(0.82 0.008 80)");
    expect(THEME_DARK.fg2).toBe("oklch(0.64 0.008 80)");
    expect(THEME_DARK.fg3).toBe("oklch(0.50 0.008 80)");
  });

  it("accent is canola gold", () => {
    expect(THEME_DARK.accent).toBe("oklch(0.84 0.16 90)");
  });

  it("selection blue at 45% opacity", () => {
    expect(THEME_DARK.sel).toBe("oklch(0.42 0.10 220 / 0.45)");
  });
});

describe("light theme (Fuji photo)", () => {
  it("has paper-warm bg + Fuji-blue ink fg", () => {
    expect(THEME_LIGHT.bg).toBe("oklch(0.985 0.006 90)");
    expect(THEME_LIGHT.fg).toBe("oklch(0.20 0.040 240)");
  });

  it("accent shifts to canola yellow flowers (hue 95)", () => {
    expect(THEME_LIGHT.accent).toBe("oklch(0.78 0.16 95)");
  });

  it("selection is yellow at half opacity", () => {
    expect(THEME_LIGHT.sel).toBe("oklch(0.85 0.12 95 / 0.50)");
  });
});

describe("dark and light themes have parallel keys", () => {
  it("share the same shape (no key in one missing in the other)", () => {
    const darkKeys = Object.keys(THEME_DARK).sort();
    const lightKeys = Object.keys(THEME_LIGHT).sort();
    expect(darkKeys).toEqual(lightKeys);
  });
});

describe("atoms", () => {
  it("kbd is 18×18 with raised bottom border", () => {
    expect(ATOMS.kbd.minWidth).toBe("18px");
    expect(ATOMS.kbd.height).toBe("18px");
    expect(ATOMS.kbd.borderBottomWidth).toBe("2px");
  });

  it("dot is 6×6", () => {
    expect(ATOMS.dot.size).toBe("6px");
  });

  it("btn is 24px tall", () => {
    expect(ATOMS.btn.height).toBe("24px");
  });

  it("statusbar is 22px tall (canvas spec)", () => {
    expect(ATOMS.statusbar.height).toBe("22px");
  });

  it("tabbar accent line on top, not bottom", () => {
    expect(ATOMS.tabbar.accentLinePosition).toBe("top");
  });
});

describe("spacing scale", () => {
  it("base unit is 4px (key '1')", () => {
    expect(SPACING["1"]).toBe("4px");
  });

  it("provides finer steps below 4px", () => {
    expect(SPACING.px).toBe("1px");
    expect(SPACING["0.5"]).toBe("2px");
  });
});

describe("radii", () => {
  it("base radius is 4px (matches btn/kbd atoms)", () => {
    expect(RADII.base).toBe("4px");
  });

  it("full is the pill 9999px", () => {
    expect(RADII.full).toBe("9999px");
  });
});

describe("Fuji watercolor backgrounds", () => {
  it("dark variant is a multi-layer gradient stack", () => {
    expect(FUJI_BG_DARK).toContain("radial-gradient");
    expect(FUJI_BG_DARK).toContain("linear-gradient");
    expect(FUJI_BG_DARK).toContain("oklch(0.16 0.012 230)");
  });

  it("light variant ends in canola yellow", () => {
    expect(FUJI_BG_LIGHT).toContain("radial-gradient");
    expect(FUJI_BG_LIGHT).toContain("oklch(0.985 0.006 90)");
    expect(FUJI_BG_LIGHT).toContain("0.94 0.05 95");
  });
});
