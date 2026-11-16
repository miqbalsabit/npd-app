'use strict';
/* NPD backend (in-browser) – base configuration and clearly-flagged demo data (is_demo = 1). */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, E = NPDB.engine, R = NPDB.router, { today, addDays, isoDate } = NPDB;
  const OLD = '1970-01-01T00:00:00.000Z';
  const DEFAULT_SETTINGS = { business_name: 'NPD – Network. Play. Discover.', currency: 'IDR', financial_period_start_month: '1', opening_cash: '0', default_photographer_id: '', default_photo_fee: '10000', default_photo_mode: 'included',
    default_npd_share: '10', default_petty_pct: '15', default_venue_fund: 'bank_account', demo_loaded: '0' };
  const FUNDS = [[5, 'bank_account', 'Saldo Rekening', 'npd', null, 1], [2, 'petty_cash', 'NPD Petty Cash', 'npd', null, 2], [3, 'personal_sabit', 'Personal – Sabit', 'personal', 'Sabit', 3], [4, 'personal_julio', 'Personal – Julio', 'personal', 'Julio', 4]];

  /** Fixed ids + epoch timestamps: two devices that seed independently produce the *same* records, and any real edit wins the merge. */
  function seedBase() {
    const put = (c, rec) => { if (T.get(c, rec.id)) return; const r = T.insert(c, rec); r.updatedAt = OLD; };
    [['Pickleball', '#FFC23D'], ['Tennis', '#C8E000'], ['Badminton', '#6FB1FF']].forEach(([name, color], i) => put('sports', { id: 101 + i, name, color, active: 1 }));
    ['Sabit', 'Julio'].forEach((name, i) => put('organizers', { id: 201 + i, name, share_pct: 50, active: 1 }));
    put('photographers', { id: 301, name: 'Septian', default_fee: 10000, default_npd_share: 10, active: 1 });
    FUNDS.forEach(([id, code, name, kind, owner, sort]) => put('funds', { id: 400 + id, code, name, kind, owner, opening_balance: 0, sort }));
    Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => { if (T.state.data.settings.has(k)) return; const r = T.insert('settings', { id: k, key: k, value: k === 'default_photographer_id' ? '301' : v }); r.updatedAt = OLD; });
    NPDB.ops.ensureVenueExpenses();   // runs the one-time fund migrations before the first sync
  }

  function seedDemo() {
    if (T.setting('demo_loaded') === '1') return false;
    const t = new Date(); t.setHours(12, 0, 0, 0); const day = n => isoDate(new Date(t.getTime() + n * 864e5)), td = today();
    const ins = (c, rec) => T.insert(c, Object.assign({ is_demo: 1 }, rec));
    const sport = Object.fromEntries(T.all('sports').map(s => [s.name, s.id])), org = Object.fromEntries(T.all('organizers').map(o => [o.name, o.id])), septian = T.find('photographers', p => p.name === 'Septian').id;
    const fund = Object.fromEntries(T.all('funds').map(f => [f.code, f.id])), prev = Object.fromEntries(T.all('funds').map(f => [f.code, f.opening_balance]));
    T.setSetting('demo_prev_openings', JSON.stringify(prev));
    [['petty_cash', 500000], ['bank_account', 3000000]].forEach(([code, amt]) => { const f = T.get('funds', fund[code]); T.update('funds', f.id, { opening_balance: prev[code] || amt }); });
    const venues = [['Sunrise Pickleball Hub', 'Jl. Contoh Raya No. 12', 'Kemang', 150000, 'Parking, Toilets, Water refill, Lighting', 'Indoor', ['Pickleball', 'Badminton']],
      ['Garden Tennis Club', 'Jl. Taman Asri No. 5', 'Senayan', 200000, 'Parking, Toilets, Cafe', 'Outdoor', ['Tennis']], ['Arena Smash Badminton', 'Jl. Mawar No. 88', 'Tebet', 120000, 'Toilets, Water refill, Parking', 'Indoor', ['Badminton', 'Pickleball']]];
    const vid = venues.map(([n, addr, area, price, fac, setting, sps], i) => {
      const v = ins('venues', { venue_code: T.nextCode('venues', 'venue_code', 'VEN', 3), name: n, address: addr, area, rental_price: price, pricing_type: 'per hour', facilities: fac, setting, contact_person: 'Admin ' + n.split(' ')[0], contact_phone: '+62812000000' + (i + 1), notes: 'Demo venue – fictional data', active: 1 });
      sps.forEach(s => T.insert('venue_sports', { venue_id: v.id, sport_id: sport[s] })); return v.id;
    });
    const mids = ['Andi', 'Bella', 'Citra', 'Dimas', 'Eka', 'Fajar', 'Gita', 'Hendra', 'Intan', 'Joko'].map((n, i) =>
      ins('members', { member_code: T.nextCode('members', 'member_code', 'NPD', 3), reclub_id: 'RC' + (10231 + i), nickname: n, whatsapp: NPDB.normalizeWa('0812000000' + String(i + 1).padStart(2, '0')), registered_at: day(-70 + i + 1), notes: 'Demo member', active: 1 }).id);
    function mkSession(name, sp, ven, days, st, et, fee, vcost, mode, pfee, status, target, mx, vfund = 'bank_account') {
      const d = day(days), r = ins('sessions', { session_code: T.nextCode('sessions', 'session_code', 'SES-', 4), name, sport_id: sport[sp], venue_id: vid[ven], organizer_id: null, event_date: d, start_time: st, end_time: et,
        description: 'Demo session', max_participants: mx, status, reg_open: day(days - 10), reg_close: day(days - 1), venue_cost: vcost, session_fee: fee, target_participants: target, budget_extra: 0, photo_mode: mode,
        photographer_id: mode !== 'none' ? septian : null, photo_fee: pfee, npd_share_pct: 10, photographer_share_pct: 90, venue_fund_id: fund[vfund], cancel_reason: null });
      return [r.id, days];
    }
    function reg(sid, days, idxs, paidIdx, fee, o = {}) {
      const addon = o.addon || 0, photo = o.photo || [], attend = o.attend !== false;
      idxs.forEach(k => {
        let st = 'Waiting for Payment', amt = 0, ref = 0, pd = null; const ph = photo.includes(k) ? 1 : 0;
        if (paidIdx.has(k)) { st = 'Paid'; amt = fee + (ph ? addon : 0); pd = day(days - 2); }
        if (o.partial === k) { st = 'Partially Refunded'; ref = 20000; }
        if (o.refunded === k) { st = 'Refunded'; ref = amt; }
        const att = attend && ['Paid', 'Partially Refunded'].includes(st) ? 'Attended' : (attend && st === 'Refunded' ? 'Absent' : 'Not Yet Confirmed');
        T.insert('session_participants', { session_id: sid, member_id: mids[k], registered_at: day(days - 6), amount_paid: amt, payment_status: st, paid_date: pd, refund_amount: ref, refund_date: ref ? pd : null, photo_selected: ph, attendance: att });
      });
    }
    const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i), set = a => new Set(a);
    let [s1, d1] = mkSession('Sunday Pickleball Open Play', 'Pickleball', 0, -44, '08:00', '10:00', 120000, 300000, 'included', 10000, 'Completed', 12, 16); reg(s1, d1, range(0, 10), set(range(0, 8)), 120000, { partial: 7 });
    let [s2, d2] = mkSession('Tennis Social Rally', 'Tennis', 1, -30, '16:00', '18:00', 150000, 400000, 'excluded', 15000, 'Completed', 8, 8); reg(s2, d2, range(0, 7), set(range(0, 6)), 150000, { addon: 15000, photo: [0, 1, 2, 4], refunded: 5 });
    let [s3, d3] = mkSession('Badminton Mix Doubles', 'Badminton', 2, -16, '19:00', '21:00', 90000, 240000, 'none', 0, 'Completed', 12, 16, 'bank_account'); reg(s3, d3, range(2, 10), set(range(2, 9)), 90000);
    let [s4, d4] = mkSession('Pickleball Beginner Night', 'Pickleball', 0, 5, '19:00', '21:00', 120000, 300000, 'included', 10000, 'Open Registration', 12, 16); reg(s4, d4, range(0, 6), set([0, 1, 2]), 120000, { attend: false });
    let [s5, d5] = mkSession('Tennis Sunday Doubles', 'Tennis', 1, 12, '08:00', '10:00', 150000, 400000, 'excluded', 15000, 'Open Registration', 8, 8); reg(s5, d5, range(0, 4), set([0, 1]), 150000, { addon: 15000, photo: [0], attend: false });
    const exp = (days, cat, desc, amt, sid, method, src) => ins('expenses', { code: T.nextCode('expenses', 'code', 'EXP-', 6), txn_date: day(days), category: cat, description: desc, amount: amt, session_id: sid || null, source_fund_id: fund[src], payment_method: method || 'Cash', receipt: null, notes: null, created_by: 'demo' }).id;
    exp(-46, 'Amenities', 'Drinking water & towels', 60000, s1, 'Cash', 'petty_cash'); exp(-30, 'Transportation', 'Ball machine transport', 40000, s2, 'Cash', 'petty_cash'); exp(-16, 'Amenities', 'Water & snacks', 35000, s3, 'Cash', 'petty_cash');
    const balls = exp(-40, 'Equipment Purchase', 'Pickleball balls (3 dozen)', 450000, null, 'Bank Transfer', 'personal_sabit'); exp(-35, 'Marketing', 'Instagram ads', 150000, null, 'Bank Transfer', 'personal_julio'); exp(-8, 'Operational Expenses', 'Scoreboard & signage', 120000, null, 'Cash', 'petty_cash');
    const ftx = (days, kind, frm, to, amt, notes, eid) => ins('fund_transactions', { code: T.nextCode('fund_transactions', 'code', 'FT-', 5), txn_date: day(days), kind, from_fund_id: frm ? fund[frm] : null, to_fund_id: fund[to], amount: amt, expense_id: eid || null, notes, created_by: 'demo' });
    ftx(-50, 'contribution', null, 'personal_julio', 100000, 'Julio funded marketing (demo)'); ftx(-20, 'reimbursement', 'bank_account', 'personal_sabit', 200000, 'Partial reimbursement of ball purchase (demo)', balls);
    ins('revenue_records', { code: T.nextCode('revenue_records', 'code', 'REV-', 6), txn_date: day(-25), category: 'Other Revenue', description: 'Merchandise sales (demo)', amount: 200000, payment_method: 'Cash', notes: null, created_by: 'demo' });
    ins('photographer_payments', { code: T.nextCode('photographer_payments', 'code', 'PAY-', 5), photographer_id: septian, session_id: s1, amount: 60000, status: 'Paid', paid_date: day(-40), fund_id: null, payment_method: 'Bank Transfer', notes: 'Partial payment (demo)', created_by: 'demo' });
    const a = E.createProfitSharing(day(-50), day(-12), null, 'Demo – Period A', null, 1, 'demo'); E.finalizeProfitSharing(a, day(-11));
    const line = T.filter('profit_sharing_lines', l => l.profit_sharing_id === a).sort((x, y) => x.id - y.id)[0]; E.payOrganizerLine(line.id, day(-8), true);
    E.createProfitSharing(day(-11), day(-1), null, 'Demo – Period B', null, 1, 'demo');
    NPDB.ops.ensureVenueExpenses(); T.setSetting('demo_loaded', '1'); return true;
  }

  function clearDemo() {
    const n = {}, rm = (label, c, f) => { const rows = T.filter(c, f); rows.forEach(r => T.remove(c, r.id)); n[label] = rows.length; };
    const demoSess = new Set(T.filter('sessions', s => s.is_demo).map(s => s.id)), demoPs = new Set(T.filter('profit_sharing', p => p.is_demo).map(p => p.id));
    rm('fund_transactions', 'fund_transactions', x => x.is_demo); rm('profit_sharing_lines', 'profit_sharing_lines', l => demoPs.has(l.profit_sharing_id)); rm('profit_sharing', 'profit_sharing', p => p.is_demo);
    rm('photographer_payments', 'photographer_payments', p => p.is_demo); rm('expenses', 'expenses', e => e.is_demo || demoSess.has(e.session_id)); rm('revenue', 'revenue_records', r => r.is_demo);
    rm('participants', 'session_participants', p => demoSess.has(p.session_id)); rm('sessions', 'sessions', s => s.is_demo);
    const used = new Set(T.all('session_participants').map(p => p.member_id)); rm('members', 'members', m => m.is_demo && !used.has(m.id));
    const usedV = new Set(T.all('sessions').map(s => s.venue_id)); const dv = T.filter('venues', v => v.is_demo && !usedV.has(v.id)); dv.forEach(v => { T.filter('venue_sports', x => x.venue_id === v.id).forEach(x => T.remove('venue_sports', x.id)); T.remove('venues', v.id); }); n.venues = dv.length;
    try { Object.entries(JSON.parse(T.setting('demo_prev_openings', '{}') || '{}')).forEach(([code, amt]) => { const f = T.find('funds', x => x.code === code); if (f) T.update('funds', f.id, { opening_balance: amt }); }); } catch (e) { /* ignore */ }
    n.members_kept = T.filter('members', m => m.is_demo).length; T.setSetting('demo_loaded', '0'); return n;
  }
  NPDB.seed = { seedBase, seedDemo, clearDemo, DEFAULT_SETTINGS };

  const { add, ok, log } = R;
  add('POST', '/demo/load', 'settings', () => { const done = seedDemo(); log('load_demo', 'system'); return ok({ loaded: done }); });
  add('POST', '/demo/clear', 'settings', () => { const n = clearDemo(); log('clear_demo', 'system', null, n); return ok({ removed: n }); });
  add('GET', '/backup', 'settings', () => { log('backup', 'system'); const d = new Date(), p = x => String(x).padStart(2, '0'); return { __download: { name: `npd_backup_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`, mime: 'application/json', data: JSON.stringify(T.exportAll()) } }; });
})(typeof window !== 'undefined' ? window : globalThis);
