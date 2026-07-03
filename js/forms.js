/* ============================================================
   Forms — item editor, item detail, movement (stock in/out)
   ============================================================ */

const Forms = {

  /* ---------------------------------------------------------
     Item create / edit
     --------------------------------------------------------- */
  openItemEditor(existingItem = null) {
    const isEdit = !!existingItem;
    const cats = App.state.categoriesFull.length ? App.state.categoriesFull : [];
    const defaultCat = existingItem?.category || cats[0]?.name || '';

    const html = `
      <div class="sheet-header">
        <h3 class="sheet-title">${isEdit ? 'Edit item' : 'New item'}</h3>
        <button class="icon-btn" data-act="close">${Icon.close}</button>
      </div>
      <div class="sheet-body">
        <div class="field">
          <label class="field-label">Item name</label>
          <input class="field-input" id="f-name" placeholder="e.g. Bottled Water 500ml" value="${Utils.escape(existingItem?.name || '')}">
        </div>

        <div class="field">
          <label class="field-label">Category</label>
          ${cats.length ? `
            <div class="select-wrap">
              <select class="field-select" id="f-category">
                ${cats.map(c => `<option value="${Utils.escape(c.name)}" ${c.name === defaultCat ? 'selected' : ''}>${Utils.escape(c.name)} (${Utils.escape(c.prefix)})</option>`).join('')}
              </select>
            </div>
            <p class="field-hint">Manage categories and prefixes in Settings → Categories</p>
          ` : `
            <div class="card" style="padding:12px 14px;background:var(--md-surface-3);border:1px dashed var(--md-outline);">
              <p style="margin:0;font-size:12.5px;color:var(--md-on-surface-variant);line-height:1.5;">No categories yet. Add one in Settings → Categories first, so items get an auto-numbered SKU.</p>
            </div>
            <input type="hidden" id="f-category" value="Uncategorized">
          `}
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">SKU / Code</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input class="field-input" id="f-sku" placeholder="Auto-generated" value="${Utils.escape(existingItem?.sku || '')}" ${isEdit ? '' : 'readonly'} style="${isEdit ? '' : 'color:var(--md-on-surface-variant);'}">
              ${isEdit ? '' : `<button type="button" class="btn-text btn-sm" id="f-sku-manual" style="flex-shrink:0;padding:0 8px;height:36px;">Edit</button>`}
            </div>
            <p class="field-hint" id="sku-hint">${isEdit ? '' : 'Next in sequence for this category'}</p>
          </div>
          <div class="field">
            <label class="field-label">Unit</label>
            <input class="field-input" id="f-unit" placeholder="pcs, kg, box…" value="${Utils.escape(existingItem?.unit || 'pcs')}">
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">${isEdit ? 'Current quantity' : 'Opening quantity'}</label>
            <input class="field-input" id="f-qty" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${existingItem ? existingItem.qty : 0}" ${isEdit ? 'disabled' : ''}>
            ${isEdit ? '<p class="field-hint">Use Stock In/Out or an audit to change quantity</p>' : ''}
          </div>
          <div class="field">
            <label class="field-label">Reorder point</label>
            <input class="field-input" id="f-reorder" type="number" inputmode="numeric" min="0" placeholder="0" value="${existingItem ? existingItem.reorderPoint : 0}">
          </div>
        </div>
        <div class="field">
          <label class="field-label">Location <span class="text-muted">(optional)</span></label>
          <input class="field-input" id="f-location" placeholder="e.g. Aisle B2, Store Room" value="${Utils.escape(existingItem?.location || '')}">
        </div>
        <div class="field">
          <label class="field-label">Notes <span class="text-muted">(optional)</span></label>
          <textarea class="field-textarea" id="f-notes" placeholder="Any additional details…">${Utils.escape(existingItem?.notes || '')}</textarea>
        </div>
      </div>
      <div class="sheet-footer">
        <button class="btn btn-outlined btn-block" data-act="cancel">Cancel</button>
        <button class="btn btn-filled btn-block" data-act="save">${isEdit ? 'Save changes' : 'Add item'}</button>
      </div>
    `;
    const { sheet, close } = UI.openSheet(html);
    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', close);
    sheet.querySelector('#f-name').focus();

    const skuInput = sheet.querySelector('#f-sku');
    const skuHint = sheet.querySelector('#sku-hint');
    const categorySelect = sheet.querySelector('#f-category');
    let skuManuallyEdited = isEdit; // editing an existing item never auto-overwrites its SKU

    const refreshSkuPreview = async () => {
      if (skuManuallyEdited) return;
      const catName = categorySelect.value;
      const preview = await StockDB.Categories.peekNextSku(catName);
      if (preview) {
        skuInput.value = preview;
        skuHint.textContent = 'Next in sequence for this category';
      } else {
        skuInput.value = '';
        skuHint.textContent = 'Will be generated on save';
      }
    };

    if (!isEdit) {
      refreshSkuPreview();
      categorySelect?.addEventListener('change', refreshSkuPreview);
      const manualBtn = sheet.querySelector('#f-sku-manual');
      manualBtn?.addEventListener('click', () => {
        skuManuallyEdited = true;
        skuInput.readOnly = false;
        skuInput.style.color = '';
        skuInput.value = '';
        skuInput.placeholder = 'Enter custom code';
        skuHint.textContent = 'Custom SKU — must be unique';
        manualBtn.remove();
        skuInput.focus();
      });
    }

    sheet.querySelector('[data-act="save"]').addEventListener('click', async () => {
      const name = sheet.querySelector('#f-name').value.trim();
      if (!name) { App.toast('Item name is required', { type: 'error' }); return; }

      const category = categorySelect.value.trim() || 'Uncategorized';
      const manualSku = skuManuallyEdited ? skuInput.value.trim() : '';
      if (skuManuallyEdited && !manualSku) { App.toast('Enter a SKU or switch back to auto-numbering', { type: 'error' }); return; }

      const data = {
        name,
        sku: manualSku, // empty string = let Items.create() auto-generate from category prefix
        unit: sheet.querySelector('#f-unit').value.trim() || 'pcs',
        category,
        qty: Number(sheet.querySelector('#f-qty').value) || 0,
        reorderPoint: Number(sheet.querySelector('#f-reorder').value) || 0,
        location: sheet.querySelector('#f-location').value.trim(),
        notes: sheet.querySelector('#f-notes').value.trim(),
      };

      try {
        if (isEdit) {
          const { qty, sku, ...patch } = data; // qty and sku not editable via this path when auto; sku only if changed
          const finalPatch = manualSku && manualSku !== existingItem.sku ? { ...patch, sku: manualSku } : patch;
          if (finalPatch.sku) {
            const dupe = await StockDB.Items.getBySku(finalPatch.sku);
            if (dupe && dupe.id !== existingItem.id) { App.toast('A SKU with that code already exists', { type: 'error' }); return; }
          }
          await StockDB.Items.update(existingItem.id, finalPatch);
          App.toast('Item updated', { type: 'success' });
        } else {
          if (manualSku) {
            const dupe = await StockDB.Items.getBySku(manualSku);
            if (dupe) { App.toast('A SKU with that code already exists', { type: 'error' }); return; }
          }
          await StockDB.Items.create(data);
          App.toast('Item added', { type: 'success' });
        }
        close();
        await App.rerender();
      } catch (err) {
        App.toast(err.message || 'Something went wrong', { type: 'error' });
      }
    });
  },

  /* ---------------------------------------------------------
     Item detail (full screen dialog)
     --------------------------------------------------------- */
  async openItemDetail(itemId) {
    const item = await StockDB.Items.get(itemId);
    if (!item) return App.toast('Item not found', { type: 'error' });
    const movs = await StockDB.Movements.forItem(itemId);
    const status = Utils.stockStatus(item);

    const html = `
      <div class="topbar">
        <button class="icon-btn" data-act="back">${Icon.back}</button>
        <div class="topbar-title-group">
          <p class="topbar-eyebrow">${Utils.escape(item.sku)}</p>
          <h1 class="topbar-title">${Utils.escape(item.name)}</h1>
        </div>
        <button class="icon-btn" data-act="edit">${Icon.edit}</button>
      </div>
      <div class="screen" style="padding-bottom:110px;">
        <div class="screen-pad">
          <div class="card" style="text-align:center;padding:24px 18px;">
            <p class="kpi-value" style="font-size:40px;color:${status==='critical'?'var(--md-error)':status==='low'?'var(--md-tertiary)':'var(--md-on-surface)'}">${item.qty}</p>
            <p class="kpi-label" style="margin-bottom:14px;">${Utils.escape(item.unit)} in stock</p>
            <div style="display:flex;justify-content:center;gap:8px;">
              <span class="chip ${status === 'critical' ? 'chip-low' : status === 'low' ? 'chip-low' : 'chip-ok'}">
                ${status === 'critical' ? 'Out of stock' : status === 'low' ? 'Below reorder point' : 'Healthy'}
              </span>
              <span class="chip chip-ok">${Utils.escape(item.category)}</span>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:14px;">
            <button class="btn btn-filled btn-block" data-act="stock-in">${Icon.arrowDown} Stock In</button>
            <button class="btn btn-tonal btn-block" data-act="stock-out">${Icon.arrowUp} Stock Out</button>
          </div>

          <div class="section-label">Details</div>
          <div class="card">
            <div class="stat-row"><span class="stat-row-label">SKU / Code</span><span class="stat-row-value mono">${Utils.escape(item.sku)}</span></div>
            <div class="stat-row"><span class="stat-row-label">Category</span><span class="stat-row-value">${Utils.escape(item.category)}</span></div>
            <div class="stat-row"><span class="stat-row-label">Reorder point</span><span class="stat-row-value">${item.reorderPoint || '—'}</span></div>
            <div class="stat-row"><span class="stat-row-label">Location</span><span class="stat-row-value">${item.location ? Utils.escape(item.location) : '—'}</span></div>
            <div class="stat-row"><span class="stat-row-label">Last updated</span><span class="stat-row-value">${Utils.formatDate(item.updatedAt)}</span></div>
          </div>
          ${item.notes ? `
            <div class="section-label">Notes</div>
            <div class="card"><p style="margin:0;font-size:13.5px;line-height:1.6;color:var(--md-on-surface-variant);">${Utils.escape(item.notes)}</p></div>
          ` : ''}

          <div class="section-label">Movement history</div>
          ${movs.length ? `
            <div class="card" style="padding:8px;">
              ${movs.map(m => historyRow(m)).join('')}
            </div>
          ` : `<div class="empty-state" style="padding:24px;"><div class="empty-state-desc">No movements logged yet.</div></div>`}

          <div class="section-label">Danger zone</div>
          <button class="btn btn-error btn-block" data-act="delete">${Icon.trash} Delete item</button>
        </div>
      </div>
    `;
    const { dialog, close } = UI.openDialog(html);
    dialog.querySelector('[data-act="back"]').addEventListener('click', close);
    dialog.querySelector('[data-act="edit"]').addEventListener('click', () => Forms.openItemEditor(item));
    dialog.querySelector('[data-act="stock-in"]').addEventListener('click', () => Forms.openMovement('in', item));
    dialog.querySelector('[data-act="stock-out"]').addEventListener('click', () => Forms.openMovement('out', item));
    dialog.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Delete this item?',
        message: `This removes "${item.name}" and its full movement history. This can't be undone.`,
        confirmLabel: 'Delete', danger: true,
      });
      if (ok) {
        await StockDB.Items.remove(item.id);
        App.toast('Item deleted', { type: 'success' });
        close();
        await App.rerender();
      }
    });
  },

  /* ---------------------------------------------------------
     Stock In / Stock Out movement sheet
     --------------------------------------------------------- */
  openMovement(type = 'in', presetItem = null) {
    const items = App.state.items;
    const reasonsIn = ['Purchase / restock', 'Customer return', 'Transfer in', 'Production output', 'Other'];
    const reasonsOut = ['Sale', 'Damaged / spoiled', 'Transfer out', 'Internal use', 'Customer return to supplier', 'Other'];
    const reasons = type === 'in' ? reasonsIn : reasonsOut;

    const html = `
      <div class="sheet-header">
        <h3 class="sheet-title">${type === 'in' ? 'Stock In' : 'Stock Out'}</h3>
        <button class="icon-btn" data-act="close">${Icon.close}</button>
      </div>
      <div class="sheet-body">
        <div class="toggle-group" style="margin-bottom:18px;">
          <div class="toggle-opt in ${type === 'in' ? 'active in' : ''}" data-type="in">${Icon.arrowDown} Stock In</div>
          <div class="toggle-opt out ${type === 'out' ? 'active out' : ''}" data-type="out">${Icon.arrowUp} Stock Out</div>
        </div>

        <div class="field">
          <label class="field-label">Item</label>
          <div class="select-wrap">
            <select class="field-select" id="f-item">
              <option value="">Select an item…</option>
              ${items.map(i => `<option value="${i.id}" ${presetItem?.id === i.id ? 'selected' : ''}>${Utils.escape(i.name)} — ${Utils.escape(i.sku)} (${i.qty} ${Utils.escape(i.unit)} on hand)</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Quantity</label>
          <div class="qty-stepper">
            <button class="qty-stepper-btn" id="qty-minus" type="button">${Icon.minus}</button>
            <input type="number" id="f-qty" inputmode="decimal" min="0" step="any" value="1">
            <button class="qty-stepper-btn" id="qty-plus" type="button">${Icon.plus}</button>
          </div>
          <p class="field-hint" id="qty-hint"></p>
        </div>

        <div class="field">
          <label class="field-label">Reason</label>
          <div class="select-wrap">
            <select class="field-select" id="f-reason">
              ${reasons.map(r => `<option value="${Utils.escape(r)}">${Utils.escape(r)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Reference <span class="text-muted">(optional — PO#, invoice, etc.)</span></label>
          <input class="field-input" id="f-ref" placeholder="e.g. PO-4021">
        </div>

        <div class="field" style="margin-bottom:4px;">
          <label class="field-label">Note <span class="text-muted">(optional)</span></label>
          <textarea class="field-textarea" id="f-note" placeholder="Any additional context…" style="min-height:56px;"></textarea>
        </div>
      </div>
      <div class="sheet-footer">
        <button class="btn btn-outlined btn-block" data-act="cancel">Cancel</button>
        <button class="btn ${type === 'out' ? 'btn-filled' : 'btn-filled'} btn-block" data-act="save">Log movement</button>
      </div>
    `;
    const { sheet, close } = UI.openSheet(html);
    let currentType = type;

    const itemSelect = sheet.querySelector('#f-item');
    const qtyInput = sheet.querySelector('#f-qty');
    const qtyHint = sheet.querySelector('#qty-hint');
    const saveBtn = sheet.querySelector('[data-act="save"]');

    const updateHint = () => {
      const item = items.find(i => i.id === itemSelect.value);
      if (!item) { qtyHint.textContent = ''; return; }
      if (currentType === 'out') {
        qtyHint.textContent = `${item.qty} ${item.unit} currently on hand`;
        qtyHint.style.color = Number(qtyInput.value) > item.qty ? 'var(--md-error)' : 'var(--md-on-surface-variant)';
      } else {
        qtyHint.textContent = `${item.qty} ${item.unit} currently on hand → ${item.qty + (Number(qtyInput.value)||0)} after`;
        qtyHint.style.color = 'var(--md-on-surface-variant)';
      }
    };

    sheet.querySelectorAll('[data-type]').forEach(opt => {
      opt.addEventListener('click', () => {
        currentType = opt.dataset.type;
        sheet.querySelectorAll('[data-type]').forEach(o => o.classList.remove('active', 'in', 'out'));
        opt.classList.add('active', currentType);
        saveBtn.textContent = 'Log movement';
        updateHint();
      });
    });

    sheet.querySelector('#qty-minus').addEventListener('click', () => {
      qtyInput.value = Math.max(0, (Number(qtyInput.value) || 0) - 1);
      updateHint();
    });
    sheet.querySelector('#qty-plus').addEventListener('click', () => {
      qtyInput.value = (Number(qtyInput.value) || 0) + 1;
      updateHint();
    });
    qtyInput.addEventListener('input', updateHint);
    itemSelect.addEventListener('change', updateHint);
    updateHint();

    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', close);

    saveBtn.addEventListener('click', async () => {
      const itemId = itemSelect.value;
      const qty = Number(qtyInput.value);
      if (!itemId) { App.toast('Select an item', { type: 'error' }); return; }
      if (!qty || qty <= 0) { App.toast('Enter a quantity greater than 0', { type: 'error' }); return; }

      const item = items.find(i => i.id === itemId);
      if (currentType === 'out' && qty > item.qty) {
        const proceed = await UI.confirm({
          title: 'Quantity exceeds stock on hand',
          message: `You're removing ${qty} ${item.unit} but only ${item.qty} ${item.unit} are on hand. This will bring stock to 0. Continue?`,
          confirmLabel: 'Continue', danger: true,
        });
        if (!proceed) return;
      }

      try {
        await StockDB.Movements.log({
          itemId,
          type: currentType,
          qty,
          reason: sheet.querySelector('#f-reason').value,
          ref: sheet.querySelector('#f-ref').value.trim(),
          note: sheet.querySelector('#f-note').value.trim(),
        });
        App.toast(`${currentType === 'in' ? 'Stock in' : 'Stock out'} logged`, { type: 'success' });
        close();
        await App.rerender();
      } catch (err) {
        App.toast(err.message || 'Something went wrong', { type: 'error' });
      }
    });
  },

  /* ---------------------------------------------------------
     New audit session
     --------------------------------------------------------- */
  openNewAudit() {
    const cats = App.state.categories;
    const html = `
      <div class="sheet-header">
        <h3 class="sheet-title">New count session</h3>
        <button class="icon-btn" data-act="close">${Icon.close}</button>
      </div>
      <div class="sheet-body">
        <div class="field">
          <label class="field-label">Session name</label>
          <input class="field-input" id="f-name" placeholder="e.g. Weekly spot check" value="Count — ${new Date().toLocaleDateString()}">
        </div>
        <div class="field">
          <label class="field-label">Scope</label>
          <div class="select-wrap">
            <select class="field-select" id="f-scope">
              <option value="all">All items (${App.state.items.length})</option>
              ${cats.map(c => `<option value="cat:${Utils.escape(c)}">Category: ${Utils.escape(c)} (${App.state.items.filter(i=>i.category===c).length})</option>`).join('')}
              <option value="low">Low stock items only (${App.state.items.filter(i => i.reorderPoint > 0 && i.qty <= i.reorderPoint).length})</option>
            </select>
          </div>
          <p class="field-hint">Impromptu checks work great scoped to a category or a shelf — you don't need to count everything at once.</p>
        </div>
      </div>
      <div class="sheet-footer">
        <button class="btn btn-outlined btn-block" data-act="cancel">Cancel</button>
        <button class="btn btn-filled secondary btn-block" data-act="start">Start counting</button>
      </div>
    `;
    const { sheet, close } = UI.openSheet(html);
    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', close);

    sheet.querySelector('[data-act="start"]').addEventListener('click', async () => {
      const name = sheet.querySelector('#f-name').value.trim() || 'Untitled count';
      const scopeVal = sheet.querySelector('#f-scope').value;

      let itemIds = [];
      let scope = 'all', category = null;
      if (scopeVal === 'all') {
        itemIds = App.state.items.map(i => i.id);
      } else if (scopeVal === 'low') {
        scope = 'low';
        itemIds = App.state.items.filter(i => i.reorderPoint > 0 && i.qty <= i.reorderPoint).map(i => i.id);
      } else if (scopeVal.startsWith('cat:')) {
        category = scopeVal.slice(4);
        scope = 'category';
        itemIds = App.state.items.filter(i => i.category === category).map(i => i.id);
      }

      if (itemIds.length === 0) {
        App.toast('No items in this scope', { type: 'error' });
        return;
      }

      const audit = await StockDB.Audits.create({ name, itemIds, scope, category });
      App.toast('Count session started', { type: 'success' });
      close();
      App.markDirty();
      await App.refreshData();
      Screens.openAuditSession(audit.id);
    });
  },

  /* ---------------------------------------------------------
     Export sheet
     --------------------------------------------------------- */
  openExportSheet() {
    const html = `
      <div class="sheet-header">
        <h3 class="sheet-title">Export data</h3>
        <button class="icon-btn" data-act="close">${Icon.close}</button>
      </div>
      <div class="sheet-body">
        <button class="settings-row" id="exp-csv" style="width:100%;text-align:left;">
          <span class="settings-row-icon">${Icon.clipboard}</span>
          <span class="settings-row-body">
            <span class="settings-row-title">Inventory as CSV</span>
            <span class="settings-row-sub">Spreadsheet-friendly, quantities only</span>
          </span>
          ${Icon.chevronRight}
        </button>
        <button class="settings-row" id="exp-json" style="width:100%;text-align:left;">
          <span class="settings-row-icon">${Icon.download}</span>
          <span class="settings-row-body">
            <span class="settings-row-title">Full backup as JSON</span>
            <span class="settings-row-sub">Items, movements, audits — for re-import</span>
          </span>
          ${Icon.chevronRight}
        </button>
      </div>
    `;
    const { sheet, close } = UI.openSheet(html);
    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.querySelector('#exp-csv').addEventListener('click', () => {
      const rows = [['SKU','Name','Category','Unit','Qty On Hand','Reorder Point','Location']];
      App.state.items.forEach(i => rows.push([i.sku, i.name, i.category, i.unit, i.qty, i.reorderPoint, i.location]));
      Utils.downloadCSV(rows, `stockcount-inventory-${Date.now()}.csv`);
      App.toast('CSV exported', { type: 'success' });
      close();
    });
    sheet.querySelector('#exp-json').addEventListener('click', async () => {
      const data = await StockDB.DataIO.exportAll();
      Utils.downloadJSON(data, `stockcount-backup-${Date.now()}.json`);
      App.toast('Backup exported', { type: 'success' });
      close();
    });
  },

  /* ---------------------------------------------------------
     Category create / edit — name + SKU prefix
     --------------------------------------------------------- */
  openCategoryEditor(existingCat = null) {
    const isEdit = !!existingCat;
    const html = `
      <div class="sheet-header">
        <h3 class="sheet-title">${isEdit ? 'Edit category' : 'New category'}</h3>
        <button class="icon-btn" data-act="close">${Icon.close}</button>
      </div>
      <div class="sheet-body">
        <div class="field">
          <label class="field-label">Category name</label>
          <input class="field-input" id="f-cat-name" placeholder="e.g. Beverages" value="${Utils.escape(existingCat?.name || '')}">
        </div>
        <div class="field">
          <label class="field-label">SKU prefix</label>
          <input class="field-input mono" id="f-cat-prefix" placeholder="e.g. BEV" maxlength="6" value="${Utils.escape(existingCat?.prefix || '')}" style="text-transform:uppercase;letter-spacing:0.03em;">
          <p class="field-hint" id="cat-prefix-hint">Letters and numbers only, up to 6 characters</p>
        </div>
        <div class="card" style="background:var(--md-surface-3);padding:12px 14px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:var(--md-secondary);flex-shrink:0;">${Icon.sparkle}</span>
            <div style="font-size:12.5px;color:var(--md-on-surface-variant);line-height:1.5;">
              New items in this category get sequential SKUs automatically:
              <span class="mono" id="cat-sku-preview" style="color:var(--md-on-surface);font-weight:600;">—</span>
            </div>
          </div>
        </div>
        ${isEdit ? `
          <p class="field-hint" style="margin-top:14px;">${existingCat.count} item${existingCat.count === 1 ? '' : 's'} currently in this category. Renaming updates them automatically; changing the prefix only affects items created from now on.</p>
        ` : ''}
      </div>
      <div class="sheet-footer">
        ${isEdit ? `<button class="btn btn-error" id="btn-delete-cat" style="flex-shrink:0;padding:0 18px;">${Icon.trash}</button>` : `<button class="btn btn-outlined btn-block" data-act="cancel">Cancel</button>`}
        <button class="btn btn-filled btn-block" data-act="save">${isEdit ? 'Save changes' : 'Add category'}</button>
      </div>
    `;
    const { sheet, close } = UI.openSheet(html);
    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.querySelector('[data-act="cancel"]')?.addEventListener('click', close);

    const nameInput = sheet.querySelector('#f-cat-name');
    const prefixInput = sheet.querySelector('#f-cat-prefix');
    const preview = sheet.querySelector('#cat-sku-preview');
    nameInput.focus();

    let prefixManuallyEdited = isEdit;

    const updatePreview = () => {
      const prefix = StockDB.Categories.normalizePrefix(prefixInput.value) || StockDB.Categories.normalizePrefix(StockDB.Categories.suggestPrefix(nameInput.value)) || 'GEN';
      const seq = isEdit ? (existingCat.nextSeq || 1) : 1;
      preview.textContent = `${prefix}-${String(seq).padStart(3, '0')}`;
    };

    nameInput.addEventListener('input', () => {
      if (!prefixManuallyEdited) {
        prefixInput.value = StockDB.Categories.suggestPrefix(nameInput.value);
      }
      updatePreview();
    });
    prefixInput.addEventListener('input', () => {
      prefixManuallyEdited = true;
      const cleaned = StockDB.Categories.normalizePrefix(prefixInput.value);
      if (cleaned !== prefixInput.value) prefixInput.value = cleaned;
      updatePreview();
    });
    updatePreview();

    sheet.querySelector('#btn-delete-cat')?.addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Delete this category?',
        message: existingCat.count > 0
          ? `${existingCat.count} item${existingCat.count === 1 ? '' : 's'} using "${existingCat.name}" will be moved to "Uncategorized". This can't be undone.`
          : `"${existingCat.name}" will be removed. This can't be undone.`,
        confirmLabel: 'Delete', danger: true,
      });
      if (ok) {
        await StockDB.Categories.remove(existingCat.id);
        App.toast('Category deleted', { type: 'success' });
        close();
        await App.rerender();
      }
    });

    sheet.querySelector('[data-act="save"]').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { App.toast('Category name is required', { type: 'error' }); return; }
      const prefix = StockDB.Categories.normalizePrefix(prefixInput.value);
      if (!prefix) { App.toast('Enter a SKU prefix', { type: 'error' }); return; }

      try {
        if (isEdit) {
          await StockDB.Categories.update(existingCat.id, { name, prefix });
          App.toast('Category updated', { type: 'success' });
        } else {
          await StockDB.Categories.create(name, prefix);
          App.toast('Category added', { type: 'success' });
        }
        close();
        await App.rerender();
      } catch (err) {
        App.toast(err.message || 'Something went wrong', { type: 'error' });
      }
    });
  },
};

function historyRow(m) {
  const isIn = m.type === 'in';
  const isAdjust = m.type === 'audit-adjust';
  const icon = isAdjust ? Icon.audit : (isIn ? Icon.arrowDown : Icon.arrowUp);
  const chipClass = isAdjust ? 'chip-audit' : (isIn ? 'chip-in' : 'chip-out');
  const label = isAdjust ? 'Audit adjust' : (isIn ? 'In' : 'Out');
  const qtyDisplay = isAdjust ? `→ ${m.qty}` : `${isIn ? '+' : '−'}${m.qty}`;
  return `
    <div class="list-item">
      <span class="item-icon" style="background:var(--md-surface-3);color:${isAdjust ? 'var(--md-secondary)' : isIn ? 'var(--md-primary)' : 'var(--md-tertiary)'}">${icon}</span>
      <div class="list-item-body">
        <div class="list-item-title" style="display:flex;align-items:center;gap:6px;">
          <span class="chip ${chipClass}" style="padding:2px 8px;">${label}</span>
          ${m.reason ? `<span style="font-size:12.5px;color:var(--md-on-surface-variant);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escape(m.reason)}</span>` : ''}
        </div>
        <div class="list-item-sub">${Utils.formatDate(m.createdAt)}${m.ref ? ` · ${Utils.escape(m.ref)}` : ''}</div>
      </div>
      <div class="list-item-trail">
        <div class="list-item-qty" style="font-size:15px;color:${isAdjust ? 'var(--md-secondary)' : isIn ? 'var(--md-primary)' : 'var(--md-tertiary)'}">${qtyDisplay}</div>
        ${m.balanceAfter != null ? `<div class="list-item-qty-unit">bal. ${m.balanceAfter}</div>` : ''}
      </div>
    </div>
  `;
}

window.Forms = Forms;
