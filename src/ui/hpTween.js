const lastShown = new Map();

export function applyHpFill(fillEl, fighter) {
  const id = fighter.creature.id;
  const max = fighter.creature.maxHp;
  const cur = Math.max(0, fighter.hp);
  const last = lastShown.has(id) ? lastShown.get(id) : cur;
  const lastPct = (last / max) * 100;
  const curPct = (cur / max) * 100;

  fillEl.style.transition = 'none';
  fillEl.style.width = `${lastPct}%`;

  requestAnimationFrame(() => {
    void fillEl.offsetWidth;
    fillEl.style.transition = '';
    fillEl.style.width = `${curPct}%`;
  });

  lastShown.set(id, cur);
}

export function resetHpCache() {
  lastShown.clear();
}
