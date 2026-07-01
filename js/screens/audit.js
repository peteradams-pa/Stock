/* ============================================================
   Audit screen — list of sessions + count entry flow
   ============================================================ */

window.Screens = window.Screens || {};

Screens.audit = async function (root) {
  const audits = App.state.audits;
  const inProgress = audits.filter(a => a.status === 'in-progress');
  const completed = audits.filter(a => a.status === 'completed');
  const cancelled = audits.filter(a => a.status === 'cancelled');

  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-title-group">
        <p class="topbar-eyebrow">Physical vs. system</p>
        <h1 class="topbar-title">Stock Counts</h1>
      </div>
    </div>
    <div class="screen-pad">

      ${inProgress.length ? `
        <div class="section-label">In progress</div>
        ${inProgress.map(sessionCard).join('')}
      ` : ''}

      <div class="section-label">Start a new count</div>
      <div class="card" style="display:flex;align-items:center;gap:14px;" id="start-audit-card">
        <span class="settings-row-icon" style="background:var(--md-secondary-container);color:var(--md-on-secondary-container);">${Icon.audit}</span>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:14px;">New count session</div>
          <div class="text-muted" style="font-size:12px;margin-top:1px;">Full inventory, a category, or just low-stock items</div>
        </div>
        ${Icon.chevronRight}
      </div>

      ${completed.length ? `
        <div class="section-label">Completed</div>
        ${completed.map(sessionCard).join('')}
      ` : ''}

      ${(!inProgress.length && !completed.length) ? `
        <div class="empty-state">
          <div class="empty-state-icon">${Icon.audit}</div>
          <div class="empty-state-title">No counts yet</div>
          <div class="empty-state-desc">Run a physical count to reconcile actual stock with your system records — anytime, on any subset of items.</div>
        </div>
      ` : ''}
    </div>
  `;

  root.querySelector('#start-audit-card').addEventListener('click', () => Forms.openNewAudit());
  root.querySelectorAll('[data-audit-id]').forEach(el => {
    el.addEventListener('click', () => Screens.openAuditSession(el.dataset.auditId));
  });
};

function sessionCard(audit) {
  const pct = audit.totalItems ? Math.round((audit.countedItems / audit.totalItems) * 100) : 0;
  const isDone = audit.status === 'completed';
  return `
    <div class="card" data-audit-id="${audit.id}" style="cursor:pointer;">
      <div class="flex-between">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escape(audit.name)}</div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">${Utils.formatDate(audit.createdAt)} · ${audit.totalItems} items</div>
        </div>
        <span class="chip ${isDone ? 'chip-ok' : 'chip-audit'}">${isDone ? 'Completed' : 'In progress'}</span>
      </div>
      ${!isDone ? `<div class="audit-progress-bar"><div class="audit-progress-fill" style="width:${pct}%"></div></div>` : `
        <div style="display:flex;gap:14px;margin-top:12px;">
          <span style="font-size:12px;color:var(--md-secondary);font-weight:600;">${audit.matchedItems} matched</span>
          ${audit.varianceItems ? `<span style="font-size:12px;color:var(--md-error);font-weight:600;">${audit.varianceItems} variance</span>` : ''}
        </div>
      `}
    </div>
  `;
}

/* ============================================================
   Count entry session (full-screen dialog)
   ============================================================ */

Screens.openAuditSession = async function (auditId) {
  const audit = await StockDB.Audits.get(auditId);
  if (!audit) return App.toast('Count session not found', { type: 'error' });
  let lines = await StockDB.Audits.linesFor(auditId);
  lines.sort((a, b) => a.itemName.localeCompare(b.itemName));

  const isDone = audit.status === 'completed';
  const render = () => buildAuditHTML(audit, lines, isDone);

  const { dialog, close } = UI.openDialog(render());
  wireAuditSession(dialog, close, audit, lines, isDone);
};

function buildAuditHTML(audit, lines, isDone) {
  const counted = lines.filter(l => l.counted).length;
  const pct = lines.length ? Math.round((counted / lines.length) * 100) : 0;
  const matched = lines.filter(l => l.counted && l.variance === 0).length;
  const variance = lines.filter(l => l.counted && l.variance !== 0).length;

  return `
    <div class="topbar">
      <button class="icon-btn" data-act="back">${Icon.back}</button>
      <div class="topbar-title-group">
        <p class="topbar-eyebrow" id="audit-eyebrow">${isDone ? 'Completed' : 'Counting'} · ${counted}/${lines.length}</p>
        <h1 class="topbar-title">${Utils.escape(audit.name)}</h1>
      </div>
      ${!isDone ? `<button class="icon-btn" data-act="menu">${Icon.moreVert}</button>` : ''}
    </div>
    <div class="screen" style="padding-bottom:${isDone ? '32px' : '110px'};">
      <div class="screen-pad">
        <div class="audit-progress-bar" style="margin-top:2px;"><div class="audit-progress-fill" id="audit-progress-fill" style="width:${pct}%"></div></div>
        <div style="display:flex;gap:16px;margin:10px 0 4px;" id="audit-stat-line">${statLineHTML(counted, lines.length, matched, variance)}</div>

        <div class="section-label" style="margin-top:20px;">Items</div>
        <div id="audit-lines">
          ${lines.map(l => auditLineRow(l, isDone)).join('')}
        </div>
      </div>
    </div>
    ${!isDone ? `
      <div style="position:absolute;left:0;right:0;bottom:0;padding:14px 20px calc(16px + var(--sab));background:var(--md-surface-1);border-top:1px solid var(--md-outline-variant);display:flex;gap:10px;">
        <button class="btn btn-outlined btn-block" data-act="save-exit">Save & exit</button>
        <button class="btn btn-filled secondary btn-block" data-act="finish" id="audit-finish-btn" ${counted === 0 ? 'disabled' : ''}>Review & finish</button>
      </div>
    ` : ''}
  `;
}

function statLineHTML(counted, total, matched, variance) {
  return `<span style="font-size:12px;color:var(--md-on-surface-variant);"><strong style="color:var(--md-on-surface);">${counted}</strong>/${total} counted</span>
    <span style="font-size:12px;color:var(--md-secondary);"><strong>${matched}</strong> matched</span>
    ${variance ? `<span style="font-size:12px;color:var(--md-error);"><strong>${variance}</strong> variance</span>` : ''}`;
}

function auditLineRow(line, isDone) {
  const hasVariance = line.counted && line.variance !== 0;
  const rowClass = line.counted ? (hasVariance ? 'variance' : 'counted') : '';
  return `
    <div class="count-row ${rowClass}" data-line-id="${line.id}">
      <span class="item-icon" style="width:38px;height:38px;font-size:13px;">${Utils.initials(line.itemName)}</span>
      <div class="count-row-body">
        <div class="list-item-title" style="font-size:13.5px;">${Utils.escape(line.itemName)}</div>
        <div class="count-row-sys">System: ${line.systemQty} ${Utils.escape(line.unit)}</div>
        ${line.counted ? `
          <div class="variance-badge ${line.variance > 0 ? 'pos' : line.variance < 0 ? 'neg' : ''}" style="${line.variance === 0 ? 'color:var(--md-secondary)' : ''}">
            ${line.variance === 0 ? '✓ Matches' : `${line.variance > 0 ? '+' : ''}${line.variance} vs system`}
          </div>
        ` : ''}
      </div>
      ${isDone
        ? `<div class="list-item-trail"><div class="list-item-qty" style="font-size:17px;">${line.counted ? line.countedQty : '—'}</div><div class="list-item-qty-unit">counted</div></div>`
        : `<input type="number" class="count-row-input" inputmode="decimal" step="any" placeholder="—" value="${line.countedQty ?? ''}" data-line-input="${line.id}">`
      }
    </div>
  `;
}

function wireAuditSession(dialog, close, audit, lines, isDone) {
  dialog.querySelector('[data-act="back"]').addEventListener('click', async () => {
    close();
    await App.rerender();
  });

  if (isDone) return;

  const menuBtn = dialog.querySelector('[data-act="menu"]');
  menuBtn?.addEventListener('click', () => {
    const html = `
      <div class="sheet-header"><h3 class="sheet-title">Count options</h3></div>
      <div class="sheet-body">
        <button class="settings-row" id="opt-cancel" style="width:100%;text-align:left;">
          <span class="settings-row-icon">${Icon.trash}</span>
          <span class="settings-row-body"><span class="settings-row-title">Cancel this count</span><span class="settings-row-sub">Discard progress, no changes applied</span></span>
        </button>
      </div>
    `;
    const { sheet, close: closeSheet } = UI.openSheet(html);
    sheet.querySelector('#opt-cancel').addEventListener('click', async () => {
      closeSheet();
      const ok = await UI.confirm({ title: 'Cancel count session?', message: 'Progress will be discarded. Nothing will be applied to your inventory.', confirmLabel: 'Discard', danger: true });
      if (ok) {
        await StockDB.Audits.cancel(audit.id);
        App.toast('Count session cancelled');
        close();
        await App.rerender();
      }
    });
  });

  // debounced save per line
  const saveHandlers = new Map();
  dialog.querySelectorAll('[data-line-input]').forEach(input => {
    const lineId = input.dataset.lineInput;
    const handler = Utils.debounce(async (val) => {
      const row = input.closest('.count-row');
      if (val === '' || val == null) {
        await StockDB.Audits.clearCount(lineId);
        row.classList.remove('counted', 'variance');
        row.querySelector('.count-row-body').querySelectorAll('.variance-badge').forEach(b => b.remove());
      } else {
        const updated = await StockDB.Audits.recordCount(lineId, Number(val));
        row.classList.remove('counted', 'variance');
        row.classList.add(updated.variance === 0 ? 'counted' : 'variance');
        let badge = row.querySelector('.variance-badge');
        const body = row.querySelector('.count-row-body');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'variance-badge';
          body.appendChild(badge);
        }
        if (updated.variance === 0) {
          badge.className = 'variance-badge';
          badge.style.color = 'var(--md-secondary)';
          badge.textContent = '✓ Matches';
        } else {
          badge.className = `variance-badge ${updated.variance > 0 ? 'pos' : 'neg'}`;
          badge.style.color = '';
          badge.textContent = `${updated.variance > 0 ? '+' : ''}${updated.variance} vs system`;
        }
      }
      await updateHeaderStats(dialog, audit.id, lines.length);
    }, 350);
    saveHandlers.set(lineId, handler);
    input.addEventListener('input', (e) => handler(e.target.value));
  });

  dialog.querySelector('[data-act="save-exit"]').addEventListener('click', async () => {
    App.toast('Progress saved', { type: 'success' });
    close();
    await App.rerender();
  });

  dialog.querySelector('[data-act="finish"]').addEventListener('click', async () => {
    const freshLines = await StockDB.Audits.linesFor(audit.id);
    const uncounted = freshLines.filter(l => !l.counted).length;
    const variance = freshLines.filter(l => l.counted && l.variance !== 0);

    openFinishReview(audit, freshLines, uncounted, variance, close);
  });
}

async function updateHeaderStats(dialog, auditId, totalLines) {
  const freshLines = await StockDB.Audits.linesFor(auditId);
  const counted = freshLines.filter(l => l.counted).length;
  const matched = freshLines.filter(l => l.counted && l.variance === 0).length;
  const variance = freshLines.filter(l => l.counted && l.variance !== 0).length;
  const pct = totalLines ? Math.round((counted / totalLines) * 100) : 0;

  const eyebrow = dialog.querySelector('#audit-eyebrow');
  if (eyebrow) eyebrow.textContent = `Counting · ${counted}/${totalLines}`;

  const fill = dialog.querySelector('#audit-progress-fill');
  if (fill) fill.style.width = `${pct}%`;

  const statLine = dialog.querySelector('#audit-stat-line');
  if (statLine) statLine.innerHTML = statLineHTML(counted, totalLines, matched, variance);

  const finishBtn = dialog.querySelector('#audit-finish-btn');
  if (finishBtn) finishBtn.disabled = counted === 0;
}

function openFinishReview(audit, lines, uncounted, varianceLines, closeAuditDialog) {
  const matched = lines.filter(l => l.counted && l.variance === 0).length;
  const html = `
    <div class="sheet-header">
      <h3 class="sheet-title">Finish count</h3>
      <button class="icon-btn" data-act="close">${Icon.close}</button>
    </div>
    <div class="sheet-body">
      <div class="card">
        <div class="stat-row"><span class="stat-row-label">Items counted</span><span class="stat-row-value">${lines.length - uncounted} / ${lines.length}</span></div>
        <div class="stat-row"><span class="stat-row-label">Matched system record</span><span class="stat-row-value pos">${matched}</span></div>
        <div class="stat-row"><span class="stat-row-label">Variances found</span><span class="stat-row-value ${varianceLines.length ? 'neg' : ''}">${varianceLines.length}</span></div>
        ${uncounted ? `<div class="stat-row"><span class="stat-row-label">Not counted (left as-is)</span><span class="stat-row-value">${uncounted}</span></div>` : ''}
      </div>

      ${varianceLines.length ? `
        <div class="section-label">Variances</div>
        ${varianceLines.map(l => `
          <div class="count-row variance" style="margin-bottom:8px;">
            <span class="item-icon" style="width:38px;height:38px;font-size:13px;">${Utils.initials(l.itemName)}</span>
            <div class="count-row-body">
              <div class="list-item-title" style="font-size:13.5px;">${Utils.escape(l.itemName)}</div>
              <div class="count-row-sys">System ${l.systemQty} → Counted ${l.countedQty}</div>
            </div>
            <div class="variance-badge ${l.variance > 0 ? 'pos' : 'neg'}" style="font-size:13px;">${l.variance > 0 ? '+' : ''}${l.variance}</div>
          </div>
        `).join('')}
        <p class="field-hint" style="margin-bottom:0;">Finishing will update system quantities to match your physical count for these items, and log an audit-adjustment movement for each.</p>
      ` : `<p class="text-muted" style="text-align:center;padding:16px 0;">No variances — everything matches.</p>`}
    </div>
    <div class="sheet-footer">
      <button class="btn btn-outlined btn-block" data-act="back">Back to counting</button>
      <button class="btn btn-filled secondary btn-block" data-act="confirm">Finish & apply</button>
    </div>
  `;
  const { sheet, close: closeSheet } = UI.openSheet(html);
  sheet.querySelector('[data-act="close"]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-act="back"]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
    await StockDB.Audits.complete(audit.id, { applyAdjustments: true });
    App.toast('Count completed — inventory reconciled', { type: 'success' });
    closeSheet();
    closeAuditDialog();
    await App.rerender();
  });
}
