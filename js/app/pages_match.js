'use strict';
// =================================================================== MATCHMAKING (per session)
const MM_LEVELS = ['', '1 · Newbie', '2 · Pemula', '3 · Menengah', '4 · Mahir', '5 · Jago'];
const mmState = {};   // per-session UI settings kept while navigating

function mmSheetSvg(title, sub, names, matches, rest) {
  const esc_ = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nm = ids => ids.map(i => names[i] || '?').join(' & '), rounds = new Map();
  matches.forEach(m => { (rounds.get(m.round) || rounds.set(m.round, []).get(m.round)).push(m); });
  let y = 150, body = '';
  for (const [r, ms] of rounds) {
    body += `<rect x="40" y="${y - 30}" width="920" height="40" rx="8" fill="#004ECC"/><text x="60" y="${y - 3}" font-size="24" font-weight="800" fill="#fff" font-family="Arial,sans-serif">RONDE ${r}</text>`; y += 34;
    for (const m of ms) {
      body += `<text x="60" y="${y + 24}" font-size="20" fill="#001F54" font-weight="700" font-family="Arial,sans-serif">Lap ${m.court}</text>`;
      body += `<text x="150" y="${y + 24}" font-size="22" fill="#001F54" font-family="Arial,sans-serif">${esc_(nm(m.a))}</text><text x="540" y="${y + 24}" font-size="18" fill="#BF0100" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">VS</text><text x="570" y="${y + 24}" font-size="22" fill="#001F54" font-family="Arial,sans-serif">${esc_(nm(m.b))}</text>`;
      if (m.featured) body += `<text x="940" y="${y + 24}" font-size="18" font-weight="800" fill="#BF0100" text-anchor="end" font-family="Arial,sans-serif">★ SERU</text>`;
      y += 40;
    }
    const rs = (rest.get(r) || []); if (rs.length) { body += `<text x="60" y="${y + 18}" font-size="17" fill="#6B7A99" font-family="Arial,sans-serif">Istirahat: ${esc_(nm(rs))}</text>`; y += 30; }
    y += 44;
  }
  const H = y + 30;
  return { H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${H}" width="1000" height="${H}"><rect width="1000" height="${H}" fill="#F5F3EE"/><rect width="1000" height="110" fill="#004ECC"/><text x="40" y="58" font-size="34" font-weight="800" fill="#fff" font-style="italic" font-family="Arial Black,Arial,sans-serif">${esc_(title)}</text><text x="40" y="92" font-size="20" fill="#fff" font-family="Arial,sans-serif">${esc_(sub)}</text>${body}<text x="500" y="${H - 8}" font-size="15" fill="#6B7A99" text-anchor="middle" font-family="Arial,sans-serif">NPD · Network. Play. Discover.</text></svg>` };
}
async function mmShare(title, sub, names, matches, rest) {
  const { H, svg } = mmSheetSvg(title, sub, names, matches, rest);
  const im = new Image(); await new Promise((ok, er) => { im.onload = ok; im.onerror = () => er(new Error('Gagal membuat gambar.')); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = 2000; c.height = H * 2; c.getContext('2d').drawImage(im, 0, 0, 2000, H * 2);
  const blob = await new Promise(r => c.toBlob(r, 'image/png')), name = `match-${title.replace(/\W+/g, '-').toLowerCase()}.png`, file = new File([blob], name, { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  saveDownload({ name, mime: 'image/png', data: blob });
}

route('#/sessions/(\\d+)/match', id => guard(async () => {
  const v = view(), ops = can('operations'); id = +id;
  const st = mmState[id] || (mmState[id] = { mode: 'doubles', courts: 2, rounds: 0, featured: '', host_level: null, sel: null });
  const load = async () => {
    const r = await GET(`/api/sessions/${id}/matchup`); if (st.sel === null) st.sel = new Set(r.players.filter(p => p.eligible).map(p => p.member_id));
    if (st.host_level === null) st.host_level = r.host_level || 3;
    const n = r.players.filter(p => st.sel.has(p.member_id)).length, odd = n % 2 === 1, rounds = new Map(), rest = new Map();
    const byRound = new Map(); r.matches.forEach(m => { (byRound.get(m.round) || byRound.set(m.round, []).get(m.round)).push(m); });
    const nameOf = i => r.names[i] || '?', nm = ids => ids.map(nameOf).join(' & ');
    // who rests each round = everyone in the match list that round is playing; rest = all others who played in other rounds
    const everyone = new Set(); r.matches.forEach(m => [...m.a, ...m.b].forEach(i => everyone.add(i)));
    byRound.forEach((ms, rd) => { const pl = new Set(); ms.forEach(m => [...m.a, ...m.b].forEach(i => pl.add(i))); rest.set(rd, [...everyone].filter(i => !pl.has(i))); });
    mount(v, html`
      <a href="#/sessions/${id}" class="small">${icon('chevL', 14)} ${r.session.name}</a>
      ${pageHead('Generate match', `${r.session.sport} · ${fdate(r.session.event_date)}`, '')}
      <div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Pemain (${n} dipilih${odd ? ' + Host' : ''})</h2></div>
        <div class="muted small" style="margin-bottom:8px">Level: 1 Newbie · 2 Pemula · 3 Menengah · 4 Mahir · 5 Jago. Perubahan level tersimpan otomatis per olahraga.</div>
        ${r.players.length ? html`<div class="mm-list">${r.players.map(p => html`<div class="mm-row${p.eligible ? '' : ' dim'}"><label class="check"><input type="checkbox" data-sel="${p.member_id}" ${st.sel.has(p.member_id) ? 'checked' : ''}> <span class="strong">${p.nickname}</span></label>
          <span class="mm-b">${p.first_timer ? badge('Newbie', 'green') : ''}${p.eligible ? '' : badge(p.payment_status === 'Waiting for Payment' ? 'Belum bayar' : p.attendance === 'No Show' ? 'No show' : p.payment_status, 'grey')}${p.level_set ? '' : html`<span class="muted xs">level belum diisi</span>`}</span>
          <select class="inp" data-lv="${p.member_id}" ${ops ? '' : 'disabled'}>${[1, 2, 3, 4, 5].map(l => html`<option value="${l}" ${l === p.level ? 'selected' : ''}>${MM_LEVELS[l]}</option>`)}</select></div>`)}</div>` : emptyState('Belum ada peserta', 'Tambahkan peserta ke sesi ini dulu.', '')}
      </div>
      ${ops ? html`<div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Pengaturan</h2></div>
        <div class="grid g2">
          <div class="field"><label>Format</label><select class="inp" id="mm-mode"><option value="doubles" ${st.mode === 'doubles' ? 'selected' : ''}>2 vs 2 (pasangan rotasi)</option><option value="singles" ${st.mode === 'singles' ? 'selected' : ''}>1 vs 1</option></select></div>
          <div class="field"><label>Jumlah lapangan</label><input class="inp" id="mm-courts" type="number" min="1" max="10" value="${st.courts}"></div>
          <div class="field"><label>Jumlah ronde (0 = otomatis)</label><input class="inp" id="mm-rounds" type="number" min="0" max="20" value="${st.rounds}"><div class="hint">Otomatis = jumlah ronde yang bikin semua main sama banyak.</div></div>
          <div class="field"><label>Match seru jago vs jago</label><input class="inp" id="mm-feat" type="number" min="0" max="20" value="${st.featured}" placeholder="otomatis"><div class="hint">Kosong = otomatis (± 1 tiap 3 ronde).</div></div>
          ${odd ? html`<div class="field"><label>Level Host (pemain ganjil)</label><select class="inp" id="mm-host">${[1, 2, 3, 4, 5].map(l => html`<option value="${l}" ${l === st.host_level ? 'selected' : ''}>${MM_LEVELS[l]}</option>`)}</select><div class="hint">Jumlah pemain ganjil, jadi Host ikut main supaya genap.</div></div>` : ''}
        </div>
        <button class="btn primary" id="mm-go">${r.matches.length ? 'Generate ulang' : 'Generate match'}</button></div>` : ''}
      ${r.matches.length ? html`<div class="card" style="margin-bottom:14px"><div class="card-title"><h2>Hasil match</h2><div class="actions"><button class="btn sm" id="mm-png">Bagikan PNG</button>${ops ? html`<button class="btn sm danger" id="mm-del">Hapus</button>` : ''}</div></div>
        <div class="muted small" style="margin-bottom:10px">${r.summary.matches} match · ${r.summary.rounds} ronde · main ${r.summary.min_plays === r.summary.max_plays ? html`<b>${r.summary.max_plays}x semua</b>` : html`<b>${r.summary.min_plays}–${r.summary.max_plays}x</b> per orang`}</div>
        ${[...byRound.entries()].map(([rd, ms]) => html`<div class="mm-round"><div class="mm-rh">Ronde ${rd}</div>${ms.map(m => html`<div class="mm-match${m.featured ? ' feat' : ''}"><div class="mm-c">Lap ${m.court}${m.featured ? html` <span class="mm-star">★ Seru</span>` : ''}</div>
          <div class="mm-t"><span>${nm(m.a)}</span><span class="mm-vs">vs</span><span>${nm(m.b)}</span></div>
          <div class="mm-s"><input class="inp" type="number" min="0" max="99" data-sc="${m.id}" data-side="a" value="${m.score_a ?? ''}" ${ops ? '' : 'disabled'} aria-label="Skor tim 1"><span>–</span><input class="inp" type="number" min="0" max="99" data-sc="${m.id}" data-side="b" value="${m.score_b ?? ''}" ${ops ? '' : 'disabled'} aria-label="Skor tim 2"></div></div>`)}
          ${rest.get(rd).length ? html`<div class="muted xs mm-rest">Istirahat: ${nm(rest.get(rd))}</div>` : ''}</div>`)}
        <h3 style="margin:14px 0 6px">Jumlah main</h3><div class="mm-plays">${r.summary.rows.map(x => html`<span class="chip">${x.name} <b>${x.plays}x</b>${x.wins ? html` · ${x.wins} menang` : ''}</span>`)}</div></div>` : ''}`);
    r._byRound = byRound; r._rest = rest; cur = r;
  };
  let cur = null;
  await load();
  on(v, 'change', '[data-sel]', e => { const i = +e.target.dataset.sel; e.target.checked ? st.sel.add(i) : st.sel.delete(i); load(); });
  on(v, 'change', '[data-lv]', async e => { const sp = (await GET('/api/sessions/' + id)).session.sport_id; try { await api('PUT', '/api/member-skills', { member_id: +e.target.dataset.lv, sport_id: sp, level: +e.target.value }); toast('Level disimpan'); } catch (er) { toast(er.message, 'err'); } });
  on(v, 'change', '#mm-mode', e => { st.mode = e.target.value; });
  on(v, 'change', '#mm-courts', e => { st.courts = +e.target.value || 1; });
  on(v, 'change', '#mm-rounds', e => { st.rounds = +e.target.value || 0; });
  on(v, 'change', '#mm-feat', e => { st.featured = e.target.value; });
  on(v, 'change', '#mm-host', e => { st.host_level = +e.target.value; });
  on(v, 'change', '[data-sc]', async e => {
    const mid = +e.target.dataset.sc, a = $(`[data-sc="${mid}"][data-side=a]`, v).value, b = $(`[data-sc="${mid}"][data-side=b]`, v).value;
    if (a === '' && b === '') { try { await api('PUT', `/api/matches/${mid}`, { score_a: '', score_b: '' }); } catch (er) { toast(er.message, 'err'); } return; }
    if (a === '' || b === '') return;
    try { await api('PUT', `/api/matches/${mid}`, { score_a: a, score_b: b }); toast('Skor disimpan'); } catch (er) { toast(er.message, 'err'); }
  });
  on(v, 'click', '#mm-go', async () => {
    const body = { mode: st.mode, courts: st.courts, rounds: st.rounds, featured: st.featured, host_level: st.host_level, members: [...st.sel] };
    const run = force => api('POST', `/api/sessions/${id}/matchup/generate`, { ...body, force }).then(() => { toast('Match dibuat'); load(); });
    try { await run(false); } catch (er) { if (er.status === 409 && await confirmBox({ title: 'Generate ulang?', message: er.message, confirmText: 'Hapus & generate ulang', danger: true })) { try { await run(true); } catch (e2) { toast(e2.message, 'err'); } } else if (er.status !== 409) toast(er.message, 'err'); }
  });
  on(v, 'click', '#mm-png', () => mmShare(cur.session.name, `${cur.session.sport} · ${fdate(cur.session.event_date)}`, cur.names, cur.matches, cur._rest).catch(e => toast(e.message, 'err')));
  on(v, 'click', '#mm-del', async () => { if (await confirmBox({ title: 'Hapus semua match?', message: 'Semua match dan skor sesi ini dihapus.', confirmText: 'Hapus', danger: true })) { await api('DELETE', `/api/sessions/${id}/matchup`); load(); } });
}), 'sessions');
