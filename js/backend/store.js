'use strict';
/* NPD backend (in-browser) – local record store.
 * Every record: { id, ...fields, updatedAt, updatedBy, deleted? }.  Deleting only sets deleted:true (a tombstone),
 * so deletions survive a sync.  Merge = per record, newest updatedAt wins.  IDs are unique across devices. */
(function (g) {
  const NPDB = g.NPDB, { clone, nowStr } = NPDB;

  const COLLECTIONS = ['organizers', 'sports', 'photographers', 'funds', 'venues', 'venue_sports', 'members', 'sessions',
    'session_participants', 'revenue_records', 'expenses', 'photographer_payments', 'fund_transactions', 'profit_sharing',
    'profit_sharing_lines', 'member_credits', 'member_skills', 'session_matches', 'member_photos', 'settings', 'audit_logs'];
  const SCHEMA = 2;

  const state = { data: {}, dirty: 0, journal: null, user: 'system', listeners: [], meta: { createdAt: new Date().toISOString() } };
  COLLECTIONS.forEach(c => { state.data[c] = new Map(); });

  let _last = 0;
  const newId = () => { let id = Date.now() * 1000 + Math.floor(Math.random() * 1000); if (id <= _last) id = _last + 1; _last = id; return id; };
  const stamp = r => { r.updatedAt = new Date().toISOString(); r.updatedBy = state.user; return r; };
  const emit = () => state.listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });

  const store = {
    COLLECTIONS, SCHEMA, state,
    setUser(u) { state.user = u || 'system'; },
    onChange(f) { state.listeners.push(f); },
    all(c) { const out = []; for (const r of state.data[c].values()) if (!r.deleted) out.push(r); return out; },
    allRaw(c) { return [...state.data[c].values()]; },
    get(c, id) { const r = state.data[c].get(Number(id)) || state.data[c].get(id); return r && !r.deleted ? r : null; },
    find(c, f) { for (const r of state.data[c].values()) if (!r.deleted && f(r)) return r; return null; },
    filter(c, f) { return store.all(c).filter(f); },
    _log(c, id) { if (state.journal && !state.journal.has(c + ':' + id)) { const p = state.data[c].get(id); state.journal.set(c + ':' + id, { c, id, prev: p ? clone(p) : null }); } },
    /** Insert a new record; returns it (with id). */
    insert(c, rec) {
      const id = rec.id || newId();
      const r = Object.assign({}, rec, { id });
      if (!r.created_at && c !== 'settings') r.created_at = nowStr();
      store._log(c, id); state.data[c].set(id, stamp(r)); state.dirty++; emit(); return r;
    },
    /** Merge fields into an existing record. */
    update(c, id, patch) {
      const r = state.data[c].get(Number(id)) || state.data[c].get(id);
      if (!r) return null;
      store._log(c, r.id); Object.assign(r, patch); stamp(r); state.dirty++; emit(); return r;
    },
    remove(c, id) {
      const r = state.data[c].get(Number(id)) || state.data[c].get(id);
      if (!r || r.deleted) return;
      store._log(c, r.id); r.deleted = true; stamp(r); state.dirty++; emit();
    },
    /** Run fn atomically: any thrown error restores every touched record. */
    tx(fn) {
      if (state.journal) return fn();           // nested – outer transaction decides
      state.journal = new Map();
      try { const out = fn(); state.journal = null; return out; }
      catch (e) {
        for (const { c, id, prev } of state.journal.values()) { if (prev) state.data[c].set(id, prev); else state.data[c].delete(id); }
        state.journal = null; state.dirty = Math.max(0, state.dirty); emit(); throw e;
      }
    },
    // ---- settings (one record per key, id = key)
    setting(key, def = null) { const r = state.data.settings.get(key); return r && !r.deleted ? r.value : def; },
    setSetting(key, value) {
      const v = String(value); const r = state.data.settings.get(key);
      if (r && r.value === v && !r.deleted) return;
      store._log('settings', key);
      const rec = r ? Object.assign(r, { value: v, deleted: undefined }) : { id: key, key, value: v };
      if (!r) state.data.settings.set(key, rec); stamp(rec); delete rec.deleted; state.dirty++; emit();
    },
    nextCode(c, field, prefix, width) {
      let max = 0; const re = new RegExp('^' + prefix.replace(/[-]/g, '\\-') + '(\\d+)$');
      for (const r of state.data[c].values()) { const m = re.exec(r[field] || ''); if (m) max = Math.max(max, +m[1]); }
      return prefix + String(max + 1).padStart(width, '0');
    },
    audit(action, entity, entityId, detail) {
      store.insert('audit_logs', { username: state.user, action, entity, entity_id: entityId === undefined || entityId === null ? null : String(entityId), detail: detail === undefined ? null : JSON.stringify(detail) });
    },
    // ---- serialisation / merge
    exportAll() {
      const collections = {}; COLLECTIONS.forEach(c => { collections[c] = [...state.data[c].values()]; });
      return { schema: SCHEMA, app: 'npd', createdAt: state.meta.createdAt, updatedAt: new Date().toISOString(), collections };
    },
    /** Merge a remote export into local data. Returns {changed, remoteNewer} – newest updatedAt wins per record. */
    mergeIn(remote) {
      let changed = 0, localOnly = 0;
      if (!remote || !remote.collections) return { changed, localOnly };
      COLLECTIONS.forEach(c => {
        const incoming = remote.collections[c] || []; const seen = new Set();
        incoming.forEach(r => {
          seen.add(String(r.id)); const mine = state.data[c].get(r.id);
          if (!mine || (r.updatedAt || '') > (mine.updatedAt || '')) { state.data[c].set(r.id, r); changed++; }
        });
        for (const r of state.data[c].values()) if (!seen.has(String(r.id))) localOnly++;
      });
      emit(); return { changed, localOnly };
    },
    importAll(obj) { COLLECTIONS.forEach(c => { state.data[c] = new Map(); (obj.collections[c] || []).forEach(r => state.data[c].set(r.id, r)); }); if (obj.createdAt) state.meta.createdAt = obj.createdAt; emit(); },
    /** Replace everything with a backup. Records missing from the backup become tombstones so a later sync cannot resurrect them. */
    restoreFrom(obj) {
      const now = new Date().toISOString(); let n = 0;
      COLLECTIONS.forEach(c => {
        const next = new Map(); (obj.collections[c] || []).forEach(r => { if (r.deleted) return; next.set(r.id, Object.assign({}, r, { updatedAt: now, updatedBy: state.user })); n++; });
        for (const [id, r] of state.data[c]) if (!next.has(id)) next.set(id, { id, deleted: true, updatedAt: now, updatedBy: state.user });
        state.data[c] = next;
      });
      state.dirty += n + 1; emit(); return n;
    },
    isEmpty() { return state.data.funds.size === 0; },
    // ---- local persistence (IndexedDB, falls back to localStorage, then memory)
    async load() {
      try {
        const raw = await kvGet('npd.db.v2'); if (raw) { store.importAll(raw.db); state.dirty = raw.dirty || 0; }
      } catch (e) { /* start empty */ }
    },
    _timer: null,
    saveSoon() { clearTimeout(store._timer); store._timer = setTimeout(() => store.saveNow(), 250); },
    async saveNow() { let okk = false; try { okk = await kvSet('npd.db.v2', { db: store.exportAll(), dirty: state.dirty }); } catch (e) { okk = false; } const was = state.persistError; state.persistError = !okk; if (was !== state.persistError) emit(); },
    clearAll() { COLLECTIONS.forEach(c => { state.data[c] = new Map(); }); state.dirty = 0; emit(); },
  };
  store.onChange(() => store.saveSoon());

  // ---- tiny key/value storage
  function idb() {
    return new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
      const rq = indexedDB.open('npd', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  }
  async function kvGet(k) {
    try { const db = await idb(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
    catch (e) { try { return JSON.parse(localStorage.getItem(k)); } catch (e2) { return null; } }
  }
  async function kvSet(k, v) {
    try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); return true; }
    catch (e) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e2) { return false; } }
  }
  NPDB.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
