'use strict';
// =================================================================== MEMBER GREETINGS (copy-paste messages for Reclub chat)
const GR_TABS = [['pay', 'Reminder bayar', 'Belum bayar'], ['play', 'Hari ini main', 'Sudah bayar'], ['thanks', 'Terima kasih', 'Sudah hadir']];
const GR_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'], GR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const grState = {};

function grCopy(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((ok, er) => { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? ok() : er(new Error('Gagal menyalin.')); } catch (e) { er(e); } ta.remove(); });
}
const grFmtRp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
function grVars(d, p, court) {
  const s = d.session, dt = new Date(s.date + 'T00:00:00'), l = p.loyalty;
  const kartu = l.available.length ? `${l.cycle_count}/20 sesi ✅ — reward *${l.available.join(' & ')}* sudah bisa dipakai di sesi berikutnya 🎁` : `${l.cycle_count}/20 sesi, tinggal ${l.next.remaining} sesi lagi untuk dapat *${l.next.label}* 🎁`;
  return { nama: p.nickname, sesi: s.name, hari: GR_DAYS[dt.getDay()], tanggal: `${dt.getDate()} ${GR_MON[dt.getMonth()]}`, jam: `${String(s.start).replace(':', '.')}–${String(s.end).replace(':', '.')}`, lokasi: s.venue || 'lokasi main', olahraga: s.sport, lapangan: court || '…', biaya: grFmtRp(p.due), kartu };
}
const grFill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

route('#/sessions/(\\d+)/greetings', id => guard(async () => {
  const v = view(), key = 'npd.greet.' + id;
  const sent = () => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } };
  const mark = (type, mid) => { try { const x = sent(); (x[type] = x[type] || []).includes(mid) || x[type].push(mid); localStorage.setItem(key, JSON.stringify(x)); } catch (e) { /* storage unavailable: skip ticks */ } };
  let d = null; const st = grState[id] || (grState[id] = { tab: null, court: (() => { try { return localStorage.getItem(key + '.court') || ''; } catch (e) { return ''; } })() });
  const pick = (type, p) => type === 'pay' ? p.payment_status === 'Waiting for Payment' : type === 'play' ? ['Paid', 'Partially Refunded'].includes(p.payment_status) : (['Paid', 'Partially Refunded'].includes(p.payment_status) && p.attendance === 'Attended');
  const load = async () => {
    d = await GET(`/api/sessions/${id}/greetings`);
    if (!st.tab) { const today = new Date().toISOString().slice(0, 10), n = t => d.people.filter(p => pick(t, p)).length; st.tab = n('pay') && d.session.date >= today ? 'pay' : d.session.date > today ? 'play' : d.session.date === today ? 'play' : (n('thanks') ? 'thanks' : 'play'); }
    draw();
  };
  const draw = () => {
    const done = new Set((sent()[st.tab]) || []), list = d.people.filter(p => pick(st.tab, p)), tpl = d.templates[st.tab], ops = can('operations');
    mount(v, html`<a href="#/sessions/${id}" class="small">${icon('chevL', 14)} ${d.session.name}</a>
      ${pageHead('Pesan ke member', `${d.session.name} · ${fdate(d.session.date)}`, ops ? html`<button class="btn" id="gr-edit">${icon('edit', 16)} Ubah template</button>` : '')}
      <div class="mm-tabs">${GR_TABS.map(([k, l]) => html`<button class="chip gr-tab${st.tab === k ? ' on' : ''}" data-tab="${k}">${l} <b>${d.people.filter(p => pick(k, p)).length}</b></button>`)}</div>
      ${st.tab === 'play' ? html`<div class="field" style="max-width:280px"><label>No. lapangan</label><input class="inp" id="gr-court" value="${st.court}" placeholder="mis. 3 & 4" maxlength="30"></div>` : ''}
      <div class="muted small" style="margin:6px 0 10px">Tap <b>Salin</b>, lalu tempel ke chat Reclub member. Yang sudah disalin diberi tanda ✓.</div>
      ${list.length ? html`<div class="card gr-list">${list.map(p => { const txt = grFill(tpl, grVars(d, p, st.court)); return html`<div class="gr-row${done.has(p.member_id) ? ' done' : ''}">
        <div class="gr-top"><div class="avatar">${(p.nickname || '?')[0]}</div><div class="grow"><b>${p.nickname}</b> ${done.has(p.member_id) ? html`<span class="badge green">✓ Disalin</span>` : ''}</div>
          ${st.tab === 'thanks' ? html`<button class="btn sm" data-card="${p.member_id}">Kartu PNG</button>` : ''}<button class="btn sm primary" data-copy="${p.member_id}">Salin</button></div>
        <div class="gr-msg" data-open>${txt}</div></div>`; })}</div>`
        : html`<div class="card">${emptyState(st.tab === 'pay' ? 'Tidak ada yang menunggu pembayaran.' : st.tab === 'play' ? 'Belum ada peserta yang sudah bayar.' : 'Belum ada peserta yang ditandai hadir. Tandai kehadiran dulu di halaman sesi.')}</div>`}`);
    v._list = list;
  };
  on(v, 'click', '[data-tab]', ev => { st.tab = ev.target.closest('[data-tab]').dataset.tab; draw(); });
  on(v, 'input', '#gr-court', ev => { st.court = ev.target.value; try { localStorage.setItem(key + '.court', st.court); } catch (e) { /* ignore */ } v.querySelectorAll('.gr-row').forEach((row, i) => { const p = v._list[i]; if (p) row.querySelector('.gr-msg').textContent = grFill(d.templates.play, grVars(d, p, st.court)); }); });
  on(v, 'click', '[data-open]', ev => ev.target.closest('.gr-msg').classList.toggle('open'));
  on(v, 'click', '[data-copy]', async ev => {
    const mid = +ev.target.closest('[data-copy]').dataset.copy, p = d.people.find(x => x.member_id === mid); if (!p) return;
    try { await grCopy(grFill(d.templates[st.tab], grVars(d, p, st.court))); mark(st.tab, mid); toast(`Pesan untuk ${p.nickname} disalin`); draw(); } catch (e) { toast('Gagal menyalin. Tekan lama pada teks untuk menyalin manual.', 'err'); }
  });
  on(v, 'click', '[data-card]', async ev => {
    const mid = +ev.target.closest('[data-card]').dataset.card;
    try { const m = (await GET(`/api/members/${mid}/profile`)).member, ly = await GET(`/api/members/${mid}/loyalty`); await LC.shareImage(m, ly, 'both'); } catch (e) { toast(e.message, 'err'); }
  });
  on(v, 'click', '#gr-edit', () => {
    const type = st.tab, label = GR_TABS.find(t => t[0] === type)[1];
    const m = openModal({ title: `Template: ${label}`, body: html`<div class="field"><label>Isi pesan</label><textarea class="inp" id="gt-text" rows="9" maxlength="1500">${d.templates[type]}</textarea></div>
      <div class="muted xs">Kata yang otomatis terisi: <code>{nama}</code> <code>{sesi}</code> <code>{hari}</code> <code>{tanggal}</code> <code>{jam}</code> <code>{lokasi}</code> <code>{olahraga}</code> ${type === 'pay' ? html`<code>{biaya}</code>` : ''}${type === 'play' ? html`<code>{lapangan}</code>` : ''}${type === 'thanks' ? html`<code>{kartu}</code>` : ''}. Pakai *teks* untuk huruf tebal.</div>`,
      footer: html`<button class="btn" id="gt-reset" style="margin-right:auto">Kembalikan default</button><button class="btn" data-close>Batal</button><button class="btn primary" id="gt-save">Simpan</button>` });
    const save = async txt => { try { await api('PUT', '/api/message-templates', { [type]: txt }); m.close(); toast('Template disimpan'); load(); } catch (e) { toast(e.message, 'err'); } };
    $('#gt-save', m.el).addEventListener('click', () => save($('#gt-text', m.el).value));
    $('#gt-reset', m.el).addEventListener('click', () => save(d.defaults[type]));
  });
  await load();
}));
