// Document-horror text utilities. The aesthetic uses two corruption techniques:
//   - strikethrough/overwrite: a word is written, struck through, replaced
//   - redaction: a word is covered with a red bar (used sparingly, on the most
//     charged words; imagination fills in worse than any specific word would)
// Both render as DOM strings via the el helper or as raw HTML.

import { el } from './dom.js';

// strike(badWord, goodWord) → "<s>badWord</s> goodWord" inline element.
// Use for emotionally specific corrections — the document editing itself.
export function strike(badWord, goodWord) {
  return el('span', { class: 'strike-pair' }, [
    el('s', {}, badWord),
    ' ',
    el('span', {}, goodWord),
  ]);
}

// redact(width) → opaque red bar. Width is char count; bar matches that width
// in monospace ems so it sits inline with surrounding text. Used on the most
// charged words.
export function redact(width = 6) {
  const w = Math.max(1, Math.round(width));
  return el('span', { class: 'redact', style: `width:${w}ch;` }, ' ');
}

// gold(word) → tonal-wrongness accent. Reserved for small charged words inside
// body text — never headlines, never the largest font on screen. The point is
// that the player notices it and wonders why.
export function gold(word) {
  return el('span', { class: 'doc-gold' }, word);
}

// HTML-string variants for places where DOM construction goes through
// innerHTML or template strings rather than the el helper.
export function strikeHTML(badWord, goodWord) {
  return `<s>${escapeHtml(badWord)}</s> ${escapeHtml(goodWord)}`;
}
export function redactHTML(width = 6) {
  const w = Math.max(1, Math.round(width));
  return `<span class="redact" style="width:${w}ch;"> </span>`;
}
export function goldHTML(word) {
  return `<span class="doc-gold">${escapeHtml(word)}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Parses authored prose with inline corruption markup into HTML:
//   ~~text~~  → <s>text</s>            double-strike
//   [[N]]     → red bar of N chars     redaction
//   **text**  → gold accent             (rare, on charged words)
//   !!text!!  → blood-red text          (common, on warnings / refusals /
//                                        body confessions / institutional cold)
// Authors write field notes / passive prose in this syntax in the JSON.
export function parseProse(input) {
  if (input == null) return '';
  let s = escapeHtml(String(input));
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/\[\[(\d+)\]\]/g, (_, n) => `<span class="redact" style="width:${Math.max(1, +n)}ch;"> </span>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<span class="doc-gold">$1</span>');
  s = s.replace(/!!([^!]+)!!/g, '<span class="doc-blood-text">$1</span>');
  return s;
}

// Convenience: emit a span whose innerHTML is the parsed prose.
export function proseEl(input, tag = 'span', cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = parseProse(input);
  return e;
}
