'use strict';
/* NPD backend (in-browser) – GitHub sync.
 * One JSON file in a PRIVATE data repo (GitHub Contents API).  Each device keeps a full local copy and works offline.
 *  • push ~1.5 s after a change • pull on open, on focus, every 90 s, when back online
 *  • merge per record (newest updatedAt wins, deletions are tombstones) • refuses to sync if the data repo is public
 *  • the token is kept only in this device's localStorage – never in the app code, never in the repo. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store;
  const KEY = 'npd.sync.v1', DEBOUNCE = 1500, POLL = 90000, API = 'https://api.github.com';
  const ls = { get(k) { try { return g.localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { g.localStorage.setItem(k, v); return true; } catch (e) { return false; } }, del(k) { try { g.localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  const S = { state: 'off', message: '', lastSync: null, running: false, again: false, timer: null, poll: null, privOk: 0, listeners: [] };

  const cfg = () => { try { const c = JSON.parse(ls.get(KEY) || 'null'); return c && c.token && c.owner && c.repo ? c : null; } catch (e) { return null; } };
  const online = () => (typeof g.navigator === 'undefined' || g.navigator.onLine !== false);
  const emit = () => S.listeners.forEach(f => { try { f(status()); } catch (e) { /* ignore */ } });
  function setState(state, message) { S.state = state; S.message = message || ''; emit(); }
  function status() {
    const c = cfg(), pending = T.state.dirty;
    let st = S.state;
    if (!c) st = 'off'; else if (st === 'ok' && pending > 0) st = 'pending'; else if (st === 'ok' && !online()) st = 'offline';
    if (T.state.persistError) return { state: 'error', message: 'Perangkat gagal menyimpan data (penyimpanan penuh atau diblokir). Jangan tutup aplikasi; unduh backup sekarang.', pending, lastSync: S.lastSync, configured: !!c, repo: c ? `${c.owner}/${c.repo}` : '' };
    return { state: st, message: S.message, pending, lastSync: S.lastSync, configured: !!c, repo: c ? `${c.owner}/${c.repo}` : '' };
  }

  // ---- base64 <-> utf8 (chunked, safe for large files)
  function toB64(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return g.btoa(s); }
  function fromB64(b64) { const s = g.atob(b64.replace(/\s/g, '')), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder().decode(b); }

  class SyncError extends Error { constructor(m, code) { super(m); this.code = code; } }
  async function gh(c, method, path, body) {
    let res;
    try {
      res = await g.fetch(API + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) { throw new SyncError('Tidak ada koneksi ke GitHub.', 'offline'); }
    let data = null; try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok) return data;
    const msg = data && data.message ? data.message : 'HTTP ' + res.status;
    if (res.status === 401) throw new SyncError('Token ditolak atau kedaluwarsa. Buat token baru lalu simpan lagi di Pengaturan.', 'auth');
    if (res.status === 403 && /rate limit/i.test(msg)) throw new SyncError('GitHub membatasi permintaan sementara. Coba lagi beberapa menit.', 'rate');
    if (res.status === 403) throw new SyncError('Token tidak punya izin "Contents: Read and write" untuk repo data.', 'auth');
    if (res.status === 404) throw new SyncError('Repo atau file tidak ditemukan (atau token tidak punya akses ke repo itu).', 'notfound');
    if (res.status === 409 || res.status === 422) throw new SyncError(msg, 'conflict');
    throw new SyncError('GitHub error: ' + msg, 'http');
  }
  const fpath = c => `/repos/${c.owner}/${c.repo}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`;

  async function assertPrivate(c, force) {
    if (!force && Date.now() - S.privOk < 600000) return;
    const r = await gh(c, 'GET', `/repos/${c.owner}/${c.repo}`);
    if (r.private !== true) throw new SyncError('Repo data ini PUBLIK. Sinkronisasi dihentikan supaya data keuangan tidak terbuka. Jadikan repo Private dulu.', 'public');
    S.privOk = Date.now(); return r;
  }
  /** → { sha, data } or null when the file does not exist yet */
  async function fetchRemote(c) {
    let f;
    try { f = await gh(c, 'GET', `${fpath(c)}?ref=${encodeURIComponent(c.branch)}`); }
    catch (e) { if (e.code === 'notfound') { await gh(c, 'GET', `/repos/${c.owner}/${c.repo}`); return null; } throw e; }  // repo missing → rethrown above
    let text;
    if (f.content && f.encoding === 'base64') text = fromB64(f.content);
    else { const b = await gh(c, 'GET', `/repos/${c.owner}/${c.repo}/git/blobs/${f.sha}`); text = fromB64(b.content); }   // files > 1 MB
    let data; try { data = JSON.parse(text); } catch (e) { throw new SyncError('File data di GitHub rusak (bukan JSON). Tidak ditimpa.', 'corrupt'); }
    if (!data || data.app !== 'npd' || !data.collections) throw new SyncError('File di GitHub bukan data NPD. Tidak ditimpa — ganti nama file data.', 'corrupt');
    return { sha: f.sha, data };
  }
  async function push(c, sha) {
    const body = { message: `NPD sync ${new Date().toISOString()} by ${T.state.user}`, content: toB64(JSON.stringify(T.exportAll())), branch: c.branch };
    if (sha) body.sha = sha;
    return gh(c, 'PUT', fpath(c), body);
  }

  async function run(opts) {
    const c = cfg(); if (!c) return setState('off');
    if (S.running) { S.again = true; return; }
    if (!online()) { setState('offline', 'Offline — perubahan disimpan di perangkat dan dikirim saat online.'); return; }
    S.running = true; setState('syncing');
    try {
      await assertPrivate(c, opts && opts.force);
      for (let attempt = 0; attempt < 4; attempt++) {
        const startDirty = T.state.dirty, remote = await fetchRemote(c);
        let localOnly = 0;
        if (remote) { const m = T.mergeIn(remote.data); localOnly = m.localOnly; }
        try { T.tx(() => NPDB.ops.ensureVenueExpenses()); } catch (e) { /* never block sync */ }
        if (!remote && T.isEmpty()) { NPDB.seed.seedBase(); }
        const needPush = !remote || startDirty > 0 || T.state.dirty > 0 || localOnly > 0 || (opts && opts.forcePush);
        if (!needPush) break;
        try { await push(c, remote ? remote.sha : null); T.state.dirty = Math.max(0, T.state.dirty - startDirty); T.saveSoon(); break; }
        catch (e) { if (e.code === 'conflict' && attempt < 3) continue; throw e; }
      }
      S.lastSync = new Date().toISOString(); ls.set(KEY + '.last', S.lastSync); setState('ok');
    } catch (e) {
      if (e.code === 'offline') setState('offline', 'Offline — perubahan disimpan di perangkat dan dikirim saat online.');
      else setState('error', e.message || String(e));
    } finally { S.running = false; if (S.again) { S.again = false; schedulePush(); } }
  }
  function schedulePush() { if (!cfg()) return; clearTimeout(S.timer); S.timer = setTimeout(() => run(), DEBOUNCE); }

  function start() {
    if (S.poll) return;
    S.lastSync = ls.get(KEY + '.last');
    T.onChange(() => { if (T.state.dirty > 0) { emit(); schedulePush(); } });
    S.poll = setInterval(() => { if (g.document && g.document.hidden) return; run(); }, POLL);
    if (g.addEventListener) {
      g.addEventListener('focus', () => run()); g.addEventListener('online', () => run()); g.addEventListener('offline', () => setState('offline', 'Offline — perubahan disimpan di perangkat.'));
      if (g.document) g.document.addEventListener('visibilitychange', () => { if (!g.document.hidden) run(); });
    }
    if (cfg()) run();
  }
  /** Save the connection after verifying it (repo reachable, private, token can read). */
  async function configure(input) {
    const c = { owner: String(input.owner || '').trim(), repo: String(input.repo || '').trim(), path: String(input.path || 'npd-data.json').trim().replace(/^\/+/, ''), branch: String(input.branch || 'main').trim(), token: String(input.token || '').trim() };
    if (!c.owner || !c.repo || !c.token) throw new SyncError('Isi pemilik repo, nama repo, dan token.', 'input');
    if (!/^[\w.-]+$/.test(c.owner) || !/^[\w.-]+$/.test(c.repo)) throw new SyncError('Nama pemilik/repo hanya boleh huruf, angka, titik, minus, garis bawah.', 'input');
    await assertPrivate(c, true);
    const remote = await fetchRemote(c);   // also proves the token can read the file
    ls.set(KEY, JSON.stringify(c)); S.privOk = Date.now();
    await run({ forcePush: false });
    return { existing: !!remote };
  }
  function disconnect() { ls.del(KEY); ls.del(KEY + '.last'); clearTimeout(S.timer); S.lastSync = null; setState('off'); }
  /** Restore from a backup file, then push it so it also replaces the data on GitHub. */
  NPDB.restore = async obj => {
    if (!obj || obj.app !== 'npd' || !obj.collections) throw new SyncError('Bukan file backup NPD.', 'input');
    if (cfg()) { await run({ force: true }); if (S.state === 'error') throw new SyncError('Sinkronisasi dulu gagal: ' + S.message + ' Pulihkan dibatalkan supaya tidak menimpa data yang belum terbaca.', 'restore'); }
    const n = T.restoreFrom(obj); await T.saveNow();
    if (cfg()) { await run({ force: true }); const st = status(); return { message: st.state === 'ok' ? `Backup dipulihkan (${n} data) dan terkirim ke GitHub.` : `Backup dipulihkan di perangkat (${n} data), tetapi belum terkirim: ${st.message}` }; }
    return { message: `Backup dipulihkan di perangkat (${n} data).` };
  };
  NPDB.sync = { start, configure, disconnect, syncNow: () => run({ force: true }), status, onStatus: f => S.listeners.push(f), cfg: () => { const c = cfg(); return c ? { owner: c.owner, repo: c.repo, path: c.path, branch: c.branch, hasToken: true } : null; }, SyncError };
})(typeof window !== 'undefined' ? window : globalThis);
