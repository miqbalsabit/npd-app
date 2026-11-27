'use strict';
/* Operational pages: dashboard, sessions, calendar, venues, members, activity. */

function route(pattern, fn, navId) { NPD.routes.push({ re: new RegExp('^' + pattern + '$'), fn, navId }); }
const view = () => $('#view');
const go = h => { if (location.hash === h) NPD.render(); else location.hash = h; };
const hashQuery = () => Object.fromEntries(new URLSearchParams((location.hash.split('?')[1]) || ''));
const sportDot = s => raw(`<i class="dot" style="background:${esc(s.sport_color || s.color || '#E6EEFB')}"></i>`);
async function guard(fn) {
  try { await fn(); } catch (e) { if (e.status !== 401) mount(view(), html`<div class="card"><div class="alert err">${icon('alert', 18)}<span>${e.message}</span></div><div style="margin-top:12px"><button class="btn" data-retry>${icon('refresh', 16)} Try again</button></div></div>`); on(view(), 'click', '[data-retry]', () => NPD.render()); }
}

// =================================================================== DASHBOARD
const dashState = { preset: 'this_month', start: presetRange('this_month')[0], end: presetRange('this_month')[1] };
route('#/dashboard', () => guard(async () => {
  const v = view(), fin = can('finance');
  const draw = async (rerender = true) => {
    const d = await GET('/api/dashboard', { start: dashState.start, end: dashState.end });
    const k = d.kpis;
    mount(v, html`
      ${pageHead('Dashboard', `${fdate(d.range.start)} – ${fdate(d.range.end)}`, html`${fin ? html`<button class="btn primary" data-export>${icon('download', 18)} Export Report</button>` : ''}${can('operations') ? html`<a class="btn primary" href="#/sessions/new">${icon('plus', 18)} New Session</a>` : ''}`)}
      <div class="quick" style="margin-bottom:16px">
        ${can('operations') ? html`<button data-q="session">${icon('calendar', 24)}Create Session</button><button data-q="participant">${icon('users', 24)}Add Participant</button><button data-q="member">${icon('user', 24)}Add Member</button>` : ''}
        ${fin ? html`<button data-q="expense">${icon('receipt', 24)}Add Operational Expense</button>` : ''}
        ${can('operations') ? html`<button data-q="payment">${icon('coin', 24)}Record Payment</button>` : ''}
      </div>
      ${rangeBar(dashState)}
      <div class="grid g6" style="margin-bottom:14px">
        ${fin ? html`
          ${kpi('Total Revenue', rp(k.revenue), `Cash collected ${rp(k.cash_collected)} incl. photographer share ${rp(k.photographer_share)}`, { accent: true, icon: 'trend' })}
          ${kpi('Total Operational Expenses', rp(k.expenses), 'Session + general', { icon: 'receipt' })}
          ${kpi('Net Business Profit', rp(k.profit), k.receivable ? `Receivable ${rp(k.receivable)} not counted` : 'After all expenses', { icon: 'coin', cls: profitCls(k.profit) })}
          ${kpi('Total Cash Balance', rp(k.total_cash_balance), 'Uang tunai NPD sekarang, termasuk NPD Petty Cash', { icon: 'shield' })}
          <div data-netcash style="cursor:pointer">${kpi('Sisa Bersih NPD', rp(k.net_cash.net), 'Setelah semua utang · ketuk untuk rincian', { icon: 'wallet', cls: profitCls(k.net_cash.net) })}</div>` : ''}
        ${kpi('Upcoming Sessions', k.upcoming_sessions, `${k.sessions} in period · ${k.completed} completed`, { icon: 'calendar' })}
        ${kpi('Total Registered Members', k.members_total, `${k.participants} paid participations in period`, { icon: 'users' })}
      </div>
      ${fin ? html`
      <div class="grid g-main" style="margin-bottom:14px">
        <div class="card"><div class="card-title"><h2>Revenue by Sport</h2></div>${d.by_sport.length ? donut(d.by_sport.map(s => ({ label: s.sport, value: s.revenue, color: s.color }))) : html`<div class="muted">No sessions in this period.</div>`}</div>
      </div>
      <div class="grid g2" style="margin-bottom:14px">
        <div class="card"><div class="card-title"><h2>Session Performance</h2><span class="muted small">Avg profit ${rp(d.performance.avg_profit)} · ${d.performance.count} completed</span></div>
          ${d.performance.count ? html`<h3 class="small muted" style="margin-bottom:2px">MOST PROFITABLE</h3>${hbars(d.performance.best.map(s => ({ label: s.name, value: s.net_profit })), { color: C.blue })}
          <h3 class="small muted" style="margin:12px 0 2px">LOWEST PROFIT</h3>${hbars(d.performance.worst.map(s => ({ label: s.name, value: s.net_profit })), { color: C.sky })}` : html`<div class="muted">No completed sessions in this period.</div>`}</div>
      </div>` : ''}
      <div class="grid g2" style="margin-bottom:14px">
        <div class="card"><div class="card-title"><h2>Upcoming Sessions & Events</h2><a href="#/calendar" class="small">Calendar</a></div>
          ${d.upcoming.length ? html`<div class="list">${d.upcoming.map(s => html`<div class="list-item click" data-go="#/sessions/${s.id}">${sportDot(s)}<div class="grow"><div class="t">${s.name}</div><div class="muted small">${fdate(s.event_date)} · ${ftime(s.start_time)}–${ftime(s.end_time)} · ${s.venue}</div></div><div class="right"><div class="strong small">${s.registered}/${s.max_participants || '∞'}</div>${badge(s.status)}</div></div>`)}</div>` : emptyState('No upcoming sessions', 'Create a session to get started.', html`<a class="btn primary sm" href="#/sessions/new">New Session</a>`)}</div>
        <div class="card"><div class="card-title"><h2>Latest Completed Events</h2></div>
          ${d.latest_completed.length ? html`<div class="list">${d.latest_completed.map(s => html`<div class="list-item click" data-go="#/sessions/${s.id}">${sportDot(s)}<div class="grow"><div class="t">${s.name}</div><div class="muted small">${fdate(s.event_date)} · ${s.registered} participants</div></div>${s.net_profit != null ? html`<b class="${profitCls(s.net_profit)}">${rp(s.net_profit)}</b>` : ''}</div>`)}</div>` : html`<div class="muted">No completed events yet.</div>`}</div>
      </div>
      ${fin ? html`<div class="grid g2" style="margin-bottom:14px">
        <div class="card"><div class="card-title"><h2>Operational Expense Breakdown</h2></div>${d.expense_breakdown.length ? donut(d.expense_breakdown.map((x, i) => ({ label: x.category, value: x.amount, color: [C.blue, C.sky, C.sun, C.lime, C.red, C.navy, C.mist, C.blue][i % 8] }))) : html`<div class="muted">No expenses in this period.</div>`}</div>
        <div class="card"><div class="card-title"><h2>Recent Activities</h2></div>${d.recent_activities.length ? html`<div class="list">${d.recent_activities.map(a => html`<div class="list-item ${a.link ? 'click' : ''}" ${a.link ? html`data-go="${a.link}"` : ''}><div class="grow"><div class="t">${a.text}</div><div class="muted xs">${a.by || ''} · ${fdate(String(a.at).slice(0, 10))}</div></div></div>`)}</div>` : html`<div class="muted">No activity yet.</div>`}</div>
      </div>` : html`<div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Recent Activities</h2></div>${d.recent_activities.length ? html`<div class="list">${d.recent_activities.map(a => html`<div class="list-item ${a.link ? 'click' : ''}" ${a.link ? html`data-go="${a.link}"` : ''}><div class="grow"><div class="t">${a.text}</div><div class="muted xs">${a.by || ''}</div></div></div>`)}</div>` : html`<div class="muted">No activity yet.</div>`}</div>`}
      <div class="grid g2">
        ${fin ? html`<div class="card"><div class="card-title"><h2>Recent Transactions</h2><a class="small" href="#/transactions">All</a></div><div class="list">${d.recent_transactions.map(t => html`<div class="list-item"><div class="grow"><div class="t">${t.description}</div><div class="muted xs">${fdate(t.date)} · ${t.category}</div></div><b class="${t.direction === 'in' ? 'pos' : 'neg'}">${t.direction === 'in' ? '+' : '-'}${rp(t.amount)}</b></div>`)}</div></div>
        <div class="card"><div class="card-title"><h2>Fund Balances</h2><a class="small" href="#/profit/funds">Funds</a></div><div class="list">${k.funds.map(f => html`<div class="list-item"><div class="grow"><div class="t">${f.name}</div></div><b class="${f.balance < 0 ? 'neg' : ''}">${rp(f.balance)}</b></div>`)}</div></div>` : ''}
        <div class="card"><div class="card-title"><h2>Top Active Members</h2><a class="small" href="#/activity">All</a></div>${d.top_members.length ? html`<div class="list">${d.top_members.map((m, i) => html`<div class="list-item"><div class="avatar">${i + 1}</div><div class="grow"><div class="t">${m.nickname}</div><div class="muted xs">${m.member_code}</div></div><b>${m.joined} sessions</b></div>`)}</div>` : html`<div class="muted">No participation in this period.</div>`}</div>
      </div>`);
  };
  await draw();
  bindRange(v, dashState, async rr => { await guard(() => draw()); });
  on(v, 'click', '[data-go]', (e, t) => go(t.dataset.go));
  on(v, 'click', '[data-q]', (e, t) => quickAction(t.dataset.q));
  on(v, 'click', '[data-export]', () => openExportModal(dashState));
  on(v, 'click', '[data-netcash]', async () => {
    const n = (await GET('/api/dashboard', { start: dashState.start, end: dashState.end })).kpis.net_cash, r = (l, val, cls = '') => html`<div class="row-sum"><span>${l}</span><b class="${cls}">${val}</b></div>`;
    openModal({ title: 'Sisa Bersih NPD', size: 'sm', body: html`${r('Total Cash Balance (uang tunai sekarang)', rp(n.cash))}${r('− Utang ke fotografer', rp(n.photographer), 'neg')}${r('− Bagi hasil organizer belum dibayar', rp(n.organizer_profit), 'neg')}${r('− Utang ke organizer (talangan)', rp(n.organizer_debt), 'neg')}${r('− Saldo member (belum terpakai)', rp(n.member_credit), 'neg')}<div class="row-sum total"><span>Sisa bersih NPD</span><b>${rp(n.net)}</b></div><div class="muted small" style="margin-top:8px">Ini uang yang benar-benar milik NPD setelah semua kewajiban dibayar.</div>` });
  });
}), 'dashboard');

function quickAction(q) {
  const done = () => NPD.render();
  if (q === 'session') go('#/sessions/new');
  else if (q === 'member') openMemberForm(null, done);
  else if (q === 'expense') openExpenseForm(null, done);
  else if (q === 'payment') openQuickPayment(done);
  else if (q === 'participant') pickSession({ title: 'Add Participant – choose session', filter: s => s.status !== 'Completed', onPick: s => openParticipantForm(s, null, () => go('#/sessions/' + s.id)) });
}

// =================================================================== SESSIONS LIST
const sessState = { q: '', sport_id: '', venue_id: '', status: '', sort: '', page: 1 };
route('#/sessions', () => guard(async () => {
  const v = view(), fin = can('finance');
  mount(v, html`${pageHead('All Sessions', 'Every session and event, with live participant and profit figures.', can('operations') ? html`<a class="btn primary" href="#/sessions/new">${icon('plus', 18)} Create New Session</a>` : '')}
    <div class="toolbar"><div class="searchbox"><span>${icon('search', 18)}</span><input class="inp" id="q" placeholder="Search session, ID or venue" value="${sessState.q}" inputmode="search"></div>
      <select class="inp" id="f-sport"><option value="">All sports</option>${M().sports.map(s => html`<option value="${s.id}" ${s.id == sessState.sport_id ? raw('selected') : ''}>${s.name}</option>`)}</select>
      <select class="inp" id="f-venue"><option value="">All venues</option>${M().venues.map(s => html`<option value="${s.id}" ${s.id == sessState.venue_id ? raw('selected') : ''}>${s.name}</option>`)}</select>
      <select class="inp" id="f-status"><option value="">All statuses</option>${ENUM().session_status.map(s => html`<option ${s == sessState.status ? raw('selected') : ''}>${s}</option>`)}</select>
      <select class="inp" id="f-sort"><option value="">Newest first</option><option value="date_asc" ${sessState.sort === 'date_asc' ? raw('selected') : ''}>Oldest first</option><option value="participants" ${sessState.sort === 'participants' ? raw('selected') : ''}>Most participants</option>${fin ? html`<option value="profit" ${sessState.sort === 'profit' ? raw('selected') : ''}>Highest profit</option>` : ''}</select></div>
    <div id="list"></div>`);
  const load = async () => {
    const r = await GET('/api/sessions', { ...sessState, size: 20 });
    mount($('#list', v), html`${table([
      { label: 'Session', render: s => html`<div class="strong">${s.name}</div><div class="muted xs">${s.session_code}</div>` },
      { label: 'Sport', render: s => sportChip(s.sport, s.sport_color) },
      { label: 'When', render: s => html`${fdate(s.event_date)}<div class="muted xs">${ftime(s.start_time)}–${ftime(s.end_time)}</div>` },
      { label: 'Venue', key: 'venue' },
      { label: 'Participants', render: s => html`<div class="strong small">${s.registered}${s.max_participants ? '/' + s.max_participants : ''} <span class="muted xs">(${s.paid_count} paid)</span></div>${s.max_participants ? html`<div class="progress ${s.registered >= s.max_participants ? 'full' : ''}"><i style="width:${Math.min(100, 100 * s.registered / s.max_participants)}%"></i></div>` : ''}` },
      { label: 'Status', render: s => badge(s.status) },
      ...(fin ? [{ label: 'Net profit', num: true, render: s => html`<b class="${profitCls(s.net_profit)}">${rp(s.net_profit)}</b>` }] : []),
    ], r.sessions, { rowAttr: s => `class="click" data-go="#/sessions/${s.id}"`, empty: emptyState('No sessions found', 'Adjust your filters or create a new session.', can('operations') ? html`<a class="btn primary sm" href="#/sessions/new">Create session</a>` : '') })}${pager(r.total, sessState.page, 20)}`);
  };
  await load();
  const reload = () => { sessState.page = 1; load(); };
  $('#q', v).addEventListener('input', debounce(e => { sessState.q = e.target.value; reload(); }));
  [['f-sport', 'sport_id'], ['f-venue', 'venue_id'], ['f-status', 'status'], ['f-sort', 'sort']].forEach(([id, k]) => $('#' + id, v).addEventListener('change', e => { sessState[k] = e.target.value; reload(); }));
  on(v, 'click', '[data-page]', (e, t) => { sessState.page = +t.dataset.page; load(); });
  on(v, 'click', '[data-go]', (e, t) => go(t.dataset.go));
}), 'sessions');

// =================================================================== SESSION FORM
route('#/sessions/new', () => sessionForm(null), 'create');
route('#/sessions/(\\d+)/edit', id => sessionForm(+id), 'sessions');
async function sessionForm(id) {
  const v = view(), fin = can('finance'), set = M().settings;
  let s = {};
  if (id) { const r = await GET('/api/sessions/' + id); s = r.session; s.start_time = ftime(s.start_time); s.end_time = ftime(s.end_time); }
  else { const q = hashQuery(); s = { status: 'Draft', event_date: q.date || '', start_time: '08:00', end_time: '10:00', max_participants: 16, photo_mode: fin ? (set.default_photo_mode || 'none') : 'none', photographer_id: set.default_photographer_id || '', photo_fee: set.default_photo_fee || 0, npd_share_pct: set.default_npd_share || 10, organizer_id: '' }; }
  if (fin && !s.venue_fund_id) s.venue_fund_id = (M().funds.find(f => f.code === set.default_venue_fund) || M().funds[0] || {}).id;
  const fields = [
    { section: 'Basic information' },
    { name: 'name', label: 'Session name', required: true, max: 120, full: true },
    { name: 'sport_id', label: 'Sport type', type: 'select', required: true, options: sportOpts(), placeholder: 'Select sport…' },
    { name: 'venue_id', label: 'Venue', type: 'select', required: true, options: venueOpts(), placeholder: 'Select venue…' },
    { name: 'status', label: 'Session status', type: 'select', options: ENUM().session_status },
    { name: 'event_date', label: 'Session date', type: 'date', required: true }, { name: 'max_participants', label: 'Max participants (kapasitas & target)', type: 'number', min: 0 },
    { name: 'start_time', label: 'Start time', type: 'time', required: true }, { name: 'end_time', label: 'End time', type: 'time', required: true },
    { name: 'description', label: 'Session description', type: 'textarea', full: true, max: 1000 },
    { section: 'Registration schedule' },
    { name: 'reg_open', label: 'Registration opens', type: 'date' }, { name: 'reg_close', label: 'Registration closes', type: 'date' },
    ...(fin ? [
      { section: 'Financial information' },
      { name: 'admin_fee', label: 'Biaya admin sewa lapangan (Rp)', type: 'money', hint: 'Opsional. Isi nominalnya sendiri. Dijumlahkan ke biaya venue.' },
      { name: 'venue_cost', label: 'Venue rental cost (Rp)', type: 'money', hint: 'Auto-filled from the venue price and duration. Saved with the session, so later venue price changes never alter this record.' },
      { name: 'venue_fund_id', label: 'Venue rental paid from (Source of Fund)', type: 'select', options: M().funds.map(f => ({ v: f.id, l: f.name })) },
      { name: 'session_fee', label: 'Session fee per participant (Rp)', type: 'money' },
      { name: 'budget_extra', label: 'Additional operational expenses – budget (Rp)', type: 'money' },
      { section: 'Photography configuration' },
      { name: 'photo_mode', label: 'Photography mode', type: 'select', options: [{ v: 'included', l: 'Included (in session fee)' }, { v: 'excluded', l: 'Excluded (optional add-on)' }, { v: 'none', l: 'No photography' }], full: true },
      { name: 'photographer_id', label: 'Photographer', type: 'select', options: M().photographers.filter(p => p.active).map(p => ({ v: p.id, l: p.name })), placeholder: 'Select photographer…' },
      { name: 'photo_fee', label: 'Photography fee / add-on price (Rp)', type: 'money' },
      { name: 'npd_share_pct', label: 'NPD share of photography (%)', type: 'pct' },
    ] : []),
  ];
  mount(v, html`${pageHead(id ? `Edit ${s.session_code}` : 'Create New Session', id ? s.name : 'Session ID is generated automatically when you save.', html`<a class="btn" href="${id ? '#/sessions/' + id : '#/sessions'}">Cancel</a>`)}
    <div class="card"><form id="sform" novalidate>${formHtml(fields, s)}
      <div id="conflict-hint" style="margin-top:14px"></div>
      <div id="photo-info" class="${fin ? '' : 'hide'}" style="margin-top:14px"></div></form>
      <div class="modal-foot" style="margin:18px -18px -18px;border-radius:0 0 16px 16px"><a class="btn" href="${id ? '#/sessions/' + id : '#/sessions'}">Cancel</a><button class="btn primary" id="save">${id ? 'Save changes' : 'Create session'}</button></div></div>`);
  const form = $('#sform', v), idem = uuid(), g = n => form.elements[n];
  const hours = () => { const [a, b] = [g('start_time').value, g('end_time').value]; if (!a || !b) return 0; const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number); return Math.max(0, (bh * 60 + bm - ah * 60 - am) / 60); };
  const prefillCost = () => { if (!fin || id) return; const ven = M().venues.find(x => x.id == g('venue_id').value); if (!ven || ven.rental_price == null) return; const cost = ven.pricing_type === 'per session' ? ven.rental_price : Math.round(ven.rental_price * hours()); g('venue_cost').value = cost ? num(cost) : ''; };
  const photoUI = () => {
    if (!fin) return;
    const mode = g('photo_mode').value, none = mode === 'none';
    ['photographer_id', 'photo_fee', 'npd_share_pct'].forEach(n => $(`[data-field=${n}]`, form).classList.toggle('hide', none));
    $('label[for=f_photo_fee]', form).firstChild.textContent = mode === 'excluded' ? 'Photography add-on price per participant (Rp)' : 'Photography fee per participant, inside session fee (Rp)';
    const fee = +g('session_fee').value.replace(/\D/g, '') || 0, pf = +g('photo_fee').value.replace(/\D/g, '') || 0, tp = +g('max_participants').value || 0, npd = +g('npd_share_pct').value || 0;
    mount($('#photo-info', v), none ? '' : html`<div class="alert info">${icon('camera', 18)}<span>Photographer receives <b>${pctf(100 - npd)}</b> · NPD keeps <b>${pctf(npd)}</b> of photography revenue.${mode === 'excluded' ? ' Only participants who choose the add-on count.' : ''} At ${tp} paid participants${mode === 'included' ? `: photography revenue ${rp(tp * pf)} → photographer ${rp(Math.round(tp * pf * (100 - npd) / 100))}, NPD ${rp(Math.round(tp * pf * npd / 100))}.` : ' (if all choose the add-on): ' + rp(tp * pf) + ' revenue.'}${mode === 'included' && pf > fee ? ' ⚠ Photography fee exceeds the session fee.' : ''}</span></div>`);
  };
  const hint = debounce(async () => {
    if (!g('venue_id').value || !g('event_date').value || !g('start_time').value || !g('end_time').value) return;
    const r = await GET('/api/sessions/conflicts', { venue_id: g('venue_id').value, date: g('event_date').value, start: g('start_time').value, end: g('end_time').value, exclude_id: id || '' });
    mount($('#conflict-hint', v), r.conflicts.length ? html`<div class="alert warn">${icon('alert', 18)}<div><b>Venue conflict:</b> ${r.conflicts.length} other session(s) overlap.${conflictList(r.conflicts)}</div></div>` : '');
  }, 300);
  ['venue_id', 'start_time', 'end_time'].forEach(n => g(n).addEventListener('change', () => { prefillCost(); hint(); }));
  g('event_date').addEventListener('change', hint);
  if (fin && !id) g('photographer_id').addEventListener('change', () => { const p = M().photographers.find(x => x.id == g('photographer_id').value); if (!p) return; if (p.default_fee != null) g('photo_fee').value = num(p.default_fee); if (p.default_npd_share != null) g('npd_share_pct').value = p.default_npd_share; photoUI(); });
  if (fin) { ['photo_mode', 'session_fee', 'photo_fee', 'max_participants', 'npd_share_pct'].forEach(n => g(n).addEventListener('input', photoUI)); g('photo_mode').addEventListener('change', photoUI); photoUI(); }
  hint();
  $('#save', v).addEventListener('click', async e => {
    const btn = e.currentTarget; $$('.form-err', v).forEach(x => x.remove());
    const d = readForm(form, fields);
    btn.disabled = true; btn.textContent = 'Saving…';
    let ff = false, cf = false;
    const send = () => id ? api('PUT', '/api/sessions/' + id, { ...d, force: cf, force_fund: ff }) : api('POST', '/api/sessions', { ...d, force: cf, force_fund: ff }, { idem });
    try {
      let r;
      for (let tries = 0; tries < 3 && !r; tries++) {
        try { r = await send(); }
        catch (er) {
          const code = er.data && er.data.code;
          if (code === 'venue_conflict' && await confirmConflicts(er.data.conflicts)) cf = true;
          else if (code === 'fund_overdraw' && await confirmBox({ title: 'Fund would be overdrawn', message: er.message + ' Simpan sesi anyway?', confirmText: 'Simpan anyway', danger: true })) ff = true;
          else throw er;
        }
      }
      await refreshMeta(); toast(id ? 'Session updated' : `Session ${r.session_code} created`); go('#/sessions/' + (id || r.id));
    } catch (er) { showErr($('.card', v), er.message); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    finally { btn.disabled = false; btn.textContent = id ? 'Save changes' : 'Create session'; }
  });
}

// =================================================================== SESSION DETAIL
route('#/sessions/(\\d+)', id => guard(async () => {
  const v = view(), fin = can('finance'), ops = can('operations');
  const load = async () => {
    const r = await GET('/api/sessions/' + id), s = r.session, ps = r.participants;
    const cap = s.max_participants;
    const evalRows = fin ? [
      ['Participants', s.target_participants, s.paid_count, false],
      ['Revenue', s.target_revenue, s.actual_revenue, true],
      ['Expenses', s.budget_expenses, s.total_expenses, true, true],
      ['Profit', s.estimated_profit, s.net_profit, true]] : [];
    mount(v, html`
      <a href="#/sessions" class="small">${icon('chevL', 14)} All sessions</a>
      ${pageHead(html`${s.name} ${demoTag(s)}`, html`${s.session_code} · ${sportChip(s.sport, s.sport_color)} · ${fdate(s.event_date)} ${ftime(s.start_time)}–${ftime(s.end_time)} · ${s.venue}${s.venue_area ? ', ' + s.venue_area : ''} · ${badge(s.status)}`, ops ? html`
        <button class="btn" id="a-edit">${icon('edit', 16)} Edit</button><button class="btn" id="a-resched">${icon('calendar', 16)} Reschedule</button>
        ${s.status !== 'Cancelled' ? html`<button class="btn danger" id="a-cancel">Cancel session</button>` : ''}<button class="btn danger" id="a-del">${icon('trash', 16)}</button>` : '')}
      ${s.conflicts.length ? html`<div class="alert warn" style="margin-bottom:14px">${icon('alert', 18)}<div><b>Venue conflict.</b> Another session overlaps this venue and time.${conflictList(s.conflicts)}</div></div>` : ''}
      ${s.status === 'Cancelled' && s.cancel_reason ? html`<div class="alert err" style="margin-bottom:14px">${icon('alert', 18)}<span>Cancelled: ${s.cancel_reason}</span></div>` : ''}
      <div class="grid g4" style="margin-bottom:14px">
        ${kpi('Registered', `${s.registered}${cap ? ' / ' + cap : ''}`, `${s.paid_count} paid · ${s.attended} attended`, { icon: 'users' })}
        ${fin ? html`${kpi('Business revenue', rp(s.organizer_revenue), `Cash retained ${rp(s.net_collected)}`, { accent: true, icon: 'trend' })}
        ${kpi('Expenses', rp(s.total_expenses), `Sewa ${rp(s.venue_cost)}${s.admin_fee ? ' + admin ' + rp(s.admin_fee) : ''} + lain ${rp(s.other_expenses)}`, { icon: 'receipt' })}
        ${kpi('Net session profit', rp(s.net_profit), s.receivable ? `Receivable ${rp(s.receivable)} not counted` : 'Actual', { icon: 'coin', cls: profitCls(s.net_profit) })}` : ''}
      </div>
      ${fin ? html`<div class="grid g2" style="margin-bottom:14px">
        <div class="card"><div class="card-title"><h2>Session financial summary</h2></div>
          <div class="row-sum"><span>Total session revenue ${s.photo_mode === 'included' ? html`<span class="muted xs">(incl. photography)</span>` : ''}</span><b>${rp(s.session_revenue)}</b></div>
          ${s.photo_mode !== 'none' ? html`
          <div class="row-sum sub"><span>Photography revenue (${PHOTO_LABEL[s.photo_mode]}, ${s.photo_participants} participants)</span><span>${rp(s.photo_revenue)}</span></div>
          <div class="row-sum sub"><span>Photographer share (${pctf(s.photographer_share_pct)}) – payable</span><span>${rp(s.photographer_share)}</span></div>
          <div class="row-sum sub"><span>NPD photography share (${pctf(s.npd_share_pct)})</span><span>${rp(s.npd_photo_share)}</span></div>` : ''}
          <div class="row-sum"><span>Business revenue</span><b>${rp(s.organizer_revenue)}</b></div>
          <div class="row-sum sub"><span>Venue cost</span><span>-${rp(s.venue_cost)}</span></div>${s.admin_fee ? html`<div class="row-sum sub"><span>Biaya admin sewa</span><span>-${rp(s.admin_fee)}</span></div>` : ''}
          <div class="row-sum sub"><span>Operational expenses</span><span>-${rp(s.other_expenses)}</span></div>
          <div class="row-sum total"><span>Net session profit</span><b class="${profitCls(s.net_profit)}">${rp(s.net_profit)}</b></div>
          ${s.refunds ? html`<div class="muted xs" style="margin-top:8px">Refunds returned: ${rp(s.refunds)} (not counted as revenue)</div>` : ''}</div>
        <div class="card"><div class="card-title"><h2>Target vs actual</h2></div>
          ${table([{ label: 'Metric', key: 0 }, { label: 'Target / Budget', num: true, render: r => r[3] ? rp(r[1]) : r[1] }, { label: 'Actual', num: true, render: r => r[3] ? rp(r[2]) : r[2] },
            { label: 'Variance', num: true, render: r => { const dlt = r[2] - r[1], good = r[4] ? dlt <= 0 : dlt >= 0; return html`<b class="${dlt === 0 ? '' : good ? 'pos' : 'neg'}">${dlt > 0 ? '+' : ''}${r[3] ? rp(dlt) : dlt}</b>`; } }], evalRows.map(r => ({ 0: r[0], 1: r[1], 2: r[2], 3: r[3], 4: r[4] })).map(o => ({ 0: o[0], ...o })))}
          <div class="muted xs" style="margin-top:8px">Target revenue = target participants × session fee. Budget = venue cost + additional operational budget (${rp(s.budget_extra)}).</div></div></div>` : ''}
      <div class="card" style="margin-bottom:14px">
        <div class="card-title"><h2>Participants (${ps.length})</h2><div class="actions"><a class="btn sm" href="#/sessions/${id}/greetings">Pesan member</a> <a class="btn sm" href="#/sessions/${id}/match">Generate match</a></div>${ops && s.status !== 'Cancelled' ? html`<button class="btn primary sm" id="a-add">${icon('plus', 16)} Add participant</button>` : ''}</div>
        ${table([
          { label: 'Member', render: p => html`<div class="strong">${p.nickname}</div><div class="muted xs">${p.member_code}</div>` },
          { label: 'WhatsApp', render: p => p.whatsapp ? raw(`<a href="https://wa.me/${esc(p.whatsapp.replace('+', ''))}" target="_blank" rel="noopener">${esc(p.whatsapp)}</a>`) : '—' },
          { label: 'Payment', render: p => ops ? html`<select class="inp sm-sel" data-pay="${p.id}" style="min-height:36px;padding:4px 28px 4px 8px">${ENUM().payment_status.map(x => html`<option ${x === p.payment_status ? raw('selected') : ''}>${x}</option>`)}</select>` : badge(p.payment_status) },
          ...(fin ? [{ label: 'Amount', num: true, render: p => p.payment_status === 'Waiting for Payment' ? html`<span class="muted">due ${rp(p.due)}</span>` : html`${rp(p.retained)}${p.refund_amount ? html`<div class="xs muted">${p.credit_amount ? 'jadi saldo ' + rp(p.credit_amount) + (p.refund_amount > p.credit_amount ? ' · refund ' + rp(p.refund_amount - p.credit_amount) : '') : 'refund ' + rp(p.refund_amount)}</div>` : ''}${p.credit_used ? html`<div class="xs muted">pakai saldo ${rp(p.credit_used)}</div>` : ''}${p.noshow_forfeit ? html`<div class="xs muted">tidak hadir · hangus</div>` : ''}` }] : []),
          ...(s.photo_mode !== 'none' ? [{ label: 'Photo', render: p => s.photo_mode === 'included' ? badge('Included', 'grey') : p.photo_selected ? badge('Add-on', 'green') : '—' }] : []),
          { label: 'Attendance', render: p => ops ? html`<select class="inp" data-att="${p.id}" style="min-height:36px;padding:4px 28px 4px 8px">${ENUM().attendance.map(x => html`<option ${x === p.attendance ? raw('selected') : ''}>${x}</option>`)}</select>` : badge(p.attendance) },
          ...(ops ? [{ label: '', act: true, render: p => html`${fin && ['Paid', 'Partially Refunded', 'Refunded'].includes(p.payment_status) ? html`<button class="btn sm" data-credit="${p.id}">Saldo</button>` : ''}<button class="icon-btn sm" data-edit="${p.id}" aria-label="Edit">${icon('edit', 18)}</button><button class="icon-btn sm red" data-del="${p.id}" aria-label="Remove">${icon('trash', 18)}</button>` }] : []),
        ], ps, { empty: emptyState('No participants yet', 'Register members to start collecting payments.', ops ? html`<button class="btn primary sm" id="a-add2">Add participant</button>` : '') })}</div>
      ${fin && r.expenses.length ? html`<div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Session expenses</h2><button class="btn sm" id="a-exp">${icon('plus', 16)} Add</button></div>${table([{ label: 'ID', key: 'code' }, { label: 'Date', render: e => fdate(e.txn_date) }, { label: 'Category', key: 'category' }, { label: 'Description', key: 'description' }, { label: 'Amount', num: true, render: e => rp(e.amount) }], r.expenses)}</div>` : (fin ? html`<div style="margin-bottom:14px"><button class="btn sm" id="a-exp">${icon('plus', 16)} Add session expense</button></div>` : '')}
      <div class="card"><div class="card-title"><h2>Details</h2></div><div class="kv">
<div><span>Registration window</span>${s.reg_open ? fdate(s.reg_open) : '—'} → ${s.reg_close ? fdate(s.reg_close) : '—'}</div>
        ${fin ? html`<div><span>Session fee</span>${rp(s.session_fee)}</div><div><span>Photography</span>${PHOTO_LABEL[s.photo_mode]}${s.photographer ? ' · ' + s.photographer : ''}${s.photo_mode !== 'none' ? ' · ' + rp(s.photo_fee) : ''}</div>` : ''}
        <div style="grid-column:1/-1"><span>Description</span>${s.description || '—'}</div></div></div>`);
    return r;
  };
  let r = await load();
  const re = async () => { r = await load(); };
  on(v, 'click', '#a-edit', () => go(`#/sessions/${id}/edit`));
  on(v, 'click', '#a-resched', () => openReschedule(r.session, re));
  on(v, 'click', '#a-add,#a-add2', () => openParticipantForm(r.session, null, re));
  on(v, 'click', '#a-exp', () => openExpenseForm(null, re, id));
  on(v, 'click', '#a-cancel', () => openCancelSession(r.session, r.participants, fin, re));
  on(v, 'click', '[data-credit]', (e, t) => openCreditModal(r.participants.find(p => p.id == t.dataset.credit), r.session, re));
  on(v, 'click', '#a-del', () => runDelete({ what: 'session', url: '/api/sessions/' + id, onDone: () => go('#/sessions'), message: 'Only sessions without payments or expenses can be deleted; otherwise cancel it. This cannot be undone.' }));
  on(v, 'click', '[data-edit]', (e, t) => openParticipantForm(r.session, r.participants.find(p => p.id == t.dataset.edit), re));
  on(v, 'click', '[data-del]', (e, t) => runDelete({ what: 'registration', url: '/api/participants/' + t.dataset.del, onDone: re, message: 'Remove this member from the session? Paid registrations must be refunded instead.' }));
  on(v, 'change', '[data-att]', async (e, t) => { try { await api('PUT', '/api/participants/' + t.dataset.att, { attendance: t.value }); toast('Attendance updated'); re(); } catch (er) { toast(er.message, 'err'); re(); } });
  on(v, 'change', '[data-pay]', async (e, t) => {
    const p = r.participants.find(x => x.id == t.dataset.pay);
    if (t.value === 'Partially Refunded') { openParticipantForm(r.session, { ...p, payment_status: 'Partially Refunded' }, re); return; }
    try { await api('PUT', '/api/participants/' + p.id, { payment_status: t.value }); toast('Payment status updated'); re(); } catch (er) { toast(er.message, 'err'); re(); }
  });
}), 'sessions');

function prompt_(title, label) {
  return new Promise(res => {
    let done = false;
    const m = openModal({ title, size: 'sm', body: html`<div class="field"><label>${label}</label><input class="inp" id="pr" maxlength="300"></div>`, footer: html`<button class="btn" data-close>Back</button><button class="btn solid-danger" data-ok>Confirm</button>`, onClose: () => { if (!done) res(null); } });
    on(m.el, 'click', '[data-ok]', () => { done = true; const val = $('#pr', m.el).value; m.close(); res(val); });
  });
}

// =================================================================== CALENDAR
const calState = { view: 'month', date: todayISO(), sport_id: '', venue_id: '', status: '', from: '', to: '' };
const monday = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
function calRange() {
  const d = parseISO(calState.date);
  if (calState.view === 'day') return [calState.date, calState.date];
  if (calState.view === 'week') { const m = monday(calState.date); return [m, addDays(m, 6)]; }
  const first = iso(new Date(d.getFullYear(), d.getMonth(), 1)), last = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  if (calState.view === 'list') return [calState.from || first, calState.to || last];
  return [monday(first), addDays(monday(last), 6)];
}
route('#/calendar', () => guard(async () => {
  const v = view();
  const draw = async () => {
    const [a, b] = calRange();
    const r = await GET('/api/calendar', { start: a, end: b, sport_id: calState.sport_id, venue_id: calState.venue_id, status: calState.status });
    const ev = r.events, d = parseISO(calState.date), today = todayISO();
    const evChip = e => html`<div class="ev ${e.status === 'Cancelled' ? 'cancelled' : ''} ${e.conflict ? 'conflict' : ''}" style="border-left-color:${e.sport_color}" data-ev="${e.id}" title="${e.name}">${ftime(e.start_time)} ${e.name}</div>`;
    const evCard = e => html`<div class="ev-card ${e.conflict ? 'conflict' : ''}" style="border-left-color:${e.sport_color}" data-ev="${e.id}"><div class="t">${e.name}</div><div class="muted xs">${ftime(e.start_time)}–${ftime(e.end_time)} · ${e.venue}${e.venue_area ? ' (' + e.venue_area + ')' : ''}</div><div style="display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap">${sportChip(e.sport, e.sport_color)}${badge(e.status)}<span class="xs strong">${e.registered}/${e.max_participants || '∞'}</span>${e.conflict ? badge('Conflict', 'red') : ''}</div></div>`;
    const byDay = {}; ev.forEach(e => (byDay[e.event_date] ||= []).push(e));
    const title = calState.view === 'month' ? `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}` : calState.view === 'week' ? `${fdate(a)} – ${fdate(b)}` : calState.view === 'day' ? fdate(calState.date) : `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
    let body = '';
    if (calState.view === 'month') {
      const days = []; for (let x = a; x <= b; x = addDays(x, 1)) days.push(x);
      body = html`<div class="cal-month">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => html`<div class="cal-dow">${x}</div>`)}${days.map(x => { const es = byDay[x] || []; return html`<div class="cal-day ${parseISO(x).getMonth() !== d.getMonth() ? 'other' : ''} ${x === today ? 'today' : ''}" data-day="${x}"><span class="dn">${parseISO(x).getDate()}</span>${es.slice(0, 3).map(evChip)}${es.length > 3 ? html`<div class="xs muted">+${es.length - 3} more</div>` : ''}<div class="ev-dots">${es.map(e => html`<i class="dot" style="background:${e.sport_color}"></i>`)}</div></div>`; })}</div>
        <div id="day-panel" class="card" style="margin-top:14px" hidden></div>`;
    } else if (calState.view === 'week') {
      body = html`<div class="cal-week">${Array.from({ length: 7 }, (_, i) => addDays(a, i)).map(x => html`<div class="wk-col ${x === today ? 'today' : ''}"><h4>${DOW[parseISO(x).getDay()]} ${parseISO(x).getDate()} ${MONTHS[parseISO(x).getMonth()]}</h4>${(byDay[x] || []).map(evCard)}${!(byDay[x] || []).length ? html`<div class="muted xs">No events</div>` : ''}</div>`)}</div>`;
    } else if (calState.view === 'day') {
      const es = byDay[calState.date] || [];
      body = html`<div class="card">${es.length ? es.map(evCard) : emptyState('No events on this day', 'Schedule a session for this date.')}${can('operations') ? html`<a class="btn primary" href="#/sessions/new?date=${calState.date}">${icon('plus', 16)} Add event on this day</a>` : ''}</div>`;
    } else {
      body = ev.length ? table([{ label: 'Date', render: e => html`<b>${fdate(e.event_date)}</b><div class="muted xs">${DOW[parseISO(e.event_date).getDay()]} ${ftime(e.start_time)}–${ftime(e.end_time)}</div>` }, { label: 'Event', render: e => html`<div class="strong">${e.name}</div>${e.conflict ? badge('Conflict', 'red') : ''}` }, { label: 'Sport', render: e => sportChip(e.sport, e.sport_color) }, { label: 'Venue', render: e => `${e.venue}${e.venue_area ? ' · ' + e.venue_area : ''}` }, { label: 'Capacity', render: e => `${e.registered}/${e.max_participants || '∞'}` }, { label: 'Status', render: e => badge(e.status) }], ev, { rowAttr: e => `class="click" data-ev="${e.id}"` }) : html`<div class="card">${emptyState('No events in this range', 'Change the filters or dates.')}</div>`;
    }
    mount(v, html`${pageHead('Event Calendar', 'Central schedule for all sessions and events. Overlapping venue bookings are highlighted.', can('operations') ? html`<a class="btn primary" href="#/sessions/new${calState.view === 'day' ? '?date=' + calState.date : ''}">${icon('plus', 18)} New Event</a>` : '')}
      <div class="cal-head"><div class="actions"><button class="icon-btn" data-nav="-1" aria-label="Previous">${icon('chevL')}</button><button class="icon-btn" data-nav="1" aria-label="Next">${icon('chevR')}</button><button class="btn sm" data-today>Today</button><h2 style="margin-left:6px">${title}</h2></div>
        <div class="chips">${['month', 'week', 'day', 'list'].map(x => html`<button class="chip ${calState.view === x ? 'on' : ''}" data-view="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`)}</div></div>
      <div class="toolbar"><select class="inp" id="c-sport"><option value="">All sports</option>${M().sports.map(s => html`<option value="${s.id}" ${s.id == calState.sport_id ? raw('selected') : ''}>${s.name}</option>`)}</select>
        <select class="inp" id="c-venue"><option value="">All venues</option>${M().venues.map(s => html`<option value="${s.id}" ${s.id == calState.venue_id ? raw('selected') : ''}>${s.name}</option>`)}</select>
        <select class="inp" id="c-status"><option value="">All statuses</option>${ENUM().session_status.map(s => html`<option ${s == calState.status ? raw('selected') : ''}>${s}</option>`)}</select>
        ${calState.view === 'list' ? html`<input class="inp" type="date" id="c-from" value="${calState.from || a}" aria-label="From"><input class="inp" type="date" id="c-to" value="${calState.to || b}" aria-label="To">` : html`<input class="inp" type="date" id="c-date" value="${calState.date}" aria-label="Jump to date">`}</div>
      ${body}`);
    window._calEvents = ev;
  };
  const show = async () => guard(draw);
  await draw();
  on(v, 'click', '[data-nav]', (e, t) => { const n = +t.dataset.nav, d = parseISO(calState.date); if (calState.view === 'day') d.setDate(d.getDate() + n); else if (calState.view === 'week') d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n, 1); calState.date = iso(d); calState.from = calState.to = ''; show(); });
  on(v, 'click', '[data-today]', () => { calState.date = todayISO(); calState.from = calState.to = ''; show(); });
  on(v, 'click', '[data-view]', (e, t) => { calState.view = t.dataset.view; calState.from = calState.to = ''; show(); });
  v.addEventListener('change', e => {
    const m = { 'c-sport': 'sport_id', 'c-venue': 'venue_id', 'c-status': 'status', 'c-date': 'date', 'c-from': 'from', 'c-to': 'to' }[e.target.id];
    if (m) { calState[m] = e.target.value || (m === 'date' ? todayISO() : ''); show(); }
  });
  on(v, 'click', '[data-day]', (e, t) => {
    if (e.target.closest('[data-ev]') && matchMedia('(min-width:901px)').matches) return;
    const x = t.dataset.day, es = (window._calEvents || []).filter(q => q.event_date === x), p = $('#day-panel', v);
    if (!p) return;
    p.hidden = false;
    mount(p, html`<div class="card-title"><h2>${fdate(x)}</h2>${can('operations') ? html`<a class="btn sm primary" href="#/sessions/new?date=${x}">${icon('plus', 16)} Add event</a>` : ''}</div>${es.length ? es.map(q => html`<div class="ev-card" style="border-left-color:${q.sport_color}" data-ev="${q.id}"><div class="t">${q.name}</div><div class="muted xs">${ftime(q.start_time)}–${ftime(q.end_time)} · ${q.venue} · ${q.registered}/${q.max_participants || '∞'} · ${q.status}</div></div>`) : html`<div class="muted">No events on this day.</div>`}`);
    if (matchMedia('(max-width:900px)').matches) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  on(v, 'click', '[data-ev]', (e, t) => { e.stopPropagation(); const ev = (window._calEvents || []).find(q => q.id == t.dataset.ev); ev && eventModal(ev, show); });
}), 'calendar');

function eventModal(e, refresh) {
  const full = e.max_participants && e.registered >= e.max_participants;
  const m = openModal({ title: e.name, body: html`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${sportChip(e.sport, e.sport_color)}${badge(e.status)}${e.conflict ? badge('Venue conflict', 'red') : ''}</div>
    <div class="kv"><div><span>Date</span>${fdate(e.event_date)}</div><div><span>Time</span>${ftime(e.start_time)}–${ftime(e.end_time)}</div><div><span>Venue</span>${e.venue}</div><div><span>Area</span>${e.venue_area || '—'}</div></div>
    <div style="margin-top:14px"><span class="muted small strong">REGISTRATION CAPACITY</span><div class="strong" style="margin:4px 0">${e.registered} / ${e.max_participants || 'no limit'} ${full ? badge('Full', 'amber') : ''}</div>${e.max_participants ? html`<div class="progress ${full ? 'full' : ''}"><i style="width:${Math.min(100, 100 * e.registered / e.max_participants)}%"></i></div>` : ''}</div>`,
    footer: html`${can('operations') && e.status !== 'Cancelled' ? html`<button class="btn" data-r>Reschedule</button><button class="btn danger" data-c>Cancel event</button>` : ''}<a class="btn primary" href="#/sessions/${e.id}" data-close>Open details</a>` });
  on(m.el, 'click', '[data-r]', () => { m.close(); openReschedule(e, refresh); });
  on(m.el, 'click', '[data-c]', async () => { m.close(); const rs = await prompt_('Cancel this event?', 'Reason (optional)'); if (rs === null) return; try { await api('POST', `/api/sessions/${e.id}/cancel`, { reason: rs }); toast('Event cancelled'); refresh(); } catch (er) { toast(er.message, 'err'); } });
}

// =================================================================== VENUES
const venState = { q: '', sport_id: '', area: '', sort: '' };
route('#/venues', () => guard(async () => {
  const v = view(), fin = can('finance');
  const load = async () => {
    const r = await GET('/api/venues', venState);
    mount($('#vlist', v), r.venues.length ? html`<div class="venue-grid">${r.venues.map(x => html`<div class="card venue-card ${x.status === 'Inactive' ? '' : ''}">
      <div class="top"><div><h3>${x.name} ${demoTag(x)}</h3><div class="muted small">${x.venue_code} · ${x.area || 'No area'} · ${x.setting}</div></div>${badge(x.status)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${x.sport_ids.map(id => { const s = sportById(id); return sportChip(s.name, s.color); })}</div>
      <div class="small">${x.address || '—'}</div>
      <div class="row-sum" style="border:0;padding:0"><span class="muted small">Rental price</span><b>${rp(x.rental_price)} <span class="muted xs">${x.pricing_type}</span></b></div>
      ${x.facilities ? html`<div class="muted small">${x.facilities}</div>` : ''}
      <div class="small">${x.contact_person ? x.contact_person : ''} ${x.contact_phone ? '· ' + x.contact_phone : ''}</div>
      <div class="actions">${x.maps_url ? raw(`<a class="btn sm" target="_blank" rel="noopener" href="${esc(x.maps_url)}">${icon('pin', 15).s} Map</a>`) : ''}${x.whatsapp_url ? raw(`<a class="btn sm" target="_blank" rel="noopener" href="${esc(x.whatsapp_url)}">WhatsApp</a>`) : ''}${x.booking_url ? raw(`<a class="btn sm" target="_blank" rel="noopener" href="${esc(x.booking_url)}">${icon('link', 15).s} Booking</a>`) : ''}
        <span style="flex:1"></span>${can('operations') ? html`<button class="icon-btn sm" data-edit="${x.id}" aria-label="Edit">${icon('edit', 18)}</button><button class="icon-btn sm red" data-del="${x.id}" aria-label="Delete">${icon('trash', 18)}</button>` : ''}</div>
      <div class="muted xs">${x.session_count} session(s) held${x.notes ? ' · ' + x.notes : ''}</div></div>`)}</div>` : html`<div class="card">${emptyState('No venues found', 'Add your first venue.', can('operations') ? html`<button class="btn primary sm" id="add2">Add venue</button>` : '')}</div>`);
    $('#f-area', v).innerHTML = '<option value="">All areas</option>' + r.areas.map(a => `<option ${a === venState.area ? 'selected' : ''}>${esc(a)}</option>`).join('');
    window._venues = r.venues;
  };
  mount(v, html`${pageHead('Venues', 'Central venue database. Rental prices are copied into each session when it is created.', can('operations') ? html`<button class="btn primary" id="add">${icon('plus', 18)} Add Venue</button>` : '')}
    <div class="toolbar"><div class="searchbox"><span>${icon('search', 18)}</span><input class="inp" id="q" placeholder="Search venue, address or area" value="${venState.q}"></div>
      <select class="inp" id="f-sport"><option value="">All sports</option>${M().sports.map(s => html`<option value="${s.id}">${s.name}</option>`)}</select><select class="inp" id="f-area"></select>
      <select class="inp" id="f-sort"><option value="">Name A–Z</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></div><div id="vlist"></div>`);
  await load();
  $('#q', v).addEventListener('input', debounce(e => { venState.q = e.target.value; load(); }));
  [['f-sport', 'sport_id'], ['f-area', 'area'], ['f-sort', 'sort']].forEach(([id, k]) => $('#' + id, v).addEventListener('change', e => { venState[k] = e.target.value; load(); }));
  const done = async () => { await refreshMeta(); load(); };
  on(v, 'click', '#add,#add2', () => venueForm(null, done));
  on(v, 'click', '[data-edit]', (e, t) => venueForm(window._venues.find(x => x.id == t.dataset.edit), done));
  on(v, 'click', '[data-del]', (e, t) => runDelete({ what: 'venue', url: '/api/venues/' + t.dataset.del, onDone: done, message: 'Venues with session history are set to Inactive instead of deleted.' }));
}), 'venues');

function venueForm(x, onDone) {
  const editing = !!x;
  const fields = [
    { name: 'name', label: 'Venue name', required: true, full: true }, { name: 'address', label: 'Full address', type: 'textarea', full: true }, { name: 'area', label: 'City / Area' },
    { name: 'setting', label: 'Indoor / Outdoor', type: 'select', options: ['Indoor', 'Outdoor', 'Both'] },
    { name: 'rental_price', label: 'Rental price (Rp)', type: 'money' }, { name: 'pricing_type', label: 'Pricing type', type: 'select', options: ['per hour', 'per session'] },
    { name: 'maps_url', label: 'Google Maps link', type: 'url', full: true }, { name: 'contact_person', label: 'Contact person' }, { name: 'contact_phone', label: 'Contact number', type: 'tel' },
    { name: 'whatsapp_url', label: 'WhatsApp link', type: 'url', placeholder: 'https://wa.me/62…' }, { name: 'booking_url', label: 'Booking contact link', type: 'url' },
    { name: 'facilities', label: 'Available facilities', full: true, hint: 'e.g. Parking, Toilets, Lighting' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] }];
  formModal({
    title: editing ? 'Edit Venue' : 'Add Venue', fields, size: 'lg', values: { setting: 'Indoor', pricing_type: 'per hour', status: 'Active', ...x },
    top: html`<div class="field" style="margin-bottom:14px"><label>Sports played here</label><div class="chips" id="vsports">${M().sports.filter(s => s.active).map(s => html`<button type="button" class="chip ${x && x.sport_ids.includes(s.id) ? 'on' : ''}" data-sp="${s.id}">${s.name}</button>`)}</div></div>`,
    onOpen: m => on(m.el, 'click', '[data-sp]', (e, t) => t.classList.toggle('on')),
    onSubmit: async (d, ctx) => {
      d.sport_ids = $$('#vsports .chip.on', ctx.modal.el).map(c => +c.dataset.sp);
      editing ? await api('PUT', '/api/venues/' + x.id, d) : await api('POST', '/api/venues', d, { idem: ctx.key });
      ctx.modal.close(); toast(editing ? 'Venue updated' : 'Venue added'); onDone();
    },
  });
}

// =================================================================== MEMBERS
const memState = { q: '', active: '1', sort: '', page: 1 };
route('#/members', () => guard(async () => {
  const v = view(), fin = can('finance');
  mount(v, html`${pageHead('Member Database', 'Simple member records: Member ID, nickname and WhatsApp.', can('operations') ? html`<button class="btn" id="imp">${icon('upload', 16)} Import</button><button class="btn" id="lyp">Cetak kartu</button><button class="btn primary" id="add">${icon('plus', 18)} Add Member</button>` : '')}
    <div class="toolbar"><div class="searchbox"><span>${icon('search', 18)}</span><input class="inp" id="q" placeholder="Search Member ID, nickname or WhatsApp" value="${memState.q}" inputmode="search"></div>
      <select class="inp" id="f-active"><option value="1">Active</option><option value="0" ${memState.active === '0' ? raw('selected') : ''}>Inactive</option><option value="all" ${memState.active === 'all' ? raw('selected') : ''}>All</option></select>
      <select class="inp" id="f-sort"><option value="">Sort: Member ID</option><option value="nickname">Nickname A–Z</option><option value="joined">Most sessions</option>${fin ? '<option value="spend">Highest spending</option>' : ''}<option value="last">Last participation</option><option value="newest">Newest</option></select></div><div id="mlist"></div>
    <input type="file" id="impfile" accept=".csv" class="hide">`);
  const load = async () => {
    const r = await GET('/api/members', { ...memState, size: 25 });
    window._members = r.members;
    mount($('#mlist', v), html`${table([
      { label: 'Member ID', render: m => html`<b>${m.member_code}</b>${m.active ? '' : html` ${badge('Inactive', 'grey')}`}${demoTag(m)}` },
      { label: 'Nickname', render: m => html`<span class="strong">${m.nickname}</span>` }, { label: 'WhatsApp', render: m => m.whatsapp || '—' },
      { label: 'Level', render: m => m.levels ? html`<span class="muted xs">${m.levels}</span>` : '—' }, { label: 'Registered', render: m => fdate(m.registered_at) }, { label: 'Sessions', num: true, key: 'joined' }, ...(can('finance') ? [{ label: 'Saldo', num: true, render: m => m.credit > 0 ? html`<b class="pos">${rp(m.credit)}</b>` : '—' }] : []),
      { label: '', act: true, render: m => can('operations') ? html`<button class="icon-btn sm" data-edit="${m.id}" aria-label="Edit">${icon('edit', 18)}</button><button class="icon-btn sm red" data-del="${m.id}" aria-label="Delete">${icon('trash', 18)}</button>` : '' }],
      r.members, { rowAttr: m => `class="click" data-go="#/members/${m.id}"`, empty: emptyState('No members found', 'Add a member or import a CSV/Excel file.', can('operations') ? html`<button class="btn primary sm" id="add2">Add member</button>` : '') })}${pager(r.total, memState.page, 25)}`);
  };
  await load();
  const reload = () => { memState.page = 1; load(); };
  $('#q', v).addEventListener('input', debounce(e => { memState.q = e.target.value; reload(); }));
  $('#f-active', v).addEventListener('change', e => { memState.active = e.target.value; reload(); }); $('#f-sort', v).addEventListener('change', e => { memState.sort = e.target.value; reload(); });
  on(v, 'click', '[data-page]', (e, t) => { memState.page = +t.dataset.page; load(); });
  on(v, 'click', '#add,#add2', () => openMemberForm(null, load));
  on(v, 'click', '#lyp', () => openLoyaltyPrint());
  on(v, 'click', '[data-edit]', (e, t) => { e.stopPropagation(); openMemberForm(window._members.find(m => m.id == t.dataset.edit), load); });
  on(v, 'click', '[data-del]', (e, t) => { e.stopPropagation(); runDelete({ what: 'member', url: '/api/members/' + t.dataset.del, onDone: load, message: 'Members with session history are deactivated instead of deleted, so history is preserved.' }); });
  on(v, 'click', '[data-go]', (e, t) => { if (!e.target.closest('button')) go(t.dataset.go); });
  on(v, 'click', '#imp', () => importDialog(load));
}), 'members');

function importDialog(done) {
  const m = openModal({ title: 'Import members', body: html`<p style="margin-top:0">Upload a <b>.csv</b> file with a header row (di Excel: File → Save As → CSV). Columns: <b>Nickname</b> (required), <b>WhatsApp</b>, <b>Notes</b>.</p><div class="alert info">${icon('info', 18)}<span>Rows with a duplicate Reclub ID or WhatsApp number are skipped and listed so nothing is duplicated. Full names, emails and Instagram are intentionally not stored.</span></div><div class="field" style="margin-top:14px"><label>File</label><input class="inp" type="file" id="ifile" accept=".csv"></div><div id="iresult" style="margin-top:12px"></div>`, footer: html`<button class="btn" data-close>Close</button><button class="btn primary" id="go-imp">Import</button>` });
  on(m.el, 'click', '#go-imp', async e => {
    const f = $('#ifile', m.el).files[0]; if (!f) { showErr(m.body, 'Choose a file first.'); return; }
    const b = e.currentTarget; b.disabled = true; const fd = new FormData(); fd.append('file', f);
    try { const r = await api('POST', '/api/members/import', fd); mount($('#iresult', m.el), html`<div class="alert ok">${icon('check', 18)}<span>${r.created} member(s) imported, ${r.skipped.length} skipped.</span></div>${r.skipped.length ? html`<div class="list" style="max-height:200px;overflow:auto;margin-top:8px">${r.skipped.map(s => html`<div class="list-item"><div class="grow small">Row ${s.row}: <b>${s.nickname || '—'}</b><div class="muted xs">${s.reason}</div></div></div>`)}</div>` : ''}`); done(); }
    catch (er) { showErr(m.body, er.message); } finally { b.disabled = false; }
  });
}

route('#/members/(\\d+)', id => guard(async () => {
  const v = view(), fin = can('finance');
  let cur, curCr, curLy;
  const load = async () => {
    const r = await GET(`/api/members/${id}/profile`), m = r.member; cur = m;
    const cr = fin ? await GET(`/api/members/${id}/credit`) : { balance: 0, entries: [] }; curCr = cr;
    const ly = await GET(`/api/members/${id}/loyalty`); curLy = ly; const lySvg = await LC.cardFor(m, ly, 'back', false);
    setTimeout(() => lyCheer(m, ly), 350);
    const ms = await GET(`/api/members/${id}/match-stats`); await PH.load();
    mount(v, html`<a href="#/members" class="small">${icon('chevL', 14)} Members</a>
      ${pageHead(html`${m.nickname} ${m.active ? '' : badge('Inactive', 'grey')} ${demoTag(m)}`, html`${m.member_code}`, can('operations') ? html`<button class="btn" id="edit">${icon('edit', 16)} Edit</button>` : '')}
      <div class="mp-photo"><span class="pav" id="mp-ph-prev" data-ini="${(m.nickname || '?')[0]}" style="width:84px;height:84px;font-size:34px">${PH.map[id] ? raw(`<img src="${PH.map[id]}" alt="">`) : (m.nickname || '?')[0]}</span>${can('operations') ? html`<div><label class="btn sm">${PH.map[id] ? 'Ganti foto' : 'Tambah foto'}<input type="file" id="mp-ph-in" data-mid="${id}" accept="image/*" hidden></label> <button class="btn sm" id="mp-ph-del" data-mid="${id}">Hapus</button></div>` : ''}</div>
      <div class="grid g4" style="margin-bottom:14px">${kpi('Sessions registered', m.registered)}${kpi('Sessions paid', m.paid)}${kpi('Sessions attended', m.attended)}${fin ? kpi('Total spending', rp(m.spend)) : kpi('Favorite sport', m.favorite_sport || '—')}</div>
      <div class="card" id="ly-card" style="margin-bottom:14px"><div class="card-title"><h2>Kartu loyalty</h2><div class="actions"><button class="btn sm" id="ly-png">Bagikan PNG</button><button class="btn sm" id="ly-cover">Cover</button><button class="btn sm" id="ly-print">Cetak</button></div></div>
        <div class="ly-wrap">${raw(lySvg)}</div>
        <div class="ly-info"><b>${ly.cycle_count}/20 sesi</b> · total ${ly.count} sesi hadir &amp; bayar${ly.cycle_no > 1 ? ` · kartu ke-${ly.cycle_no}` : ''}
          <div class="muted small">${ly.available.length ? html`Reward siap dipakai: ${ly.available.map(x => html`<span class="badge green">${x.label}</span> `)}` : `Sesi ke-${ly.next.at} dapat <b>${ly.next.label}</b> (kurang ${ly.next.remaining} sesi).`}</div></div></div>
      ${ms.played || ms.levels.length ? html`<div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Statistik match</h2></div>
        <div class="muted small">${ms.levels.length ? ms.levels.map(l => `${l.sport}: level ${l.level}`).join(' · ') : 'Level belum diisi.'}</div>
        ${ms.played ? html`<div class="mm-plays" style="margin:8px 0"><span class="chip"><b>${ms.played}</b> match</span><span class="chip"><b>${ms.wins}</b> Win</span><span class="chip"><b>${ms.losses}</b> Loss</span>${ms.draws ? html`<span class="chip"><b>${ms.draws}</b> Draw</span>` : ''}${ms.win_rate !== null ? html`<span class="chip">Win rate <b>${ms.win_rate}%</b></span>` : ''}</div>
        <div class="muted xs">${ms.recent.map(x => html`<div>${fdate(x.date)} · ${x.session} · ${x.result ? html`<b>${x.result === 'W' ? 'Win' : x.result === 'L' ? 'Loss' : 'Draw'}</b> ${x.score}` : 'belum ada skor'} · bareng ${x.partner || '—'} vs ${x.vs}</div>`)}</div>` : ''}</div>` : ''}
      <div class="grid g2" style="margin-bottom:14px"><div class="card"><div class="card-title"><h2>Profile</h2></div><div class="kv">
        <div><span>Member ID</span>${m.member_code}</div><div><span>Nickname</span>${m.nickname}</div>
        <div><span>WhatsApp</span>${m.whatsapp ? raw(`<a href="https://wa.me/${esc(m.whatsapp.replace('+', ''))}" target="_blank" rel="noopener">${esc(m.whatsapp)}</a>`) : '—'}</div>
        <div><span>Registration date</span>${fdate(m.registered_at)}</div><div><span>Favorite sport</span>${m.favorite_sport || '—'}</div>
        <div><span>First session</span>${fdate(m.first_date)}</div><div><span>Last session</span>${fdate(m.last_date)}</div><div style="grid-column:1/-1"><span>Notes</span>${m.notes || '—'}</div></div></div>
        <div class="card"><div class="card-title"><h2>Photography add-on history</h2></div>${r.photography_history.length ? html`<div class="list">${r.photography_history.map(p => html`<div class="list-item"><div class="grow"><div class="t">${p.session}</div><div class="muted xs">${fdate(p.date)}</div></div>${p.price != null ? html`<b>${rp(p.price)}</b>` : ''}</div>`)}</div>` : html`<div class="muted">No photography add-ons yet.</div>`}</div></div>
      ${fin ? html`<div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Saldo member</h2><div class="actions">${cr.balance > 0 ? html`<button class="btn sm" id="cr-forfeit">Hanguskan</button><button class="btn sm" id="cr-refund">Refund tunai</button>` : ''}</div></div><div style="font-size:26px;font-weight:700;margin-bottom:8px">${rp(cr.balance)}</div>${cr.entries.length ? html`<div class="list">${cr.entries.map(x => html`<div class="list-item"><div class="grow"><div class="t">${x.reason || x.kind}</div><div class="muted xs">${fdate(x.txn_date)}${x.session_name ? ' · ' + x.session_name : ''}</div></div><b class="${x.signed > 0 ? 'pos' : 'neg'}">${x.signed > 0 ? '+' : '-'}${rp(Math.abs(x.signed))}</b></div>`)}</div>` : html`<div class="muted">Belum ada riwayat saldo.</div>`}</div>` : ''}
      <div class="card"><div class="card-title"><h2>Participation history</h2></div>${table([{ label: 'Date', render: h => fdate(h.event_date) }, { label: 'Session', render: h => html`<a href="#/sessions/${h.session_id}">${h.name}</a>` }, { label: 'Sport', render: h => sportChip(h.sport, h.sport_color) }, { label: 'Payment', render: h => badge(h.payment_status) }, { label: 'Attendance', render: h => badge(h.attendance) }, ...(fin ? [{ label: 'Paid', num: true, render: h => rp(h.amount_paid - (h.payment_status === 'Refunded' && !h.refund_amount ? h.amount_paid : h.refund_amount)) }] : [])], r.history, { empty: emptyState('No sessions yet', 'This member has not joined a session.') })}</div>`);
  };
  await load();
  on(v, 'click', '#edit', () => openMemberForm(cur, load));
  on(v, 'click', '#ly-png', () => LC.shareImage(cur, curLy, 'both').catch(e => toast(e.message, 'err')));
  on(v, 'click', '#ly-cover', () => LC.shareImage(cur, curLy, 'front').catch(e => toast(e.message, 'err')));
  on(v, 'click', '#ly-print', () => LC.printCards([{ name: cur.nickname, code: cur.member_code, info: curLy }]).catch(e => toast(e.message, 'err')));
  on(v, 'click', '#cr-forfeit', () => openCreditAmount(id, 'forfeit', curCr.balance, load));
  on(v, 'click', '#cr-refund', () => openCreditAmount(id, 'refund', curCr.balance, load));
}), 'members');

// =================================================================== MEMBER ACTIVITY / ROYALTY
const actState = { preset: 'this_year', start: presetRange('this_year')[0], end: presetRange('this_year')[1], tab: 'most_active' };
route('#/activity', () => guard(async () => {
  const v = view(), fin = can('finance');
  const draw = async () => {
    const r = await GET('/api/members/activity', { start: actState.start, end: actState.end });
    const tabs = [['most_active', 'Most Active'], ['most_frequent', 'Most Frequent'], ...(fin ? [['top_spenders', 'Top Spending']] : []), ['popular_sports', 'Popular Sports'], ['all', 'All Members']];
    const memTable = rows => table([{ label: '#', render: (m, i) => i + 1 }, { label: 'Member ID', key: 'member_code' }, { label: 'Nickname', render: m => html`<a href="#/members/${m.id}" class="strong">${m.nickname}</a>` },
      { label: 'Sessions', num: true, key: 'joined' }, { label: 'Sports', num: true, key: 'sports' }, ...(fin ? [{ label: 'Spending', num: true, render: m => rp(m.spend) }] : []), { label: 'Last played', render: m => fdate(m.last_date) }, { label: 'Frequency', render: m => html`${badge(m.frequency, m.frequency === 'Very frequent' ? 'green' : m.frequency === 'Regular' ? '' : 'grey')} <span class="muted xs">${m.per_month}/mo</span>` }], rows, { empty: emptyState('No participation yet', 'Activity appears once members join sessions in this period.') });
    mount(v, html`${pageHead('Member Activity / Royalty', 'Internal tracking of how often members play. No rewards or liabilities are generated automatically.')}
      ${rangeBar(actState)}
      <div class="tabs">${tabs.map(([k, l]) => html`<button class="tab ${actState.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`)}</div>
      ${actState.tab === 'popular_sports' ? html`<div class="card">${r.popular_sports.length ? hbars(r.popular_sports.map(s => ({ label: s.name, value: s.participations, color: s.color })), { fmt: n => n + ' participations' }) : html`<div class="muted">No data.</div>`}</div>` : memTable(r[actState.tab] || [])}`);
  };
  await draw();
  bindRange(v, actState, () => guard(draw));
  on(v, 'click', '[data-tab]', (e, t) => { actState.tab = t.dataset.tab; draw(); });
}), 'activity');


function openExportModal(st) {
  const presets = [['this_month', 'This Month'], ['last_month', 'Last Month'], ['this_quarter', 'This Quarter'], ['this_year', 'This Year'], ['custom', 'Custom']];
  const types = [['business_summary', 'Business Summary Report'], ['financial', 'Financial Report'], ['session_performance', 'Session Performance Report'], ['member_activity', 'Member Activity Report'], ['complete', 'Complete Business Report']];
  const opts = (o, cur) => raw(o.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join(''));
  const cur = presets.some(p => p[0] === st.preset) ? st.preset : 'custom';
  const m = openModal({ title: 'Export Report', body: html`<div class="form">
    <div class="field"><label>Report Period</label><select class="inp" id="ex-p">${opts(presets, cur)}</select></div>
    <div class="form-grid"><div class="field"><label>From</label><input class="inp" type="date" id="ex-s" value="${st.start}"></div><div class="field"><label>To</label><input class="inp" type="date" id="ex-e" value="${st.end}"></div></div>
    <div class="field"><label>Report Type</label><select class="inp" id="ex-t">${opts(types, 'business_summary')}</select></div>
    <div class="field"><label>Format</label><select class="inp" id="ex-f">${opts([['xlsx', 'Excel (.xlsx)'], ['pdf', 'PDF'], ['csv', 'CSV']], 'xlsx')}</select></div>
  </div>`, footer: html`<button class="btn" data-close>Cancel</button><button class="btn primary" id="ex-go">Export</button>` });
  const q = id => m.el.querySelector('#' + id);
  q('ex-p').addEventListener('change', () => { const r = presetRange(q('ex-p').value); if (r) { q('ex-s').value = r[0]; q('ex-e').value = r[1]; } });
  q('ex-go').addEventListener('click', () => {
    if (!q('ex-s').value || !q('ex-e').value || q('ex-s').value > q('ex-e').value) { toast('Choose a valid period', 'err'); return; }
    download('/api/export?' + new URLSearchParams({ type: q('ex-t').value, format: q('ex-f').value, start: q('ex-s').value, end: q('ex-e').value }));
    toast('Export started');
    m.close();
  });
}


// =================================================================== SALDO MEMBER (dialogs)
function openCancelSession(session, parts, fin, onDone) {
  const paid = parts.filter(p => ['Paid', 'Partially Refunded'].includes(p.payment_status) && (p.retained || 0) > 0).length;
  const m = openModal({ title: 'Batalkan sesi?', size: 'sm', body: html`
    <div class="alert info" style="margin-bottom:12px">${icon('info', 18)}<span>${paid ? `${paid} peserta sudah membayar.` : 'Belum ada peserta yang membayar.'} Biaya venue tetap tercatat.</span></div>
    ${paid && fin ? html`<div class="field"><label>Uang peserta</label><select class="inp" id="cn-mode"><option value="credit">Jadikan saldo member (disarankan)</option><option value="refund">Refund tunai</option></select></div>` : ''}
    <div class="field"><label>Alasan (opsional)</label><input class="inp" id="cn-reason" maxlength="200"></div>`,
    footer: html`<button class="btn" data-close>Kembali</button><button class="btn solid-danger" data-ok>Batalkan sesi</button>` });
  on(m.el, 'click', '[data-ok]', async () => {
    try { const r = await api('POST', `/api/sessions/${session.id}/cancel`, { mode: ($('#cn-mode', m.el) || {}).value || 'credit', reason: $('#cn-reason', m.el).value }); m.close(); toast(r.participants ? `Sesi dibatalkan, ${r.participants} peserta ${r.mode === 'credit' ? 'dapat saldo' : 'di-refund'}` : 'Sesi dibatalkan'); onDone && onDone(); } catch (e) { toast(e.message, 'err'); }
  });
}
function openCreditModal(p, session, onDone) {
  const converted = (p.credit_amount || 0) > 0 || p.noshow_forfeit;
  const photoOk = !p.photo_waived && (session.photo_mode === 'included' || (session.photo_mode === 'excluded' && p.photo_selected));
  const btn = (k, label, sub, cls = '') => html`<button class="btn ${cls}" style="width:100%;text-align:left;margin-bottom:8px;display:block" data-act="${k}"><b>${label}</b><div class="muted xs">${sub}</div></button>`;
  const m = openModal({ title: `Saldo · ${p.nickname}`, size: 'sm', body: converted
    ? html`<div class="alert info" style="margin-bottom:12px">${icon('info', 18)}<span>${p.noshow_forfeit ? 'Pembayaran ini ditandai hangus (tidak hadir).' : `Sudah dijadikan saldo ${rp(p.credit_amount)}.`}</span></div>${btn('undo', 'Batalkan konversi', 'Kembalikan ke pembayaran semula (hanya kalau saldonya belum dipakai)')}`
    : html`<div class="muted small" style="margin-bottom:10px">Pilih apa yang terjadi pada pembayaran peserta ini.</div>
      ${btn('noshow-credit', 'Tidak hadir → jadikan saldo', `Seluruh pembayaran ${rp(p.retained)} jadi saldo member, bisa dipotong di sesi lain`, 'primary')}
      ${photoOk ? btn('photo', 'Foto tidak dipakai → jadikan saldo', 'Nilai foto saja jadi saldo; peserta tetap dihitung hadir') : ''}
      ${btn('noshow-forfeit', 'Tidak hadir → hangus', 'Uang tetap jadi pendapatan sesi ini')}` });
  on(m.el, 'click', '[data-act]', async (e, t) => {
    const a = t.dataset.act;
    try {
      if (a === 'undo') await api('POST', `/api/participants/${p.id}/credit/undo`, {});
      else if (a === 'photo') await api('POST', `/api/participants/${p.id}/credit`, { kind: 'photo' });
      else await api('POST', `/api/participants/${p.id}/credit`, { kind: 'noshow', action: a === 'noshow-credit' ? 'credit' : 'forfeit' });
      m.close(); toast('Tersimpan'); onDone && onDone();
    } catch (er) { toast(er.message, 'err'); }
  });
}
function openCreditAmount(mid, kind, balance, onDone) {
  const T_ = { forfeit: 'Hanguskan saldo', refund: 'Refund saldo tunai' }[kind];
  formModal({ title: T_, size: 'sm', fields: [{ name: 'amount', label: 'Jumlah (Rp)', type: 'money', required: true }, { name: 'txn_date', label: 'Tanggal', type: 'date', required: true }, { name: 'reason', label: 'Alasan', full: true, max: 200 }], values: { amount: balance, txn_date: todayISO() },
    top: html`<div class="alert info" style="margin-bottom:12px">${icon('info', 18)}<span>${kind === 'forfeit' ? 'Saldo yang hangus menjadi pendapatan NPD (non-tunai).' : 'Uang tunai keluar dari NPD Petty Cash dan dicatat di Transactions.'} Saldo tersedia ${rp(balance)}.</span></div>`,
    onSubmit: async (d, ctx) => { await api('POST', `/api/members/${mid}/credit/${kind}`, d); ctx.modal.close(); toast('Tersimpan'); onDone && onDone(); } });
}

// ---- loyalty card printing (blank cards or selected members)
async function openLoyaltyPrint() {
  const r = await GET('/api/loyalty'), list = r.members;
  const m = openModal({ title: 'Cetak kartu loyalty', size: 'sm', body: html`<div class="field"><label>Kartu kosong (nama ditulis tangan)</label><input id="ly-blank" type="number" min="0" max="200" value="10"><div class="hint">Format 100 × 70 mm, 2 sisi, bleed 3 mm + crop marks.</div></div>
    <div class="field"><label>Atau kartu bernama (dengan stempel sesuai progres)</label><div class="ly-pick">${list.map(x => html`<label class="check"><input type="checkbox" data-m="${x.id}"> ${x.nickname} <span class="muted xs">${x.member_code} · ${x.cycle_count}/20</span></label>`)}</div></div>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn primary" id="ly-go">Buat PDF</button>` });
  $('#ly-go', m.el).addEventListener('click', async () => {
    try {
      const cards = [], n = Math.max(0, Math.min(200, +$('#ly-blank', m.el).value || 0)); for (let i = 0; i < n; i++) cards.push({});
      for (const c of $$('[data-m]:checked', m.el)) { const id = +c.dataset.m, mem = (await GET(`/api/members/${id}/profile`)).member; cards.push({ name: mem.nickname, code: mem.member_code }); }
      if (!cards.length) throw new Error('Pilih jumlah kartu kosong atau member.');
      m.close(); await LC.printCards(cards);
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ---- cheering when a member reaches 5 / 10 / 15 / 20 (shown once per milestone, per device)
function lyCheer(m, ly) {
  if (!ly.count || ly.count % 5 || !document.querySelector('#ly-card')) return;
  const key = `npd_cheer_${m.id}_${ly.count}`; try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
  const r = ly.rewards[ly.rewards.length - 1]; if (!r) return;
  const cols = ['#BF0100', '#004ECC', '#FFC23D', '#C8E000', '#6FB1FF', '#fff'], bits = Array.from({ length: 42 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${cols[i % cols.length]};animation-delay:${(i % 10) * .09}s;animation-duration:${1.8 + (i % 5) * .35}s"></i>`).join('');
  openModal({ title: 'Selamat! 🎉', size: 'sm', body: html`<div class="cheer"><div class="confetti">${raw(bits)}</div><div class="cheer-n">${ly.count}x</div><div class="cheer-t">${m.nickname} sudah ${ly.count} sesi!</div><div class="cheer-r">${r.label}</div><div class="muted small">Reward ini dipakai di sesi berikutnya (tanpa kedaluwarsa).</div></div>`, footer: html`<button class="btn primary" data-close>Yeay!</button>` });
}
