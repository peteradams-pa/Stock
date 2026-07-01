/* ============================================================
   StockCount — UI primitives: bottom sheet, dialog, confirm
   ============================================================ */

const UI = {
  _sheetStack: [],

  /**
   * Open a bottom sheet with given inner HTML content.
   * Returns { el, close } for the caller to bind events / close programmatically.
   */
  openSheet(innerHTML, opts = {}) {
    const root = document.getElementById('overlay-root');
    const scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="sheet-handle"></div>${innerHTML}`;
    root.appendChild(scrim);
    root.appendChild(sheet);

    const close = () => {
      scrim.classList.remove('open');
      sheet.classList.remove('open');
      setTimeout(() => { scrim.remove(); sheet.remove(); }, 260);
    };

    if (!opts.persistent) {
      scrim.addEventListener('click', close);
    }

    requestAnimationFrame(() => {
      scrim.classList.add('open');
      sheet.classList.add('open');
    });

    return { sheet, scrim, close };
  },

  /**
   * Open a full-screen dialog (slide from right) for detail/edit views.
   */
  openDialog(innerHTML) {
    const root = document.getElementById('overlay-root');
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.innerHTML = innerHTML;
    root.appendChild(dialog);

    const close = () => {
      dialog.classList.remove('open');
      setTimeout(() => dialog.remove(), 240);
    };

    requestAnimationFrame(() => dialog.classList.add('open'));
    return { dialog, close };
  },

  confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      const html = `
        <div class="sheet-header"><h3 class="sheet-title">${Utils.escape(title)}</h3></div>
        <div class="sheet-body">
          <p class="text-muted" style="margin:0 0 4px;line-height:1.55;">${Utils.escape(message)}</p>
        </div>
        <div class="sheet-footer">
          <button class="btn btn-outlined btn-block" data-act="cancel">${Utils.escape(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn-error' : 'btn-filled'} btn-block" data-act="ok">${Utils.escape(confirmLabel)}</button>
        </div>`;
      const { sheet, close } = this.openSheet(html);
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', () => { close(); resolve(false); });
      sheet.querySelector('[data-act="ok"]').addEventListener('click', () => { close(); resolve(true); });
    });
  },
};

window.UI = UI;
