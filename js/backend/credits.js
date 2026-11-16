'use strict';
/* Saldo member (member credit): satu saldo rupiah per member. Buku saldo = tabel member_credits (earn / use / forfeit / refund). */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, E = NPDB.engine, R = NPDB.router, { ApiError, s, i, dt, today, sortBy, rnd } = NPDB;
  const { add, ok, log } = R;
  const num = x => Number(x) || 0;
  const sessOf = id => T.get('sessions', id);
  const entry = (o) => T.insert('member_credits', Object.assign({ code: T.nextCode('member_credits', 'code', 'CR-', 5), txn_date: today(), session_id: null, participant_id: null, reason: null, notes: null, created_by: 'app' }, o));
  const balance = mid => E.creditBalance(mid);

  /** Validate "pakai saldo" for a payment being saved. Returns the amount of credit used (0 if none). */
  function checkUse(mid, d, f, ex) {
    const had = ex ? num(ex.credit_used) : 0;
    let want = 'credit_use' in d ? Math.trunc(Number(d.credit_use) || 0) : had;
    if (want < 0) throw new ApiError('Saldo yang dipakai tidak boleh negatif.');
    if (want === 0) return 0;
    if (f.payment_status !== 'Paid') throw new ApiError('Saldo hanya bisa dipakai kalau status pembayaran Paid.');
    if (want > f.amount_paid) throw new ApiError('Saldo yang dipakai melebihi jumlah yang dibayar.');
    if (want > balance(mid) + had) throw new ApiError(`Saldo member tidak cukup (tersedia Rp${(balance(mid) + had).toLocaleString('id-ID')}).`, 409);
    return want;
  }
  /** Replace the "use" ledger entry of a participant so it matches the amount now used. */
  function recordUse(p, sess, U) {
    const old = T.filter('member_credits', c => c.participant_id === p.id && c.kind === 'use');
    if (old.length === 1 && old[0].amount === U) return;
    old.forEach(c => T.remove('member_credits', c.id));
    if (U > 0) entry({ member_id: p.member_id, kind: 'use', amount: U, txn_date: p.paid_date || today(), session_id: p.session_id, participant_id: p.id, reason: `Dipakai untuk ${sess.name}` });
  }
  /** Payment fields are frozen once a payment is tied to member credit. */
  function guardEdit(ex, d) {
    const conv = num(ex.credit_amount) > 0, used = num(ex.credit_used) > 0;
    if (!conv && !used) return;
    const same = (k, cur) => !(k in d) || d[k] === '' || d[k] === null || Number(d[k]) === Number(cur || 0);
    if (conv && ((('payment_status' in d) && d.payment_status !== ex.payment_status) || !same('amount_paid', ex.amount_paid) || !same('refund_amount', ex.refund_amount)))
      throw new ApiError('Pembayaran ini sudah dikonversi ke saldo member. Batalkan konversi dulu kalau perlu mengubahnya.', 409);
    if (used && 'credit_use' in d && Number(d.credit_use) === 0) return;
    if (used && ('payment_status' in d) && d.payment_status !== 'Paid') throw new ApiError('Pembayaran ini memakai saldo member. Kosongkan pemakaian saldo dulu sebelum refund atau membatalkan.', 409);
  }

  function partCtx(pid) {
    const p = T.get('session_participants', pid); if (!p) throw new ApiError('Registrasi tidak ditemukan.', 404);
    const sess = sessOf(p.session_id), m = T.get('members', p.member_id); if (!sess || !m) throw new ApiError('Data sesi/member tidak ditemukan.', 404);
    return { p, sess, m, cal: E.participantCalc(sess, p) };
  }
  function toCredit(p, amount, extra, reason, sess) {
    const refund = num(p.refund_amount) + amount, credit = num(p.credit_amount) + amount;
    T.update('session_participants', p.id, Object.assign({ refund_amount: refund, credit_amount: credit, refund_date: today(), payment_status: refund >= p.amount_paid ? 'Refunded' : 'Partially Refunded' }, extra));
    entry({ member_id: p.member_id, kind: 'earn', amount, session_id: p.session_id, participant_id: p.id, reason });
  }

  add('POST', '/participants/<int:pid>/credit', 'operations', ({ body: d }, pid) => {
    const { p, sess, m, cal } = partCtx(pid), kind = d.kind, action = d.action;
    if (!E.PAID_STATES.includes(p.payment_status) || cal.retained <= 0) throw new ApiError('Peserta ini belum membayar (atau sudah di-refund penuh).');
    if (kind === 'noshow') {
      if (num(p.credit_amount) > 0 || p.noshow_forfeit) throw new ApiError('Peserta ini sudah diproses.', 409);
      if (action === 'forfeit') { T.update('session_participants', pid, { attendance: 'Absent', noshow_forfeit: 1 }); log('noshow-forfeit', 'participant', pid, { retained: cal.retained }); return ok({ credit: 0 }); }
      if (action !== 'credit') throw new ApiError('Pilih: jadikan saldo atau hangus.');
      toCredit(p, cal.retained, { attendance: 'Absent' }, `Tidak hadir – ${sess.name}`, sess);
      log('noshow-credit', 'participant', pid, { amount: cal.retained }); return ok({ credit: cal.retained, balance: balance(p.member_id) });
    }
    if (kind === 'photo') {
      if (p.photo_waived) throw new ApiError('Foto peserta ini sudah dijadikan saldo.', 409);
      if (!(sess.photo_mode === 'included' || (sess.photo_mode === 'excluded' && p.photo_selected))) throw new ApiError('Peserta ini tidak punya jatah foto di sesi ini.');
      const amt = rnd(cal.photo); if (!(amt > 0)) throw new ApiError('Tidak ada nilai foto yang bisa dijadikan saldo.');
      toCredit(p, amt, { photo_waived: 1 }, `Foto tidak dipakai – ${sess.name}`, sess);
      log('photo-credit', 'participant', pid, { amount: amt }); return ok({ credit: amt, balance: balance(p.member_id) });
    }
    throw new ApiError('Jenis konversi tidak dikenal.');
  });

  add('POST', '/participants/<int:pid>/credit/undo', 'operations', (c, pid) => {
    const { p } = partCtx(pid), earns = T.filter('member_credits', x => x.participant_id === pid && x.kind === 'earn');
    if (!earns.length && !p.noshow_forfeit) throw new ApiError('Tidak ada konversi yang bisa dibatalkan.');
    const total = earns.reduce((a, x) => a + x.amount, 0);
    if (total > balance(p.member_id)) throw new ApiError('Saldo dari konversi ini sudah terpakai, jadi tidak bisa dibatalkan.', 409);
    earns.forEach(x => T.remove('member_credits', x.id));
    const refund = Math.max(0, num(p.refund_amount) - total);
    T.update('session_participants', pid, { refund_amount: refund, credit_amount: Math.max(0, num(p.credit_amount) - total), photo_waived: 0, noshow_forfeit: 0, refund_date: refund > 0 ? p.refund_date : null,
      payment_status: refund >= p.amount_paid ? 'Refunded' : refund > 0 ? 'Partially Refunded' : 'Paid' });
    log('credit-undo', 'participant', pid, { amount: total }); return ok();
  });

  add('GET', '/members/<int:mid>/credit', 'view', (c, mid) => {
    const m = T.get('members', mid); if (!m) throw new ApiError('Member tidak ditemukan.', 404);
    const rows = sortBy(T.filter('member_credits', x => x.member_id === mid), x => x.txn_date + String(x.id).padStart(20, '0')).reverse().map(x => {
      const ss = x.session_id ? sessOf(x.session_id) : null; return Object.assign({}, x, { signed: x.kind === 'earn' ? x.amount : -x.amount, session_name: ss ? ss.name : null });
    });
    return ok({ balance: Math.max(0, balance(mid)), entries: rows });
  });

  add('POST', '/members/<int:mid>/credit/forfeit', 'finance', ({ body: d }, mid) => {
    const m = T.get('members', mid); if (!m) throw new ApiError('Member tidak ditemukan.', 404);
    const amt = i(d, 'amount', true, 1, 1e11, null, 'Jumlah'), date = dt(d, 'txn_date', false, 'Tanggal') || today();
    if (amt > balance(mid)) throw new ApiError('Jumlah melebihi saldo member.', 409);
    const e = entry({ member_id: mid, kind: 'forfeit', amount: amt, txn_date: date, reason: s(d, 'reason', false, 200) || 'Saldo hangus' });
    T.insert('revenue_records', { code: T.nextCode('revenue_records', 'code', 'REV-', 6), txn_date: date, category: 'Forfeited Member Credit', description: `Saldo hangus – ${m.nickname}`, amount: amt, payment_method: 'Cash', notes: 'Pendapatan non-tunai dari saldo member yang hangus', noncash: 1, credit_id: e.id, created_by: 'system', is_demo: 0 });
    log('credit-forfeit', 'member', mid, { amount: amt }); return ok({ balance: balance(mid) });
  });
  add('POST', '/members/<int:mid>/credit/refund', 'finance', ({ body: d }, mid) => {
    const m = T.get('members', mid); if (!m) throw new ApiError('Member tidak ditemukan.', 404);
    const amt = i(d, 'amount', true, 1, 1e11, null, 'Jumlah'), date = dt(d, 'txn_date', false, 'Tanggal') || today();
    if (amt > balance(mid)) throw new ApiError('Jumlah melebihi saldo member.', 409);
    entry({ member_id: mid, kind: 'refund', amount: amt, txn_date: date, reason: s(d, 'reason', false, 200) || 'Refund saldo tunai' });
    log('credit-refund', 'member', mid, { amount: amt }); return ok({ balance: balance(mid) });
  });

  /** NPD cancels a session (rain etc.): every paid participant gets credit (default) or a cash refund. */
  add('POST', '/sessions/<int:sid>/cancel', 'operations', ({ body: d }, sid) => {
    const sess = sessOf(sid); if (!sess) throw new ApiError('Sesi tidak ditemukan.', 404);
    if (sess.status === 'Cancelled') throw new ApiError('Sesi ini sudah dibatalkan.', 409);
    const mode = d.mode === 'refund' ? 'refund' : 'credit', reason = s(d, 'reason', false, 200) || 'Sesi dibatalkan oleh NPD';
    let n = 0, total = 0;
    T.all('session_participants').filter(p => p.session_id === sid).forEach(p => {
      const cal = E.participantCalc(sess, p);
      if (E.PAID_STATES.includes(p.payment_status) && cal.retained > 0) {
        if (mode === 'credit') toCredit(p, cal.retained, {}, `Sesi dibatalkan – ${sess.name}`, sess);
        else {
          const back = Math.min(num(p.credit_used), cal.retained);   // part that was paid with credit goes back to credit, never to cash
          T.update('session_participants', p.id, { refund_amount: num(p.refund_amount) + cal.retained, credit_amount: num(p.credit_amount) + back, refund_date: today(), payment_status: 'Refunded' });
          if (back > 0) entry({ member_id: p.member_id, kind: 'earn', amount: back, session_id: sid, participant_id: p.id, reason: `Sesi dibatalkan – ${sess.name}` });
        }
        n++; total += cal.retained;
      } else if (p.payment_status === 'Waiting for Payment') T.update('session_participants', p.id, { payment_status: 'Cancelled' });
    });
    T.update('sessions', sid, { status: 'Cancelled', cancel_reason: reason });
    NPDB.ops.ensureVenueExpenses(); log('cancel', 'session', sid, { mode, participants: n, total });
    return ok({ participants: n, total, mode });
  });

  add('GET', '/member-credits', 'view', () => {
    const cb = E.creditBalances(), rows = T.all('members').map(m => ({ id: m.id, member_code: m.member_code, nickname: m.nickname, balance: cb.get(m.id) || 0 })).filter(r => r.balance > 0);
    return ok({ members: sortBy(rows, r => -r.balance), total: rows.reduce((a, r) => a + r.balance, 0) });
  });

  NPDB.credits = { checkUse, recordUse, guardEdit, balance };
})(typeof window !== 'undefined' ? window : globalThis);
