export const app = () => document.getElementById('app');

// Legacy compat shim. The new UI uses plain click for selection and a separate
// "info" button or right-click for inspection. attachLongPress is kept as a
// no-op so old callers don't break, but the recommended pattern is direct
// click handlers + a separate inspect affordance.
export function attachLongPress(elem, onLongPress, onTap) {
  if (onTap) elem.addEventListener('click', onTap);
  // Right-click (desktop) opens inspector. Touch users get a long-press fallback.
  if (onLongPress) {
    elem.addEventListener('contextmenu', (e) => { e.preventDefault(); onLongPress(e); });
    // Touch long-press fallback (450ms).
    let timer = null;
    elem.addEventListener('touchstart', (e) => {
      timer = setTimeout(() => { timer = null; onLongPress(e); }, 450);
    }, { passive: true });
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    elem.addEventListener('touchend', cancel);
    elem.addEventListener('touchmove', cancel);
    elem.addEventListener('touchcancel', cancel);
  }
}

// Lightweight DOM builder. Tag, attribute object, children.
export function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'onclick') { if (v) e.addEventListener('click', v); }
    else if (k === 'style') e.setAttribute('style', v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
    else e.appendChild(c);
  }
  return e;
}

export function showTooltip() { /* unused */ }
export function hideTooltip() { /* unused */ }
