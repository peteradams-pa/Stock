/* ============================================================
   Dashboard screen
   ============================================================ */

window.Screens = window.Screens || {};

Screens.dashboard = async function (root) {
  const stats = await StockDB.Items.stats();
  const todayMovs = await StockDB.Movements.statsToday();
  const lowStock = await StockDB.Items.lowStock();
  const recentMovs = App.state.movements.slice(0, 6);
  const activeAudits = App.state.audits.filter(a => a.status === 'in-progress');

  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-title-group">
        <p class="topbar-eyebrow">${greeting()}</p>
        <h1 class="topbar-title">Overview</h1>
      </div>
      <button class="icon-btn" id="btn-notif">${Icon.bell}</button>
    </div>
    <div class="screen-pad">

      <div class="kpi-grid">
        <div class="kpi-card accent-primary">
          <p class="kpi-value">${stats.totalUnits.toLocaleString()}</p>
          <p class="kpi-label">Total units on hand</p>
          <p class="kpi-sub" style="color:var(--md-on-primary-container);opacity:.7">${stats.skuCount} SKUs tracked</p>
        </div>
        <div class="kpi-card accent-secondary">
          <p class="kpi-value">${todayMovs.count}</p>
          <p class="kpi-label">Movements today</p>
          <p class="kpi-sub" style="color:var(--md-on-secondary-container);opacity:.7">+${todayMovs.inQty} in · −${todayMovs.outQty} out</p>
        </div>
      </div>

      <div class="section-label">Quick actions</div>
      <div class="action-grid">
        <button class="action-tile in" data-act="stock-in">
          <span class="action-tile-icon">${Icon.arrowDown}</span>
          <span class="action-tile-label">Stock In</span>
        </button>
        <button class="action-tile out" data-act="stock-out">
          <span class="action-tile-icon">${Icon.arrowUp}</span>
          <span class="action-tile-label">Stock Out</span>
        </button>
        <button class="action-tile audit" data-act="new-audit">
          <span class="action-tile-icon">${Icon.audit}</span>
          <span class="action-tile-label">New Count</span>
        </button>
        <button class="action-tile new" data-act="new-item">
          <span class="action-tile-icon">${Icon.plus}</span>
          <span class="action-tile-label">Add Item</span>
        </button>
      </div>

      ${activeAudits.length ? `
        <div class="section-label">Active count session${activeAudits.length > 1 ? 's' : ''}</div>
        ${activeAudits.map(a => auditBanner(a)).join('')}
      ` : ''}

      ${lowStock.length ? `
        <div class="section-label">
          Needs attention
          <span class="link" data-act="view-low">View all</span>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          ${lowStock.slice(0, 4).map((item, i) => lowStockRow(item, i < Math.min(lowStock.length, 4) - 1)).join('')}
        </div>
      ` : `
        <div class="section-label">Needs attention</div>
        <div class="card" style="display:flex;align-items:center;gap:12px;">
          <span style="color:var(--md-secondary);flex-shrink:0;">${Icon.checkCircle}</span>
          <div>
            <div style="font-weight:600;font-size:13.5px;">All stock levels healthy</div>
            <div class="text-muted" style="font-size:12px;margin-top:1px;">No items below reorder point</div>
          </div>
        </div>
      `}

      <div class="section-label">
        Recent activity
        <span class="link" data-act="view-history">View all</span>
      </div>
      ${recentMovs.length ? `
        <div class="card" style="padding:8px 8px;">
          ${recentMovs.map(m => movementRow(m)).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:32px 20px;">
          <div class="empty-state-icon">${Icon.movements}</div>
          <div class="empty-state-title">No activity yet</div>
          <div class="empty-state-desc">Stock movements will appear here once you log them in or out.</div>
        </div>
      `}
    </div>
  `;

  root.querySelector('#btn-notif')?.addEventListener('click', () => {
    if (lowStock.length) {
      App.toast(`${lowStock.length} item${lowStock.length > 1 ? 's' : ''} below reorder point`, { type: 'error' });
    } else {
      App.toast('No alerts right now', { type: 'success' });
    }
  });

  root.querySelector('[data-act="stock-in"]')?.addEventListener('click', () => Forms.openMovement('in'));
  root.querySelector('[data-act="stock-out"]')?.addEventListener('click', () => Forms.openMovement('out'));
  root.querySelector('[data-act="new-audit"]')?.addEventListener('click', () => Forms.openNewAudit());
  root.querySelector('[data-act="new-item"]')?.addEventListener('click', () => Forms.openItemEditor());
  root.querySelector('[data-act="view-low"]')?.addEventListener('click', () => {
    App.state.tab = 'inventory';
    App.state.lowStockOnly = true;
    App.render();
  });
  root.querySelector('[data-act="view-history"]')?.addEventListener('click', () => App.goTab('history'));

  root.querySelectorAll('[data-audit-resume]').forEach(el => {
    el.addEventListener('click', () => Screens.openAuditSession(el.dataset.auditResume));
  });

  root.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', () => Forms.openItemDetail(el.dataset.itemId));
  });
};

function greeting() {
  const h = new Date().getHours();
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long' });
  if (h < 12) return `Good morning · ${day}`;
  if (h < 17) return `Good afternoon · ${day}`;
  return `Good evening · ${day}`;
}

function auditBanner(audit) {
  const pct = audit.totalItems ? Math.round((audit.countedItems / audit.totalItems) * 100) : 0;
  return `
    <div class="card" data-audit-resume="${audit.id}" style="cursor:pointer;">
      <div class="flex-between">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escape(audit.name)}</div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">${audit.countedItems} of ${audit.totalItems} counted</div>
        </div>
        <span class="chip chip-audit">In progress</span>
      </div>
      <div class="audit-progress-bar"><div class="audit-progress-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

function lowStockRow(item, showDivider) {
  const status = Utils.stockStatus(item);
  return `
    <div class="list-item" data-item-id="${item.id}" style="cursor:pointer;${showDivider ? 'border-bottom:1px solid var(--md-outline-variant);border-radius:0;' : ''}">
      <span class="item-icon">${Utils.initials(item.name)}</span>
      <div class="list-item-body">
        <div class="list-item-title">${Utils.escape(item.name)}</div>
        <div class="list-item-sub">
          <span class="badge-dot-status ${status}"></span>
          ${Utils.escape(item.sku)} · reorder at ${item.reorderPoint}
        </div>
      </div>
      <div class="list-item-trail">
        <div class="list-item-qty" style="color:${status === 'critical' ? 'var(--md-error)' : 'var(--md-tertiary)'}">${item.qty}</div>
        <div class="list-item-qty-unit">${Utils.escape(item.unit)}</div>
      </div>
    </div>
  `;
}

function movementRow(m) {
  const item = App.state.items.find(i => i.id === m.itemId);
  const name = item ? item.name : 'Unknown item';
  const isIn = m.type === 'in';
  const isAdjust = m.type === 'audit-adjust';
  const icon = isAdjust ? Icon.audit : (isIn ? Icon.arrowDown : Icon.arrowUp);
  const chipClass = isAdjust ? 'chip-audit' : (isIn ? 'chip-in' : 'chip-out');
  const label = isAdjust ? 'Adjusted' : (isIn ? 'Stock In' : 'Stock Out');
  const qtyDisplay = isAdjust ? `→ ${m.qty}` : `${isIn ? '+' : '−'}${m.qty}`;
  return `
    <div class="list-item">
      <span class="item-icon" style="background:var(--md-surface-3);color:${isAdjust ? 'var(--md-secondary)' : isIn ? 'var(--md-primary)' : 'var(--md-tertiary)'}">${icon}</span>
      <div class="list-item-body">
        <div class="list-item-title">${Utils.escape(name)}</div>
        <div class="list-item-sub">
          <span class="chip ${chipClass}" style="padding:2px 8px;">${label}</span>
          ${Utils.formatDate(m.createdAt)}
        </div>
      </div>
      <div class="list-item-trail">
        <div class="list-item-qty" style="font-size:15px;color:${isAdjust ? 'var(--md-secondary)' : isIn ? 'var(--md-primary)' : 'var(--md-tertiary)'}">${qtyDisplay}</div>
      </div>
    </div>
  `;
}
