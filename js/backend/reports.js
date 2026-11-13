'use strict';
/* NPD backend (in-browser) – 28 reports, bundles and exports (CSV, Excel .xlsx, print-to-PDF). No libraries. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, E = NPDB.engine, R = NPDB.router, { ApiError, sortBy, sum, rnd, today, isoDate, addDays } = NPDB;
  const { add, ok, has, log } = R;
  const GROUPS = ['Business Performance', 'Session Reports', 'Financial Reports', 'Photography Reports', 'Profit Allocation Reports', 'Member Reports'];
  const CATALOG = [
    ['Business Performance', 'overall', 'Overall Business Performance'], ['Business Performance', 'monthly', 'Monthly Business Performance'], ['Business Performance', 'annual', 'Annual Business Performance'],
    ['Business Performance', 'rev_vs_exp', 'Revenue vs. Operational Expenses'], ['Business Performance', 'net_profit', 'Net Business Profit'],
    ['Session Reports', 'session_profit', 'Session Profitability'], ['Session Reports', 'session_revenue', 'Session Revenue'], ['Session Reports', 'attendance', 'Participant Attendance'],
    ['Session Reports', 'by_sport', 'Revenue by Sport'], ['Session Reports', 'venue', 'Venue Performance'],
    ['Financial Reports', 'revenue_breakdown', 'Revenue Breakdown'], ['Financial Reports', 'expense_breakdown', 'Operational Expense Breakdown'], ['Financial Reports', 'cashflow', 'Cash Flow'],
    ['Financial Reports', 'fund_balance', 'Fund Balance Report'], ['Financial Reports', 'source_of_fund', 'Source of Fund Report'], ['Financial Reports', 'receivables_payables', 'Receivables and Payables'],
    ['Photography Reports', 'photo_sessions', 'Photography Revenue, NPD Share & Photographer Share'], ['Photography Reports', 'photo_payables', 'Outstanding Photographer Payables'], ['Photography Reports', 'photo_payments', 'Photographer Payment History'],
    ['Profit Allocation Reports', 'alloc_saving', 'Operational Saving Allocation'], ['Profit Allocation Reports', 'alloc_petty', 'Petty Cash Allocation'], ['Profit Allocation Reports', 'dist_sabit', 'Sabit Profit Distribution'],
    ['Profit Allocation Reports', 'dist_julio', 'Julio Profit Distribution'], ['Profit Allocation Reports', 'alloc_history', 'Historical Profit Allocation'],
    ['Member Reports', 'members', 'Member Participation'], ['Member Reports', 'member_activity', 'Member Activity'], ['Member Reports', 'top_spending', 'Top Spending Members'], ['Member Reports', 'most_active', 'Most Active Members'],
  ];
  const TITLES = Object.fromEntries(CATALOG.map(([, k, t]) => [k, t]));
  const NON_FIN = new Set(['attendance', 'members', 'member_activity', 'most_active']), FIN = new Set(Object.keys(TITLES).filter(k => !NON_FIN.has(k)));
  const BUNDLES = {
    business_summary: { title: 'Business Performance Summary', keys: ['overall', 'monthly'] },
    financial: { title: 'Financial Report', keys: ['overall', 'revenue_breakdown', 'expense_breakdown', 'cashflow', 'fund_balance', 'source_of_fund'] },
    session_performance: { title: 'Session Performance Report', keys: ['session_profit', 'attendance'] },
    member_activity: { title: 'Member Activity Report', keys: ['member_activity'] },
    complete: { title: 'Complete Business Report', keys: ['overall', 'monthly', 'session_profit', 'revenue_breakdown', 'expense_breakdown', 'cashflow', 'fund_balance', 'receivables_payables', 'photo_sessions', 'alloc_history', 'member_activity'] },
  };
  const C = (key, label, type = 'text') => ({ key, label, type });
  const totals = (cols, rows, keys) => Object.fromEntries(cols.filter(c => keys.has ? keys.has(c.key) : keys.includes(c.key)).map(c => [c.key, sum(rows, r => r[c.key] || 0)]));
  const rp = n => (n < 0 ? '-' : '') + 'Rp' + Math.abs(n).toLocaleString('de-DE');
  const S = a => new Set(a), r1 = n => Math.round(n * 10) / 10;

  function build(key, f) {
    const x = { start: f.start || '2000-01-01', end: f.end || '2100-12-31', sport: f.sport_id || null, venue: f.venue_id || null, sess: f.session_id || null, member: f.member_id || null, category: f.category || null, fund: f.fund_id || null };
    const out = B[key](x); out.title = TITLES[key]; out.key = key; out.filters = { start: f.start || null, end: f.end || null }; return out;
  }
  const monthRows = (start, end) => E.monthsBetween(start, end).map(ym => { const [a, b] = E.monthRange(ym), ps = E.periodSummary(a, b);
    return { month: ym, sessions: ps.session_count, participants: ps.participants_paid, collected: ps.net_collected, photographer: ps.photographer_share, revenue: ps.organizer_revenue, expenses: ps.total_expenses, profit: ps.net_profit }; });
  const MCOLS = [C('month', 'Month'), C('sessions', 'Sessions', 'int'), C('participants', 'Paid Participants', 'int'), C('collected', 'Cash Collected', 'money'), C('photographer', 'Photographer Share', 'money'), C('revenue', 'Business Revenue', 'money'), C('expenses', 'Operational Expenses', 'money'), C('profit', 'Net Profit', 'money')];
  const MSUM = S(['sessions', 'participants', 'collected', 'photographer', 'revenue', 'expenses', 'profit']);
  function rangeMonths(x, n = 6) {
    let start = x.start, end = x.end; if (end === '2100-12-31') end = today();
    if (start === '2000-01-01') { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1)); start = isoDate(d); }
    return [start, end];
  }
  const SC = [C('session_code', 'Session ID'), C('event_date', 'Date', 'date'), C('name', 'Session'), C('sport', 'Sport'), C('venue', 'Venue'), C('status', 'Status'), C('paid_count', 'Paid', 'int'), C('attended', 'Attended', 'int'),
    C('net_collected', 'Cash Retained', 'money'), C('photographer_share', 'Photographer Share', 'money'), C('npd_photo_share', 'NPD Photo Share', 'money'), C('organizer_revenue', 'Business Revenue', 'money'),
    C('venue_cost', 'Venue Cost', 'money'), C('other_expenses', 'Other Expenses', 'money'), C('net_profit', 'Net Profit', 'money')];
  const sess = x => E.computeSessions(x.start, x.end, x.sport, x.venue, x.sess);
  function group(x, keyname, label) {
    const gm = {};
    sess(x).forEach(s => { const r = gm[s[keyname]] = gm[s[keyname]] || { name: s[keyname], sessions: 0, participants: 0, collected: 0, photographer: 0, revenue: 0, expenses: 0, profit: 0 };
      r.sessions++; r.participants += s.paid_count; r.collected += s.net_collected; r.photographer += s.photographer_share; r.revenue += s.organizer_revenue; r.expenses += s.total_expenses; r.profit += s.net_profit; });
    const r = Object.values(gm).sort((a, b) => b.profit - a.profit); r.forEach(v => { v.avg_profit = v.sessions ? rnd(v.profit / v.sessions) : 0; });
    const cols = [C('name', label), C('sessions', 'Sessions', 'int'), C('participants', 'Paid Participants', 'int'), C('collected', 'Cash Retained', 'money'), C('photographer', 'Photographer Share', 'money'), C('revenue', 'Business Revenue', 'money'), C('expenses', 'Operational Expenses', 'money'), C('profit', 'Net Profit', 'money'), C('avg_profit', 'Avg Profit / Session', 'money')];
    return { columns: cols, rows: r, totals: totals(cols, r, S(['sessions', 'participants', 'collected', 'photographer', 'revenue', 'expenses', 'profit'])) };
  }
  function opEvents(x, incPh) {
    const funds = new Map(T.all('funds').map(f => [f.id, f.name])), sm = new Map(T.all('sessions').map(s => [s.id, s])), out = [];
    for (const e of E.ledger()) {
      if (e.type !== 'Operational Expense' && !(incPh && e.type === 'Photographer Payment')) continue;
      if (e.date < x.start || e.date > x.end) continue; if (x.category && e.category !== x.category) continue;
      if (x.fund && String(e.fund_id || '') !== String(x.fund)) continue; const s = sm.get(e.session_id);
      if (x.sess && String(e.session_id || '') !== String(x.sess)) continue;
      if (x.sport && (!s || String(s.sport_id) !== String(x.sport))) continue; if (x.venue && (!s || String(s.venue_id) !== String(x.venue))) continue;
      out.push(Object.assign({}, e, { fund_name: funds.get(e.fund_id) || 'Business cash', session_name: s ? s.name : null }));
    }
    return out;
  }
  const endOr = x => (x.end !== '2100-12-31' ? x.end : today());
  const allocRecords = x => sortBy(T.all('profit_sharing').filter(p => p.period_end >= x.start && p.period_start <= x.end), 'period_start', 'id').reverse().map(r => Object.assign({}, r, { lines: sortBy(T.all('profit_sharing_lines').filter(l => l.profit_sharing_id === r.id), 'id') }));
  function allocFund(x, which) {
    const k = which === 'saving' ? 'saving' : 'petty';
    const r = allocRecords(x).map(v => ({ code: v.code, label: v.label, period_start: v.period_start, period_end: v.period_end, profit: v.eligible_profit, pct: v[k + '_pct'], amount: v[k + '_amount'], date: v.allocation_date, status: v.status }));
    const cols = [C('code', 'Allocation ID'), C('label', 'Period'), C('profit', 'Total Business Profit', 'money'), C('pct', 'Percentage', 'pct'), C('amount', 'Amount Allocated', 'money'), C('date', 'Allocation Date', 'date'), C('status', 'Status')];
    return { columns: cols, rows: r, totals: totals(cols, r.filter(v => v.status !== 'Pending'), S(['profit', 'amount'])) };
  }
  function dist(x, name) {
    const r = []; allocRecords(x).forEach(rec => rec.lines.forEach(l => { if (l.organizer_name.toLowerCase() === name.toLowerCase()) r.push({ code: rec.code, label: rec.label, remaining: rec.remaining_profit, pct: l.pct, amount: l.amount, alloc_status: rec.status, payment: l.paid ? 'Paid' : 'Unpaid', paid_date: l.paid_date }); }));
    const cols = [C('code', 'Allocation ID'), C('label', 'Period'), C('remaining', 'Remaining Organizer Profit', 'money'), C('pct', 'Share %', 'pct'), C('amount', name + ' Distribution', 'money'), C('alloc_status', 'Allocation Status'), C('payment', 'Payment'), C('paid_date', 'Payment Date', 'date')];
    return { columns: cols, rows: r, totals: totals(cols, r.filter(v => v.alloc_status !== 'Pending'), S(['amount'])) };
  }
  function memberRows(x) {
    const sm = new Map(T.all('sessions').map(s => [s.id, s])), mm = new Map(T.all('members').map(m => [m.id, m])), by = new Map();
    T.all('session_participants').forEach(sp => {
      const s = sm.get(sp.session_id), m = mm.get(sp.member_id); if (!s || !m || sp.payment_status === 'Cancelled') return;
      if (s.event_date < x.start || s.event_date > x.end) return; if (x.sport && s.sport_id != x.sport) return; if (x.venue && s.venue_id != x.venue) return; if (x.sess && s.id != x.sess) return; if (x.member && m.id != x.member) return;
      const r = by.get(m.id) || { member_code: m.member_code, reclub_id: m.reclub_id, nickname: m.nickname, joined: 0, paid: 0, attended: 0, _sp: new Set(), spend: 0, first_date: s.event_date, last_date: s.event_date };
      r.joined++; if (['Paid', 'Partially Refunded'].includes(sp.payment_status)) r.paid++; if (sp.attendance === 'Attended') r.attended++; r._sp.add(s.sport_id);
      if (['Paid', 'Partially Refunded', 'Refunded'].includes(sp.payment_status)) r.spend += (sp.amount_paid || 0) - (sp.payment_status === 'Refunded' && !sp.refund_amount ? (sp.amount_paid || 0) : (sp.refund_amount || 0));
      if (s.event_date < r.first_date) r.first_date = s.event_date; if (s.event_date > r.last_date) r.last_date = s.event_date; by.set(m.id, r);
    });
    return [...by.values()].map(r => { r.sports = r._sp.size; delete r._sp; const months = Math.max(1, (new Date(r.last_date) - new Date(r.first_date)) / 864e5 / 30.4); r.freq = r1(r.joined / months); return r; });
  }
  const MEMC = [C('member_code', 'Member ID'), C('reclub_id', 'Reclub ID'), C('nickname', 'Nickname'), C('joined', 'Sessions Joined', 'int'), C('paid', 'Sessions Paid', 'int'), C('attended', 'Attended', 'int'), C('sports', 'Sports Played', 'int'), C('spend', 'Total Spending', 'money'), C('last_date', 'Last Participation', 'date')];
  const by2 = (f1, f2) => (a, b) => (f1(b) - f1(a)) || (f2 ? f2(b) - f2(a) : 0);

  const B = {
    overall(x) {
      const ps = E.periodSummary(x.start, x.end, x.sport, x.venue, x.sess), venueCost = sum(ps.sessions, s => s.venue_cost);
      const L = (section, item, amount) => ({ section, item, amount }), sp = Number(T.setting('default_saving_pct', '10')), pp = Number(T.setting('default_petty_pct', '5'));
      let saving = 0, petty = 0, remaining = 0; try { [saving, petty, remaining] = E.allocate(ps.net_profit, sp, pp, T.all('organizers').filter(o => o.active)); } catch (e) { if (!(e instanceof E.ValueErr)) throw e; }
      return { columns: [C('section', 'Section'), C('item', 'Item'), C('amount', 'Amount', 'money')], totals: {}, rows: [
        L('Cash', 'Gross cash collected from participants', ps.gross_collected), L('Cash', 'Less: refunds', -ps.refunds), L('Cash', 'Net cash retained (incl. photographer share)', ps.net_collected - ps.other_revenue),
        L('Cash', 'Outstanding receivables (waiting for payment)', ps.receivable), L('Liability', 'Photographer share (payable – not NPD revenue)', ps.photographer_share),
        L('Revenue', 'Session fee revenue (excl. photography)', ps.session_fee_revenue), L('Revenue', 'NPD photography share', ps.npd_photo_share), L('Revenue', 'Other revenue', ps.other_revenue), L('Revenue', 'Total business revenue', ps.organizer_revenue),
        L('Operational Expenses', 'Venue rental (sessions)', venueCost), L('Operational Expenses', 'Other session operational expenses', ps.session_expenses - venueCost),
        L('Operational Expenses', 'General business operational expenses', ps.general_expenses), L('Operational Expenses', 'Total operational expenses', ps.total_expenses), L('Profit', 'Net business profit', ps.net_profit),
        L('Allocation', `Operational Saving at default ${sp}% (indicative)`, saving), L('Allocation', `Petty Cash at default ${pp}% (indicative)`, petty), L('Allocation', 'Remaining organizer profit (indicative)', remaining)] };
    },
    monthly(x) { const r = monthRows(...rangeMonths(x)); return { columns: MCOLS, rows: r, totals: totals(MCOLS, r, MSUM) }; },
    annual(x) { const y = x.start !== '2000-01-01' ? x.start.slice(0, 4) : String(new Date().getFullYear()), r = monthRows(`${y}-01-01`, `${y}-12-31`); return { columns: MCOLS, rows: r, totals: totals(MCOLS, r, MSUM) }; },
    rev_vs_exp(x) {
      const r = monthRows(...rangeMonths(x)); r.forEach(m => { m.diff = m.revenue - m.expenses; m.ratio = m.revenue ? r1(100 * m.expenses / m.revenue) : 0; });
      const cols = [C('month', 'Month'), C('revenue', 'Business Revenue', 'money'), C('expenses', 'Operational Expenses', 'money'), C('diff', 'Revenue – Expenses', 'money'), C('ratio', 'Expenses % of Revenue', 'pct')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['revenue', 'expenses', 'diff'])) };
    },
    net_profit(x) {
      const r = monthRows(...rangeMonths(x)); let cum = 0; r.forEach(m => { cum += m.profit; m.cumulative = cum; });
      const cols = [C('month', 'Month'), C('revenue', 'Business Revenue', 'money'), C('expenses', 'Operational Expenses', 'money'), C('profit', 'Net Business Profit', 'money'), C('cumulative', 'Cumulative Profit', 'money')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['revenue', 'expenses', 'profit'])) };
    },
    session_profit(x) { const r = sess(x); return { columns: SC, rows: r, totals: totals(SC, r, S(['paid_count', 'attended', 'net_collected', 'photographer_share', 'npd_photo_share', 'organizer_revenue', 'venue_cost', 'other_expenses', 'net_profit'])) }; },
    session_revenue(x) {
      const r = sess(x), cols = [C('session_code', 'Session ID'), C('event_date', 'Date', 'date'), C('name', 'Session'), C('sport', 'Sport'), C('paid_count', 'Paid', 'int'), C('gross_collected', 'Cash Collected', 'money'), C('refunds', 'Refunds', 'money'),
        C('organizer_session_fee', 'Session Fee Revenue', 'money'), C('photo_revenue', 'Photography Revenue', 'money'), C('npd_photo_share', 'NPD Photo Share', 'money'), C('photographer_share', 'Photographer Share (payable)', 'money'), C('organizer_revenue', 'Business Revenue', 'money'), C('receivable', 'Receivable', 'money')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['paid_count', 'gross_collected', 'refunds', 'organizer_session_fee', 'photo_revenue', 'npd_photo_share', 'photographer_share', 'organizer_revenue', 'receivable'])) };
    },
    attendance(x) {
      const r = sess(x); r.forEach(s => { s.absent = s.status === 'Completed' ? Math.max(0, s.paid_count - s.attended) : 0; s.rate = s.paid_count ? r1(100 * s.attended / s.paid_count) : 0; s.fill = s.max_participants ? r1(100 * s.registered / s.max_participants) : 0; });
      const cols = [C('event_date', 'Date', 'date'), C('name', 'Session'), C('sport', 'Sport'), C('venue', 'Venue'), C('status', 'Status'), C('max_participants', 'Capacity', 'int'), C('registered', 'Registered', 'int'), C('paid_count', 'Paid', 'int'), C('attended', 'Attended', 'int'), C('absent', 'Absent', 'int'), C('rate', 'Attendance %', 'pct'), C('fill', 'Capacity Fill %', 'pct')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['max_participants', 'registered', 'paid_count', 'attended', 'absent'])) };
    },
    by_sport: x => group(x, 'sport', 'Sport'), venue: x => group(x, 'venue', 'Venue'),
    revenue_breakdown(x) {
      const ps = E.periodSummary(x.start, x.end, x.sport, x.venue, x.sess), addon = sum(ps.sessions.filter(s => s.photo_mode === 'excluded'), s => s.photo_revenue), tot = ps.organizer_revenue;
      const mk = (category, amount, note) => ({ category, amount, pct: tot ? r1(100 * amount / tot) : 0, note });
      const r = [mk('Session Fee', ps.session_fee_revenue, 'Collected session fees excluding photography'), mk('Photography Add-on', 0, `${rp(addon)} collected as add-on is tracked separately – only NPD's share is revenue`),
        mk('NPD Photography Share', ps.npd_photo_share, "NPD's percentage of photography revenue"), mk('Other Revenue', ps.other_revenue, 'Manually recorded income'),
        { category: 'Photographer share (not revenue)', amount: 0, pct: 0, note: `${rp(ps.photographer_share)} owed to photographers (payable)` }];
      return { columns: [C('category', 'Revenue Category'), C('amount', 'Business Revenue', 'money'), C('pct', '% of Revenue', 'pct'), C('note', 'Treatment')], rows: r, totals: { amount: tot } };
    },
    expense_breakdown(x) {
      const names = sortBy(T.all('funds'), 'sort').map(f => f.name), by = {};
      opEvents(x).forEach(e => { const r = by[e.category] = by[e.category] || Object.assign({ category: e.category, total: 0 }, Object.fromEntries(names.map((n, i) => ['f' + i, 0]))); const i = names.indexOf(e.fund_name); if (i >= 0) r['f' + i] += e.amount; r.total += e.amount; });
      const r = Object.values(by).sort((a, b) => b.total - a.total), cols = [C('category', 'Category')].concat(names.map((n, i) => C('f' + i, n, 'money')), [C('total', 'Total', 'money')]);
      return { columns: cols, rows: r, totals: totals(cols, r, S(cols.slice(1).map(c => c.key))) };
    },
    source_of_fund(x) {
      const ev = opEvents(x, true).sort((a, b) => (a.fund_name + a.date < b.fund_name + b.date ? -1 : 1)), r = ev.map(e => ({ fund: e.fund_name, date: e.date, code: e.code || e.ref, type: e.type, category: e.category, description: e.description, session: e.session_name, payment_method: e.payment_method || null, amount: e.amount }));
      const cols = [C('fund', 'Source of Fund'), C('date', 'Date', 'date'), C('code', 'Transaction ID'), C('type', 'Type'), C('category', 'Category'), C('description', 'Description'), C('session', 'Session'), C('payment_method', 'Payment Method'), C('amount', 'Amount', 'money')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['amount'])) };
    },
    cashflow(x) {
      const cf = E.cashflow(x.start, x.end), r = cf.movements.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map(m => ({ date: m.date, type: m.type, category: m.category, description: m.description, fund: m.fund || 'Business cash', in: m.direction === 'in' ? m.amount : 0, out: m.direction === 'out' ? m.amount : 0 }));
      const cols = [C('date', 'Date', 'date'), C('type', 'Type'), C('category', 'Category'), C('description', 'Description'), C('fund', 'Source of Fund'), C('in', 'Cash In', 'money'), C('out', 'Cash Out', 'money')];
      const t = totals(cols, r, S(['in', 'out'])); t.description = `Opening ${rp(cf.opening)} → Closing ${rp(cf.closing)}`;
      return { columns: cols, rows: r, totals: t, summary: { opening: cf.opening, cash_in: cf.cash_in, cash_out: cf.cash_out, closing: cf.closing } };
    },
    fund_balance(x) {
      const r = E.fundSummary(x.start, endOr(x)).filter(f => !x.fund || String(f.id) === String(x.fund));
      r.forEach(f => { f.type = f.kind === 'npd' ? 'NPD-owned' : `Personal (${f.owner})`; f.status = f.overdrawn ? 'Overdrawn' : (f.kind === 'personal' && f.closing < 0 ? 'Owed to ' + f.owner : 'OK'); });
      const cols = [C('name', 'Fund'), C('type', 'Ownership'), C('opening', 'Opening', 'money'), C('allocations', 'Profit Allocation', 'money'), C('transfers_in', 'Transfers In', 'money'), C('contributions', 'Personal Funding', 'money'), C('reimbursements_in', 'Reimbursed', 'money'),
        C('expenses', 'Operational Expenses', 'money'), C('photographer_payments', 'Photographer Payments', 'money'), C('transfers_out', 'Transfers Out', 'money'), C('reimbursements_out', 'Reimbursements Paid', 'money'), C('closing', 'Closing Balance', 'money'), C('status', 'Status')];
      return { columns: cols, rows: r, totals: totals(cols, r.filter(f => f.kind === 'npd'), S(['opening', 'closing'])) };
    },
    receivables_payables(x) {
      const end = endOr(x), r = [], ss = E.computeSessions(null, end);
      ss.forEach(s => { if (s.receivable > 0) r.push({ kind: 'Receivable', party: s.name, detail: `Participants waiting for payment (${s.event_date})`, amount: s.receivable }); });
      T.all('photographers').forEach(p => { const owed = sum(ss.filter(s => s.photographer_id === p.id), s => s.photographer_share), paid = sum(T.all('photographer_payments').filter(q => q.photographer_id === p.id && q.status === 'Paid' && q.paid_date <= end), q => q.amount); if (owed - paid) r.push({ kind: 'Payable', party: p.name, detail: 'Photographer share not yet paid', amount: owed - paid }); });
      T.all('profit_sharing_lines').forEach(l => { const ps = T.get('profit_sharing', l.profit_sharing_id); if (ps && ['Calculated', 'Paid'].includes(ps.status) && !l.paid && l.amount > 0) r.push({ kind: 'Payable', party: l.organizer_name, detail: `Confirmed profit distribution – ${ps.label}`, amount: l.amount }); });
      E.fundSummary('2000-01-01', end).forEach(f => { if (f.kind === 'personal' && f.closing < 0) r.push({ kind: 'Payable', party: f.owner, detail: 'Business expenses paid personally – awaiting reimbursement', amount: -f.closing }); });
      const rec = sum(r.filter(v => v.kind === 'Receivable'), v => v.amount), pay = sum(r.filter(v => v.kind === 'Payable'), v => v.amount);
      return { columns: [C('kind', 'Type'), C('party', 'Party / Session'), C('detail', 'Details'), C('amount', 'Amount', 'money')], rows: r, totals: { amount: rec - pay, detail: `Receivables ${rp(rec)} – Payables ${rp(pay)}` } };
    },
    photo_sessions(x) {
      const r = sess(x).filter(s => s.photo_mode !== 'none'), cols = [C('event_date', 'Date', 'date'), C('name', 'Session'), C('photographer', 'Photographer'), C('photo_mode', 'Mode'), C('photo_participants', 'Photo Participants', 'int'), C('photo_revenue', 'Total Photography Revenue', 'money'),
        C('npd_photo_share', 'NPD Photography Share', 'money'), C('photographer_share', 'Photographer Share', 'money'), C('photographer_paid', 'Paid', 'money'), C('photographer_outstanding', 'Outstanding', 'money')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['photo_participants', 'photo_revenue', 'npd_photo_share', 'photographer_share', 'photographer_paid', 'photographer_outstanding'])) };
    },
    photo_payables(x) {
      const end = endOr(x), ss = E.computeSessions(null, end);
      const r = sortBy(T.all('photographers'), 'id').map(p => { const mine = ss.filter(s => s.photographer_id === p.id && s.photo_mode !== 'none'), share = sum(mine, s => s.photographer_share), paid = sum(T.all('photographer_payments').filter(q => q.photographer_id === p.id && q.status === 'Paid' && q.paid_date <= end), q => q.amount);
        return { name: p.name, sessions: mine.length, revenue: sum(mine, s => s.photo_revenue), npd: sum(mine, s => s.npd_photo_share), share, paid, outstanding: share - paid }; });
      const cols = [C('name', 'Photographer'), C('sessions', 'Sessions', 'int'), C('revenue', 'Photography Revenue', 'money'), C('npd', 'NPD Share', 'money'), C('share', 'Photographer Share', 'money'), C('paid', 'Paid', 'money'), C('outstanding', 'Outstanding Payable', 'money')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['sessions', 'revenue', 'npd', 'share', 'paid', 'outstanding'])) };
    },
    photo_payments(x) {
      const r = T.all('photographer_payments').filter(p => { const d = p.paid_date || (p.created_at || '').slice(0, 10); return d >= x.start && d <= x.end; })
        .sort((a, b) => ((b.paid_date || b.created_at || '') < (a.paid_date || a.created_at || '') ? -1 : 1)).map(p => { const ph = T.get('photographers', p.photographer_id), s = p.session_id ? T.get('sessions', p.session_id) : null, f = p.fund_id ? T.get('funds', p.fund_id) : null;
          return { code: p.code, paid_date: p.paid_date, photographer: ph ? ph.name : '', session: s ? s.name : null, amount: p.amount, status: p.status, fund: f ? f.name : 'Business cash', payment_method: p.payment_method, notes: p.notes }; });
      const cols = [C('code', 'Payment ID'), C('paid_date', 'Payment Date', 'date'), C('photographer', 'Photographer'), C('session', 'Related Session'), C('amount', 'Payment Amount', 'money'), C('status', 'Status'), C('fund', 'Paid From'), C('payment_method', 'Method'), C('notes', 'Notes')];
      return { columns: cols, rows: r, totals: totals(cols, r.filter(v => v.status === 'Paid'), S(['amount'])) };
    },
    alloc_saving: x => allocFund(x, 'saving'), alloc_petty: x => allocFund(x, 'petty'), dist_sabit: x => dist(x, 'Sabit'), dist_julio: x => dist(x, 'Julio'),
    alloc_history(x) {
      const recs = allocRecords(x), names = [...new Set(recs.flatMap(r => r.lines.map(l => l.organizer_name)))].sort((a, b) => ((a !== 'Sabit') - (b !== 'Sabit')) || ((a !== 'Julio') - (b !== 'Julio')) || (a < b ? -1 : 1));
      const rows = recs.map(r => { const row = { code: r.code, label: r.label, period_start: r.period_start, period_end: r.period_end, eligible_profit: r.eligible_profit, saving_pct: r.saving_pct, saving_amount: r.saving_amount, petty_pct: r.petty_pct, petty_amount: r.petty_amount, remaining_profit: r.remaining_profit, allocation_date: r.allocation_date, status: r.status, created_by: r.created_by, notes: r.notes };
        names.forEach((n, i) => { const ln = r.lines.find(l => l.organizer_name === n); row['o' + i + 'p'] = ln ? ln.pct : null; row['o' + i + 'a'] = ln ? ln.amount : 0; }); return row; });
      let cols = [C('code', 'Allocation ID'), C('label', 'Period'), C('eligible_profit', 'Total Business Profit', 'money'), C('saving_pct', 'Op. Saving %', 'pct'), C('saving_amount', 'Operational Saving', 'money'), C('petty_pct', 'Petty Cash %', 'pct'), C('petty_amount', 'Petty Cash', 'money'), C('remaining_profit', 'Remaining Organizer Profit', 'money')];
      names.forEach((n, i) => { cols.push(C('o' + i + 'p', n + ' %', 'pct'), C('o' + i + 'a', n + ' Amount', 'money')); });
      cols = cols.concat([C('allocation_date', 'Allocation Date', 'date'), C('status', 'Status'), C('created_by', 'Created By'), C('notes', 'Notes')]);
      const keys = S(['eligible_profit', 'saving_amount', 'petty_amount', 'remaining_profit'].concat(names.map((n, i) => 'o' + i + 'a')));
      return { columns: cols, rows, totals: totals(cols, rows.filter(r => r.status !== 'Pending'), keys) };
    },
    members(x) { const r = memberRows(x).sort(by2(v => v.joined, v => v.spend)); return { columns: MEMC, rows: r, totals: totals(MEMC, r, S(['joined', 'paid', 'attended', 'spend'])) }; },
    member_activity(x) {
      const r = memberRows(x).sort((a, b) => (b.joined - a.joined) || (a.nickname < b.nickname ? -1 : 1));
      const cols = [C('member_code', 'Member ID'), C('nickname', 'Nickname'), C('joined', 'Sessions Joined', 'int'), C('sports', 'Sports Played', 'int'), C('spend', 'Total Spending', 'money'), C('first_date', 'First Participation', 'date'), C('last_date', 'Last Participation', 'date'), C('freq', 'Participation / Month', 'num1')];
      return { columns: cols, rows: r, totals: totals(cols, r, S(['joined', 'spend'])) };
    },
    top_spending(x) { const r = memberRows(x).sort(by2(v => v.spend, v => v.joined)).slice(0, 25), cols = [C('member_code', 'Member ID'), C('nickname', 'Nickname'), C('spend', 'Total Spending', 'money'), C('joined', 'Sessions Joined', 'int'), C('last_date', 'Last Participation', 'date')]; return { columns: cols, rows: r, totals: totals(cols, r, S(['spend', 'joined'])) }; },
    most_active(x) { const r = memberRows(x).sort(by2(v => v.attended, v => v.joined)).slice(0, 25), cols = [C('member_code', 'Member ID'), C('nickname', 'Nickname'), C('attended', 'Sessions Attended', 'int'), C('joined', 'Sessions Joined', 'int'), C('sports', 'Sports Played', 'int'), C('last_date', 'Last Participation', 'date')]; return { columns: cols, rows: r, totals: totals(cols, r, S(['attended', 'joined'])) }; },
  };

  // ------------------------------------------------------------------ exports
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? `${m[3]} ${MON[+m[2] - 1]} ${m[1]}` : String(v || ''); };
  function cellText(c, v) {
    if (v === null || v === undefined || v === '') return '';
    if (c.type === 'money') return rp(v); if (c.type === 'int') return Math.trunc(v).toLocaleString('de-DE'); if (c.type === 'pct') return v + '%'; if (c.type === 'num1') return String(v); if (c.type === 'date') return fmtDate(v); return String(v);
  }
  const period = rep => `${fmtDate(rep.filters.start) || 'All dates'} to ${fmtDate(rep.filters.end) || 'today'}`;
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${p(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const totalRow = rep => { if (!rep.totals || !Object.keys(rep.totals).length) return null; const t = Object.assign({}, rep.totals); t[rep.columns[0].key] = 'TOTAL'; return t; };
  const csvCell = v => { v = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function toCsv(rep) {
    const L = [[rep.title], ['Period: ' + period(rep), 'Generated ' + stamp()], rep.columns.map(c => c.label)];
    rep.rows.forEach(r => L.push(rep.columns.map(c => r[c.key]))); const t = totalRow(rep); if (t) L.push(rep.columns.map(c => t[c.key]));
    return '﻿' + L.map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  // --- minimal zip (store) -------------------------------------------------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const utf8 = s => new TextEncoder().encode(s);
  function zip(files) { // files: [{name, data(Uint8Array|string)}]
    const parts = [], central = []; let off = 0; const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    for (const f of files) {
      const name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      const lh = Uint8Array.from([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 33, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0]);
      parts.push(lh, name, data);
      central.push(Uint8Array.from([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 33, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), name);
      off += lh.length + name.length + data.length;
    }
    const cl = central.reduce((a, b) => a + b.length, 0), n = files.length;
    parts.push(...central, Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(n), ...u16(n), ...u32(cl), ...u32(off), 0, 0]));
    const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0)); let p = 0; parts.forEach(b => { out.set(b, p); p += b.length; }); return out;
  }
  const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colL = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  // style ids: 0 normal, 1 header, 2 title, 3 italic note; then normal/bold x [text,money,int,pct,num1,date]
  const FMT = { text: 0, money: 1, int: 2, pct: 3, num1: 4, date: 5 };
  const xfId = (type, bold) => 4 + FMT[type] * 2 + (bold ? 1 : 0);
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;Rp&quot;#,##0;[Red]-&quot;Rp&quot;#,##0"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="166" formatCode="DD\\ MMM\\ YYYY"/><numFmt numFmtId="167" formatCode="0.0"/></numFmts>`
    + `<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF001F54"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF001F54"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>`
    + `<cellXfs count="16"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>`
    + [0, 164, 3, 165, 167, 166].map(n => `<xf numFmtId="${n}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="${n}" fontId="4" fillId="0" borderId="0" applyNumberFormat="1" applyFont="1"/>`).join('') + `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const serial = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5) : null; };
  function sheetXml(rep, business) {
    const rows = []; const cell = (ci, ri, v, s, type) => { const ref = colL(ci) + ri; if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
      if (type === 'date') { const n = serial(v); if (n !== null) return `<c r="${ref}" s="${s}"><v>${n}</v></c>`; } if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`; return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`; };
    rows.push(`<row r="1">${cell(0, 1, `${business} – ${rep.title}`, 2)}</row>`, `<row r="2">${cell(0, 2, `Period: ${period(rep)}  |  Generated ${stamp()}`, 3)}</row>`);
    rows.push(`<row r="4" ht="30" customHeight="1">${rep.columns.map((c, i) => cell(i, 4, c.label, 1)).join('')}</row>`);
    let ri = 5; rep.rows.forEach(r => { rows.push(`<row r="${ri}">${rep.columns.map((c, i) => cell(i, ri, r[c.key], xfId(c.type, false), c.type)).join('')}</row>`); ri++; });
    const t = totalRow(rep); if (t) rows.push(`<row r="${ri}">${rep.columns.map((c, i) => cell(i, ri, t[c.key], xfId(c.type, true), c.type)).join('')}</row>`);
    const widths = rep.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(12, Math.max(c.label.length, ...rep.rows.slice(0, 200).map(r => String(r[c.key] === null || r[c.key] === undefined ? '' : r[c.key]).length)) + 3), 48)}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
  }
  function toXlsx(reps, business) {
    const used = new Set(), names = reps.map(r => { let n = r.title.replace(/[\[\]:*?\/\\]/g, '').slice(0, 28), base = n, k = 2; while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${k++}`; used.add(n.toLowerCase()); return n; });
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${reps.map((r, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${reps.map((r, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${reps.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES }].concat(reps.map((r, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(r, business) })));
    return zip(files);
  }
  const he = s => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function toPrintHtml(reps, business) {
    const title = reps[0].bundle || reps[0].title, num = new Set(['money', 'int', 'pct', 'num1']);
    const tables = reps.map(rep => { const t = totalRow(rep); const row = (r, tot) => '<tr' + (tot ? ' class="tot"' : '') + '>' + rep.columns.map(c => `<td class="${num.has(c.type) ? 'n' : ''}">${he(tot && c.key === rep.columns[0].key ? 'TOTAL' : cellText(c, r[c.key]))}</td>`).join('') + '</tr>';
      return (reps.length > 1 ? `<h2>${he(rep.title)}</h2>` : '') + `<table><thead><tr>${rep.columns.map(c => `<th>${he(c.label)}</th>`).join('')}</tr></thead><tbody>${rep.rows.map(r => row(r)).join('') || `<tr><td colspan="${rep.columns.length}">No data for this period.</td></tr>`}${t ? row(t, true) : ''}</tbody></table>`; }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${he(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px/1.35 Arial,sans-serif;color:#111}h1{color:#001F54;font-size:18px;margin:0}h2{color:#001F54;font-size:14px;margin:14px 0 4px}.m{color:#666;font-size:10px;margin:2px 0 8px}table{border-collapse:collapse;width:100%;margin-bottom:8px}th{background:#001F54;color:#fff;padding:4px;font-size:10px}td{border:1px solid #C9D3E6;padding:3px 4px}td.n{text-align:right}tr:nth-child(even) td{background:#F7F9FD}tr.tot td{background:#E6EEFB;font-weight:bold}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body><div class="m">${he(business)}</div><h1>${he(title)}</h1><div class="m">Period: ${he(period(reps[0]))} | Generated ${stamp()}</div>${tables}</body></html>`;
  }
  function file(reps, fmt, name) {
    const biz = T.setting('business_name', 'NPD'), day = today();
    if (fmt === 'csv') return reps.length === 1 ? { __download: { name: `${name}_${day}.csv`, mime: 'text/csv', data: toCsv(reps[0]) } }
      : { __download: { name: `${name}_${day}_csv.zip`, mime: 'application/zip', data: zip(reps.map((r, i) => ({ name: `${String(i + 1).padStart(2, '0')}_${r.key}.csv`, data: toCsv(r) }))) } };
    if (fmt === 'pdf') return { __download: { name: `${name}_${day}.html`, mime: 'text/html', print: true, data: toPrintHtml(reps, biz) } };
    return { __download: { name: `${name}_${day}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: toXlsx(reps, biz) } };
  }

  const filt = q => Object.fromEntries(['start', 'end', 'sport_id', 'venue_id', 'session_id', 'member_id', 'category', 'fund_id'].map(k => [k, q[k] || null]));
  function one(key, q) { if (!TITLES[key]) throw new ApiError('Unknown report.', 404); if (FIN.has(key) && !has('finance')) throw new ApiError('You do not have permission for this report.', 403); return build(key, filt(q)); }
  add('GET', '/reports', 'view', () => { const fin = has('finance'); return ok({ reports: CATALOG.filter(([, k]) => fin || !FIN.has(k)).map(([group, key, title]) => ({ key, title, group, finance: FIN.has(key) })), groups: GROUPS,
    funds: fin ? sortBy(T.all('funds'), 'sort').map(f => ({ id: f.id, name: f.name })) : [], categories: fin ? NPDB.ops.EXPENSE_CATS.concat(['Photographer Payment']) : [] }); });
  add('GET', '/reports/<key>', 'view', ({ q }, key) => ok({ report: one(key, q) }));
  add('GET', '/reports/<key>/export', 'view', ({ q }, key) => { const rep = one(key, q), fmt = q.format || 'xlsx'; log('export', 'report', key, Object.assign({ format: fmt }, filt(q))); return file([rep], fmt, 'NPD_' + key); });
  add('GET', '/export', 'view', ({ q }) => {
    const typ = q.type || 'business_summary'; if (!BUNDLES[typ]) throw new ApiError('Unknown report type.'); const keys = BUNDLES[typ].keys;
    if (keys.some(k => FIN.has(k)) && !has('finance')) throw new ApiError('You do not have permission for financial reports.', 403);
    const f = filt(q), reps = keys.map(k => build(k, f)); reps.forEach(r => { r.bundle = BUNDLES[typ].title; }); const fmt = q.format || 'xlsx';
    log('export', 'report', typ, Object.assign({ format: fmt }, f)); return file(reps, fmt, 'NPD_' + typ);
  });
  NPDB.reports = { build, CATALOG, BUNDLES, zip, toXlsx, toCsv, toPrintHtml, TITLES, FIN };
})(typeof window !== 'undefined' ? window : globalThis);
