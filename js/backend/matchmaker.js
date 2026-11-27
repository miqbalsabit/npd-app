'use strict';
/* Match generator: balanced teams, newbies paired with strong players, a few "seru" top-vs-top matches,
   and an equal number of matches played per member (rest rotates).  Pure function + API routes. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, E = NPDB.engine, { ApiError, sortBy } = NPDB, { add, ok } = NPDB.router;
  const PAID = ['Paid', 'Partially Refunded'];

  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /** players: [{id, level, name}]. opts: mode 'doubles'|'singles', courts, rounds (0 = auto), featured (count), featuredMin, hostLevel, seed */
  function generate(players, o = {}) {
    const mode = o.mode === 'singles' ? 'singles' : 'doubles', per = mode === 'doubles' ? 2 : 1, size = per * 2, r = rng(o.seed || Date.now());
    const P = players.map(p => ({ id: p.id, level: Math.min(5, Math.max(1, +p.level || 2)), name: p.name, host: false }));
    if (P.length % 2 === 1) P.push({ id: 0, level: Math.min(5, Math.max(1, +o.hostLevel || 3)), name: 'Host', host: true });
    const N = P.length; if (N < size) throw new ApiError(`Minimal ${size} pemain untuk ${mode === 'doubles' ? '2 vs 2' : '1 vs 1'} (sekarang ${N}).`);
    const lv = new Map(P.map(p => [p.id, p.level]));
    const c = Math.max(1, Math.min(Math.trunc(o.courts) || 1, Math.floor(N / size))), active = c * size, need = N - active;
    let R = Math.trunc(o.rounds) || 0;
    if (!R) { if (!need) R = 6; else { R = 0; for (let k = 4; k <= 12; k++) if ((k * active) % N === 0) { R = k; break; } if (!R) R = 8; } }
    const featMin = o.featuredMin || 4, F = Math.min(R, o.featured === undefined || o.featured === null ? Math.max(1, Math.round(R / 3)) : Math.max(0, Math.trunc(o.featured)));
    const featRounds = new Set(); for (let i = 0; i < F; i++) featRounds.add(Math.floor((i + 0.5) * R / F));
    const plays = new Map(P.map(p => [p.id, 0])), lastRest = new Map(P.map(p => [p.id, -9])), pair = new Map(), opp = new Map();
    const key = (a, b) => a < b ? a + '_' + b : b + '_' + a, cnt = (m, a, b) => m.get(key(a, b)) || 0;
    const inc = (m, a, b) => m.set(key(a, b), cnt(m, a, b) + 1);
    // best split of one match's players into two teams
    const split = ids => {
      const L = i => lv.get(i);
      const opts = per === 1 ? [[[ids[0]], [ids[1]]]] : [[[ids[0], ids[1]], [ids[2], ids[3]]], [[ids[0], ids[2]], [ids[1], ids[3]]], [[ids[0], ids[3]], [ids[1], ids[2]]]];
      let best = null;
      for (const [a, b] of opts) {
        const sa = a.reduce((x, i) => x + L(i), 0), sb = b.reduce((x, i) => x + L(i), 0);
        let cost = Math.abs(sa - sb) * 12;
        if (per === 2) for (const t of [a, b]) { cost += cnt(pair, t[0], t[1]) * 10; const lo = Math.min(L(t[0]), L(t[1])), hi = Math.max(L(t[0]), L(t[1])); if (lo <= 2 && hi >= 4) cost -= 3; if (lo <= 2 && hi <= 2) cost += 2; }
        for (const x of a) for (const y of b) cost += cnt(opp, x, y) * (per === 2 ? 3 : 6);
        if (!best || cost < best.cost) best = { a, b, cost };
      }
      return best;
    };
    const partition = (ids, n) => {
      if (!n) return [];
      let best = null;
      for (let it = 0; it < 900; it++) {
        const sh = shuffle(ids.slice(), r), ms = []; let cost = 0;
        for (let k = 0; k < n; k++) { const m = split(sh.slice(k * size, (k + 1) * size)); ms.push(m); cost += m.cost; }
        if (!best || cost < best.cost) best = { ms, cost };
      }
      return best.ms;
    };
    const topCut = P.map(p => p.level).sort((x, y) => y - x)[size - 1];   // strong = featuredMin, or the session's own top group when fewer players are that good
    const rounds = []; let lastRoundRest = new Set();
    for (let rd = 0; rd < R; rd++) {
      const isF = featRounds.has(rd);
      // who rests: most matches played first, never twice in a row if avoidable, strong players stay on featured rounds
      let order = shuffle(P.slice(), r).sort((x, y) => (plays.get(y.id) - plays.get(x.id)) || (isF ? x.level - y.level : 0));
      const fresh = order.filter(p => !lastRoundRest.has(p.id)), tired = order.filter(p => lastRoundRest.has(p.id));
      const rest = fresh.concat(tired).slice(0, need), restIds = new Set(rest.map(p => p.id));
      const act = P.filter(p => !restIds.has(p.id)).map(p => p.id);
      let ms = [], feat = null;
      if (isF) {
        const top = act.slice().sort((x, y) => lv.get(y) - lv.get(x) || r() - .5).slice(0, size);
        const m = split(top); feat = { a: m.a, b: m.b, featured: true };   // the organiser asked for F featured matches: the strongest active players of that round, always labelled
      }
      const left = feat ? act.filter(i => ![...feat.a, ...feat.b].includes(i)) : act;
      ms = partition(left, c - (feat ? 1 : 0)).map(m => ({ a: m.a, b: m.b, featured: false }));
      if (feat) ms.unshift(feat);
      ms.forEach((m, k) => {
        m.court = k + 1;
        for (const t of [m.a, m.b]) { if (per === 2) inc(pair, t[0], t[1]); }
        for (const x of m.a) for (const y of m.b) inc(opp, x, y);
        [...m.a, ...m.b].forEach(i => plays.set(i, plays.get(i) + 1));
      });
      rest.forEach(p => lastRest.set(p.id, rd)); lastRoundRest = new Set(rest.map(p => p.id));
      rounds.push({ n: rd + 1, matches: ms, rest: rest.map(p => p.id) });
    }
    const pl = [...plays.values()], cntAll = rounds.reduce((x, y) => x + y.matches.length, 0);
    return { mode, courts: c, rounds, players: P, plays: Object.fromEntries(plays), summary: { players: N, host: P.some(p => p.host), matches: cntAll, min_plays: Math.min(...pl), max_plays: Math.max(...pl), featured: rounds.reduce((x, y) => x + y.matches.filter(m => m.featured).length, 0) } };
  }

  // ---------------------------------------------------------------- data helpers
  const skillOf = (mid, sid) => T.find('member_skills', x => x.member_id === mid && x.sport_id === sid);
  const sessionOf = sid => { const s = T.get('sessions', sid); if (!s) throw new ApiError('Sesi tidak ditemukan.', 404); return s; };
  function priorCount(mid, sess) {
    let n = 0;
    for (const p of T.all('session_participants')) {
      if (p.member_id !== mid || p.session_id === sess.id || p.attendance !== 'Attended') continue;
      const s = T.get('sessions', p.session_id); if (!s || s.status === 'Cancelled' || s.event_date > sess.event_date) continue;
      if (E.participantCalc(s, p).paid) n++;
    }
    return n;
  }
  const levelFor = (mid, sess) => { const k = skillOf(mid, sess.sport_id), first = priorCount(mid, sess) < 2; return { level: k ? k.level : (first ? 1 : 2), level_set: !!k, first_timer: first }; };
  const matchesOf = sid => sortBy(T.filter('session_matches', m => m.session_id === sid), 'round', 'court');
  const nameOf = id => id === 0 ? 'Host' : ((T.get('members', id) || {}).nickname || '?');
  const view = m => ({ id: m.id, round: m.round, court: m.court, mode: m.mode, featured: !!m.featured, a: [m.a1, m.a2].filter(x => x !== null && x !== undefined), b: [m.b1, m.b2].filter(x => x !== null && x !== undefined), score_a: m.score_a, score_b: m.score_b });
  function summary(sid) {
    const ms = matchesOf(sid), plays = new Map(), wins = new Map();
    for (const m of ms) { const A = [m.a1, m.a2].filter(x => x != null), B = [m.b1, m.b2].filter(x => x != null); [...A, ...B].forEach(i => plays.set(i, (plays.get(i) || 0) + 1)); if (m.score_a != null && m.score_b != null && m.score_a !== m.score_b) (m.score_a > m.score_b ? A : B).forEach(i => wins.set(i, (wins.get(i) || 0) + 1)); }
    const rows = [...plays.entries()].map(([id, n]) => ({ id, name: nameOf(id), plays: n, wins: wins.get(id) || 0 }));
    const pl = rows.map(x => x.plays);
    return { rows: sortBy(rows, x => -x.plays, 'name'), min_plays: pl.length ? Math.min(...pl) : 0, max_plays: pl.length ? Math.max(...pl) : 0, rounds: ms.length ? Math.max(...ms.map(m => m.round)) : 0, matches: ms.length };
  }

  add('GET', '/sessions/<int:sid>/matchup', 'view', (c, sid) => {
    const s = sessionOf(sid), sp = T.get('sports', s.sport_id);
    const players = sortBy(T.filter('session_participants', p => p.session_id === sid && p.payment_status !== 'Cancelled').map(p => {
      const m = T.get('members', p.member_id); if (!m) return null;
      return Object.assign({ member_id: m.id, nickname: m.nickname, member_code: m.member_code, payment_status: p.payment_status, attendance: p.attendance, eligible: PAID.includes(p.payment_status) && p.attendance !== 'No Show' }, levelFor(m.id, s));
    }).filter(Boolean), x => x.nickname.toLowerCase());
    return ok({ session: { id: s.id, name: s.name, sport: sp ? sp.name : '', event_date: s.event_date }, players, matches: matchesOf(sid).map(view), names: Object.fromEntries([[0, 'Host']].concat(players.map(p => [p.member_id, p.nickname]))), summary: summary(sid), host_level: Number(T.setting('host_level', '3')) });
  });
  add('PUT', '/member-skills', 'operations', ({ body: d }) => {
    const mid = Math.trunc(Number(d.member_id)), sid = Math.trunc(Number(d.sport_id)), lv = d.level === '' || d.level == null ? 0 : Math.trunc(Number(d.level));
    if (!T.get('members', mid) || !T.get('sports', sid)) throw new ApiError('Member atau olahraga tidak ditemukan.', 404);
    if (lv === 0) { const old = skillOf(mid, sid); if (old) T.remove('member_skills', old.id); return ok({ member_id: mid, sport_id: sid, level: null }); }
    if (!(lv >= 1 && lv <= 5)) throw new ApiError('Level harus 1–5.');
    const ex = skillOf(mid, sid); if (ex) T.update('member_skills', ex.id, { level: lv }); else T.insert('member_skills', { member_id: mid, sport_id: sid, level: lv });
    return ok({ member_id: mid, sport_id: sid, level: lv });
  });
  add('GET', '/members/<int:mid>/skills', 'view', (c, mid) => { if (!T.get('members', mid)) throw new ApiError('Member tidak ditemukan.', 404); return ok({ skills: T.filter('member_skills', k => k.member_id === mid).map(k => ({ sport_id: k.sport_id, level: k.level })) }); });
  add('POST', '/sessions/<int:sid>/matchup/generate', 'operations', ({ body: d }, sid) => {
    const s = sessionOf(sid), ids = (Array.isArray(d.members) ? d.members : []).map(Number);
    if (!['doubles', 'singles'].includes(d.mode)) throw new ApiError('Pilih format 2 vs 2 atau 1 vs 1.');
    const have = matchesOf(sid); if (have.some(m => m.score_a != null || m.score_b != null) && !d.force) throw new ApiError('Sudah ada skor tersimpan. Generate ulang akan menghapus semua match dan skor sesi ini.', 409);
    const players = [...new Set(ids)].filter(id => T.filter('session_participants', p => p.session_id === sid && p.member_id === id && p.payment_status !== 'Cancelled').length).map(id => ({ id, name: nameOf(id), level: levelFor(id, s).level }));
    const hostLevel = Math.min(5, Math.max(1, Math.trunc(Number(d.host_level)) || 3));
    const out = generate(players, { mode: d.mode, courts: Math.min(10, Math.max(1, Math.trunc(Number(d.courts)) || 1)), rounds: Math.min(20, Math.max(0, Math.trunc(Number(d.rounds)) || 0)), featured: d.featured === '' || d.featured == null ? undefined : Math.trunc(Number(d.featured)), featuredMin: Math.trunc(Number(d.featured_min)) || 4, hostLevel, seed: Math.trunc(Number(d.seed)) || undefined });
    have.forEach(m => T.remove('session_matches', m.id));
    const batch = Date.now();
    for (const rd of out.rounds) for (const m of rd.matches) T.insert('session_matches', { session_id: sid, batch, round: rd.n, court: m.court, mode: out.mode, a1: m.a[0] ?? null, a2: m.a[1] ?? null, b1: m.b[0] ?? null, b2: m.b[1] ?? null, featured: m.featured ? 1 : 0, score_a: null, score_b: null });
    T.setSetting && T.setSetting('host_level', String(hostLevel));
    return ok({ rounds: out.rounds.map(r => ({ n: r.n, rest: r.rest })), summary: out.summary });
  });
  add('DELETE', '/sessions/<int:sid>/matchup', 'operations', (c, sid) => { sessionOf(sid); matchesOf(sid).forEach(m => T.remove('session_matches', m.id)); return ok({ deleted: true }); });
  // players of a hand-made match: member ids that are registered in the session, or 0 = Host
  function teams(sid, d, m) {
    const A = Array.isArray(d.a) ? d.a.map(Number) : m ? [m.a1, m.a2].filter(x => x != null) : [], B = Array.isArray(d.b) ? d.b.map(Number) : m ? [m.b1, m.b2].filter(x => x != null) : [];
    if (!(A.length === B.length && (A.length === 1 || A.length === 2))) throw new ApiError('Tiap tim harus 1 pemain (1 vs 1) atau 2 pemain (2 vs 2), jumlahnya sama.');
    const all = [...A, ...B]; if (new Set(all).size !== all.length) throw new ApiError('Satu pemain tidak boleh muncul dua kali dalam match.');
    for (const id of all) if (id !== 0 && !T.filter('session_participants', p => p.session_id === sid && p.member_id === id && p.payment_status !== 'Cancelled').length) throw new ApiError(`${nameOf(id)} tidak terdaftar di sesi ini.`);
    return { A, B };
  }
  const slots = (A, B) => ({ a1: A[0] ?? null, a2: A[1] ?? null, b1: B[0] ?? null, b2: B[1] ?? null, mode: A.length === 2 ? 'doubles' : 'singles' });
  function clash(sid, round, ids, exceptId) { const x = matchesOf(sid).find(o => o.id !== exceptId && o.round === round && [o.a1, o.a2, o.b1, o.b2].some(i => i != null && ids.includes(i))); return x ? `${nameOf([x.a1, x.a2, x.b1, x.b2].find(i => i != null && ids.includes(i)))} sudah main di ronde ${round} (lapangan ${x.court}).` : null; }
  add('POST', '/sessions/<int:sid>/matches', 'operations', ({ body: d }, sid) => {
    sessionOf(sid); const ex = matchesOf(sid), last = ex.length ? Math.max(...ex.map(m => m.round)) : 0;
    const round = Math.trunc(Number(d.round)) || last + 1; if (round < 1 || round > 99) throw new ApiError('Ronde harus 1–99.');
    const { A, B } = teams(sid, d, null), bad = clash(sid, round, [...A, ...B], null); if (bad && !d.force) throw new ApiError(bad + ' Tetap simpan?', 409);
    const court = Math.trunc(Number(d.court)) || (Math.max(0, ...ex.filter(m => m.round === round).map(m => m.court)) + 1);
    const sa = d.score_a === '' || d.score_a == null ? null : Math.trunc(Number(d.score_a)), sb = d.score_b === '' || d.score_b == null ? null : Math.trunc(Number(d.score_b));
    if ((sa === null) !== (sb === null)) throw new ApiError('Isi skor kedua tim.'); if (sa !== null && !(sa >= 0 && sa <= 99 && sb >= 0 && sb <= 99)) throw new ApiError('Skor harus 0–99.');
    const r = T.insert('session_matches', Object.assign({ session_id: sid, batch: Date.now(), round, court, featured: d.featured ? 1 : 0, custom: 1, score_a: sa, score_b: sb }, slots(A, B)));
    return ok(view(r));
  });
  add('DELETE', '/matches/<int:mid>', 'operations', (c, mid) => { if (!T.get('session_matches', mid)) throw new ApiError('Match tidak ditemukan.', 404); T.remove('session_matches', mid); return ok({ deleted: true }); });
  add('PUT', '/matches/<int:mid>', 'operations', ({ body: d }, mid) => {
    const m = T.get('session_matches', mid); if (!m) throw new ApiError('Match tidak ditemukan.', 404);
    if (Array.isArray(d.a) || Array.isArray(d.b) || 'round' in d || 'court' in d || 'featured' in d) {
      const { A, B } = teams(m.session_id, d, m), round = 'round' in d ? Math.trunc(Number(d.round)) : m.round; if (!(round >= 1 && round <= 99)) throw new ApiError('Ronde harus 1–99.');
      const bad = clash(m.session_id, round, [...A, ...B], m.id); if (bad && !d.force) throw new ApiError(bad + ' Tetap simpan?', 409);
      const patch = Object.assign({ round, court: 'court' in d ? Math.max(1, Math.trunc(Number(d.court)) || m.court) : m.court, featured: 'featured' in d ? (d.featured ? 1 : 0) : m.featured }, slots(A, B));
      if ('score_a' in d || 'score_b' in d) { const sa = d.score_a === '' || d.score_a == null ? null : Math.trunc(Number(d.score_a)), sb = d.score_b === '' || d.score_b == null ? null : Math.trunc(Number(d.score_b)); if ((sa === null) !== (sb === null)) throw new ApiError('Isi skor kedua tim.'); patch.score_a = sa; patch.score_b = sb; }
      T.update('session_matches', mid, patch); return ok(view(T.get('session_matches', mid)));
    }
    const sc = k => { if (!(k in d)) return m[k]; if (d[k] === '' || d[k] === null) return null; const n = Math.trunc(Number(d[k])); if (!(n >= 0 && n <= 99)) throw new ApiError('Skor harus 0–99.'); return n; };
    const a = sc('score_a'), b = sc('score_b'); if ((a === null) !== (b === null)) throw new ApiError('Isi skor kedua tim.');
    const patch = { score_a: a, score_b: b };
    for (const k of ['a1', 'a2', 'b1', 'b2']) if (k in d) { const v = d[k] === '' || d[k] === null ? null : Math.trunc(Number(d[k])); if (v !== null && v !== 0 && !T.get('members', v)) throw new ApiError('Pemain tidak ditemukan.'); patch[k] = v; }
    T.update('session_matches', mid, patch); return ok(view(T.get('session_matches', mid)));
  });
  add('GET', '/members/<int:mid>/match-stats', 'view', (c, mid) => {
    if (!T.get('members', mid)) throw new ApiError('Member tidak ditemukan.', 404);
    const mine = T.all('session_matches').filter(m => [m.a1, m.a2, m.b1, m.b2].includes(mid)), bySport = new Map(); let w = 0, l = 0, dr = 0, played = 0;
    const rows = mine.map(m => { const s = T.get('sessions', m.session_id), A = [m.a1, m.a2].includes(mid), scored = m.score_a != null && m.score_b != null; played++; let res = null; if (scored) { res = m.score_a === m.score_b ? 'D' : ((m.score_a > m.score_b) === A ? 'W' : 'L'); if (res === 'W') w++; else if (res === 'L') l++; else dr++; } const sp = s && T.get('sports', s.sport_id); if (sp) { const x = bySport.get(sp.name) || { sport: sp.name, played: 0, wins: 0, losses: 0 }; x.played++; if (res === 'W') x.wins++; if (res === 'L') x.losses++; bySport.set(sp.name, x); } return { date: s ? s.event_date : '', session: s ? s.name : '', result: res, score: scored ? (A ? `${m.score_a}-${m.score_b}` : `${m.score_b}-${m.score_a}`) : null, partner: [m.a1, m.a2, m.b1, m.b2].filter((x, i) => x != null && x !== mid && (i < 2) === A && true).map(nameOf).join(' & '), vs: [m.a1, m.a2, m.b1, m.b2].map((x, i) => ({ x, i })).filter(o => o.x != null && (o.i < 2) !== A).map(o => nameOf(o.x)).join(' & ') }; });
    const levels = T.filter('member_skills', k => k.member_id === mid).map(k => { const sp = T.get('sports', k.sport_id); return { sport: sp ? sp.name : '', level: k.level }; });
    return ok({ played, wins: w, losses: l, draws: dr, win_rate: w + l + dr ? Math.round(w * 100 / (w + l + dr)) : null, by_sport: [...bySport.values()], levels, recent: sortBy(rows, x => x.date).reverse().slice(0, 10) });
  });
  NPDB.matchmaker = { generate };
})(typeof window !== 'undefined' ? window : globalThis);
