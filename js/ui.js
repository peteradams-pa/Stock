/* ============================================================
   StockCount — UI primitives: bottom sheet, dialog, confirm
   Rewritten to eliminate overlay stacking bugs, double-close races,
   and the "stuck" feeling caused by overlapping open/close calls.
   ============================================================ */

const UI = {
  _stack: [],          // stack of { el, scrim, kind, close }
  _closing: new WeakSet(),  // elements currently mid-close, guards double-close

  /**
   * Open a bottom sheet with given inner HTML content.
   * Returns { sheet, scrim, close }. close() is idempotent — safe to call
   * multiple times (e.g. scrim click racing with a button handler).
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

    let closed = false;
    const close = () => {
      if (closed) return;          // idempotent guard — prevents double-fire
      closed = true;
      this._pop(entry);
      scrim.classList.remove('open');
      sheet.classList.remove('open');
      const cleanup = () => { scrim.remove(); sheet.remove(); };
      // Belt-and-braces: remove on transitionend OR after a timeout fallback,
      // whichever fires first, so a dropped transitionend event (common when
      // the tab is backgrounded mid-animation) can never leave a ghost node
      // blocking taps underneath it.
      let done = false;
      const onEnd = () => { if (done) return; done = true; cleanup(); };
      sheet.addEventListener('transitionend', onEnd, { once: true });
      setTimeout(onEnd, 260);
    };

    if (!opts.persistent) {
      scrim.addEventListener('click', close, { once: true });
    }

    const entry = { el: sheet, scrim, kind: 'sheet', close };
    this._stack.push(entry);

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

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this._pop(entry);
      dialog.classList.remove('open');
      let done = false;
      const onEnd = () => { if (done) return; done = true; dialog.remove(); };
      dialog.addEventListener('transitionend', onEnd, { once: true });
      setTimeout(onEnd, 280);
    };

    const entry = { el: dialog, kind: 'dialog', close };
    this._stack.push(entry);

    requestAnimationFrame(() => dialog.classList.add('open'));
    return { dialog, close };
  },

  /** Pop a specific entry from the tracked stack (used internally by close()). */
  _pop(entry) {
    const i = this._stack.indexOf(entry);
    if (i !== -1) this._stack.splice(i, 1);
  },

  /** Close whatever overlay is currently on top, if any. Used for hardware/back gestures. */
  closeTop() {
    const top = this._stack[this._stack.length - 1];
    if (top) top.close();
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
      let settled = false;
      const settle = (val) => { if (settled) return; settled = true; resolve(val); };
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', () => { close(); settle(false); }, { once: true });
      sheet.querySelector('[data-act="ok"]').addEventListener('click', () => { close(); settle(true); }, { once: true });
    });
  },
};

// Hardware back / Escape key closes the top-most overlay instead of
// navigating the page — keeps back-navigation feeling instant and correct
// when a sheet or dialog is open.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') UI.closeTop();
});

window.UI = UI;
