export const app = () => document.getElementById('app');

// Long-press helper. Holding for 450ms triggers `onLongPress` and suppresses the subsequent click.
// Tap (release before threshold) calls `onTap`. Movement of >12px cancels.
//
// Mobile detail: a real touchend triggers a synthesized mousedown→mouseup→click ~300ms later.
// Without guarding, the same tap fires onTap twice. We track the last touchend timestamp and
// ignore mouse events that fall within ~500ms of a touch, and suppress the synthesized click.
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE = 12;
const POST_TOUCH_GUARD_MS = 500;

export function attachLongPress(elem, onLongPress, onTap) {
  let timer = null;
  let suppressed = false;
  let startX = 0, startY = 0;
  let lastTouchEndAt = 0;

  const start = (e, isTouch) => {
    if (!isTouch && (Date.now() - lastTouchEndAt) < POST_TOUCH_GUARD_MS) return;
    suppressed = false;
    const t = e.touches ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      suppressed = true;
      try { onLongPress(e); } catch (err) { console.error(err); }
    }, LONG_PRESS_MS);
  };
  const move = (e) => {
    if (!timer) return;
    const t = e.touches ? e.touches[0] : e;
    if (Math.abs(t.clientX - startX) > LONG_PRESS_MOVE_TOLERANCE ||
        Math.abs(t.clientY - startY) > LONG_PRESS_MOVE_TOLERANCE) {
      clearTimeout(timer); timer = null;
    }
  };
  const end = (e, isTouch) => {
    if (!isTouch && (Date.now() - lastTouchEndAt) < POST_TOUCH_GUARD_MS) return;
    if (timer) {
      clearTimeout(timer); timer = null;
      if (onTap && !suppressed) onTap(e);
    }
    if (isTouch) lastTouchEndAt = Date.now();
  };
  const cancel = () => { clearTimeout(timer); timer = null; };
  elem.addEventListener('mousedown', (e) => start(e, false));
  elem.addEventListener('mousemove', move);
  elem.addEventListener('mouseup', (e) => end(e, false));
  elem.addEventListener('mouseleave', cancel);
  elem.addEventListener('touchstart', (e) => start(e, true), { passive: true });
  elem.addEventListener('touchmove', move, { passive: true });
  elem.addEventListener('touchend', (e) => {
    if (e.cancelable) e.preventDefault();
    end(e, true);
  });
  elem.addEventListener('touchcancel', cancel);
  elem.addEventListener('click', (e) => {
    if ((Date.now() - lastTouchEndAt) < POST_TOUCH_GUARD_MS) {
      e.preventDefault(); e.stopPropagation();
    }
  });
  elem.addEventListener('contextmenu', (e) => { if (suppressed) e.preventDefault(); });
}

// Lightweight DOM builder. Tag, attribute object, and children (string/number/element/array).
// Supports props: class, onclick, style, html (innerHTML), and arbitrary HTML attributes.
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

// Floating tooltip dismissed on next pointer interaction. Currently unused by other modules
// but retained for parity with the original. (.lp-tooltip has no CSS rule by design.)
let _activeTooltip = null;

export function showTooltip(target, contentEl) {
  hideTooltip();
  const t = el('div', { class: 'lp-tooltip' });
  t.appendChild(contentEl);
  document.body.appendChild(t);
  const r = target.getBoundingClientRect();
  const tw = t.offsetWidth || 200;
  const th = t.offsetHeight || 80;
  let left = r.left + r.width / 2 - tw / 2;
  let top = r.top - th - 8;
  if (top < 8) top = r.bottom + 8;
  left = Math.max(8, Math.min(window.innerWidth - tw - 8, left));
  t.style.left = left + 'px';
  t.style.top = top + 'px';
  _activeTooltip = t;
  setTimeout(() => {
    const dismiss = () => { hideTooltip(); document.removeEventListener('pointerdown', dismiss); };
    document.addEventListener('pointerdown', dismiss, { once: true });
  }, 0);
}

export function hideTooltip() {
  if (_activeTooltip) { _activeTooltip.remove(); _activeTooltip = null; }
}
