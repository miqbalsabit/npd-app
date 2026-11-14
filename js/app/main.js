'use strict';
/* NPD – boot, login, app shell, router, PWA registration. */

const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '#/dashboard', icon: 'home' },
  { id: 'sessions', label: 'Sessions & Events', href: '#/sessions', icon: 'ball' },
  { id: 'calendar', label: 'Event Calendar', href: '#/calendar', icon: 'calendar' },
  { id: 'venues', label: 'Venues', href: '#/venues', icon: 'pin' },
  { id: 'members', label: 'Members', href: '#/members', icon: 'users', sub: [['Member List', '#/members'], ['Member Activity', '#/activity']] },
  { id: 'fin', label: 'Financial Management', href: '#/finance', icon: 'wallet', perm: 'finance', sub: [['Financial Overview', '#/finance'], ['Transactions', '#/transactions'], ['Revenue', '#/revenue'], ['Operational Expenses', '#/expenses'], ['Cash Flow', '#/cashflow']] },
  { id: 'profit', label: 'Profit Sharing', href: '#/profit/photographers', icon: 'coin', perm: 'finance', sub: [['Photography Allocation', '#/profit/photographers'], ['NPD Petty Cash & Utang', '#/profit/funds'], ['Organizer Profit Sharing', '#/profit/organizers']] },
  { id: 'reports', label: 'Reports', href: '#/reports', icon: 'pie' },
  { id: 'settings', label: 'Settings', href: '#/settings', icon: 'gear' },
];
// route navId -> NAV group
const NAV_OF = { create: 'sessions', dashboard: 'dashboard', sessions: 'sessions', calendar: 'calendar', venues: 'venues', members: 'members', activity: 'members', finance: 'fin', transactions: 'fin', revenue: 'fin', expenses: 'fin', cashflow: 'fin', profit: 'profit', reports: 'reports', settings: 'settings', install: 'settings' };
const navItems = () => NAV.filter(n => !n.perm || can(n.perm));

function brandMark() {
  return html`<div class="brand-mark" id="bm">NPD</div>`;
}
function loadLogo() {
  // Official logo is supplied by the owner at img/brand/logo.svg (or .png); text fallback otherwise.
  const tryLoad = (srcs) => {
    if (!srcs.length) return;
    const img = new Image();
    img.onload = () => $$('.brand-mark').forEach(m => { m.textContent = ''; const i = img.cloneNode(); i.alt = 'NPD'; m.appendChild(i); });
    img.onerror = () => tryLoad(srcs.slice(1));
    img.src = srcs[0];
  };
  tryLoad(['img/brand/logo.svg', 'img/brand/logo.png']);
}

// ------------------------------------------------------------------ device profile (replaces login)
const PEOPLE = [['Sabit', 'admin'], ['Julio', 'admin'], ['Septian', 'staff']];
function renderLogin(msg) {
  const app = $('#app'), last = (() => { try { return JSON.parse(localStorage.getItem('npd.profile') || 'null'); } catch (e) { return null; } })();
  mount(app, html`<div class="login"><div class="card"><div class="brand" style="padding-bottom:6px">${brandMark()}<div><div class="brand-name">NPD</div><div class="brand-sub">Network. Play. Discover.</div></div></div>
    <h1 style="font-size:22px;margin:10px 0 4px">Siapa yang memakai perangkat ini?</h1><p class="small strong" style="margin:0 0 14px">Datang sendiri, pulang bawa circle.</p>
    <form id="lf"><div class="field"><label for="lu">Nama</label><input class="inp" id="lu" name="name" value="${last ? last.name : ''}" maxlength="40" autocomplete="off" required></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">${PEOPLE.map(([n]) => html`<button type="button" class="btn sm" data-who="${n}">${n}</button>`)}</div>
      <div class="field" style="margin-top:8px"><label for="lr">Peran</label><select class="inp" id="lr"><option value="admin">admin — semua menu</option><option value="organizer">organizer — semua menu</option><option value="staff">staff — tanpa keuangan</option><option value="viewer">viewer — hanya lihat</option></select></div>
      <div id="le" class="field-err" role="alert" style="min-height:20px;margin-top:8px">${msg || ''}</div>
      <button class="btn primary block" id="lb" type="submit" style="width:100%;margin-top:6px">Masuk</button></form>
    <p class="muted xs" style="margin:14px 0 0">Peran hanya mengatur menu yang tampil, bukan pengaman. Keamanan data ada pada token GitHub dan repo privat.</p></div></div>`);
  loadLogo();
  if (last) $('#lr').value = last.role;
  on(app, 'click', '[data-who]', (e, t) => { $('#lu').value = t.dataset.who; $('#lr').value = (PEOPLE.find(p => p[0] === t.dataset.who) || [0, 'viewer'])[1]; });
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault(); const name = $('#lu').value.trim(); if (!name) return;
    NPDB.router.setProfile(name, $('#lr').value); localStorage.setItem('npd.profile', JSON.stringify({ name, role: $('#lr').value }));
    await startApp();
  });
}

// ------------------------------------------------------------------ shell
function renderShell() {
  const items = navItems(), u = NPD.user;
  const link = n => html`<div class="nav-group"><a class="nav-link" data-nav="${n.id}" href="${n.href}" title="${n.label}">${icon(n.icon, 20)}<span>${n.label}</span></a>${n.sub ? html`<div class="nav-sub" data-sub="${n.id}">${n.sub.map(([l, h]) => html`<a class="nav-link" data-sublink="${h}" href="${h}"><span>${l}</span></a>`)}</div>` : ''}</div>`;
  const bn = (id, label, href, ic) => html`<a class="bn" data-bn="${id}" href="${href}">${icon(ic, 22)}<span>${label}</span></a>`;
  mount($('#app'), html`<div class="shell">
    <aside class="side" aria-label="Main navigation"><div class="brand">${brandMark()}<div><div class="brand-name">NPD</div><div class="brand-sub">Network. Play. Discover.</div></div></div>
      <nav>${items.map(link)}</nav>
      <div class="side-foot"><a class="nav-link" data-nav="install" href="#/install" title="Install app">${icon('download', 20)}<span>Install App</span></a>
        <div class="user-chip list-item"><div class="avatar">${(u.display_name || '?')[0]}</div><div class="who grow"><div class="t">${u.display_name}</div><div class="muted xs">${u.role}</div></div></div>
        ${syncPill()}<button class="btn block" id="signout" style="width:100%" title="Ganti pengguna">${icon('logout', 18)}<span>Ganti pengguna</span></button></div></aside>
    <div class="main"><header class="topbar"><div class="brand-mark">NPD</div><div class="t-title" id="t-title">NPD</div>${syncPill()}<button class="icon-btn" id="t-more" aria-label="More">${icon('menu', 24)}</button></header>
      <main class="content" id="content"><div id="view" tabindex="-1"></div></main></div>
    <nav class="bottom-nav" aria-label="Quick navigation">${bn('dashboard', 'Home', '#/dashboard', 'home')}${bn('sessions', 'Sessions', '#/sessions', 'ball')}${bn('calendar', 'Calendar', '#/calendar', 'calendar')}${bn('members', 'Members', '#/members', 'users')}<button class="bn" id="bn-more" data-bn="more">${icon('more', 22)}<span>More</span></button></nav></div>`);
  loadLogo(); paintPill();
  $('#signout').addEventListener('click', signOut);
  const more = () => {
    const sec = (t, arr) => arr.length ? html`<div class="sheet-sec">${t}</div>${arr.map(([l, h, ic]) => html`<a class="sheet-link" href="${h}" data-close>${icon(ic, 20)} ${l}</a>`)}` : '';
    const m = openModal({
      title: 'More', body: html`${sec('Manage', [['Venues', '#/venues', 'pin'], ['Member Activity', '#/activity', 'users']])}
      ${can('finance') ? sec('Financial', [['Overview', '#/finance', 'wallet'], ['Transactions', '#/transactions', 'receipt'], ['Revenue', '#/revenue', 'trend'], ['Operational Expenses', '#/expenses', 'receipt'], ['Cash Flow', '#/cashflow', 'coin']]) : ''}
      ${can('finance') ? sec('Profit Sharing', [['Photography Allocation', '#/profit/photographers', 'camera'], ['NPD Petty Cash & Utang', '#/profit/funds', 'shield'], ['Organizer Profit Sharing', '#/profit/organizers', 'coin']]) : ''}
      ${sec('App', [['Reports', '#/reports', 'pie'], ['Settings', '#/settings', 'gear'], ['Install App', '#/install', 'download']])}
      <div class="sheet-sec">Account</div><button class="sheet-link" id="m-out" style="border:0;background:none;width:100%;text-align:left;font:inherit;font-weight:600;cursor:pointer">${icon('logout', 20)} Ganti pengguna (${NPD.user.display_name})</button>`,
    });
    m.el.addEventListener('click', e => { if (e.target.closest('a.sheet-link')) m.close(); });
    $('#m-out', m.el).addEventListener('click', () => { m.close(); signOut(); });
  };
  $('#bn-more').addEventListener('click', more); $('#t-more').addEventListener('click', more);
}

async function signOut() {
  try { await api('POST', '/api/auth/logout', {}); } catch (e) { /* ignore */ }
  localStorage.removeItem('npd.profile'); NPD.user = null; NPD.meta = null; location.hash = ''; renderLogin();
}

// ------------------------------------------------------------------ sync status pill
const syncPill = () => html`<button type="button" class="sync-pill" data-sync-pill title="Status sinkronisasi"><i class="sp-dot"></i><span class="sp-t"></span></button>`;
function paintPill() {
  const s = NPDB.sync.status(), t = { off: 'Belum tersambung', ok: 'Tersinkron', pending: s.pending + ' menunggu dikirim', syncing: 'Menyinkronkan…', offline: 'Offline' + (s.pending ? ' · ' + s.pending + ' menunggu' : ''), error: 'Gagal sinkron' }[s.state];
  const tip = s.state === 'off' ? 'Data hanya ada di perangkat ini. Tap untuk menyambungkan GitHub.' : (s.message || (s.lastSync ? 'Terakhir sinkron ' + new Date(s.lastSync).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''));
  $$('[data-sync-pill]').forEach(p => { p.dataset.state = s.state; p.title = tip; $('.sp-t', p).textContent = t; });
}
document.addEventListener('click', e => { if (e.target.closest('[data-sync-pill]')) { setState.tab = 'sync'; if (location.hash === '#/settings') NPD.render(); else location.hash = '#/settings'; } });

// ------------------------------------------------------------------ router
const TITLES = { dashboard: 'Dashboard', sessions: 'Sessions', calendar: 'Calendar', venues: 'Venues', members: 'Members', activity: 'Activity', finance: 'Financial', transactions: 'Transactions', revenue: 'Revenue', expenses: 'Operational Expenses', cashflow: 'Cash Flow', profit: 'Profit Sharing', reports: 'Reports', settings: 'Settings', install: 'Install' };
NPD.render = function render() {
  if (!NPD.user || !$('#content')) return;
  const path = (location.hash || '#/dashboard').split('?')[0];
  const r = NPD.routes.find(x => x.re.test(path));
  // fresh #view each navigation so listeners from the previous page are dropped
  const old = $('#view'), fresh = old.cloneNode(false);
  old.replaceWith(fresh);
  NPD.cleanup.splice(0).forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.style.overflow = '';
  const nav = r ? NAV_OF[r.navId] || r.navId : null;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
  $$('[data-sublink]').forEach(a => a.classList.toggle('active', a.dataset.sublink === path));
  $$('[data-sub]').forEach(s => { s.style.display = s.dataset.sub === nav ? '' : 'none'; });
  $$('[data-bn]').forEach(a => a.classList.toggle('active', a.dataset.bn === nav || (a.dataset.bn === 'more' && nav && !['dashboard', 'sessions', 'calendar', 'members'].includes(nav))));
  $('#t-title').textContent = (r && TITLES[r.navId]) || 'NPD';
  if (!r) { mount(fresh, html`<div class="card">${emptyState('Page not found', 'That page does not exist.', html`<a class="btn primary sm" href="#/dashboard">Go to dashboard</a>`)}</div>`); return; }
  r.fn(...path.match(r.re).slice(1));
  window.scrollTo(0, 0);
};
window.addEventListener('hashchange', () => NPD.render());

// ------------------------------------------------------------------ boot
async function startApp() {
  await refreshMeta();
  renderShell();
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard'; else NPD.render();
}
async function boot() {
  try {
    await NPDB.store.load();
    try { NPDB.store.tx(() => NPDB.ops.ensureVenueExpenses()); } catch (e) { console.error(e); }
    if (NPDB.store.isEmpty()) {
      if (NPDB.sync.cfg()) await Promise.race([NPDB.sync.syncNow(), new Promise(r => setTimeout(r, 8000))]);
      if (NPDB.store.isEmpty()) NPDB.seed.seedBase();
    }
    NPDB.sync.onStatus(paintPill); NPDB.store.onChange(paintPill); NPDB.sync.start();
    let prof = null; try { prof = JSON.parse(localStorage.getItem('npd.profile') || 'null'); } catch (e) { prof = null; }
    if (prof && prof.name) { NPDB.router.setProfile(prof.name, prof.role); await startApp(); return; }
  } catch (e) { console.error(e); renderLogin('Gagal membuka data di perangkat: ' + e.message); return; }
  renderLogin();
}

// ------------------------------------------------------------------ PWA
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); NPD.deferredInstall = e; if (location.hash === '#/install') NPD.render(); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const notify = w => { if (!w || !navigator.serviceWorker.controller) return; toast('Versi baru NPD tersedia.', 'info', { label: 'Muat ulang', fn: () => w.postMessage('SKIP_WAITING') }); };
      if (reg.waiting) notify(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed') notify(w); }); });
      const hadController = !!navigator.serviceWorker.controller; let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    } catch (e) { /* SW unsupported (e.g. http) – app still works */ }
  });
}
boot();
