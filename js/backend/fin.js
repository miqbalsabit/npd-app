'use strict';
/* NPD backend (in-browser) – expenses, revenue, transactions, funds, photographers, profit sharing, dashboard. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, E = NPDB.engine, R = NPDB.router, { ApiError, s, i, pct, dt, oneOf, today, sortBy, sum, rnd } = NPDB;
  const { add, ok, has, log, pageArgs, like } = R;
  const EXPENSE_CATS = NPDB.ops.EXPENSE_CATS, METHODS = ['Cash', 'Bank Transfer', 'QRIS', 'E-Wallet', 'Other'];
  const AUTO_REVENUE_CATS = ['session fee', 'photography add-on', 'npd photography share'];
  const uname = () => (R.auth.user || {}).username || 'system';
  const rp = n => (n < 0 ? '-' : '') + 'Rp' + Math.abs(n).toLocaleString('de-DE');
  const truthy = v => ['1', 'true'].includes(String(v === undefined ? '' : v).toLowerCase());
  const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
  const filters = q => Object.fromEntries(['start', 'end', 'sport_id', 'venue_id', 'session_id', 'member_id', 'category', 'fund_id'].map(k => [k, q[k] || null]));

  function fundOf(fid, label = 'Source of Fund') { const f = fid ? T.get('funds', fid) : null; if (!f) throw new ApiError(`${label} is required.`); return f; }
  function checkOverdraw(fund, amount, onDate, excludeRef, force) {
    if (fund.kind !== 'npd' || force) return;
    const bal = E.fundBalance(fund.id, onDate, excludeRef);
    if (bal - amount < 0) throw new ApiError(`${fund.name} only has ${rp(bal)} on ${onDate}. This would overdraw it by ${rp(amount - bal)}.`, 409, { code: 'fund_overdraw', balance: bal });
  }

  // =============================================================== expenses
  function expenseVals(d) {
    const cat = oneOf(d, 'category', EXPENSE_CATS, null, 'Category'); if (!cat) throw new ApiError('Category is required.');
    const etype = oneOf(d, 'expense_type', ['session', 'general'], i(d, 'session_id', false, 1) ? 'session' : 'general', 'Expense type');
    const sid = etype === 'session' ? i(d, 'session_id', false, 1) : null;
    if (etype === 'session' && !sid) throw new ApiError('Choose the session this operational expense belongs to, or switch the type to General Business Operational Expense.');
    if (sid) { if (!T.get('sessions', sid)) throw new ApiError('Related session not found.'); if (cat === 'Venue Rental') throw new ApiError("Venue rental for a session is taken automatically from the session's venue cost (and its Source of Fund). Record Venue Rental here only as a General Business expense."); }
    const fund = fundOf(i(d, 'source_fund_id', true, 1, 1e11, null, 'Source of Fund'));
    return [{ txn_date: dt(d, 'txn_date', true, 'Transaction date'), category: cat, description: s(d, 'description', true, 200, 'Description'), amount: i(d, 'amount', true, 1, 1e11, null, 'Amount'),
      session_id: sid, source_fund_id: fund.id, payment_method: oneOf(d, 'payment_method', METHODS, 'Cash', 'Payment method'), notes: s(d, 'notes', false, 500) }, fund];
  }
  const receiptVal = d => { const r = s(d, 'receipt', false, 500); if (r && !/^https?:\/\//i.test(r)) throw new ApiError('Receipt must be a link starting with http:// or https://'); return r; };
  const reimbursedOf = eid => sum(T.all('fund_transactions').filter(x => x.expense_id === eid && x.kind === 'reimbursement'), x => x.amount);

  add('GET', '/expenses', 'finance', ({ q }) => {
    let rows = T.all('expenses').filter(e => T.get('funds', e.source_fund_id));
    if (q.q) rows = rows.filter(e => like(e.description, q.q) || like(e.code, q.q) || like(e.notes, q.q));
    if (q.category) rows = rows.filter(e => e.category === q.category);
    if (q.session_id) rows = rows.filter(e => e.session_id == q.session_id);
    if (q.fund_id) rows = rows.filter(e => e.source_fund_id == q.fund_id);
    if (q.start) rows = rows.filter(e => e.txn_date >= q.start); if (q.end) rows = rows.filter(e => e.txn_date <= q.end);
    if (q.classification === 'session') rows = rows.filter(e => e.session_id); else if (q.classification === 'general') rows = rows.filter(e => !e.session_id);
    rows = q.sort === 'amount' ? sortBy(rows, e => -e.amount) : q.sort === 'date_asc' ? sortBy(rows, 'txn_date', 'id') : rows.slice().sort((a, b) => (a.txn_date < b.txn_date ? 1 : a.txn_date > b.txn_date ? -1 : b.updatedAt < a.updatedAt ? -1 : 1));
    const [, size, off] = pageArgs(q, 25), byFund = {};
    rows.forEach(e => { const f = T.get('funds', e.source_fund_id); byFund[f.id] = byFund[f.id] || { name: f.name, t: 0, sort: f.sort }; byFund[f.id].t += e.amount; });
    const out = rows.slice(off, off + size).map(e => { const f = T.get('funds', e.source_fund_id), sess = e.session_id ? T.get('sessions', e.session_id) : null;
      return Object.assign({}, e, { session_name: sess ? sess.name : null, source_fund: f.name, fund_kind: f.kind, reimbursed: reimbursedOf(e.id), classification: e.session_id ? 'Session Expense' : 'General Business Expense' }); });
    return ok({ expenses: out, total: rows.length, sum: sum(rows, e => e.amount), by_fund: sortBy(Object.values(byFund), 'sort').map(x => ({ name: x.name, t: x.t })) });
  });
  add('GET', '/expenses/<int:eid>', 'finance', (c, eid) => { const r = T.get('expenses', eid); if (!r) throw new ApiError('Expense not found.', 404); return ok({ expense: r }); });
  add('POST', '/expenses', 'finance', ({ body: d }) => {
    const [v, fund] = expenseVals(d), receipt = receiptVal(d);
    checkOverdraw(fund, v.amount, v.txn_date, null, truthy(d.force));
    const code = T.nextCode('expenses', 'code', 'EXP-', 6), r = T.insert('expenses', Object.assign({ code, receipt, created_by: uname(), is_demo: 0 }, v));
    log('create', 'expense', r.id, Object.assign({ code, fund: fund.name }, v)); return ok({ id: r.id, code });
  }, true);
  add('PUT', '/expenses/<int:eid>', 'finance', ({ body: d }, eid) => {
    const old = T.get('expenses', eid); if (!old) throw new ApiError('Expense not found.', 404);
    const [v, fund] = expenseVals(d), receipt = 'receipt' in d ? receiptVal(d) : old.receipt, reimb = reimbursedOf(eid);
    if (reimb && (v.source_fund_id !== old.source_fund_id || v.amount < reimb)) throw new ApiError('This expense was already (partly) reimbursed. Remove the reimbursement first before changing its fund or lowering the amount.', 409);
    checkOverdraw(fund, v.amount, v.txn_date, 'ex' + eid, truthy(d.force));
    const oldCopy = Object.assign({}, old); T.update('expenses', eid, Object.assign({ receipt }, v)); log('update', 'expense', eid, { old: oldCopy, new: v }); return ok();
  });
  add('DELETE', '/expenses/<int:eid>', 'finance', (c, eid) => {
    const old = T.get('expenses', eid); if (!old) throw new ApiError('Expense not found.', 404);
    if (T.find('fund_transactions', x => x.expense_id === eid)) throw new ApiError('A reimbursement is linked to this expense. Delete the reimbursement first.', 409);
    T.remove('expenses', eid); log('delete', 'expense', eid, old); return ok();
  });

  // =============================================================== revenue
  add('GET', '/revenue', 'finance', ({ q }) => {
    const start = q.start || null, end = q.end || null, ps = E.periodSummary(start, end);
    const auto = ps.sessions.filter(x => x.net_collected || x.receivable).map(x => ({ session_id: x.id, session: x.name, date: x.event_date, status: x.status, session_fee_revenue: x.organizer_session_fee, photo_revenue: x.photo_revenue,
      npd_photo_share: x.npd_photo_share, photographer_share: x.photographer_share, business_revenue: x.organizer_revenue, collected: x.net_collected, receivable: x.receivable }));
    const manual = T.all('revenue_records').filter(r => r.txn_date >= (start || '2000-01-01') && r.txn_date <= (end || '2100-01-01')).sort((a, b) => (a.txn_date < b.txn_date ? 1 : a.txn_date > b.txn_date ? -1 : b.updatedAt < a.updatedAt ? -1 : 1));
    return ok({ summary: pick(ps, ['session_fee_revenue', 'photo_revenue', 'npd_photo_share', 'photographer_share', 'other_revenue', 'organizer_revenue', 'net_collected', 'gross_collected', 'refunds', 'receivable']), auto, manual });
  });
  add('GET', '/revenue/<int:rid>', 'finance', (c, rid) => { const r = T.get('revenue_records', rid); if (!r) throw new ApiError('Record not found.', 404); return ok({ record: r }); });
  add('GET', '/photographer-payments/<int:pid>', 'finance', (c, pid) => { const r = T.get('photographer_payments', pid); if (!r) throw new ApiError('Payment not found.', 404); return ok({ payment: r }); });
  function revVals(d) {
    const cat = s(d, 'category', false, 60) || 'Other Revenue';
    if (AUTO_REVENUE_CATS.includes(cat.toLowerCase())) throw new ApiError(`'${cat}' is generated automatically from sessions. Recording it manually would double count – use Other Revenue.`);
    return { txn_date: dt(d, 'txn_date', true, 'Date'), category: cat, description: s(d, 'description', true, 200, 'Description'), amount: i(d, 'amount', true, 1, 1e11, null, 'Amount'), payment_method: oneOf(d, 'payment_method', METHODS, 'Cash'), notes: s(d, 'notes', false, 500) };
  }
  add('POST', '/revenue', 'finance', ({ body: d }) => { const v = revVals(d), code = T.nextCode('revenue_records', 'code', 'REV-', 6); const r = T.insert('revenue_records', Object.assign({ code, created_by: uname(), is_demo: 0 }, v)); log('create', 'revenue', r.id, Object.assign({ code }, v)); return ok({ id: r.id, code }); }, true);
  add('PUT', '/revenue/<int:rid>', 'finance', ({ body: d }, rid) => { const v = revVals(d), old = T.get('revenue_records', rid); if (!old) throw new ApiError('Record not found.', 404); const oc = Object.assign({}, old); T.update('revenue_records', rid, v); log('update', 'revenue', rid, { old: oc, new: v }); return ok(); });
  add('DELETE', '/revenue/<int:rid>', 'finance', (c, rid) => { const old = T.get('revenue_records', rid); if (!old) throw new ApiError('Record not found.', 404); T.remove('revenue_records', rid); log('delete', 'revenue', rid, old); return ok(); });

  // =============================================================== transactions & cash flow
  add('GET', '/transactions', 'finance', ({ q }) => {
    const funds = new Map(T.all('funds').map(f => [f.id, f.name])), sess = new Map(T.all('sessions').map(x => [x.id, x.name])), qq = (q.q || '').toLowerCase(), out = [];
    for (const e of E.ledger()) {
      if (q.start && e.date < q.start) continue; if (q.end && e.date > q.end) continue;
      if (['in', 'out', 'internal'].includes(q.type) && e.direction !== q.type) continue;
      if (q.category && e.category !== q.category) continue;
      if (q.session_id && String(e.session_id || '') !== q.session_id) continue;
      if (q.fund_id && ![String(e.fund_id || ''), String(e.fund_to || '')].includes(q.fund_id)) continue;
      if (qq && !(e.description || '').toLowerCase().includes(qq) && !e.category.toLowerCase().includes(qq) && !(e.code || '').toLowerCase().includes(qq)) continue;
      out.push({ date: e.date, direction: e.direction, type: e.type, category: e.category, amount: e.amount, description: e.description, ref: e.ref, session_id: e.session_id, session: sess.get(e.session_id) || null, code: e.code,
        fund: funds.get(e.fund_id) || null, fund_to: funds.get(e.fund_to) || null, npd_cash: e.npd_cash, payment_method: e.payment_method || null, receipt: e.receipt || null, notes: e.notes || null, created_by: e.created_by || null, created_at: e.created_at || null,
        editable: !!e.entity, entity: e.entity || null, entity_id: e.entity_id || null });
    }
    out.sort((a, b) => (a.date + a.ref < b.date + b.ref ? 1 : -1));
    const cats = [...new Set(out.map(x => x.category))].sort(), [, size, off] = pageArgs(q, 25), cash = out.filter(x => (x.direction === 'in' || x.direction === 'out') && x.npd_cash);
    return ok({ transactions: out.slice(off, off + size), total: out.length, cash_in: sum(cash.filter(x => x.direction === 'in'), x => x.amount), cash_out: sum(cash.filter(x => x.direction === 'out'), x => x.amount),
      personal_funded: sum(out.filter(x => x.direction === 'out' && !x.npd_cash), x => x.amount), internal: sum(out.filter(x => x.direction === 'internal'), x => x.amount), categories: cats });
  });
  add('GET', '/cashflow', 'finance', ({ q }) => ok(E.cashflow(q.start || '2000-01-01', q.end || today())));

  // =============================================================== funds
  function fundTxRows() {
    return sortBy(T.all('fund_transactions').filter(x => T.get('funds', x.to_fund_id)), 'txn_date', 'id').reverse().map(ft => {
      const ff = ft.from_fund_id ? T.get('funds', ft.from_fund_id) : null, tf = T.get('funds', ft.to_fund_id), e = ft.expense_id ? T.get('expenses', ft.expense_id) : null;
      return Object.assign({}, ft, { from_name: ff ? ff.name : null, to_name: tf.name, expense_code: e ? e.code : null, expense_desc: e ? e.description : null });
    });
  }
  add('GET', '/funds', 'finance', () => {
    const t = today(), ev = E.ledger(), summ = E.fundSummary('2000-01-01', t, ev); summ.forEach(f => { f.balance = f.closing; });
    const reimb = sortBy(T.all('expenses').filter(e => { const f = T.get('funds', e.source_fund_id); return f && f.kind === 'personal'; }), 'txn_date').reverse().map(e => { const f = T.get('funds', e.source_fund_id), rb = reimbursedOf(e.id);
      return { id: e.id, code: e.code, txn_date: e.txn_date, description: e.description, amount: e.amount, source_fund_id: e.source_fund_id, fund: f.name, reimbursed: rb, outstanding: e.amount - rb }; });
    const allocs = T.all('profit_sharing').filter(p => p.status === 'Calculated' || p.status === 'Paid').sort((a, b) => ((b.allocation_date || b.period_end) < (a.allocation_date || a.period_end) ? -1 : 1)).map(p => pick(p, ['code', 'label', 'allocation_date', 'period_start', 'period_end', 'saving_pct', 'saving_amount', 'petty_pct', 'petty_amount', 'status']));
    return ok({ funds: summ, transactions: fundTxRows(), reimbursable: reimb, allocations: allocs, total_npd: sum(summ.filter(f => f.kind === 'npd'), f => f.balance), owed_personal: sum(summ.filter(f => f.kind === 'personal'), f => Math.max(0, -f.balance)),
      default_saving_pct: Number(T.setting('default_saving_pct', '10')), default_petty_pct: Number(T.setting('default_petty_pct', '5')) });
  });
  add('GET', '/funds/<int:fid>/ledger', 'finance', ({ q }, fid) => {
    const f = T.get('funds', fid); if (!f) throw new ApiError('Fund not found.', 404);
    const start = q.start || '2000-01-01', end = q.end || today(); let bal = f.opening_balance; const lines = [];
    sortBy(E.ledger(), 'date', 'ref').forEach(e => E.effects(e).forEach(([x, amt]) => { if (x !== fid) return; bal += amt; if (e.date >= start && e.date <= end) lines.push({ date: e.date, type: e.type, category: e.category, description: e.description, code: e.code, amount: amt, balance: bal }); }));
    return ok({ fund: f, lines: lines.reverse(), closing: bal });
  });
  add('PUT', '/funds/<int:fid>', 'settings', ({ body: d }, fid) => {
    const f = T.get('funds', fid); if (!f) throw new ApiError('Fund not found.', 404);
    const ob = i(d, 'opening_balance', true, -1e11, 1e11, null, 'Opening balance'); T.update('funds', fid, { opening_balance: ob }); log('update', 'fund', fid, { name: f.name, old: f.opening_balance, new: ob }); return ok();
  });
  function ftVals(d, ex = {}) {
    const kind = ex.kind || oneOf(d, 'kind', ['transfer', 'contribution', 'reimbursement'], null, 'Type'); if (!kind) throw new ApiError('Type is required.');
    const amount = i(d, 'amount', true, 1, 1e11, null, 'Amount');
    const v = { kind, amount, txn_date: dt(d, 'txn_date', false, 'Date') || today(), notes: s(d, 'notes', false, 300), from_fund_id: null, expense_id: null };
    const to = fundOf(i(d, 'to_fund_id', true, 1, 1e11, null, 'Destination fund'), 'Destination fund'); v.to_fund_id = to.id; let frm = null;
    if (kind === 'transfer' || kind === 'reimbursement') { frm = fundOf(i(d, 'from_fund_id', true, 1, 1e11, null, 'Source fund'), 'Source fund'); if (frm.kind !== 'npd') throw new ApiError('Only NPD funds (Operational Saving, Petty Cash) can pay out here.'); v.from_fund_id = frm.id; }
    if (kind === 'transfer') { if (to.kind !== 'npd') throw new ApiError('Transfers move money between NPD funds only.'); if (frm.id === to.id) throw new ApiError('Choose two different funds.'); }
    else if (to.kind !== 'personal') throw new ApiError('Choose a personal fund (Sabit or Julio).');
    if (kind === 'reimbursement') {
      const eid = i(d, 'expense_id', true, 1, 1e11, null, 'Original expense'), e = T.get('expenses', eid);
      if (!e || e.source_fund_id !== to.id) throw new ApiError('Pick an expense that was paid from that personal fund.');
      const other = sum(T.all('fund_transactions').filter(x => x.expense_id === eid && x.kind === 'reimbursement' && x.id !== (ex.id || 0)), x => x.amount);
      if (amount > e.amount - other) throw new ApiError(`Only ${rp(e.amount - other)} of this expense is still unreimbursed.`, 409, { code: 'over_reimburse' });
      v.expense_id = eid;
    }
    if (frm) checkOverdraw(frm, amount, v.txn_date, ex.id ? 'ft' + ex.id : null, truthy(d.force));
    return v;
  }
  add('POST', '/fund-transactions', 'finance', ({ body: d }) => { const v = ftVals(d), code = T.nextCode('fund_transactions', 'code', 'FT-', 5); const r = T.insert('fund_transactions', Object.assign({ code, created_by: uname(), is_demo: 0 }, v)); log('create', 'fund_transaction', r.id, Object.assign({ code }, v)); return ok({ id: r.id, code }); }, true);
  add('PUT', '/fund-transactions/<int:tid>', 'finance', ({ body: d }, tid) => { const old = T.get('fund_transactions', tid); if (!old) throw new ApiError('Record not found.', 404); const v = ftVals(Object.assign({}, old, d), old), oc = Object.assign({}, old); T.update('fund_transactions', tid, v); log('update', 'fund_transaction', tid, { old: oc, new: v }); return ok(); });
  add('DELETE', '/fund-transactions/<int:tid>', 'finance', (c, tid) => { const old = T.get('fund_transactions', tid); if (!old) throw new ApiError('Record not found.', 404); T.remove('fund_transactions', tid); log('delete', 'fund_transaction', tid, old); return ok(); });

  // =============================================================== photographers
  const photoSessions = (pid, start, end) => E.computeSessions(start, end).filter(x => x.photographer_id === pid && x.photo_mode !== 'none');
  add('GET', '/photographers/overview', 'finance', () => {
    const res = sortBy(T.all('photographers'), 'id').map(p => {
      const ss = photoSessions(p.id), pays = T.all('photographer_payments').filter(x => x.photographer_id === p.id);
      const paid = sum(pays.filter(x => x.status === 'Paid'), x => x.amount), pend = sum(pays.filter(x => x.status === 'Pending'), x => x.amount), share = sum(ss, x => x.photographer_share);
      return Object.assign({}, p, { sessions: ss.length, photo_revenue: sum(ss, x => x.photo_revenue), npd_share: sum(ss, x => x.npd_photo_share), photographer_share: share, paid, scheduled: pend, outstanding: share - paid, status: share - paid <= 0 && share > 0 ? 'Paid' : share ? 'Pending' : '—' });
    });
    const tot = {}; ['photo_revenue', 'npd_share', 'photographer_share', 'paid', 'outstanding'].forEach(k => { tot[k] = sum(res, r => r[k]); });
    return ok({ photographers: res, totals: tot });
  });
  add('GET', '/photographers/<int:pid>/statement', 'finance', ({ q }, pid) => {
    const p = T.get('photographers', pid); if (!p) throw new ApiError('Photographer not found.', 404);
    const ss = photoSessions(pid, q.start || null, q.end || null);
    const pays = T.all('photographer_payments').filter(x => x.photographer_id === pid).sort((a, b) => ((b.paid_date || b.created_at) < (a.paid_date || a.created_at) ? -1 : 1)).map(x => Object.assign({}, x, { session_name: x.session_id && T.get('sessions', x.session_id) ? T.get('sessions', x.session_id).name : null }));
    const rows = ss.map(x => pick(x, ['id', 'name', 'event_date', 'photo_mode', 'photo_participants', 'photo_revenue', 'npd_photo_share', 'photographer_share', 'photographer_paid', 'photographer_outstanding', 'npd_share_pct', 'photo_fee']));
    const paidTotal = sum(pays.filter(x => x.status === 'Paid'), x => x.amount), share = sum(ss, x => x.photographer_share);
    return ok({ photographer: p, sessions: rows, payments: pays, totals: { photo_revenue: sum(ss, x => x.photo_revenue), npd_share: sum(ss, x => x.npd_photo_share), photographer_share: share, paid: paidTotal, outstanding: share - paidTotal } });
  });
  function payVals(d, ex = {}) {
    const pid = i(d, 'photographer_id', !ex.id, 1, 1e11, null, 'Photographer') || ex.photographer_id, amount = i(d, 'amount', true, 1, 1e11, null, 'Amount');
    const status = oneOf(d, 'status', ['Pending', 'Paid'], 'Paid'), sid = i(d, 'session_id', false, 1); let paidDate = dt(d, 'paid_date', false, 'Payment date');
    if (status === 'Paid') {
      paidDate = paidDate || today();
      const owed = sum(photoSessions(pid), x => x.photographer_share), already = sum(T.all('photographer_payments').filter(x => x.photographer_id === pid && x.status === 'Paid' && x.id !== (ex.id || 0)), x => x.amount);
      if (already + amount > owed && !d.force) throw new ApiError(`This payment exceeds the outstanding balance (${rp(owed - already)}).`, 409, { code: 'overpay' });
    } else paidDate = null;
    const fundId = i(d, 'fund_id', false, 1);
    if (fundId) { const fund = fundOf(fundId, 'Fund'); if (status === 'Paid') checkOverdraw(fund, amount, paidDate, ex.id ? 'pp' + ex.id : null, truthy(d.force_fund)); }
    return { photographer_id: pid, session_id: sid, amount, status, paid_date: paidDate, fund_id: fundId, payment_method: oneOf(d, 'payment_method', METHODS, 'Bank Transfer'), notes: s(d, 'notes', false, 300) };
  }
  add('POST', '/photographer-payments', 'finance', ({ body: d }) => { const v = payVals(d), code = T.nextCode('photographer_payments', 'code', 'PAY-', 5); const r = T.insert('photographer_payments', Object.assign({ code, created_by: uname(), is_demo: 0 }, v)); log('create', 'photographer_payment', r.id, Object.assign({ code }, v)); return ok({ id: r.id, code }); }, true);
  add('PUT', '/photographer-payments/<int:pid>', 'finance', ({ body: d }, pid) => { const old = T.get('photographer_payments', pid); if (!old) throw new ApiError('Payment not found.', 404); const v = payVals(Object.assign({}, old, d), old), oc = Object.assign({}, old); T.update('photographer_payments', pid, v); log('update', 'photographer_payment', pid, { old: oc, new: v }); return ok(); });
  add('DELETE', '/photographer-payments/<int:pid>', 'finance', (c, pid) => { const old = T.get('photographer_payments', pid); if (!old) throw new ApiError('Payment not found.', 404); T.remove('photographer_payments', pid); log('delete', 'photographer_payment', pid, old); return ok(); });

  // =============================================================== profit sharing
  const psList = () => sortBy(T.all('profit_sharing'), 'period_start', 'id').reverse().map(r => Object.assign({}, r, { lines: sortBy(T.all('profit_sharing_lines').filter(l => l.profit_sharing_id === r.id), 'id') }));
  const conflict409 = fn => { try { return fn(); } catch (e) { if (e instanceof NPDB.ValueErr) throw new ApiError(e.message, 409); throw e; } };
  add('GET', '/profit-sharing', 'finance', () => {
    const recs = psList(), per = {};
    recs.filter(r => r.status !== 'Pending').forEach(r => r.lines.forEach(l => { const x = per[l.organizer_name] = per[l.organizer_name] || { name: l.organizer_name, allocated: 0, paid: 0 }; x.allocated += l.amount; x.paid += l.paid ? l.amount : 0; }));
    Object.values(per).forEach(x => { x.outstanding = x.allocated - x.paid; });
    const conf = recs.filter(r => r.status !== 'Pending');
    return ok({ records: recs, organizers: Object.values(per), totals: { saving: sum(conf, r => r.saving_amount), petty: sum(conf, r => r.petty_amount), organizers: sum(conf, r => r.remaining_profit) },
      active_organizers: sortBy(T.all('organizers').filter(o => o.active), 'id').map(o => pick(o, ['id', 'name', 'share_pct'])), default_saving_pct: Number(T.setting('default_saving_pct', '10')), default_petty_pct: Number(T.setting('default_petty_pct', '5')) });
  });
  add('GET', '/profit-sharing/preview', 'finance', ({ q }) => {
    try { return ok(E.profitSharingPreview(dt(q, 'start', true), dt(q, 'end', true), pct(q, 'saving_pct', null, 'Operational Saving'), pct(q, 'petty_pct', null, 'Petty Cash'))); }
    catch (e) { if (e instanceof NPDB.ValueErr) throw new ApiError(e.message); throw e; }
  });
  add('POST', '/profit-sharing', 'finance', ({ body: d }) => conflict409(() => { const pid = E.createProfitSharing(dt(d, 'start', true), dt(d, 'end', true), pct(d, 'saving_pct', null, 'Operational Saving'), pct(d, 'petty_pct', null, 'Petty Cash'), s(d, 'label', false, 100), s(d, 'notes', false, 300), 0, uname()); log('create', 'profit_sharing', pid, d); return ok({ id: pid }); }), true);
  add('POST', '/profit-sharing/<int:pid>/recalculate', 'finance', (c, pid) => conflict409(() => { E.recalcProfitSharing(pid); log('recalculate', 'profit_sharing', pid); return ok(); }));
  add('POST', '/profit-sharing/<int:pid>/finalize', 'finance', (c, pid) => conflict409(() => { E.finalizeProfitSharing(pid); log('finalize', 'profit_sharing', pid); return ok(); }));
  add('POST', '/profit-sharing/lines/<int:lid>/pay', 'finance', ({ body: d }, lid) => conflict409(() => { const paid = !['0', 'false'].includes(String(d.paid === undefined ? true : d.paid).toLowerCase()); E.payOrganizerLine(lid, dt(d, 'paid_date', false), paid); log(paid ? 'pay' : 'unpay', 'profit_sharing_line', lid, d); return ok(); }));
  add('DELETE', '/profit-sharing/<int:pid>', 'finance', (c, pid) => {
    const r = T.get('profit_sharing', pid); if (!r) throw new ApiError('Record not found.', 404);
    if (T.all('profit_sharing_lines').some(l => l.profit_sharing_id === pid && l.paid)) throw new ApiError('Payments were already recorded. Mark them unpaid first.', 409);
    T.filter('profit_sharing_lines', l => l.profit_sharing_id === pid).forEach(l => T.remove('profit_sharing_lines', l.id)); T.remove('profit_sharing', pid); log('delete', 'profit_sharing', pid, r); return ok();
  });

  // =============================================================== dashboard
  function expenseBreakdown(start, end) { const by = {}; E.ledger().forEach(e => { if (e.type === 'Operational Expense' && e.date >= start && e.date <= end) by[e.category] = (by[e.category] || 0) + e.amount; }); return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })); }
  const ACT_FIN = new Set(['expense', 'photographer_payment', 'profit_sharing', 'fund_transaction', 'revenue']);
  function recentActivities(fin) {
    const out = [], logs = T.all('audit_logs').slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 150);
    for (const r of logs) {
      let dtl = {}; try { dtl = r.detail ? JSON.parse(r.detail) : {}; } catch (e) { dtl = {}; } if (!dtl || typeof dtl !== 'object') dtl = {};
      const act_ = r.action, ent = r.entity; let text = null, link = null; if (ACT_FIN.has(ent) && !fin) continue; const nw = dtl.new && typeof dtl.new === 'object' ? dtl.new : {};
      if (act_ === 'create' && ent === 'session') { text = `New session created: ${dtl.name || ''}`; link = `#/sessions/${r.entity_id}`; }
      else if (act_ === 'create' && ent === 'member') { text = `New member registered: ${dtl.nickname || dtl.code || ''}`; link = `#/members/${r.entity_id}`; }
      else if (act_ === 'register' && ent === 'participant') { if (!fin) continue; text = `Participant registered (${dtl.member || ''})`; link = `#/sessions/${dtl.session || ''}`; }
      else if (act_ === 'update' && ent === 'participant' && fin && ['Paid', 'Partially Refunded', 'Refunded'].includes(nw.payment_status)) text = `Participant payment recorded (${nw.payment_status})`;
      else if (act_ === 'create' && ent === 'expense') { text = `Operational expense recorded: ${dtl.description || ''}`; link = '#/expenses'; }
      else if (act_ === 'finalize' && ent === 'profit_sharing') { text = 'Profit allocation completed'; link = '#/profit/organizers'; }
      else if (act_ === 'create' && ent === 'photographer_payment') { text = 'Photographer payment recorded'; link = '#/profit/photographers'; }
      else if (act_ === 'create' && ent === 'fund_transaction') { text = { transfer: 'Fund transfer recorded', contribution: 'Personal funding recorded', reimbursement: 'Reimbursement recorded' }[dtl.kind] || 'Fund movement recorded'; link = '#/profit/funds'; }
      else if (act_ === 'create' && ent === 'revenue') { text = `Revenue recorded: ${dtl.description || ''}`; link = '#/revenue'; }
      if (text) out.push({ text, at: r.created_at, by: r.username, link }); if (out.length >= 10) break;
    }
    return out;
  }
  add('GET', '/dashboard', 'view', ({ q }) => {
    const fin = has('finance'), now = new Date(), start = q.start || NPDB.isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end = q.end || today();
    const ps = E.periodSummary(start, end), sess = ps.sessions;
    const up = E.computeSessions(today(), null, null, null, null, true).filter(x => ['Open Registration', 'Full', 'Draft'].includes(x.status)).slice(0, 6);
    const light = x => pick(x, ['id', 'session_code', 'name', 'sport', 'sport_color', 'venue', 'event_date', 'start_time', 'end_time', 'status', 'registered', 'max_participants']);
    const upcomingN = T.all('sessions').filter(x => x.event_date >= today() && ['Draft', 'Open Registration', 'Full'].includes(x.status)).length, membersN = T.all('members').filter(m => m.active).length;
    const out = { range: { start, end }, upcoming: up.map(light),
      latest_completed: sortBy(E.computeSessions(null, today()).filter(x => x.status === 'Completed'), 'event_date').reverse().slice(0, 5).map(x => Object.assign(light(x), fin ? { net_profit: x.net_profit } : {})),
      kpis: { sessions: ps.session_count, completed: ps.completed_count, participants: ps.participants_paid, registered: ps.participants_registered, upcoming_sessions: upcomingN, members_total: membersN }, recent_activities: recentActivities(fin) };
    const mem = {}; const sm = new Map(T.all('sessions').map(x => [x.id, x]));
    T.all('session_participants').forEach(sp => { const s_ = sm.get(sp.session_id), m = T.get('members', sp.member_id); if (!s_ || !m || sp.payment_status === 'Cancelled' || s_.status === 'Draft' || s_.event_date < start || s_.event_date > end) return; (mem[m.id] = mem[m.id] || { nickname: m.nickname, member_code: m.member_code, joined: 0 }).joined++; });
    out.top_members = Object.values(mem).sort((a, b) => b.joined - a.joined || (a.nickname < b.nickname ? -1 : 1)).slice(0, 5);
    if (fin) {
      Object.assign(out.kpis, { revenue: ps.organizer_revenue, expenses: ps.total_expenses, profit: ps.net_profit, cash_collected: ps.net_collected, photographer_share: ps.photographer_share, receivable: ps.receivable, total_cash_balance: E.totalCashBalance(today()),
        funds: E.fundSummary('2000-01-01', today()).map(f => ({ name: f.name, balance: f.closing, kind: f.kind })) });
      out.expense_breakdown = expenseBreakdown(start, end); out.series = E.monthlySeries(start, end);
      const by = {}; sess.forEach(x => { const b = by[x.sport] = by[x.sport] || { sport: x.sport, color: x.sport_color, revenue: 0, profit: 0, sessions: 0 }; b.revenue += x.organizer_revenue; b.profit += x.net_profit; b.sessions++; });
      out.by_sport = Object.values(by).sort((a, b) => b.revenue - a.revenue);
      const done = sess.filter(x => x.status === 'Completed'), pf = x => pick(x, ['id', 'name', 'sport', 'event_date', 'net_profit']);
      out.performance = { best: sortBy(done, x => -x.net_profit).slice(0, 5).map(pf), worst: sortBy(done, 'net_profit').slice(0, 5).map(pf), avg_profit: done.length ? rnd(sum(done, x => x.net_profit) / done.length) : 0, count: done.length };
      out.recent_transactions = E.cashEvents().sort((a, b) => (a[0] + a[5] < b[0] + b[5] ? 1 : -1)).slice(0, 8).map(e => ({ date: e[0], direction: e[1], category: e[2], amount: e[3], description: e[4] }));
      out.recent_expenses = sortBy(T.all('expenses'), 'txn_date', 'id').reverse().slice(0, 5).map(x => pick(x, ['code', 'txn_date', 'category', 'description', 'amount']));
    }
    return ok(out);
  });

  NPDB.fin = { checkOverdraw, filters, rp, truthy, uname };
})(typeof window !== 'undefined' ? window : globalThis);
