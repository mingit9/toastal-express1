// Toastal Express 서버 (외부 패키지 없이 Node 18+ 만으로 동작)
// 실행: node server.js  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
// ID_BY_IP=1 로 실행하면 같은 IP(공유기 등)에서 온 기기에 같은 ID를 줍니다.
// 기본값(0)은 기기별(브라우저 토큰별) 발급입니다.
const ID_BY_IP = process.env.ID_BY_IP === '1';
// 배포 서버에서 영구 저장소(디스크)를 쓸 때: DATA_DIR=/data 처럼 폴더를 지정하면 거기에 data.json 을 저장해요.
const DB_FILE = path.join(process.env.DATA_DIR || __dirname, 'data.json');
const PUB = path.join(__dirname, 'public');

/* ---------- 간단한 JSON 저장소 ---------- */
let db = { users: {}, tokens: {}, ips: {}, toasts: [] };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 150);
}

/* ---------- 유틸 ---------- */
const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise((ok, no) => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 50000) { no(new Error('too_big')); req.destroy(); } });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(new Error('bad_json')); } });
});
const clientIp = req => ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '');

function newId() {
  for (;;) {
    const id = String(10000 + crypto.randomInt(90000)); // 10000~99999 (5자리)
    if (!db.users[id]) return id;
  }
}

// 기기 토큰으로 사용자 식별. 처음 오면 5자리 ID 부여.
function getUserId(req) {
  const token = String(req.headers['x-device-token'] || '');
  if (!/^[\w-]{16,64}$/.test(token)) return null;
  let id = db.tokens[token];
  if (!id) {
    const ip = clientIp(req);
    if (ID_BY_IP && db.ips[ip] && db.users[db.ips[ip]]) {
      id = db.ips[ip];
    } else {
      id = newId();
      db.users[id] = { createdAt: Date.now() };
      if (ID_BY_IP) db.ips[ip] = id;
    }
    db.tokens[token] = id;
    save();
  }
  return id;
}

const hits = new Map(); // 도배 방지: 사용자당 1분에 8통
function rateOk(id) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter(t => now - t < 60000);
  if (arr.length >= 8) { hits.set(id, arr); return false; }
  arr.push(now); hits.set(id, arr); return true;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

/* ---------- API ---------- */
async function api(req, res, url) {
  const me = getUserId(req);
  if (!me) return send(res, 400, { error: 'bad_token' });
  const route = url.pathname.slice(4); // '/api' 제거

  if (req.method === 'GET' && route === '/me') {
    const unread = db.toasts.filter(t => t.to === me && !t.read).length;
    return send(res, 200, { id: me, unread, nick: db.users[me].nick || '' });
  }

  if (req.method === 'POST' && route === '/nick') {
    let b;
    try { b = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const nick = clean(b.nick, 12);
    db.users[me].nick = nick;
    save();
    return send(res, 200, { nick });
  }

  let m;
  /* ----- 친구 : 닉네임/ID 검색, 등록 ----- */
  const pub = id => ({ id, nick: (db.users[id] && db.users[id].nick) || '' });
  if (req.method === 'GET' && route === '/users/search') {
    const q = clean(url.searchParams.get('q'), 12);
    const mode = url.searchParams.get('mode') === 'id' ? 'id' : 'nick';
    if (!q) return send(res, 200, { users: [] });
    let ids = [];
    if (mode === 'id') {
      if (/^\d{5}$/.test(q) && db.users[q] && q !== me) ids = [q];
    } else {
      const low = q.toLowerCase();
      ids = Object.keys(db.users).filter(id => id !== me && (db.users[id].nick || '').toLowerCase().includes(low));
      ids.sort((a, b) => ((db.users[a].nick || '').toLowerCase() === low ? 0 : 1) - ((db.users[b].nick || '').toLowerCase() === low ? 0 : 1));
    }
    return send(res, 200, { users: ids.slice(0, 10).map(pub) });
  }
  if (req.method === 'GET' && route === '/friends') {
    const f = (db.users[me].friends || []).filter(id => db.users[id]);
    return send(res, 200, { friends: f.map(pub) });
  }
  if (req.method === 'POST' && route === '/friends') {
    let b;
    try { b = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const id = clean(b.id, 5);
    if (!/^\d{5}$/.test(id) || !db.users[id]) return send(res, 404, { error: 'no_user' });
    if (id === me) return send(res, 400, { error: 'self' });
    const f = db.users[me].friends || (db.users[me].friends = []);
    if (!f.includes(id)) {
      if (f.length >= 50) return send(res, 400, { error: 'too_many' });
      f.push(id); save();
    }
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE' && (m = route.match(/^\/friends\/(\d{5})$/))) {
    db.users[me].friends = (db.users[me].friends || []).filter(id => id !== m[1]);
    save();
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && (m = route.match(/^\/exists\/(\d{5})$/))) {
    return db.users[m[1]] ? send(res, 200, { ok: true }) : send(res, 404, { error: 'no_user' });
  }

  if (req.method === 'POST' && route === '/toasts') {
    let b;
    try { b = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const to = clean(b.to, 5);
    if (!/^\d{5}$/.test(to)) return send(res, 400, { error: 'bad_to' });
    if (!db.users[to]) return send(res, 404, { error: 'no_user' });
    const body = clean(b.body, 200);
    if (!body) return send(res, 400, { error: 'empty_body' });
    const t = b.title || {};
    const style = t.style === 'jam' ? 'jam' : 'ketchup';
    const title = { text: clean(t.text, 10), style, seed: Math.min(99999, Math.max(1, parseInt(t.seed, 10) || 1)) };
    if (!rateOk(me)) return send(res, 429, { error: 'slow_down' });
    const toast = {
      id: crypto.randomBytes(6).toString('hex'),
      fromId: me,
      from: clean(b.from, 12) || db.users[me].nick || me,
      to, title, body,
      bag: Math.min(3, Math.max(0, parseInt(b.bag, 10) || 0)),
      butter: b.butter === true ? 1 : Math.min(3, Math.max(0, parseInt(b.butter, 10) || 0)),
      cheese: (Array.isArray(b.cheese) ? b.cheese : []).slice(0, 3).map(c => ({
        k: Math.min(2, Math.max(0, parseInt(c && c.k, 10) || 0)),
        r: Math.min(25, Math.max(-25, Number(c && c.r) || 0))
      })),
      createdAt: Date.now(),
      read: false
    };
    db.toasts.push(toast);
    save();
    return send(res, 201, { id: toast.id });
  }

  if (req.method === 'GET' && route === '/toasts') {
    const box = url.searchParams.get('box') || 'all';
    let list = db.toasts.filter(t =>
      box === 'received' ? t.to === me :
      box === 'sent' ? t.fromId === me :
      (t.to === me || t.fromId === me));
    list = list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
    return send(res, 200, { me, toasts: list });
  }

  if (req.method === 'POST' && (m = route.match(/^\/toasts\/([0-9a-f]{12})\/read$/))) {
    const t = db.toasts.find(x => x.id === m[1]);
    if (!t || t.to !== me) return send(res, 404, { error: 'not_found' });
    if (!t.read) { t.read = true; save(); }
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not_found' });
}

/* ---------- 정적 파일 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon'
};
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(e => { console.error(e); send(res, 500, { error: 'server' }); });
  } else {
    serveStatic(req, res, url);
  }
}).listen(PORT, () => console.log(`Toastal Express → http://localhost:${PORT}  (ID_BY_IP=${ID_BY_IP ? 1 : 0})`));
