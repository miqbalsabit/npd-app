'use strict';
/* NPD backend (in-browser) – shared helpers: errors, validation, dates, rounding. */
(function (g) {
  const NPDB = g.NPDB = g.NPDB || {};

  class ApiError extends Error {
    constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
  }

  // --- numbers: whole rupiah, ROUND_HALF_UP (away from zero on .5) with a tiny epsilon for float noise
  const rnd = x => { x = Number(x) || 0; const s = x < 0 ? -1 : 1; return s * Math.floor(Math.abs(x) + 0.5 + 1e-9); };
  const num = x => Number(x) || 0;
  const sum = (arr, f) => arr.reduce((a, b) => a + (f ? f(b) : b), 0);

  // --- dates (local calendar dates, YYYY-MM-DD)
  const p2 = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const today = () => isoDate(new Date());
  const nowStr = () => { const d = new Date(); return `${isoDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return isoDate(d); };

  // --- validation helpers (same messages as the original server)
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;
  const s = (d, key, required = false, maxlen = 300, label) => {
    let v = d[key]; if (typeof v === 'string') v = v.trim();
    if (v === undefined || v === null || v === '') { if (required) throw new ApiError(`${label || key} is required.`); return null; }
    v = String(v); if (v.length > maxlen) throw new ApiError(`${label || key} is too long.`); return v;
  };
  const i = (d, key, required = false, minv = 0, maxv = 1e11, def = null, label) => {
    const v = d[key];
    if (v === undefined || v === null || v === '') { if (required) throw new ApiError(`${label || key} is required.`); return def; }
    let n = typeof v === 'string' ? Number(v.replace(/\./g, '').replace(/,/g, '')) : Number(v);
    if (!Number.isFinite(n)) throw new ApiError(`${label || key} must be a number.`);
    n = Math.trunc(n);
    if (n < minv || n > maxv) throw new ApiError(`${label || key} must be between ${minv} and ${maxv}.`);
    return n;
  };
  const pct = (d, key, def = null, label) => {
    const v = d[key]; if (v === undefined || v === null || v === '') return def;
    const n = Number(v); if (!Number.isFinite(n)) throw new ApiError(`${label || key} must be a number.`);
    if (n < 0 || n > 100) throw new ApiError(`${label || key} must be between 0% and 100%.`);
    return n;
  };
  const dt = (d, key, required = false, label) => {
    const v = s(d, key, required, 10, label); if (v === null) return null;
    if (!DATE_RE.test(v)) throw new ApiError(`${label || key} must be a valid date (YYYY-MM-DD).`);
    const x = parseD(v); if (isoDate(x) !== v) throw new ApiError(`${label || key} is not a real date.`);
    return v;
  };
  const tm = (d, key, required = false, label) => {
    const v = s(d, key, required, 5, label); if (v === null) return null;
    if (!TIME_RE.test(v) || +v.slice(0, 2) > 23 || +v.slice(3) > 59) throw new ApiError(`${label || key} must be a valid time (HH:MM).`);
    return v;
  };
  const oneOf = (d, key, options, def = null, label) => {
    const v = d[key]; if (v === undefined || v === null || v === '') return def;
    if (!options.includes(v)) throw new ApiError(`${label || key} must be one of: ${options.join(', ')}.`);
    return v;
  };
  const hoursBetween = (st, et) => { const a = +st.slice(0, 2) * 60 + +st.slice(3), b = +et.slice(0, 2) * 60 + +et.slice(3); return Math.max(0, (b - a) / 60); };

  const normalizeWa = raw => {
    if (raw === null || raw === undefined) return null;
    const str = String(raw).trim(); if (!str) return null;
    let digits = str.replace(/\D/g, ''); if (!digits) return null;
    if (digits.startsWith('62')) { /* keep */ } else if (digits.startsWith('0')) digits = '62' + digits.slice(1); else if (digits.startsWith('8')) digits = '62' + digits;
    return '+' + digits;
  };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const sortBy = (arr, ...keys) => arr.slice().sort((x, y) => { for (const k of keys) { const f = typeof k === 'function' ? k : (r => r[k]); const a = f(x), b = f(y); const c = cmp(a, b); if (c) return c; } return 0; });
  const clone = o => JSON.parse(JSON.stringify(o));

  Object.assign(NPDB, { ApiError, rnd, num, sum, today, nowStr, isoDate, parseD, addDays, s, i, pct, dt, tm, oneOf, hoursBetween, normalizeWa, cmp, sortBy, clone, p2 });
})(typeof window !== 'undefined' ? window : globalThis);
