/* ============================================================
   AGENTX — SCENE 3D (Three.js)
   Toate obiectele sunt construite din cod, fara fisiere .glb:
   stetoscop (clinici), cheie auto (dealer), disc de frana (piese),
   plus orasul noaptea din hero-ul paginii principale.
   ============================================================ */
// Aceeasi adresa pe care o importa si GLTFLoader de pe jsDelivr (+esm),
// ca sa avem o singura instanta three in pagina.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';

export { THREE };

const CYAN = 0x38bdf8;
const NIGHT = 0x070c15;

export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

// Progresul (0..1) al unei sectiuni inalte cu scena "sticky" in interior.
export function sectionProgress(el) {
  const r = el.getBoundingClientRect();
  const run = r.height - window.innerHeight;
  return run > 0 ? clamp(-r.top / run) : 0;
}

/* ---------- Scena de baza: renderer, lumina de studio, bucla ---------- */

// Un "studio" simplu din panouri luminoase, transformat in env map:
// da reflexii credibile pe metal fara sa incarcam un HDR.
function studioEnv(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x141d2e, side: THREE.BackSide })));
  const panel = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(pos[0], pos[1], pos[2]);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(7, 2.2, 0xffffff, 3.2, [0, 4.6, 1.5]);
  panel(2.2, 6, 0xbfe6ff, 2.4, [-4.8, 0.6, 1.2]);
  panel(2, 5, 0xffffff, 1.5, [4.8, 1, -1]);
  panel(5, 1.2, CYAN, 2.6, [0, -2.4, -4.8]);
  panel(3, 1, 0xffffff, 1.2, [0, -4.6, 2]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.035).texture;
  pm.dispose();
  return tex;
}

export function createStage(canvas, { fov = 32, exposure = 1.05, env = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  if (env) scene.environment = studioEnv(renderer);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);

  const stage = { size: 0 };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.size++;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // Daca onFrame intoarce false, cadrul e identic cu precedentul si nu-l mai desenam.
  let raf = 0, frame = null;
  const tick = (ms) => {
    raf = requestAnimationFrame(tick);
    if (frame && frame(ms / 1000) === false) return;
    renderer.render(scene, camera);
  };
  // Randam doar cat timp scena e pe ecran.
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !raf) raf = requestAnimationFrame(tick);
    else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '150px 0px' });
  io.observe(canvas);

  return {
    renderer, scene, camera, stage,
    onFrame(fn) { frame = fn; },
    dispose() {
      cancelAnimationFrame(raf); raf = 0;
      ro.disconnect(); io.disconnect();
      renderer.dispose();
    }
  };
}

function addStudioLights(scene) {
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 5, 6);
  const rim = new THREE.DirectionalLight(CYAN, 2.2);
  rim.position.set(-5, 2, -4);
  scene.add(key, rim, new THREE.AmbientLight(0x8fb3ff, 0.25));
}

/* ---------- Ajutoare de geometrie ---------- */

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function circlePath(cx, cy, r, hole) {
  const p = hole ? new THREE.Path() : new THREE.Shape();
  p.absarc(cx, cy, r, 0, Math.PI * 2, !!hole);
  return p;
}

function tube(points, radius, mat, segments = 160) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 20), mat);
}

// Centreaza un obiect in jurul originii si il aduce la o raza standard,
// ca toate cele trei sa stea la fel in cadru.
function normalize(inner, radius = 2.2) {
  const box = new THREE.Box3().setFromObject(inner);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  inner.position.sub(sphere.center);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.setScalar(radius / sphere.radius);
  return outer;
}

function iconTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = x.fillStyle = '#dff4ff';
  x.lineWidth = 9;
  x.lineCap = x.lineJoin = 'round';
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const metal = (color = 0xe6ebf2, roughness = 0.14) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness });
const gloss = (color, roughness = 0.3) => new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 1, clearcoatRoughness: 0.12 });

/* ---------- 1. Stetoscop (clinici) ---------- */

export function buildStethoscope() {
  const g = new THREE.Group();
  const chrome = metal();
  const rubber = new THREE.MeshPhysicalMaterial({ color: 0x0b78ad, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const dark = gloss(0x0d141f, 0.35);

  // Piesa toracica: diafragma in fata, clopotul in spate.
  const chest = new THREE.Group();
  const profile = [[0, -0.42], [0.16, -0.42], [0.24, -0.36], [0.3, -0.22], [0.36, -0.12], [0.58, -0.1], [0.66, -0.04], [0.66, 0.06], [0.62, 0.1], [0, 0.1]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  chest.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 72), chrome));
  const membraneMat = new THREE.MeshPhysicalMaterial({ color: 0x0d141f, roughness: 0.25, clearcoat: 1, emissive: CYAN, emissiveIntensity: 0 });
  const membrane = new THREE.Mesh(new THREE.CircleGeometry(0.56, 72), membraneMat);
  membrane.rotation.x = -Math.PI / 2;
  membrane.position.y = 0.102;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 20, 96), rubber);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.09;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.62, 32), chrome);
  stem.rotation.z = Math.PI / 2;
  stem.position.set(0.9, -0.12, 0);
  chest.add(membrane, rim, stem);
  chest.rotation.x = Math.PI / 2;
  chest.position.set(-0.2, -1.9, 0.2);
  g.add(chest);

  // Tubul principal pana la bifurcatie, apoi cele doua ramuri.
  g.add(tube([[0.95, -1.9, 0.08], [1.6, -1.75, 0.2], [2.0, -1.0, 0.35], [1.7, -0.1, 0.4], [0.9, 0.35, 0.25], [0.15, 0.75, 0.05], [0, 1.05, 0]], 0.075, rubber, 220));
  g.add(tube([[0, 1.05, 0], [-0.18, 1.35, 0.02], [-0.42, 1.7, 0], [-0.5, 1.95, 0]], 0.06, rubber, 60));
  g.add(tube([[0, 1.05, 0], [0.18, 1.35, 0.02], [0.42, 1.7, 0], [0.5, 1.95, 0]], 0.06, rubber, 60));
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 16), chrome);
  joint.position.set(0, 1.05, 0);
  g.add(joint);

  // Olivele: tuburi metalice + capete moi.
  [-1, 1].forEach((s) => {
    g.add(tube([[0.5 * s, 1.95, 0], [0.6 * s, 2.4, 0], [0.55 * s, 2.85, 0.12], [0.36 * s, 3.1, 0.32]], 0.035, chrome, 80));
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.068, 24, 12), chrome);
    sleeve.position.set(0.5 * s, 1.95, 0);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 16), dark);
    tip.scale.set(1, 1.25, 1);
    tip.position.set(0.33 * s, 3.13, 0.36);
    g.add(sleeve, tip);
  });

  const root = normalize(g);
  return {
    group: root,
    // Diafragma "bate" odata cu varfurile EKG-ului, pe masura ce derulezi.
    update(p) {
      const ph = (p * 5) % 1;
      const beat = Math.exp(-(((ph - 0.47) / 0.05) ** 2));
      membraneMat.emissiveIntensity = 0.15 + beat * 1.1;
      rim.scale.setScalar(1 + beat * 0.04);
    }
  };
}

// Linia de EKG din spatele stetoscopului: se deseneaza odata cu scroll-ul.
export function buildPulseLine(width = 9) {
  const pts = [];
  const beat = [[0, 0], [0.18, 0], [0.24, 0.12], [0.3, 0], [0.38, 0], [0.42, -0.22], [0.47, 1.25], [0.52, -0.45], [0.57, 0], [0.7, 0], [0.8, 0.22], [0.9, 0], [1, 0]];
  const n = 5, w = width / n;
  for (let i = 0; i < n; i++) beat.forEach(([x, y]) => pts.push(new THREE.Vector3(-width / 2 + (i + x) * w, y * 0.9, 0)));
  const path = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) if (!pts[i].equals(pts[i + 1])) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  const segs = 600, radial = 8;
  const geo = new THREE.TubeGeometry(path, segs, 0.022, radial, false);
  const mat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  const per = radial * 6;
  return {
    mesh,
    update(p) {
      geo.setDrawRange(0, Math.floor(clamp(p * 1.05) * segs) * per);
    }
  };
}

/* ---------- 2. Cheie auto (dealer) ---------- */

export function buildCarKey() {
  const g = new THREE.Group();
  const chrome = metal();
  const steel = metal(0xd5dde8, 0.3);
  const body = gloss(0x161f2e, 0.26);

  const shell = new THREE.ExtrudeGeometry(roundedRect(1.25, 2.1, 0.55), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 8, curveSegments: 32 });
  shell.translate(0, 0, -0.15);
  g.add(new THREE.Mesh(shell, body));
  const band = new THREE.ExtrudeGeometry(roundedRect(1.49, 2.34, 0.66), { depth: 0.07, bevelEnabled: false, curveSegments: 32 });
  band.translate(0, 0, -0.035);
  g.add(new THREE.Mesh(band, chrome));

  // Butoanele: incuiere, descuiere, portbagaj.
  const icons = [
    (x) => { x.strokeRect(30, 60, 68, 50); x.beginPath(); x.arc(64, 60, 22, Math.PI, 0); x.stroke(); },
    (x) => { x.strokeRect(30, 60, 68, 50); x.beginPath(); x.arc(52, 48, 22, Math.PI, Math.PI * 1.85); x.moveTo(30, 60); x.lineTo(30, 48); x.stroke(); },
    (x) => { x.beginPath(); x.moveTo(18, 108); x.lineTo(28, 72); x.lineTo(100, 72); x.lineTo(110, 108); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(64, 56); x.lineTo(64, 16); x.moveTo(48, 32); x.lineTo(64, 16); x.lineTo(80, 32); x.stroke(); }
  ];
  const buttonMats = icons.map((draw) => new THREE.MeshBasicMaterial({ map: iconTexture(draw), transparent: true, toneMapped: false, color: 0xa9bdd6 }));
  const btnGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 48);
  btnGeo.rotateX(Math.PI / 2);
  const btnRing = new THREE.TorusGeometry(0.225, 0.018, 12, 48);
  [0.48, -0.02, -0.52].forEach((y, i) => {
    const b = new THREE.Mesh(btnGeo, new THREE.MeshPhysicalMaterial({ color: 0x2b3648, roughness: 0.5 }));
    b.position.set(0, y, 0.29);
    const ring = new THREE.Mesh(btnRing, chrome);
    ring.position.set(0, y, 0.3);
    const ic = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), buttonMats[i]);
    ic.position.set(0, y, 0.322);
    g.add(b, ring, ic);
  });

  const ledMat = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 8), ledMat);
  led.position.set(0, 0.86, 0.27);
  g.add(led);

  // Lama: se deschide ca la o cheie briceag, in jurul unui pivot din varf.
  const s = new THREE.Shape();
  [[-0.17, 0], [-0.17, 1.75], [-0.05, 1.9], [0.17, 1.9], [0.17, 1.62], [0.09, 1.52], [0.17, 1.42], [0.17, 1.22], [0.07, 1.12], [0.17, 1.02], [0.17, 0.78], [0.1, 0.68], [0.17, 0.58], [0.17, 0]]
    .forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  bladeGeo.translate(0, 0, -0.035);
  const blade = new THREE.Mesh(bladeGeo, steel);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.95, 0);
  pivot.add(blade);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.58, 32), chrome);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(0, 0.95, 0);
  g.add(pivot, pin);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 16, 64), chrome);
  ring.position.set(0.1, -1.5, 0);
  ring.rotation.set(0.3, 1.1, 0);
  g.add(ring);

  const root = normalize(g);
  pivot.rotation.z = Math.PI;
  return {
    group: root,
    update(p) {
      // Lama iese pe primul segment al derularii.
      pivot.rotation.z = Math.PI * (1 - smooth(0.04, 0.38, p));
      const active = Math.min(2, Math.floor(p * 3));
      buttonMats.forEach((m, i) => m.color.setHex(i === active ? CYAN : 0xa9bdd6));
      ledMat.color.setHex(CYAN).multiplyScalar(0.4 + smooth(0.04, 0.38, p) * 1.2);
    }
  };
}

/* ---------- 3. Disc de frana cu etrier (piese auto) ---------- */

export function buildBrakeDisc() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const iron = metal(0xa7b0bb, 0.36);
  const darkIron = metal(0x4b5563, 0.5);

  // Doua piste de frecare gaurite, cu nervuri de ventilatie intre ele.
  const plate = () => {
    const sh = circlePath(0, 0, 1.6, false);
    sh.holes.push(circlePath(0, 0, 0.95, true));
    [1.13, 1.3, 1.47].forEach((r, k) => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + k * 0.13;
        sh.holes.push(circlePath(Math.cos(a) * r, Math.sin(a) * r, 0.045, true));
      }
    });
    return new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 48 });
  };
  const front = new THREE.Mesh(plate(), iron);
  front.position.z = 0.07;
  const back = new THREE.Mesh(plate(), iron);
  back.position.z = -0.17;
  spin.add(front, back);

  const vanes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.05, 0.14), darkIron, 36);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + 0.25);
    v.set(Math.cos(a) * 1.27, Math.sin(a) * 1.27, 0);
    vanes.setMatrixAt(i, m4.compose(v, q, one));
  }
  spin.add(vanes);

  // Clopotul (butucul) cu prezoane.
  const hub = new THREE.Group();
  const prof = [[0.96, -0.02], [0.96, 0.1], [0.9, 0.4], [0.85, 0.46], [0.28, 0.46], [0.26, 0.38], [0.2, 0.38]].map(([x, y]) => new THREE.Vector2(x, y));
  const hatGeo = new THREE.LatheGeometry(prof, 72);
  hatGeo.rotateX(Math.PI / 2);
  hub.add(new THREE.Mesh(hatGeo, darkIron));
  const studGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 20);
  studGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const stud = new THREE.Mesh(studGeo, metal());
    stud.position.set(Math.cos(a) * 0.56, Math.sin(a) * 0.56, 0.58);
    hub.add(stud);
  }
  hub.position.z = 0.17;
  spin.add(hub);
  g.add(spin);

  // Etrierul, in culoarea marcii.
  const a0 = Math.PI * 0.12, a1 = Math.PI * 0.4;
  const cs = new THREE.Shape();
  cs.absarc(0, 0, 1.84, a0, a1, false);
  cs.absarc(0, 0, 1.12, a1, a0, true);
  const calGeo = new THREE.ExtrudeGeometry(cs, { depth: 0.62, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 5, curveSegments: 40 });
  calGeo.translate(0, 0, -0.31);
  const caliper = new THREE.Group();
  caliper.add(new THREE.Mesh(calGeo, gloss(0x0ea5e9, 0.22)));
  [a0 + 0.1, a1 - 0.1].forEach((a) => {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 6), metal());
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.42);
    caliper.add(bolt);
  });
  g.add(caliper);

  const mid = (a0 + a1) / 2;
  const root = normalize(g);
  return {
    group: root,
    update(p, t) {
      spin.rotation.z = -p * Math.PI * 5;
      // Pe ultimul segment, discul se "dezmembreaza".
      const e = smooth(0.66, 0.95, p);
      caliper.position.set(Math.cos(mid) * e * 0.9, Math.sin(mid) * e * 0.9, e * 0.9);
      hub.position.z = 0.17 + e * 1.1;
    }
  };
}

/* ---------- 4. Parcul auto (hero-ul paginii de dealer) ----------
   Un showroom noaptea, cu parcarea plina. Masina e un model .glb real
   (comprimat cu meshopt), cladirea e construita din cod. Nimic nu se
   misca singur: camera inainteaza doar cand derulezi. */

const ADDONS = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const radial = (inner) => canvasTexture(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
});

function decal(tex, w, d, { additive = false, opacity = 1 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, opacity, toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

function sign(text, w, h, color = '#38bdf8') {
  const tex = canvasTexture(1024, Math.round(1024 * h / w), (x, cw, ch) => {
    x.fillStyle = color;
    x.font = '800 ' + Math.round(ch * 0.62) + 'px "Bricolage Grotesque", system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if ('letterSpacing' in x) x.letterSpacing = Math.round(ch * 0.12) + 'px';
    x.fillText(text, cw / 2, ch / 2 + ch * 0.04);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
}

// Flota din parc: lungimea reala a fiecarui model si materialul vopselei
// (cand modelul are unul separat), ca sa putem schimba culoarea.
const MODELS = new URL('../models/', import.meta.url).href;
export const FLEET = {
  m4: { file: 'bmw-m4-g82.glb', length: 4.79, paint: /^Material_692$/ },
  eclass: { file: 'mercedes-e-class.glb', length: 4.95, paint: /Diamond_White_Metallic$/ },
  rs5: { file: 'audi-rs5.glb', length: 4.72, paint: /^Paint$/ },
  f150: { file: 'ford-f150-raptor.glb', length: 5.89, paint: null },
  model3: { file: 'tesla-model-3.glb', length: 4.69, paint: /^primary/ }
};

// Geamuri fumurii, aceleasi pe toate masinile: negre, dar cu reflexii.
const SMOKED = new THREE.MeshPhysicalMaterial({ color: 0x030507, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });

let loaderPromise = null;
function carLoader() {
  if (!loaderPromise) {
    loaderPromise = Promise.all([
      import(ADDONS + 'loaders/GLTFLoader.js/+esm'),
      import(ADDONS + 'libs/meshopt_decoder.module.js/+esm')
    ]).then(([{ GLTFLoader }, { MeshoptDecoder }]) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder));
  }
  return loaderPromise;
}

async function loadCar(spec) {
  const gltf = await (await carLoader()).loadAsync(MODELS + spec.file);
  // Lungimea reala, centrata, asezata pe sol, cu lungimea pe axa z.
  // Cutia se calculeaza din varfuri (precise = true): cutiile aproximative
  // ale pieselor rotite (roti, frane) coboara sub sol si ridicau masina.
  const car = gltf.scene;
  let box = new THREE.Box3().setFromObject(car, true);
  const size = box.getSize(new THREE.Vector3());
  car.scale.setScalar(spec.length / Math.max(size.x, size.z));
  car.rotation.y = (size.x > size.z ? Math.PI / 2 : 0) + (spec.yaw || 0);
  car.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(car, true);
  const center = box.getCenter(new THREE.Vector3());
  car.position.set(-center.x, -box.min.y, -center.z);
  car.updateMatrixWorld(true);
  const height = box.max.y - box.min.y;
  const base = box.min.y;

  // Geamurile = materiale transparente sau numite „glass/window”, aflate in
  // partea de sus a masinii (farurile au tot sticla, dar stau jos).
  const mb = new THREE.Box3();
  car.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const m = o.material;
    const name = (m.name || '') + ' ' + (o.name || '');
    if (/light|lamp|reflector|indicator|lcd|mirror_inside/i.test(name)) return;
    if (!(m.transparent || m.opacity < 0.95 || m.transmission > 0 || /glass|window|windshield/i.test(name))) return;
    mb.setFromObject(o, true);
    if ((mb.min.y + mb.max.y) / 2 - base > height * 0.52) o.material = SMOKED;
  });

  const size2 = box.getSize(new THREE.Vector3());
  const proto = new THREE.Group();
  proto.add(car);
  return { proto, spec, width: size2.x, length: size2.z };
}

let contact = null;
const contactTex = () => contact || (contact = radial('rgba(0,0,0,.9)'));
function placeCar(model, color) {
  const c = model.proto.clone(true);
  if (model.spec.paint && color != null) {
    let mat = null;
    c.traverse((o) => {
      if (!o.isMesh || !model.spec.paint.test(o.material.name || '')) return;
      if (!mat) {
        mat = o.material.clone();
        mat.color.setHex(color);
        mat.vertexColors = false;
      }
      o.material = mat;
    });
  }
  // Umbra de contact, pe langa umbrele reale ale stalpilor.
  const shadow = decal(contactTex(), model.width * 1.25, model.length * 1.12);
  shadow.position.y = 0.012;
  c.add(shadow);
  return c;
}

function buildShowroom(scene) {
  const cladding = new THREE.MeshStandardMaterial({ color: 0x1b2331, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe5ec, roughness: 0.45 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x0c1118, roughness: 0.4, metalness: 0.6 });
  const W = 26, D = 12, H = 6, Z = -8; // fatada de sticla la z = -8
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };

  // Podeaua lucioasa si interiorul luminat.
  box(W, 0.3, D, new THREE.MeshStandardMaterial({ color: 0x3a4454, roughness: 0.18, metalness: 0.2, emissive: 0x1a2230, emissiveIntensity: 0.6 }), 0, 0.15, Z - D / 2).receiveShadow = true;
  box(W, H, 0.3, new THREE.MeshStandardMaterial({ color: 0x8b97a6, emissive: 0xb8c4d2, emissiveIntensity: 0.18, roughness: 0.8 }), 0, H / 2, Z - D);
  box(0.3, H, D, cladding, -W / 2, H / 2, Z - D / 2);
  box(0.3, H, D, cladding, W / 2, H / 2, Z - D / 2);
  const ceiling = new THREE.MeshBasicMaterial({ color: 0xf3f7ff, toneMapped: false });
  for (let i = 0; i < 4; i++) box(W - 3, 0.05, 0.22, ceiling, 0, H - 0.1, Z - 1.6 - i * 2.8);

  // Fatada: sticla, montanti si copertina cu firma.
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H - 0.4), new THREE.MeshPhysicalMaterial({ color: 0x9fc3e6, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.3, depthWrite: false }));
  glass.position.set(0, (H - 0.4) / 2 + 0.3, Z);
  scene.add(glass);
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 8) box(0.14, H, 0.18, frame, x, H / 2, Z);
  box(W, 0.14, 0.18, frame, 0, 3.2, Z);
  // Copertina iese 1.3 m in fata fatadei; firma sta pe fata ei.
  box(W + 1.6, 1, D + 1.6, white, 0, H + 0.45, Z - D / 2 + 0.5);
  const front = Z + 1.3;
  const s = sign('SHOWROOM', 9, 0.78);
  s.position.set(0, H + 0.45, front + 0.02);
  scene.add(s);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false }));
  strip.position.set(0, H - 0.07, front);
  scene.add(strip);

  // Totemul de la intrare.
  box(1.4, 7.5, 0.6, frame, 15.5, 3.75, -3);
  const tot = sign('AUTO', 5.6, 1.1);
  tot.rotation.z = Math.PI / 2;
  tot.position.set(15.5, 4.2, -2.69);
  scene.add(tot);

  const inside = new THREE.PointLight(0xf1f5ff, 90, 30, 2);
  inside.position.set(0, H - 0.6, Z - D / 2);
  scene.add(inside);
}

// Asfalt mat si opac, cu tot cu umbrele stalpilor si ale masinilor.
function buildGround(scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x0c111a, roughness: 0.88, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// Interiorul showroom-ului: receptie, colt de asteptare, plante si
// decoratiuni pe pereti. Podeaua e la y = 0.3, peretele din spate la z = -19.85.
function furnishShowroom(scene) {
  const F = 0.3, BACK = -19.85;
  const white = new THREE.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.25, metalness: 0.05 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a202b, roughness: 0.5 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.9 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.8, flatShading: true });
  const led = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });
  const box = (w, h, d, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // Peretele din spate: lambriu de lemn in spatele receptiei si un ecran mare.
  for (let i = 0; i < 26; i++) box(0.12, 2.3, 0.08, wood, -4.5 + i * 0.36, F + 1.15, BACK + 0.05);
  const screenTex = canvasTexture(1400, 480, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0b1a2e');
    g.addColorStop(1, '#06223a');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#38bdf8';
    x.font = '800 92px "Bricolage Grotesque", system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillText('Test drive · Finanțare · Buy-back', w / 2, h / 2 - 10);
    x.fillStyle = 'rgba(234,241,250,.75)';
    x.font = '500 46px "Geist", system-ui, sans-serif';
    x.fillText('Programări non-stop pe WhatsApp', w / 2, h / 2 + 70);
  });
  box(7.4, 2.6, 0.12, dark, 0, F + 3.55, BACK + 0.08);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.1, 2.4), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, F + 3.55, BACK + 0.15);
  scene.add(screen);

  // Tablouri pe peretele din spate, stanga si dreapta.
  const poster = (hue) => canvasTexture(400, 520, (x, w, h) => {
    x.fillStyle = '#0d1522';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      x.fillStyle = 'hsla(' + (hue + i * 6) + ',70%,' + (30 + i * 6) + '%,.9)';
      x.beginPath();
      x.arc(w * 0.5, h * 1.05, h * (0.95 - i * 0.12), Math.PI, 0);
      x.fill();
    }
  });
  [[-9.2, 200], [-6.4, 190], [6.4, 210], [9.2, 195]].forEach(([px, hue]) => {
    box(2.1, 2.75, 0.06, dark, px, F + 3.1, BACK + 0.05);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.55), new THREE.MeshStandardMaterial({ map: poster(hue), roughness: 0.6 }));
    art.position.set(px, F + 3.1, BACK + 0.09);
    scene.add(art);
  });

  // Receptia: birou alb cu banda LED si blat de lemn, monitor si doua scaune.
  box(4.2, 1.05, 0.9, white, 0, F + 0.525, -17.3);
  box(4.4, 0.06, 1.05, wood, 0, F + 1.08, -17.3);
  box(4.2, 0.04, 0.03, led, 0, F + 0.2, -16.84);
  box(0.9, 0.55, 0.05, dark, -0.8, F + 1.42, -17.5, 0.2);
  const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.48), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, toneMapped: false }));
  mon.position.set(-0.79, F + 1.42, -17.47);
  mon.rotation.y = 0.2;
  scene.add(mon);
  [-0.8, 0.8].forEach((cx) => {
    box(0.55, 0.08, 0.55, dark, cx, F + 0.55, -18.3);
    box(0.55, 0.6, 0.08, dark, cx, F + 0.85, -18.58);
  });

  // Coltul de asteptare: canapea, doua fotolii, masuta.
  const lounge = (x, z, ry) => {
    const g = new THREE.Group();
    const part = (w, h, d, mat, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    part(2.6, 0.42, 0.95, fabric, 0, F + 0.21, 0);
    part(2.6, 0.55, 0.22, fabric, 0, F + 0.69, -0.37);
    part(0.22, 0.32, 0.95, fabric, -1.2, F + 0.58, 0);
    part(0.22, 0.32, 0.95, fabric, 1.2, F + 0.58, 0);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
  };
  lounge(-10.6, -18.6, 0);
  lounge(10.6, -18.6, 0);
  [-10.6, 10.6].forEach((tx) => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 40), wood);
    top.position.set(tx, F + 0.45, -17.4);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.42, 16), dark);
    leg.position.set(tx, F + 0.21, -17.4);
    top.castShadow = leg.castShadow = true;
    scene.add(top, leg);
  });

  // Plante in ghivece, in colturi si langa receptie.
  [[-12.3, -19.2], [12.3, -19.2], [-2.8, -18.9], [2.8, -18.9], [-12.3, -9], [12.3, -9]].forEach(([px, pz], i) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.6, 24), white);
    pot.position.set(px, F + 0.3, pz);
    scene.add(pot);
    const h = i < 2 ? 1.8 : 1.2;
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 - k * 0.05, 0), leaf);
      f.position.set(px + Math.sin(k * 2.1) * 0.15, F + 0.75 + k * (h / 4), pz + Math.cos(k * 2.1) * 0.15);
      f.rotation.set(k, k * 1.3, 0);
      f.castShadow = true;
      scene.add(f);
    }
  });

  // Litere luminoase pe peretele lateral.
  const brand = sign('AUTO PARK', 6, 0.9, '#eaf1fa');
  brand.rotation.y = Math.PI / 2;
  brand.position.set(-12.8, F + 4.4, -14);
  scene.add(brand);
}

function buildLot(scene, low) {
  const line = new THREE.MeshBasicMaterial({ color: 0x7c8796 });
  for (let i = -4; i <= 4; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 5.6), line);
    l.rotation.x = -Math.PI / 2;
    l.position.set(i * 3.6, 0.012, -2.6);
    scene.add(l);
  }

  // Stalpi de iluminat: cap luminos, halou, con de lumina si pata calda pe sol.
  const pole = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.45, metalness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
  const pool = radial('rgba(255,210,150,.6)');
  const halo = radial('rgba(255,226,180,.9)');
  const coneTex = canvasTexture(4, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,228,190,.55)');
    g.addColorStop(1, 'rgba(255,228,190,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  const coneMat = new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, opacity: 0.06 });
  const POLES = [[-8.5, 3.6], [8.5, 3.6], [-19, 2], [19, 2], [-24, -6.5], [24, -6.5]];
  POLES.forEach(([x, z], i) => {
    const H = 7.2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, H, 14), pole);
    p.position.set(x, H / 2, z);
    p.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.3), pole);
    arm.position.set(x, H, z - 0.6);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.9), pole);
    head.position.set(x, H - 0.02, z - 1.2);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.78), lampMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, H - 0.1, z - 1.2);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.8 }));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.set(x, H - 0.25, z - 1.2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, H - 0.2, 32, 1, true), coneMat);
    cone.position.set(x, (H - 0.2) / 2, z - 1.2);
    const d = decal(pool, 12, 12, { additive: true, opacity: 0.6 });
    d.position.set(x, 0.015, z - 1.2);
    scene.add(p, arm, head, lens, glow, cone, d);

    const sp = new THREE.SpotLight(0xffe2bd, i < 2 ? 220 : 140, 30, 0.85, 0.65, 1.6);
    sp.position.set(x, H - 0.15, z - 1.2);
    sp.target.position.set(x, 0, z - 1.2);
    // Doar stalpii din fata arunca umbre reale (sunt cei care lumineaza masinile).
    if (i < 2 && !low) {
      sp.castShadow = true;
      sp.shadow.mapSize.set(1024, 1024);
      sp.shadow.bias = -0.0004;
      sp.shadow.normalBias = 0.02;
      sp.shadow.radius = 4;
    }
    scene.add(sp, sp.target);
  });

  // Discul pe care sta masina din prim-plan.
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.06, 72), new THREE.MeshStandardMaterial({ color: 0x0f1622, roughness: 0.2, metalness: 0.5 }));
  pad.position.set(0, 0.03, 6);
  pad.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.02, 8, 128), new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.07, 6);
  const glow = decal(radial('rgba(56,189,248,.3)'), 10, 10, { additive: true });
  glow.position.set(0, 0.075, 6);
  scene.add(pad, ring, glow);
  // Reflectorul de expunere de deasupra discului: masina din fata e vedeta.
  const show = new THREE.SpotLight(0xf3f7ff, 320, 20, 0.55, 0.5, 1.4);
  show.position.set(1.5, 9, 9);
  show.target.position.set(0, 0, 6);
  if (!low) {
    show.castShadow = true;
    show.shadow.mapSize.set(1024, 1024);
    show.shadow.bias = -0.0004;
    show.shadow.normalBias = 0.02;
  }
  scene.add(show, show.target);
}

// Cadrele camerei: masina de aproape, profilul, apoi tot parcul.
const SHOTS = [
  { pos: [5.2, 1.25, 14.2], look: [0, 0.7, 6] },
  { pos: [-6.6, 1.5, 8.2], look: [0, 0.8, 5.4] },
  { pos: [-11, 4.6, 18], look: [0, 2, -3] },
  { pos: [0, 9, 31], look: [0, 2.4, -7] }
];

// Ce sta in parcare: [model, culoare (null = cea din model), x, z, rotatie].
const LAYOUT = [
  ['f150', null, -12.6, -2.6, 0],
  ['model3', 0xeef1f4, -9, -2.6, 0],
  ['eclass', 0x0b0d12, -5.4, -2.6, 0],
  ['rs5', 0x6b7280, -1.8, -2.6, 0],
  ['model3', 0x8b1a1a, 1.8, -2.6, 0],
  ['eclass', null, 5.4, -2.6, 0],
  ['rs5', 0x1e3a8a, 9, -2.6, 0],
  ['m4', 0x0b0d12, 12.6, -2.6, 0],
  // In showroom.
  ['m4', 0xc9a227, -6, -14, -0.5],
  ['rs5', 0x7f1d1d, 6, -14, 0.5]
];

export async function mountDealership(section, canvas, { onStep } = {}) {
  const low = window.matchMedia('(max-width: 760px)').matches;
  const [m4] = await Promise.all([loadCar(FLEET.m4), document.fonts ? document.fonts.ready : null]);
  const st = createStage(canvas, { fov: 34, exposure: 1.05 });
  const { scene, camera, renderer } = st;
  if (!low) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  scene.environmentIntensity = 0.45;
  scene.fog = new THREE.Fog(NIGHT, 36, 100);
  scene.add(new THREE.HemisphereLight(0x2a3c5c, 0x05070b, 0.6));
  const moon = new THREE.DirectionalLight(0x9fb8e0, 0.5);
  moon.position.set(-20, 30, 20);
  scene.add(moon);

  buildShowroom(scene);
  buildLot(scene, low);
  let dirty = true;
  buildGround(scene);
  furnishShowroom(scene);

  const hero = placeCar(m4, 0x1a3494);
  hero.position.set(0, 0.06, 6);
  hero.rotation.y = -0.35;
  scene.add(hero);

  // Restul flotei vine dupa masina din prim-plan, ca pagina sa nu astepte.
  const cache = { m4: Promise.resolve(m4) };
  LAYOUT.forEach(([key, color, x, z, r]) => {
    cache[key] = cache[key] || loadCar(FLEET[key]);
    cache[key].then((model) => {
      const c = placeCar(model, color);
      c.position.set(x, z < -8 ? 0.3 : 0, z);
      c.rotation.y = r;
      scene.add(c);
      dirty = true;
    }).catch(() => {});
  });

  // Stele.
  const rand = rng(82);
  const sp = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) { sp[i * 3] = (rand() - 0.5) * 220; sp[i * 3 + 1] = 25 + rand() * 60; sp[i * 3 + 2] = -90 - rand() * 30; }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.25, transparent: true, opacity: 0.7, fog: false })));

  const posCurve = new THREE.CatmullRomCurve3(SHOTS.map((s) => new THREE.Vector3(...s.pos)), false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(SHOTS.map((s) => new THREE.Vector3(...s.look)), false, 'centripetal');
  const look = new THREE.Vector3();
  let lastStep = -1, lastP = -1, lastSize = -1;

  st.onFrame(() => {
    const p = sectionProgress(section);
    // Scena e statica: desenam doar cand s-a derulat, s-a redimensionat sau s-a incarcat ceva.
    if (p === lastP && !dirty && lastSize === st.stage.size) return false;
    lastP = p; dirty = false; lastSize = st.stage.size;

    const t = smooth(0, 1, p);
    posCurve.getPoint(t, camera.position);
    lookCurve.getPoint(t, look);
    // Pe ecrane inguste (telefon) camera se trage inapoi, ca sa incapa masina.
    // Cadrul larg de la final are nevoie de mai putin recul decat prim-planurile.
    if (camera.aspect < 1.2) {
      const k = Math.min(2.1, 1.25 / camera.aspect);
      camera.position.sub(look).multiplyScalar(1 + (k - 1) * (1 - t * 0.55)).add(look);
    }
    camera.lookAt(look);
    // Pe desktop textul sta in stanga: mutam cadrul ca masina sa fie in dreapta.
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) {
      const wide = w / h > 1.1;
      camera.setViewOffset(w, h, wide ? -w * 0.17 * (1 - t) : 0, wide ? 0 : h * (0.14 + t * 0.12), w, h);
    }
    const step = Math.min(SHOTS.length - 2, Math.floor(p * (SHOTS.length - 1)));
    if (step !== lastStep) { lastStep = step; if (onStep) onStep(step); }
  });
  return st;
}


export const BUILDERS = { clinica: buildStethoscope, dealer: buildCarKey, piese: buildBrakeDisc };

/* ---------- Scena cu un obiect care se roteste la scroll ---------- */

// Pune obiectul in dreapta pe desktop si sus pe telefon.
function placeObject(camera, holder, dist) {
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
  const halfW = halfH * camera.aspect;
  if (camera.aspect > 1.05) {
    holder.position.set(halfW * 0.4, -halfH * 0.02, 0);
    holder.scale.setScalar(Math.min(1, (halfH * 0.78) / 2.2, (halfW * 0.5) / 2.2));
  } else {
    holder.position.set(0, halfH * 0.24, 0);
    holder.scale.setScalar(Math.min(1, (halfH * 0.42) / 2.2, (halfW * 0.8) / 2.2));
  }
}

// kinds: unul sau mai multe obiecte; cu mai multe, scroll-ul le schimba pe rand.
export function mountObjects(section, canvas, kinds, { onStep, pulse = false } = {}) {
  const st = createStage(canvas);
  const { scene, camera } = st;
  addStudioLights(scene);
  const DIST = 11;
  camera.position.set(0, 0, DIST);

  const holder = new THREE.Group();
  scene.add(holder);
  const items = kinds.map((k) => {
    const o = BUILDERS[k]();
    const pivot = new THREE.Group();
    pivot.add(o.group);
    holder.add(pivot);
    return { ...o, pivot };
  });

  let ecg = null;
  if (pulse) {
    ecg = buildPulseLine(6);
    ecg.mesh.position.set(0, -0.2, -3);
    ecg.mesh.scale.y = 0.75;
    holder.add(ecg.mesh);
  }

  // Totul depinde doar de scroll: fara rotire sau plutire de la sine.
  let lastStep = -1;
  st.onFrame(() => {
    const p = sectionProgress(section);
    placeObject(camera, holder, DIST);

    const n = items.length;
    const step = Math.min(n > 1 ? n - 1 : 2, Math.floor(p * (n > 1 ? n : 3)));
    if (step !== lastStep) { lastStep = step; if (onStep) onStep(step); }

    items.forEach((it, i) => {
      // Fiecare obiect e vizibil pe treimea lui; la granite se micsoreaza si se rasuceste.
      let vis = 1, local = p;
      if (n > 1) {
        const c = p * n - i;
        local = clamp(c);
        const inn = i === 0 ? 1 : smooth(-0.12, 0.12, c);
        const out = i === n - 1 ? 1 : 1 - smooth(0.88, 1.12, c);
        vis = Math.min(inn, out);
      }
      it.pivot.visible = vis > 0.001;
      it.pivot.scale.setScalar(0.0001 + vis);
      it.pivot.rotation.set(0.18 - local * 0.12, -0.75 + local * 1.5 + (1 - vis) * 2.2, (1 - vis) * 0.6);
      it.update(local);
    });
    if (ecg) ecg.update(p);
  });

  return st;
}

/* ---------- Hero: orasul la 23:47 ---------- */

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 112;
  const x = c.getContext('2d');
  x.fillStyle = '#38bdf8';
  x.beginPath();
  x.roundRect(8, 8, 144, 78, 30);
  x.moveTo(34, 80); x.lineTo(22, 106); x.lineTo(58, 84);
  x.fill();
  x.fillStyle = '#04111d';
  [52, 80, 108].forEach((cx) => { x.beginPath(); x.arc(cx, 47, 9, 0, Math.PI * 2); x.fill(); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ferestrele aprinse "scriu": un mesaj zboara din fereastra spre telefonul
// din hero, iar fereastra devine cyan — mesaj preluat de Ariana.
export function mountCity(hero, canvas, target) {
  const st = createStage(canvas, { fov: 38, exposure: 1, env: false });
  const { scene, camera } = st;
  scene.fog = new THREE.Fog(NIGHT, 16, 64);
  scene.add(new THREE.HemisphereLight(0x3d5f94, 0x04070d, 0.9));
  const moonLight = new THREE.DirectionalLight(0x9fc4ff, 0.7);
  moonLight.position.set(-10, 20, 10);
  scene.add(moonLight);

  const rand = rng(2347);
  const blds = [];
  for (let row = 0; row < 5; row++) {
    const z = -16 - row * 8;
    let x = -46 + rand() * 2;
    while (x < 46) {
      const w = 1.6 + rand() * 2.6, d = 1.6 + rand() * 2.2;
      const h = (1.4 + rand() * rand() * 8) * (1 + row * 0.35);
      blds.push({ x: x + w / 2, z: z - rand() * 2, w, h, d, row });
      x += w + 0.4 + rand() * 1.4;
    }
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const bMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0d1729, roughness: 0.85 }), blds.length);
  blds.forEach((b, i) => bMesh.setMatrixAt(i, m4.compose(v.set(b.x, b.h / 2, b.z), q, sc.set(b.w, b.h, b.d))));
  scene.add(bMesh);

  const wins = [];
  blds.forEach((b) => {
    const cols = Math.floor((b.w - 0.3) / 0.55), rows = Math.floor((b.h - 0.7) / 0.78);
    const x0 = b.x - ((cols - 1) * 0.55) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      wins.push({ x: x0 + c * 0.55, y: 0.75 + r * 0.78, z: b.z + b.d / 2 + 0.01, row: b.row, state: rand() < 0.2 - b.row * 0.02 ? 1 : 0, timer: 0 });
    }
  });
  const wMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.4), new THREE.MeshBasicMaterial({ toneMapped: false }), wins.length);
  const COLORS = [new THREE.Color(0x101a2c), new THREE.Color(0xffc978).multiplyScalar(0.8), new THREE.Color(CYAN).multiplyScalar(1.5), new THREE.Color(0x174560)];
  wins.forEach((w, i) => {
    wMesh.setMatrixAt(i, m4.compose(v.set(w.x, w.y, w.z), q, sc.set(1, 1, 1)));
    wMesh.setColorAt(i, COLORS[w.state]);
  });
  scene.add(wMesh);
  const paint = (i, s) => { wins[i].state = s; wMesh.setColorAt(i, COLORS[s]); wMesh.instanceColor.needsUpdate = true; };

  // Stele.
  const sp = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) { sp[i * 3] = (rand() - 0.5) * 140; sp[i * 3 + 1] = 12 + rand() * 40; sp[i * 3 + 2] = -50 - rand() * 20; }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.16, transparent: true, opacity: 0.75, fog: false })));

  // Mesajele: bula + dara de lumina in urma ei.
  const tex = bubbleTexture();
  const TRAIL = 40;
  const msgs = Array.from({ length: 14 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0, fog: false }));
    sprite.visible = false;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, fog: false }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(sprite, line);
    return { sprite, line, on: false, t0: 0, dur: 1, win: -1, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
  });
  const bez = (m, u, out) => {
    const k = 1 - u;
    return out.set(
      k * k * m.a.x + 2 * k * u * m.c.x + u * u * m.b.x,
      k * k * m.a.y + 2 * k * u * m.c.y + u * u * m.b.y,
      k * k * m.a.z + 2 * k * u * m.c.z + u * u * m.b.z
    );
  };

  // Punctul din scena care corespunde telefonului din pagina.
  const targetWorld = new THREE.Vector3();
  const aim = () => {
    const cr = canvas.getBoundingClientRect(), tr = target.getBoundingClientRect();
    const nx = ((tr.left + tr.width / 2 - cr.left) / cr.width) * 2 - 1;
    const ny = -(((tr.top + tr.height * 0.42 - cr.top) / cr.height) * 2 - 1);
    v.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    targetWorld.copy(camera.position).addScaledVector(v, 7);
  };

  const mouse = { x: 0, tx: 0 };
  const onMove = (e) => { mouse.tx = (e.clientX / window.innerWidth) * 2 - 1; };
  window.addEventListener('pointermove', onMove, { passive: true });

  let nextSpawn = 0;
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  st.onFrame((t) => {
    const r = hero.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height));
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    camera.position.set(mouse.x * 0.9, 1.6 + p * 7, 12 - p * 6);
    camera.lookAt(look.set(mouse.x * 0.4, 6 - p * 5, -30));
    if (reduced) return;
    aim();

    if (t > nextSpawn) {
      nextSpawn = t + 0.35 + Math.random() * 0.5;
      const m = msgs.find((x) => !x.on);
      const lit = [];
      for (let i = 0; i < wins.length; i++) if (wins[i].state === 1 && wins[i].row < 3) lit.push(i);
      if (m && lit.length) {
        const i = lit[(Math.random() * lit.length) | 0];
        const w = wins[i];
        m.on = true; m.t0 = t; m.dur = 1.5 + Math.random() * 0.9; m.win = i;
        m.a.set(w.x, w.y, w.z + 0.1);
        m.b.copy(targetWorld);
        m.c.set((m.a.x + m.b.x) / 2, Math.max(m.a.y, m.b.y) + 3 + Math.random() * 3, (m.a.z + m.b.z) / 2);
        m.sprite.visible = m.line.visible = true;
      }
      // Alte ferestre se aprind: oamenii continua sa scrie.
      for (let k = 0; k < 2; k++) {
        const j = (Math.random() * wins.length) | 0;
        if (wins[j].state === 0) paint(j, 1);
      }
    }

    msgs.forEach((m) => {
      if (!m.on) return;
      m.b.copy(targetWorld);
      const u = clamp((t - m.t0) / m.dur);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      bez(m, e, m.sprite.position);
      const s = 0.4 + Math.sin(u * Math.PI) * 0.3;
      m.sprite.scale.set(s, s * 0.7, 1);
      m.sprite.material.opacity = Math.min(1, u * 6) * (1 - smooth(0.85, 1, u));
      const pos = m.line.geometry.attributes.position;
      for (let k = 0; k < TRAIL; k++) {
        bez(m, Math.max(0, e - 0.3 + (k / (TRAIL - 1)) * 0.3), tmp);
        pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
      }
      pos.needsUpdate = true;
      m.line.material.opacity = 0.45 * (1 - u);
      if (u >= 1) {
        m.on = false;
        m.sprite.visible = m.line.visible = false;
        paint(m.win, 2);
        wins[m.win].timer = t;
      }
    });

    // Raspuns trimis: cyan aprins, apoi cyan stins; dupa o vreme, fereastra se stinge.
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      if (w.state === 2 && t - w.timer > 0.9) paint(i, 3);
      else if (w.state === 3 && t - w.timer > 14) paint(i, 0);
    }
  });

  return {
    dispose() {
      window.removeEventListener('pointermove', onMove);
      st.dispose();
    }
  };
}