/* ============================================================
   Settings screen
   ============================================================ */

window.Screens = window.Screens || {};

Screens.settings = async function (root) {
  const stats = await StockDB.Items.stats();
  const cats = App.state.categoriesFull;

  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-title-group">
        <p class="topbar-eyebrow">App</p>
        <h1 class="topbar-title">Settings</h1>
      </div>
    </div>
    <div class="screen-pad">

      <div class="card" style="display:flex;align-items:center;gap:14px;">
        <span class="settings-row-icon" style="width:48px;height:48px;background:var(--md-primary-container);color:var(--md-on-primary-container);">${Icon.boxes}</span>
        <div>
          <div style="font-weight:700;font-size:15px;">StockCount</div>
          <div class="text-muted" style="font-size:12.5px;">${stats.skuCount} SKUs · ${stats.totalUnits.toLocaleString()} units · fully offline</div>
        </div>
      </div>

      <div class="section-label">
        Categories
        <span class="link" id="btn-add-category">+ Add</span>
      </div>
      <div class="card" style="padding:4px 14px;">
        ${cats.length ? cats.map((c, i) => categoryRow(c, i < cats.length - 1)).join('') : `
          <p style="margin:14px 4px;font-size:13px;color:var(--md-on-surface-variant);">No categories yet. Add one to start assigning auto-numbered SKUs.</p>
        `}
      </div>
      <p class="field-hint" style="margin:0 0 4px;">Each category's prefix generates sequential SKUs for new items — e.g. <span class="mono">BEV-001</span>, <span class="mono">BEV-002</span> — in the order they're added.</p>

      <div class="section-label">Data</div>
      <div class="card" style="padding:4px 14px;">
        <button class="settings-row" id="btn-export-csv" style="width:100%;text-align:left;">
          <span class="settings-row-icon">${Icon.clipboard}</span>
          <span class="settings-row-body"><span class="settings-row-title">Export inventory (CSV)</span><span class="settings-row-sub">Quantities snapshot, spreadsheet-ready</span></span>
          ${Icon.chevronRight}
        </button>
        <hr class="divider" style="margin:4px 0;">
        <button class="settings-row" id="btn-export-json" style="width:100%;text-align:left;">
          <span class="settings-row-icon">${Icon.download}</span>
          <span class="settings-row-body"><span class="settings-row-title">Export full backup (JSON)</span><span class="settings-row-sub">Items, movements, and count history</span></span>
          ${Icon.chevronRight}
        </button>
        <hr class="divider" style="margin:4px 0;">
        <button class="settings-row" id="btn-import" style="width:100%;text-align:left;">
          <span class="settings-row-icon">${Icon.upload}</span>
          <span class="settings-row-body"><span class="settings-row-title">Restore from backup</span><span class="settings-row-sub">Merge a previously exported JSON file</span></span>
          ${Icon.chevronRight}
        </button>
        <input type="file" id="file-import" accept="application/json" style="display:none;">
      </div>

      <div class="section-label">Danger zone</div>
      <div class="card" style="padding:4px 14px;">
        <button class="settings-row" id="btn-wipe" style="width:100%;text-align:left;">
          <span class="settings-row-icon" style="background:var(--md-error-container);color:var(--md-on-error-container);">${Icon.trash}</span>
          <span class="settings-row-body"><span class="settings-row-title" style="color:var(--md-error);">Erase all data</span><span class="settings-row-sub">Removes every item, movement, and count</span></span>
        </button>
      </div>

      <div class="section-label">About</div>
      <div class="card">
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:var(--md-on-surface-variant);">
          StockCount runs entirely on this device. Your inventory data never leaves your phone — there's no server, no account, and no internet connection required.
        </p>
        <p style="margin:0;font-size:12px;color:var(--md-on-surface-variant);">Version 1.0.0</p>
      </div>
    </div>
  `;

  root.querySelector('#btn-add-category').addEventListener('click', () => Forms.openCategoryEditor());
  root.querySelectorAll('[data-cat-id]').forEach(el => {
    el.addEventListener('click', () => {
      const cat = cats.find(c => c.id === el.dataset.catId);
      if (cat) Forms.openCategoryEditor(cat);
    });
  });

  root.querySelector('#btn-export-csv').addEventListener('click', () => {
    const rows = [['SKU','Name','Category','Unit','Qty On Hand','Reorder Point','Location']];
    App.state.items.forEach(i => rows.push([i.sku, i.name, i.category, i.unit, i.qty, i.reorderPoint, i.location]));
    Utils.downloadCSV(rows, `stockcount-inventory-${Date.now()}.csv`);
    App.toast('CSV exported', { type: 'success' });
  });

  root.querySelector('#btn-export-json').addEventListener('click', async () => {
    const data = await StockDB.DataIO.exportAll();
    Utils.downloadJSON(data, `stockcount-backup-${Date.now()}.json`);
    App.toast('Backup exported', { type: 'success' });
  });

  const fileInput = root.querySelector('#file-import');
  root.querySelector('#btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await Utils.readFileAsText(file);
      const data = JSON.parse(text);
      const ok = await UI.confirm({
        title: 'Restore from backup?',
        message: `This will merge ${data.items?.length || 0} items and their history into your current data. Existing items with matching IDs will be overwritten.`,
        confirmLabel: 'Restore',
      });
      if (ok) {
        await StockDB.DataIO.importAll(data, { mode: 'merge' });
        App.toast('Backup restored', { type: 'success' });
        await App.rerender();
      }
    } catch (err) {
      App.toast('Could not read that file', { type: 'error' });
    }
    fileInput.value = '';
  });

  root.querySelector('#btn-wipe').addEventListener('click', async () => {
    const ok = await UI.confirm({
      title: 'Erase all data?',
      message: 'This permanently deletes every item, movement, and count session on this device. This cannot be undone.',
      confirmLabel: 'Erase everything', danger: true,
    });
    if (ok) {
      await StockDB.DataIO.wipeAll();
      App.toast('All data erased', { type: 'success' });
      await App.rerender();
    }
  });
};

function categoryRow(cat, showDivider) {
  return `
    <button class="settings-row" data-cat-id="${cat.id}" style="width:100%;text-align:left;${showDivider ? 'border-bottom:1px solid var(--md-outline-variant);' : ''}">
      <span class="settings-row-icon mono" style="font-size:11px;font-weight:700;letter-spacing:0.02em;">${Utils.escape(cat.prefix)}</span>
      <span class="settings-row-body">
        <span class="settings-row-title">${Utils.escape(cat.name)}</span>
        <span class="settings-row-sub">${cat.count} item${cat.count === 1 ? '' : 's'} · next SKU ${Utils.escape(cat.prefix)}-${String(cat.nextSeq).padStart(3, '0')}</span>
      </span>
      ${Icon.chevronRight}
    </button>
  `;
}
