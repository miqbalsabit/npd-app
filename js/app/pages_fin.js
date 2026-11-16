'use strict';
/* Financial pages, profit sharing, reports, settings, install. */

const rangeState = (preset = 'this_month') => ({ preset, start: presetRange(preset)[0], end: presetRange(preset)[1] });
const FS = { fin: rangeState(), cash: rangeState(), rev: rangeState('this_year'), rep: rangeState('this_year') };

// =================================================================== FINANCIAL OVERVIEW
route('#/finance', () => guard(async () => {
  const v = view(), st = FS.fin;
  const draw = async () => {
    const [d, cf, rep] = await Promise.all([GET('/api/dashboard', { start: st.start, end: st.end }), GET('/api/cashflow', { start: st.start, end: st.end }), GET('/api/reports/overall', { start: st.start, end: st.end })]);
    const k = d.kpis, rows = rep.report.rows, sections = [...new Set(rows.map(r => r.section))];
    mount(v, html`${pageHead('Financial Overview', 'Business revenue is kept separate from cash collected – photographer money is a payable, not NPD income.', html`<button class="btn" id="x-exp">${icon('plus', 16)} Operational Expense</button><a class="btn" href="#/revenue">${icon('plus', 16)} Revenue</a>`)}
      ${rangeBar(st)}
      <div class="grid g4" style="margin-bottom:14px">${kpi('Total Revenue', rp(k.revenue), 'Earned by NPD organizers', { accent: true, icon: 'trend' })}${kpi('Total Operational Expenses', rp(k.expenses), 'Session + general', { icon: 'receipt' })}${kpi('Net Business Profit', rp(k.profit), 'Revenue − expenses', { icon: 'coin', cls: profitCls(k.profit) })}${kpi('Total Cash Balance', rp(cf.closing), `as of ${fdate(st.end)}`, { icon: 'wallet' })}</div>
      <div class="grid g-main" style="margin-bottom:14px"><div class="card"><div class="card-title"><h2>Revenue vs Expenses</h2></div>${barLineChart(d.series)}</div>
        <div class="card"><div class="card-title"><h2>Fund balances</h2><a class="small" href="#/profit/funds">Manage</a></div>
          ${cf.funds.map(f => html`<div class="row-sum ${f.kind === 'personal' ? 'sub' : ''}"><span>${f.name}${f.kind === 'personal' && f.closing < 0 ? ' (owed to them)' : ''}</span><b class="${f.closing < 0 ? 'neg' : ''}">${rp(f.closing)}</b></div>`)}
          <div class="row-sum total"><span>Total cash balance</span><b>${rp(cf.closing)}</b></div>
          <div class="row-sum sub"><span>Photographer payable</span><span>-${rp(cf.photographer_payable)}</span></div><div class="row-sum sub"><span>Organizer payouts owed</span><span>-${rp(cf.organizer_payable)}</span></div>${cf.personal_payable ? html`<div class="row-sum sub"><span>Owed to personal funders</span><span>-${rp(cf.personal_payable)}</span></div>` : ''}</div></div>
      <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Operational expenses by category</h2></div>${d.expense_breakdown.length ? hbars(d.expense_breakdown.map(x => ({ label: x.category, value: x.amount }))) : html`<div class="muted">No expenses in this period.</div>`}</div>
      <div class="card"><div class="card-title"><h2>Profit & loss walk</h2></div>${sections.map(sec => html`<h3 class="small muted" style="margin:12px 0 2px;text-transform:uppercase">${sec}</h3>${rows.filter(r => r.section === sec).map(r => html`<div class="row-sum ${/^Total|Net profit/.test(r.item) ? 'total' : ''}"><span>${r.item}</span><b>${rp(r.amount)}</b></div>`)}`)}</div>`);
  };
  await draw(); bindRange(v, st, () => guard(draw));
  on(v, 'click', '#x-exp', () => openExpenseForm(null, draw));
}), 'finance');

// =================================================================== TRANSACTIONS
const txState = { q: '', type: '', category: '', fund_id: '', start: '', end: '', page: 1 };
const TX_BADGE = { in: ['Cash in', 'green'], out: ['Cash out', 'red'], internal: ['Internal', 'grey'] };
route('#/transactions', () => guard(async () => {
  const v = view();
  mount(v, html`${pageHead('Transactions', 'Semua pergerakan uang. Edits and deletions are written to the audit trail.', html`<button class="btn" id="add-exp">${icon('plus', 16)} Expense</button><button class="btn" id="add-rev">${icon('plus', 16)} Revenue</button><button class="btn" id="add-pay">${icon('camera', 16)} Photographer payment</button>`)}
    <div class="toolbar"><div class="searchbox"><span>${icon('search', 18)}</span><input class="inp" id="q" placeholder="Search description, category or ID" value="${txState.q}"></div>
      <select class="inp" id="f-type"><option value="">All types</option><option value="in">Cash in</option><option value="out">Cash out</option><option value="internal">Internal (fund transfers)</option></select><select class="inp" id="f-cat"></select>
      <select class="inp" id="f-fund"><option value="">All funds</option>${M().funds.map(f => html`<option value="${f.id}" ${f.id == txState.fund_id ? raw('selected') : ''}>${f.name}</option>`)}</select>
      <input class="inp" type="date" id="f-start" value="${txState.start}" aria-label="From"><input class="inp" type="date" id="f-end" value="${txState.end}" aria-label="To"></div><div id="sum"></div><div id="tx"></div>`);
  $('#f-type', v).value = txState.type;
  const load = async () => {
    const r = await GET('/api/transactions', { ...txState, size: 25 }); window._tx = r.transactions;
    $('#f-cat', v).innerHTML = '<option value="">All categories</option>' + r.categories.map(c => `<option ${c === txState.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
    mount($('#sum', v), html`<div class="sumlist"><div class="sumrow in"><span>Cash in <small>${r.total} transaksi</small></span><b>+${rp(r.cash_in)}</b></div><div class="sumrow out"><span>Cash out <small>dari NPD Petty Cash</small></span><b>-${rp(r.cash_out)}</b></div><div class="sumrow net"><span>Net</span><b>${rp(r.cash_in - r.cash_out)}</b></div>${r.personal_funded > 0 ? html`<div class="sumrow pers"><span>Ditalangi pribadi <small>belum tentu diganti</small></span><b>${rp(r.personal_funded)}</b></div>` : ''}</div>`);
    const row = t => html`<div class="txrow ${t.direction}" data-view="${t.ref}"><div class="txmain"><div class="txd">${t.description}</div><div class="txm">${fdate(t.date)} · ${t.category}${t.direction === 'internal' ? ' · ' + (t.fund || '—') + ' → ' + (t.fund_to || '—') : (t.fund ? ' · ' + t.fund : '')}${t.auto ? ' · otomatis' : ''}</div></div><div class="txa">${t.direction === 'in' ? '+' : t.direction === 'out' ? '-' : ''}${rp(t.amount)}</div>${t.editable ? html`<div class="txact"><button class="icon-btn sm" data-edit="${t.entity}:${t.entity_id}" aria-label="Edit">${icon('edit', 16)}</button><button class="icon-btn sm red" data-del="${t.entity}:${t.entity_id}" aria-label="Delete">${icon('trash', 16)}</button></div>` : ''}</div>`;
    mount($('#tx', v), html`<div class="txlist">${r.transactions.length ? r.transactions.map(row) : emptyState('No transactions', 'Nothing matches these filters.')}</div>${pager(r.total, txState.page, 25)}`);
  };
  await load(); const reload = () => { txState.page = 1; load(); };
  $('#q', v).addEventListener('input', debounce(e => { txState.q = e.target.value; reload(); }));
  [['f-type', 'type'], ['f-cat', 'category'], ['f-fund', 'fund_id'], ['f-start', 'start'], ['f-end', 'end']].forEach(([id, k]) => $('#' + id, v).addEventListener('change', e => { txState[k] = e.target.value; reload(); }));
  on(v, 'click', '[data-page]', (e, t) => { txState.page = +t.dataset.page; load(); });
  on(v, 'click', '#add-exp', () => openExpenseForm(null, load)); on(v, 'click', '#add-rev', () => openRevenueForm(null, load)); on(v, 'click', '#add-pay', () => openPhotographerPayment({}, load));
  on(v, 'click', '[data-view]', (e, t) => {
    if (e.target.closest('[data-edit],[data-del]')) return;
    const x = window._tx.find(z => z.ref === t.dataset.view); if (!x) return;
    const row = (l, val) => val ? html`<div class="row-sum"><span>${l}</span><b>${val}</b></div>` : '';
    openModal({ title: 'Transaction details', body: html`${row('ID', x.code)}${row('Date', fdate(x.date))}${row('Type', x.type)}${row('Category', x.category)}${row('Description', x.description)}${row('Amount', rp(x.amount))}${row(x.direction === 'internal' ? 'From fund' : 'Source of fund', x.fund)}${row('To fund', x.fund_to)}${row('Session', x.session)}${row('Payment method', x.payment_method)}${row('Notes', x.notes)}${row('Recorded by', x.created_by)}${x.direction === 'out' && !x.npd_cash ? html`<div class="alert info" style="margin-top:10px">${icon('info', 18)}<span>Paid from a personal fund – it counts as an expense but did not reduce NPD cash.</span></div>` : ''}${x.direction === 'internal' ? html`<div class="alert info" style="margin-top:10px">${icon('info', 18)}<span>Internal movement – not revenue and not an expense.</span></div>` : ''}${/^https?:\/\//i.test(x.receipt || '') ? raw(`<p><a href="${esc(x.receipt)}" target="_blank" rel="noopener noreferrer">View receipt</a></p>`) : ''}`, footer: html`<button class="btn" data-close>Close</button>` });
  });
  on(v, 'click', '[data-edit]', async (e, t) => { const [en, id] = t.dataset.edit.split(':'); try {
    if (en === 'expense') openExpenseForm((await GET('/api/expenses/' + id)).expense, load);
    else if (en === 'revenue') openRevenueForm((await GET('/api/revenue/' + id)).record, load);
    else if (en === 'fund_transaction') { const ft = (await GET('/api/funds')).transactions.find(z => z.id == id); openFundForm(ft.kind, load, ft); }
    else openPhotographerPayment((await GET('/api/photographer-payments/' + id)).payment, load); } catch (er) { toast(er.message, 'err'); } });
  on(v, 'click', '[data-del]', (e, t) => { const [en, id] = t.dataset.del.split(':'); const url = { expense: '/api/expenses/', revenue: '/api/revenue/', photographer_payment: '/api/photographer-payments/', fund_transaction: '/api/fund-transactions/' }[en] + id; runDelete({ what: en.replace('_', ' '), url, onDone: load }); });
}), 'transactions');

// =================================================================== REVENUE
route('#/revenue', () => guard(async () => {
  const v = view(), st = FS.rev;
  const draw = async () => {
    const r = await GET('/api/revenue', { start: st.start, end: st.end }), s = r.summary;
    mount(v, html`${pageHead('Revenue', 'Session revenue is calculated automatically from actual payments. Add other income manually.', html`<button class="btn primary" id="add">${icon('plus', 18)} Other revenue</button>`)}${rangeBar(st)}
      <div class="grid g4" style="margin-bottom:14px">${kpi('Session fee revenue', rp(s.session_fee_revenue), 'Excludes photography', { icon: 'ball' })}${kpi('NPD photography share', rp(s.npd_photo_share), `of ${rp(s.photo_revenue)} photography revenue`, { icon: 'camera' })}${kpi('Other revenue', rp(s.other_revenue), 'Recorded manually', { icon: 'coin' })}${kpi('Total business revenue', rp(s.organizer_revenue), `Cash collected ${rp(s.net_collected)}`, { accent: true, icon: 'trend' })}</div>
      <div class="alert info" style="margin-bottom:14px">${icon('info', 18)}<span>Photographer share of <b>${rp(s.photographer_share)}</b> is collected cash but belongs to the photographer (payable) – it is not NPD revenue. Waiting-for-payment amounts (<b>${rp(s.receivable)}</b>) are receivables, not revenue.</span></div>
      <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Automatic – from sessions</h2></div>${table([{ label: 'Date', render: a => fdate(a.date) }, { label: 'Session', render: a => html`<a href="#/sessions/${a.session_id}">${a.session}</a>` }, { label: 'Session fee', num: true, render: a => rp(a.session_fee_revenue) }, { label: 'NPD photo share', num: true, render: a => rp(a.npd_photo_share) }, { label: 'Photographer (payable)', num: true, render: a => rp(a.photographer_share) }, { label: 'Business revenue', num: true, render: a => html`<b>${rp(a.business_revenue)}</b>` }], r.auto, { empty: emptyState('No session revenue', 'Record paid participants in a session.') })}</div>
      <div class="card"><div class="card-title"><h2>Manual – other revenue</h2></div>${table([{ label: 'ID', key: 'code' }, { label: 'Date', render: m => fdate(m.txn_date) }, { label: 'Category', key: 'category' }, { label: 'Description', render: m => m.description }, { label: 'Amount', num: true, render: m => rp(m.amount) }, { label: '', act: true, render: m => html`<button class="icon-btn sm" data-edit="${m.id}" aria-label="Edit">${icon('edit', 18)}</button><button class="icon-btn sm red" data-del="${m.id}" aria-label="Delete">${icon('trash', 18)}</button>` }], r.manual, { empty: emptyState('No manual revenue', 'Sponsorships, merchandise and other income appear here.') })}</div>`);
    window._rev = r.manual;
  };
  await draw(); bindRange(v, st, () => guard(draw));
  on(v, 'click', '#add', () => openRevenueForm(null, draw)); on(v, 'click', '[data-edit]', (e, t) => openRevenueForm(window._rev.find(x => x.id == t.dataset.edit), draw)); on(v, 'click', '[data-del]', (e, t) => runDelete({ what: 'revenue record', url: '/api/revenue/' + t.dataset.del, onDone: draw }));
}), 'revenue');

// =================================================================== OPERATIONAL EXPENSES
const expState = { q: '', category: '', classification: '', fund_id: '', start: '', end: '', sort: '', page: 1 };
route('#/expenses', () => guard(async () => {
  const v = view();
  mount(v, html`${pageHead('Operational Expenses', 'Every expense is paid from a Source of Fund, which reduces that fund. Venue rental for sessions is taken from each session automatically.', html`<button class="btn primary" id="add">${icon('plus', 18)} Add Operational Expense</button>`)}
    <div class="toolbar"><div class="searchbox"><span>${icon('search', 18)}</span><input class="inp" id="q" placeholder="Search description or ID" value="${expState.q}"></div>
      <select class="inp" id="f-cat"><option value="">All categories</option>${ENUM().expense_categories.map(c => html`<option ${c === expState.category ? raw('selected') : ''}>${c}</option>`)}</select>
      <select class="inp" id="f-cls"><option value="">Session + General</option><option value="session">Session expenses</option><option value="general">General expenses</option></select>
      <select class="inp" id="f-fund"><option value="">All funds</option>${M().funds.map(f => html`<option value="${f.id}" ${f.id == expState.fund_id ? raw('selected') : ''}>${f.name}</option>`)}</select>
      <input class="inp" type="date" id="f-start" aria-label="From" value="${expState.start}"><input class="inp" type="date" id="f-end" aria-label="To" value="${expState.end}">
      <select class="inp" id="f-sort"><option value="">Newest first</option><option value="date_asc">Oldest first</option><option value="amount">Highest amount</option></select></div><div id="elist"></div>`);
  $('#f-cls', v).value = expState.classification; $('#f-sort', v).value = expState.sort;
  const load = async () => {
    const r = await GET('/api/expenses', { ...expState, size: 25 }); window._exp = r.expenses;
    mount($('#elist', v), html`<div class="muted small" style="margin-bottom:8px">Total of matching expenses: <b>${rp(r.sum)}</b>${r.by_fund.length ? ' · ' + r.by_fund.map(f => `${f.name} ${rp(f.t)}`).join(' · ') : ''}</div>${table([{ label: 'ID', key: 'code' }, { label: 'Date', render: e => fdate(e.txn_date) }, { label: 'Category', key: 'category' },
      { label: 'Description', render: e => html`<div class="strong">${e.description}${e.is_auto ? html` ${badge('Auto dari sesi', 'blue')}` : ''}</div><div class="muted xs">${e.classification}${e.session_name ? ' · ' + e.session_name : ''}</div>` },
      { label: 'Source of Fund', render: e => html`${e.source_fund}${e.fund_kind === 'personal' ? html`<div class="xs">${e.reimbursed >= e.amount ? badge('Reimbursed', 'green') : e.reimbursed > 0 ? badge('Part reimbursed', 'amber') : badge('Not reimbursed', 'amber')}</div>` : ''}` },
      { label: 'Amount', num: true, render: e => html`<b>${rp(e.amount)}</b>` }, { label: 'Receipt', render: e => /^https?:\/\//i.test(e.receipt || '') ? raw(`<a href="${esc(e.receipt)}" target="_blank" rel="noopener noreferrer">${icon('file', 16).s} View</a>`) : '—' },
      { label: '', act: true, render: e => e.is_auto ? html`<span class="muted xs">Ubah via sesi</span>` : html`<button class="icon-btn sm" data-edit="${e.id}" aria-label="Edit">${icon('edit', 18)}</button><button class="icon-btn sm red" data-del="${e.id}" aria-label="Delete">${icon('trash', 18)}</button>` }], r.expenses,
      { empty: emptyState('No operational expenses', 'Record your first expense.', html`<button class="btn primary sm" id="add2">Add operational expense</button>`) })}${pager(r.total, expState.page, 25)}`);
  };
  await load(); const reload = () => { expState.page = 1; load(); };
  $('#q', v).addEventListener('input', debounce(e => { expState.q = e.target.value; reload(); }));
  [['f-cat', 'category'], ['f-cls', 'classification'], ['f-fund', 'fund_id'], ['f-start', 'start'], ['f-end', 'end'], ['f-sort', 'sort']].forEach(([id, k]) => $('#' + id, v).addEventListener('change', e => { expState[k] = e.target.value; reload(); }));
  on(v, 'click', '[data-page]', (e, t) => { expState.page = +t.dataset.page; load(); });
  on(v, 'click', '#add,#add2', () => openExpenseForm(null, load)); on(v, 'click', '[data-edit]', (e, t) => openExpenseForm(window._exp.find(x => x.id == t.dataset.edit), load));
  on(v, 'click', '[data-del]', (e, t) => runDelete({ what: 'expense', url: '/api/expenses/' + t.dataset.del, onDone: load }));
  if (hashQuery().add) { history.replaceState(null, '', '#/expenses'); openExpenseForm(null, load); }
}), 'expenses');

// =================================================================== CASH FLOW
route('#/cashflow', () => guard(async () => {
  const v = view(), st = FS.cash;
  const draw = async () => {
    const r = await GET('/api/cashflow', { start: st.start, end: st.end });
    mount(v, html`${pageHead('Cash Flow', 'Actual money in and out of NPD funds. Closing = Opening + Cash in − Cash out. Transfers between funds net to zero.')}${rangeBar(st)}
      <div class="grid g4" style="margin-bottom:14px">${kpi('Opening balance', rp(r.opening), fdate(st.start))}${kpi('Total cash in', rp(r.cash_in), 'Payments collected + other income + funding', { cls: 'pos' })}${kpi('Total cash out', rp(r.cash_out), 'Expenses, refunds, payouts', { cls: 'neg' })}${kpi('Closing balance', rp(r.closing), fdate(st.end), { accent: true })}</div>
      <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>By fund</h2></div>${table([{ label: 'Fund', render: f => html`<b>${f.name}</b>` }, { label: 'Opening', num: true, render: f => rp(f.opening) }, { label: 'In', num: true, render: f => rp(f.inflow) }, { label: 'Out', num: true, render: f => rp(f.outflow) }, { label: 'Closing', num: true, render: f => html`<b class="${f.closing < 0 ? 'neg' : ''}">${rp(f.closing)}</b>` }], r.funds)}
        <div class="muted small" style="margin-top:8px">Negative personal balance = NPD owes that person. Personal-funded expenses reduce profit but not NPD cash: ${rp(r.personal_funded_expenses)} in this period.</div></div>
      <h2 style="margin:6px 0 10px">Balances</h2><div class="grid g4" style="margin-bottom:14px">${kpi('Free business cash', rp(r.organizer_business_cash), 'After all payables', { icon: 'wallet', cls: profitCls(r.organizer_business_cash) })}${kpi('Photographer payable', rp(r.photographer_payable), 'Owed to photographers', { icon: 'camera' })}${kpi('Organizer payable', rp(r.organizer_payable), 'Allocated, not yet paid', { icon: 'users' })}${kpi('Owed to personal funders', rp(r.personal_payable), 'Unreimbursed', { icon: 'user' })}</div>
      <div class="grid g2" style="margin-bottom:14px"><div class="card"><div class="card-title"><h2>By category</h2></div>${r.categories.length ? r.categories.map(c => html`<div class="row-sum"><span>${badge(c.direction === 'in' ? 'In' : 'Out', c.direction === 'in' ? 'green' : 'red')} ${c.category}</span><b class="${c.direction === 'in' ? 'pos' : 'neg'}">${rp(c.amount)}</b></div>`) : html`<div class="muted">No movements.</div>`}</div>
        <div class="card"><div class="card-title"><h2>Monthly</h2></div>${table([{ label: 'Month', render: m => fmonth(m.month) }, { label: 'In', num: true, render: m => rp(m.in) }, { label: 'Out', num: true, render: m => rp(m.out) }, { label: 'Net', num: true, render: m => html`<b class="${profitCls(m.in - m.out)}">${rp(m.in - m.out)}</b>` }], r.monthly)}</div></div>
      ${r.fund_movements && r.fund_movements.length ? html`<div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Fund movements</h2><span class="muted small">Not revenue or expense</span></div>${table([{ label: 'Date', render: m => fdate(m.date) }, { label: 'Type', render: m => m.type || m.category }, { label: 'Description', key: 'description' }, { label: 'Amount', num: true, render: m => rp(m.amount) }], r.fund_movements)}</div>` : ''}
      <div class="card"><div class="card-title"><h2>Movements</h2><a class="btn sm" href="/api/reports/cashflow/export?format=xlsx&start=${st.start}&end=${st.end}">${icon('download', 16)} Excel</a></div>${table([{ label: 'Date', render: m => fdate(m.date) }, { label: 'Category', key: 'category' }, { label: 'Description', key: 'description' }, { label: 'Fund', render: m => m.fund || '—' }, { label: 'In', num: true, render: m => m.direction === 'in' ? rp(m.amount) : '' }, { label: 'Out', num: true, render: m => m.direction === 'out' ? rp(m.amount) : '' }], r.movements)}</div>`);
  };
  await draw(); bindRange(v, st, () => guard(draw));
}), 'cashflow');

// =================================================================== PROFIT SHARING – ORGANIZERS
const psForm = { start: presetRange('last_month')[0], end: presetRange('last_month')[1], label: '', petty_pct: '' };
route('#/profit/organizers', () => guard(async () => {
  const v = view();
  let preview = null;
  const draw = async () => {
    const r = await GET('/api/profit-sharing');
    if (psForm.petty_pct === '') psForm.petty_pct = r.default_petty_pct;
    const org = r.active_organizers;
    mount(v, html`${pageHead('Organizer Profit Sharing', 'NPD Petty Cash is set aside from distributable profit first; the remainder is shared by the organizer percentages. Photographer money is never included.')}
      <div class="grid g3" style="margin-bottom:14px">${r.organizers.map(o => kpi(o.name, rp(o.outstanding), `Allocated ${rp(o.allocated)} · paid ${rp(o.paid)}`, { icon: 'user' }))}${kpi('Masuk ke NPD Petty Cash', rp(r.totals.petty), 'Dari semua alokasi terkonfirmasi', { icon: 'shield' })}</div>
      <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Calculate profit allocation</h2><span class="muted small">${org.map(o => `${o.name} ${pctf(o.share_pct)}`).join(' · ')}</span></div>
        <div class="form-grid"><div class="field"><label>Period from</label><input class="inp" type="date" id="p-start" value="${psForm.start}"></div><div class="field"><label>Period to</label><input class="inp" type="date" id="p-end" value="${psForm.end}"></div>
          <div class="field"><label>Label (optional)</label><input class="inp" id="p-label" maxlength="100" value="${psForm.label}" placeholder="e.g. October 2026"></div><div></div>
          <div class="field"><label>NPD Petty Cash %</label><input class="inp" type="number" step="0.01" min="0" max="100" id="p-pet" value="${psForm.petty_pct}"></div></div>
        <div class="actions" style="margin-top:12px"><button class="btn" id="p-prev">Preview</button><button class="btn primary" id="p-save" ${preview ? '' : raw('disabled')}>Save as pending record</button></div><div id="pv" style="margin-top:14px"></div></div>
      <h2 style="margin:6px 0 10px">History</h2>
      ${r.records.length ? r.records.map(rec => html`<div class="card" style="margin-bottom:12px"><div class="card-title"><div><h3>${rec.label} ${demoTag(rec)}</h3><div class="muted small">${rec.code} · ${fdate(rec.period_start)} – ${fdate(rec.period_end)}${rec.allocation_date ? ' · allocated ' + fdate(rec.allocation_date) : ''}</div></div>${badge(rec.status === 'Calculated' ? 'Confirmed' : rec.status)}</div>
        <div class="grid g4" style="margin-bottom:10px"><div><span class="muted xs strong">DISTRIBUTABLE PROFIT</span><div class="strong">${rp(rec.eligible_profit)}</div></div><div><span class="muted xs strong">NPD PETTY CASH (${pctf((rec.saving_pct || 0) + (rec.petty_pct || 0))})</span><div class="strong">${rp((rec.saving_amount || 0) + (rec.petty_amount || 0))}</div></div><div><span class="muted xs strong">REMAINING FOR ORGANIZERS</span><div class="strong">${rp(rec.remaining_profit)}</div></div></div>
        ${rec.lines.map(l => html`<div class="list-item"><div class="avatar">${l.organizer_name[0]}</div><div class="grow"><div class="t">${l.organizer_name} <span class="muted xs">${pctf(l.pct)}</span></div><div class="muted xs">${l.paid ? 'Paid ' + fdate(l.paid_date) : 'Not paid'}</div></div><b>${rp(l.amount)}</b>
          ${rec.status !== 'Pending' && l.amount > 0 ? (l.paid ? html`<button class="btn sm" data-unpay="${l.id}">Undo</button>` : html`<button class="btn sm primary" data-pay="${l.id}">Mark paid</button>`) : ''}</div>`)}
        <div class="actions" style="margin-top:10px">${rec.status === 'Pending' ? html`<button class="btn sm" data-recalc="${rec.id}">${icon('refresh', 15)} Recalculate</button><button class="btn sm primary" data-fin="${rec.id}">Confirm allocation</button>` : ''}<button class="btn sm danger" data-del="${rec.id}">${icon('trash', 15)} Delete</button></div></div>`) : html`<div class="card">${emptyState('No allocation records', 'Preview a period above, then save it.')}</div>`}`);
    if (preview) renderPreview();
  };
  const renderPreview = () => mount($('#pv', v), html`${preview.warning ? html`<div class="alert warn" style="margin-bottom:10px">${icon('alert', 18)}<span>${preview.warning}</span></div>` : ''}
    <div class="grid g4" style="margin-bottom:10px">${kpi('Business revenue', rp(preview.organizer_revenue))}${kpi('Expenses', rp(preview.total_expenses))}${kpi('Net profit', rp(preview.net_profit), '', { cls: profitCls(preview.net_profit) })}${kpi('Distributable profit', rp(preview.eligible_profit))}</div>
    ${table([{ label: 'Recipient', key: 'name' }, { label: 'Share', num: true, key: 'pct' }, { label: 'Amount', num: true, render: x => html`<b>${rp(x.amount)}</b>` }], [{ name: 'NPD Petty Cash', pct: pctf(preview.petty_pct), amount: preview.petty_amount }, ...preview.lines.map(l => ({ name: l.organizer_name, pct: pctf(l.pct) + ' of remaining', amount: l.amount }))])}
    <div class="muted small" style="margin-top:6px">Remaining for organizers: <b>${rp(preview.remaining_profit)}</b>. Review the amounts, then save – nothing is credited to a fund until you confirm.</div>`);
  const read = () => { psForm.start = $('#p-start', v).value; psForm.end = $('#p-end', v).value; psForm.label = $('#p-label', v).value; psForm.petty_pct = $('#p-pet', v).value; };
  await draw();
  on(v, 'input', '#p-start,#p-end,#p-sav,#p-pet', () => { preview = null; $('#p-save', v).disabled = true; $('#pv', v).innerHTML = ''; });
  on(v, 'click', '#p-prev', async () => { read(); try { preview = await GET('/api/profit-sharing/preview', { start: psForm.start, end: psForm.end, saving_pct: psForm.saving_pct, petty_pct: psForm.petty_pct }); $('#p-save', v).disabled = false; renderPreview(); } catch (e) { toast(e.message, 'err'); } });
  on(v, 'click', '#p-save', async () => { read(); try { await api('POST', '/api/profit-sharing', { start: psForm.start, end: psForm.end, label: psForm.label, saving_pct: psForm.saving_pct, petty_pct: psForm.petty_pct }, { idem: uuid() }); toast('Saved as pending'); preview = null; psForm.label = ''; draw(); } catch (e) { toast(e.message, 'err'); } });
  const act = async (fn, msg) => { try { await fn(); toast(msg); draw(); } catch (e) { toast(e.message, 'err'); } };
  on(v, 'click', '[data-recalc]', (e, t) => act(() => api('POST', `/api/profit-sharing/${t.dataset.recalc}/recalculate`, {}), 'Recalculated'));
  on(v, 'click', '[data-fin]', async (e, t) => { if (await confirmBox({ title: 'Confirm allocation?', message: 'The amounts are frozen as a historical snapshot, and the Operational Saving and Petty Cash shares are credited to their funds.', confirmText: 'Confirm allocation' })) act(() => api('POST', `/api/profit-sharing/${t.dataset.fin}/finalize`, {}), 'Allocation confirmed'); });
  on(v, 'click', '[data-pay]', (e, t) => act(() => api('POST', `/api/profit-sharing/lines/${t.dataset.pay}/pay`, { paid: 1, paid_date: todayISO() }), 'Marked as paid'));
  on(v, 'click', '[data-unpay]', (e, t) => act(() => api('POST', `/api/profit-sharing/lines/${t.dataset.unpay}/pay`, { paid: 0 }), 'Payment reverted'));
  on(v, 'click', '[data-del]', (e, t) => runDelete({ what: 'allocation record', url: '/api/profit-sharing/' + t.dataset.del, onDone: draw, message: 'Fund credits made by this record are removed too.' }));
}), 'profit');

// =================================================================== PROFIT SHARING – PHOTOGRAPHERS
const phState = { id: '', start: '', end: '' };
route('#/profit/photographers', () => guard(async () => {
  const v = view();
  const draw = async () => {
    const ov = await GET('/api/photographers/overview');
    if (!phState.id && ov.photographers.length) phState.id = ov.photographers[0].id;
    const st = phState.id ? await GET(`/api/photographers/${phState.id}/statement`, { start: phState.start, end: phState.end }) : null;
    window._pays = st ? st.payments : [];
    mount(v, html`${pageHead('Photographer Allocation', 'Photographer share is a payable – tracked here, never part of organizer profit.', html`<button class="btn primary" id="pay">${icon('plus', 18)} Record payment</button>`)}
      <div class="grid g4" style="margin-bottom:14px">${kpi('Photography revenue', rp(ov.totals.photo_revenue), 'Gross, all photographers', { icon: 'camera' })}${kpi('NPD share', rp(ov.totals.npd_share), 'Becomes NPD revenue', { icon: 'coin' })}${kpi('Photographer share', rp(ov.totals.photographer_share), 'Total owed', { icon: 'users' })}${kpi('Outstanding', rp(ov.totals.outstanding), `Paid so far ${rp(ov.totals.paid)}`, { accent: true, icon: 'wallet' })}</div>
      <div class="tabs">${ov.photographers.map(p => html`<button class="tab ${p.id == phState.id ? 'on' : ''}" data-ph="${p.id}">${p.name} ${badge(p.status, p.status === 'Paid' ? 'green' : 'amber')}</button>`)}</div>
      ${st ? html`<div class="toolbar"><span class="muted small">Statement period</span><input class="inp" type="date" id="s-from" value="${phState.start}" aria-label="From"><input class="inp" type="date" id="s-to" value="${phState.end}" aria-label="To"><a class="btn sm" href="/api/reports/photographer/export?format=xlsx&start=${phState.start}&end=${phState.end}">${icon('download', 16)} Excel</a></div>
        <div class="grid g4" style="margin-bottom:14px">${kpi('Photography revenue', rp(st.totals.photo_revenue))}${kpi('Photographer share', rp(st.totals.photographer_share))}${kpi('Paid', rp(st.totals.paid), '', { cls: 'pos' })}${kpi('Outstanding', rp(st.totals.outstanding), '', { cls: st.totals.outstanding > 0 ? 'neg' : '' })}</div>
        <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>${st.photographer.name} – sessions</h2></div>${table([{ label: 'Date', render: s => fdate(s.event_date) }, { label: 'Session', render: s => html`<a href="#/sessions/${s.id}">${s.name}</a>` }, { label: 'Mode', render: s => PHOTO_LABEL[s.photo_mode] }, { label: 'Photo participants', num: true, key: 'photo_participants' }, { label: 'Revenue', num: true, render: s => rp(s.photo_revenue) }, { label: 'NPD share', num: true, render: s => rp(s.npd_photo_share) }, { label: 'Photographer share', num: true, render: s => html`<b>${rp(s.photographer_share)}</b>` }, { label: 'Paid', num: true, render: s => rp(s.photographer_paid) }], st.sessions, { empty: emptyState('No photography sessions', 'Sessions with photography will appear here.'), foot: { photo_participants: st.sessions.reduce((a, b) => a + b.photo_participants, 0), photo_revenue: st.totals.photo_revenue, npd_photo_share: st.totals.npd_share, photographer_share: st.totals.photographer_share } })}</div>
        <div class="card"><div class="card-title"><h2>Payments</h2></div>${table([{ label: 'ID', key: 'code' }, { label: 'Date', render: p => fdate(p.paid_date) }, { label: 'For', render: p => p.session_name || 'General' }, { label: 'Amount', num: true, render: p => rp(p.amount) }, { label: 'Status', render: p => badge(p.status) }, { label: '', act: true, render: p => html`${p.status === 'Pending' ? html`<button class="btn sm primary" data-mark="${p.id}">Mark paid</button>` : ''}<button class="icon-btn sm" data-pedit="${p.id}" aria-label="Edit">${icon('edit', 18)}</button><button class="icon-btn sm red" data-pdel="${p.id}" aria-label="Delete">${icon('trash', 18)}</button>` }], st.payments, { empty: emptyState('No payments yet', 'Record a payment when you transfer money to the photographer.') })}</div>` : emptyState('No photographers', 'Add one in Settings.')}`);
  };
  await draw();
  on(v, 'click', '[data-ph]', (e, t) => { phState.id = t.dataset.ph; draw(); });
  v.addEventListener('change', e => { if (e.target.id === 's-from') { phState.start = e.target.value; draw(); } if (e.target.id === 's-to') { phState.end = e.target.value; draw(); } });
  on(v, 'click', '#pay', () => openPhotographerPayment({ photographer_id: phState.id }, draw));
  on(v, 'click', '[data-pedit]', (e, t) => openPhotographerPayment(window._pays.find(p => p.id == t.dataset.pedit), draw));
  on(v, 'click', '[data-pdel]', (e, t) => runDelete({ what: 'payment', url: '/api/photographer-payments/' + t.dataset.pdel, onDone: draw }));
  on(v, 'click', '[data-mark]', async (e, t) => { try { await api('PUT', '/api/photographer-payments/' + t.dataset.mark, { status: 'Paid', paid_date: todayISO() }); toast('Marked as paid'); draw(); } catch (er) { toast(er.message, 'err'); } });
}), 'profit');

// =================================================================== NPD PETTY CASH & UTANG KE ORGANIZER
route('#/profit/funds', () => guard(async () => {
  const v = view();
  const draw = async () => {
    const r = await GET('/api/funds');
    window._ftx = r.transactions;
    const npdF = r.funds.filter(f => f.kind === 'npd'), per = r.funds.filter(f => f.kind === 'personal');
    const KB = { transfer: ['Pindah dana', 'grey'], contribution: ['Modal pribadi', 'green'], reimbursement: ['Ganti uang', 'amber'] };
    const stat = e => e.outstanding <= 0 ? badge('Lunas', 'green') : e.reimbursed > 0 ? badge('Sebagian', 'amber') : badge('Belum', 'red');
    const owe = f => Math.max(0, -f.balance);
    const rows = r.reimbursable.slice().sort((a, b) => (b.outstanding > 0) - (a.outstanding > 0));
    mount(v, html`${pageHead('Saldo Rekening, Petty Cash & Utang', 'Dua kantong NPD: Saldo Rekening (uang dari peserta) dan NPD Petty Cash (pengeluaran kecil). Kalau organizer menalangi pengeluaran dengan uang pribadi, NPD berutang dan menggantinya dari sini.', html`<button class="btn" id="b-tr">${icon('plus', 16)} Pindahkan dana</button><button class="btn" id="b-co">${icon('plus', 16)} Tambah modal pribadi</button>`)}
      <div class="grid g3" style="margin-bottom:14px">${npdF.map(f => kpi(f.name, rp(f.balance), `Masuk ${rp(f.inflow)} · keluar ${rp(f.outflow)}`, { icon: 'shield', cls: f.balance < 0 ? 'neg' : '' }))}${kpi('Total utang NPD', rp(r.owed_personal), 'Ke organizer, belum diganti', { icon: 'wallet', cls: r.owed_personal > 0 ? 'neg' : '' })}${per.map(f => kpi('Utang ke ' + f.name.replace('Personal – ', ''), rp(owe(f)), owe(f) > 0 ? 'Belum diganti' : 'Tidak ada utang', { icon: 'user' }))}</div>
      <div class="alert info" style="margin-bottom:14px">${icon('info', 18)}<span>Utang ke organizer adalah kewajiban (payable), tidak ikut dihitung di Total Cash Balance sampai dibayar.</span></div>
      <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Perlu diganti</h2><span class="muted small">Pengeluaran yang ditalangi pribadi</span></div>${table([{ label: 'Tanggal', render: e => fdate(e.txn_date) }, { label: 'Keterangan', render: e => html`<div class="strong">${e.description}</div><div class="muted xs">${e.fund.replace('Personal – ', '')}</div>` }, { label: 'Jumlah', num: true, render: e => rp(e.amount) }, { label: 'Diganti', num: true, render: e => rp(e.reimbursed) }, { label: 'Sisa', num: true, render: e => html`<b class="${e.outstanding > 0 ? 'neg' : ''}">${rp(e.outstanding)}</b>` }, { label: 'Status', render: stat }, { label: '', act: true, render: e => e.outstanding > 0 ? html`<button class="btn sm primary" data-reim="${e.id}">Reimburse</button>` : '' }], rows, { empty: html`<div class="muted">Belum ada pengeluaran yang ditalangi pribadi.</div>` })}</div>
      <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Riwayat</h2><span class="muted small">Modal pribadi dan penggantian</span></div>${table([{ label: 'Tanggal', render: t => fdate(t.txn_date) }, { label: 'Jenis', render: t => badge(...KB[t.kind]) }, { label: 'Dari → Untuk', render: t => `${t.from_name ? t.from_name + ' → ' : ''}${(t.to_name || '').replace('Personal – ', '')}` }, { label: 'Detail', render: t => t.expense_code ? t.expense_desc : (t.notes || '—') }, { label: 'Jumlah', num: true, render: t => html`<b>${rp(t.amount)}</b>` }, { label: '', act: true, render: t => html`<button class="icon-btn sm" data-fe="${t.id}" aria-label="Edit">${icon('edit', 18)}</button><button class="icon-btn sm red" data-fd="${t.id}" aria-label="Hapus">${icon('trash', 18)}</button>` }], r.transactions, { empty: html`<div class="muted">Belum ada riwayat.</div>` })}</div>
      <div class="card"><div class="card-title"><h2>Alokasi profit ke NPD Petty Cash</h2><a class="small" href="#/profit/organizers">Profit sharing</a></div>${table([{ label: 'Record', render: a => `${a.code} · ${a.label}` }, { label: 'Tanggal', render: a => a.allocation_date ? fdate(a.allocation_date) : '—' }, { label: 'Alokasi', num: true, render: a => `${pctf((a.saving_pct || 0) + (a.petty_pct || 0))} · ${rp((a.saving_amount || 0) + (a.petty_amount || 0))}` }], r.allocations, { empty: html`<div class="muted">Belum ada alokasi terkonfirmasi.</div>` })}</div>`);
  };
  await draw();
  on(v, 'click', '#b-co', () => openFundForm('contribution', draw));
  on(v, 'click', '#b-tr', () => openFundForm('transfer', draw));
  on(v, 'click', '[data-reim]', (e, t) => openFundForm('reimbursement', draw, { expense_id: +t.dataset.reim }));
  on(v, 'click', '[data-fe]', (e, t) => { const ft = window._ftx.find(x => x.id == t.dataset.fe); openFundForm(ft.kind, draw, ft); });
  on(v, 'click', '[data-fd]', (e, t) => runDelete({ what: 'catatan ini', url: '/api/fund-transactions/' + t.dataset.fd, onDone: draw }));
}), 'profit');

// =================================================================== REPORTS
const repState = { key: 'overall', sport_id: '', venue_id: '', session_id: '', member_id: '', category: '', fund_id: '' };
route('#/reports', () => guard(async () => {
  const v = view(), st = FS.rep;
  const [cat, ss, ms] = await Promise.all([GET('/api/reports'), GET('/api/sessions', { size: 200, sort: 'date_asc' }), GET('/api/members', { size: 200, active: 'all', sort: 'nickname' })]);
  if (!cat.reports.find(r => r.key === repState.key)) repState.key = cat.reports[0].key;
  const params = () => ({ start: st.start, end: st.end, sport_id: repState.sport_id, venue_id: repState.venue_id, session_id: repState.session_id, member_id: repState.member_id, category: repState.category, fund_id: repState.fund_id });
  const sel = (id, label, all, items, cur) => html`<div class="field"><label>${label}</label><select class="inp" id="${id}"><option value="">${all}</option>${items.map(([val, text]) => html`<option value="${val}" ${val == cur ? raw('selected') : ''}>${text}</option>`)}</select></div>`;
  const draw = async () => {
    mount(v, html`${pageHead('Reports', 'Preview on screen, then export to Excel, CSV or PDF with the same filters.', html`<a class="btn primary" id="x-xlsx" href="#">${icon('download', 16)} Excel</a><a class="btn" id="x-pdf" href="#">PDF</a><a class="btn" id="x-csv" href="#">CSV</a>`)}
      <div class="card" style="margin-bottom:14px"><div class="form-grid">
        <div class="field full"><label>Report</label><select class="inp" id="r-key">${cat.groups.map(g => html`<optgroup label="${g}">${cat.reports.filter(r => r.group === g).map(r => html`<option value="${r.key}" ${r.key === repState.key ? raw('selected') : ''}>${r.title}</option>`)}</optgroup>`)}</select></div></div>
        ${rangeBar(st)}
        <div class="form-grid">${sel('r-sport', 'Sport', 'All sports', M().sports.map(s => [s.id, s.name]), repState.sport_id)}${sel('r-venue', 'Venue', 'All venues', M().venues.map(s => [s.id, s.name]), repState.venue_id)}
          ${sel('r-sess', 'Session', 'All sessions', ss.sessions.map(s => [s.id, `${fdate(s.event_date)} – ${s.name}`]), repState.session_id)}${sel('r-mem', 'Member', 'All members', ms.members.map(s => [s.id, `${s.nickname} (${s.member_code})`]), repState.member_id)}
          ${sel('r-cat', 'Transaction category', 'All categories', cat.categories.map(c => [c, c]), repState.category)}${sel('r-fund', 'Source of fund', 'All funds', cat.funds.map(f => [f.id, f.name]), repState.fund_id)}</div></div>
      <div id="rep"><div class="card muted">Loading…</div></div>`);
    for (const f of ['xlsx', 'pdf', 'csv']) $('#x-' + f, v).href = '/api/reports/' + repState.key + '/export' + qs({ ...params(), format: f });
    try {
      const { report } = await GET('/api/reports/' + repState.key, params());
      const fmt = c => c.type === 'money' ? (x => rp(x)) : c.type === 'date' ? fdate : c.type === 'pct' ? (x => pctf(x)) : c.type === 'int' ? (x => num(x)) : null;
      const cols = report.columns.map(c => ({ label: c.label, num: ['money', 'int', 'pct'].includes(c.type), render: r => { const x = r[c.key]; if (x == null || x === '') return '—'; const f = fmt(c); return f ? (c.type === 'money' && x < 0 ? raw(`<span class="neg">${esc(f(x))}</span>`) : f(x)) : String(x); }, key: c.key, fmt: fmt(c) || undefined }));
      mount($('#rep', v), html`<div class="card-title"><h2>${report.title}</h2><span class="muted small">${report.rows.length} rows</span></div>${table(cols, report.rows, { empty: emptyState('No data for these filters', 'Try a wider date range.'), foot: Object.keys(report.totals || {}).length ? { ...report.totals } : null })}`);
    } catch (e) { mount($('#rep', v), html`<div class="alert err">${icon('alert', 18)}<span>${e.message}</span></div>`); }
  };
  await draw();
  bindRange(v, st, () => draw());
  v.addEventListener('change', e => { const m = { 'r-key': 'key', 'r-sport': 'sport_id', 'r-venue': 'venue_id', 'r-sess': 'session_id', 'r-mem': 'member_id', 'r-cat': 'category', 'r-fund': 'fund_id' }[e.target.id]; if (m) { repState[m] = e.target.value; draw(); } });
}), 'reports');

// =================================================================== SETTINGS
const setState = { tab: 'business' };
route('#/settings', () => guard(async () => {
  const v = view();
  const tabs = [['business', 'Business'], ['organizers', 'Organizers'], ['photo', 'Photography & Funds'], ['funds', 'Fund Balances'], ['sports', 'Sports'], ['photographers', 'Photographers'], ['sync', 'GitHub Sync'], ['security', 'This Device'], ['data', 'Data & Backup'], ['audit', 'Audit Log']];
  const draw = async () => {
    const S = (await GET('/api/settings')).settings;
    let body = '';
    if (setState.tab === 'business') body = html`<div class="card"><div class="card-title"><h2>Business settings</h2></div><div class="form-grid"><div class="field full"><label>Business name</label><input class="inp" id="s-name" value="${S.business_name}" maxlength="100"></div><div class="field"><label>Currency</label><input class="inp" value="IDR – Indonesian Rupiah" disabled></div>
      <div class="field"><label>Financial period starts in</label><select class="inp" id="s-fp">${MONTHS_FULL.map((m, i) => html`<option value="${i + 1}" ${+S.financial_period_start_month === i + 1 ? raw('selected') : ''}>${m}</option>`)}</select></div>
      <div class="field full"><label>Saldo awal Saldo Rekening (Rp)</label><input class="inp" data-money inputmode="numeric" id="s-open" value="${num(S.opening_cash)}"><div class="hint">Cash on hand before the first recorded transaction. Changing it shifts every closing balance but no profit figure.</div></div></div><button class="btn primary" id="s-save" style="margin-top:14px">Save</button></div>`;
    else if (setState.tab === 'photo') body = html`<div class="card"><div class="card-title"><h2>Photography & fund defaults</h2></div><div class="alert info" style="margin-bottom:14px">${icon('info', 18)}<span>Defaults pre-fill new sessions only. Existing sessions keep the configuration they were created with.</span></div><div class="form-grid">
      <div class="field"><label>Default photographer</label><select class="inp" id="s-ph"><option value="">None</option>${M().photographers.filter(p => p.active).map(p => html`<option value="${p.id}" ${p.id == S.default_photographer_id ? raw('selected') : ''}>${p.name}</option>`)}</select></div>
      <div class="field"><label>Default photography mode</label><select class="inp" id="s-mode">${['included', 'excluded', 'none'].map(m => html`<option value="${m}" ${m === S.default_photo_mode ? raw('selected') : ''}>${PHOTO_LABEL[m]}</option>`)}</select></div>
      <div class="field"><label>Default photography fee (Rp)</label><input class="inp" data-money inputmode="numeric" id="s-fee" value="${num(S.default_photo_fee)}"></div>
      <div class="field"><label>Default NPD share (%)</label><input class="inp" type="number" min="0" max="100" step="0.01" id="s-npd" value="${S.default_npd_share}"><div class="hint" id="s-npd-h">Photographer receives ${pctf(100 - S.default_npd_share)}.</div></div>
      <div class="field"><label>NPD Petty Cash allocation (%)</label><input class="inp" type="number" min="0" max="100" step="0.01" id="s-pet" value="${S.default_petty_pct}"><div class="hint">Diambil dari profit yang bisa dibagi sebelum bagi hasil organizer. Bisa diubah kapan saja.</div></div>
      <div class="field full"><label>Default fund for venue rental</label><select class="inp" id="s-vf">${M().funds.map(f => html`<option value="${f.code}" ${f.code === S.default_venue_fund ? raw('selected') : ''}>${f.name}</option>`)}</select><div class="hint">New sessions pre-select this Source of Fund; it can be changed per session.</div></div></div><button class="btn primary" id="s-save2" style="margin-top:14px">Save</button></div>`;
    else if (setState.tab === 'organizers') { const o = M().organizers; body = html`<div class="card"><div class="card-title"><h2>Organizers & profit sharing</h2><button class="btn sm" id="o-add">${icon('plus', 16)} Add organizer</button></div><p class="muted small" style="margin-top:0">Active organizer percentages must total exactly 100%. Past profit-sharing records keep the percentages they were calculated with.</p>
      <div id="orgs">${o.map(x => html`<div class="list-item" data-org="${x.id}"><input class="inp" data-n value="${x.name}" style="max-width:220px" aria-label="Name"><input class="inp" data-p type="number" min="0" max="100" step="0.01" value="${x.share_pct}" style="max-width:110px" aria-label="Percent"><span>%</span><label class="check"><input type="checkbox" data-a ${x.active ? raw('checked') : ''}> Active</label></div>`)}</div>
      <div class="muted small" id="o-sum" style="margin:10px 0"></div><button class="btn primary" id="o-save">Save organizers</button></div>`; }
    else if (setState.tab === 'sports') body = html`<div class="card"><div class="card-title"><h2>Sports</h2><button class="btn sm" id="sp-add">${icon('plus', 16)} Add sport</button></div>${M().sports.map(s => html`<div class="list-item"><input class="inp" type="color" data-sc="${s.id}" value="${s.color}" style="width:56px;padding:3px" aria-label="Color"><div class="grow strong">${s.name}</div><label class="check"><input type="checkbox" data-sa="${s.id}" ${s.active ? raw('checked') : ''}> Active</label></div>`)}<p class="muted xs">Sport colors appear only as small labels and badges.</p></div>`;
    else if (setState.tab === 'photographers') body = html`<div class="card"><div class="card-title"><h2>Photographers</h2><button class="btn sm" id="ph-add">${icon('plus', 16)} Add photographer</button></div><p class="muted small" style="margin-top:0">Default fee and NPD share pre-fill new sessions only.</p>${M().photographers.map(p => html`<div class="list-item" data-phr="${p.id}"><div class="grow strong">${p.name}</div><input class="inp" data-pf data-money inputmode="numeric" value="${num(p.default_fee || 0)}" style="max-width:130px" aria-label="Default fee"><input class="inp" data-pn type="number" min="0" max="100" step="0.01" value="${p.default_npd_share ?? 10}" style="max-width:90px" aria-label="NPD share %"><span>%</span><label class="check"><input type="checkbox" data-pa="${p.id}" ${p.active ? raw('checked') : ''}> Active</label><button class="btn sm" data-phs="${p.id}">Save</button></div>`)}</div>`;
    else if (setState.tab === 'funds') { const fs = (await GET('/api/funds')).funds; body = html`<div class="card"><div class="card-title"><h2>Fund opening balances</h2></div><p class="muted small" style="margin-top:0">Starting balance of each fund before any recorded movement. Current balance = opening balance + all movements.</p>${fs.map(f => html`<div class="list-item" data-fr="${f.id}"><div class="grow"><div class="strong">${f.name}</div><div class="muted xs">Current balance ${rp(f.balance)}</div></div><input class="inp" data-fo inputmode="numeric" value="${f.opening_balance ?? 0}" style="max-width:160px" aria-label="Opening balance"><button class="btn sm" data-fs="${f.id}">Save</button></div>`)}</div>`; }
    else if (setState.tab === 'sync') body = syncCard();
    else if (setState.tab === 'security') body = html`<div class="card"><div class="card-title"><h2>Perangkat ini</h2></div><p style="margin-top:0">Dipakai oleh <b>${NPD.user.display_name}</b> (peran: ${NPD.user.role}).</p><div class="alert warn" style="margin-bottom:12px">${icon('alert', 18)}<span>Peran hanya mengatur menu yang tampil di perangkat ini. Ini <b>bukan</b> pengaman: siapa pun yang memegang token GitHub bisa membaca seluruh data.</span></div><button class="btn" id="chg-profile">Ganti pengguna</button></div>`;
    else if (setState.tab === 'data') body = html`<div class="grid g2"><div class="card"><div class="card-title"><h2>Demo data</h2></div><p style="margin-top:0">Demo records are labelled <span class="badge demo">DEMO</span>. Clearing removes only demo records – your real data is never touched.</p>${S.demo_loaded === '1' ? html`<button class="btn danger" id="demo-clear">Clear demo data</button>` : html`<button class="btn" id="demo-load">Load demo data</button>`}</div>
      <div class="card"><div class="card-title"><h2>Backup & recovery</h2></div><p style="margin-top:0">Unduh salinan seluruh data (file JSON). Simpan di tempat aman. Untuk memulihkan, gunakan tombol <b>Pulihkan dari backup</b> di bawah.</p><a class="btn primary" href="/api/backup">${icon('download', 16)} Unduh backup</a> <button class="btn" id="restore">${icon('upload', 16)} Pulihkan dari backup</button><input type="file" id="restore-file" accept=".json,application/json" hidden></div></div>`;
    else if (setState.tab === 'audit') { body = html`<div class="card"><div class="card-title"><h2>Audit log</h2></div><div class="toolbar"><input class="inp grow" id="a-q" placeholder="Search user, action or details"><select class="inp" id="a-ent"><option value="">All records</option>${['expense', 'revenue', 'photographer_payment', 'participant', 'session', 'member', 'profit_sharing', 'club_reserve', 'settings', 'user'].map(e => html`<option>${e}</option>`)}</select></div><div id="audit"></div></div>`; }
    mount(v, html`${pageHead('Settings', 'Changes never alter historical financial records.')}<div class="tabs">${tabs.map(([k, l]) => html`<button class="tab ${setState.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`)}</div>${body}`);
    if (setState.tab === 'audit') loadAudit();
    if (setState.tab === 'organizers') sumOrg();
  };
  const sumOrg = () => { const act = $$('[data-org]', v).filter(r => $('[data-a]', r).checked), t = act.reduce((a, r) => a + (+$('[data-p]', r).value || 0), 0), el = $('#o-sum', v); if (el) { el.textContent = `Active total: ${Math.round(t * 100) / 100}%`; el.className = 'small ' + (Math.abs(t - 100) < 0.0001 ? 'pos' : 'neg'); } };
  const loadAudit = async () => {
    const r = await GET('/api/audit', { q: $('#a-q', v).value, entity: $('#a-ent', v).value, size: 50 });
    mount($('#audit', v), table([{ label: 'When', render: a => `${fdate(a.created_at)} ${a.created_at.slice(11, 16)}` }, { label: 'User', key: 'username' }, { label: 'Action', render: a => badge(a.action, 'grey') }, { label: 'Record', render: a => `${a.entity}${a.entity_id ? ' #' + a.entity_id : ''}` }, { label: 'Details', render: a => a.detail ? raw(`<pre class="json">${esc(a.detail.length > 400 ? a.detail.slice(0, 400) + '…' : a.detail)}</pre>`) : '—' }], r.rows, { empty: emptyState('No entries', 'Nothing matches.') }));
  };
  await draw();
  const save = async (body, msg = 'Settings saved') => { try { await api('PUT', '/api/settings', body); await refreshMeta(); toast(msg); draw(); } catch (e) { toast(e.message, 'err'); } };
  on(v, 'click', '[data-tab]', (e, t) => { setState.tab = t.dataset.tab; draw(); });
  on(v, 'click', '#s-save', () => save({ business_name: $('#s-name', v).value, financial_period_start_month: $('#s-fp', v).value, opening_cash: $('#s-open', v).value.replace(/\D/g, '') || 0 }));
  on(v, 'click', '#s-save2', () => save({ default_photographer_id: $('#s-ph', v).value, default_photo_mode: $('#s-mode', v).value, default_photo_fee: $('#s-fee', v).value.replace(/\D/g, '') || 0, default_npd_share: $('#s-npd', v).value, default_petty_pct: $('#s-pet', v).value, default_venue_fund: $('#s-vf', v).value }));
  v.addEventListener('input', e => { if (e.target.id === 's-npd') $('#s-npd-h', v).textContent = `Photographer receives ${pctf(100 - (+e.target.value || 0))}.`; if (e.target.closest('[data-org]')) sumOrg(); });
  v.addEventListener('change', e => { if (e.target.closest && e.target.closest('[data-org]')) sumOrg(); });
  on(v, 'click', '#o-add', () => { $('#orgs', v).insertAdjacentHTML('beforeend', `<div class="list-item" data-org=""><input class="inp" data-n placeholder="Name" style="max-width:220px"><input class="inp" data-p type="number" min="0" max="100" step="0.01" value="0" style="max-width:110px"><span>%</span><label class="check"><input type="checkbox" data-a checked> Active</label></div>`); });
  on(v, 'click', '#o-save', async () => { const items = $$('[data-org]', v).map(r => ({ id: r.dataset.org ? +r.dataset.org : undefined, name: $('[data-n]', r).value, share_pct: $('[data-p]', r).value, active: $('[data-a]', r).checked })); try { await api('PUT', '/api/organizers', { organizers: items }); await refreshMeta(); toast('Organizers saved'); draw(); } catch (e) { toast(e.message, 'err'); } });
  on(v, 'change', '[data-sc],[data-sa]', async (e, t) => { const id = t.dataset.sc || t.dataset.sa, s = M().sports.find(x => x.id == id); const body = { name: s.name, color: t.dataset.sc ? t.value : s.color, active: t.dataset.sa ? t.checked : s.active }; try { await api('PUT', '/api/sports/' + id, body); await refreshMeta(); toast('Sport updated'); } catch (er) { toast(er.message, 'err'); } });
  on(v, 'click', '#sp-add', () => formModal({ title: 'Add sport', size: 'sm', fields: [{ name: 'name', label: 'Sport name', required: true, full: true }, { name: 'color', label: 'Color', type: 'text', placeholder: '#E6EEFB', full: true }], values: { color: '#E6EEFB' }, onSubmit: async (d, ctx) => { await api('POST', '/api/sports', d); await refreshMeta(); ctx.modal.close(); toast('Sport added'); draw(); } }));
  on(v, 'click', '#ph-add', () => formModal({ title: 'Add photographer', size: 'sm', fields: [{ name: 'name', label: 'Name', required: true, full: true }], onSubmit: async (d, ctx) => { await api('POST', '/api/photographers', d); await refreshMeta(); ctx.modal.close(); toast('Photographer added'); draw(); } }));
  on(v, 'click', '[data-phs]', async (e, t) => { const p = M().photographers.find(x => x.id == t.dataset.phs), row = t.closest('[data-phr]'); try { await api('PUT', '/api/photographers/' + p.id, { name: p.name, active: $('[data-pa]', row).checked, default_fee: $('[data-pf]', row).value.replace(/\D/g, '') || 0, default_npd_share: $('[data-pn]', row).value }); await refreshMeta(); toast('Photographer defaults saved'); } catch (er) { toast(er.message, 'err'); } });
  on(v, 'click', '[data-fs]', async (e, t) => { const row = t.closest('[data-fr]'); try { await api('PUT', '/api/funds/' + t.dataset.fs, { opening_balance: $('[data-fo]', row).value.replace(/[^\d-]/g, '') || 0 }); await refreshMeta(); toast('Opening balance saved'); draw(); } catch (er) { toast(er.message, 'err'); } });
  on(v, 'change', '[data-pa]', async (e, t) => { const p = M().photographers.find(x => x.id == t.dataset.pa); try { await api('PUT', '/api/photographers/' + p.id, { name: p.name, active: t.checked, default_fee: p.default_fee, default_npd_share: p.default_npd_share }); await refreshMeta(); toast('Updated'); } catch (er) { toast(er.message, 'err'); } });
  on(v, 'click', '#chg-profile', () => { NPDB.router.setProfile(null); localStorage.removeItem('npd.profile'); location.hash = ''; renderLogin(); });
  on(v, 'click', '#restore', () => $('#restore-file', v).click());
  v.addEventListener('change', async e => { if (e.target.id !== 'restore-file') return; const f = e.target.files[0]; if (!f) return;
    try { const o = JSON.parse(await f.text()); if (!o || o.app !== 'npd' || !o.collections) throw new Error('Bukan file backup NPD.');
      if (!(await confirmBox({ title: 'Pulihkan dari backup?', message: 'Data di perangkat ini diganti dengan isi file, lalu dikirim ke GitHub dan menimpa data yang ada di sana. Lanjutkan hanya jika yakin.', confirmText: 'Pulihkan', danger: true }))) return;
      const r = await NPDB.restore(o); toast(r.message); await refreshMeta(); draw(); } catch (er) { toast(er.message, 'err'); } });
  bindSync(v, draw);
  on(v, 'click', '#demo-clear', async () => { if (await confirmBox({ title: 'Clear demo data?', message: 'Only records marked DEMO are removed. Real records are kept.', confirmText: 'Clear demo data', danger: true })) { try { const r = await api('POST', '/api/demo/clear'); await refreshMeta(); toast('Demo data cleared'); draw(); } catch (e) { toast(e.message, 'err'); } } });
  on(v, 'click', '#demo-load', async () => { try { await api('POST', '/api/demo/load'); await refreshMeta(); toast('Demo data loaded'); draw(); } catch (e) { toast(e.message, 'err'); } });
  v.addEventListener('input', debounce(e => { if (e.target.id === 'a-q') loadAudit(); }, 300)); v.addEventListener('change', e => { if (e.target.id === 'a-ent') loadAudit(); });
}), 'settings');

function syncCard() {
  const c = NPDB.sync.cfg(), st = NPDB.sync.status();
  const stText = { off: 'Belum tersambung', ok: 'Tersinkron', pending: `${st.pending} perubahan menunggu dikirim`, syncing: 'Menyinkronkan…', offline: 'Offline', error: 'Gagal sinkron' }[st.state];
  return html`<div class="card"><div class="card-title"><h2>Sinkronisasi GitHub</h2></div>
    <p class="muted small" style="margin-top:0">Data disimpan di perangkat ini dan disalin ke satu file JSON di repo GitHub <b>privat</b>. Aplikasi (kode) ada di repo terpisah yang publik dan tidak berisi data.</p>
    <div class="alert ${st.state === 'error' ? 'warn' : 'info'}" style="margin-bottom:12px">${icon(st.state === 'error' ? 'alert' : 'info', 18)}<span><b>${stText}</b>${st.message ? html` — ${st.message}` : ''}${st.lastSync ? html`<br><span class="muted xs">Terakhir sinkron: ${fdate(st.lastSync.slice(0, 10))} ${new Date(st.lastSync).toTimeString().slice(0, 5)}</span>` : ''}</span></div>
    ${c ? html`<div class="list-item"><div class="grow"><div class="strong">${c.owner}/${c.repo}</div><div class="muted xs">file ${c.path} · branch ${c.branch} · token tersimpan di perangkat ini</div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" id="sy-now">${icon('refresh', 16)} Sinkronkan sekarang</button><button class="btn danger" id="sy-off">Putuskan</button></div>
      <p class="muted xs" style="margin-bottom:0">Memutuskan hanya menghapus token dari perangkat ini. Data lokal tetap ada.</p>`
    : html`<div class="form-grid">
      <div class="field"><label for="sy-owner">Pemilik repo data (username GitHub)</label><input class="inp" id="sy-owner" autocapitalize="none" autocomplete="off" placeholder="sabit"></div>
      <div class="field"><label for="sy-repo">Nama repo data (privat)</label><input class="inp" id="sy-repo" autocapitalize="none" autocomplete="off" placeholder="npd-data"></div>
      <div class="field"><label for="sy-path">Nama file</label><input class="inp" id="sy-path" value="npd-data.json" autocapitalize="none"></div>
      <div class="field"><label for="sy-branch">Branch</label><input class="inp" id="sy-branch" value="main" autocapitalize="none"></div>
      <div class="field full"><label for="sy-token">Token GitHub (fine-grained)</label><input class="inp" id="sy-token" type="password" autocomplete="off" placeholder="github_pat_…"><div class="hint">Hanya untuk repo data, izin <b>Contents: Read and write</b>. Token disimpan hanya di perangkat ini.</div></div></div>
      <button class="btn primary" id="sy-save" style="margin-top:14px">Hubungkan</button><div id="sy-err" class="field-err" role="alert" style="margin-top:8px"></div>`}</div>`;
}
function bindSync(v, draw) {
  NPDB.sync.onStatus(() => { if ($('#sy-now', v) || $('#sy-save', v)) { if (location.hash === '#/settings' && setState.tab === 'sync') draw(); } });
  on(v, 'click', '#sy-now', async () => { await NPDB.sync.syncNow(); draw(); const s = NPDB.sync.status(); toast(s.state === 'ok' ? 'Tersinkron' : s.message || 'Belum tersinkron', s.state === 'ok' ? 'ok' : 'err'); });
  on(v, 'click', '#sy-off', async () => { if (await confirmBox({ title: 'Putuskan sinkronisasi?', message: 'Token dihapus dari perangkat ini. Perubahan yang belum terkirim tetap ada di perangkat tetapi tidak akan dikirim sampai tersambung lagi.', confirmText: 'Putuskan', danger: true })) { NPDB.sync.disconnect(); draw(); } });
  on(v, 'click', '#sy-save', async e => { const b = e.currentTarget; b.disabled = true; $('#sy-err', v).textContent = '';
    try { const r = await NPDB.sync.configure({ owner: $('#sy-owner', v).value, repo: $('#sy-repo', v).value, path: $('#sy-path', v).value, branch: $('#sy-branch', v).value, token: $('#sy-token', v).value });
      await refreshMeta(); toast(r.existing ? 'Tersambung — data dari GitHub dimuat' : 'Tersambung — data pertama dikirim ke GitHub'); draw(); }
    catch (er) { $('#sy-err', v).textContent = er.message; b.disabled = false; } });
}

// =================================================================== INSTALL
route('#/install', () => {
  const v = view(), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  mount(v, html`${pageHead('Install NPD on your phone', 'Open NPD straight from your home screen, like a regular app.')}
    ${standalone ? html`<div class="alert ok" style="margin-bottom:14px">${icon('check', 18)}<span>NPD is already installed on this device.</span></div>` : html`<div class="card" style="margin-bottom:14px"><button class="btn primary" id="inst" ${NPD.deferredInstall ? '' : raw('disabled')}>${icon('download', 16)} Install app</button><div class="muted small" style="margin-top:8px">${NPD.deferredInstall ? 'Your browser supports one-tap install.' : 'One-tap install is not available in this browser right now – use the steps below.'}</div></div>`}
    <div class="grid g3"><div class="card"><h3>Android (Chrome)</h3><ol class="small"><li>Open this site in Chrome.</li><li>Tap the ⋮ menu.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li></ol></div>
      <div class="card"><h3>iPhone (Safari)</h3><ol class="small"><li>Open this site in <b>Safari</b> (bukan dari dalam aplikasi lain).</li><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol></div>
      <div class="card"><h3>Desktop</h3><ol class="small"><li>Use Chrome or Edge.</li><li>Click the install icon in the address bar.</li><li>Confirm <b>Install</b>.</li></ol></div></div>
    <div class="card" style="margin-top:14px"><h3>Offline & security</h3><p class="small" style="margin-bottom:0">Aplikasi (tampilan) di-cache supaya bisa dibuka offline. Data disimpan di perangkat ini (bukan di cache aplikasi) dan dikirim ke GitHub saat online. Status “menunggu dikirim” selalu terlihat di atas layar, jadi tidak ada perubahan yang diam-diam hilang.</p></div>`);
  on(v, 'click', '#inst', async () => { const p = NPD.deferredInstall; if (!p) return; p.prompt(); await p.userChoice; NPD.deferredInstall = null; NPD.render(); });
}, 'install');
