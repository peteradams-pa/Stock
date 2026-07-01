/* ============================================================
   Inventory screen
   ============================================================ */

window.Screens = window.Screens || {};

Screens.inventory = async function (root) {
  const q = (App.state.searchQuery || '').toLowerCase().trim();
  const catFilter = App.state.categoryFilter || 'all';
  const lowOnly = !!App.state.lowStockOnly;

  let items = App.state.items;
  if (q) {
    items = items.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.location||'').toLowerCase().includes(q));
  }
  if (catFilter !== 'all') {
    items = items.filter(i => i.category === catFilter);
  }
  if (lowOnly) {
    items = items.filter(i => i.reorderPoint > 0 && i.qty <= i.reorderPoint);
  }

  const cats = App.state.categories;

  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-title-group">
        <p class="topbar-eyebrow">${App.state.items.length} SKUs</p>
        <h1 class="topbar-title">Inventory</h1>
      </div>
      <button class="icon-btn" id="btn-export">${Icon.download}</button>
    </div>
    <div class="screen-pad">
      <div class="search-bar">
        ${Icon.search}
        <input type="text" id="search-input" placeholder="Search name, SKU, location…" value="${Utils.escape(App.state.searchQuery || '')}">
      </div>

      <div class="filter-row" id="filter-row">
        <button class="filter-chip ${catFilter === 'all' && !lowOnly ? 'active' : ''}" data-cat="all">All</button>
        <button class="filter-chip ${lowOnly ? 'active' : ''}" data-cat="__low">Low stock</button>
        ${cats.map(c => `<button class="filter-chip ${catFilter === c && !lowOnly ? 'active' : ''}" data-cat="${Utils.escape(c)}">${Utils.escape(c)}</button>`).join('')}
      </div>

      <div id="item-list">
        ${items.length ? items.map(itemRow).join('') : emptyInventory(q || catFilter !== 'all' || lowOnly)}
      </div>
    </div>
    <button class="fab" id="fab-add">${Icon.plus}</button>
  `;

  const searchInput = root.querySelector('#search-input');
  searchInput.addEventListener('input', Utils.debounce((e) => {
    App.state.searchQuery = e.target.value;
    Screens.inventory(root);
    // refocus after re-render
    const el = root.querySelector('#search-input');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, 200));

  root.querySelectorAll('#filter-row [data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.cat === '__low') {
        App.state.lowStockOnly = true;
        App.state.categoryFilter = 'all';
      } else {
        App.state.lowStockOnly = false;
        App.state.categoryFilter = btn.dataset.cat;
      }
      Screens.inventory(root);
    });
  });

  root.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', () => Forms.openItemDetail(el.dataset.itemId));
  });

  root.querySelector('#fab-add').addEventListener('click', () => Forms.openItemEditor());
  root.querySelector('#btn-export').addEventListener('click', () => Forms.openExportSheet());
};

function itemRow(item) {
  const status = Utils.stockStatus(item);
  const statusColor = status === 'critical' ? 'var(--md-error)' : status === 'low' ? 'var(--md-tertiary)' : 'var(--md-on-surface)';
  return `
    <div class="list-item" data-item-id="${item.id}" style="cursor:pointer;">
      <span class="item-icon">${Utils.initials(item.name)}</span>
      <div class="list-item-body">
        <div class="list-item-title">${Utils.escape(item.name)}</div>
        <div class="list-item-sub">
          <span class="badge-dot-status ${status}"></span>
          ${Utils.escape(item.sku)} · ${Utils.escape(item.category)}
        </div>
      </div>
      <div class="list-item-trail">
        <div class="list-item-qty" style="color:${statusColor}">${item.qty}</div>
        <div class="list-item-qty-unit">${Utils.escape(item.unit)}</div>
      </div>
    </div>
  `;
}

function emptyInventory(filtered) {
  if (filtered) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${Icon.search}</div>
        <div class="empty-state-title">No matching items</div>
        <div class="empty-state-desc">Try a different search term or clear filters.</div>
      </div>
    `;
  }
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${Icon.boxes}</div>
      <div class="empty-state-title">No items yet</div>
      <div class="empty-state-desc">Add your first inventory item to start tracking stock.</div>
    </div>
  `;
}
