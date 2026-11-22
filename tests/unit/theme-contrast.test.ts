import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los colores viven como variables en src/app/globals.css. Esta prueba lee ese archivo y
 * exige contraste WCAG AA (4.5:1) en las parejas de texto y fondo que la interfaz usa,
 * tanto en modo claro como oscuro. Así, cambiar un color de la marca no deja texto ilegible.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function parseVars(block: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = m;
    if (name && value) vars[name] = value.trim();
  }
  return vars;
}

const lightBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
const darkBlock = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

function resolve(vars: Record<string, string>, name: string, depth = 0): string {
  const value = vars[name];
  if (value === undefined) throw new Error(`Falta la variable ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  if (!ref) return value;
  if (depth > 5) throw new Error(`Referencia circular en ${name}`);
  return resolve(vars, ref, depth + 1);
}

function luminance(hex: string): number {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!digits) throw new Error(`Color no válido: ${hex}`);
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const pairs: Array<[string, string]> = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--muted", "--bg"],
  ["--muted", "--surface"],
  ["--primary", "--surface"],
  ["--primary", "--bg"],
  ["--primary-ink", "--primary"],
  ["--primary-ink", "--primary-hover"],
  ["--info", "--info-bg"],
  ["--ok", "--ok-bg"],
  ["--warn", "--warn-bg"],
  ["--bad", "--bad-bg"],
  ["--ok", "--surface"],
  ["--warn", "--surface"],
  ["--bad", "--surface"],
];

describe("tema de la empresa", () => {
  it("define las paletas clara y oscura", () => {
    expect(Object.keys(parseVars(lightBlock)).length).toBeGreaterThan(10);
    expect(Object.keys(parseVars(darkBlock)).length).toBeGreaterThan(10);
  });

  const modes: Array<[string, Record<string, string>]> = [
    ["claro", parseVars(lightBlock)],
    ["oscuro", { ...parseVars(lightBlock), ...parseVars(darkBlock) }],
  ];

  for (const [mode, vars] of modes) {
    describe(`modo ${mode}`, () => {
      it.each(pairs)("%s sobre %s cumple contraste AA (4.5)", (fg, bg) => {
        const ratio = contrast(resolve(vars, fg), resolve(vars, bg));
        expect(ratio, `${fg} sobre ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it("la barra superior mantiene texto legible sobre los azules de marca", () => {
    const vars = parseVars(lightBlock);
    for (const bg of ["--brand-navy", "--brand"]) {
      expect(contrast("#ffffff", resolve(vars, bg))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(resolve(vars, "--brand-tint"), resolve(vars, "--brand-navy"))).toBeGreaterThanOrEqual(4.5);
  });
});
