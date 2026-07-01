/* ============================================================
   StockCount — App core: state, router, toast, helpers
   ============================================================ */

const App = {
  state: {
    tab: 'dashboard',      // dashboard | inventory | audit | history | settings
    items: [],
    movements: [],
    audits: [],
    categories: [],
    searchQuery: '',
    categoryFilter: 'all',
    activeAudit: null,     // audit currently in progress being worked on
  },

  els: {},

  async init() {
    this.els.root = document.getElementById('app');
    this.els.screen = document.getElementById('screen');
    this.els.toastWrap = document.getElementById('toast-wrap');
    this.els.navItems = document.querySelectorAll('.nav-item');

    await StockDB.openDB();
    await StockDB.seedDemoData();

    await this.refreshData();
    this.bindNav();
    this.render();

    // register service worker for offline + standalone
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW failed', e); }
    }
  },

  async refreshData() {
    const [items, movements, audits, categories] = await Promise.all([
      StockDB.Items.list(),
      StockDB.Movements.list(),
      StockDB.Audits.list(),
      StockDB.Items.categories(),
    ]);
    this.state.items = items;
    this.state.movements = movements;
    this.state.audits = audits;
    this.state.categories = categories;
  },

  bindNav() {
    this.els.navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.tab = btn.dataset.tab;
        this.render();
      });
    });
  },

  updateNav() {
    this.els.navItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === this.state.tab);
    });
  },

  async render() {
    this.updateNav();
    const screen = this.els.screen;
    screen.scrollTop = 0;

    switch (this.state.tab) {
      case 'dashboard': return Screens.dashboard(screen);
      case 'inventory': return Screens.inventory(screen);
      case 'audit': return Screens.audit(screen);
      case 'history': return Screens.history(screen);
      case 'settings': return Screens.settings(screen);
      default: return Screens.dashboard(screen);
    }
  },

  async rerender() {
    await this.refreshData();
    await this.render();
  },

  goTab(tab) {
    this.state.tab = tab;
    this.render();
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
      setTimeout(() => el.remove(), 260);
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
