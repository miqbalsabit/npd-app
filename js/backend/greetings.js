'use strict';
/* Member greetings: short, friendly message templates (payment reminder, "today we play", thank-you + loyalty update).
   Templates are editable and kept in settings; {placeholders} are filled in the browser per member. */
(function (g) {
  const NPDB = g.NPDB, T = NPDB.store, { ApiError } = NPDB, { add, ok } = NPDB.router;
  const DEFAULTS = {
    pay: 'Hi Kak {nama} 👋\nReminder ya, pendaftaran *{sesi}* ({hari}, {tanggal} · {jam}) di {lokasi} masih menunggu pembayaran {biaya}.\nKalau sudah transfer, boleh kirim bukti bayarnya ya Kak 🙏 Biar slotnya langsung aman. Makasih!',
    play: 'Hi Kak {nama} 👋\nHari ini kita main ya! 🙌\n📍 {lokasi} · Lapangan {lapangan}\n⏰ {jam}\nDatang 10–15 menit lebih awal ya Kak biar sempat pemanasan. Sampai ketemu di lapangan!',
    thanks: 'Hi Kak {nama} 👋 Makasih ya sudah ikut *{sesi}*, seru banget main bareng Kakak! 🙏\nKartu loyalty Kakak: {kartu}\nUpdate kartunya kami kirim di bawah ya 👇 Sampai ketemu di sesi NPD berikutnya! 🙌',
  };
  const KEYS = Object.keys(DEFAULTS), PAID = ['Paid', 'Partially Refunded'];
  const templates = () => Object.fromEntries(KEYS.map(k => [k, T.setting('tpl_' + k, '') || DEFAULTS[k]]));

  add('GET', '/sessions/<int:sid>/greetings', 'view', (c, sid) => {
    const s = T.get('sessions', sid); if (!s) throw new ApiError('Sesi tidak ditemukan.', 404);
    const v = T.get('venues', s.venue_id), sp = T.get('sports', s.sport_id);
    const people = NPDB.sortBy(T.filter('session_participants', p => p.session_id === sid && p.payment_status !== 'Cancelled').map(p => {
      const m = T.get('members', p.member_id); if (!m) return null; const ly = NPDB.loyalty.info(m.id);
      const due = (Number(s.session_fee) || 0) + (s.photo_mode === 'excluded' && p.photo_selected ? Number(s.photo_fee) || 0 : 0);
      return { member_id: m.id, nickname: m.nickname, whatsapp: m.whatsapp || '', payment_status: p.payment_status, attendance: p.attendance, due,
        loyalty: { count: ly.count, cycle_count: ly.cycle_count, available: ly.available.map(x => x.label), next: { remaining: ly.next.remaining, label: ly.next.label } } };
    }).filter(Boolean), x => x.nickname.toLowerCase());
    return ok({ session: { id: s.id, name: s.name, date: s.event_date, start: s.start_time, end: s.end_time, venue: v ? v.name : '', sport: sp ? sp.name : '', status: s.status }, templates: templates(), defaults: DEFAULTS, people });
  });
  add('PUT', '/message-templates', 'operations', ({ body: d }) => {
    for (const k of KEYS) if (k in d) { const t = String(d[k] || '').trim(); if (t.length > 1500) throw new ApiError('Template terlalu panjang (maks 1500 karakter).'); T.setSetting('tpl_' + k, t === DEFAULTS[k] ? '' : t); }
    return ok({ templates: templates() });
  });
  NPDB.greetings = { DEFAULTS, PAID };
})(typeof window !== 'undefined' ? window : globalThis);
