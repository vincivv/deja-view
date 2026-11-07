// Generates fake but realistic-looking web page screenshots as SVG data URLs
// for the mock API. Each render also returns element boxes so mock changes,
// noise rects and pixel-diff regions line up with what is drawn.
import type { Rect } from "./types";

export type PageKind = "home" | "products" | "product" | "cart" | "about" | "generic";

export interface Variant {
  v2: boolean; // planted regressions on
  clock: string; // dynamic content (noise)
  slide: number; // rotating testimonial (noise)
  title?: string; // generic page title
}

export interface Rendered {
  url: string;
  width: number;
  height: number;
  boxes: Record<string, Rect>;
  /** every drawn element, used to simulate naive pixel diffs */
  els: { r: Rect; key?: string }[];
  /** small text runs that tend to anti-alias differently (noise) */
  aa: Rect[];
}

const CTA_V1 = "#333333";
const CTA_V2 = "#e00000";
export const CTA_COLORS = { v1: CTA_V1, v2: CTA_V2 };

export const ABOUT_TEXT = {
  v1: "Acme was founded in 2012 by two friends in Portland who wanted everyday clothes that last. We work with small mills, pay fair wages and repair anything we sell, for life.",
  v2: "Acme was founded in 2011 by two friends in Portland, Oregon, who wanted everyday clothes that last — and now ships to over 40 countries. We work with small mills, pay fair wages and repair anything we sell, for life.",
};

const QUOTES = [
  ["“The linen shirt is the best thing I own.”", "Maya R. — Seattle"],
  ["“Shipping was fast and the fit is perfect.”", "Jonas K. — Berlin"],
  ["“They repaired my jacket for free. Lifelong fan.”", "Priya S. — London"],
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

class Doc {
  parts: string[] = [];
  boxes: Record<string, Rect> = {};
  els: { r: Rect; key?: string }[] = [];
  aa: Rect[] = [];
  rand: () => number;
  constructor(public W: number, seed: number) {
    this.rand = rng(seed);
  }
  rec(x: number, y: number, w: number, h: number, key?: string) {
    const r: Rect = [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)];
    this.els.push({ r, key });
    if (key) this.boxes[key] = r;
    return r;
  }
  rect(x: number, y: number, w: number, h: number, fill: string, rx = 0, extra = "") {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`);
  }
  text(x: number, y: number, s: string, size: number, weight = 400, fill = "#111", anchor = "start", track = 0) {
    this.parts.push(
      `<text x="${x}" y="${y}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${track}">${esc(s)}</text>`,
    );
  }
  bars(x: number, y: number, w: number, n: number, lineH = 22, color = "#d9d6d0", key?: string) {
    for (let i = 0; i < n; i++) {
      const lw = i === n - 1 ? w * (0.45 + this.rand() * 0.3) : w * (0.85 + this.rand() * 0.15);
      this.rect(x, y + i * lineH, Math.round(lw), 10, color, 5);
    }
    this.rec(x, y, w, n * lineH - 12, key);
    if (this.rand() > 0.2) this.aa.push([Math.round(x + w * 0.3), y, Math.round(x + w * 0.3 + 18), y + 10]);
    return n * lineH;
  }
  image(x: number, y: number, w: number, h: number, hue: number, key?: string, rx = 10) {
    const id = `g${this.parts.length}`;
    this.parts.push(
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,78%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},40%,58%)"/></linearGradient></defs>`,
    );
    this.rect(x, y, w, h, `url(#${id})`, rx);
    // simple product silhouette
    const cx = x + w / 2;
    const cy = y + h / 2;
    const s = Math.min(w, h) * 0.28;
    this.parts.push(
      `<path d="M${cx - s} ${cy - s * 0.6} L${cx - s * 0.35} ${cy - s} L${cx + s * 0.35} ${cy - s} L${cx + s} ${cy - s * 0.6} L${cx + s * 0.75} ${cy - s * 0.15} L${cx + s * 0.5} ${cy - s * 0.3} L${cx + s * 0.5} ${cy + s} L${cx - s * 0.5} ${cy + s} L${cx - s * 0.5} ${cy - s * 0.3} L${cx - s * 0.75} ${cy - s * 0.15} Z" fill="rgba(255,255,255,0.55)"/>`,
    );
    this.rec(x, y, w, h, key);
  }
  button(x: number, y: number, w: number, h: number, label: string, fill: string, key?: string, fg = "#fff") {
    this.rect(x, y, w, h, fill, 8);
    this.text(x + w / 2, y + h / 2 + 5, label, 15, 600, fg, "middle");
    this.rec(x, y, w, h, key);
  }
}

const PRODUCTS = [
  ["Linen Shirt", "$68"],
  ["Canvas Tote", "$32"],
  ["Wool Beanie", "$28"],
  ["Chore Jacket", "$148"],
  ["Selvedge Jeans", "$120"],
  ["Merino Tee", "$54"],
  ["Field Socks", "$18"],
  ["Rain Shell", "$190"],
  ["Cord Trousers", "$98"],
  ["Knit Sweater", "$132"],
  ["Cap", "$30"],
  ["Overshirt", "$110"],
];

function header(d: Doc, v: Variant, mobile: boolean, margin: number) {
  const W = d.W;
  d.rect(0, 0, W, 36, "#141414");
  d.text(W / 2, 23, "Free shipping on orders over $75 · Easy 60-day returns", 12, 500, "#e7e5e4", "middle");
  d.rec(W / 2 - 180, 10, 360, 16);
  d.rect(0, 36, W, 64, "#ffffff");
  d.rect(0, 99, W, 1, "#e7e5e4");
  d.text(margin, 76, "acme", 26, 800, "#111", "start", -1);
  d.rec(margin, 52, 70, 30);
  if (!mobile) {
    ["Shop", "Collections", "Journal", "About"].forEach((n, i) => {
      d.text(margin + 160 + i * 110, 74, n, 15, 500, "#333");
      d.rec(margin + 160 + i * 110, 60, 80, 18);
    });
  }
  // live clock (dynamic content -> noise)
  const cw = 92;
  const cx = W - margin - (mobile ? 40 : 60) - cw;
  d.rect(cx, 54, cw, 28, "#f4f4f5", 14);
  d.text(cx + cw / 2, 73, v.clock, 13, 600, "#52525b", "middle");
  d.rec(cx, 54, cw, 28, "clock");
  d.rect(W - margin - 28, 56, 26, 24, "#111", 6);
  d.rec(W - margin - 28, 56, 26, 24);
  return 100;
}

function footer(d: Doc, y: number, mobile: boolean, margin: number) {
  const W = d.W;
  const h = mobile ? 420 : 300;
  d.rect(0, y, W, h, "#141414");
  const cols = mobile ? 2 : 4;
  const cw = (W - margin * 2) / cols;
  for (let i = 0; i < 4; i++) {
    const cx = margin + (i % cols) * cw;
    const cy = y + 48 + Math.floor(i / cols) * 170;
    d.text(cx, cy, ["Shop", "Help", "Company", "Follow"][i], 14, 600, "#fafaf9");
    d.bars(cx, cy + 22, cw * 0.6, 4, 24, "#3f3f46");
  }
  d.text(margin, y + h - 32, "© 2026 Acme Goods Co.", 12, 400, "#a1a1aa");
  d.rec(margin, y + h - 44, 140, 14);
  return h;
}

function productGrid(d: Doc, y: number, cols: number, rows: number, margin: number, offset = 0) {
  const gap = cols > 2 ? 24 : 12;
  const cw = (d.W - margin * 2 - gap * (cols - 1)) / cols;
  const ch = cw + 70;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c + offset) % PRODUCTS.length;
      const x = margin + c * (cw + gap);
      const yy = y + r * (ch + gap);
      d.image(x, yy, cw, cw, (i * 47) % 360);
      d.text(x, yy + cw + 26, PRODUCTS[i][0], 15, 600, "#111");
      d.text(x, yy + cw + 48, PRODUCTS[i][1], 14, 400, "#57534e");
      d.rec(x, yy + cw + 12, cw * 0.7, 40);
    }
  }
  return rows * (ch + gap);
}

function sectionTitle(d: Doc, y: number, margin: number, title: string, mobile: boolean) {
  d.text(margin, y + 32, title, mobile ? 22 : 28, 700, "#111", "start", -0.5);
  d.rec(margin, y + 8, title.length * (mobile ? 12 : 15), 32);
  return 64;
}

export function renderPage(kind: PageKind, width: number, v: Variant, seed = 1): Rendered {
  const mobile = width < 700;
  const d = new Doc(width, seed * 31 + width);
  const margin = mobile ? 16 : Math.max(32, (width - 1120) / 2);
  const inner = width - margin * 2;
  const cta = v.v2 ? CTA_V2 : CTA_V1;
  let y = header(d, v, mobile, margin);

  if (kind === "home" || kind === "generic") {
    const heroH = mobile ? 620 : 540;
    d.rect(0, y, width, heroH, "#f5f3ef");
    const tx = margin;
    const ty = y + (mobile ? 48 : 96);
    d.text(tx, ty, kind === "generic" ? "WELCOME" : "NEW SEASON", 12, 700, "#a16207", "start", 2);
    d.rec(tx, ty - 12, 110, 14);
    const h1 = kind === "generic" ? [v.title ?? "Home", "made simple."] : ["Summer sale —", "up to 40% off"];
    h1.forEach((l, i) => d.text(tx, ty + 56 + i * (mobile ? 46 : 64), l, mobile ? 40 : 56, 800, "#111", "start", -1.5));
    d.rec(tx, ty + 14, mobile ? 300 : 460, mobile ? 100 : 130);
    const py = ty + (mobile ? 140 : 190);
    d.bars(tx, py, mobile ? inner : 440, 3, 24, "#cfcac2");
    const by = py + 96;
    d.button(tx, by, 190, 52, kind === "generic" ? "Get started" : "Shop the sale", cta, "cta");
    d.text(tx + 214, by + 31, "View lookbook →", 15, 600, "#111");
    d.rec(tx + 214, by + 16, 130, 20);
    if (mobile) d.image(margin, by + 80, inner, 200, 28);
    else d.image(margin + inner - 520, y + 70, 520, 400, 28, undefined, 16);
    y += heroH + 64;

    y += sectionTitle(d, y, margin, "Featured products", mobile);
    y += productGrid(d, y, mobile ? 2 : 4, 2, margin) + 40;

    // rotating testimonial carousel (dynamic content -> noise)
    const ch = 240;
    d.rect(0, y, width, ch, "#1c1917");
    const q = QUOTES[v.slide % QUOTES.length];
    d.text(width / 2, y + 104, q[0], mobile ? 18 : 26, 600, "#fafaf9", "middle");
    d.text(width / 2, y + 144, q[1], 14, 400, "#a8a29e", "middle");
    for (let i = 0; i < 3; i++) d.rect(width / 2 - 30 + i * 24, y + 184, 12, 12, i === v.slide % 3 ? "#fafaf9" : "#57534e", 6);
    d.rec(0, y, width, ch, "carousel");
    y += ch + 64;

    y += sectionTitle(d, y, margin, "From the journal", mobile);
    const jc = mobile ? 1 : 3;
    const jw = (inner - (jc - 1) * 24) / jc;
    for (let i = 0; i < 3; i++) {
      const x = mobile ? margin : margin + i * (jw + 24);
      const yy = mobile ? y + i * 330 : y;
      d.image(x, yy, jw, 200, 160 + i * 50);
      d.text(x, yy + 232, ["How we pick our mills", "A guide to linen care", "Repair, don't replace"][i], 17, 700, "#111");
      d.rec(x, yy + 214, jw * 0.8, 24);
      d.bars(x, yy + 252, jw, 2, 22);
    }
    y += (mobile ? 3 * 330 : 330) + 40;

    // newsletter
    d.rect(margin, y, inner, 180, "#f5f3ef", 16);
    d.text(margin + 32, y + 64, "Get 10% off your first order", mobile ? 18 : 24, 700, "#111");
    d.rec(margin + 32, y + 40, 330, 30);
    d.rect(margin + 32, y + 96, mobile ? inner - 64 : 360, 48, "#fff", 8, `stroke="#d6d3d1"`);
    d.rec(margin + 32, y + 96, mobile ? inner - 64 : 360, 48);
    if (!mobile) d.button(margin + 408, y + 96, 140, 48, "Subscribe", "#111");
    y += 180 + 72;
  }

  if (kind === "products") {
    y += 40;
    d.text(margin, y + 40, "All products", mobile ? 30 : 44, 800, "#111", "start", -1);
    d.rec(margin, y + 4, 300, 46);
    d.text(margin, y + 76, "48 items", 14, 400, "#78716c");
    d.rec(margin, y + 62, 70, 18);
    y += 104;
    ["All", "Shirts", "Outerwear", "Knitwear", "Accessories"].slice(0, mobile ? 3 : 5).forEach((c, i) => {
      const x = margin + i * 120;
      d.rect(x, y, 108, 36, i === 0 ? "#111" : "#f5f5f4", 18);
      d.text(x + 54, y + 23, c, 13, 600, i === 0 ? "#fff" : "#44403c", "middle");
      d.rec(x, y, 108, 36);
    });
    y += 68;
    y += productGrid(d, y, mobile ? 2 : 4, mobile ? 5 : 3, margin, 2) + 24;
    d.button(width / 2 - 100, y, 200, 52, "Load more", cta, "cta");
    y += 52 + 96;
  }

  if (kind === "product") {
    y += 28;
    d.text(margin, y + 16, "Shop / Shirts / Linen Shirt", 13, 400, "#78716c");
    d.rec(margin, y + 4, 200, 16);
    y += 48;
    const gw = mobile ? inner : 560;
    d.image(margin, y, gw, gw, 18, "gallery", 14);
    const tw = (gw - 3 * 12) / 4;
    for (let i = 0; i < 4; i++) {
      const x = margin + i * (tw + 12);
      if (v.v2 && i === 2) continue; // planted regression: thumbnail no longer rendered
      d.image(x, y + gw + 16, tw, tw, 18 + i * 25, `thumb${i + 1}`, 8);
    }
    // stable box for the missing thumbnail position (used for base_bbox)
    if (!d.boxes.thumb3) d.boxes.thumb3_slot = [Math.round(margin + 2 * (tw + 12)), Math.round(y + gw + 16), Math.round(margin + 2 * (tw + 12) + tw), Math.round(y + gw + 16 + tw)];
    let ry = mobile ? y + gw + tw + 56 : y;
    const rx = mobile ? margin : margin + gw + 56;
    const rw = mobile ? inner : inner - gw - 56;
    d.text(rx, ry + 36, "Linen Shirt", mobile ? 30 : 40, 800, "#111", "start", -1);
    d.rec(rx, ry, 260, 46);
    d.text(rx, ry + 76, "$68", 22, 600, "#111");
    d.rec(rx, ry + 56, 60, 26);
    d.text(rx + 80, ry + 76, "★★★★★  212 reviews", 14, 500, "#a16207");
    d.rec(rx + 80, ry + 62, 160, 18);
    ry += 108;
    ry += d.bars(rx, ry, rw, 4, 24) + 16;
    ["XS", "S", "M", "L", "XL"].forEach((s, i) => {
      d.rect(rx + i * 56, ry, 48, 40, i === 2 ? "#111" : "#fff", 8, `stroke="#d6d3d1"`);
      d.text(rx + i * 56 + 24, ry + 25, s, 13, 600, i === 2 ? "#fff" : "#111", "middle");
      d.rec(rx + i * 56, ry, 48, 40);
    });
    ry += 64;
    d.button(rx, ry, mobile ? inner : 320, 56, "Add to cart", cta, "cta");
    ry += 88;
    ["Details", "Materials & care", "Shipping & returns"].forEach((t) => {
      d.rect(rx, ry, rw, 1, "#e7e5e4");
      d.text(rx, ry + 34, t, 15, 600, "#111");
      d.rec(rx, ry + 16, 180, 22);
      ry += 56;
    });
    ry += d.bars(rx, ry, rw, 5, 24);
    y = Math.max(y + gw + tw + 64, ry + 40) + 40;
    y += sectionTitle(d, y, margin, "You may also like", mobile);
    y += productGrid(d, y, mobile ? 2 : 4, 1, margin, 5) + 72;
  }

  if (kind === "cart") {
    y += 40;
    d.text(margin, y + 40, "Your cart", mobile ? 30 : 44, 800, "#111", "start", -1);
    d.rec(margin, y + 4, 240, 46);
    y += 96;
    const lw = mobile ? inner : inner - 400;
    for (let i = 0; i < 3; i++) {
      d.rect(margin, y, lw, 1, "#e7e5e4");
      d.image(margin, y + 24, 120, 120, i * 60 + 18, undefined, 8);
      d.text(margin + 144, y + 52, PRODUCTS[i][0], 17, 600, "#111");
      d.rec(margin + 144, y + 36, 140, 22);
      d.bars(margin + 144, y + 72, Math.min(260, lw - 200), 2, 22);
      d.text(margin + lw, y + 52, PRODUCTS[i][1], 17, 600, "#111", "end");
      d.rec(margin + lw - 50, y + 36, 50, 22);
      y += 168;
    }
    const sx = mobile ? margin : margin + inner - 360;
    const sy = mobile ? y + 16 : y - 3 * 168;
    d.rect(sx, sy, 360 > inner ? inner : 360, 300, "#f5f3ef", 14);
    d.text(sx + 28, sy + 48, "Order summary", 18, 700, "#111");
    d.rec(sx + 28, sy + 28, 160, 24);
    d.bars(sx + 28, sy + 76, 300 > inner - 56 ? inner - 56 : 300, 4, 28);
    d.button(sx + 28, sy + 210, (360 > inner ? inner : 360) - 56, 52, "Checkout", "#111");
    y = (mobile ? sy + 300 : Math.max(y, sy + 300)) + 96;
  }

  if (kind === "about") {
    y += 64;
    d.text(margin, y + 48, "Our story", mobile ? 36 : 56, 800, "#111", "start", -1.5);
    d.rec(margin, y, 320, 60);
    y += 96;
    const text = v.v2 ? ABOUT_TEXT.v2 : ABOUT_TEXT.v1;
    const maxW = mobile ? inner : 760;
    const lines = wrap(text, Math.floor(maxW / (mobile ? 9.4 : 10.6)));
    const lh = mobile ? 30 : 34;
    lines.forEach((l, i) => d.text(margin, y + 24 + i * lh, l, mobile ? 17 : 20, 400, "#292524"));
    d.rec(margin, y, maxW, lines.length * lh + 6, "aboutText");
    y += lines.length * lh + 56;
    d.image(margin, y, inner, mobile ? 220 : 420, 95, "aboutImage", 16);
    y += (mobile ? 220 : 420) + 64;
    const vc = mobile ? 1 : 3;
    const vw = (inner - (vc - 1) * 32) / vc;
    ["Made to last", "Fair by default", "Repair for life"].forEach((t, i) => {
      const x = mobile ? margin : margin + i * (vw + 32);
      const yy = mobile ? y + i * 150 : y;
      d.rect(x, yy, 44, 44, "#f5f3ef", 22);
      d.rec(x, yy, 44, 44);
      d.text(x, yy + 76, t, 19, 700, "#111");
      d.rec(x, yy + 56, 180, 26);
      d.bars(x, yy + 96, vw, 2, 22);
    });
    y += (mobile ? 450 : 170) + 48;
    y += sectionTitle(d, y, margin, "The team", mobile);
    const tc = mobile ? 2 : 4;
    const tw = (inner - (tc - 1) * 24) / tc;
    for (let i = 0; i < 4; i++) {
      const x = margin + (i % tc) * (tw + 24);
      const yy = y + Math.floor(i / tc) * (tw + 90);
      d.image(x, yy, tw, tw, 200 + i * 30, undefined, tw / 2);
      d.text(x + tw / 2, yy + tw + 30, ["Ana Ruiz", "Ben Okafor", "Chen Wei", "Dana Holm"][i], 15, 600, "#111", "middle");
      d.rec(x + tw / 2 - 50, yy + tw + 14, 100, 22);
    }
    y += Math.ceil(4 / tc) * (tw + 90) + 56;
  }

  y += footer(d, y, mobile, margin);
  const height = Math.round(y);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/>${d.parts.join("")}</svg>`;
  return {
    url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
    width,
    height,
    boxes: d.boxes,
    els: d.els,
    aa: d.aa,
  };
}

/** Transparent overlay image with red pixel-diff regions (like a naive diff tool's output). */
export function renderOverlay(width: number, height: number, regions: Rect[]): string {
  const rects = regions
    .map(([x1, y1, x2, y2]) => `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="rgba(255,0,80,0.45)"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
