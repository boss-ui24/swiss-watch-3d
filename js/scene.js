/* KANTON — сцена: один полноэкранный WebGL-холст поверх секций (pointer-events: none).
   Часы не привязаны к DOM-элементам: у каждой секции своя поза [data-pose],
   а между якорями поз (позиции скролла) поза плавно интерполируется. */
window.KantonScene = function (THREE, opts) {
  'use strict';

  const { canvas, mobile = false, reduced = false } = opts;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const smooth = (t) => t * t * (3 - 2 * t);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 1.8));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  camera.position.set(0, 0, 12);

  /* ---------- Студия для отражений: тёмная комната с софтбоксами-полосами ---------- */
  scene.environment = (() => {
    const pm = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x77777b, side: THREE.BackSide })));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x505055 }));
    floor.rotation.x = -PI / 2; floor.position.y = -6; s.add(floor);
    const panel = (w, h, color, k, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    };
    panel(14, 3, '#ffffff', 5, 0, 9, 2);          // большой сверху
    panel(2, 10, '#fff4e8', 4, -9, 1, 4);         // вертикальная полоса слева
    panel(2, 10, '#eaf2ff', 3.2, 9, 0, 3);        // справа
    panel(10, 1.2, '#ffffff', 2.4, 0, -2, 9);     // нижняя спереди — даёт блик на ребре
    panel(8, 3, '#ffffff', 2.2, -3, -2, -8);       // контровой сзади
    const t = pm.fromScene(s, 0.035).texture;
    pm.dispose();
    return t;
  })();
  const hemi = new THREE.HemisphereLight('#ffffff', '#3a3530', 0.7);
  const key = new THREE.DirectionalLight('#fff6ec', 2.2); key.position.set(-4, 6, 6);
  const rim = new THREE.DirectionalLight('#ffd8cf', 1.4); rim.position.set(5, 2, -5);
  scene.add(hemi, key, rim);

  /* ---------- Часы ---------- */
  const W = window.KantonWatch(THREE, { quality: mobile ? 0.6 : 1, maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
  const holder = new THREE.Group();
  holder.add(W.root);
  W.root.rotation.order = 'XYZ';
  scene.add(holder);

  /* ---------- Световые нити вокруг механизма (тёмная секция) ---------- */
  const aura = new THREE.Group();
  holder.add(aura);
  const auraMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uGlow: { value: 0 } },
    vertexShader: `
      attribute float aSeed;
      varying vec2 vUv; varying float vSeed;
      void main(){ vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime, uGlow;
      varying vec2 vUv; varying float vSeed;
      void main(){
        float x = vUv.x;
        float head = fract(x * 1.0 - uTime * (0.08 + vSeed * 0.07) + vSeed * 7.0);
        float pulse = pow(head, 10.0) * 1.6 + pow(head, 2.5) * 0.25;
        float ends = smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x);
        float a = (0.12 + pulse) * ends * uGlow;
        vec3 c = mix(vec3(1.0, 0.93, 0.86), vec3(1.0, 0.42, 0.34), smoothstep(0.85, 1.0, head) * 0.0 + vSeed * 0.25);
        gl_FragColor = vec4(c * a, a);
      }`
  });
  {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const count = mobile ? 16 : 26;
    for (let i = 0; i < count; i++) {
      const pts = [];
      const r0 = rnd(1.25, 2.4), tilt = rnd(-0.9, 0.9), a0 = rnd(0, TAU), turns = rnd(0.6, 1.2), wob = rnd(0.15, 0.55);
      for (let j = 0; j <= 10; j++) {
        const t = j / 10, a = a0 + t * TAU * turns, r = r0 * (1 + Math.sin(t * 6 + i) * 0.18);
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * Math.cos(tilt), Math.sin(a) * r * Math.sin(tilt) + Math.sin(t * 5 + i) * wob));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), mobile ? 90 : 160, rnd(0.003, 0.008), 3);
      const seed = new Float32Array(geo.attributes.position.count).fill(Math.random());
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      aura.add(new THREE.Mesh(geo, auraMat));
    }
    // мелкая пыль в луче
    const n = mobile ? 220 : 480, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = rnd(0.9, 3.2), a = rnd(0, TAU), b = rnd(-1, 1);
      p.set([Math.cos(a) * r, Math.sin(a) * r * 0.8, b * 1.6], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    aura.userData.dustMat = new THREE.PointsMaterial({ color: '#ffe9dc', size: mobile ? 0.022 : 0.016, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    aura.add(new THREE.Points(g, aura.userData.dustMat));
  }

  /* ---------- Позы ---------- */
  // x, y — доля половины ширины/высоты кадра; s — размер; rx/ry/rz — радианы;
  // explode — разнесённый механизм; band — браслет; glow — нити; dark — тёмный фон страницы
  const BASE = { x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0, explode: 0, band: 1, glow: 0, dark: 0 };
  const POSES = {
    hero: { d: { y: -0.04, s: 1.12, rx: 0.12, ry: -0.28, rz: 0.06 }, m: { y: 0.06, s: 1.12, rx: 0.12, ry: -0.24, rz: 0.06 } },
    profile: { d: { x: 0.08, y: 0, s: 1.15, rx: 0.08, ry: -1.42, rz: 0.12 }, m: { y: 0.28, s: 1.05, rx: 0.1, ry: -1.38, rz: 0.12 } },
    back: { d: { x: 0.36, s: 1.05, rx: 0.16, ry: -PI + 0.1, rz: -0.2, band: 0, glow: 1, dark: 1 }, m: { y: 0.3, s: 1.0, rx: 0.16, ry: -PI + 0.1, rz: -0.2, band: 0, glow: 1, dark: 1 } },
    explode: { d: { x: 0.46, s: 0.68, rx: 0.28, ry: -PI - 1.12, rz: -0.12, explode: 1, band: 0, glow: 1, dark: 1 }, m: { y: 0.33, s: 0.76, rx: 1.0, ry: -PI - 0.3, rz: -0.1, explode: 1, band: 0, glow: 1, dark: 1 } },
    contours: { d: { x: -0.36, y: -0.02, s: 0.98, rx: 0.42, ry: -TAU + 0.62, rz: -0.38 }, m: { y: 0.3, s: 0.9, rx: 0.42, ry: -TAU + 0.55, rz: -0.32 } },
    straps: { d: { x: 0.34, y: -0.02, s: 1.0, rx: 0.5, ry: -TAU + 0.6, rz: -0.32, dark: 1 }, m: { y: 0.3, s: 1.04, rx: 0.5, ry: -TAU + 0.55, rz: -0.3, dark: 1 } },
    straps2: { d: { x: 0.34, y: -0.02, s: 1.0, rx: 0.32, ry: -TAU - 0.45, rz: -0.12, dark: 1 }, m: { y: 0.3, s: 1.04, rx: 0.32, ry: -TAU - 0.4, rz: -0.1, dark: 1 } },
    dial: { d: { x: 0.38, s: 1.18, rx: 0.02, ry: -TAU - 0.06, rz: 0 }, m: { y: 0.33, s: 1.08, rx: 0.02, ry: -TAU - 0.04, rz: 0 } },
    reserve: { d: { x: -0.42, y: 0.02, s: 0.92, rx: 0.3, ry: -TAU - 0.55, rz: 0.2 }, m: { y: 0.42, s: 0.72, rx: 0.3, ry: -TAU - 0.45, rz: 0.2 } }
  };
  const poseOf = (name, isM) => Object.assign({}, BASE, POSES[name][isM ? 'm' : 'd']);
  const KEYS = Object.keys(BASE);

  let anchors = [];   // [{ at: px, name }]
  let narrow = false;
  function setAnchors(list) { anchors = list.slice().sort((a, b) => a.at - b.at); }

  const target = Object.assign({}, BASE);
  const cur = poseOf('hero', false);
  function targetAt(y) {
    if (!anchors.length) return poseOf('hero', narrow);
    let i = 0;
    while (i < anchors.length - 1 && anchors[i + 1].at <= y) i++;
    const A = anchors[i], B = anchors[Math.min(i + 1, anchors.length - 1)];
    const pa = poseOf(A.name, narrow), pb = poseOf(B.name, narrow);
    const span = B.at - A.at;
    const t = span > 0 ? smooth(clamp(((y - A.at) / span - 0.08) / 0.84, 0, 1)) : 0;
    for (const k of KEYS) target[k] = lerp(pa[k], pb[k], t);
    return target;
  }

  /* ---------- Ремешки ---------- */
  // Смена всегда последовательная: старый ремешок сматывается, затем наматывается новый
  const STRAPS = ['steel', 'leather', 'nato', 'rubber'];
  const strapTarget = { steel: 1, leather: 0, nato: 0, rubber: 0 };
  const strapCur = Object.assign({}, strapTarget);
  let strapKey = 'steel', strapTween = null;
  function strapMix(a, b, f) {
    for (const k of STRAPS) strapTarget[k] = 0;
    if (a === b) { strapTarget[a] = 1; return; }
    strapTarget[a] = 1 - smooth(clamp(f / 0.5, 0, 1));
    strapTarget[b] = smooth(clamp((f - 0.5) / 0.5, 0, 1));
  }
  // p — прогресс липкой секции ремешков; на каждом ремешке есть «пауза»
  function strapScroll(p) {
    if (strapTween) { strapTween.kill(); strapTween = null; }
    const q = clamp(p, 0, 1) * (STRAPS.length - 1);
    const j = Math.min(Math.floor(q), STRAPS.length - 2);
    const f = clamp((q - j - 0.3) / 0.4, 0, 1);
    strapMix(STRAPS[j], STRAPS[j + 1], f);
    const i = f > 0.5 ? j + 1 : j;
    strapKey = STRAPS[i];
    return i;
  }
  function pickStrap(key) {
    if (!STRAPS.includes(key) || key === strapKey) return;
    const from = strapKey;
    strapKey = key;
    if (strapTween) strapTween.kill();
    const o = { f: 0 };
    strapTween = window.gsap.to(o, { f: 1, duration: reduced ? 0.01 : 1.3, ease: 'none', onUpdate: () => strapMix(from, key, o.f) });
  }

  /* ---------- Размер ---------- */
  let vw = 0, vh = 0, hh = 1, hw = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === vw && h === vh)) return;
    vw = w; vh = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    hh = Math.tan(camera.fov * PI / 360) * camera.position.z;
    hw = hh * camera.aspect;
    narrow = w < 760 || w / h < 0.9;
  }

  /* ---------- Указатель и интро ---------- */
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!mobile) window.addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  const intro = { k: reduced ? 1 : 0 };

  /* ---------- Кадр ---------- */
  let kick = 0, lastY = window.scrollY;
  function render(time, dt) {
    resize();
    const y = window.scrollY;
    kick += Math.min(6, Math.abs(y - lastY) * 0.004);
    lastY = y;
    const T = targetAt(y);
    const k = reduced ? 30 : (mobile ? 7 : 6);
    for (const key of KEYS) cur[key] = damp(cur[key], T[key], k, dt);

    pointer.sx = damp(pointer.sx, pointer.x, 3, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 3, dt);

    const ik = smooth(intro.k);
    const unit = Math.min(hh, hw * 1.25) * 0.4;
    const size = cur.s * unit * lerp(0.55, 1, ik);
    holder.position.set(cur.x * hw, cur.y * hh + lerp(-0.6, 0, ik) * unit + Math.sin(time * 0.8) * 0.03 * unit, 0);
    holder.scale.setScalar(size);
    W.root.rotation.set(
      cur.rx + pointer.sy * 0.12,
      cur.ry + pointer.sx * 0.22 + lerp(-2.2, 0, ik),
      cur.rz + Math.sin(time * 0.5) * 0.02
    );
    W.setExplode(cur.explode);
    W.setBand(cur.band);
    for (const k of STRAPS) strapCur[k] = damp(strapCur[k], strapTarget[k], reduced ? 40 : 12, dt);
    W.setStraps(strapCur);
    W.update(time, dt, kick * dt * 6);
    kick = Math.max(0, kick - dt * 8);

    auraMat.uniforms.uTime.value = time;
    auraMat.uniforms.uGlow.value = cur.glow;
    aura.userData.dustMat.opacity = cur.glow * 0.7;
    aura.visible = cur.glow > 0.01;
    aura.rotation.set(Math.sin(time * 0.1) * 0.2, time * 0.06, 0);

    renderer.render(scene, camera);
    return cur;
  }

  // Точка в координатах часов → пиксели экрана (для выносок и кольца поверх холста).
  // Вызывать после render(): матрицы к этому моменту уже обновлены.
  const _pv = new THREE.Vector3();
  function project(x, y, z, out = {}) {
    _pv.set(x, y, z);
    W.root.localToWorld(_pv);
    _pv.project(camera);
    out.x = (_pv.x + 1) / 2 * vw;
    out.y = (1 - _pv.y) / 2 * vh;
    return out;
  }

  // Шейдеры компилируем заранее; compileAsync не блокирует поток, и прелоадер продолжает идти
  async function warmup() {
    resize();
    aura.visible = true;
    W.setStraps({ steel: 1, leather: 1, nato: 1, rubber: 1 });
    try {
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch (e) { renderer.compile(scene, camera); }
    renderer.render(scene, camera);
    W.setStraps(strapCur);
  }

  return {
    render, warmup, setAnchors, intro, strapScroll, pickStrap, project,
    get strap() { return strapKey; },
    setDial: (k) => W.setDial(k),
    redrawDial: () => W.redraw(),
    state: cur,
    get narrow() { return narrow; }
  };
};
