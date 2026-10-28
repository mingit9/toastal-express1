// 잼 질감 제목 렌더러 (첨부해 주신 jam-three-demo.html 의 로직을 모듈로 옮긴 것)
// renderJam(text, seed) → 투명 배경 PNG dataURL.  같은 (text, seed) 면 항상 같은 모양이 나와요.
// 잼 사진: public/assets/jam.jpg 를 넣으면 그 사진이 질감으로 쓰이고, 없으면 자동 생성된 딸기잼 무늬를 씁니다.

const WORLD = 800;         // 좌표계 (가로세로 800)
const R = 768;             // 맵 해상도
const OUT_W = 1600, OUT_H = 800; // 출력 PNG (가로 800 x 세로 400 영역)
// 글꼴은 케첩과 같게: style.css 의 --font-sauce 를 그대로 가져와요. (바꾸려면 style.css 만 고치세요)
const fontStack = () => (getComputedStyle(document.documentElement).getPropertyValue('--font-sauce').trim() || "'EF_jejudoldam'") + ",'Black Han Sans','Apple SD Gothic Neo','Malgun Gothic',sans-serif";

// 첨부 코드의 슬라이더 기본값
const P = { bump: 6, gloss: 0.7, light: 9, zoom: 1.4, thick: 7, blur: 5, tilt: 0.45 };

let G = null;
let queue = Promise.resolve();
const cache = new Map();

const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function valueNoise(size, cells, rand) {
  const g = cells + 3, grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(size * size), step = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * step, y0 = Math.floor(fy);
    let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = x * step, x0 = Math.floor(fx);
      let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
      const a = grid[y0 * g + x0], b = grid[y0 * g + x0 + 1];
      const c = grid[(y0 + 1) * g + x0], d = grid[(y0 + 1) * g + x0 + 1];
      out[y * size + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
  }
  return out;
}
function fbm(size, cellList, weights, rand) {
  const out = new Float32Array(size * size);
  let wsum = 0;
  cellList.forEach((c, i) => {
    const n = valueNoise(size, c, rand), w = weights[i];
    for (let k = 0; k < out.length; k++) out[k] += n[k] * w;
    wsum += w;
  });
  for (let k = 0; k < out.length; k++) out[k] /= wsum;
  return out;
}

// 사진이 없을 때 쓰는 딸기잼 무늬
function proceduralPhoto() {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), rand = mulberry32(77);
  const base = g.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#6b0a26'); base.addColorStop(1, '#8c1236');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const cols = ['#b3123f', '#d4274f', '#4d0519', '#e65a78', '#7d0e2e'];
  for (let i = 0; i < 520; i++) {
    const x = rand() * S, y = rand() * S, r = 6 + rand() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = cols[Math.floor(rand() * cols.length)];
    gr.addColorStop(0, col + 'cc'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(255, 220, 160, .55)'; // 씨앗
  for (let i = 0; i < 160; i++) { g.beginPath(); g.ellipse(rand() * S, rand() * S, 1.4, 2.4, rand() * 3, 0, 7); g.fill(); }
  return c;
}

async function init() {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

  const canvas = makeCanvas(OUT_W, OUT_H);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(OUT_W, OUT_H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.OrthographicCamera(-WORLD / 2, WORLD / 2, WORLD / 4, -WORLD / 4, 1, 3000);
  camera.position.set(0, 0, 1000); camera.lookAt(0, 0, 0);

  // 잼 사진 (없으면 자동 무늬)
  let photoTex, photoAspect = 1, realPhoto = false;
  try {
    photoTex = await new THREE.TextureLoader().loadAsync('assets/jam.jpg');
    photoAspect = photoTex.image.height / photoTex.image.width;
    realPhoto = true;
  } catch (e) {
    photoTex = new THREE.CanvasTexture(proceduralPhoto());
  }
  photoTex.colorSpace = THREE.SRGBColorSpace;
  photoTex.wrapS = photoTex.wrapT = THREE.MirroredRepeatWrapping;

  const alphaCanvas = makeCanvas(R, R), heightCanvas = makeCanvas(R, R);
  const alphaTex = new THREE.CanvasTexture(alphaCanvas);
  const heightTex = new THREE.CanvasTexture(heightCanvas);

  const gloss = P.gloss;
  const jamMat = new THREE.MeshPhysicalMaterial({
    map: photoTex, color: realPhoto ? new THREE.Color(1, 1, 1) : new THREE.Color(0.82, 0.62, 0.68),
    bumpMap: heightTex, bumpScale: P.bump, alphaMap: alphaTex, transparent: true,
    roughness: 0.55 - 0.4 * gloss, metalness: 0,
    clearcoat: gloss, clearcoatRoughness: 0.18 - 0.14 * gloss, envMapIntensity: 0.4 + 0.9 * gloss
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), jamMat);
  scene.add(mesh);

  const lamp = new THREE.PointLight(0xfff1e4, P.light, 0, 0);
  lamp.position.set(-180, 220, 280);
  scene.add(lamp);
  const fill = new THREE.DirectionalLight(0xffe6ee, 0.35);
  fill.position.set(250, -300, 400);
  scene.add(fill);

  const measure = makeCanvas(10, 10).getContext('2d');
  G = { THREE, renderer, scene, camera, photoTex, photoAspect, alphaCanvas, heightCanvas, alphaTex, heightTex, measure, wcache: {} };
}

/* ---------- 글자 배치 ---------- */
function layoutGlyphs(text, seed) {
  const { measure, wcache } = G;
  const width100 = ch => { if (wcache[ch] === undefined) wcache[ch] = measure.measureText(ch).width; return wcache[ch]; };
  const rnd = (i, k) => { const x = Math.sin(seed * 127.1 + i * 74.7 + k * 19.3) * 43758.5453; return x - Math.floor(x); };
  const tilt = P.tilt;
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const GAP = 0.05, SPACE = 0.3, MAXW = 700, LH = 1.05, MAXH = 330;
  const wW = (w, fs) => [...w].reduce((s, c) => s + width100(c) * fs / 100, 0) + fs * GAP * ([...w].length - 1);
  const wrap = fs => {
    const lines = []; let cur = [], curW = 0;
    words.forEach(w => {
      const ww = wW(w, fs);
      if (cur.length && curW + fs * SPACE + ww > MAXW) { lines.push(cur); cur = [w]; curW = ww; }
      else { curW += (cur.length ? fs * SPACE : 0) + ww; cur.push(w); }
    });
    lines.push(cur); return lines;
  };
  let fs = 220, lines;
  for (; fs >= 40; fs -= 4) {
    lines = wrap(fs);
    if (lines.length * fs * LH <= MAXH && words.every(w => wW(w, fs) <= MAXW)) break;
  }
  lines = wrap(fs);

  const out = [], n = lines.length, startY = 400 - (n - 1) * fs * LH / 2;
  let g = 0;
  lines.forEach((line, li) => {
    const lineW = line.reduce((s, w) => s + wW(w, fs), 0) + fs * SPACE * (line.length - 1);
    let x = 400 - lineW / 2;
    const y = startY + li * fs * LH;
    line.forEach(w => {
      [...w].forEach(ch => {
        const scale = 1 + (rnd(g, 1) - 0.5) * 0.12 * tilt;
        const rot = (rnd(g, 2) - 0.5) * 2 * 7 * tilt * Math.PI / 180;
        const dy = (rnd(g, 3) - 0.5) * 2 * 0.05 * tilt * fs;
        const cw = width100(ch) * fs / 100 * scale;
        out.push({ ch, x: x + cw / 2, y: y + dy, rot, size: fs * scale });
        x += cw + fs * GAP; g++;
      });
      x += fs * SPACE - fs * GAP;
    });
  });
  return out;
}

/* ---------- 맵 생성: 글자 → 블러 → 임계값 ---------- */
function buildMaps(text, seed) {
  const { alphaCanvas, heightCanvas, alphaTex, heightTex } = G;
  const rand = mulberry32(seed * 9973 + 17);
  const nEdge = fbm(R, [14, 30, 64], [1, .7, .35], rand);
  const nLump = fbm(R, [34, 70, 130], [1, .8, .5], rand);

  const k = R / WORLD;
  const glyphs = layoutGlyphs(text, seed);
  const maskCanvas = makeCanvas(R, R), maskCtx = maskCanvas.getContext('2d');
  maskCtx.fillStyle = '#fff'; maskCtx.strokeStyle = '#fff';
  maskCtx.lineJoin = 'round'; maskCtx.textAlign = 'center'; maskCtx.textBaseline = 'middle';
  maskCtx.lineWidth = P.thick * k;
  glyphs.forEach(g => {
    maskCtx.save();
    maskCtx.translate(g.x * k, g.y * k); maskCtx.rotate(g.rot);
    maskCtx.font = `${(g.size * k).toFixed(1)}px ${fontStack()}`;
    if (maskCtx.lineWidth > 0) maskCtx.strokeText(g.ch, 0, 0);
    maskCtx.fillText(g.ch, 0, 0);
    maskCtx.restore();
  });

  // shadowBlur 로 가우시안 블러 (Safari 호환)
  const blurCanvas = makeCanvas(R, R), blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
  const sigma = P.blur * k, OFF = R * 3;
  blurCtx.shadowColor = '#fff'; blurCtx.shadowBlur = sigma * 2; blurCtx.shadowOffsetX = OFF;
  blurCtx.drawImage(maskCanvas, -OFF, 0);
  const src = blurCtx.getImageData(0, 0, R, R).data;

  const aCtx = alphaCanvas.getContext('2d'), hCtx = heightCanvas.getContext('2d');
  const aImg = aCtx.createImageData(R, R), hImg = hCtx.createImageData(R, R);
  const T = 0.42, ad = aImg.data, hd = hImg.data;
  for (let i = 0, p = 0; i < R * R; i++, p += 4) {
    const m = src[p + 3] / 255;
    const v = m + (nEdge[i] - 0.5) * 0.55;
    const a = smooth(T - 0.035, T + 0.035, v);
    let h = smooth(T, T + 0.5, v) * (0.6 + 0.55 * nLump[i]);
    if (h > 1) h = 1;
    const A = a * 255, H = h * 255;
    ad[p] = ad[p + 1] = ad[p + 2] = A; ad[p + 3] = 255;
    hd[p] = hd[p + 1] = hd[p + 2] = H; hd[p + 3] = 255;
  }
  aCtx.putImageData(aImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);
  alphaTex.needsUpdate = true; heightTex.needsUpdate = true;
}

async function renderOnce(text, seed) {
  if (!G) await init();
  try { await document.fonts.load(`100px ${fontStack()}`, text); } catch (e) {}
  G.measure.font = `100px ${fontStack()}`;
  G.wcache = {};

  // 사진 위치도 seed 마다 다르게
  const rnd = k => { const x = Math.sin(seed * 127.1 + k * 19.3) * 43758.5453; return x - Math.floor(x); };
  const h = 1 / P.zoom, w = h * G.photoAspect;
  G.photoTex.repeat.set(w, h);
  G.photoTex.offset.set((1 - w) * rnd(11), (1 - h) * rnd(12));

  buildMaps(text, seed);
  G.renderer.render(G.scene, G.camera);
  return G.renderer.domElement.toDataURL('image/png');
}

export function renderJam(text, seed) {
  const key = seed + '|' + text;
  if (cache.has(key)) return cache.get(key);
  const p = (queue = queue.then(() => renderOnce(text, seed)));
  const safe = p.catch(e => { cache.delete(key); throw e; });
  cache.set(key, safe);
  queue = p.catch(() => {});
  return safe;
}
