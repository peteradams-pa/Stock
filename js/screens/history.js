/* ============================================================
   History screen — full movement log
   ============================================================ */

window.Screens = window.Screens || {};

Screens.history = async function (root) {
  const filter = App.state.historyFilter || 'all';
  let movs = App.state.movements;
  if (filter !== 'all') movs = movs.filter(m => m.type === filter);

  const groups = groupByDay(movs);

  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-title-group">
        <p class="topbar-eyebrow">${App.state.movements.length} total entries</p>
        <h1 class="topbar-title">History</h1>
      </div>
    </div>
    <div class="screen-pad">
      <div class="filter-row">
        <button class="filter-chip ${filter === 'all' ? 'active' : ''}" data-f="all">All</button>
        <button class="filter-chip ${filter === 'in' ? 'active' : ''}" data-f="in">Stock In</button>
        <button class="filter-chip ${filter === 'out' ? 'active' : ''}" data-f="out">Stock Out</button>
        <button class="filter-chip ${filter === 'audit-adjust' ? 'active' : ''}" data-f="audit-adjust">Audit adjust</button>
      </div>

      ${groups.length ? groups.map(g => `
        <div class="section-label">${g.label}</div>
        <div class="card" style="padding:8px;">
          ${g.items.map(m => rowFor(m)).join('')}
        </div>
      `).join('') : `
        <div class="empty-state">
          <div class="empty-state-icon">${Icon.history}</div>
          <div class="empty-state-title">No entries</div>
          <div class="empty-state-desc">Movement history for this filter will show up here.</div>
        </div>
      `}
    </div>
  `;

  root.querySelectorAll('[data-f]').forEach(btn => {
    btn.addEventListener('click', () => {
      App.state.historyFilter = btn.dataset.f;
      Screens.history(root);
    });
  });

  root.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', () => Forms.openItemDetail(el.dataset.itemId));
  });
};

function groupByDay(movs) {
  const map = new Map();
  for (const m of movs) {
    const d = new Date(m.createdAt);
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);

  return Array.from(map.entries()).map(([key, items]) => {
    let label;
    if (key === now.toDateString()) label = 'Today';
    else if (key === yesterday.toDateString()) label = 'Yesterday';
    else label = new Date(items[0].createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    return { label, items };
  });
}

function rowFor(m) {
  const item = App.state.items.find(i => i.id === m.itemId);
  const name = item ? item.name : 'Deleted item';
  const isIn = m.type === 'in';
  const isAdjust = m.type === 'audit-adjust';
  const icon = isAdjust ? Icon.audit : (isIn ? Icon.arrowDown : Icon.arrowUp);
  const chipClass = isAdjust ? 'chip-audit' : (isIn ? 'chip-in' : 'chip-out');
  const label = isAdjust ? 'Audit' : (isIn ? 'In' : 'Out');
  const qtyDisplay = isAdjust ? `→ ${m.qty}` : `${isIn ? '+' : '−'}${m.qty}`;
  return `
    <div class="list-item" ${item ? `data-item-id="${item.id}" style="cursor:pointer;"` : ''}>
      <span class="item-icon" style="background:var(--md-surface-3);color:${isAdjust ? 'var(--md-secondary)' : isIn ? 'var(--md-primary)' : 'var(--md-tertiary)'}">${icon}</span>
      <div class="list-item-body">
        <div class="list-item-title" style="display:flex;align-items:center;gap:6px;">
          <span class="chip ${chipClass}" style="padding:2px 8px;flex-shrink:0;">${label}</span>
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escape(name)}</span>
        </div>
        <div class="list-item-sub">${Utils.formatDate(m.createdAt, { timeOnly: true })}${m.reason ? ` · ${Utils.escape(m.reason)}` : ''}${m.ref ? ` · ${Utils.escape(m.ref)}` : ''}</div>
      </div>
      <div class="list-item-trail">
        <div class="list-item-qty" style="font-size:15px;color:${isAdjust ? 'var(--md-secondary)' : isIn ? 'var(--md-primary)' : 'var(--md-tertiary)'}">${qtyDisplay}</div>
      </div>
    </div>
  `;
}
