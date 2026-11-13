'use strict';
/* NPD – core utilities: safe templating, API client, formatting, UI primitives, charts. */
const NPD = { user: null, meta: null, online: navigator.onLine, routes: [], cleanup: [] };

// ---------------------------------------------------------------- safe html templating
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s == null ? '' : String(s));
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function str(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(str).join('');
  return esc(v);
}
const html = (parts, ...vals) => raw(parts.reduce((a, p, i) => a + p + (i < vals.length ? str(vals[i]) : ''), ''));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
function mount(el, content) { el.innerHTML = str(content); return el; }
function on(root, ev, sel, fn) {
  root.addEventListener(ev, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });
}
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'k' + Date.now() + Math.random().toString(16).slice(2));

// ---------------------------------------------------------------- formatting
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const num = n => Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
const rp = n => { n = Math.round(n || 0); return (n < 0 ? '-' : '') + 'Rp' + Math.abs(n).toLocaleString('id-ID'); };
const rpShort = n => { const a = Math.abs(n || 0), s = n < 0 ? '-' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(1).replace('.', ',') + ' M' : a >= 1e6 ? s + (a / 1e6).toFixed(1).replace('.', ',') + ' jt' : a >= 1e3 ? s + Math.round(a / 1e3) + ' rb' : s + a; };
const pctf = n => (Math.round((n || 0) * 100) / 100).toString().replace('.', ',') + '%';
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fdate = s => { if (!s) return '—'; const d = parseISO(s.slice(0, 10)); return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const ftime = s => (s || '').slice(0, 5);
const fmonth = ym => { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const todayISO = () => iso(new Date());
const cls = (...a) => a.filter(Boolean).join(' ');
const money = n => raw(`<span class="${n < 0 ? 'neg' : ''}">${esc(rp(n))}</span>`);
const profitCls = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

const STATUS_BADGE = {
  'Draft': 'grey', 'Open Registration': 'navy', 'Full': 'amber', 'Completed': 'green', 'Cancelled': 'red',
  'Paid': 'green', 'Waiting for Payment': 'amber', 'Refunded': 'red', 'Partially Refunded': 'amber',
  'Attended': 'green', 'Absent': 'red', 'Not Yet Confirmed': 'grey', 'Pending': 'amber', 'Calculated': '', 'Active': 'green', 'Inactive': 'grey',
};
const badge = (t, c) => raw(`<span class="badge ${STATUS_BADGE[t] ?? c ?? ''}">${esc(t)}</span>`);
const PHOTO_LABEL = { included: 'Included', excluded: 'Add-on', none: 'No Photography' };
function sportChip(name, color) { return raw(`<span class="sport-chip"><i class="dot" style="background:${esc(color || '#E6EEFB')}"></i>${esc(name)}</span>`); }
const demoTag = r => (r && r.is_demo ? raw(' <span class="badge demo">DEMO</span>') : '');

// ---------------------------------------------------------------- icons (24px stroke set)
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .6 3.2 2.2 3.5 5.2"/>',
  wallet: '<path d="M3 7a2 2 0 012-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="16.5" cy="13.5" r="1.3"/>',
  pie: '<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1112 3"/>',
  file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>', chevR: '<path d="M9 5l7 7-7 7"/>', chevD: '<path d="M5 9l7 7 7-7"/>',
  download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>', upload: '<path d="M12 16V5m0 0L8 9m4-4l4 4M5 20h14"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.5v.1"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  logout: '<path d="M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5M15 8l4 4-4 4M19 12H9"/>',
  trend: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.4 4-6.5 8-6.5s7.2 2.1 8 6.5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.6-.8-1.6-1.2-2.8-1.2-1.7 0-2.8.9-2.8 2.1 0 3 5.8 1.2 5.8 4.1 0 1.2-1.1 2.1-2.9 2.1-1.3 0-2.4-.5-3-1.4M12 6v2m0 8v2"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  refresh: '<path d="M20 11a8 8 0 00-14.5-4M4 4v4h4M4 13a8 8 0 0014.5 4M20 20v-4h-4"/>', link: '<path d="M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.6l-1 1M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.6l1-1"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5c3 2.5 3 10.5 0 13M18.5 5.5c-3 2.5-3 10.5 0 13"/>',
};
const icon = (n, s = 20, extra = '') => raw(`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICONS[n] || ''}</svg>`);

// ---------------------------------------------------------------- API client
const ApiError = NPDB.ApiError;
// No server any more: requests run against the device-side database (NPDB), which syncs to GitHub.
const api = (method, url, body, opts = {}) => NPDB.request(method, url, body, opts);
const qs = o => { const p = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };
const GET = (u, p) => api('GET', u + qs(p));
const can = p => !!(NPD.user && NPD.user.perms.includes(p));

// ---------------------------------------------------------------- toast / modal / confirm
function toast(msg, type = 'ok', action) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `${type === 'ok' ? icon('check', 18).s : type === 'err' ? icon('alert', 18).s : icon('info', 18).s}<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); t.remove(); }; t.appendChild(b); }
  $('#toasts').appendChild(t);
  if (!action) setTimeout(() => t.remove(), type === 'err' ? 6500 : 3200);
  return t;
}

function openModal({ title, body, footer, size = '', dismissible = true, onClose }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="modal-head"><h2></h2>${dismissible ? `<button class="icon-btn" data-close aria-label="Close">${icon('x').s}</button>` : ''}</div><div class="modal-body"></div>${footer === null ? '' : '<div class="modal-foot"></div>'}</div>`;
  $('h2', ov).textContent = title;
  mount($('.modal-body', ov), body);
  if (footer) mount($('.modal-foot', ov), footer);
  const prev = document.activeElement;
  const api_ = {
    el: ov, body: $('.modal-body', ov), foot: $('.modal-foot', ov),
    close() { if (!ov.isConnected) return; ov.remove(); document.removeEventListener('keydown', esc_); if (!$('.overlay')) document.body.style.overflow = ''; onClose && onClose(); prev && prev.focus && prev.focus(); },
  };
  const esc_ = e => { if (e.key === 'Escape' && dismissible && ov === [...$$('.overlay')].pop()) api_.close(); };
  document.addEventListener('keydown', esc_);
  ov.addEventListener('mousedown', e => { if (e.target === ov && dismissible) api_.close(); });
  on(ov, 'click', '[data-close]', () => api_.close());
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const f = $('input:not([type=hidden]),select,textarea', ov.querySelector('.modal-body')); if (f && !matchMedia('(pointer:coarse)').matches) f.focus();
  return api_;
}

function confirmBox({ title = 'Are you sure?', message, confirmText = 'Confirm', danger = false, cancelText = 'Cancel' }) {
  return new Promise(res => {
    let done = false;
    const m = openModal({ title, size: 'sm', body: html`<p style="margin:0">${message}</p>`,
      footer: html`<button class="btn" data-no>${cancelText}</button><button class="btn ${danger ? 'solid-danger' : 'primary'}" data-yes>${confirmText}</button>`,
      onClose: () => { if (!done) res(false); } });
    on(m.el, 'click', '[data-yes]', () => { done = true; m.close(); res(true); });
    on(m.el, 'click', '[data-no]', () => m.close());
  });
}

// ---------------------------------------------------------------- forms
function fieldHtml(f, v) {
  const id = 'f_' + f.name, val = v == null ? '' : v;
  const req = f.required ? raw('<span class="req"> *</span>') : '';
  const lab = f.type === 'checkbox' ? '' : html`<label for="${id}">${f.label}${req}</label>`;
  let inp;
  const common = raw(`id="${id}" name="${esc(f.name)}" ${f.required ? 'required' : ''} ${f.disabled ? 'disabled' : ''}`);
  switch (f.type) {
    case 'select':
      inp = html`<select class="inp" ${common}>${f.placeholder != null ? html`<option value="">${f.placeholder}</option>` : ''}${(f.options || []).map(o => { const ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o; return html`<option value="${ov}" ${String(ov) === String(val) ? raw('selected') : ''}>${ol}</option>`; })}</select>`; break;
    case 'textarea': inp = html`<textarea class="inp" ${common} maxlength="${f.max || 1000}" placeholder="${f.placeholder || ''}">${val}</textarea>`; break;
    case 'checkbox': inp = html`<label class="check"><input type="checkbox" ${common} ${val && val !== '0' ? raw('checked') : ''}> ${f.label}</label>`; break;
    case 'money': inp = html`<input class="inp" type="text" inputmode="numeric" autocomplete="off" data-money ${common} value="${val === '' ? '' : num(val)}" placeholder="${f.placeholder || '0'}">`; break;
    case 'pct': inp = html`<input class="inp" type="number" inputmode="decimal" min="0" max="100" step="0.01" ${common} value="${val}" placeholder="0–100">`; break;
    case 'number': inp = html`<input class="inp" type="number" inputmode="numeric" min="${f.min ?? 0}" ${f.max != null ? raw(`max="${f.max}"`) : ''} step="${f.step || 1}" ${common} value="${val}">`; break;
    case 'tel': inp = html`<input class="inp" type="tel" inputmode="tel" autocomplete="off" ${common} value="${val}" placeholder="${f.placeholder || '0812…'}">`; break;
    case 'file': inp = html`<input class="inp" type="file" ${common} accept="${f.accept || ''}" ${f.capture ? raw('capture="environment"') : ''}>`; break;
    case 'password': inp = html`<input class="inp" type="password" autocomplete="${f.autocomplete || 'new-password'}" ${common} value="${val}">`; break;
    case 'date': case 'time': case 'url': case 'text': default:
      inp = html`<input class="inp" type="${f.type || 'text'}" ${common} value="${val}" maxlength="${f.max || 300}" placeholder="${f.placeholder || ''}" ${f.type === 'url' ? raw('inputmode="url"') : ''}>`;
  }
  return html`<div class="field ${f.full ? 'full' : ''}" data-field="${f.name}">${lab}${inp}${f.hint ? html`<div class="hint">${f.hint}</div>` : ''}</div>`;
}
function formHtml(fields, values = {}) {
  return html`<div class="form-grid">${fields.map(f => f.section ? html`<div class="form-section full">${f.section}</div>` : fieldHtml(f, values[f.name]))}</div>`;
}
function readForm(root, fields) {
  const o = {};
  fields.forEach(f => {
    if (f.section) return;
    const el = $(`[name="${f.name}"]`, root);
    if (!el) return;
    if (f.type === 'checkbox') o[f.name] = el.checked ? 1 : 0;
    else if (f.type === 'money') o[f.name] = el.value.replace(/\D/g, '');
    else if (f.type === 'file') o[f.name] = el.files && el.files[0];
    else o[f.name] = el.value;
  });
  return o;
}
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches && t.matches('[data-money]')) { const d = t.value.replace(/\D/g, ''); t.value = d ? Number(d).toLocaleString('id-ID') : ''; }
});
function showErr(root, msg) {
  let box = $('.form-err', root);
  if (!box) { box = document.createElement('div'); box.className = 'alert err form-err'; box.style.marginBottom = '12px'; root.prepend(box); }
  box.innerHTML = icon('alert', 18).s + `<span>${esc(msg)}</span>`;
  box.scrollIntoView({ block: 'nearest' });
}

/** Generic form modal. onSubmit(data) may throw; ApiError messages are shown inline. */
function formModal({ title, fields, values = {}, submitText = 'Save', size = '', top = '', bottom = '', onSubmit, onOpen, formData }) {
  const key = uuid();   // one idempotency key per opened form → a retry can never double-record
  const m = openModal({ title, size, body: html`<form novalidate>${top}${formHtml(fields, values)}${bottom}</form>`,
    footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-submit>${submitText}</button>` });
  const form = $('form', m.el);
  const btn = $('[data-submit]', m.el);
  const submit = async () => {
    if (btn.disabled) return;
    $$('.inp.err', form).forEach(x => x.classList.remove('err'));
    const data = readForm(form, fields);
    for (const f of fields) {
      if (f.required && (data[f.name] === '' || data[f.name] == null) && f.type !== 'checkbox') {
        const el = $(`[name="${f.name}"]`, form); el.classList.add('err'); el.focus();
        showErr(m.body, `${f.label} is required.`); return;
      }
    }
    btn.disabled = true; const t0 = btn.textContent; btn.textContent = 'Saving…';
    try { await onSubmit(data, { key, modal: m, form, retryWith: extra => submit.extra = extra }); }
    catch (e) { showErr(m.body, e.message || 'Something went wrong.'); if (e.status === 0 || e.status >= 400) btn.disabled = false; }
    finally { btn.disabled = false; btn.textContent = t0; }
  };
  btn.addEventListener('click', submit);
  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  $$('input', form).forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter' && i.type !== 'file' && i.id !== 'msearch') { e.preventDefault(); submit(); } }));
  onOpen && onOpen(m, form);
  return m;
}

async function runDelete({ what, url, onDone, message }) {
  if (!await confirmBox({ title: `Delete ${what}?`, message: message || 'This cannot be undone. The action is recorded in the audit log.', confirmText: 'Delete', danger: true })) return;
  try { const r = await api('DELETE', url); toast(r.message || `${what} deleted`); onDone && onDone(r); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------------------------------------------------------------- table / pager / empty / misc ui
function table(cols, rows, { empty, rowAttr, foot, rowClass } = {}) {
  if (!rows.length) return empty || emptyState('Nothing here yet', 'No records match.');
  return html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => html`<th class="${c.num ? 'num' : ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r, i) => html`<tr ${rowAttr ? raw(rowAttr(r, i)) : ''} ${rowClass ? raw(`class="${esc(rowClass(r))}"`) : ''}>${cols.map(c => html`<td class="${cls(c.num && 'num', c.act && 'actions-cell')}" data-label="${c.act ? '' : c.label}">${c.render ? c.render(r, i) : (r[c.key] ?? '—')}</td>`)}</tr>`)}</tbody>
    ${foot ? html`<tfoot><tr>${cols.map((c, i) => html`<td class="${c.num ? 'num' : ''}" data-label="${c.label}">${foot[c.key] != null ? (c.fmt ? c.fmt(foot[c.key]) : foot[c.key]) : (i === 0 ? 'Total' : '')}</td>`)}</tr></tfoot>` : ''}</table></div>`;
}
function emptyState(title, sub, action) {
  return html`<div class="empty">${icon('box', 40)}<h3>${title}</h3><div>${sub}</div>${action ? html`<div style="margin-top:14px">${action}</div>` : ''}</div>`;
}
function pager(total, page, size) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return raw(`<div class="muted small" style="margin-top:10px">${total} record${total === 1 ? '' : 's'}</div>`);
  return html`<div class="pager"><span class="muted small">${total} records · page ${page} of ${pages}</span><div class="actions">
    <button class="btn sm" data-page="${page - 1}" ${page <= 1 ? raw('disabled') : ''}>${icon('chevL', 16)} Prev</button>
    <button class="btn sm" data-page="${page + 1}" ${page >= pages ? raw('disabled') : ''}>Next ${icon('chevR', 16)}</button></div></div>`;
}
const kpi = (label, value, sub, o = {}) => html`<div class="card kpi ${o.accent ? 'accent' : ''}"><div class="l">${o.icon ? icon(o.icon, 15) : ''}${label}</div><div class="v ${o.cls || ''}">${value}</div>${sub ? html`<div class="s">${sub}</div>` : ''}</div>`;
const pageHead = (title, sub, actions) => html`<div class="page-head"><div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
function skeleton(view, n = 3) { mount(view, html`<div class="grid">${Array.from({ length: n }, () => '<div class="card" style="height:90px;opacity:.5"></div>').map(raw)}</div>`); }
function loadingCard() { return raw('<div class="card muted">Loading…</div>'); }
async function download(url) {
  const r = await api('GET', url);
  if (!r || !r.__download) throw new ApiError('Nothing to download.');
  saveDownload(r.__download);
}
function saveDownload(d) {
  const blob = new Blob([d.data], { type: d.mime || 'application/octet-stream' });
  const u = URL.createObjectURL(blob);
  if (d.print) { const w = window.open(u, '_blank'); if (w) w.addEventListener('load', () => setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* user can print manually */ } }, 400)); if (!w) toast('Pop-up diblokir. Izinkan pop-up lalu ulangi — pilih "Save as PDF" di jendela cetak.', 'err'); setTimeout(() => URL.revokeObjectURL(u), 120000); return; }
  const a = document.createElement('a'); a.href = u; a.download = d.name || 'download'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
}
// links to /api/...export or /api/backup become local downloads
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="/api/"]'); if (!a) return;
  e.preventDefault(); download(a.getAttribute('href')).catch(er => toast(er.message, 'err'));
});

// ---------------------------------------------------------------- charts (SVG, responsive via viewBox)
const C = { navy: '#001F54', blue: '#004ECC', red: '#BF0100', mist: '#E6EEFB', sky: '#6FB1FF', sun: '#FFC23D', lime: '#C8E000', grid: '#dfe4ee' };
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function tipAttr(t) { return `data-tip="${esc(t)}"`; }
function barLineChart(series, { height = 240 } = {}) {
  const W = 640, H = height, L = 48, R = 10, T = 12, B = 30;
  const maxV = niceMax(Math.max(1, ...series.flatMap(s => [s.revenue, s.expenses, s.profit])));
  const minV = Math.min(0, ...series.map(s => s.profit));
  const lo = minV < 0 ? -niceMax(-minV) : 0, span = maxV - lo;
  const y = v => T + (H - T - B) * (1 - (v - lo) / span);
  const bw = (W - L - R) / series.length;
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = lo + span * i / 4; g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(rpShort(v))}</text>`; }
  const bars = series.map((s, i) => {
    const x0 = L + i * bw + bw * .14, w = bw * .36, tip = `${fmonth(s.month)} · Revenue ${rp(s.revenue)} · Expenses ${rp(s.expenses)} · Profit ${rp(s.profit)}`;
    return `<g ${tipAttr(tip)}><rect x="${x0}" y="${y(Math.max(0, s.revenue))}" width="${w}" height="${Math.max(1, Math.abs(y(0) - y(s.revenue)))}" rx="3" fill="${C.blue}"/>
      <rect x="${x0 + w + 3}" y="${y(Math.max(0, s.expenses))}" width="${w}" height="${Math.max(1, Math.abs(y(0) - y(s.expenses)))}" rx="3" fill="${C.red}" opacity=".85"/>
      <text x="${L + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle">${MONTHS[+s.month.slice(5) - 1]}</text></g>`;
  }).join('');
  const pts = series.map((s, i) => `${L + i * bw + bw / 2},${y(s.profit)}`);
  const line = `<polyline fill="none" stroke="${C.navy}" stroke-width="2.5" stroke-linejoin="round" points="${pts.join(' ')}"/>` +
    series.map((s, i) => `<circle cx="${L + i * bw + bw / 2}" cy="${y(s.profit)}" r="4.5" fill="#fff" stroke="${C.navy}" stroke-width="2.5" ${tipAttr(`${fmonth(s.month)} · Profit ${rp(s.profit)}`)}/>`).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue, expenses and profit by month">${g}${lo < 0 ? `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="${C.navy}" stroke-width="1.2"/>` : ''}${bars}${line}</svg>
    <div class="legend"><span><i style="background:${C.blue}"></i>Revenue</span><span><i style="background:${C.red}"></i>Expenses</span><span><i style="background:${C.navy};border-radius:50%"></i>Net profit</span></div>`);
}
function lineChart(points, { height = 200, color = C.blue, label = 'Value' } = {}) {
  const W = 640, H = height, L = 48, R = 12, T = 12, B = 28;
  const vals = points.map(p => p.v), mx = niceMax(Math.max(1, ...vals)), mn = Math.min(0, ...vals), lo = mn < 0 ? -niceMax(-mn) : 0, span = mx - lo;
  const y = v => T + (H - T - B) * (1 - (v - lo) / span), step = (W - L - R) / Math.max(1, points.length - 1);
  let g = ''; for (let i = 0; i <= 4; i++) { const v = lo + span * i / 4; g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(rpShort(v))}</text>`; }
  const xs = points.map((p, i) => L + i * step), path = points.map((p, i) => `${xs[i]},${y(p.v)}`).join(' ');
  const area = `${xs[0]},${y(0)} ${path} ${xs[xs.length - 1]},${y(0)}`;
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}<polygon points="${area}" fill="${color}" opacity=".10"/><polyline fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" points="${path}"/>
    ${points.map((p, i) => `<circle cx="${xs[i]}" cy="${y(p.v)}" r="4.5" fill="#fff" stroke="${color}" stroke-width="2.5" ${tipAttr(`${p.l} · ${rp(p.v)}`)}/><text x="${xs[i]}" y="${H - 8}" text-anchor="middle">${esc(p.l)}</text>`).join('')}</svg>`);
}
function donut(items, { size = 180 } = {}) {
  const total = items.reduce((a, b) => a + Math.max(0, b.value), 0);
  if (!total) return raw('<div class="muted small">No data in this period.</div>');
  const r = 60, c = 2 * Math.PI * r; let off = 0;
  const arcs = items.filter(i => i.value > 0).map(i => { const len = c * i.value / total, s = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${esc(i.color)}" stroke-width="26" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)" ${tipAttr(`${i.label} · ${rp(i.value)} (${Math.round(100 * i.value / total)}%)`)}/>`; off += len; return s; }).join('');
  return raw(`<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 160 160" width="${size}" height="${size}" role="img" aria-label="Share by sport">${arcs}<circle r="46" cx="80" cy="80" fill="#fff"/><text x="80" y="76" text-anchor="middle" style="font:800 11px var(--font-b);fill:#5b6b8c">TOTAL</text><text x="80" y="94" text-anchor="middle" style="font:800 13px var(--font-b);fill:#001F54">${esc(rpShort(total))}</text></svg>
    <div class="legend" style="flex-direction:column;gap:7px;margin:0">${items.map(i => `<span><i style="background:${esc(i.color)};border:1px solid rgba(0,31,84,.2)"></i>${esc(i.label)} · <b>${esc(rp(i.value))}</b></span>`).join('')}</div></div>`);
}
function hbars(items, { color = C.blue, fmt = rp } = {}) {
  const mx = Math.max(1, ...items.map(i => Math.abs(i.value)));
  return html`${items.map(i => html`<div class="hbar"><div class="lab" title="${i.label}">${i.label}</div><div class="bar"><i style="width:${Math.max(3, 100 * Math.abs(i.value) / mx)}%;background:${i.value < 0 ? C.red : (i.color || color)}"></i></div><b class="${i.value < 0 ? 'neg' : ''}">${fmt(i.value)}</b></div>`)}`;
}
document.addEventListener('mousemove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]'), tip = $('#tip');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 250) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});
document.addEventListener('click', e => {   // touch devices: tap to show tooltip
  const t = e.target.closest && e.target.closest('[data-tip]'), tip = $('#tip');
  if (t && matchMedia('(pointer:coarse)').matches) { tip.textContent = t.getAttribute('data-tip'); tip.hidden = false; tip.style.left = Math.max(8, Math.min(e.clientX - 60, innerWidth - 250)) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; setTimeout(() => tip.hidden = true, 2600); }
});

// ---------------------------------------------------------------- date range presets
function presetRange(p) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const last = (yy, mm) => iso(new Date(yy, mm + 1, 0));
  switch (p) {
    case 'this_month': return [iso(new Date(y, m, 1)), last(y, m)];
    case 'last_month': return [iso(new Date(y, m - 1, 1)), last(y, m - 1)];
    case 'this_quarter': { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), last(y, q + 2)]; }
    case 'this_year': return [`${y}-01-01`, `${y}-12-31`];
    default: return null;
  }
}
const RANGE_LABELS = { this_month: 'This Month', last_month: 'Last Month', this_quarter: 'This Quarter', this_year: 'This Year', custom: 'Custom' };
function rangeBar(state, id = 'rng') {
  return html`<div class="toolbar" id="${id}"><div class="chips">${Object.entries(RANGE_LABELS).map(([k, l]) => html`<button class="chip ${state.preset === k ? 'on' : ''}" data-preset="${k}">${l}</button>`)}</div>
    <div class="actions ${state.preset === 'custom' ? '' : 'hide'}" data-custom><input class="inp" type="date" data-from value="${state.start}" aria-label="From"><span class="muted">to</span><input class="inp" type="date" data-to value="${state.end}" aria-label="To"></div></div>`;
}
function bindRange(root, state, reload) {
  on(root, 'click', '[data-preset]', (e, t) => {
    const p = t.dataset.preset; state.preset = p;
    if (p !== 'custom') [state.start, state.end] = presetRange(p);
    reload(true);
  });
  on(root, 'change', '[data-from],[data-to]', () => {
    const f = $('[data-from]', root).value, t = $('[data-to]', root).value;
    if (f && t && f <= t) { state.start = f; state.end = t; reload(false); } else if (f && t) toast('Start date must be before the end date.', 'err');
  });
}

window.addEventListener('online', () => { NPD.online = true; $('#offline-banner').hidden = true; toast('Kembali online — menyinkronkan…', 'ok'); });
window.addEventListener('offline', () => { NPD.online = false; $('#offline-banner').hidden = false; });
if (!navigator.onLine) setTimeout(() => { $('#offline-banner').hidden = false; });
