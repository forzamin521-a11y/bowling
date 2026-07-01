// WCAG 대비비 감사 — globals.css의 oklch 토큰 쌍 검증
// oklch -> linear sRGB -> relative luminance -> contrast ratio

function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  // OKLab -> LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  // LMS -> linear sRGB
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function linToSrgb(c) {
  c = clamp01(c);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

// parse "oklch(L C H)" or "oklch(L C H / a)"; also accepts white/black shortcuts
function parseOklch(str) {
  const m = str.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/,
  );
  if (!m) throw new Error("bad oklch: " + str);
  const L = parseFloat(m[1]);
  const C = parseFloat(m[2]);
  const H = parseFloat(m[3]);
  let alpha = 1;
  if (m[4]) alpha = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  const lin = oklchToLinearSrgb(L, C, H);
  return { srgb: lin.map(linToSrgb).map(clamp01), alpha };
}

// composite foreground (with alpha) over opaque background, in sRGB gamma space (CSS does)
function over(fg, bg) {
  const a = fg.alpha;
  return {
    srgb: [0, 1, 2].map((i) => fg.srgb[i] * a + bg.srgb[i] * (1 - a)),
    alpha: 1,
  };
}

function relLuminance(srgb) {
  const lin = srgb.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a, b) {
  const la = relLuminance(a.srgb);
  const lb = relLuminance(b.srgb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- tokens ----
const L = {
  background: "oklch(0.99 0.003 256)",
  foreground: "oklch(0.17 0.02 256)",
  card: "oklch(1 0 0)",
  primary: "oklch(0.48 0.16 256)",
  primaryFg: "oklch(0.985 0 0)",
  secondary: "oklch(0.96 0.012 256)",
  secondaryFg: "oklch(0.3 0.06 256)",
  muted: "oklch(0.968 0.008 256)",
  mutedFg: "oklch(0.5 0.025 256)",
  accent: "oklch(0.95 0.025 256)",
  accentFg: "oklch(0.4 0.1 256)",
  border: "oklch(0.91 0.01 256)",
  gold: "oklch(0.81 0.135 85)",
  goldFg: "oklch(0.32 0.07 75)",
  silver: "oklch(0.78 0.012 256)",
  silverFg: "oklch(0.36 0.015 256)",
  bronze: "oklch(0.55 0.11 50)",
  bronzeFg: "oklch(0.99 0.01 75)",
  sidebar: "oklch(0.985 0.005 256)",
};
const D = {
  background: "oklch(0.17 0.02 256)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.215 0.022 256)",
  primary: "oklch(0.66 0.15 256)",
  primaryFg: "oklch(0.16 0.03 256)",
  secondary: "oklch(0.28 0.025 256)",
  secondaryFg: "oklch(0.985 0 0)",
  muted: "oklch(0.28 0.022 256)",
  mutedFg: "oklch(0.7 0.025 256)",
  accent: "oklch(0.32 0.04 256)",
  accentFg: "oklch(0.93 0.03 256)",
  gold: "oklch(0.81 0.135 85)",
  goldFg: "oklch(0.27 0.06 75)",
  silver: "oklch(0.72 0.012 256)",
  silverFg: "oklch(0.22 0.012 256)",
  bronze: "oklch(0.66 0.1 55)",
  bronzeFg: "oklch(0.16 0.03 75)",
  sidebar: "oklch(0.215 0.022 256)",
};

function p(s) {
  return parseOklch(s);
}

// alpha tint helper: "primary/10" over base
function tint(colorStr, alpha, baseStr) {
  const c = p(colorStr);
  c.alpha = alpha;
  return over(c, p(baseStr));
}

const checks = [];
function add(mode, label, fg, bg, kind = "text") {
  const ratio = contrast(fg, bg);
  // thresholds: normal text 4.5, large text/UI 3.0
  const threshold = kind === "text" ? 4.5 : 3.0;
  checks.push({ mode, label, ratio: ratio.toFixed(2), threshold, pass: ratio >= threshold, kind });
}

// LIGHT
add("L", "foreground / background", p(L.foreground), p(L.background));
add("L", "foreground / card", p(L.foreground), p(L.card));
add("L", "muted-foreground / background", p(L.mutedFg), p(L.background));
add("L", "muted-foreground / card", p(L.mutedFg), p(L.card));
add("L", "primary-fg / primary (buttons/banner)", p(L.primaryFg), p(L.primary));
add("L", "secondary-fg / secondary (badge upcoming)", p(L.secondaryFg), p(L.secondary));
add("L", "accent-fg / accent (hover/list)", p(L.accentFg), p(L.accent));
add("L", "gold-fg / gold (medal 1)", p(L.goldFg), p(L.gold));
add("L", "silver-fg / silver (medal 2)", p(L.silverFg), p(L.silver));
add("L", "bronze-fg / bronze (medal 3)", p(L.bronzeFg), p(L.bronze));
add("L", "primary text / primary10-over-bg (ongoing badge)", p(L.primary), tint(L.primary, 0.1, L.background));
add("L", "primary text / primary10-over-sidebar (nav active)", p(L.primary), tint(L.primary, 0.1, L.sidebar));
add("L", "primary (UI accent bar) / background", p(L.primary), p(L.background), "ui");
// 대시보드 stat 상단 바는 텍스트 라벨과 중복되는 장식 요소(WCAG 1.4.11 예외) — 강제 검사 제외

// DARK
add("D", "foreground / background", p(D.foreground), p(D.background));
add("D", "foreground / card", p(D.foreground), p(D.card));
add("D", "muted-foreground / background", p(D.mutedFg), p(D.background));
add("D", "muted-foreground / card", p(D.mutedFg), p(D.card));
add("D", "primary-fg / primary (buttons/banner)", p(D.primaryFg), p(D.primary));
add("D", "secondary-fg / secondary (badge upcoming)", p(D.secondaryFg), p(D.secondary));
add("D", "accent-fg / accent (hover/list)", p(D.accentFg), p(D.accent));
add("D", "gold-fg / gold (medal 1)", p(D.goldFg), p(D.gold));
add("D", "silver-fg / silver (medal 2)", p(D.silverFg), p(D.silver));
add("D", "bronze-fg / bronze (medal 3)", p(D.bronzeFg), p(D.bronze));
add("D", "primary text / primary10-over-bg (ongoing badge)", p(D.primary), tint(D.primary, 0.1, D.background));
add("D", "primary (UI accent) / background", p(D.primary), p(D.background), "ui");

console.log("mode | ratio | min | pass | kind | label");
console.log("-----|-------|-----|------|------|------");
for (const c of checks) {
  console.log(
    `${c.mode}    | ${String(c.ratio).padStart(5)} | ${c.threshold.toFixed(1)} | ${c.pass ? "PASS" : "FAIL"} | ${c.kind.padEnd(4)} | ${c.label}`,
  );
}
const fails = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - fails.length}/${checks.length} passed.`);
if (fails.length) {
  console.log("FAILURES:");
  for (const f of fails) console.log(`  [${f.mode}] ${f.label} = ${f.ratio} (need ${f.threshold})`);
  process.exitCode = 1;
}
