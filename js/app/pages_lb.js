'use strict';
// =================================================================== MEMBER PHOTOS + LEADERBOARD
const PH = {
  map: {}, loaded: false,
  async load(force) { if (this.loaded && !force) return this.map; try { this.map = (await GET('/api/member-photos')).photos || {}; this.loaded = true; } catch (e) { /* offline: no photos */ } return this.map; },
  // square-crop and shrink to a small JPEG data URL
  async resize(file, px = 256) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, er) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => er(new Error('Foto tidak bisa dibaca.')); i.src = url; });
      const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = px;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, px, px);
      return c.toDataURL('image/jpeg', 0.82);
    } finally { URL.revokeObjectURL(url); }
  },
};
const phAvatar = (id, name, size = 40, cls = '') => {
  const d = PH.map[id], ini = esc(((name || '?').trim()[0] || '?').toUpperCase());
  return raw(`<span class="pav ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${d ? `<img src="${d}" alt="">` : ini}</span>`);
};
const phTrophy = (color, size = 22) => raw(`<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${LC.trophy(50, 50, 100, color)}</svg>`);
const LB_COL = ['#E0A800', '#8F9BB3', '#B8692F'];   // gold, silver, bronze

// ------------------------------------------------------------- shareable image (IG feed 4:5 or story 9:16)
function lbSvg(data, o) {
  const W = 1080, H = o.story ? 1920 : 1350, dy = o.story ? 190 : 40, e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s), F = "Arial,'Helvetica Neue',sans-serif", rows = data.rows;
  let defs = '', body = '', k = 0;
  const avatar = (m, cx, cy, r, ring) => {
    const id = 'c' + (k++), ph = o.photos[m.member_id];
    defs += `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
    body += ph ? `<image href="${ph}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#E6EEFB"/><text x="${cx}" y="${cy + r * .34}" font-size="${r * 1.0}" font-weight="800" fill="#004ECC" text-anchor="middle" font-family="${F}">${e(((m.nickname || '?')[0] || '?').toUpperCase())}</text>`;
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="${r > 100 ? 10 : 7}"/>`;
  };
  const T = (x, y, s, size, fill, a = 'middle', w = 800, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${a}" font-family="${F}" ${extra}>${e(s)}</text>`;
  // header
  body += T(60, 118, 'LEADERBOARD', 86, '#fff', 'start', 900, 'font-style="italic"') + T(60, 170, o.sub, 34, '#BFD2FF', 'start', 600);
  if (o.logo) body += `<image href="${o.logo}" x="880" y="40" width="140" height="140" preserveAspectRatio="xMidYMid meet"/>`;
  // podium: order 2 - 1 - 3
  const slot = { 1: { x: 540, y: 430 + dy, r: 125, t: 120 }, 2: { x: 205, y: 490 + dy, r: 95, t: 76 }, 3: { x: 875, y: 490 + dy, r: 95, t: 76 } };
  [2, 1, 3].forEach(pos => {
    const m = rows[pos - 1]; if (!m) return; const s = slot[pos], col = LB_COL[pos - 1];
    body += LC.trophy(s.x, s.y - s.r - s.t * .55, s.t, col); avatar(m, s.x, s.y, s.r, col);
    const ny = s.y + s.r + 52; body += T(s.x, ny, cut(m.nickname, pos === 1 ? 13 : 11), pos === 1 ? 46 : 38, '#fff') + T(s.x, ny + (pos === 1 ? 70 : 62), `${m.win_rate % 1 ? m.win_rate.toFixed(1) : m.win_rate}%`, pos === 1 ? 68 : 54, '#FFC23D', 'middle', 900) + T(s.x, ny + (pos === 1 ? 108 : 96), `${m.wins}W · ${m.losses}L${m.draws ? ' · ' + m.draws + 'D' : ''} · ${m.played} main`, 24, '#BFD2FF', 'middle', 600);
  });
  // rest of the list
  const y0 = 800 + dy + 70, n = Math.max(0, Math.floor((H - 150 - y0) / 92));
  rows.slice(3, 3 + n).forEach((m, i) => {
    const y = y0 + i * 92;
    body += `<rect x="60" y="${y - 40}" width="960" height="78" rx="20" fill="#fff" fill-opacity=".1"/>` + T(110, y + 12, String(m.rank), 36, '#FFC23D', 'middle', 900);
    avatar(m, 200, y - 1, 29, '#fff'); body += T(250, y + 12, cut(m.nickname, 18), 34, '#fff', 'start', 700) + T(830, y + 10, `${m.wins}W · ${m.losses}L`, 24, '#BFD2FF', 'end', 600) + T(990, y + 13, `${m.win_rate % 1 ? m.win_rate.toFixed(1) : m.win_rate}%`, 38, '#fff', 'end', 900);
  });
  if (!rows.length) body += T(540, 640, 'Belum ada match dengan skor', 40, '#BFD2FF', 'middle', 700);
  body += T(540, H - 78, 'NPD · Network. Play. Discover.', 30, '#fff', 'middle', 800) + T(540, H - 40, 'Datang sendiri, pulang bawa circle.', 24, '#BFD2FF', 'middle', 600, 'font-style="italic"');
  const court = `<g fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="6"><rect x="40" y="${H - 640}" width="1000" height="560" rx="6"/><line x1="540" y1="${H - 640}" x2="540" y2="${H - 80}"/><line x1="40" y1="${H - 360}" x2="1040" y2="${H - 360}"/></g>`;
  return { W, H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#004ECC"/><stop offset="1" stop-color="#001F54"/></linearGradient>${defs}</defs><rect width="${W}" height="${H}" fill="url(#bg)"/>${court}${body}</svg>` };
}
async function lbShare(data, o) {
  const { W, H, svg } = lbSvg(data, o), im = new Image();
  await new Promise((ok, er) => { im.onload = ok; im.onerror = () => er(new Error('Gagal membuat gambar.')); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(im, 0, 0, W, H);
  const blob = await new Promise(r => c.toBlob(r, 'image/png')), name = `leaderboard-npd-${o.story ? 'story' : 'feed'}.png`, file = new File([blob], name, { type: 'image/png' });
  if (!o.download) { try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Leaderboard NPD' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; } }
  saveDownload({ name, mime: 'image/png', data: blob });
}

// ------------------------------------------------------------- page
const lbState = { sport: '', period: 'all', min: 3 };
const lbDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
async function lbPage(sessionId) {
  const v = view(), sports = M().sports.filter(s => s.active);
  const render = async () => {
    const now = new Date(), q = new URLSearchParams(); let sub;
    if (sessionId) q.set('session_id', sessionId);
    else {
      if (lbState.sport) q.set('sport_id', lbState.sport);
      if (lbState.period === 'month') q.set('from', lbDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      if (lbState.period === '30') q.set('from', lbDate(new Date(now.getTime() - 30 * 864e5)));
      q.set('min', lbState.min);
    }
    const [r] = await Promise.all([GET(`/api/leaderboard?${q}`), PH.load()]);
    sub = sessionId && r.session ? `${r.session.name} · ${fdate(r.session.date)}` : `${lbState.sport ? (sports.find(s => String(s.id) === String(lbState.sport)) || {}).name : 'Semua olahraga'} · ${{ all: 'Sepanjang waktu', month: 'Bulan ini', 30: '30 hari terakhir' }[lbState.period]}`;
    const logo = await LC.logo().catch(() => ''), top = r.rows.slice(0, 3), rest = r.rows.slice(3), opts = { sub, logo, photos: PH.map };
    const pct = m => `${m.win_rate % 1 ? m.win_rate.toFixed(1) : m.win_rate}%`;
    mount(v, html`${sessionId ? html`<a href="#/sessions/${sessionId}/match" class="small">${icon('chevL', 14)} Match</a>` : ''}
      ${pageHead('Leaderboard', sub, html`<button class="btn" id="lb-feed">${icon('upload', 16)} Bagikan (Feed)</button><button class="btn" id="lb-story">Story 9:16</button>`)}
      ${sessionId ? '' : html`<div class="toolbar"><select class="inp" id="lb-sport"><option value="">Semua olahraga</option>${sports.map(s => html`<option value="${s.id}" ${String(s.id) === String(lbState.sport) ? 'selected' : ''}>${s.name}</option>`)}</select>
        <select class="inp" id="lb-period">${[['all', 'Sepanjang waktu'], ['month', 'Bulan ini'], ['30', '30 hari terakhir']].map(([k, l]) => html`<option value="${k}" ${lbState.period === k ? 'selected' : ''}>${l}</option>`)}</select>
        <select class="inp" id="lb-min">${[1, 3, 5, 10].map(n => html`<option value="${n}" ${+lbState.min === n ? 'selected' : ''}>Min. ${n} match</option>`)}</select></div>`}
      <div class="muted small" style="margin:4px 0 12px">Urut berdasarkan win rate (Win ÷ match ber-skor). ${r.total_matches} match ber-skor${sessionId ? '' : ` · tampil jika main minimal ${r.min}x`}.</div>
      ${r.rows.length ? html`<div class="lb-podium">${[2, 1, 3].map(pos => { const m = top[pos - 1]; return m ? html`<a class="lb-p p${pos}" href="#/members/${m.member_id}"><span class="lb-tr">${phTrophy(LB_COL[pos - 1], pos === 1 ? 40 : 28)}</span>${phAvatar(m.member_id, m.nickname, pos === 1 ? 84 : 64, 'ring' + pos)}<b class="lb-n">${m.nickname}</b><span class="lb-wr">${pct(m)}</span><span class="muted xs">${m.wins}W · ${m.losses}L · ${m.played} main</span></a>` : html`<span></span>`; })}</div>
        ${rest.length ? html`<div class="card lb-list">${rest.map(m => html`<a class="lb-row" href="#/members/${m.member_id}"><span class="lb-rk">${m.rank}</span>${phAvatar(m.member_id, m.nickname, 38)}<span class="grow"><b>${m.nickname}</b><span class="lb-bar"><i style="width:${Math.min(100, m.win_rate)}%"></i></span></span><span class="muted xs lb-wl">${m.wins}W · ${m.losses}L</span><b class="lb-pct">${pct(m)}</b></a>`)}</div>` : ''}`
        : html`<div class="card">${emptyState('Belum ada match dengan skor yang memenuhi syarat. Isi skor di halaman Generate match.')}</div>`}`);
    v._r = r; v._o = opts;
  };
  const rerender = () => render().catch(e => toast(e.message, 'err'));
  on(v, 'change', '#lb-sport', e => { lbState.sport = e.target.value; rerender(); });
  on(v, 'change', '#lb-period', e => { lbState.period = e.target.value; rerender(); });
  on(v, 'change', '#lb-min', e => { lbState.min = +e.target.value; rerender(); });
  on(v, 'click', '#lb-feed', () => lbShare(v._r, { ...v._o, story: false }).catch(e => toast(e.message, 'err')));
  on(v, 'click', '#lb-story', () => lbShare(v._r, { ...v._o, story: true, download: false }).catch(e => toast(e.message, 'err')));
  await render();
}
route('#/leaderboard', () => guard(() => lbPage(0)), 'members');
route('#/sessions/(\\d+)/leaderboard', id => guard(() => lbPage(+id)), 'sessions');

// ------------------------------------------------------------- photo pickers (member form + member page)
window.mfPhoto = undefined;   // member form: undefined = unchanged, null = remove, string = new photo
document.addEventListener('change', async ev => {
  const t = ev.target; if (!t || !t.matches || !t.matches('#mf-ph-in, #mp-ph-in') || !t.files || !t.files[0]) return;
  try {
    const data = await PH.resize(t.files[0]);
    if (t.id === 'mf-ph-in') { window.mfPhoto = data; const p = document.getElementById('mf-ph-prev'); if (p) p.innerHTML = `<img src="${data}" alt="">`; }
    else { const mid = +t.dataset.mid; await api('PUT', `/api/members/${mid}/photo`, { data }); PH.map[mid] = data; toast('Foto disimpan'); const img = document.getElementById('mp-ph-prev'); if (img) img.innerHTML = `<img src="${data}" alt="">`; }
  } catch (e) { toast(e.message, 'err'); }
  t.value = '';
});
document.addEventListener('click', async ev => {
  const b = ev.target && ev.target.closest && ev.target.closest('#mf-ph-del, #mp-ph-del'); if (!b) return;
  if (b.id === 'mf-ph-del') { window.mfPhoto = null; const p = document.getElementById('mf-ph-prev'); if (p) p.innerHTML = String((p.dataset.ini || '?')); }
  else { const mid = +b.dataset.mid; try { await api('DELETE', `/api/members/${mid}/photo`); delete PH.map[mid]; toast('Foto dihapus'); const p = document.getElementById('mp-ph-prev'); if (p) p.innerHTML = String(p.dataset.ini || '?'); } catch (e) { toast(e.message, 'err'); } }
});
