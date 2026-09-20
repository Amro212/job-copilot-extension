// Shared by the Shadow DOM panel and the packaged extension pages.
export const VISUAL_NAME = 'Kareer';
export const TOKENS = `
  --kr-bg-0: #080B10;
  --kr-bg-1: #0D1117;
  --kr-bg-2: #131922;
  --kr-bg-3: #1A222D;
  --kr-line: #26303D;
  --kr-line-strong: #344152;
  --kr-text-1: #F2F5F7;
  --kr-text-2: #A8B2BF;
  --kr-text-3: #8995A5;
  --kr-signal: #A3E635;
  --kr-signal-hover: #B5F04A;
  --kr-signal-dim: rgba(163,230,53,.10);
  --kr-info: #62C8FF;
  --kr-success: #52D98C;
  --kr-warning: #F2B84B;
  --kr-danger: #F06A6A;
  --kr-radius-xs: 4px;
  --kr-radius-sm: 6px;
  --kr-radius-md: 8px;
  --kr-radius-lg: 10px;
  --kr-radius-round: 999px;
  --kr-space-1: 4px;
  --kr-space-2: 8px;
  --kr-space-3: 12px;
  --kr-space-4: 16px;
  --kr-space-6: 24px;
  --kr-font: 'Kareer Geist', sans-serif;
  --kr-font-mono: 'Kareer Geist Mono', monospace;
`;

export const FONT_FILES = [
  ['Kareer Geist', 'Geist-Variable.woff2'],
  ['Kareer Geist Mono', 'GeistMono-Variable.woff2'],
];

export function fontFaceCSS(source) {
  return FONT_FILES.map(([family, file]) => `@font-face {
    font-family: '${family}'; src: url('${source(file)}') format('woff2');
    font-style: normal; font-weight: 100 900; font-display: swap;
  }`).join('\n');
}

let fontsInstalled = false;
export function installPanelFonts() {
  if (fontsInstalled || typeof FontFace === 'undefined' || !document.fonts) return;
  if (typeof __UI_FONTS__ === 'undefined') return;
  fontsInstalled = true;
  // Binary FontFace sources work across Shadow DOM boundaries without a remote
  // request or dependence on the host page's font-src policy. Bytes are bundled.
  for (const [family, file] of FONT_FILES) {
    const bytes = Uint8Array.from(atob(__UI_FONTS__[file]), ch => ch.charCodeAt(0));
    const face = new FontFace(family, bytes, { weight: '100 900', style: 'normal', display: 'swap' });
    document.fonts.add(face);
    void face.load().catch(() => {});
  }
}
