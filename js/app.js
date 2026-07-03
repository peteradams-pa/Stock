/* ============================================================
   StockCount — App core: state, router, toast, helpers
   ============================================================ */

const App = {
  state: {
    tab: 'dashboard',      // dashboard | inventory | audit | history | settings
    items: [],
    movements: [],
    audits: [],
    categories: [],        // plain name list, alphabetical (back-compat)
    categoriesFull: [],     // [{id, name, prefix, nextSeq, count}]
    searchQuery: '',
    categoryFilter: 'all',
    activeAudit: null,     // audit currently in progress being worked on
  },

  els: {},

  // ---- render/nav guards to prevent double-tap stacking & redundant work ----
  _dataLoaded: false,
  _dataDirty: true,      // true = state.items/movements/audits are stale, need reload
  _rendering: false,
  _navLocked: false,

  async init() {
    this.els.root = document.getElementById('app');
    this.els.screen = document.getElementById('screen');
    this.els.toastWrap = document.getElementById('toast-wrap');
    this.els.navItems = document.querySelectorAll('.nav-item');

    await StockDB.openDB();
    await StockDB.seedDemoData();

    await this.refreshData();
    this.bindNav();
    await this.render();

    // register service worker for offline + standalone
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW failed', e); }
    }
  },

  /**
   * Reload all collections from IndexedDB. Only actually hits the DB when
   * data has been marked dirty (via markDirty()) — repeated taps on the
   * same tab, or opening/closing read-only views, don't re-query.
   */
  async refreshData(force = false) {
    if (this._dataLoaded && !this._dataDirty && !force) return;
    const [items, movements, audits, categories, categoriesFull] = await Promise.all([
      StockDB.Items.list(),
      StockDB.Movements.list(),
      StockDB.Audits.list(),
      StockDB.Items.categories(),
      StockDB.Categories.listWithCounts(),
    ]);
    this.state.items = items;
    this.state.movements = movements;
    this.state.audits = audits;
    this.state.categories = categories;
    this.state.categoriesFull = categoriesFull;
    this._dataLoaded = true;
    this._dataDirty = false;
  },

  /** Call after any write (create/update/delete) so the next render refetches. */
  markDirty() {
    this._dataDirty = true;
  },

  bindNav() {
    this.els.navItems.forEach(btn => {
      btn.addEventListener('click', () => this.goTab(btn.dataset.tab));
    });
  },

  updateNav() {
    this.els.navItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this.state.tab);
    });
  },

  /**
   * Render the current tab. Guarded against re-entrant calls so rapid
   * taps (nav, back button, etc.) can't pile up overlapping renders —
   * the most common source of perceived "lag" on quick navigation.
   */
  async render() {
    if (this._rendering) return;
    this._rendering = true;
    try {
      this.updateNav();
      const screen = this.els.screen;

      const renderFn = {
        dashboard: Screens.dashboard,
        inventory: Screens.inventory,
        audit: Screens.audit,
        history: Screens.history,
        settings: Screens.settings,
      }[this.state.tab] || Screens.dashboard;

      await renderFn(screen);
      screen.scrollTop = 0;
      // retrigger the fade-in animation (innerHTML swaps don't restart CSS
      // animations on their own — force a reflow so the transition replays)
      screen.classList.remove('screen-enter');
      void screen.offsetWidth;
      screen.classList.add('screen-enter');
    } finally {
      this._rendering = false;
    }
  },

  /**
   * Re-fetch data and render. Always used right after a mutation (create/
   * update/delete/movement/audit change), so this always forces a fresh
   * read — refreshData() itself still skips the DB round-trip anywhere
   * else in the app when nothing changed (e.g. plain tab switches).
   */
  async rerender() {
    this.markDirty();
    await this.refreshData();
    await this.render();
  },

  /**
   * Switch tabs. Ignores taps on the currently active tab (no-op re-render)
   * and short-circuits rapid double-taps while a nav transition is in flight.
   */
  goTab(tab) {
    if (this._navLocked) return;
    if (tab === this.state.tab) return;

    this._navLocked = true;
    this.state.tab = tab;
    // Data may have changed while the user was on another tab (e.g. logged
    // a movement then switched) — refreshData() below is a no-op unless dirty.
    this.render().finally(() => {
      // small unlock delay purely to swallow accidental double-taps,
      // not tied to any animation so it never feels sluggish
      setTimeout(() => { this._navLocked = false; }, 80);
    });
  },

  toast(message, opts = {}) {
    const wrap = this.els.toastWrap;
    const el = document.createElement('div');
    const type = opts.type || 'default';
    el.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    const icon = type === 'success' ? Icon.checkCircle : type === 'error' ? Icon.alertCircle : Icon.info;
    el.innerHTML = `${icon}<span>${Utils.escape(message)}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    }, 2400);
  },
};

/* ============================================================
   Utilities
   ============================================================ */

const Utils = {
  escape(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  },

  initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  },

  formatQty(qty, unit) {
    const n = Number(qty) || 0;
    const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return unit ? `${formatted} ${unit}` : formatted;
  },

  formatDate(ts, opts = {}) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (opts.timeOnly) return time;
    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }) + `, ${time}`;
  },

  formatDateShort(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  stockStatus(item) {
    if (item.qty === 0) return 'critical';
    if (item.reorderPoint > 0 && item.qty <= item.reorderPoint) return 'low';
    return 'healthy';
  },

  debounce(fn, wait = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  },

  downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  downloadCSV(rows, filename) {
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },
};

window.App = App;
window.Utils = Utils;

document.addEventListener('DOMContentLoaded', () => App.init());
