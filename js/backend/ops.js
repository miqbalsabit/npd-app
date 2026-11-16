'use strict';
/* NPD backend (in-browser) – auth/profile, master data, venues, members, sessions, participants, calendar. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, E = NPDB.engine, R = NPDB.router, { ApiError, s, i, pct, dt, tm, oneOf, today, nowStr, sortBy, sum, num, rnd, hoursBetween, normalizeWa } = NPDB;
  const { add, ok, has, log, stripFin, pageArgs, like } = R;

  const SESSION_STATUS = ['Draft', 'Open Registration', 'Full', 'Completed', 'Cancelled'];
  const PAY_STATUS = ['Waiting for Payment', 'Paid', 'Cancelled', 'Refunded', 'Partially Refunded'];
  const ATTENDANCE = ['Attended', 'Absent', 'Not Yet Confirmed'];
  const PHOTO_MODES = ['included', 'excluded', 'none'];
  const EXPENSE_CATS = ['Venue Rental', 'Equipment Purchase', 'Amenities', 'Operational Expenses', 'Marketing', 'Transportation', 'Other'];
  const act = r => (r.active ? 1 : 0);
  const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
  const spendOf = sp => (E.PAID_STATES.includes(sp.payment_status) ? sp.amount_paid - (sp.payment_status === 'Refunded' && !sp.refund_amount ? sp.amount_paid : sp.refund_amount) : 0);

  // =============================================================== auth (device profile)
  add('GET', '/auth/me', 'view', () => ok({ user: R.auth.user }));
  add('POST', '/auth/logout', null, () => { R.setProfile(null); return ok(); });

  // =============================================================== meta / settings
  add('GET', '/meta', 'view', () => {
    const fin = has('finance');
    const venues = sortBy(T.all('venues'), v => (v.name || '').toLowerCase()).map(v => {
      const o = pick(v, ['id', 'venue_code', 'name', 'area', 'rental_price', 'pricing_type', 'setting', 'status', 'maps_url', 'is_demo']);
      o.sport_ids = T.all('venue_sports').filter(x => x.venue_id === v.id).map(x => x.sport_id); if (!fin) delete o.rental_price; return o;
    });
    let st = Object.fromEntries(T.all('settings').map(r => [r.key, r.value]));
    if (!fin) st = Object.fromEntries(Object.entries(st).filter(([k]) => ['business_name', 'currency', 'demo_loaded'].includes(k)));
    return ok({
      sports: sortBy(T.all('sports'), 'id').map(x => pick(x, ['id', 'name', 'color', 'active'])), venues,
      organizers: sortBy(T.all('organizers'), 'id').map(x => pick(x, ['id', 'name', 'share_pct', 'active'])),
      photographers: sortBy(T.all('photographers'), 'id').map(x => pick(x, fin ? ['id', 'name', 'active', 'default_fee', 'default_npd_share'] : ['id', 'name', 'active'])),
      funds: fin ? sortBy(T.all('funds'), 'sort').map(x => pick(x, ['id', 'code', 'name', 'kind', 'owner', 'opening_balance'])) : [],
      settings: st, user: R.auth.user,
      enums: { session_status: SESSION_STATUS, payment_status: PAY_STATUS, attendance: ATTENDANCE, photo_modes: PHOTO_MODES, expense_categories: EXPENSE_CATS, payment_methods: ['Cash', 'Bank Transfer', 'QRIS', 'E-Wallet', 'Other'] },
    });
  });
  add('GET', '/settings', 'settings', () => ok({ settings: Object.fromEntries(T.all('settings').map(r => [r.key, r.value])) }));
  add('PUT', '/settings', 'settings', ({ body: d }) => {
    const clean = {};
    if ('business_name' in d) clean.business_name = s(d, 'business_name', true, 100);
    if ('financial_period_start_month' in d) clean.financial_period_start_month = i(d, 'financial_period_start_month', false, 1, 12);
    if ('opening_cash' in d) clean.opening_cash = i(d, 'opening_cash', false, -1e11);
    if ('default_photographer_id' in d) clean.default_photographer_id = d.default_photographer_id || '';
    if ('default_photo_fee' in d) clean.default_photo_fee = i(d, 'default_photo_fee', false, 0);
    if ('default_photo_mode' in d) clean.default_photo_mode = oneOf(d, 'default_photo_mode', PHOTO_MODES);
    if ('default_npd_share' in d) clean.default_npd_share = pct(d, 'default_npd_share', null, 'NPD share');
    if ('default_petty_pct' in d) clean.default_petty_pct = pct(d, 'default_petty_pct', null, 'NPD Petty Cash');
    if ('default_venue_fund' in d) { if (!T.find('funds', f => f.code === d.default_venue_fund)) throw new ApiError('Unknown fund.'); clean.default_venue_fund = d.default_venue_fund; }
    const old = Object.fromEntries(Object.keys(clean).map(k => [k, T.setting(k)]));
    Object.entries(clean).forEach(([k, v]) => T.setSetting(k, v === null ? '' : v));
    log('update', 'settings', null, { old, new: clean }); return ok();
  });
  add('PUT', '/sports/<int:sid>', 'settings', ({ body: d }, sid) => {
    const name = s(d, 'name', true, 40), color = s(d, 'color', true, 7);
    if (!color.startsWith('#') || color.length !== 7) throw new ApiError('Color must be a hex value like #C8E000.');
    if (T.find('sports', x => x.id !== sid && x.name.toLowerCase() === name.toLowerCase())) throw new ApiError('A sport with this name already exists.', 409);
    T.update('sports', sid, { name, color, active: d.active === false || d.active === 0 ? 0 : 1 }); log('update', 'sport', sid, d); return ok();
  });
  add('POST', '/sports', 'settings', ({ body: d }) => {
    const name = s(d, 'name', true, 40), color = s(d, 'color', false, 7) || '#E6EEFB';
    if (T.find('sports', x => x.name.toLowerCase() === name.toLowerCase())) throw new ApiError('A sport with this name already exists.', 409);
    const r = T.insert('sports', { name, color, active: 1 }); log('create', 'sport', r.id, d); return ok({ id: r.id });
  });
  add('PUT', '/organizers', 'settings', ({ body }) => {
    const items = body.organizers || [], actv = items.filter(o => o.active !== false && o.active !== 0);
    const total = Math.round(sum(actv, o => Number(o.share_pct || 0)) * 1e4) / 1e4;
    if (actv.length && total !== 100) throw new ApiError(`Active organizer percentages must total 100% (currently ${total}%).`);
    items.forEach(o => {
      const name = s(o, 'name', true, 60, 'Organizer name'), p = pct(o, 'share_pct', 0, 'Share'), a = o.active === false || o.active === 0 ? 0 : 1;
      if (o.id) T.update('organizers', o.id, { name, share_pct: p, active: a }); else T.insert('organizers', { name, share_pct: p, active: a });
    });
    log('update', 'organizers', null, items); return ok();
  });
  add('POST', '/photographers', 'settings', ({ body: d }) => {
    const name = s(d, 'name', true, 60), fee = i(d, 'default_fee', false, 0, 1e11, null, 'Default fee'), share = pct(d, 'default_npd_share', null, 'Default NPD share');
    if (T.find('photographers', x => x.name.toLowerCase() === name.toLowerCase())) throw new ApiError('A photographer with this name already exists.', 409);
    const r = T.insert('photographers', { name, default_fee: fee, default_npd_share: share, active: 1 }); log('create', 'photographer', r.id, { name }); return ok({ id: r.id });
  });
  add('PUT', '/photographers/<int:pid>', 'settings', ({ body: d }, pid) => {
    const fee = i(d, 'default_fee', false, 0, 1e11, null, 'Default fee'), share = pct(d, 'default_npd_share', null, 'Default NPD share');
    T.update('photographers', pid, { name: s(d, 'name', true, 60), active: d.active === false || d.active === 0 ? 0 : 1, default_fee: fee, default_npd_share: share }); log('update', 'photographer', pid, d); return ok();
  });
  add('GET', '/audit', 'settings', ({ q }) => {
    const [, size, off] = pageArgs(q, 50);
    let rows = T.all('audit_logs');
    if (q.entity) rows = rows.filter(r => r.entity === q.entity);
    if (q.q) rows = rows.filter(r => like(r.username, q.q) || like(r.action, q.q) || like(r.detail, q.q));
    rows = rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.updatedAt < b.updatedAt ? 1 : -1));
    return ok({ rows: rows.slice(off, off + size), total: rows.length });
  });

  // =============================================================== venues
  const VENUE_FIELDS = ['name', 'address', 'area', 'maps_url', 'contact_person', 'contact_phone', 'whatsapp_url', 'booking_url', 'facilities', 'notes'];
  function venueVals(d) {
    const v = {}; VENUE_FIELDS.forEach(k => { v[k] = s(d, k, k === 'name', 500); });
    v.rental_price = i(d, 'rental_price', false, 0, 1e11, 0, 'Rental price');
    v.pricing_type = oneOf(d, 'pricing_type', ['per hour', 'per session'], 'per hour');
    v.setting = oneOf(d, 'setting', ['Indoor', 'Outdoor', 'Both'], 'Indoor');
    v.status = oneOf(d, 'status', ['Active', 'Inactive'], 'Active');
    ['maps_url', 'whatsapp_url', 'booking_url'].forEach(k => { if (v[k] && !/^https?:\/\//i.test(v[k])) throw new ApiError(`${k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())} must start with http:// or https://`); });
    return v;
  }
  function setVenueSports(vid, ids) {
    T.filter('venue_sports', x => x.venue_id === vid).forEach(x => T.remove('venue_sports', x.id));
    new Set((ids || []).map(Number)).forEach(sid => T.insert('venue_sports', { venue_id: vid, sport_id: sid }));
  }
  add('GET', '/venues', 'view', ({ q }) => {
    let vs = T.all('venues');
    if (q.q) vs = vs.filter(v => like(v.name, q.q) || like(v.address, q.q) || like(v.area, q.q) || like(v.venue_code, q.q));
    if (q.area) vs = vs.filter(v => v.area === q.area);
    if (q.sport_id) vs = vs.filter(v => T.all('venue_sports').some(x => x.venue_id === v.id && x.sport_id == q.sport_id));
    vs = q.sort === 'price_asc' ? sortBy(vs, 'rental_price') : q.sort === 'price_desc' ? sortBy(vs, 'rental_price').reverse() : sortBy(vs, v => (v.name || '').toLowerCase());
    const out = vs.map(v => Object.assign({}, v, { session_count: T.all('sessions').filter(x => x.venue_id === v.id).length, sport_ids: T.all('venue_sports').filter(x => x.venue_id === v.id).map(x => x.sport_id) }));
    const areas = [...new Set(T.all('venues').map(v => v.area).filter(Boolean))].sort();
    return ok({ venues: out, areas });
  });
  add('POST', '/venues', 'operations', ({ body: d }) => {
    const v = venueVals(d), code = T.nextCode('venues', 'venue_code', 'VEN', 3);
    const r = T.insert('venues', Object.assign({ venue_code: code, is_demo: 0 }, v)); setVenueSports(r.id, d.sport_ids); log('create', 'venue', r.id, v); return ok({ id: r.id });
  });
  add('PUT', '/venues/<int:vid>', 'operations', ({ body: d }, vid) => {
    if (!T.get('venues', vid)) throw new ApiError('Venue not found.', 404);
    const v = venueVals(d); T.update('venues', vid, v); setVenueSports(vid, d.sport_ids); log('update', 'venue', vid, v); return ok();
  });
  add('DELETE', '/venues/<int:vid>', 'operations', (c, vid) => {
    const n = T.all('sessions').filter(x => x.venue_id === vid).length;
    if (n) { T.update('venues', vid, { status: 'Inactive' }); log('deactivate', 'venue', vid); return ok({ soft: true, message: `Venue has ${n} session(s) in history, so it was set to Inactive instead of deleted.` }); }
    T.remove('venues', vid); setVenueSports(vid, []); log('delete', 'venue', vid); return ok({ soft: false });
  });

  // =============================================================== members
  function memberVals(d, memberId, force) {
    const nick = s(d, 'nickname', true, 60, 'Nickname'), wa = normalizeWa(s(d, 'whatsapp', false, 30));
    if (wa && !(wa.length - 1 >= 9 && wa.length - 1 <= 15)) throw new ApiError('WhatsApp number looks invalid.');
    if (wa && !force) { const dup = T.find('members', m => m.whatsapp === wa && m.id !== (memberId || 0)); if (dup) throw new ApiError(`WhatsApp number is already used by ${dup.nickname} (${dup.member_code}).`, 409, { code: 'duplicate_whatsapp', existing: pick(dup, ['member_code', 'nickname']) }); }
    return { nickname: nick, whatsapp: wa, notes: s(d, 'notes', false, 500) };
  }
  function createMember(d, force, reg) {
    const v = memberVals(d, null, force), code = T.nextCode('members', 'member_code', 'NPD', 3);
    const r = T.insert('members', Object.assign({ member_code: code, registered_at: reg || dt(d, 'registered_at') || today(), active: 1, is_demo: 0 }, v));
    log('create', 'member', r.id, Object.assign({ code }, v)); return [r.id, code];
  }
  function memberStats() {
    const sess = new Map(T.all('sessions').map(x => [x.id, x])), st = new Map();
    T.all('session_participants').forEach(sp => {
      if (sp.payment_status === 'Cancelled') return; const s_ = sess.get(sp.session_id); if (!s_) return;
      const a = st.get(sp.member_id) || { joined: 0, sportSet: new Set(), last_date: null, first_date: null, spend: 0, attended: 0 };
      a.joined++; a.sportSet.add(s_.sport_id); a.spend += spendOf(sp); if (sp.attendance === 'Attended') a.attended++;
      if (!a.last_date || s_.event_date > a.last_date) a.last_date = s_.event_date; if (!a.first_date || s_.event_date < a.first_date) a.first_date = s_.event_date;
      st.set(sp.member_id, a);
    });
    return st;
  }
  function memberMatch(m, q) {
    const digits = q.replace(/\D/g, '');
    return like(m.member_code, q) || like(m.nickname, q) || (digits.length >= 3 && String(m.whatsapp || '').replace('+', '').includes(digits.replace(/^0+/, '')));
  }
  add('GET', '/members', 'view', ({ q }) => {
    const st = memberStats(), qq = (q.q || '').trim(), act_ = q.active === undefined ? '1' : q.active;
    const cb = E.creditBalances();
    let rows = T.all('members').map(m => { const a = st.get(m.id); return Object.assign({}, m, { credit: Math.max(0, cb.get(m.id) || 0), joined: a ? a.joined : 0, sports: a ? a.sportSet.size : 0, spend: a ? a.spend : 0, last_date: a ? a.last_date : null, first_date: a ? a.first_date : null }); });
    if (qq) rows = rows.filter(m => memberMatch(m, qq));
    if (act_ === '0' || act_ === '1') rows = rows.filter(m => String(m.active) === act_);
    if (q.activity === 'inactive30') { const lim = NPDB.addDays(today(), -30); rows = rows.filter(m => !m.last_date || m.last_date < lim); }
    const sorters = { nickname: x => (x.nickname || '').toLowerCase(), code: x => x.member_code, joined: x => -x.joined, spend: x => -x.spend, last: x => ('~' + (x.last_date || '')).split('').map(ch => 255 - ch.charCodeAt(0)).join(','), newest: x => -x.id };
    rows = q.sort === 'last' ? rows.slice().sort((a, b) => (b.last_date || '') < (a.last_date || '') ? -1 : (b.last_date || '') > (a.last_date || '') ? 1 : 0) : sortBy(rows, sorters[q.sort] || sorters.code);
    const [, size, off] = pageArgs(q, 25);
    return ok({ members: stripFin(rows.slice(off, off + size)), total: rows.length });
  });
  add('GET', '/members/search', 'view', ({ q }) => {
    const qq = (q.q || '').trim(); if (qq.length < 1) return ok({ members: [] });
    const rows = sortBy(T.all('members').filter(m => m.active && memberMatch(m, qq)), m => (m.nickname || '').toLowerCase()).slice(0, 12);
    const cb = E.creditBalances();
    return ok({ members: rows.map(m => Object.assign(pick(m, ['id', 'member_code', 'nickname', 'whatsapp']), { credit: Math.max(0, cb.get(m.id) || 0) })) });
  });
  add('POST', '/members', 'operations', ({ body: d }) => { const [id, code] = createMember(d, !!d.force); return ok({ id, member_code: code }); });
  add('PUT', '/members/<int:mid>', 'operations', ({ body: d }, mid) => {
    const old = T.get('members', mid); if (!old) throw new ApiError('Member not found.', 404);
    const v = memberVals(d, mid, !!d.force), a = d.active === undefined ? old.active : d.active;
    const oldV = pick(old, Object.keys(v)); T.update('members', mid, Object.assign({}, v, { active: a ? 1 : 0 })); log('update', 'member', mid, { old: oldV, new: v }); return ok();
  });
  add('DELETE', '/members/<int:mid>', 'operations', (c, mid) => {
    const n = T.all('session_participants').filter(x => x.member_id === mid).length;
    if (n) { T.update('members', mid, { active: 0 }); log('deactivate', 'member', mid); return ok({ soft: true, message: `Member has ${n} registration(s), so the profile was deactivated and history is preserved.` }); }
    T.remove('members', mid); log('delete', 'member', mid); return ok({ soft: false });
  });
  add('GET', '/members/<int:mid>/profile', 'view', (c, mid) => {
    const m0 = T.get('members', mid); if (!m0) throw new ApiError('Member not found.', 404);
    const a = memberStats().get(mid), m = Object.assign({}, m0, { joined: a ? a.joined : 0, spend: a ? a.spend : 0, last_date: a ? a.last_date : null, first_date: a ? a.first_date : null, attended: a ? a.attended : 0 });
    const hist = [];
    T.all('session_participants').filter(sp => sp.member_id === mid).forEach(sp => {
      const s_ = T.get('sessions', sp.session_id), sp2 = s_ && T.get('sports', s_.sport_id); if (!s_ || !sp2) return;
      hist.push({ id: sp.id, session_id: s_.id, name: s_.name, event_date: s_.event_date, photo_mode: s_.photo_mode, photo_fee: s_.photo_fee, payment_status: sp.payment_status, amount_paid: sp.amount_paid, refund_amount: sp.refund_amount,
        attendance: sp.attendance, photo_selected: sp.photo_selected, paid_date: sp.paid_date, sport: sp2.name, sport_color: sp2.color });
    });
    hist.sort((x, y) => (x.event_date < y.event_date ? 1 : x.event_date > y.event_date ? -1 : 0));
    const sports = {}; hist.forEach(h => { if (h.payment_status !== 'Cancelled') sports[h.sport] = (sports[h.sport] || 0) + 1; });
    m.registered = hist.length; m.paid = hist.filter(h => h.payment_status === 'Paid' || h.payment_status === 'Partially Refunded').length;
    m.favorite_sport = Object.keys(sports).sort((x, y) => sports[y] - sports[x])[0] || null;
    const photo = hist.filter(h => h.photo_mode === 'excluded' && h.photo_selected && E.PAID_STATES.includes(h.payment_status)).map(h => ({ date: h.event_date, session: h.name, mode: h.photo_mode, price: h.photo_fee }));
    if (!has('finance')) { hist.forEach(h => { delete h.amount_paid; delete h.refund_amount; }); photo.forEach(p => delete p.price); }
    return ok({ member: stripFin(m), history: hist, photography_history: photo });
  });
  function parseCsv(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k];
      if (q) { if (ch === '"') { if (text[k + 1] === '"') { f += '"'; k++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === ',' || ch === ';') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (ch !== '\r') f += ch;
    }
    if (f || row.length) { row.push(f); rows.push(row); } return rows;
  }
  add('POST', '/members/import', 'operations', async ({ body }) => {
    const f = body instanceof FormData ? body.get('file') : null; if (!f) throw new ApiError('Attach a .csv file.');
    const name = (f.name || '').toLowerCase();
    if (name.endsWith('.xlsx')) throw new ApiError('Excel files cannot be read offline. In Excel choose File → Save As → CSV, then import the .csv file.');
    if (!name.endsWith('.csv')) throw new ApiError('Only .csv files are supported.');
    if (f.size > 2e6) throw new ApiError('File too large (max 2 MB).');
    const rows = parseCsv((await f.text()).replace(/^﻿/, ''));
    if (rows.length < 2) throw new ApiError('The file has no data rows.');
    const head = rows[0].map(h => h.trim().toLowerCase().replace(/[ _]/g, ''));
    const col = (...names) => { for (const n of names) if (head.includes(n)) return head.indexOf(n); return null; };
    const ci = { nickname: col('nickname', 'nama', 'name'), whatsapp: col('whatsapp', 'whatsappnumber', 'wa', 'phone', 'nohp'), notes: col('notes', 'catatan') };
    if (ci.nickname === null) throw new ApiError("A 'Nickname' column is required. Optional columns: WhatsApp, Notes.");
    let created = 0; const skipped = [], seenR = new Set(), seenW = new Set();
    T.tx(() => {
      rows.slice(1).forEach((r, n) => {
        if (!r.some(x => (x || '').trim())) return;
        const gv = k => (ci[k] !== null && ci[k] < r.length && r[ci[k]] ? r[ci[k]].trim() : ''), d = {}; Object.keys(ci).forEach(k => { d[k] = gv(k); });
        try {
          const wa = normalizeWa(d.whatsapp);
          if ((wa && seenW.has(wa))) throw new ApiError('Duplicate within the file.');
          createMember(d, false); seenW.add(wa); created++;
        } catch (e) { if (e instanceof ApiError) skipped.push({ row: n + 2, nickname: d.nickname, reason: e.message }); else throw e; }
      });
      log('import', 'member', null, { created, skipped: skipped.length });
    });
    return ok({ created, skipped });
  }, false, true);
  add('GET', '/members/activity', 'view', ({ q }) => {
    const start = q.start || '2000-01-01', end = q.end || '2100-12-31', by = new Map();
    const sess = new Map(T.all('sessions').map(x => [x.id, x]));
    T.all('session_participants').forEach(sp => {
      if (sp.payment_status === 'Cancelled') return; const s_ = sess.get(sp.session_id), m = T.get('members', sp.member_id);
      if (!s_ || !m || s_.status === 'Draft' || s_.event_date < start || s_.event_date > end) return;
      const a = by.get(m.id) || { id: m.id, member_code: m.member_code, reclub_id: m.reclub_id, nickname: m.nickname, joined: 0, sportSet: new Set(), spend: 0, last_date: null, first_date: null, attended: 0 };
      a.joined++; a.sportSet.add(s_.sport_id); a.spend += spendOf(sp); if (sp.attendance === 'Attended') a.attended++;
      if (!a.last_date || s_.event_date > a.last_date) a.last_date = s_.event_date; if (!a.first_date || s_.event_date < a.first_date) a.first_date = s_.event_date; by.set(m.id, a);
    });
    const r = [...by.values()].map(a => { const m = Object.assign({}, a, { sports: a.sportSet.size }); delete m.sportSet;
      const days = Math.round((NPDB.parseD(m.last_date) - NPDB.parseD(m.first_date)) / 864e5);
      m.per_month = m.joined > 1 ? Math.round(m.joined / Math.max(1, days / 30.4) * 10) / 10 : m.joined;
      m.frequency = m.per_month >= 4 ? 'Very frequent' : m.per_month >= 2 ? 'Regular' : 'Occasional'; return m; });
    const sp = {};
    T.all('session_participants').forEach(x => { if (x.payment_status === 'Cancelled') return; const s_ = sess.get(x.session_id); if (!s_ || s_.status === 'Draft' || s_.event_date < start || s_.event_date > end) return; const k = T.get('sports', s_.sport_id); if (!k) return; (sp[k.id] = sp[k.id] || { name: k.name, color: k.color, participations: 0 }).participations++; });
    const top = (k, n = 10) => sortBy(r, x => -x[k], 'nickname').slice(0, n);
    let out = { all: sortBy(r, x => -x.joined, 'nickname'), most_active: top('joined'), most_frequent: top('per_month'), top_spenders: top('spend'), popular_sports: Object.values(sp).sort((a, b) => b.participations - a.participations) };
    if (!has('finance')) { out = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, stripFin(v)])); out.top_spenders = []; }
    return ok(out);
  });

  // =============================================================== sessions
  function findConflicts(venueId, d, st, et, exclude) {
    return sortBy(T.all('sessions').filter(x => x.venue_id == venueId && x.event_date === d && x.status !== 'Cancelled' && x.id != (exclude || 0) && x.start_time < et && x.end_time > st), 'start_time')
      .map(x => Object.assign(pick(x, ['id', 'session_code', 'name', 'event_date', 'start_time', 'end_time', 'status']), { sport: (T.get('sports', x.sport_id) || {}).name }));
  }
  function sessionVals(d, ex = {}) {
    const v = {};
    v.name = s(d, 'name', true, 120, 'Session name'); v.sport_id = i(d, 'sport_id', true, 1, 1e11, null, 'Sport'); v.venue_id = i(d, 'venue_id', true, 1, 1e11, null, 'Venue');
    v.organizer_id = null; v.event_date = dt(d, 'event_date', true, 'Session date');
    v.start_time = tm(d, 'start_time', true, 'Start time'); v.end_time = tm(d, 'end_time', true, 'End time');
    if (v.end_time <= v.start_time) throw new ApiError('End time must be after start time.');
    v.description = s(d, 'description', false, 1000); v.max_participants = i(d, 'max_participants', false, 0, 1000, 0, 'Maximum participants');
    v.status = oneOf(d, 'status', SESSION_STATUS, ex.status || 'Draft', 'Status');
    v.reg_open = dt(d, 'reg_open', false, 'Registration opening'); v.reg_close = dt(d, 'reg_close', false, 'Registration closing');
    if (v.reg_open && v.reg_close && v.reg_close < v.reg_open) throw new ApiError('Registration closing must be on or after opening.');
    if (v.reg_close && v.reg_close > v.event_date) throw new ApiError('Registration cannot close after the event date.');
    const ven = T.get('venues', v.venue_id); if (!ven) throw new ApiError('Venue not found.');
    let cost = i(d, 'venue_cost', false, 0, 1e11, null, 'Venue rental cost');
    if (cost === null) cost = ven.pricing_type === 'per session' ? ven.rental_price : Math.round(ven.rental_price * hoursBetween(v.start_time, v.end_time));
    v.venue_cost = cost; v.admin_fee = i(d, 'admin_fee', false, 0, 1e11, 0, 'Biaya admin') || 0;
    const vf = i(d, 'venue_fund_id', false, 1) || ex.venue_fund_id || E.defaultVenueFundId();
    if (!T.get('funds', vf)) throw new ApiError('Fund for the venue rental not found.');
    v.venue_fund_id = vf;
    v.session_fee = i(d, 'session_fee', false, 0, 1e11, 0, 'Session fee'); v.target_participants = v.max_participants;   // one number: capacity = target
    v.budget_extra = i(d, 'budget_extra', false, 0, 1e11, 0, 'Additional operational expenses');
    v.photo_mode = oneOf(d, 'photo_mode', PHOTO_MODES, 'none', 'Photography mode');
    if (v.photo_mode === 'none') { v.photographer_id = null; v.photo_fee = 0; v.npd_share_pct = Number(ex.npd_share_pct || 0); }
    else {
      v.photographer_id = i(d, 'photographer_id', true, 1, 1e11, null, 'Photographer'); v.photo_fee = i(d, 'photo_fee', true, 0, 1e11, null, 'Photography fee');
      v.npd_share_pct = pct(d, 'npd_share_pct', null, 'NPD share'); if (v.npd_share_pct === null) throw new ApiError('NPD share percentage is required.');
      if (v.photo_mode === 'included' && v.photo_fee > v.session_fee) throw new ApiError('Photography fee cannot exceed the session fee when photography is included.');
    }
    v.photographer_share_pct = Math.round((100 - v.npd_share_pct) * 1e4) / 1e4; return v;
  }
  /** Venue rental is a real expense row (id = session id, so every device derives the very same record). */
  const venueDate = (s, ex) => { const t = today(); if (ex) return ex.txn_date <= s.event_date ? ex.txn_date : s.event_date; return s.event_date < t ? s.event_date : t; };
  /** One-time merge: Operational Saving + Petty Cash -> "NPD Petty Cash". Idempotent and safe to run on every device. */
  function migrateBank() {
    if (!T.all('funds').length) return;   // empty store: seedBase has not run yet
    let bank = T.find('funds', f => f.code === 'bank_account');
    if (!bank) bank = T.insert('funds', { id: 405, code: 'bank_account', name: 'Saldo Rekening', kind: 'npd', owner: null, opening_balance: 0, sort: 1 });
    if (T.setting('bank_migrated', '0') === '1') return;
    const petty = T.find('funds', f => f.code === 'petty_cash');
    if (petty) T.all('sessions').filter(x => x.venue_fund_id === petty.id).forEach(x => T.update('sessions', x.id, { venue_fund_id: bank.id }));
    T.setSetting('default_venue_fund', 'bank_account'); T.setSetting('bank_migrated', '1');
  }
  function migrateFunds() {
    migrateBank();
    const old = T.find('funds', f => f.code === 'operational_saving'), keep = T.find('funds', f => f.code === 'petty_cash');
    if (!keep) return;
    if (old) {
      const oldPct = Number(T.setting('default_saving_pct', '0')) || 0, curPct = Number(T.setting('default_petty_pct', '5')) || 0;
      T.update('funds', keep.id, { name: 'NPD Petty Cash', opening_balance: (keep.opening_balance || 0) + (old.opening_balance || 0) });
      T.all('expenses').filter(e => e.source_fund_id === old.id).forEach(e => T.update('expenses', e.id, { source_fund_id: keep.id }));
      T.all('sessions').filter(x => x.venue_fund_id === old.id).forEach(x => T.update('sessions', x.id, { venue_fund_id: keep.id }));
      T.all('photographer_payments').filter(x => x.fund_id === old.id).forEach(x => T.update('photographer_payments', x.id, { fund_id: keep.id }));
      T.all('fund_transactions').forEach(x => {
        const a = x.from_fund_id === old.id ? keep.id : x.from_fund_id, b = x.to_fund_id === old.id ? keep.id : x.to_fund_id;
        if (x.kind === 'transfer' && a === b) { T.remove('fund_transactions', x.id); return; }
        if (a !== x.from_fund_id || b !== x.to_fund_id) T.update('fund_transactions', x.id, { from_fund_id: a, to_fund_id: b });
      });
      T.setSetting('default_petty_pct', String(oldPct + curPct)); T.setSetting('default_saving_pct', '0');
      if (T.setting('default_venue_fund') === 'operational_saving') T.setSetting('default_venue_fund', 'petty_cash');
      T.remove('funds', old.id);
    } else if (keep.name !== 'NPD Petty Cash') T.update('funds', keep.id, { name: 'NPD Petty Cash' });
  }
  function ensureVenueExpenses() {
    migrateFunds();
    let n = 0; const ss = new Map(T.all('sessions').map(x => [x.id, x]));
    for (const s of ss.values()) {
      const ex = T.get('expenses', s.id), ok_ = ex && ex.auto === 'venue';
      const tot = (s.venue_cost || 0) + (s.admin_fee || 0);
      if (!(tot > 0)) { if (ok_) { T.remove('expenses', ex.id); n++; } continue; }
      if (ex && !ok_) continue;
      const fund = s.venue_fund_id && T.get('funds', s.venue_fund_id) ? s.venue_fund_id : E.defaultVenueFundId();
      const want = { txn_date: venueDate(s, ex), category: 'Venue Rental', description: `Venue – ${s.name}`, amount: tot, notes: s.admin_fee > 0 ? `Sewa ${s.venue_cost} + biaya admin ${s.admin_fee} (otomatis dari sesi)` : 'Dibuat otomatis dari biaya venue sesi', session_id: s.id, source_fund_id: fund, auto: 'venue' };
      if (!ex) { T.insert('expenses', Object.assign({ id: s.id, code: T.nextCode('expenses', 'code', 'EXP-', 6), payment_method: 'Cash', receipt: null, notes: 'Dibuat otomatis dari biaya venue sesi', created_by: 'system', is_demo: s.is_demo ? 1 : 0 }, want)); n++; }
      else if (Object.keys(want).some(k => ex[k] !== want[k])) { T.update('expenses', ex.id, want); n++; }
    }
    T.all('expenses').filter(x => x.auto === 'venue' && !ss.has(x.session_id)).forEach(x => { T.remove('expenses', x.id); n++; });
    return n;
  }
  function checkVenueFund(v, d, old) {
    const tot = (v.venue_cost || 0) + (v.admin_fee || 0); if (!(tot > 0)) return;
    if (old && old.venue_cost === v.venue_cost && (old.admin_fee || 0) === (v.admin_fee || 0) && old.venue_fund_id === v.venue_fund_id) return;
    const fund = T.get('funds', v.venue_fund_id), ex = old ? T.get('expenses', old.id) : null;
    NPDB.fin.checkOverdraw(fund, tot, venueDate(v, ex), old ? 'ex' + old.id : null, d.force_fund);
  }
  function syncFull(sid) {
    const r = T.get('sessions', sid); if (!r || !['Open Registration', 'Full'].includes(r.status) || !r.max_participants) return;
    const n = T.all('session_participants').filter(p => p.session_id === sid && p.payment_status !== 'Cancelled').length, nw = n >= r.max_participants ? 'Full' : 'Open Registration';
    if (nw !== r.status) T.update('sessions', sid, { status: nw });
  }
  add('GET', '/sessions/conflicts', 'view', ({ q }) => ok({ conflicts: findConflicts(q.venue_id, q.date, q.start || '00:00', q.end || '23:59', q.exclude_id) }));
  add('POST', '/sessions', 'operations', ({ body: d }) => {
    const v = sessionVals(d), cf = findConflicts(v.venue_id, v.event_date, v.start_time, v.end_time);
    if (cf.length && !d.force && v.status !== 'Cancelled') throw new ApiError('This venue already has a session during those hours.', 409, { code: 'venue_conflict', conflicts: cf });
    checkVenueFund(v, d, null);
    const code = T.nextCode('sessions', 'session_code', 'SES-', 4), r = T.insert('sessions', Object.assign({ session_code: code, cancel_reason: null, is_demo: 0 }, v)); ensureVenueExpenses();
    log('create', 'session', r.id, Object.assign({ code }, v)); return ok({ id: r.id, session_code: code });
  }, true);
  add('PUT', '/sessions/<int:sid>', 'operations', ({ body: d0 }, sid) => {
    const old = T.get('sessions', sid); if (!old) throw new ApiError('Session not found.', 404);
    const d = Object.assign({}, d0);
    if (!has('finance')) ['venue_cost', 'admin_fee', 'session_fee', 'budget_extra', 'photo_mode', 'photographer_id', 'photo_fee', 'npd_share_pct', 'venue_fund_id'].forEach(k => { d[k] = old[k]; });
    const v = sessionVals(Object.assign({}, d, { venue_cost: d.venue_cost !== null && d.venue_cost !== undefined && d.venue_cost !== '' ? d.venue_cost : old.venue_cost }), old);
    const cf = findConflicts(v.venue_id, v.event_date, v.start_time, v.end_time, sid);
    if (cf.length && !d.force && v.status !== 'Cancelled') throw new ApiError('This venue already has a session during those hours.', 409, { code: 'venue_conflict', conflicts: cf });
    checkVenueFund(v, d, old);
    const oldV = pick(old, Object.keys(v)); T.update('sessions', sid, v); syncFull(sid); ensureVenueExpenses(); log('update', 'session', sid, { old: oldV, new: v }); return ok();
  });
  add('POST', '/sessions/<int:sid>/reschedule', 'operations', ({ body: d }, sid) => {
    const old = T.get('sessions', sid); if (!old) throw new ApiError('Session not found.', 404);
    const nd = dt(d, 'event_date', true), st = tm(d, 'start_time', true), et = tm(d, 'end_time', true);
    if (et <= st) throw new ApiError('End time must be after start time.');
    const cf = findConflicts(old.venue_id, nd, st, et, sid); if (cf.length && !d.force) throw new ApiError('This venue already has a session during those hours.', 409, { code: 'venue_conflict', conflicts: cf });
    T.update('sessions', sid, { event_date: nd, start_time: st, end_time: et }); ensureVenueExpenses(); log('reschedule', 'session', sid, { from: [old.event_date, old.start_time, old.end_time], to: [nd, st, et] }); return ok();
  });
  add('DELETE', '/sessions/<int:sid>', 'operations', (c, sid) => {
    const paid = T.all('session_participants').filter(p => p.session_id === sid && p.amount_paid > 0).length;
    const exp = T.all('expenses').filter(x => x.session_id === sid && x.auto !== 'venue').length + T.all('photographer_payments').filter(x => x.session_id === sid).length;
    if (paid || exp) throw new ApiError('This session has financial records. Cancel it instead of deleting so history is preserved.', 409);
    T.filter('session_participants', p => p.session_id === sid).forEach(p => T.remove('session_participants', p.id)); T.remove('sessions', sid); ensureVenueExpenses(); log('delete', 'session', sid); return ok();
  });
  add('GET', '/sessions', 'view', ({ q }) => {
    let ss = E.computeSessions(q.start || null, q.end || null, q.sport_id || null, q.venue_id || null, null, true);
    const qq = (q.q || '').toLowerCase();
    if (qq) ss = ss.filter(x => x.name.toLowerCase().includes(qq) || x.session_code.toLowerCase().includes(qq) || (x.venue || '').toLowerCase().includes(qq));
    if (q.status) ss = ss.filter(x => x.status === q.status);
    if (q.sort === 'profit') ss = sortBy(ss, x => -x.net_profit); else if (q.sort === 'date_asc') ss = sortBy(ss, 'event_date', 'start_time'); else if (q.sort === 'participants') ss = sortBy(ss, x => -x.registered);
    else ss = sortBy(ss, 'event_date', 'start_time').reverse();
    const [, size, off] = pageArgs(q, 20);
    const keep = ['id', 'session_code', 'name', 'sport_id', 'sport', 'sport_color', 'venue_id', 'venue', 'venue_area', 'event_date', 'start_time', 'end_time', 'status', 'max_participants', 'registered', 'paid_count', 'attended', 'organizer', 'photo_mode', 'session_fee', 'net_profit', 'organizer_revenue', 'target_participants', 'total_expenses'];
    return ok({ sessions: stripFin(ss.slice(off, off + size).map(x => pick(x, keep))), total: ss.length });
  });
  add('GET', '/sessions/<int:sid>', 'view', (c, sid) => {
    const ss = E.computeSessions(null, null, null, null, sid, true); if (!ss.length) throw new ApiError('Session not found.', 404);
    const sess = ss[0];
    const parts = sortBy(T.all('session_participants').filter(p => p.session_id === sid), 'created_at', 'id').map(p => {
      const m = T.get('members', p.member_id); if (!m) return null; const cal = E.participantCalc(sess, p);
      return Object.assign({}, p, { member_code: m.member_code, nickname: m.nickname, reclub_id: m.reclub_id, whatsapp: m.whatsapp, retained: cal.retained, due: sess.session_fee + (sess.photo_mode === 'excluded' && p.photo_selected ? sess.photo_fee : 0) });
    }).filter(Boolean);
    const expenses = has('finance') ? sortBy(T.all('expenses').filter(x => x.session_id === sid && x.auto !== 'venue'), 'txn_date').map(x => pick(x, ['id', 'code', 'txn_date', 'category', 'description', 'amount', 'receipt'])) : [];
    sess.conflicts = findConflicts(sess.venue_id, sess.event_date, sess.start_time, sess.end_time, sid);
    const fund = T.get('funds', sess.venue_fund_id); sess.venue_fund = fund ? fund.name : null;
    if (!has('finance')) parts.forEach(p => ['amount_paid', 'refund_amount', 'retained', 'due'].forEach(k => delete p[k]));
    return ok({ session: stripFin(sess), participants: parts, expenses });
  });

  // =============================================================== participants
  function paymentFields(sess, d, ex = {}, mid = ex.member_id) {
    const status = oneOf(d, 'payment_status', PAY_STATUS, ex.payment_status || 'Waiting for Payment', 'Payment status');
    const photo = ['1', 'true', 'yes'].includes(String(d.photo_selected !== undefined ? d.photo_selected : (ex.photo_selected || 0)).toLowerCase()) ? 1 : 0;
    const due = sess.session_fee + (sess.photo_mode === 'excluded' && photo ? sess.photo_fee : 0);
    // loyalty reward (derived from attendance, see loyalty.js)
    let rw = 'loyalty_reward' in d ? Math.trunc(Number(d.loyalty_reward) || 0) : (ex.loyalty_reward || 0), disc = 0;
    if (!['Paid', 'Partially Refunded'].includes(status)) { if (rw && 'loyalty_reward' in d && Number(d.loyalty_reward)) throw new ApiError('Reward loyalty hanya bisa dipakai kalau status pembayaran Paid.'); rw = 0; }
    else if (rw) { const same = ex.loyalty_reward === rw && 'loyalty_discount' in ex; disc = same ? ex.loyalty_discount : NPDB.loyalty.discountFor(mid, rw, sess, ex.id); }
    let amount = i(d, 'amount_paid', false, 0, 1e11, null, 'Payment amount'), refund = i(d, 'refund_amount', false, 0, 1e11, null, 'Refund amount');
    let pdate = dt(d, 'paid_date', false, 'Payment date'), rdate = dt(d, 'refund_date', false, 'Refund date');
    const wasPaid = E.PAID_STATES.includes(ex.payment_status);
    if (['Paid', 'Partially Refunded', 'Refunded'].includes(status)) {
      if (amount === null) amount = wasPaid && ex.amount_paid ? ex.amount_paid : Math.max(0, due - disc);
      pdate = pdate || ex.paid_date || today();
      if (status === 'Paid') { refund = 0; rdate = null; }
      else if (status === 'Partially Refunded') {
        refund = refund !== null ? refund : (ex.refund_amount || 0); if (!(refund > 0 && refund < Math.max(amount, 1))) throw new ApiError('Partial refund must be more than 0 and less than the amount paid.');
        rdate = rdate || ex.refund_date || today();
      } else { refund = amount; rdate = rdate || ex.refund_date || today(); }
    } else {
      if (status === 'Cancelled' && wasPaid && (ex.amount_paid || 0) > 0) throw new ApiError('This participant already paid. Use Refunded or Partially Refunded so the money is tracked.');
      amount = 0; refund = 0; pdate = null; rdate = null;
    }
    let dep = 'deposit_fund_id' in d ? (d.deposit_fund_id ? Number(d.deposit_fund_id) : null) : (ex.deposit_fund_id || null);
    if (dep) { const fd = T.get('funds', dep); if (!fd || fd.kind !== 'npd') throw new ApiError('Pilih kantong NPD untuk tempat uang masuk.'); if (fd.code === 'bank_account') dep = null; }
    return { loyalty_reward: rw || null, loyalty_discount: disc, deposit_fund_id: dep, payment_status: status, amount_paid: amount, refund_amount: refund, paid_date: pdate, refund_date: rdate, photo_selected: photo,
      attendance: oneOf(d, 'attendance', ATTENDANCE, ex.attendance || 'Not Yet Confirmed', 'Attendance'), notes: 'notes' in d ? s(d, 'notes', false, 300) : (ex.notes || null) };
  }
  add('POST', '/sessions/<int:sid>/participants', 'operations', ({ body: d }, sid) => {
    const sess = T.get('sessions', sid); if (!sess) throw new ApiError('Session not found.', 404);
    if (sess.status === 'Cancelled') throw new ApiError('This session is cancelled.');
    let mid = i(d, 'member_id', false, 1), newMember = null;
    if (!mid) { const nm = d.new_member; if (!nm || typeof nm !== 'object') throw new ApiError('Select a member or provide new member details.'); const [id, code] = createMember(nm, !!d.force); mid = id; newMember = code; }
    const m = T.get('members', mid); if (!m || !m.active) throw new ApiError('Member not found or inactive.');
    if (T.find('session_participants', p => p.session_id === sid && p.member_id === mid)) throw new ApiError('This member is already registered in this session.', 409);
    if (sess.max_participants) { const n = T.all('session_participants').filter(p => p.session_id === sid && p.payment_status !== 'Cancelled').length; if (n >= sess.max_participants && !d.force_capacity) throw new ApiError(`Session is full (${n}/${sess.max_participants}).`, 409, { code: 'session_full' }); }
    const f = paymentFields(sess, d, {}, mid), U = NPDB.credits.checkUse(mid, d, f, null);
    f.credit_used = U; const r = T.insert('session_participants', Object.assign({ session_id: sid, member_id: mid, registered_at: today() }, f));
    NPDB.credits.recordUse(r, sess, U); syncFull(sid); log('register', 'participant', r.id, Object.assign({ session: sid, member: m.member_code }, f)); return ok({ id: r.id, member_id: mid, new_member_code: newMember });
  }, true);
  add('PUT', '/participants/<int:pid>', 'operations', ({ body: d }, pid) => {
    const ex = T.get('session_participants', pid); if (!ex) throw new ApiError('Registration not found.', 404);
    const sess = T.get('sessions', ex.session_id); NPDB.credits.guardEdit(ex, d);
    const f = paymentFields(sess, d, ex), oldV = pick(ex, Object.keys(f)), U = NPDB.credits.checkUse(ex.member_id, d, f, ex);
    f.credit_used = U; T.update('session_participants', pid, f); NPDB.credits.recordUse(Object.assign({}, ex, f, { id: pid }), sess, U); syncFull(ex.session_id); log('update', 'participant', pid, { old: oldV, new: f }); return ok();
  });
  add('DELETE', '/participants/<int:pid>', 'operations', (c, pid) => {
    const ex = T.get('session_participants', pid); if (!ex) throw new ApiError('Registration not found.', 404);
    if (ex.amount_paid > 0 || (T.all('member_credits').some(c => c.participant_id === pid))) throw new ApiError('This registration has payment records. Mark it Refunded instead of deleting so cash history stays accurate.', 409);
    T.remove('session_participants', pid); syncFull(ex.session_id); log('delete', 'participant', pid, ex); return ok();
  });

  // =============================================================== calendar
  add('GET', '/calendar', 'view', ({ q }) => {
    const start = dt(q, 'start', true), end = dt(q, 'end', true);
    const ev = sortBy(NPDB.engine.joinedSessions(x => x.event_date >= start && x.event_date <= end && (!q.sport_id || x.sport_id == q.sport_id) && (!q.venue_id || x.venue_id == q.venue_id) && (!q.status || x.status === q.status)), 'event_date', 'start_time')
      .map(x => Object.assign(pick(x, ['id', 'session_code', 'name', 'event_date', 'start_time', 'end_time', 'status', 'max_participants', 'venue_id', 'sport', 'sport_color', 'venue', 'venue_area']), { registered: T.all('session_participants').filter(p => p.session_id === x.id && p.payment_status !== 'Cancelled').length }));
    ev.forEach(e => { e.conflict = e.status !== 'Cancelled' && ev.some(o => o.id !== e.id && o.venue_id === e.venue_id && o.event_date === e.event_date && o.status !== 'Cancelled' && o.start_time < e.end_time && o.end_time > e.start_time); });
    return ok({ events: ev });
  });

  NPDB.ops = { SESSION_STATUS, PAY_STATUS, ATTENDANCE, PHOTO_MODES, EXPENSE_CATS, spendOf, findConflicts, ensureVenueExpenses };
})(typeof window !== 'undefined' ? window : globalThis);
