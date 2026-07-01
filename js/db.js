/* ============================================================
   StockCount — IndexedDB data layer
   Pure quantity-based inventory: items, movements, audits
   ============================================================ */

const DB_NAME = 'stockcount-db';
const DB_VERSION = 1;

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // ---- items ----
      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('sku', 'sku', { unique: true });
        items.createIndex('name', 'name', { unique: false });
        items.createIndex('category', 'category', { unique: false });
        items.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // ---- movements (stock in / stock out) ----
      if (!db.objectStoreNames.contains('movements')) {
        const movements = db.createObjectStore('movements', { keyPath: 'id' });
        movements.createIndex('itemId', 'itemId', { unique: false });
        movements.createIndex('type', 'type', { unique: false });
        movements.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // ---- audits (audit session header) ----
      if (!db.objectStoreNames.contains('audits')) {
        const audits = db.createObjectStore('audits', { keyPath: 'id' });
        audits.createIndex('status', 'status', { unique: false });
        audits.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // ---- audit_lines (per-item counts within an audit) ----
      if (!db.objectStoreNames.contains('audit_lines')) {
        const lines = db.createObjectStore('audit_lines', { keyPath: 'id' });
        lines.createIndex('auditId', 'auditId', { unique: false });
        lines.createIndex('itemId', 'itemId', { unique: false });
      }

      // ---- categories ----
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }

      // ---- settings (kv) ----
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function tx(storeNames, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ============================================================
   Generic store helpers
   ============================================================ */

async function getAll(storeName) {
  const t = await tx([storeName]);
  return reqToPromise(t.objectStore(storeName).getAll());
}

async function getById(storeName, id) {
  const t = await tx([storeName]);
  return reqToPromise(t.objectStore(storeName).get(id));
}

async function put(storeName, obj) {
  const t = await tx([storeName], 'readwrite');
  await reqToPromise(t.objectStore(storeName).put(obj));
  return obj;
}

async function del(storeName, id) {
  const t = await tx([storeName], 'readwrite');
  return reqToPromise(t.objectStore(storeName).delete(id));
}

async function getByIndex(storeName, indexName, value) {
  const t = await tx([storeName]);
  return reqToPromise(t.objectStore(storeName).index(indexName).getAll(value));
}

async function clearStore(storeName) {
  const t = await tx([storeName], 'readwrite');
  return reqToPromise(t.objectStore(storeName).clear());
}

/* ============================================================
   Items
   ============================================================ */

const Items = {
  async list() {
    const items = await getAll('items');
    return items.sort((a, b) => a.name.localeCompare(b.name));
  },

  async get(id) {
    return getById('items', id);
  },

  async getBySku(sku) {
    const t = await tx(['items']);
    const res = await reqToPromise(t.objectStore('items').index('sku').get(sku));
    return res || null;
  },

  async create(data) {
    const now = Date.now();
    const item = {
      id: uid(),
      sku: (data.sku || '').trim(),
      name: (data.name || '').trim(),
      category: data.category || 'Uncategorized',
      unit: data.unit || 'pcs',
      qty: Number(data.qty) || 0,
      reorderPoint: Number(data.reorderPoint) || 0,
      location: data.location || '',
      notes: data.notes || '',
      createdAt: now,
      updatedAt: now,
    };
    await put('items', item);

    // if starting qty > 0, log as an opening movement so history is complete
    if (item.qty > 0) {
      await Movements.log({
        itemId: item.id,
        type: 'in',
        qty: item.qty,
        reason: 'Opening balance',
        ref: '',
        balanceAfter: item.qty,
      }, { skipQtyUpdate: true });
    }
    return item;
  },

  async update(id, patch) {
    const item = await getById('items', id);
    if (!item) throw new Error('Item not found');
    const updated = { ...item, ...patch, id: item.id, updatedAt: Date.now() };
    await put('items', updated);
    return updated;
  },

  async remove(id) {
    await del('items', id);
    const movs = await getByIndex('movements', 'itemId', id);
    for (const m of movs) await del('movements', m.id);
    const lines = await getByIndex('audit_lines', 'itemId', id);
    for (const l of lines) await del('audit_lines', l.id);
  },

  async adjustQty(id, delta) {
    const item = await getById('items', id);
    if (!item) throw new Error('Item not found');
    const newQty = Math.max(0, item.qty + delta);
    const updated = { ...item, qty: newQty, updatedAt: Date.now() };
    await put('items', updated);
    return updated;
  },

  async setQty(id, qty) {
    const item = await getById('items', id);
    if (!item) throw new Error('Item not found');
    const updated = { ...item, qty: Math.max(0, qty), updatedAt: Date.now() };
    await put('items', updated);
    return updated;
  },

  async categories() {
    const items = await getAll('items');
    const set = new Set(items.map(i => i.category || 'Uncategorized'));
    return Array.from(set).sort();
  },

  async lowStock() {
    const items = await getAll('items');
    return items.filter(i => i.reorderPoint > 0 && i.qty <= i.reorderPoint);
  },

  async stats() {
    const items = await getAll('items');
    const totalUnits = items.reduce((s, i) => s + i.qty, 0);
    const lowCount = items.filter(i => i.reorderPoint > 0 && i.qty <= i.reorderPoint).length;
    const zeroCount = items.filter(i => i.qty === 0).length;
    return {
      skuCount: items.length,
      totalUnits,
      lowCount,
      zeroCount,
    };
  },
};

/* ============================================================
   Movements (stock in / stock out)
   ============================================================ */

const Movements = {
  async list(limit = null) {
    const movs = await getAll('movements');
    movs.sort((a, b) => b.createdAt - a.createdAt);
    return limit ? movs.slice(0, limit) : movs;
  },

  async forItem(itemId) {
    const movs = await getByIndex('movements', 'itemId', itemId);
    return movs.sort((a, b) => b.createdAt - a.createdAt);
  },

  /**
   * Log a movement. By default also applies the qty delta to the item.
   * type: 'in' | 'out' | 'audit-adjust'
   */
  async log(data, opts = {}) {
    const now = Date.now();
    const mov = {
      id: uid(),
      itemId: data.itemId,
      type: data.type, // 'in' | 'out' | 'audit-adjust'
      qty: Number(data.qty) || 0,
      reason: data.reason || '',
      ref: data.ref || '',
      note: data.note || '',
      balanceAfter: data.balanceAfter ?? null,
      createdAt: data.createdAt || now,
      auditId: data.auditId || null,
    };
    await put('movements', mov);

    if (!opts.skipQtyUpdate) {
      const item = await getById('items', data.itemId);
      if (item) {
        let newQty = item.qty;
        if (data.type === 'in') newQty += mov.qty;
        else if (data.type === 'out') newQty -= mov.qty;
        else if (data.type === 'audit-adjust') newQty = mov.qty; // qty here is the absolute new value
        newQty = Math.max(0, newQty);
        mov.balanceAfter = newQty;
        await put('movements', mov);
        await put('items', { ...item, qty: newQty, updatedAt: now });
      }
    }
    return mov;
  },

  async remove(id) {
    await del('movements', id);
  },

  async recent(limit = 20) {
    return this.list(limit);
  },

  async statsToday() {
    const movs = await getAll('movements');
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const todayMovs = movs.filter(m => m.createdAt >= startOfDay.getTime());
    const inQty = todayMovs.filter(m => m.type === 'in').reduce((s,m)=>s+m.qty,0);
    const outQty = todayMovs.filter(m => m.type === 'out').reduce((s,m)=>s+m.qty,0);
    return { inQty, outQty, count: todayMovs.length };
  },
};

/* ============================================================
   Audits (physical count sessions)
   ============================================================ */

const Audits = {
  async list() {
    const audits = await getAll('audits');
    return audits.sort((a, b) => b.createdAt - a.createdAt);
  },

  async get(id) {
    return getById('audits', id);
  },

  async linesFor(auditId) {
    const lines = await getByIndex('audit_lines', 'auditId', auditId);
    return lines;
  },

  /**
   * Create a new audit session scoped to a set of item ids (or all items).
   */
  async create({ name, itemIds, scope, category }) {
    const now = Date.now();
    const audit = {
      id: uid(),
      name: name || `Count — ${new Date(now).toLocaleDateString()}`,
      status: 'in-progress', // in-progress | completed
      scope: scope || 'all', // 'all' | 'category' | 'selection'
      category: category || null,
      createdAt: now,
      completedAt: null,
      totalItems: itemIds.length,
      countedItems: 0,
      matchedItems: 0,
      varianceItems: 0,
    };
    await put('audits', audit);

    const allItems = await getAll('items');
    const itemMap = new Map(allItems.map(i => [i.id, i]));

    for (const itemId of itemIds) {
      const item = itemMap.get(itemId);
      if (!item) continue;
      const line = {
        id: uid(),
        auditId: audit.id,
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        unit: item.unit,
        systemQty: item.qty,
        countedQty: null,
        counted: false,
        variance: null,
        note: '',
      };
      await put('audit_lines', line);
    }

    return audit;
  },

  async recordCount(lineId, countedQty, note = '') {
    const t = await tx(['audit_lines']);
    const line = await reqToPromise(t.objectStore('audit_lines').get(lineId));
    if (!line) throw new Error('Line not found');
    const updated = {
      ...line,
      countedQty: Number(countedQty),
      counted: true,
      variance: Number(countedQty) - line.systemQty,
      note,
    };
    await put('audit_lines', updated);
    await this._recalcAuditProgress(line.auditId);
    return updated;
  },

  async clearCount(lineId) {
    const line = await getById('audit_lines', lineId);
    if (!line) throw new Error('Line not found');
    const updated = { ...line, countedQty: null, counted: false, variance: null };
    await put('audit_lines', updated);
    await this._recalcAuditProgress(line.auditId);
    return updated;
  },

  async _recalcAuditProgress(auditId) {
    const audit = await getById('audits', auditId);
    if (!audit) return;
    const lines = await this.linesFor(auditId);
    const countedItems = lines.filter(l => l.counted).length;
    const matchedItems = lines.filter(l => l.counted && l.variance === 0).length;
    const varianceItems = lines.filter(l => l.counted && l.variance !== 0).length;
    await put('audits', { ...audit, countedItems, matchedItems, varianceItems });
  },

  /**
   * Finalize the audit: for every counted line with a variance, write an
   * audit-adjust movement that reconciles system qty to the physical count.
   * Uncounted lines are left untouched (system qty stands).
   */
  async complete(auditId, { applyAdjustments = true } = {}) {
    const audit = await getById('audits', auditId);
    if (!audit) throw new Error('Audit not found');
    const lines = await this.linesFor(auditId);
    const now = Date.now();

    if (applyAdjustments) {
      for (const line of lines) {
        if (line.counted && line.variance !== 0) {
          await Movements.log({
            itemId: line.itemId,
            type: 'audit-adjust',
            qty: line.countedQty, // absolute new qty
            reason: 'Audit reconciliation',
            ref: audit.name,
            note: line.note || `Variance ${line.variance > 0 ? '+' : ''}${line.variance}`,
            auditId: audit.id,
            createdAt: now,
          });
        }
      }
    }

    const updated = { ...audit, status: 'completed', completedAt: now };
    await put('audits', updated);
    return updated;
  },

  async remove(id) {
    await del('audits', id);
    const lines = await getByIndex('audit_lines', 'auditId', id);
    for (const l of lines) await del('audit_lines', l.id);
  },

  async cancel(id) {
    const audit = await getById('audits', id);
    if (!audit) return;
    await put('audits', { ...audit, status: 'cancelled', completedAt: Date.now() });
  },
};

/* ============================================================
   Categories (lightweight, for form suggestions)
   ============================================================ */

const Categories = {
  async list() {
    const cats = await getAll('categories');
    return cats.map(c => c.name).sort();
  },
  async ensure(name) {
    if (!name) return;
    const t = await tx(['categories'], 'readwrite');
    const existing = await reqToPromise(t.objectStore('categories').getAll());
    if (!existing.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      await put('categories', { id: uid(), name });
    }
  },
};

/* ============================================================
   Settings
   ============================================================ */

const Settings = {
  async get(key, fallback = null) {
    const row = await getById('settings', key);
    return row ? row.value : fallback;
  },
  async set(key, value) {
    await put('settings', { key, value });
  },
};

/* ============================================================
   Export / Import (JSON backup — fully offline data portability)
   ============================================================ */

const DataIO = {
  async exportAll() {
    const [items, movements, audits, audit_lines, categories] = await Promise.all([
      getAll('items'), getAll('movements'), getAll('audits'), getAll('audit_lines'), getAll('categories'),
    ]);
    return {
      _app: 'StockCount',
      _version: DB_VERSION,
      exportedAt: Date.now(),
      items, movements, audits, audit_lines, categories,
    };
  },

  async importAll(data, { mode = 'merge' } = {}) {
    if (!data || !Array.isArray(data.items)) throw new Error('Invalid backup file');
    if (mode === 'replace') {
      await Promise.all(['items','movements','audits','audit_lines','categories'].map(clearStore));
    }
    for (const store of ['items','movements','audits','audit_lines','categories']) {
      const rows = data[store] || [];
      for (const row of rows) await put(store, row);
    }
    return true;
  },

  async wipeAll() {
    await Promise.all(['items','movements','audits','audit_lines','categories'].map(clearStore));
  },
};

async function seedDemoData() {
  const existing = await getAll('items');
  if (existing.length > 0) return false;

  const cats = ['Beverages', 'Snacks', 'Stationery', 'Cleaning'];
  for (const c of cats) await Categories.ensure(c);

  const demo = [
    { sku: 'BEV-001', name: 'Bottled Water 500ml', category: 'Beverages', unit: 'pcs', qty: 240, reorderPoint: 50, location: 'Aisle A1' },
    { sku: 'BEV-002', name: 'Soda Can 330ml', category: 'Beverages', unit: 'pcs', qty: 18, reorderPoint: 30, location: 'Aisle A2' },
    { sku: 'SNK-001', name: 'Potato Crisps 150g', category: 'Snacks', unit: 'pcs', qty: 76, reorderPoint: 20, location: 'Aisle B1' },
    { sku: 'STA-010', name: 'A4 Paper Ream', category: 'Stationery', unit: 'ream', qty: 12, reorderPoint: 10, location: 'Store Room' },
    { sku: 'STA-011', name: 'Ballpoint Pen (Black)', category: 'Stationery', unit: 'pcs', qty: 3, reorderPoint: 25, location: 'Store Room' },
    { sku: 'CLN-005', name: 'Multi-Surface Cleaner 1L', category: 'Cleaning', unit: 'bottle', qty: 40, reorderPoint: 15, location: 'Aisle C1' },
  ];
  for (const d of demo) await Items.create(d);
  return true;
}

window.StockDB = {
  openDB, uid,
  Items, Movements, Audits, Categories, Settings, DataIO,
  seedDemoData,
};
