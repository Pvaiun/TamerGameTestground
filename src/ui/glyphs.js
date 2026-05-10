// Renders a 16x16 hand-authored bitmap glyph as an SVG.
// Each source pixel becomes a 2x2 SVG cell; intrinsic SVG size is 32x32 with
// shape-rendering:crispEdges. Display scale is controlled by CSS width/height.
// Color is currentColor so callers can tint via CSS (default: --ink-100).

import { GLYPHS } from '../data.js';

const CELL = 2;
const GRID = 16;
const SVG_SIZE = GRID * CELL;

export function renderGlyph(speciesName) {
  const rows = GLYPHS && GLYPHS[speciesName];
  if (!rows) return placeholderSvg();
  let rects = '';
  for (let y = 0; y < GRID; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < GRID; x++) {
      if (row[x] === '#') {
        rects += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" fill="currentColor">${rects}</svg>`;
}

export function hasGlyph(speciesName) {
  return !!(GLYPHS && GLYPHS[speciesName]);
}

function placeholderSvg() {
  // a single asymmetric mark — used when a creature lacks a glyph entry
  return `<svg viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" fill="currentColor">` +
    `<rect x="14" y="12" width="2" height="2"/>` +
    `<rect x="16" y="14" width="2" height="2"/>` +
    `<rect x="14" y="16" width="2" height="2"/>` +
    `<rect x="18" y="18" width="2" height="2"/>` +
    `</svg>`;
}
