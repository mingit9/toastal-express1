// Toastal Express 프론트: 화면 전환, 토스트 쓰기/굽기/전송, 보관함
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 기기 토큰 + API ---------- */
let token = localStorage.getItem('tx_token');
if (!token) {
  token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2));
  localStorage.setItem('tx_token', token);
}
async function api(path, opt = {}) {
  const r = await fetch('/api' + path, {
    method: opt.method || 'GET',
    headers: { 'content-type': 'application/json', 'x-device-token': token },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'error'), { code: j.error, status: r.status });
  return j;
}

/* ---------- 상태 ---------- */
const BAG_COLORS = ['#b9824a', '#d2a877', '#cfa675', '#c08a50'];
const newSeed = () => 1 + Math.floor(Math.random() * 99999);
const S = {
  me: null,
  draft: { title: { text: '', style: 'ketchup', seed: newSeed() }, to: '', body: '', from: '', butter: 0, cheese: [] },
  box: 'received', list: [], busy: false
};

function snack(msg) {
  const el = $('#snack'); el.textContent = msg; el.classList.add('show');
  clearTimeout(snack.t); snack.t = setTimeout(() => el.classList.remove('show'), 2400);
}
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.dataset.screen = id;
  if (['cover', 'pick', 'write'].includes(id)) $('#scene').dataset.step = id;
  $('#idcard').hidden = true;
}

/* ---------- 제목 (케첩 / 잼) ---------- */
let jamMod = null, jamFail = false;
async function jamImage(text, seed) {
  if (jamFail) return null;
  try { if (!jamMod) jamMod = await import('./jam.js'); return await jamMod.renderJam(text, seed); }
  catch (e) { console.warn('잼 렌더 실패 → 기본 글자로 대체', e); jamFail = true; return null; }
}
function ketchupSize(t) {
  const n = [...t].length;
  return (n <= 4 ? 25.5 : n <= 6 ? 20 : n <= 8 ? 16.5 : 14) + 'cqw';
}
function renderTitle(el, t, placeholder) {
  el._rt = (el._rt || 0) + 1;
  const my = el._rt;
  el.innerHTML = '';
  if (!t.text) { if (placeholder) { const s = document.createElement('span'); s.className = 'ph'; s.textContent = '제목'; el.append(s); } return; }
  if (t.style === 'ketchup') {
    const s = document.createElement('span');
    s.className = 'ketchup'; s.textContent = t.text; s.style.fontSize = ketchupSize(t.text);
    el.append(s);
  } else {
    const img = new Image(); img.alt = t.text; img.className = 'jam-img';
    el.append(img);
    jamImage(t.text, t.seed).then(url => {
      if (my !== el._rt) return;
      if (url) img.src = url;
      else { img.remove(); const s = document.createElement('span'); s.className = 'jam-fallback'; s.textContent = t.text; el.append(s); }
    });
  }
}

/* ---------- 토스트 DOM ---------- */
function toastEl(d, edit) {
  const el = document.createElement('div');
  el.className = 'toast ' + (edit ? 'raw' : 'baked') + (d.butter ? ' butter' : '') + ((d.cheese || []).length ? ' cheesy' : '');
  el.innerHTML = `
    <div class="toast-art"></div><div class="toast-art b"></div><div class="layers"></div>
    <div class="toast-content">
      <div class="t-title"></div>
      <div class="t-to">to. ${edit ? '<input class="in-to" inputmode="numeric" maxlength="5" placeholder="00000" autocomplete="off">' : '<span class="v"></span>'}</div>
      <div class="t-body">${edit ? '<textarea class="in-body" maxlength="140" rows="5" placeholder="여기에 편지를 써요"></textarea>' : '<p class="t-text"></p>'}</div>
      <div class="t-from">from. ${edit ? '<input class="in-from" maxlength="12" placeholder="발신자">' : '<span class="v"></span>'}</div>
    </div>`;
  renderTitle(el.querySelector('.t-title'), d.title, edit);
  renderLayers(el, d);
  if (edit) {
    el.querySelector('.in-to').value = d.to;
    el.querySelector('.in-body').value = d.body;
    el.querySelector('.in-from').value = d.from;
  } else {
    el.querySelector('.t-to .v').textContent = d.to;
    el.querySelector('.t-text').textContent = d.body;
    el.querySelector('.t-from .v').textContent = d.from;
  }
  return el;
}

/* 버터 / 치즈 레이어 */
function renderLayers(el, d, fresh) {
  const box = el.querySelector('.layers');
  box.innerHTML = '';
  if (d.butter) {
    const im = document.createElement('img');
    im.className = 'ly-butter' + (fresh === 'butter' ? ' fresh' : '');
    im.src = `assets/image/butter-${d.butter}.png`; im.alt = '';
    box.append(im);
  }
  (d.cheese || []).forEach((c, i, a) => {
    const im = document.createElement('img');
    im.className = 'ly-cheese' + (fresh === 'cheese' && i === a.length - 1 ? ' fresh' : '');
    im.src = `assets/image/cheese-${c.k + 1}.png`; im.alt = '';
    im.style.setProperty('--r', c.r + 'deg');
    box.append(im);
  });
  el.classList.toggle('butter', !!d.butter);
  el.classList.toggle('cheesy', (d.cheese || []).length > 0);
}

/* ---------- 내 정보 ---------- */
async function refreshMe() {
  try {
    const me = await api('/me');
    S.me = me.id;
    $('#myId').textContent = me.id;
    S.nick = me.nick || '';
    const ni = $('#nickIn');
    if (document.activeElement !== ni) ni.value = S.nick;
    const b = $('#badge'), c = $('#cntNew');
    b.hidden = c.hidden = !me.unread;
    b.textContent = c.textContent = me.unread;
  } catch (e) { console.warn(e); }
}

/* ---------- 쓰기 ---------- */
function enterWrite() { buildWrite(); show('write'); }
function buildWrite() {
  const sec = $('#write');
  sec.classList.remove('baking');
  $$('.toaster-layer').forEach(e => e.classList.remove('hot'));
  const slot = $('#writeToast');
  slot.innerHTML = ''; slot.className = '';
  const d = S.draft;
  if (!d.from || d.fromAuto !== false) { d.from = S.nick || S.me || ''; d.fromAuto = true; }
  const t = toastEl(d, true);
  slot.append(t);

  t.querySelector('.in-to').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); d.to = e.target.value; });
  t.querySelector('.in-body').addEventListener('input', e => { d.body = e.target.value; });
  t.querySelector('.in-from').addEventListener('input', e => { d.from = e.target.value; d.fromAuto = false; });

  $('#titleIn').value = d.title.text;
  syncChips();
}
function syncChips() {
  $$('.chip[data-style]').forEach(c => c.classList.toggle('on', c.dataset.style === S.draft.title.style));
  $('#butterChip').classList.toggle('on', !!S.draft.butter);
  $('#cheeseChip').classList.toggle('on', S.draft.cheese.length > 0);
  $('#shuffle').hidden = S.draft.title.style !== 'jam';
}
function redrawTitle() {
  const el = $('#writeToast .t-title');
  if (el) renderTitle(el, S.draft.title, true);
}
let titleTimer;
$('#titleIn').addEventListener('input', e => {
  S.draft.title.text = e.target.value.slice(0, 10);
  clearTimeout(titleTimer);
  titleTimer = setTimeout(redrawTitle, S.draft.title.style === 'jam' ? 280 : 0);
});
$$('.chip[data-style]').forEach(c => c.addEventListener('click', () => {
  S.draft.title.style = c.dataset.style; syncChips(); redrawTitle();
}));
$('#shuffle').addEventListener('click', () => { S.draft.title.seed = newSeed(); redrawTitle(); });

/* ---------- 굽기 → 튕겨나가기 → 완성본 ---------- */
async function bake() {
  if (S.busy) return;
  const d = S.draft;
  if (!/^\d{5}$/.test(d.to)) return snack('받는 사람 ID 5자리를 입력해 주세요');
  if (!d.body.trim()) return snack('토스트에 편지를 먼저 써 주세요');
  S.busy = true;
  try {
    try { await api('/exists/' + d.to); }
    catch (e) { if (e.code === 'no_user') return snack('존재하지 않는 ID예요. 다시 확인해 주세요'); throw e; }
    // 잼 이미지를 미리 만들어 두어야 굽는 중에 끊기지 않아요
    if (d.title.text && d.title.style === 'jam') await jamImage(d.title.text, d.title.seed);
    document.activeElement && document.activeElement.blur();
    $('#write').classList.add('baking');
    const t = $('#writeToast .toast');
    t.querySelectorAll('input,textarea').forEach(i => i.readOnly = true);
    await wait(150);
    const slot = $('#writeToast');
    $('#scene').dataset.step = 'bake';             // 토스터에 들어감
    await wait(1300);
    $$('.toaster-layer').forEach(e => e.classList.add('hot'));
    t.classList.replace('raw', 'baked');           // 글씨가 진해짐
    slot.classList.add('shake');
    await wait(2300);
    slot.classList.remove('shake');
    slot.classList.add('pop');                     // 위로 튕겨나감
    await wait(900);
    enterDone();
  } catch (e) {
    console.error(e); snack('문제가 생겼어요. 잠시 후 다시 시도해 주세요');
  } finally { S.busy = false; }
}

function enterDone() {
  show('done');
  const wrap = $('#doneToast');
  wrap.innerHTML = '';
  const t = toastEl(S.draft, false);
  t.classList.add('drop');
  wrap.append(t);
  const bags = $('#bags');
  bags.querySelectorAll('.bag').forEach(b => b.remove());
  BAG_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'bag'; b.setAttribute('aria-label', `봉투 ${i + 1}`);
    b.innerHTML = `<img src="assets/image/bag-${i + 1}.png" alt="">`;
    b.addEventListener('click', () => sendToast(i));
    bags.append(b);
  });
}

async function sendToast(bag) {
  if (S.busy) return;
  S.busy = true;
  const t = $('#doneToast .toast');
  t.classList.remove('drop');
  void t.offsetWidth;
  t.classList.add('packing');
  const d = S.draft;
  try {
    await Promise.all([
      api('/toasts', { method: 'POST', body: { to: d.to, title: d.title, body: d.body, from: d.from, bag, butter: d.butter, cheese: d.cheese } }),
      wait(750)
    ]);
    S.lastBag = bag;
    enterSent();
  } catch (e) {
    t.classList.remove('packing');
    snack(e.code === 'no_user' ? '존재하지 않는 ID예요' : e.code === 'slow_down' ? '너무 빨리 보내고 있어요. 잠시 후 다시!' : '전송에 실패했어요');
  } finally { S.busy = false; }
}

function enterSent() {
  show('sent');
  $('#sentBag img').src = `assets/image/bag-${(S.lastBag | 0) + 1}.png`;
}

/* ---------- 보관함 ---------- */
const fmt = ms => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

async function enterBox(box) {
  S.box = box;
  show('box');
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.box === box));
  const ul = $('#list');
  ul.innerHTML = '<li class="empty">불러오는 중…</li>';
  try {
    const r = await api('/toasts?box=' + box);
    S.me = r.me; S.list = r.toasts;
  } catch (e) { ul.innerHTML = '<li class="empty">불러오지 못했어요</li>'; return; }
  ul.innerHTML = '';
  if (!S.list.length) {
    ul.innerHTML = `<li class="empty">${box === 'sent' ? '아직 보낸 토스트가 없어요' : box === 'received' ? '아직 받은 토스트가 없어요' : '아직 주고받은 토스트가 없어요'}</li>`;
    return;
  }
  S.list.forEach(t => {
    const mine = t.fromId === S.me, incoming = t.to === S.me;
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'item';
    const title = t.title.text || '(제목 없음)';
    b.innerHTML = `<div class="mb"></div><div class="tx"><div class="l1"></div><div class="l2"></div></div>${incoming && !t.read ? '<span class="new" title="새 토스트"></span>' : ''}<div class="dt"></div>`;
    b.querySelector('.mb').style.backgroundImage = `url(assets/image/bag-${(t.bag | 0) + 1}.png)`;
    const dir = document.createElement('span'); dir.className = 'dir'; dir.textContent = mine && incoming ? '나에게' : mine ? '보냄' : '받음';
    b.querySelector('.l1').append(dir, document.createTextNode(mine ? `to. ${t.to}` : `from. ${t.from}`));
    b.querySelector('.l2').textContent = `${title} · ${t.body.replace(/\s+/g, ' ')}`;
    b.querySelector('.dt').textContent = fmt(t.createdAt);
    b.addEventListener('click', () => openToast(t));
    li.append(b); ul.append(li);
  });
}

async function openToast(t) {
  show('view');
  const wrap = $('#viewToast');
  wrap.innerHTML = '';
  const el = toastEl({ title: t.title, to: t.to, body: t.body, from: t.from, butter: t.butter | 0, cheese: t.cheese || [] }, false);
  el.classList.add('drop');
  wrap.append(el);
  if (t.to === S.me && !t.read) {
    t.read = true;
    api(`/toasts/${t.id}/read`, { method: 'POST' }).then(refreshMe).catch(() => {});
  }
}

/* ---------- 버터 ---------- */
function syncPick() {
  const d = S.draft;
  $('#butterBtn').classList.toggle('on', !!d.butter);
  $('#cheeseBtn').classList.toggle('on', d.cheese.length > 0);
  syncChips();
}
function refreshToastLayers(fresh) {
  const t = document.querySelector('#writeToast .toast');
  if (t) renderLayers(t, S.draft, fresh);
  syncPick();
}
S.bi = 0; S.ci = 0;               // 켤 때마다 돌아가는 순서 (버터 1→2→3, 치즈 1→2→3)
function nextButter() {            // 누를 때마다 켜짐 ↔ 꺼짐, 켤 때는 다음 버터로
  const d = S.draft;
  if (d.butter) d.butter = 0;
  else { d.butter = (S.bi % 3) + 1; S.bi++; }
  refreshToastLayers('butter');
}
function addCheese() {             // 누를 때마다 켜짐 ↔ 꺼짐, 켤 때는 다음 치즈 + 랜덤 각도
  const d = S.draft;
  if (d.cheese.length) d.cheese = [];
  else { d.cheese = [{ k: S.ci % 3, r: Math.round((Math.random() * 2 - 1) * 14 * 10) / 10 }]; S.ci++; }
  refreshToastLayers('cheese');
}
$('#butterBtn').addEventListener('click', nextButter);
$('#butterChip').addEventListener('click', nextButter);
$('#cheeseBtn').addEventListener('click', addCheese);
$('#cheeseChip').addEventListener('click', addCheese);

/* ---------- 친구 ---------- */
S.fmode = 'nick'; S.friends = [];
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function friendRow(u, btns) {
  const li = document.createElement('li');
  li.innerHTML = `<div class="fi"><b>${esc(u.nick || u.id)}</b><small>ID ${u.id}</small></div>`;
  btns.forEach(([label, cls, fn]) => {
    const b = document.createElement('button');
    b.className = 'obtn sm ' + (cls || ''); b.textContent = label; b.type = 'button';
    b.addEventListener('click', () => fn(b));
    li.append(b);
  });
  return li;
}
function noneRow(text) { const li = document.createElement('li'); li.className = 'none'; li.textContent = text; return li; }
async function loadFriends() {
  try { S.friends = (await api('/friends')).friends; } catch (e) { S.friends = []; }
  const ul = $('#fmine'); ul.innerHTML = '';
  if (!S.friends.length) ul.append(noneRow('아직 등록한 친구가 없어요'));
  S.friends.forEach(u => ul.append(friendRow(u, [
    ['Send', '', () => sendTo(u.id)],
    ['Remove', '', async () => { await api('/friends/' + u.id, { method: 'DELETE' }); await loadFriends(); renderResultsState(); }]
  ])));
}
function renderResultsState() {
  $$('#fresults li[data-id]').forEach(li => {
    const on = S.friends.some(f => f.id === li.dataset.id);
    const b = li.querySelector('.fav'); b.textContent = on ? 'Added' : 'Add'; b.classList.toggle('on', on);
  });
}
async function searchFriends() {
  const q = $('#fq').value.trim();
  const ul = $('#fresults'); ul.innerHTML = '';
  if (!q) return;
  if (S.fmode === 'id' && !/^\d{5}$/.test(q)) { ul.append(noneRow('ID는 5자리 숫자예요')); return; }
  let users = [];
  try { users = (await api(`/users/search?mode=${S.fmode}&q=${encodeURIComponent(q)}`)).users; } catch (e) { snack('검색하지 못했어요'); return; }
  if (!users.length) { ul.append(noneRow('찾을 수 없어요')); return; }
  users.forEach(u => {
    const li = friendRow(u, [
      ['Add', 'fav', async b => {
        const on = S.friends.some(f => f.id === u.id);
        try {
          if (on) await api('/friends/' + u.id, { method: 'DELETE' }); else await api('/friends', { method: 'POST', body: { id: u.id } });
        } catch (e) { return snack(e.code === 'too_many' ? '친구는 50명까지 등록할 수 있어요' : '저장하지 못했어요'); }
        await loadFriends(); renderResultsState();
      }],
      ['Send', '', () => sendTo(u.id)]
    ]);
    li.dataset.id = u.id; ul.append(li);
  });
  renderResultsState();
}
function sendTo(id) {
  S.draft.to = id;
  buildWrite(); show('write');
}
function openFriends() {
  S.friendsFrom = document.body.dataset.screen === 'friends' ? S.friendsFrom : document.body.dataset.screen;
  $('#fresults').innerHTML = ''; $('#fq').value = '';
  show('friends'); loadFriends();
}
$$('[data-fmode]').forEach(c => c.addEventListener('click', () => {
  S.fmode = c.dataset.fmode;
  $$('[data-fmode]').forEach(x => x.classList.toggle('on', x === c));
  $('#fq').placeholder = S.fmode === 'id' ? '5자리 ID' : '닉네임';
  $('#fq').inputMode = S.fmode === 'id' ? 'numeric' : 'text';
  $('#fq').maxLength = S.fmode === 'id' ? 5 : 12;
  $('#fresults').innerHTML = '';
}));
$('#fq').placeholder = '닉네임';
$('#fform').addEventListener('submit', e => { e.preventDefault(); searchFriends(); });
$('#friendsOpen').addEventListener('click', openFriends);
$('#friendsBack').addEventListener('click', () => show(S.friendsFrom && S.friendsFrom !== 'friends' ? S.friendsFrom : 'cover'));

/* ---------- 이벤트 ---------- */
$('#startBtn').addEventListener('click', () => {
  S.draft.to = ''; S.draft.body = ''; S.draft.butter = 0; S.draft.cheese = []; S.bi = 0; S.ci = 0;
  buildWrite(); syncPick(); show('pick');
});
$('#nextBtn').addEventListener('click', () => show('write'));
$('#howBtn').addEventListener('click', () => { $('#modal').hidden = false; });
$('#modalClose').addEventListener('click', () => { $('#modal').hidden = true; });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').hidden = true; });
$('#bakeBtn').addEventListener('click', bake);
$('#editBtn').addEventListener('click', enterWrite);
$('#viewBack').addEventListener('click', () => enterBox(S.box));
$('#rebakeBtn').addEventListener('click', () => {
  S.draft.title = { text: '', style: S.draft.title.style, seed: newSeed() };
  S.draft.to = ''; S.draft.body = '';
  enterWrite();
});
$('#shareBtn').addEventListener('click', async () => {
  const text = `Toastal Express에서 토스트가 도착했을지도 몰라요 🍞 내 ID는 ${S.me} 예요. 이 ID로 토스트를 보내 주세요!`;
  const url = location.origin;
  try {
    if (navigator.share) await navigator.share({ title: 'Toastal Express', text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); snack('공유 문구를 복사했어요'); }
  } catch (e) { if (e && e.name !== 'AbortError') snack('공유하지 못했어요'); }
});
async function saveNick() {
  try {
    const r = await api('/nick', { method: 'POST', body: { nick: $('#nickIn').value } });
    S.nick = r.nick; $('#nickIn').value = r.nick;
    snack(r.nick ? '닉네임을 저장했어요' : '닉네임을 지웠어요. 이제 ID로 표시돼요');
  } catch (e) { snack('저장하지 못했어요'); }
}
$('#nickSave').addEventListener('click', saveNick);
$('#nickIn').addEventListener('keydown', e => { if (e.key === 'Enter') saveNick(); });
$('#logo').addEventListener('click', e => { e.preventDefault(); buildWrite(); show('cover'); });
$('#userBtn').addEventListener('click', () => { const c = $('#idcard'); c.hidden = !c.hidden; if (!c.hidden) refreshMe(); });
$$('#idcard [data-box], #tabs [data-box]').forEach(b => b.addEventListener('click', () => enterBox(b.dataset.box)));
document.addEventListener('click', e => {
  if (!e.target.closest('#idcard') && !e.target.closest('#userBtn')) $('#idcard').hidden = true;
});

/* ---------- 시작 ---------- */
document.body.dataset.screen = 'cover';
buildWrite();
refreshMe();
setInterval(() => { if (!document.hidden) refreshMe(); }, 20000);
