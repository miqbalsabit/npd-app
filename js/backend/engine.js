'use strict';
/* NPD financial engine (JavaScript port of finance.py). Every page, report and export takes its numbers from here. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, { rnd, sum, today, sortBy, p2, isoDate, parseD, addDays } = NPDB;
  class ValueErr extends Error {}
  NPDB.ValueErr = ValueErr;
  const PAID_STATES = ['Paid', 'Partially Refunded', 'Refunded'];
  const PHOTO_CAT = 'Photographer Payment';
  const num = x => Number(x) || 0;

  // ----------------------------------------------------------------- participants / sessions
  function participantCalc(sess, p) {
    const fee = num(sess.session_fee), photoFee = num(sess.photo_fee), mode = sess.photo_mode, status = p.payment_status;
    const paidState = PAID_STATES.includes(status);
    const cash = paidState ? num(p.amount_paid) : 0;
    let refund = paidState ? num(p.refund_amount) : 0;
    if (status === 'Refunded' && refund === 0) refund = cash;
    refund = Math.min(refund, cash);
    const retained = cash - refund, selected = !!p.photo_selected;
    const due = fee + (mode === 'excluded' && selected ? photoFee : 0);
    // loyalty reward: NPD absorbs the discount, so the photographer share is based on the gross amount (paid + discount)
    const disc = paidState && refund === 0 ? num(p.loyalty_discount) : 0, base = retained + disc;
    let photo = 0;
    if (base > 0) {
      if (mode === 'included' && fee > 0) photo = base * Math.min(photoFee, fee) / fee;
      else if (mode === 'excluded' && selected && due > 0) photo = base * photoFee / due;
    }
    if (p.photo_waived) photo = 0;   // photo already turned into member credit: nothing for the photographer, nothing to carve out of session revenue
    const sessionRev = retained - (mode === 'excluded' ? photo : 0);
    return { cash, refund, retained, photo, session_rev: sessionRev, receivable: status === 'Waiting for Payment' ? due : 0, paid: retained > 0 || disc > 0, loyalty_discount: disc, counted: status !== 'Cancelled' };
  }

  function sessionFinancials(sess, parts, extra = 0, photographerPaid = 0) {
    const cs = parts.map(p => participantCalc(sess, p));
    const photoTotal = sum(cs, c => c.photo);
    let photoRevenue = rnd(photoTotal), npdShare = rnd(photoTotal * num(sess.npd_share_pct) / 100);
    let photographerShare = photoRevenue - npdShare;
    if (sess.photo_mode === 'none') photoRevenue = npdShare = photographerShare = 0;
    const sessionRevenue = rnd(sum(cs, c => c.session_rev));
    const netCollected = sum(cs, c => c.retained), grossCollected = sum(cs, c => c.cash), refunds = sum(cs, c => c.refund);
    const includedPhoto = sess.photo_mode === 'included' ? photoRevenue : 0;
    const organizerSessionFee = sessionRevenue - includedPhoto;
    const organizerRevenue = organizerSessionFee + npdShare;
    const venueCost = num(sess.venue_cost), adminFee = num(sess.admin_fee), totalExpenses = venueCost + adminFee + extra, netProfit = organizerRevenue - totalExpenses;
    const targetRev = num(sess.target_participants) * num(sess.session_fee);
    let estOrg = targetRev;
    if (sess.photo_mode === 'included') estOrg -= rnd(num(sess.target_participants) * Math.min(num(sess.photo_fee), num(sess.session_fee)) * (100 - num(sess.npd_share_pct)) / 100);
    const budget = venueCost + adminFee + num(sess.budget_extra);
    return {
      registered: cs.filter(c => c.counted).length, paid_count: cs.filter(c => c.paid).length, attended: 0,
      photo_participants: parts.filter((p, k) => cs[k].paid && !p.photo_waived && (sess.photo_mode === 'included' || (sess.photo_mode === 'excluded' && p.photo_selected))).length,
      gross_collected: grossCollected, refunds, net_collected: netCollected, receivable: sum(cs, c => c.receivable),
      session_revenue: sessionRevenue, photo_revenue: photoRevenue, npd_photo_share: npdShare, photographer_share: photographerShare,
      organizer_session_fee: organizerSessionFee, organizer_revenue: organizerRevenue,
      venue_cost: venueCost, admin_fee: adminFee, venue_total: venueCost + adminFee, other_expenses: extra, total_expenses: totalExpenses, net_profit: netProfit,
      photographer_paid: photographerPaid, photographer_outstanding: photographerShare - photographerPaid,
      target_participants: num(sess.target_participants), target_revenue: targetRev, budget_expenses: budget,
      estimated_profit: estOrg - budget, actual_revenue: sessionRevenue,
    };
  }

  /** Sessions joined with sport / venue / organizer / photographer names (inner join on sport + venue). */
  function joinedSessions(filter) {
    const out = [];
    for (const s of T.all('sessions')) {
      const sp = T.get('sports', s.sport_id), v = T.get('venues', s.venue_id); if (!sp || !v) continue;
      if (filter && !filter(s)) continue;
      const o = s.organizer_id ? T.get('organizers', s.organizer_id) : null, ph = s.photographer_id ? T.get('photographers', s.photographer_id) : null;
      out.push(Object.assign({}, s, { sport: sp.name, sport_color: sp.color, venue: v.name, venue_area: v.area || null, organizer: o ? o.name : null, photographer: ph ? ph.name : null }));
    }
    return sortBy(out, 'event_date', 'start_time');
  }

  function computeSessions(start, end, sportId, venueId, sessionId, includeDraft = false) {
    const list = joinedSessions(s => (!start || s.event_date >= start) && (!end || s.event_date <= end) && (!sportId || s.sport_id == sportId)
      && (!venueId || s.venue_id == venueId) && (!sessionId || s.id == sessionId) && (includeDraft || s.status !== 'Draft'));
    if (!list.length) return [];
    const ids = new Set(list.map(s => s.id)), partsBy = {}, expBy = {}, payBy = {};
    T.all('session_participants').forEach(p => { if (ids.has(p.session_id)) (partsBy[p.session_id] = partsBy[p.session_id] || []).push(p); });
    T.all('expenses').forEach(e => { if (e.session_id && ids.has(e.session_id) && e.category !== PHOTO_CAT && e.auto !== 'venue') expBy[e.session_id] = (expBy[e.session_id] || 0) + e.amount; });
    T.all('photographer_payments').forEach(e => { if (e.session_id && ids.has(e.session_id) && e.status === 'Paid') payBy[e.session_id] = (payBy[e.session_id] || 0) + e.amount; });
    return list.map(s => {
      const parts = partsBy[s.id] || [], f = sessionFinancials(s, parts, expBy[s.id] || 0, payBy[s.id] || 0);
      f.attended = parts.filter(p => p.attendance === 'Attended' && p.payment_status !== 'Cancelled').length;
      return Object.assign(s, f);
    });
  }

  function periodSummary(start, end, sportId, venueId, sessionId) {
    const sessions = computeSessions(start, end, sportId, venueId, sessionId);
    const narrow = !!(sportId || venueId || sessionId);
    let manual = [], general = [];
    if (!narrow) {
      const inR = r => (!start || r.txn_date >= start) && (!end || r.txn_date <= end);
      manual = T.all('revenue_records').filter(inR);
      general = T.all('expenses').filter(r => !r.session_id && r.category !== PHOTO_CAT && inR(r));
    }
    const otherRevenue = sum(manual, m => m.amount), generalExp = sum(general, x => x.amount);
    const S = k => sum(sessions, s => s[k]);
    const organizerRevenue = S('organizer_revenue') + otherRevenue, sessionExpenses = S('total_expenses');
    return {
      sessions, session_count: sessions.length, completed_count: sessions.filter(s => s.status === 'Completed').length,
      participants_paid: S('paid_count'), participants_registered: S('registered'), participants_attended: S('attended'),
      gross_collected: S('gross_collected'), refunds: S('refunds'), net_collected: S('net_collected') + otherRevenue, receivable: S('receivable'),
      session_fee_revenue: S('organizer_session_fee'), photo_revenue: S('photo_revenue'), npd_photo_share: S('npd_photo_share'), photographer_share: S('photographer_share'),
      other_revenue: otherRevenue, organizer_revenue: organizerRevenue, session_expenses: sessionExpenses, general_expenses: generalExp,
      total_expenses: sessionExpenses + generalExp, net_profit: organizerRevenue - sessionExpenses - generalExp,
      manual_revenue: manual, general_expense_rows: general,
    };
  }

  const monthRange = ym => { const [y, m] = ym.split('-').map(Number); const first = `${y}-${p2(m)}-01`; return [first, isoDate(new Date(y, m, 0))]; };
  function monthsBetween(start, end) {
    let y = +start.slice(0, 4), m = +start.slice(5, 7); const ye = +end.slice(0, 4), me = +end.slice(5, 7), out = [];
    while (y < ye || (y === ye && m <= me)) { out.push(`${y}-${p2(m)}`); if (m === 12) { y++; m = 1; } else m++; }
    return out;
  }
  function monthlySeries(start, end, minMonths = 6) {
    const months = monthsBetween(start, end);
    while (months.length < minMonths) { let y = +months[0].slice(0, 4), m = +months[0].slice(5, 7); if (m === 1) { y--; m = 12; } else m--; months.unshift(`${y}-${p2(m)}`); }
    return months.map(ym => { const [a, b] = monthRange(ym), ps = periodSummary(a, b); return { month: ym, revenue: ps.organizer_revenue, expenses: ps.total_expenses, profit: ps.net_profit, collected: ps.net_collected }; });
  }

  // ----------------------------------------------------------------- funds & ledger
  const NPD_FUNDS = ['petty_cash'], BANK = 'bank_account';
  const fundsMap = () => { const m = new Map(); sortBy(T.all('funds'), 'sort').forEach(f => m.set(f.id, f)); return m; };
  function defaultVenueFundId() {
    const code = T.setting('default_venue_fund', BANK);
    const f = T.find('funds', x => x.code === code) || sortBy(T.all('funds'), 'sort')[0]; return f ? f.id : null;
  }

  function ledger() {
    const ev = [], t = today(), funds = fundsMap(), bankF = T.find('funds', f => f.code === BANK), bankId = bankF ? bankF.id : null;
    const isNpd = fid => fid == null || (funds.get(fid) && funds.get(fid).kind === 'npd');
    const add = (date, direction, type, category, amount, description, ref, sid = null, code = null, fund = null, fundTo = null, extra = {}) => {
      if (fund == null && (direction === 'in' || direction === 'out')) fund = bankId;   // money without an explicit pocket goes through Saldo Rekening
      ev.push(Object.assign({ date, direction, type, category, amount, description, ref, session_id: sid, code, fund_id: fund, fund_to: fundTo, npd_cash: (direction === 'in' || direction === 'out') && isNpd(fund) }, extra)); };
    for (const r of T.all('session_participants')) {
      if (!PAID_STATES.includes(r.payment_status) || !(r.amount_paid > 0)) continue;
      const s = T.get('sessions', r.session_id), m = T.get('members', r.member_id); if (!s || !m) continue;
      const d = r.paid_date || (r.registered_at || '').slice(0, 10);
      const cu = num(r.credit_used), ca = num(r.credit_amount);   // credit_used = paid with member credit (not cash); credit_amount = refunded as credit (not cash)
      if (r.amount_paid - cu > 0) add(d, 'in', 'Participant Payment', 'Participant Payments', r.amount_paid - cu, `${m.nickname} – ${s.name}`, 'sp' + r.id, r.session_id, null, r.deposit_fund_id || null, null, { payment_method: null });
      let ref = num(r.refund_amount); if (r.payment_status === 'Refunded' && ref === 0) ref = r.amount_paid;
      const cashRef = Math.min(ref, r.amount_paid) - ca;
      if (cashRef > 0) add(r.refund_date || d, 'out', 'Refund', 'Refunds', cashRef, `Refund ${m.nickname} – ${s.name}`, 'rf' + r.id, r.session_id, null, r.deposit_fund_id || null);
    }
    { const pc = T.find('funds', f => f.code === NPD_FUNDS[0]);
      for (const r of T.all('member_credits')) if (r.kind === 'refund' && r.amount > 0) { const m = T.get('members', r.member_id); add(r.txn_date, 'out', 'Refund', 'Member Credit Refunds', r.amount, `Refund saldo ${m ? m.nickname : ''}`, 'mc' + r.id, r.session_id || null, null, pc ? pc.id : null); } }
    for (const r of T.all('revenue_records')) if (!r.noncash) add(r.txn_date, 'in', 'Revenue', r.category, r.amount, r.description, 'rv' + r.id, null, r.code, r.fund_id || null, null,
      { payment_method: r.payment_method, notes: r.notes, created_by: r.created_by, created_at: r.created_at, entity: 'revenue', entity_id: r.id });
    for (const r of T.all('expenses')) if (r.category !== PHOTO_CAT)
      add(r.txn_date, 'out', 'Operational Expense', r.category, r.amount, r.description, 'ex' + r.id, r.session_id, r.code, r.source_fund_id,
        null, { payment_method: r.payment_method, receipt: r.receipt, notes: r.notes, created_by: r.created_by, created_at: r.created_at, entity: 'expense', entity_id: r.id, auto: r.auto || null });
    for (const r of T.all('photographer_payments')) {
      if (r.status !== 'Paid') continue; const ph = T.get('photographers', r.photographer_id); if (!ph) continue;
      add(r.paid_date || (r.created_at || '').slice(0, 10), 'out', 'Photographer Payment', PHOTO_CAT, r.amount, `Settlement – photographer ${ph.name}`, 'pp' + r.id, r.session_id, r.code, r.fund_id,
        null, { payment_method: r.payment_method, notes: r.notes, created_by: r.created_by, created_at: r.created_at, entity: 'photographer_payment', entity_id: r.id });
    }
    for (const l of T.all('profit_sharing_lines')) {
      if (!l.paid || !(l.amount > 0)) continue; const ps = T.get('profit_sharing', l.profit_sharing_id); if (!ps) continue;
      add(l.paid_date || t, 'out', 'Organizer Distribution', 'Organizer Distribution', l.amount, `${l.organizer_name} – ${ps.label}`, 'ol' + l.id, null, null, l.fund_id || null);
    }
    const petty = T.find('funds', f => f.code === NPD_FUNDS[0]);
    for (const r of T.all('profit_sharing')) {
      if (r.status !== 'Calculated' && r.status !== 'Paid') continue; const d = r.allocation_date || r.period_end;
      const amt = (r.saving_amount || 0) + (r.petty_amount || 0);
      if (amt > 0 && petty) add(d, 'internal', 'Profit Allocation', 'NPD Petty Cash Allocation', amt, `NPD Petty Cash – ${r.label}`, 'ap' + r.id, null, r.code, bankId, petty.id);
    }
    for (const r of T.all('fund_transactions')) {
      const base = { notes: r.notes, created_by: r.created_by, created_at: r.created_at, entity: 'fund_transaction', entity_id: r.id };
      const fa = r.from_fund_id, fb = r.to_fund_id, na = fa && funds.get(fa) ? funds.get(fa).name : '?', nb = funds.get(fb) ? funds.get(fb).name : '?';
      if (r.kind === 'transfer') add(r.txn_date, 'internal', 'Fund Transfer', 'Fund Transfer', r.amount, `${na} → ${nb}`, 'ft' + r.id, null, r.code, fa, fb, base);
      else if (r.kind === 'contribution') add(r.txn_date, 'internal', 'Personal Funding Contribution', 'Personal Funding', r.amount, `Funding added to ${nb}`, 'ft' + r.id, null, r.code, null, fb, base);
      else add(r.txn_date, 'out', 'Personal Reimbursement', 'Personal Reimbursement', r.amount, `Reimbursement ${na} → ${nb}`, 'ft' + r.id, null, r.code, fa, fb, Object.assign({ expense_id: r.expense_id }, base));
    }
    return ev;
  }

  function effects(e) {
    const t = e.type, a = e.amount;
    if (t === 'Operational Expense' || t === 'Photographer Payment') return e.fund_id ? [[e.fund_id, -a]] : [];
    if (t === 'Fund Transfer' || t === 'Personal Reimbursement') return [[e.fund_id, -a], [e.fund_to, a]];
    if (t === 'Profit Allocation') return e.fund_id ? [[e.fund_id, -a], [e.fund_to, a]] : [[e.fund_to, a]];
    if (t === 'Personal Funding Contribution') return [[e.fund_to, a]];
    if (t === 'Participant Payment' || t === 'Revenue') return e.fund_id ? [[e.fund_id, a]] : [];
    if (t === 'Refund' || t === 'Organizer Distribution') return e.fund_id ? [[e.fund_id, -a]] : [];
    return [];
  }

  const openingOf = f => num(f.opening_balance) + (f.code === BANK ? Math.trunc(Number(T.setting('opening_cash', '0')) || 0) : 0);   // Settings 'opening cash' = opening balance of Saldo Rekening
  function fundBalance(fundId, upto, excludeRef, ev) {
    const f = T.get('funds', fundId); let bal = f ? openingOf(f) : 0;
    for (const e of ev || ledger()) {
      if (excludeRef && e.ref === excludeRef) continue; if (upto && e.date > upto) continue;
      for (const [fid, amt] of effects(e)) if (fid == fundId) bal += amt;
    }
    return bal;
  }

  function fundSummary(start, end, ev) {
    ev = ev || ledger(); const out = [];
    for (const f of fundsMap().values()) {
      let opening = openingOf(f), inflow = 0, outflow = 0;
      const parts = { income: 0, refunds: 0, distributions: 0, allocations: 0, transfers_in: 0, contributions: 0, reimbursements_in: 0, expenses: 0, photographer_payments: 0, transfers_out: 0, reimbursements_out: 0 };
      for (const e of ev) for (const [fid, amt] of effects(e)) {
        if (fid !== f.id) continue;
        if (e.date < start) opening += amt;
        else if (e.date <= end) {
          if (amt > 0) inflow += amt; else outflow += -amt;
          let key = { 'Participant Payment': 'income', 'Revenue': 'income', 'Refund': 'refunds', 'Organizer Distribution': 'distributions', 'Profit Allocation': 'allocations', 'Personal Funding Contribution': 'contributions', 'Operational Expense': 'expenses', 'Photographer Payment': 'photographer_payments' }[e.type];
          if (e.type === 'Fund Transfer') key = amt > 0 ? 'transfers_in' : 'transfers_out';
          else if (e.type === 'Personal Reimbursement') key = amt > 0 ? 'reimbursements_in' : 'reimbursements_out';
          parts[key] += Math.abs(amt);
        }
      }
      const closing = opening + inflow - outflow;
      out.push(Object.assign({ id: f.id, code: f.code, name: f.name, kind: f.kind, owner: f.owner || null, opening_balance: openingOf(f), opening, inflow, outflow, closing }, parts, { overdrawn: f.kind === 'npd' && closing < 0 }));
    }
    return out;
  }

  const cashEvents = () => ledger().filter(e => (e.direction === 'in' || e.direction === 'out') && e.npd_cash)
    .map(e => [e.date, e.direction, e.category, e.amount, e.description, e.ref, e.session_id, e.code, e.fund_id]);

  const creditSign = k => (k === 'earn' ? 1 : -1);
  function creditBalances(upto) {
    const m = new Map(); upto = upto || '9999-12-31';
    for (const r of T.all('member_credits')) if (r.txn_date <= upto) m.set(r.member_id, (m.get(r.member_id) || 0) + creditSign(r.kind) * r.amount);
    return m;
  }
  const creditBalance = (mid, upto) => creditBalances(upto).get(mid) || 0;
  const totalCredit = upto => { let t = 0; creditBalances(upto).forEach(v => { if (v > 0) t += v; }); return t; };
  function liabilities(upto, ev) {
    upto = upto || today(); const sess = computeSessions(null, upto);
    const phShare = sum(sess, s => s.photographer_share);
    const phPaid = sum(T.all('photographer_payments').filter(p => p.status === 'Paid' && p.paid_date && p.paid_date <= upto), p => p.amount);
    const okPs = new Map(T.all('profit_sharing').filter(p => p.status === 'Calculated' || p.status === 'Paid').map(p => [p.id, p]));
    const lines = T.all('profit_sharing_lines').filter(l => okPs.has(l.profit_sharing_id));
    const orgTotal = sum(lines, l => l.amount), orgPaid = sum(lines.filter(l => l.paid && l.paid_date && l.paid_date <= upto), l => l.amount);
    ev = ev || ledger(); let owed = 0;
    for (const f of fundsMap().values()) if (f.kind === 'personal') owed += Math.max(0, -fundBalance(f.id, upto, null, ev));
    return { photographer_payable: phShare - phPaid, organizer_payable: orgTotal - orgPaid, personal_payable: owed, member_credit: totalCredit(upto) };
  }

  function cashflow(start, end) {
    const ev = ledger(), funds = fundsMap();
    const npdOpen = sum([...funds.values()].filter(f => f.kind === 'npd'), f => num(f.opening_balance));
    const openingBase = Math.trunc(Number(T.setting('opening_cash', '0')) || 0) + npdOpen;
    const cash = sortBy(ev.filter(e => (e.direction === 'in' || e.direction === 'out') && e.npd_cash), 'date');
    const before = sum(cash.filter(e => e.date < start), e => (e.direction === 'in' ? e.amount : -e.amount));
    const inside = cash.filter(e => e.date >= start && e.date <= end);
    const cin = sum(inside.filter(e => e.direction === 'in'), e => e.amount), cout = sum(inside.filter(e => e.direction === 'out'), e => e.amount);
    const opening = openingBase + before, closing = opening + cin - cout;
    const fs = fundSummary(start, end, ev), npdClosing = sum(fs.filter(f => f.kind === 'npd'), f => f.closing);
    const liab = liabilities(end, ev), bankS = fs.find(f => f.code === BANK), pool = bankS ? bankS.closing : closing - npdClosing;
    const businessCash = pool - liab.photographer_payable - liab.organizer_payable - liab.personal_payable - liab.member_credit;
    const byCat = new Map(), monthly = {};
    inside.forEach(e => { const k = e.direction + '\u0000' + e.category; byCat.set(k, (byCat.get(k) || 0) + e.amount); const mm = monthly[e.date.slice(0, 7)] = monthly[e.date.slice(0, 7)] || { month: e.date.slice(0, 7), in: 0, out: 0 }; mm[e.direction] += e.amount; });
    const personalFunded = sum(ev.filter(e => e.direction === 'out' && !e.npd_cash && e.date >= start && e.date <= end), e => e.amount);
    const internal = ev.filter(e => e.direction === 'internal' && e.date >= start && e.date <= end);
    const nameOf = id => (id && funds.get(id) ? funds.get(id).name : null);
    const mv = e => ({ date: e.date, direction: e.direction, type: e.type, category: e.category, amount: e.amount, description: e.description, ref: e.ref, session_id: e.session_id, code: e.code, fund: nameOf(e.fund_id), fund_to: nameOf(e.fund_to) });
    const desc = arr => arr.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return {
      opening, cash_in: cin, cash_out: cout, closing, funds: fs, pool,
      photographer_payable: liab.photographer_payable, other_liabilities: liab.organizer_payable, organizer_payable: liab.organizer_payable, personal_payable: liab.personal_payable, member_credit: liab.member_credit,
      organizer_business_cash: businessCash, personal_funded_expenses: personalFunded,
      categories: [...byCat.entries()].map(([k, v]) => { const [d, c] = k.split('\u0000'); return { direction: d, category: c, amount: v }; }).sort((a, b) => (a.direction + a.category < b.direction + b.category ? -1 : 1)),
      monthly: Object.keys(monthly).sort().map(k => monthly[k]),
      movements: desc(inside).map(mv), fund_movements: desc(internal).map(mv),
    };
  }
  const totalCashBalance = upto => cashflow('2000-01-01', upto || today()).closing;
  function netCash(upto) {
    upto = upto || today(); const cash = totalCashBalance(upto), l = liabilities(upto);
    return { cash, photographer: l.photographer_payable, organizer_profit: l.organizer_payable, organizer_debt: l.personal_payable, member_credit: l.member_credit, net: cash - l.photographer_payable - l.organizer_payable - l.personal_payable - l.member_credit };
  }

  // ----------------------------------------------------------------- profit sharing
  function allocate(eligibleProfit, pettyPct, organizers) {
    if (!organizers.length) throw new ValueErr('No active organizers configured.');
    const pctSum = Math.round(sum(organizers, o => num(o.share_pct)) * 1e6) / 1e6;
    if (pctSum !== 100) throw new ValueErr(`Active organizer percentages must total 100% (currently ${pctSum}%).`);
    pettyPct = num(pettyPct);
    if (!(pettyPct >= 0 && pettyPct <= 100)) throw new ValueErr('NPD Petty Cash percentage must be between 0 and 100.');
    const eligible = Math.max(0, eligibleProfit);
    const petty = rnd(eligible * pettyPct / 100);
    const remaining = eligible - petty;
    const lines = organizers.map(o => ({ organizer_id: o.id, organizer_name: o.name, pct: o.share_pct, amount: rnd(remaining * num(o.share_pct) / 100) }));
    const diff = remaining - sum(lines, l => l.amount);
    if (lines.length && diff) lines.reduce((a, b) => (b.pct > a.pct ? b : a)).amount += diff;
    return [petty, remaining, lines];
  }

  function profitSharingPreview(start, end, pettyPct) {
    if (pettyPct == null) pettyPct = Number(T.setting('default_petty_pct', '15'));
    const ps = periodSummary(start, end), orgs = sortBy(T.all('organizers').filter(o => o.active), 'id');
    const [petty, remaining, lines] = allocate(ps.net_profit, pettyPct, orgs);
    return { start, end, net_profit: ps.net_profit, eligible_profit: Math.max(0, ps.net_profit), saving_pct: 0, saving_amount: 0, petty_pct: pettyPct, petty_amount: petty,
      remaining_profit: remaining, lines, organizer_revenue: ps.organizer_revenue, total_expenses: ps.total_expenses,
      warning: ps.net_profit <= 0 ? 'Net profit is zero or negative: nothing is allocated or distributed.' : null };
  }
  const overlap = (start, end, excludeId) => T.find('profit_sharing', p => p.period_start <= end && p.period_end >= start && p.id !== excludeId);
  function saveLines(pid, pv) {
    T.filter('profit_sharing_lines', l => l.profit_sharing_id === pid).forEach(l => T.remove('profit_sharing_lines', l.id));
    pv.lines.forEach(l => T.insert('profit_sharing_lines', { profit_sharing_id: pid, organizer_id: l.organizer_id, organizer_name: l.organizer_name, pct: l.pct, amount: l.amount, paid: 0, paid_date: null }));
  }
  function createProfitSharing(start, end, pettyPct, label, notes, isDemo = 0, createdBy = null) {
    if (start > end) throw new ValueErr('Period start must be before the end.');
    const clash = overlap(start, end);
    if (clash) throw new ValueErr(`Period overlaps existing record ${clash.label} – the same profit cannot be allocated twice.`);
    const pv = profitSharingPreview(start, end, pettyPct), code = T.nextCode('profit_sharing', 'code', 'ALC-', 4);
    const rec = T.insert('profit_sharing', { code, label: label || `${start} to ${end}`, period_start: start, period_end: end, eligible_profit: pv.eligible_profit, saving_pct: pv.saving_pct, saving_amount: pv.saving_amount,
      petty_pct: pv.petty_pct, petty_amount: pv.petty_amount, remaining_profit: pv.remaining_profit, status: 'Pending', allocation_date: null, paid_date: null, notes: notes || null, created_by: createdBy, is_demo: isDemo });
    saveLines(rec.id, pv); return rec.id;
  }
  function recalcProfitSharing(pid) {
    const r = T.get('profit_sharing', pid); if (!r || r.status !== 'Pending') throw new ValueErr('Only Pending records can be recalculated.');
    const pv = profitSharingPreview(r.period_start, r.period_end, (r.saving_pct || 0) + (r.petty_pct || 0));
    T.update('profit_sharing', pid, { eligible_profit: pv.eligible_profit, saving_pct: 0, saving_amount: 0, petty_pct: pv.petty_pct, petty_amount: pv.petty_amount, remaining_profit: pv.remaining_profit });
    saveLines(pid, pv);
  }
  function finalizeProfitSharing(pid, onDate) {
    const r = T.get('profit_sharing', pid); if (!r || r.status !== 'Pending') throw new ValueErr('Only Pending records can be confirmed.');
    const total = r.saving_amount + r.petty_amount + sum(T.filter('profit_sharing_lines', l => l.profit_sharing_id === pid), l => l.amount);
    if (total !== r.eligible_profit) throw new ValueErr('Allocation does not add up to the distributable profit. Recalculate it first.');
    T.update('profit_sharing', pid, { status: 'Calculated', allocation_date: onDate || today() });
  }
  function payOrganizerLine(lineId, paidDate, paid = true) {
    const l = T.get('profit_sharing_lines', lineId); if (!l) throw new ValueErr('Line not found.');
    const ps = T.get('profit_sharing', l.profit_sharing_id); if (!ps) throw new ValueErr('Line not found.');
    if (ps.status === 'Pending') throw new ValueErr('Confirm the allocation before recording payments.');
    T.update('profit_sharing_lines', lineId, { paid: paid ? 1 : 0, paid_date: paid ? (paidDate || today()) : null });
    const lines = T.filter('profit_sharing_lines', x => x.profit_sharing_id === ps.id);
    if (!lines.some(x => !x.paid && x.amount > 0)) {
      const last = lines.map(x => x.paid_date).filter(Boolean).sort().pop() || null;
      T.update('profit_sharing', ps.id, { status: 'Paid', paid_date: last });
    } else T.update('profit_sharing', ps.id, { status: 'Calculated', paid_date: null });
  }

  NPDB.engine = { BANK, creditBalances, creditBalance, totalCredit, PAID_STATES, PHOTO_CAT, NPD_FUNDS, participantCalc, sessionFinancials, joinedSessions, computeSessions, periodSummary, monthRange, monthsBetween, monthlySeries,
    fundsMap, defaultVenueFundId, ledger, effects, fundBalance, fundSummary, cashEvents, liabilities, totalCashBalance, netCash, cashflow, allocate, profitSharingPreview, createProfitSharing,
    recalcProfitSharing, finalizeProfitSharing, payOrganizerLine, overlap, ValueErr };
})(typeof window !== 'undefined' ? window : globalThis);
