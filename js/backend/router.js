'use strict';
/* NPD backend (in-browser) – tiny request router that replaces the Flask server.
 * NPDB.request(method, url, body, opts) → resolves with the JSON the old /api/* endpoints returned. */
(function (g) {
  const NPDB = g.NPDB, { ApiError } = NPDB;
  const routes = [];
  const FIN_KEYS = new Set(['venue_cost', 'session_fee', 'budget_extra', 'photo_fee', 'npd_share_pct', 'photographer_share_pct', 'gross_collected', 'refunds', 'net_collected', 'receivable',
    'session_revenue', 'photo_revenue', 'npd_photo_share', 'photographer_share', 'organizer_session_fee', 'organizer_revenue', 'other_expenses', 'total_expenses', 'net_profit', 'photographer_paid',
    'photographer_outstanding', 'spend', 'target_revenue', 'budget_expenses', 'estimated_profit', 'actual_revenue']);

  // ---- device profile (replaces server login): who is using this device and what they may do
  const ROLE_PERMS = { admin: ['view', 'operations', 'finance', 'settings'], organizer: ['view', 'operations', 'finance', 'settings'], staff: ['view', 'operations'], viewer: ['view'] };
  const auth = { user: null };
  function setProfile(name, role) {
    if (!name) { auth.user = null; NPDB.store.setUser('system'); return null; }
    role = ROLE_PERMS[role] ? role : 'viewer';
    auth.user = { id: 1, username: String(name).trim(), display_name: String(name).trim(), role, perms: ROLE_PERMS[role].slice(), must_change_password: 0 };
    NPDB.store.setUser(auth.user.username); return auth.user;
  }
  const has = p => !!(auth.user && auth.user.perms.includes(p));
  const stripFin = d => (has('finance') ? d : Array.isArray(d) ? d.map(stripFin) : (d && typeof d === 'object' ? Object.fromEntries(Object.entries(d).filter(([k]) => !FIN_KEYS.has(k))) : d));
  const ok = (kw = {}) => Object.assign({ ok: true }, kw);
  const log = (action, entity, id, detail) => NPDB.store.audit(action, entity, id, detail);

  function add(method, path, perm, fn, idem, noTx) {
    const keys = []; const re = new RegExp('^' + path.replace(/<int:(\w+)>/g, () => { keys.push('i'); return '(\\d+)'; }).replace(/<(\w+)>/g, () => { keys.push('s'); return '([^/]+)'; }) + '$');
    routes.push({ method, re, perm, fn, idem, noTx });
  }
  const idemCache = new Map();

  async function request(method, url, body, opts = {}) {
    method = method.toUpperCase();
    const u = new URL(url, 'http://local'), path = u.pathname.replace(/^\/api/, '') || '/';
    const q = Object.fromEntries(u.searchParams.entries());
    const r = routes.find(x => x.method === method && x.re.test(path));
    if (!r) throw new ApiError('Not found.', 404);
    if (r.perm !== null && !auth.user) throw new ApiError('Please sign in.', 401);
    if (r.perm && !has(r.perm)) throw new ApiError('You do not have permission for this action.', 403);
    if (r.idem && opts.idem && idemCache.has(opts.idem)) return NPDB.clone(idemCache.get(opts.idem));
    const params = path.match(r.re).slice(1).map((v, k) => (/^\d+$/.test(v) && !/^0\d/.test(v) && r.re.source.includes('\\d+') ? Number(v) : v));
    const plain = fd => { const o = {}; fd.forEach((v, k) => { if (!(typeof File !== 'undefined' && v instanceof File)) o[k] = v; }); return o; };
    const ctx = { q, body: (typeof FormData !== 'undefined' && body instanceof FormData) ? (r.noTx ? body : plain(body)) : (body || {}), has, user: auth.user, params };
    try {
      const out = r.noTx ? r.fn(ctx, ...params) : NPDB.store.tx(() => r.fn(ctx, ...params));
      const resolved = await out;
      if (r.idem && opts.idem && resolved && !resolved.__download) idemCache.set(opts.idem, NPDB.clone(resolved));
      return resolved;
    } catch (e) {
      if (e instanceof ApiError) { const err = new ApiError(e.message, e.status, e.extra); err.data = Object.assign({ error: e.message }, e.extra); throw err; }
      if (e instanceof NPDB.ValueErr) { const err = new ApiError(e.message, 400); err.data = { error: e.message }; throw err; }
      throw e;
    }
  }
  const pageArgs = (q, def = 25) => { const page = Math.max(1, parseInt(q.page || 1, 10) || 1), size = Math.min(200, Math.max(1, parseInt(q.size || def, 10) || def)); return [page, size, (page - 1) * size]; };
  const like = (hay, q) => String(hay == null ? '' : hay).toLowerCase().includes(String(q).toLowerCase());

  NPDB.router = { add, request, ROLE_PERMS, auth, setProfile, has, stripFin, ok, log, pageArgs, like };
  NPDB.request = request;
})(typeof window !== 'undefined' ? window : globalThis);
