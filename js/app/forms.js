'use strict';
/* Shared modal forms used from several pages (members, participants, expenses, payments, quick actions). */

const M = () => NPD.meta;
const sportOpts = (ph) => (M().sports.filter(s => s.active)).map(s => ({ v: s.id, l: s.name }));
const venueOpts = () => M().venues.filter(v => v.status === 'Active').map(v => ({ v: v.id, l: `${v.name}${v.area ? ' – ' + v.area : ''}` }));
const sportById = id => M().sports.find(s => s.id == id) || { name: '?', color: '#E6EEFB' };
const ENUM = () => M().enums;

async function refreshMeta() { const r = await GET('/api/meta'); NPD.meta = r; NPD.user = r.user; return r; }

function conflictList(cf) {
  return html`<div class="list" style="margin-top:8px">${cf.map(c => html`<div class="list-item"><div class="grow"><div class="t">${c.name}</div><div class="muted small">${fdate(c.event_date)} · ${ftime(c.start_time)}–${ftime(c.end_time)} · ${c.sport} · ${c.status}</div></div></div>`)}</div>`;
}
function confirmConflicts(cf) {
  return confirmBox({ title: 'Venue schedule conflict', confirmText: 'Schedule anyway', message: html`<div class="alert warn">${icon('alert', 18)}<span>This venue already has ${cf.length} session(s) during these hours. Review them before confirming.</span></div>${conflictList(cf)}` });
}

// ------------------------------------------------------------------ members
function openMemberForm(member, onDone, opts = {}) {
  const editing = !!(member && member.id);
  const fields = [
    { name: 'nickname', label: 'Nickname', required: true, max: 60, full: true, hint: 'Shown everywhere in the app.' },
    { name: 'whatsapp', label: 'WhatsApp Number', type: 'tel', hint: 'Saved as +62… automatically.' },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true, max: 500 },
    ...(editing ? [{ name: 'active', label: 'Active member', type: 'checkbox', full: true }] : []),
  ];
  return formModal({
    title: editing ? `Edit ${member.member_code}` : 'Add Member', fields, values: { ...member, active: editing ? member.active : 1 },
    top: editing ? html`<div class="alert info" style="margin-bottom:12px">${icon('tag', 18)}<span>Member ID <b>${member.member_code}</b> is permanent and cannot be changed.</span></div>` : '',
    onSubmit: async (d, ctx) => {
      const body = { nickname: d.nickname, whatsapp: d.whatsapp, notes: d.notes, ...(editing ? { active: d.active } : {}) };
      const send = force => editing ? api('PUT', `/api/members/${member.id}`, { ...body, force }) : api('POST', '/api/members', { ...body, force }, { idem: ctx.key });
      let r;
      try { r = await send(false); }
      catch (e) {
        if (e.data.code === 'duplicate_whatsapp' && await confirmBox({ title: 'Duplicate WhatsApp number', message: e.message + ' Save anyway?', confirmText: 'Save anyway' })) r = await send(true);
        else throw e;
      }
      ctx.modal.close(); toast(editing ? 'Member updated' : `Member ${r.member_code} added`); onDone && onDone(r);
    },
  });
}

// ------------------------------------------------------------------ participants
async function openParticipantForm(session, existing, onDone) {
  const editing = !!existing;
  const npdOpts = (await fundOptions(['npd'])).filter(o => !/Rekening/.test(o.l));
  const mode = session.photo_mode;
  const st = ENUM().payment_status;
  let sel = editing ? { id: existing.member_id } : null, creating = false;
  const fields = [
    { section: 'Payment' },
    { name: 'payment_status', label: 'Payment status', type: 'select', options: st, required: true },
    { name: 'paid_date', label: 'Payment date', type: 'date' },
    { name: 'amount_paid', label: 'Amount paid', type: 'money' },
    { name: 'refund_amount', label: 'Refund amount', type: 'money', hint: 'Part of the payment returned to the member.' },
    { name: 'deposit_fund_id', label: 'Uang masuk ke', type: 'select', placeholder: 'Saldo Rekening', options: npdOpts },
    { name: 'loyalty_reward', label: 'Pakai reward loyalty', type: 'select', placeholder: 'Tidak pakai', options: [], hint: 'Diskon hanya untuk biaya sesi (bukan foto).' },
    { name: 'credit_use', label: 'Pakai saldo member (Rp)', type: 'money', hint: 'Potong dari saldo member. Sisanya dibayar biasa.' },
    ...(mode === 'excluded' ? [{ name: 'photo_selected', label: `Photography add-on (${rp(session.photo_fee)})`, type: 'checkbox', full: true }] : []),
    { section: 'Attendance' },
    { name: 'attendance', label: 'Attendance', type: 'select', options: ENUM().attendance },
    { name: 'notes', label: 'Notes', max: 300 },
  ];
  const picker = editing ? html`<div class="alert info" style="margin-bottom:12px">${icon('user', 18)}<span><b>${existing.nickname}</b> · ${existing.member_code}</span></div>` : html`
    <div id="picker"><div class="form-section">Member</div>
      <div class="searchbox"><span>${icon('search', 18)}</span><input class="inp" id="msearch" placeholder="Search Member ID, nickname or WhatsApp" autocomplete="off" inputmode="search"></div>
      <div id="msuggest"></div><div id="msel"></div>
      <button type="button" class="btn sm" id="toggle-new" style="margin-top:10px">${icon('plus', 16)} New member</button>
      <div id="newmember" class="hide form-grid" style="margin-top:10px">
        <div class="field full"><label>Nickname <span class="req">*</span></label><input class="inp" id="nm_nick" maxlength="60"></div>
        <div class="field"><label>WhatsApp</label><input class="inp" id="nm_wa" type="tel" inputmode="tel"></div></div></div>`;
  const values = editing ? { ...existing } : { payment_status: 'Waiting for Payment', attendance: 'Not Yet Confirmed', paid_date: todayISO() };
  const m = formModal({
    title: editing ? 'Edit registration' : 'Add Participant', fields, values, top: picker, size: 'lg', submitText: editing ? 'Save' : 'Register',
    onOpen: (m, form) => {
      const due = () => session.session_fee + (mode === 'excluded' && form.photo_selected && form.photo_selected.checked ? session.photo_fee : 0);
      const sync = () => {
        const s = form.payment_status.value, paid = ['Paid', 'Partially Refunded', 'Refunded'].includes(s);
        $('[data-field=amount_paid]', form).classList.toggle('hide', !paid); $('[data-field=paid_date]', form).classList.toggle('hide', !paid);
        $('[data-field=refund_amount]', form).classList.toggle('hide', s !== 'Partially Refunded');
        $('[data-field=credit_use]', form).classList.toggle('hide', s !== 'Paid'); $('[data-field=loyalty_reward]', form).classList.toggle('hide', s !== 'Paid' || form.loyalty_reward.options.length < 2); if (s !== 'Paid') form.loyalty_reward.value = ''; $('[data-field=deposit_fund_id]', form).classList.toggle('hide', !paid);
        if (paid && !form.amount_paid.value) form.amount_paid.value = num(due());
      };
      form.payment_status.addEventListener('change', sync);
      form.photo_selected && form.photo_selected.addEventListener('change', () => { if (form.payment_status.value === 'Paid' || !editing) form.amount_paid.value = form.payment_status.value === 'Waiting for Payment' ? '' : num(due()); });
      sync();
      const crHint = bal => { const f = $('[data-field=credit_use]', form); let h = $('#cr-hint', f); if (!h) { h = document.createElement('div'); h.id = 'cr-hint'; h.className = 'hint'; f.appendChild(h); } h.textContent = bal > 0 ? `Saldo tersedia ${rp(bal)}` : 'Member ini belum punya saldo.'; };
      const lyOpts = async mid => {
        const sel_ = form.loyalty_reward; sel_.innerHTML = '<option value="">Tidak pakai</option>'; if (!mid) { sync(); return; }
        try {
          const ly = await GET(`/api/members/${mid}/loyalty`), base = Math.max(0, session.session_fee - (mode === 'included' ? Math.min(session.photo_fee, session.session_fee) : 0));
          const mine = editing ? existing.loyalty_reward : 0;
          ly.rewards.filter(x => !x.used || x.r === mine).forEach(x => { const o = document.createElement('option'); o.value = x.r; o.textContent = `${x.label} (−${rp(Math.round(base * x.pct / 100))})`; o.dataset.disc = Math.round(base * x.pct / 100); sel_.appendChild(o); });
          if (mine) sel_.value = String(mine);
        } catch (e) { /* no rewards */ }
        sync();
      };
      form.loyalty_reward.addEventListener('change', () => { const o = form.loyalty_reward.selectedOptions[0]; if (form.payment_status.value === 'Paid') form.amount_paid.value = num(Math.max(0, due() - (+(o && o.dataset.disc) || 0))); });
      if (editing) lyOpts(existing.member_id);
      if (editing) { GET(`/api/members/${existing.member_id}/credit`).then(c => crHint(c.balance + (existing.credit_used || 0))).catch(() => {}); return; }
      crHint(0);
      const sug = $('#msuggest', m.el), selBox = $('#msel', m.el);
      const showSel = () => { mount(selBox, sel ? html`<div class="alert ok" style="margin-top:8px">${icon('check', 18)}<span><b>${sel.nickname}</b> · ${sel.member_code}${sel.whatsapp ? ' · ' + sel.whatsapp : ''}</span></div>` : ''); };
      const search = debounce(async () => {
        const q = $('#msearch', m.el).value.trim(); if (!q) { mount(sug, ''); return; }
        const r = await GET('/api/members/search', { q });
        mount(sug, r.members.length ? html`<div class="suggest">${r.members.map(x => html`<div class="list-item" data-pick="${x.id}"><div class="avatar">${x.nickname[0]}</div><div class="grow"><div class="t">${x.nickname}</div><div class="muted xs">${x.member_code}${x.whatsapp ? ' · ' + x.whatsapp : ''}</div></div></div>`)}</div>` : html`<div class="muted small" style="margin-top:8px">No member found – use “New member”.</div>`);
        sug._r = r.members;
      }, 200);
      $('#msearch', m.el).addEventListener('input', search);
      on(m.el, 'click', '[data-pick]', (e, t) => { sel = sug._r.find(x => x.id == t.dataset.pick); crHint(sel.credit || 0); lyOpts(sel.id); mount(sug, ''); $('#msearch', m.el).value = ''; showSel(); });
      $('#toggle-new', m.el).addEventListener('click', () => { creating = !creating; $('#newmember', m.el).classList.toggle('hide', !creating); $('#toggle-new', m.el).lastChild.textContent = creating ? ' Use existing member' : ' New member'; });
    },
    onSubmit: async (d, ctx) => {
      const body = { payment_status: d.payment_status, paid_date: d.paid_date, amount_paid: d.amount_paid, refund_amount: d.refund_amount, photo_selected: d.photo_selected || 0, attendance: d.attendance, notes: d.notes, credit_use: d.credit_use || 0, loyalty_reward: d.loyalty_reward || 0, deposit_fund_id: d.deposit_fund_id || '' };
      if (editing) { await api('PUT', `/api/participants/${existing.id}`, body); ctx.modal.close(); toast('Registration updated'); onDone && onDone(); return; }
      if (creating) {
        const nick = $('#nm_nick', ctx.modal.el).value.trim(); if (!nick) throw new ApiError('New member nickname is required.');
        body.new_member = { nickname: nick, whatsapp: $('#nm_wa', ctx.modal.el).value.trim() };
      } else { if (!sel) throw new ApiError('Select a member first (or add a new one).'); body.member_id = sel.id; }
      const send = extra => api('POST', `/api/sessions/${session.id}/participants`, { ...body, ...extra }, { idem: ctx.key });
      let r;
      try { r = await send({}); }
      catch (e) {
        if (e.data.code === 'session_full' && await confirmBox({ title: 'Session is full', message: e.message + ' Register anyway?', confirmText: 'Register anyway' })) r = await send({ force_capacity: 1 });
        else if (e.data.code === 'duplicate_whatsapp' && await confirmBox({ title: 'Duplicate WhatsApp number', message: e.message + ' Create the member anyway?', confirmText: 'Create anyway' })) r = await send({ force: 1 });
        else throw e;
      }
      ctx.modal.close(); toast(r.new_member_code ? `Registered · new member ${r.new_member_code}` : 'Participant registered'); onDone && onDone(r);
    },
  });
  return m;
}

async function pickSession({ title, filter, onPick, hint }) {
  const r = await GET('/api/sessions', { size: 100, sort: 'date_asc', start: addDays(todayISO(), -45) });
  const list = r.sessions.filter(s => s.status !== 'Cancelled' && (!filter || filter(s)));
  if (!list.length) { toast('No suitable sessions found. Create a session first.', 'info'); return; }
  const m = openModal({ title, body: html`${hint ? html`<p class="muted" style="margin-top:0">${hint}</p>` : ''}<div class="list">${list.map(s => html`<div class="list-item click" data-s="${s.id}"><i class="dot" style="background:${s.sport_color}"></i><div class="grow"><div class="t">${s.name}</div><div class="muted small">${fdate(s.event_date)} · ${s.venue} · ${s.registered}/${s.max_participants || '∞'}</div></div>${badge(s.status)}</div>`)}</div>`, footer: null });
  on(m.el, 'click', '[data-s]', async (e, t) => { m.close(); const d = await GET('/api/sessions/' + t.dataset.s); onPick(d.session, d); });
}

// ------------------------------------------------------------------ expenses / revenue
const fundLabel = f => f.kind === 'personal' ? `${f.name} (talangi pribadi, nanti diganti)` : `${f.name} · ${rp(f.balance)}${f.balance < 0 ? ' (minus)' : ''}`;
async function fundOptions(kinds) {
  const r = await GET('/api/funds');
  return r.funds.filter(f => !kinds || kinds.includes(f.kind)).map(f => ({ v: f.id, l: fundLabel(f) }));
}

async function openExpenseForm(exp, onDone, presetSession) {
  const editing = !!(exp && exp.id);
  const [ss, funds] = await Promise.all([GET('/api/sessions', { size: 200, sort: 'date_asc' }), fundOptions()]);
  const fields = [
    { name: 'expense_type', label: 'Expense type', type: 'select', required: true, full: true, options: [{ v: 'general', l: 'General Business Operational Expense' }, { v: 'session', l: 'Session Operational Expense' }] },
    { name: 'session_id', label: 'Related session', type: 'select', full: true, placeholder: 'Select session…', options: ss.sessions.map(s => ({ v: s.id, l: `${fdate(s.event_date)} – ${s.name}` })), hint: 'Session expenses reduce that session’s profit.' },
    { name: 'txn_date', label: 'Transaction date', type: 'date', required: true },
    { name: 'category', label: 'Category', type: 'select', required: true, options: ENUM().expense_categories, placeholder: 'Select…' },
    { name: 'amount', label: 'Amount (Rp)', type: 'money', required: true },
    { name: 'source_fund_id', label: 'Source of Fund', type: 'select', required: true, placeholder: 'Select source of fund…', options: funds, hint: 'Which fund paid for this? Its balance goes down. Personal funds are tracked as owed to that person until reimbursed.' },
    { name: 'payment_method', label: 'Payment method', type: 'select', options: ENUM().payment_methods },
    { name: 'description', label: 'Description', required: true, max: 200, full: true },
    { name: 'receipt', label: 'Receipt link (optional)', type: 'text', full: true, max: 500, placeholder: 'https://…', hint: 'Foto struk tidak disimpan di app ini. Simpan fotonya di Google Drive / Google Photos, lalu tempel linknya di sini.' },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true, max: 500 },
  ];
  const typeNow = (exp && exp.session_id) || presetSession ? 'session' : 'general';
  formModal({
    title: editing ? `Edit ${exp.code}` : 'Add Operational Expense', fields, size: 'lg',
    values: { txn_date: todayISO(), payment_method: 'Cash', session_id: presetSession || '', expense_type: typeNow, source_fund_id: (funds[0] || {}).v, ...exp },
    onOpen: (m, form) => { const t = $('[name=expense_type]', form), box = $('[data-field=session_id]', form); const sync = () => { box.style.display = t.value === 'session' ? '' : 'none'; }; t.addEventListener('change', sync); sync(); },
    onSubmit: async (d, ctx) => {
      const send = force => { const body = { ...d, ...(force ? { force: 1 } : {}) };
        return editing ? api('PUT', `/api/expenses/${exp.id}`, body) : api('POST', '/api/expenses', body, { idem: ctx.key }); };
      try { await send(false); }
      catch (e) { if (e.data && e.data.code === 'fund_overdraw' && await confirmBox({ title: 'Fund would be overdrawn', message: e.message + ' Record it anyway?', confirmText: 'Record anyway', danger: true })) await send(true); else throw e; }
      ctx.modal.close(); toast(editing ? 'Expense updated' : 'Operational expense recorded'); onDone && onDone();
    },
  });
}

async function openRevenueForm(rec, onDone) {
  const editing = !!(rec && rec.id);
  const npdOpts = (await fundOptions(['npd'])).filter(o => !/Rekening/.test(o.l));
  formModal({
    title: editing ? `Edit ${rec.code}` : 'Record Other Revenue',
    top: html`<div class="alert info" style="margin-bottom:12px">${icon('info', 18)}<span>Session fees, photography and NPD photography share are generated automatically from sessions – only record additional income here (sponsorship, merchandise, etc.).</span></div>`,
    fields: [
      { name: 'txn_date', label: 'Date', type: 'date', required: true }, { name: 'amount', label: 'Amount (Rp)', type: 'money', required: true },
      { name: 'category', label: 'Category', max: 60, hint: 'e.g. Other Revenue, Sponsorship, Merchandise' },
      { name: 'payment_method', label: 'Payment method', type: 'select', options: ENUM().payment_methods },
      { name: 'fund_id', label: 'Uang masuk ke', type: 'select', placeholder: 'Saldo Rekening', options: npdOpts },
      { name: 'description', label: 'Description', required: true, full: true, max: 200 }, { name: 'notes', label: 'Notes', type: 'textarea', full: true, max: 500 }],
    values: { txn_date: todayISO(), category: 'Other Revenue', payment_method: 'Cash', ...rec },
    onSubmit: async (d, ctx) => { editing ? await api('PUT', `/api/revenue/${rec.id}`, d) : await api('POST', '/api/revenue', d, { idem: ctx.key }); ctx.modal.close(); toast('Revenue saved'); onDone && onDone(); },
  });
}

async function openPhotographerPayment(preset = {}, onDone) {
  const ov = await GET('/api/photographers/overview');
  const sessions = (await GET('/api/sessions', { size: 200, sort: 'date_asc' })).sessions.filter(s => s.photo_mode !== 'none');
  const funds = await fundOptions(['npd']);
  const first = ov.photographers.find(p => p.id == preset.photographer_id) || ov.photographers.find(p => p.outstanding > 0) || ov.photographers[0];
  formModal({
    title: preset.id ? `Edit ${preset.code}` : 'Photographer Payment',
    fields: [
      { name: 'photographer_id', label: 'Photographer', type: 'select', required: true, options: ov.photographers.map(p => ({ v: p.id, l: `${p.name} (outstanding ${rp(p.outstanding)})` })) },
      { name: 'amount', label: 'Amount (Rp)', type: 'money', required: true },
      { name: 'status', label: 'Status', type: 'select', options: ['Paid', 'Pending'] }, { name: 'paid_date', label: 'Payment date', type: 'date' },
      { name: 'session_id', label: 'For session (optional)', type: 'select', full: true, placeholder: 'General / multiple sessions', options: sessions.map(s => ({ v: s.id, l: `${fdate(s.event_date)} – ${s.name}` })) },
      { name: 'fund_id', label: 'Dibayar dari', type: 'select', full: true, placeholder: 'Saldo Rekening', options: funds },
      { name: 'payment_method', label: 'Method', type: 'select', options: ENUM().payment_methods }, { name: 'notes', label: 'Notes', max: 300 }],
    values: { photographer_id: first && first.id, amount: first && first.outstanding > 0 ? first.outstanding : '', status: 'Paid', paid_date: todayISO(), payment_method: 'Bank Transfer', ...preset },
    top: html`<div class="alert info" style="margin-bottom:12px">${icon('info', 18)}<span>Paying the photographer settles the <b>Photographer Payable</b>. It is a cash-out, not an operational expense, so profit is never reduced twice. Choose which fund pays, or leave it as business cash.</span></div>`,
    onSubmit: async (d, ctx) => {
      const send = (force, force_fund) => preset.id ? api('PUT', `/api/photographer-payments/${preset.id}`, { ...d, force, force_fund }) : api('POST', '/api/photographer-payments', { ...d, force, force_fund }, { idem: ctx.key });
      let force = false, ff = false;
      for (let n = 0; n < 3; n++) {
        try { await send(force, ff); break; }
        catch (e) {
          const code = e.data && e.data.code;
          if (code === 'overpay' && await confirmBox({ title: 'More than outstanding', message: e.message + ' Record it anyway?', confirmText: 'Record anyway' })) force = true;
          else if (code === 'fund_overdraw' && await confirmBox({ title: 'Fund would be overdrawn', message: e.message + ' Record it anyway?', confirmText: 'Record anyway', danger: true })) ff = true;
          else throw e;
        }
      }
      ctx.modal.close(); toast('Photographer payment saved'); onDone && onDone();
    },
  });
}

// ------------------------------------------------------------------ reschedule / quick payment
function openReschedule(s, onDone) {
  formModal({
    title: 'Reschedule', size: 'sm',
    fields: [{ name: 'event_date', label: 'New date', type: 'date', required: true, full: true }, { name: 'start_time', label: 'Start', type: 'time', required: true }, { name: 'end_time', label: 'End', type: 'time', required: true }],
    values: { event_date: s.event_date, start_time: ftime(s.start_time), end_time: ftime(s.end_time) },
    top: html`<p class="muted" style="margin-top:0">${s.name}</p>`,
    onSubmit: async (d, ctx) => {
      try { await api('POST', `/api/sessions/${s.id}/reschedule`, d); }
      catch (e) { if (e.data.code === 'venue_conflict' && await confirmConflicts(e.data.conflicts)) await api('POST', `/api/sessions/${s.id}/reschedule`, { ...d, force: 1 }); else throw e; }
      ctx.modal.close(); toast('Session rescheduled'); onDone && onDone();
    },
  });
}

function openQuickPayment(onDone) {
  pickSession({
    title: 'Record Payment – choose session', hint: 'Sessions from the last 45 days and upcoming.',
    onPick: (session, d) => {
      const waiting = d.participants.filter(p => p.payment_status === 'Waiting for Payment');
      if (!waiting.length) { toast('Everyone in this session is already paid or cancelled.', 'info'); return; }
      formModal({
        title: 'Record Payment', size: 'sm', submitText: 'Mark as paid',
        top: html`<p class="muted" style="margin-top:0">${session.name} · ${fdate(session.event_date)}</p>`,
        fields: [{ name: 'pid', label: 'Participant', type: 'select', required: true, full: true, options: waiting.map(p => ({ v: p.id, l: `${p.nickname} (${p.member_code})` })) },
          { name: 'amount_paid', label: 'Amount (Rp)', type: 'money', required: true }, { name: 'paid_date', label: 'Payment date', type: 'date' }],
        values: { amount_paid: waiting[0].due, paid_date: todayISO() },
        onOpen: (m, form) => form.pid.addEventListener('change', () => { const p = waiting.find(x => x.id == form.pid.value); form.amount_paid.value = num(p.due); }),
        onSubmit: async (v, ctx) => { await api('PUT', `/api/participants/${v.pid}`, { payment_status: 'Paid', amount_paid: v.amount_paid, paid_date: v.paid_date, photo_selected: waiting.find(x => x.id == v.pid).photo_selected }); ctx.modal.close(); toast('Payment recorded'); onDone && onDone(); },
      });
    },
  });
}

// ------------------------------------------------------------------ fund transactions (transfer / personal funding / reimbursement)
async function openFundForm(kind, onDone, preset = {}) {
  const editing = !!preset.id;
  const r = await GET('/api/funds'), npd = r.funds.filter(f => f.kind === 'npd'), per = r.funds.filter(f => f.kind === 'personal');
  const petty = npd[0], npdOpt = npd.map(f => ({ v: f.id, l: `${f.name} · ${rp(f.balance)}` }));
  const titles = { contribution: 'Tambah modal dari pribadi', reimbursement: 'Reimburse / ganti uang organizer', transfer: 'Pindahkan dana' };
  const notes = { contribution: 'Uang pribadi yang dimasukkan organizer untuk NPD. Ini modal, bukan pendapatan. Mengurangi utang NPD ke orang tersebut.', reimbursement: 'NPD mengganti uang organizer. Pilih dibayar dari Saldo Rekening atau NPD Petty Cash. Boleh sebagian. Terhubung ke pengeluaran aslinya, jadi tidak dihitung dua kali.', transfer: 'Memindahkan uang antar kantong NPD, misalnya mengisi NPD Petty Cash dari Saldo Rekening. Total kas tidak berubah.' };
  const fields = [];
  if (kind === 'reimbursement') fields.push({ name: 'expense_id', label: 'Pengeluaran yang diganti', type: 'select', required: true, full: true, placeholder: 'Pilih pengeluaran…', options: r.reimbursable.filter(x => x.outstanding > 0 || x.id == preset.expense_id).map(x => ({ v: x.id, l: `${x.description} · sisa ${rp(x.outstanding)} (${x.fund.replace('Personal – ', '')})` })) });
  else if (kind === 'transfer') fields.push({ name: 'from_fund_id', label: 'Dari', type: 'select', required: true, options: npdOpt }, { name: 'to_fund_id', label: 'Ke', type: 'select', required: true, options: npdOpt });
  else fields.push({ name: 'to_fund_id', label: 'Atas nama', type: 'select', required: true, options: per.map(f => ({ v: f.id, l: f.name.replace('Personal – ', '') })), placeholder: 'Pilih…' });
  if (kind === 'reimbursement') fields.push({ name: 'from_fund_id', label: 'Dibayar dari', type: 'select', required: true, options: npdOpt });
  fields.push({ name: 'amount', label: 'Jumlah (Rp)', type: 'money', required: true }, { name: 'txn_date', label: 'Tanggal', type: 'date', required: true }, { name: 'notes', label: 'Catatan', full: true, max: 300 });
  formModal({
    title: editing ? `Edit ${preset.code}` : titles[kind], size: 'sm', fields, values: { txn_date: todayISO(), ...(kind === 'reimbursement' && !editing ? { from_fund_id: petty && petty.id } : {}), ...(kind === 'transfer' && !editing && npd[0] && npd[1] ? { from_fund_id: npd[0].id, to_fund_id: npd[1].id } : {}), ...preset },
    top: html`<div class="alert info" style="margin-bottom:12px">${icon('info', 18)}<span>${notes[kind]}</span></div>`,
    onOpen: kind === 'reimbursement' ? (m, form) => {
      const ex = $('[name=expense_id]', form), amt = $('[name=amount]', form);
      ex.addEventListener('change', () => { const x = r.reimbursable.find(y => y.id == ex.value); if (x && !amt.value) amt.value = num(x.outstanding); }); if (ex.value && !editing) ex.dispatchEvent(new Event('change'));
    } : null,
    onSubmit: async (d, ctx) => {
      d.kind = kind;
      if (kind === 'reimbursement') { const x = r.reimbursable.find(y => y.id == d.expense_id); if (!x) throw new Error('Pilih pengeluaran yang diganti.'); d.to_fund_id = x.source_fund_id; }
      const send = force => editing ? api('PUT', `/api/fund-transactions/${preset.id}`, { ...d, force }) : api('POST', '/api/fund-transactions', { ...d, force }, { idem: ctx.key });
      try { await send(false); }
      catch (e) { if (e.data && e.data.code === 'fund_overdraw' && await confirmBox({ title: 'Saldo kantong tidak cukup', message: e.message + ' Tetap catat?', confirmText: 'Tetap catat', danger: true })) await send(true); else throw e; }
      ctx.modal.close(); toast('Tersimpan'); onDone && onDone();
    },
  });
}
