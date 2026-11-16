'use strict';
/* NPD Loyalty Card: built as SVG (100 x 70 mm, 10 units = 1 mm). Used for the in-app card, PNG sharing and the print PDF. */
const LC = (() => {
  const NAVY = '#001F54', BLUE = '#004ECC', RED = '#BF0100', MIST = '#E6EEFB', COURT = '#F5F3EE', SUN = '#FFC23D', GREY = '#9AA5B8';
  const HEAD = "'Archivo','Archivo Black','Arial Black','Helvetica Neue',Arial,sans-serif", BODY = "'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif";
  const STAMP_R = 54, CHK_R = 62, PITCH = 132, Y0 = 200, XS = [110, 260, 410, 560], XC = 795;
  const REWARD_TXT = [['25%', 'OFF'], ['50%', 'OFF'], ['75%', 'OFF'], ['FREE', 'SESSION']];
  let badgeURI = null;
  let reclubURI = null;
  const toURI = async u => { const b = await (await fetch(u)).blob(); return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); };
  async function badge() { if (!badgeURI) badgeURI = await toURI('img/brand/badge.png'); if (!reclubURI) reclubURI = await toURI('img/brand/reclub.png').catch(() => ''); return badgeURI; }
  const t = (x, y, s, size, fill, o = {}) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-family="${o.head ? HEAD : BODY}" font-weight="${o.w || 800}"${o.head || o.italic ? ' font-style="italic"' : ''} text-anchor="${o.a || 'start'}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.len ? ` textLength="${o.len}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(s)}</text>`;
  const star = (cx, cy, R, r, n, fill) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n - Math.PI / 2, rr = i % 2 ? r : R; p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1)); } return `<polygon points="${p.join(' ')}" fill="${fill}"/>`; };

  const trophy = (cx, cy, sz, fill) => `<g transform="translate(${cx},${cy}) scale(${sz / 100})" fill="${fill}" stroke="${fill}"><path d="M-24,-36 H24 V-8 a24,26 0 0 1 -48,0 Z" stroke="none"/><path d="M-24,-28 H-38 q0,24 20,26 M24,-28 H38 q0,24 -20,26" fill="none" stroke-width="7" stroke-linecap="round"/><rect x="-5" y="16" width="10" height="16" stroke="none"/><rect x="-20" y="30" width="40" height="10" rx="3" stroke="none"/></g>`;
  const icIG = (x, y, z, c) => `<rect x="${x + 2}" y="${y + 2}" width="${z - 4}" height="${z - 4}" rx="${z * .28}" fill="none" stroke="${c}" stroke-width="3.5"/><circle cx="${x + z / 2}" cy="${y + z / 2}" r="${z * .22}" fill="none" stroke="${c}" stroke-width="3.5"/><circle cx="${x + z * .75}" cy="${y + z * .25}" r="2.8" fill="${c}"/>`;
  const icTH = (x, y, z, c) => `<rect x="${x}" y="${y}" width="${z}" height="${z}" rx="${z * .28}" fill="${c}"/>` + t(x + z / 2, y + z * .72, '@', z * .62, '#fff', { a: 'middle', w: 800 });
  const icRC = (x, y, z, c) => `<rect x="${x}" y="${y}" width="${z}" height="${z}" rx="${z * .28}" fill="${c}"/><circle cx="${x + z / 2}" cy="${y + z / 2}" r="${z * .28}" fill="none" stroke="#fff" stroke-width="3"/><path d="M${x + z * .27} ${y + z * .36} q${z * .23} ${z * .14} 0 ${z * .28} M${x + z * .73} ${y + z * .36} q${-z * .23} ${z * .14} 0 ${z * .28}" fill="none" stroke="#fff" stroke-width="2.4"/>`;
  const court = () => { const c = '#DCE6F7', l = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; return `<g stroke="${c}" stroke-width="5" fill="none" stroke-linecap="square"><rect x="40" y="150" width="920" height="520"/>${l(40, 215, 960, 215)}${l(40, 605, 960, 605)}${l(500, 150, 500, 670)}${l(270, 215, 270, 605)}${l(730, 215, 730, 605)}${l(270, 410, 730, 410)}</g><circle cx="500" cy="410" r="70" fill="none" stroke="${c}" stroke-width="5"/>`; };
  function ball(cx, cy, r, kind, state, n, id) {
    // state: blank | done | ; kind: 0 tennis, 1 pickle
    const done = state === 'done', stroke = done ? BLUE : BLUE, fill = done ? BLUE : '#fff', seam = done ? '#ffffff' : '#C9D8F3', so = done ? .35 : 1;
    let g = `<clipPath id="c${id}"><circle cx="${cx}" cy="${cy}" r="${r - 2}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="4"/><g clip-path="url(#c${id})" opacity="${so}">`;
    if (kind === 0) g += `<circle cx="${cx - r * 1.12}" cy="${cy}" r="${r * .95}" fill="none" stroke="${seam}" stroke-width="5"/><circle cx="${cx + r * 1.12}" cy="${cy}" r="${r * .95}" fill="none" stroke="${seam}" stroke-width="5"/>`;
    else { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; g += `<circle cx="${(cx + r * .74 * Math.cos(a)).toFixed(1)}" cy="${(cy + r * .74 * Math.sin(a)).toFixed(1)}" r="3.6" fill="${seam}"/>`; } for (let i = 0; i < 5; i++) { const a = i * 2 * Math.PI / 5 + .3; g += `<circle cx="${(cx + r * .4 * Math.cos(a)).toFixed(1)}" cy="${(cy + r * .4 * Math.sin(a)).toFixed(1)}" r="3.6" fill="${seam}"/>`; } }
    g += '</g>';
    if (done) g += `<path d="M${cx - 20} ${cy + 2} l13 14 l27 -30" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
    else g += t(cx, cy + r - 13, String(n), 19, '#8EA6D6', { a: 'middle', w: 700 });
    return g;
  }
  function checkpoint(cy, k, state, n, id) {
    // state: blank | avail | used
    const cx = XC, r = CHK_R, col = state === 'used' ? GREY : RED;
    let g = '';
    if (state === 'avail') g += star(cx, cy, r + 8, r + 1, 18, SUN);
    else g += `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>`;
    g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${state === 'blank' ? '#fff' : col}" stroke="${col}" stroke-width="6"/>`;
    if (state === 'blank') {
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="none" stroke="#F3C9C9" stroke-width="3" stroke-dasharray="3 7"/>`;
      g += trophy(cx, cy - 2, 62, '#F0CACA');
    } else g += trophy(cx, cy - 2, 70, '#fff');
    const lx = 912, a = REWARD_TXT[k], c = state === 'used' ? GREY : RED;
    g += t(lx, cy + 8, a[0], k === 3 ? 34 : 40, c, { a: 'middle', head: true }) + t(lx, cy + 34, a[1], k === 3 ? 17 : 19, c, { a: 'middle', ls: 2, w: 700 });
    if (state === 'used') g += t(lx, cy - 24, 'TERPAKAI', 14, GREY, { a: 'middle', w: 700, ls: 1 });
    return g;
  }
  const marks = (P, B) => { const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`, W = 1000 + P, H = 700 + P, s = [];
    for (const [x, y] of [[P, P], [W, P], [P, H], [W, H]]) { const dx = x === P ? -1 : 1, dy = y === P ? -1 : 1; s.push(L(x + dx * B, y, x + dx * (B + 28), y), L(x, y + dy * B, x, y + dy * (B + 28))); }
    return `<g stroke="#000" stroke-width="1.6">${s.join('')}</g>`; };

  function front(a) {
    const bl = 40, img = a.badge;
    let s = `<rect x="${-bl}" y="${-bl}" width="${1000 + 2 * bl}" height="${700 + 2 * bl}" fill="${BLUE}"/>`;
    s += `<polygon points="740,${-bl} ${1000 + bl},${-bl} ${1000 + bl},${700 + bl} 600,${700 + bl}" fill="${RED}"/><polygon points="710,${-bl} 740,${-bl} 600,${700 + bl} 570,${700 + bl}" fill="#fff"/>`;
    if (img) s += `<image href="${img}" x="455" y="30" width="520" height="533" opacity=".16" preserveAspectRatio="xMidYMid meet"/>`;
    if (img) s += `<image href="${img}" x="50" y="42" width="84" height="86"/>`;
    s += t(152, 96, 'NPD LOYALTY CARD', 26, '#fff', { ls: 4, w: 700 });
    s += t(60, 320, 'CLAIM YOUR', 92, '#fff', { head: true, len: 520 }) + t(60, 425, 'REWARDS!', 112, '#fff', { head: true, len: 520 }) + t(62, 484, 'You deserve it :)', 36, '#fff', { w: 600, italic: true });
    s += star(600, 250, 16, 6, 4, SUN) + star(80, 530, 12, 4.5, 4, '#fff') + star(640, 520, 10, 4, 4, '#fff');
    s += `<rect x="${-bl}" y="570" width="${1000 + 2 * bl}" height="${130 + bl}" fill="${COURT}"/>`;
    s += icIG(60, 605, 42, NAVY) + icTH(112, 605, 42, NAVY) + t(172, 636, '@npdclub.jkt', 30, NAVY, { w: 700 });
    s += `<defs><path id="rcring" d="M480,590 a35,35 0 1,1 -0.01,0"/></defs>` + (reclubURI ? `<image href="${reclubURI}" x="453" y="598" width="54" height="54"/>` : '');
    s += `<text font-size="13" font-weight="800" fill="${BLUE}" font-family="${BODY}"><textPath href="#rcring" startOffset="0" textLength="217" lengthAdjust="spacingAndGlyphs">RECLUB · RECLUB · RECLUB · </textPath></text>`;
    s += t(540, 636, '@npd.play', 30, NAVY, { w: 700 });
    s += t(965, 622, 'Datang sendiri,', 20, NAVY, { a: 'end', w: 600, italic: true }) + t(965, 650, 'pulang bawa circle.', 20, NAVY, { a: 'end', w: 600, italic: true });
    return s;
  }
  function back(a) {
    const bl = 40, info = a.info, cyc = info ? info.cycle_count : 0, no = info ? info.cycle_no : 1, rw = info ? info.rewards : [];
    let s = `<rect x="${-bl}" y="${-bl}" width="${1000 + 2 * bl}" height="${700 + 2 * bl}" fill="${COURT}"/><rect x="${-bl}" y="${-bl}" width="${1000 + 2 * bl}" height="${120 + bl}" fill="${BLUE}"/>`;
    s += court();
    s += t(50, 56, 'NPD LOYALTY CARD', 30, '#fff', { head: true }) + t(50, 92, 'Network. Play. Discover.', 18, '#fff', { w: 600, ls: 1 });
    s += t(520, 38, 'NAMA MEMBER', 15, '#fff', { ls: 3, w: 700 });
    if (a.name) s += t(520, 80, a.name, 38, '#fff', { head: false, w: 800 });
    s += `<line x1="520" y1="88" x2="950" y2="88" stroke="#fff" stroke-width="2.5"/>`;
    s += t(950, 111, a.code || 'ID: ____________', 17, '#fff', { a: 'end', w: 600, ls: 1 });
    for (let r = 0; r < 4; r++) {
      const cy = Y0 + r * PITCH;
      s += `<line x1="${XS[3] + STAMP_R + 12}" y1="${cy}" x2="${XC - CHK_R - 14}" y2="${cy}" stroke="#C9D8F3" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>`;
      for (let c = 0; c < 4; c++) { const n = r * 5 + c + 1; s += ball(XS[c], cy, STAMP_R, (r + c) % 2, a.digital && n <= cyc ? 'done' : 'blank', n, n); }
      const n = r * 5 + 5, rewardNo = (no - 1) * 4 + r + 1, got = rw.find(x => x.r === rewardNo);
      s += checkpoint(cy, r, a.digital && n <= cyc ? (got && got.used ? 'used' : 'avail') : 'blank', n, n);
    }
    return s;
  }
  function svg(side, a = {}) {
    const bleed = !!a.print, P = bleed ? 70 : 0, W = 1000 + 2 * P, H = 700 + 2 * P;
    const body = side === 'front' ? front(a) : back(a);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><clipPath id="trim${side}"><rect x="${P - (bleed ? 30 : 0)}" y="${P - (bleed ? 30 : 0)}" width="${1000 + (bleed ? 60 : 0)}" height="${700 + (bleed ? 60 : 0)}"/></clipPath></defs>${bleed ? '<rect width="100%" height="100%" fill="#fff"/>' : ''}<g clip-path="url(#trim${side})"><g transform="translate(${P},${P})">${body}</g></g>${bleed ? marks(P, 30) : ''}</svg>`;
  }
  function toPng(svgStr, scale = 2) {
    return new Promise((res, rej) => {
      const im = new Image(), w = 1000 * scale, h = 700 * scale;
      im.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h); c.toBlob(b => b ? res(b) : rej(new Error('Gagal membuat gambar.')), 'image/png'); };
      im.onerror = () => rej(new Error('Gagal membuat gambar.'));
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    });
  }
  async function cardFor(m, info, side, print) { return svg(side, { badge: await badge(), digital: !print, print, info: print && !m._withProgress ? null : info, name: m.nickname, code: m.member_code }); }
  async function shareImage(m, info, side) {
    const blob = await toPng(await cardFor(m, info, side, false), 2), name = `kartu-npd-${(m.nickname || 'member').replace(/\W+/g, '-').toLowerCase()}-${side === 'front' ? 'cover' : 'stempel'}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Kartu loyalty NPD', text: `Kartu loyalty NPD ${m.nickname}: ${info.cycle_count}/20 sesi.` }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    saveDownload({ name, mime: 'image/png', data: blob });
  }
  // cards: [{name, code, info}] (print: blank when no member). Pages: front, back per card, with bleed + crop marks.
  async function printCards(cards) {
    const bd = await badge(); let pages = '';
    for (const c of cards) { for (const side of ['front', 'back']) pages += `<div class="pg">${svg(side, { badge: bd, print: true, digital: false, info: null, name: c.name, code: c.code })}</div>`; }
    const doc = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kartu Loyalty NPD</title><style>@page{size:114mm 84mm;margin:0}html,body{margin:0;background:#fff}.pg{width:114mm;height:84mm;page-break-after:always;overflow:hidden}.pg svg{width:114mm;height:84mm;display:block}@media screen{body{background:#ddd}.pg{margin:8px auto;box-shadow:0 1px 6px #0004}}</style></head><body>${pages}</body></html>`;
    saveDownload({ name: 'kartu-loyalty-npd.html', mime: 'text/html', data: doc, print: true });
  }
  return { svg, badge, shareImage, printCards, cardFor };
})();
