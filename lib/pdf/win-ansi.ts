/**
 * pdf-lib's built-in fonts (Helvetica, Times) can only print the Windows-1252
 * character set. Anything else — arrows, check marks, emoji, which AI text and
 * event titles often contain — makes drawText throw and the whole PDF fails.
 * Swap common symbols for close equivalents and leave out whatever is left.
 */
const CP1252_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const REPLACEMENTS: Record<string, string> = {
  "→": "->", "⟶": "->", "➜": "->", "➔": "->", "➝": "->", "⇒": "=>", "←": "<-", "⇐": "<=",
  "↔": "<->", "↑": "^", "↓": "v", "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "∼": "~",
  "✗": "x", "✘": "x", "❌": "x", "★": "*", "☆": "*", "✦": "*", "✱": "*",
  "‐": "-", "‑": "-", "‒": "-", "―": "—", "−": "-", "′": "'", "″": '"', "‧": "·", "∙": "·",
  "◦": "•", "▪": "•", "▫": "•", "●": "•", "○": "•", "■": "•", "□": "•", "►": ">", "▶": ">",
  " ": "\n", " ": "\n",
};

export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of String(text ?? "").normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127) || (code >= 160 && code <= 255) || CP1252_EXTRAS.has(ch)) {
      out += ch;
    } else if (ch in REPLACEMENTS) {
      out += REPLACEMENTS[ch];
    } else if (/\s/u.test(ch)) {
      out += " ";
    } else {
      // Accented letters outside Latin-1 keep their base letter ("ā" → "a");
      // emoji and other symbols are left out.
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (base !== ch && base && Array.from(base).every((c) => (c.codePointAt(0) ?? 999) < 256)) out += base;
    }
  }
  return out;
}
