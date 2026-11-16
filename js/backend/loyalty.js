'use strict';
/* Loyalty: every 5 attended sessions earns a reward (25% -> 50% -> 75% -> free session), then the cycle restarts.
   Everything is derived from attendance, so there is nothing extra to sync. A reward is "used" when a paid registration points at it. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, E = NPDB.engine, { ApiError, sortBy, rnd } = NPDB, { add, ok } = NPDB.router;
  const STEP = 5, PCTS = [25, 50, 75, 100], CYCLE = STEP * PCTS.length;
  const label = pct => (pct === 100 ? 'Free Session' : `${pct}% OFF`);
  const PAID = ['Paid', 'Partially Refunded'];

  function attendedCount(mid, exceptPid) {
    let n = 0;
    for (const p of T.all('session_participants')) {
      if (p.member_id !== mid || p.id === exceptPid || p.attendance !== 'Attended') continue;
      const s = T.get('sessions', p.session_id); if (!s || s.status === 'Cancelled') continue;
      if (E.participantCalc(s, p).paid) n++;
    }
    return n;
  }
  const rewardPct = r => PCTS[(r - 1) % PCTS.length];
  function info(mid) {
    const n = attendedCount(mid), earned = Math.floor(n / STEP);
    const usedBy = new Map(); T.all('session_participants').forEach(p => { if (p.member_id === mid && p.loyalty_reward && PAID.includes(p.payment_status)) usedBy.set(p.loyalty_reward, p); });
    const rewards = []; for (let r = 1; r <= earned; r++) { const u = usedBy.get(r), s = u ? T.get('sessions', u.session_id) : null; rewards.push({ r, pct: rewardPct(r), label: label(rewardPct(r)), used: !!u, used_session: s ? s.name : null, discount: u ? u.loyalty_discount : 0 }); }
    const cycle = n === 0 ? 0 : ((n - 1) % CYCLE) + 1, nextAt = (Math.floor(n / STEP) + 1) * STEP, nextPct = rewardPct(Math.floor(n / STEP) + 1);
    return { count: n, cycle_count: cycle, cycle_no: Math.floor((Math.max(n, 1) - 1) / CYCLE) + 1, rewards, available: rewards.filter(x => !x.used), next: { at: nextAt, remaining: nextAt - n, pct: nextPct, label: label(nextPct) } };
  }
  function discountFor(mid, r, sess, exceptPid) {
    const n = attendedCount(mid, exceptPid), earned = Math.floor(n / STEP);
    if (!(r >= 1 && r <= earned)) throw new ApiError('Reward loyalty ini belum tersedia untuk member tersebut.', 409);
    const taken = T.all('session_participants').some(p => p.member_id === mid && p.id !== exceptPid && p.loyalty_reward === r && PAID.includes(p.payment_status));
    if (taken) throw new ApiError('Reward loyalty ini sudah dipakai di sesi lain.', 409);
    const fee = Number(sess.session_fee) || 0, base = Math.max(0, fee - (sess.photo_mode === 'included' ? Math.min(Number(sess.photo_fee) || 0, fee) : 0));
    return rnd(base * rewardPct(r) / 100);   // session fee only, photo is never discounted
  }

  add('GET', '/members/<int:mid>/loyalty', 'view', (c, mid) => { if (!T.get('members', mid)) throw new ApiError('Member tidak ditemukan.', 404); return ok(info(mid)); });
  add('GET', '/loyalty', 'view', () => {
    const rows = T.all('members').map(m => { const x = info(m.id); return { id: m.id, member_code: m.member_code, nickname: m.nickname, count: x.count, cycle_count: x.cycle_count, available: x.available.length, next: x.next }; });
    return ok({ members: sortBy(rows, r => -r.count), step: STEP, rewards: PCTS.map(p => ({ pct: p, label: label(p) })) });
  });
  NPDB.loyalty = { info, discountFor, attendedCount, label, STEP, PCTS };
})(typeof window !== 'undefined' ? window : globalThis);
