/**
 * Where does the recipient's name go on a certificate template?
 *
 * Reads page 1's drawing commands with pdf-lib only — no pdf.js and nothing
 * loaded at runtime, so it bundles cleanly for Vercel. It follows the
 * scaling/shifting that design tools such as Canva apply (`cm`), form XObjects
 * and images, and collects:
 *   - text lines: position, size and words (decoded with each font's ToUnicode map)
 *   - rules: long, thin horizontal shapes (the blank line for the name)
 * The name then goes below "presented to / given to / certify that …" (on its
 * rule when there is one), else on the main rule, else in a default band.
 */
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";
import type { PDFContext, PDFObject, PDFPage } from "pdf-lib";

export const NAME_ANCHOR =
  /(given|presented|awarded|conferred|granted|issued)to|certif(y|ies)that|thisistocertify|ipinagkakaloobkay|iginagawadkay/;

export type TextLine = { y: number; size: number; xMin: number; xMax: number; text: string };
export type Rule = { x: number; w: number; y: number; top: number };
export type View = { x0: number; y0: number; width: number; height: number };
export type TemplateLayout = { view: View; lines: TextLine[]; rules: Rule[] };
export type NameSlot = {
  source: string;
  top: number;
  bottom: number;
  cx: number;
  ruleY: number | null;
  maxWidth: number;
};

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** `inner` is applied first, then `outer` (PDF: inner × outer). */
const multiply = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];
const applyMatrix = (m: Matrix, x: number, y: number) =>
  [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

function streamBytes(value: unknown): Uint8Array | null {
  try {
    if (value instanceof PDFRawStream) return decodePDFRawStream(value).decode();
    if (value instanceof PDFStream) {
      const stream = value as PDFStream & { getUnencodedContents?: () => Uint8Array };
      return stream.getUnencodedContents ? stream.getUnencodedContents() : stream.getContents();
    }
  } catch {
    // Undecodable stream: skip it.
  }
  return null;
}

function num(context: PDFContext, value: PDFObject | undefined, fallback: number) {
  const resolved = value === undefined ? undefined : context.lookup(value);
  return resolved instanceof PDFNumber ? resolved.asNumber() : fallback;
}

// ---------------------------------------------------------------------------
// Fonts: byte width of codes, glyph widths and Unicode text
// ---------------------------------------------------------------------------

type FontInfo = {
  twoByte: boolean;
  toUnicode: Map<number, string> | null;
  /** Glyph width in 1/1000 of the font size. */
  width: (code: number) => number;
};

function hexToUnicode(hex: string): string {
  if (hex.length <= 2) return String.fromCharCode(parseInt(hex || "0", 16));
  const padded = hex.length % 4 ? hex.padStart(hex.length + 4 - (hex.length % 4), "0") : hex;
  const units: number[] = [];
  for (let i = 0; i < padded.length; i += 4) units.push(parseInt(padded.slice(i, i + 4), 16));
  return String.fromCharCode(...units);
}

function parseToUnicode(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(m[1], 16), hexToUnicode(m[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g,
    )) {
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 0xffff);
      if (m[3].startsWith("[")) {
        [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((item, k) => {
          if (lo + k <= hi) map.set(lo + k, hexToUnicode(item[1]));
        });
      } else {
        const base = hexToUnicode(m[3].slice(1, -1));
        const head = base.slice(0, -1);
        const last = base.charCodeAt(base.length - 1);
        for (let code = lo; code <= hi; code += 1) {
          map.set(code, head + String.fromCharCode(last + code - lo));
        }
      }
    }
  }
  return map;
}

function loadFont(context: PDFContext, value: PDFObject): FontInfo | null {
  const dict = context.lookup(value);
  if (!(dict instanceof PDFDict)) return null;
  const toUnicodeBytes = streamBytes(context.lookup(dict.get(PDFName.of("ToUnicode"))));
  const toUnicode = toUnicodeBytes ? parseToUnicode(latin1(toUnicodeBytes)) : null;

  if (dict.get(PDFName.of("Subtype")) === PDFName.of("Type0")) {
    const descendants = context.lookup(dict.get(PDFName.of("DescendantFonts")));
    const cid = descendants instanceof PDFArray ? context.lookup(descendants.get(0)) : undefined;
    const cidDict = cid instanceof PDFDict ? cid : undefined;
    const defaultWidth = cidDict ? num(context, cidDict.get(PDFName.of("DW")), 1000) : 1000;
    const single = new Map<number, number>();
    const ranges: Array<[number, number, number]> = [];
    const w = cidDict ? context.lookup(cidDict.get(PDFName.of("W"))) : undefined;
    if (w instanceof PDFArray) {
      let i = 0;
      while (i < w.size()) {
        const first = num(context, w.get(i), Number.NaN);
        if (!Number.isFinite(first)) break;
        const next = context.lookup(w.get(i + 1));
        if (next instanceof PDFArray) {
          for (let k = 0; k < next.size(); k += 1) single.set(first + k, num(context, next.get(k), defaultWidth));
          i += 2;
        } else {
          ranges.push([first, num(context, w.get(i + 1), first), num(context, w.get(i + 2), defaultWidth)]);
          i += 3;
        }
      }
    }
    return {
      twoByte: true,
      toUnicode,
      width: (code) =>
        single.get(code) ?? ranges.find(([a, b]) => code >= a && code <= b)?.[2] ?? defaultWidth,
    };
  }

  const firstChar = num(context, dict.get(PDFName.of("FirstChar")), 0);
  const descriptor = context.lookup(dict.get(PDFName.of("FontDescriptor")));
  const missing = descriptor instanceof PDFDict ? num(context, descriptor.get(PDFName.of("MissingWidth")), 0) : 0;
  const widthsArray = context.lookup(dict.get(PDFName.of("Widths")));
  const widths =
    widthsArray instanceof PDFArray ? widthsArray.asArray().map((v) => num(context, v, missing)) : null;
  return {
    twoByte: false,
    toUnicode,
    // Standard 14 fonts carry no widths: use an average Latin glyph width.
    width: (code) => (widths ? (widths[code - firstChar] ?? missing) : 550),
  };
}

// ---------------------------------------------------------------------------
// Content stream reader
// ---------------------------------------------------------------------------

type Operand = number | boolean | null | { name: string } | { bytes: string } | { dict: true } | Operand[];

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]);
const DELIMITERS = "()<>[]{}/%";
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

class ContentReader {
  private pos = 0;
  private readonly src: string;
  constructor(src: string) {
    this.src = src;
  }

  private skipSpace() {
    const s = this.src;
    while (this.pos < s.length) {
      const c = s.charCodeAt(this.pos);
      if (c === 37 /* % */) {
        while (this.pos < s.length && s[this.pos] !== "\n" && s[this.pos] !== "\r") this.pos += 1;
      } else if (WHITESPACE.has(c)) {
        this.pos += 1;
      } else {
        break;
      }
    }
  }

  private regular(): string {
    const s = this.src;
    const start = this.pos;
    while (this.pos < s.length && !WHITESPACE.has(s.charCodeAt(this.pos)) && !DELIMITERS.includes(s[this.pos])) {
      this.pos += 1;
    }
    return s.slice(start, this.pos);
  }

  private literal(): string {
    const s = this.src;
    this.pos += 1; // (
    let depth = 1;
    let out = "";
    while (this.pos < s.length) {
      const c = s[this.pos++];
      if (c === "\\") {
        const e = s[this.pos++] ?? "";
        if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "\r") {
          if (s[this.pos] === "\n") this.pos += 1;
        } else if (e === "\n") {
          // line continuation
        } else if (/[0-7]/.test(e)) {
          let oct = e;
          while (oct.length < 3 && /[0-7]/.test(s[this.pos] ?? "")) oct += s[this.pos++];
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else {
          out += e;
        }
      } else if (c === "(") {
        depth += 1;
        out += c;
      } else if (c === ")") {
        depth -= 1;
        if (!depth) break;
        out += c;
      } else {
        out += c;
      }
    }
    return out;
  }

  /** Skip inline image data after BI … ID, up to EI. */
  skipInlineImage() {
    for (;;) {
      const token = this.next();
      if (!token || ("op" in token && token.op === "ID")) break;
    }
    const s = this.src;
    let i = this.pos + 1;
    for (;;) {
      i = s.indexOf("EI", i);
      if (i < 0) {
        this.pos = s.length;
        return;
      }
      if (WHITESPACE.has(s.charCodeAt(i - 1)) && (i + 2 >= s.length || WHITESPACE.has(s.charCodeAt(i + 2)))) {
        this.pos = i + 2;
        return;
      }
      i += 2;
    }
  }

  /** Next operand or operator; null at the end of the stream. */
  next(): { op: string } | { value: Operand } | null {
    const s = this.src;
    for (;;) {
      this.skipSpace();
      if (this.pos >= s.length) return null;
      const c = s[this.pos];
      if (c === "[") {
        this.pos += 1;
        const items: Operand[] = [];
        for (;;) {
          this.skipSpace();
          if (this.pos >= s.length) break;
          if (s[this.pos] === "]") {
            this.pos += 1;
            break;
          }
          const token = this.next();
          if (!token) break;
          if ("value" in token) items.push(token.value);
        }
        return { value: items };
      }
      if (c === "<" && s[this.pos + 1] === "<") {
        this.pos += 2;
        for (;;) {
          this.skipSpace();
          if (this.pos >= s.length) break;
          if (s.startsWith(">>", this.pos)) {
            this.pos += 2;
            break;
          }
          if (!this.next()) break;
        }
        return { value: { dict: true } };
      }
      if (c === "<") {
        const end = s.indexOf(">", this.pos);
        const stop = end < 0 ? s.length : end;
        let hex = s.slice(this.pos + 1, stop).replace(/[^0-9a-fA-F]/g, "");
        this.pos = Math.min(s.length, stop + 1);
        if (hex.length % 2) hex += "0";
        let out = "";
        for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        return { value: { bytes: out } };
      }
      if (c === "(") return { value: { bytes: this.literal() } };
      if (c === "/") {
        this.pos += 1;
        return { value: { name: this.regular() } };
      }
      if (DELIMITERS.includes(c)) {
        this.pos += 1; // stray delimiter
        continue;
      }
      const word = this.regular();
      if (NUMBER.test(word)) return { value: Number(word) };
      if (word === "true" || word === "false") return { value: word === "true" };
      if (word === "null") return { value: null };
      return { op: word };
    }
  }
}

// ---------------------------------------------------------------------------
// Page analysis
// ---------------------------------------------------------------------------

type GState = {
  ctm: Matrix;
  font: FontInfo | null;
  fontSize: number;
  charSpace: number;
  wordSpace: number;
  hScale: number;
  leading: number;
  rise: number;
};
type TextItem = { str: string; x: number; y: number; w: number; size: number };

const PATH_END = new Set(["S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n"]);
const MAX_FORM_DEPTH = 12;

/** Text lines and rules on the page, in PDF user space (y grows upward). */
export function analyzeTemplatePage(page: PDFPage): TemplateLayout {
  const context = page.doc.context;
  const box = page.getCropBox();
  const view: View = { x0: box.x, y0: box.y, width: box.width, height: box.height };
  const items: TextItem[] = [];
  const rules: Rule[] = [];
  const fontCache = new Map<PDFObject, FontInfo | null>();
  let budget = 500_000; // operator cap, so a pathological file cannot stall a request

  const getFont = (resources: PDFDict | undefined, name: string) => {
    const fonts = resources ? context.lookup(resources.get(PDFName.of("Font"))) : undefined;
    if (!(fonts instanceof PDFDict)) return null;
    const raw = fonts.get(PDFName.of(name));
    if (!raw) return null;
    if (!fontCache.has(raw)) {
      let info: FontInfo | null = null;
      try {
        info = loadFont(context, raw);
      } catch {
        info = null;
      }
      fontCache.set(raw, info);
    }
    return fontCache.get(raw) ?? null;
  };

  const run = (src: string, resources: PDFDict | undefined, initial: GState, depth: number) => {
    const reader = new ContentReader(src);
    let gs: GState = { ...initial };
    const stack: GState[] = [];
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;
    let path: number[] = [];
    let operands: Operand[] = [];
    const last = (count: number) =>
      operands.slice(-count).map((v) => (typeof v === "number" ? v : 0));

    const addBox = (bx0: number, by0: number, bx1: number, by1: number) => {
      const pts = [
        applyMatrix(gs.ctm, bx0, by0),
        applyMatrix(gs.ctm, bx1, by0),
        applyMatrix(gs.ctm, bx0, by1),
        applyMatrix(gs.ctm, bx1, by1),
      ];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      if (w >= view.width * 0.22 && h <= 6) {
        rules.push({ x: Math.min(...xs), w, y: (Math.max(...ys) + Math.min(...ys)) / 2, top: Math.max(...ys) });
      }
    };

    const nextLine = (tx: number, ty: number) => {
      tlm = multiply(tlm, [1, 0, 0, 1, tx, ty]);
      tm = tlm;
    };

    const showText = (parts: Operand[]) => {
      const font = gs.font;
      const size = gs.fontSize;
      const twoByte = font?.twoByte ?? false;
      const trm = multiply(gs.ctm, multiply(tm, [size * gs.hScale, 0, 0, size, 0, gs.rise]));
      const textToPage = multiply(gs.ctm, tm);
      let advance = 0;
      let str = "";
      for (const part of parts) {
        if (typeof part === "number") {
          advance -= (part / 1000) * size * gs.hScale;
          continue;
        }
        if (!part || typeof part !== "object" || !("bytes" in part)) continue;
        const bytes = part.bytes;
        for (let i = 0; i < bytes.length; i += twoByte ? 2 : 1) {
          const code = twoByte ? (bytes.charCodeAt(i) << 8) | (bytes.charCodeAt(i + 1) || 0) : bytes.charCodeAt(i);
          str += font?.toUnicode?.get(code) ?? (twoByte ? "" : String.fromCharCode(code));
          const w0 = (font ? font.width(code) : 550) / 1000;
          advance += (w0 * size + gs.charSpace + (!twoByte && code === 32 ? gs.wordSpace : 0)) * gs.hScale;
        }
      }
      const [sx, sy] = applyMatrix(textToPage, 0, 0);
      const [ex, ey] = applyMatrix(textToPage, advance, 0);
      tm = multiply(tm, [1, 0, 0, 1, advance, 0]);
      if (str.trim()) {
        items.push({
          str,
          x: trm[4],
          y: trm[5],
          w: Math.hypot(ex - sx, ey - sy),
          size: Math.hypot(trm[2], trm[3]) || 10,
        });
      }
    };

    for (;;) {
      budget -= 1;
      if (budget < 0) break;
      const token = reader.next();
      if (!token) break;
      if ("value" in token) {
        operands.push(token.value);
        continue;
      }
      const top = operands[operands.length - 1];
      switch (token.op) {
        case "q":
          stack.push({ ...gs });
          break;
        case "Q":
          gs = stack.pop() ?? gs;
          break;
        case "cm":
          gs.ctm = multiply(gs.ctm, last(6) as Matrix);
          break;
        case "m":
        case "l":
          path.push(...last(2));
          break;
        case "c":
          path.push(...last(6));
          break;
        case "v":
        case "y":
          path.push(...last(4));
          break;
        case "re": {
          const [x, y, w, h] = last(4);
          path.push(x, y, x + w, y + h);
          break;
        }
        case "BT":
          tm = IDENTITY;
          tlm = IDENTITY;
          break;
        case "Tf": {
          const name = operands[operands.length - 2];
          gs.font = name && typeof name === "object" && "name" in name ? getFont(resources, name.name) : null;
          gs.fontSize = last(1)[0];
          break;
        }
        case "Tc":
          gs.charSpace = last(1)[0];
          break;
        case "Tw":
          gs.wordSpace = last(1)[0];
          break;
        case "Tz":
          gs.hScale = last(1)[0] / 100;
          break;
        case "TL":
          gs.leading = last(1)[0];
          break;
        case "Ts":
          gs.rise = last(1)[0];
          break;
        case "Td": {
          const [tx, ty] = last(2);
          nextLine(tx, ty);
          break;
        }
        case "TD": {
          const [tx, ty] = last(2);
          gs.leading = -ty;
          nextLine(tx, ty);
          break;
        }
        case "Tm":
          tlm = last(6) as Matrix;
          tm = tlm;
          break;
        case "T*":
          nextLine(0, -gs.leading);
          break;
        case "Tj":
          showText([top]);
          break;
        case "TJ":
          showText(Array.isArray(top) ? top : []);
          break;
        case "'":
          nextLine(0, -gs.leading);
          showText([top]);
          break;
        case '"': {
          const [aw, ac] = last(3);
          gs.wordSpace = aw;
          gs.charSpace = ac;
          nextLine(0, -gs.leading);
          showText([top]);
          break;
        }
        case "Do": {
          if (!top || typeof top !== "object" || !("name" in top)) break;
          const xobjects = resources ? context.lookup(resources.get(PDFName.of("XObject"))) : undefined;
          if (!(xobjects instanceof PDFDict)) break;
          const xobject = context.lookup(xobjects.get(PDFName.of(top.name)));
          if (!(xobject instanceof PDFStream)) break;
          const subtype = xobject.dict.get(PDFName.of("Subtype"));
          if (subtype === PDFName.of("Image")) {
            addBox(0, 0, 1, 1);
          } else if (subtype === PDFName.of("Form") && depth < MAX_FORM_DEPTH) {
            const bytes = streamBytes(xobject);
            if (!bytes) break;
            const matrixArray = context.lookup(xobject.dict.get(PDFName.of("Matrix")));
            const matrix =
              matrixArray instanceof PDFArray && matrixArray.size() === 6
                ? (matrixArray.asArray().map((v) => num(context, v, 0)) as Matrix)
                : IDENTITY;
            const formResources = context.lookup(xobject.dict.get(PDFName.of("Resources")));
            run(
              latin1(bytes),
              formResources instanceof PDFDict ? formResources : resources,
              { ...gs, ctm: multiply(gs.ctm, matrix) },
              depth + 1,
            );
          }
          break;
        }
        case "BI":
          reader.skipInlineImage();
          addBox(0, 0, 1, 1);
          break;
        default:
          if (PATH_END.has(token.op)) {
            if (path.length >= 2) {
              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              for (let i = 0; i + 1 < path.length; i += 2) {
                minX = Math.min(minX, path[i]);
                maxX = Math.max(maxX, path[i]);
                minY = Math.min(minY, path[i + 1]);
                maxY = Math.max(maxY, path[i + 1]);
              }
              addBox(minX, minY, maxX, maxY);
            }
            path = [];
          }
      }
      operands = [];
    }
  };

  const contents = context.lookup(page.node.get(PDFName.of("Contents")));
  const streams = contents instanceof PDFArray ? contents.asArray().map((v) => context.lookup(v)) : [contents];
  const src = streams
    .map((stream) => {
      const bytes = streamBytes(stream);
      return bytes ? latin1(bytes) : "";
    })
    .join("\n");
  run(
    src,
    page.node.Resources(),
    { ctm: IDENTITY, font: null, fontSize: 0, charSpace: 0, wordSpace: 0, hScale: 1, leading: 0, rise: 0 },
    0,
  );

  // Text lines: group fragments that share a baseline.
  const sorted = items.sort((a, b) => b.y - a.y || a.x - b.x);
  const grouped: Array<TextLine & { parts: TextItem[] }> = [];
  for (const item of sorted) {
    const line = grouped.find((l) => Math.abs(l.y - item.y) < Math.max(2, Math.min(l.size, item.size) * 0.45));
    if (line) {
      line.parts.push(item);
      line.size = Math.max(line.size, item.size);
      line.xMin = Math.min(line.xMin, item.x);
      line.xMax = Math.max(line.xMax, item.x + item.w);
    } else {
      grouped.push({ y: item.y, size: item.size, xMin: item.x, xMax: item.x + item.w, text: "", parts: [item] });
    }
  }
  const lines: TextLine[] = grouped.map(({ parts, ...line }) => ({
    ...line,
    text: parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.str)
      .join(" ")
      .normalize("NFKC"),
  }));

  return { view, lines, rules };
}

/** Pick the name's box from the page layout. */
export function planNameSlot(layout: TemplateLayout): NameSlot {
  const { view, lines, rules } = layout;
  const anchor = lines.find(
    (l) => NAME_ANCHOR.test(l.text.toLowerCase().replace(/[^a-zñ]/g, "")) && l.y > view.y0 + view.height * 0.3,
  );
  if (anchor) {
    const below = lines.filter((l) => l.y < anchor.y - anchor.size * 0.6).sort((a, b) => b.y - a.y)[0];
    const top = anchor.y - anchor.size * 0.35;
    const bottom = below
      ? below.y + below.size * 0.8
      : Math.max(view.y0 + view.height * 0.3, anchor.y - view.height * 0.22);
    const cx = (anchor.xMin + anchor.xMax) / 2;
    const rule = rules
      .filter((r) => r.y < top - 4 && r.y > bottom - 2 && r.x < cx && r.x + r.w > cx)
      .sort((a, b) => a.y - b.y)[0];
    return {
      source: rule ? "anchor+rule" : "anchor-gap",
      top,
      bottom,
      cx: rule ? rule.x + rule.w / 2 : cx,
      ruleY: rule ? rule.top : null,
      maxWidth: Math.max(rule ? rule.w * 1.08 : 0, view.width * 0.7),
    };
  }
  const band = rules
    .filter((r) => r.y > view.y0 + view.height * 0.35 && r.y < view.y0 + view.height * 0.75)
    .sort((a, b) => b.w - a.w)[0];
  if (band) {
    return {
      source: "rule",
      top: band.top + view.height * 0.12,
      bottom: band.top,
      cx: band.x + band.w / 2,
      ruleY: band.top,
      maxWidth: Math.max(band.w * 1.08, view.width * 0.7),
    };
  }
  const mid = view.y0 + view.height * 0.55;
  return {
    source: "default",
    top: mid + view.height * 0.08,
    bottom: mid - view.height * 0.04,
    cx: view.x0 + view.width / 2,
    ruleY: null,
    maxWidth: view.width * 0.6,
  };
}
