/* KANTON — процедурная 3D-модель полевых часов Field 42 в швейцарском стиле: красный крест, арабские цифры, шкала 13–24.
   Единица сцены ≈ 21 мм (радиус корпуса). Циферблат смотрит в +Z, заводная головка — в +X.
   Механизм собран слоями вдоль оси Z: при explode > 0 они расходятся, как на схеме сборки. */
window.KantonWatch = function (THREE, opts) {
  'use strict';
  opts = opts || {};

  const TAU = Math.PI * 2;
  const Q = opts.quality || 1;                 // 0.6 на телефоне — меньше сегментов и текстуры поменьше
  const maxAniso = opts.maxAnisotropy || 4;
  const seg = (n) => Math.max(12, Math.round(n * Q));
  const texSize = Q < 1 ? 768 : 1024;

  /* ---------------------------- Материалы ---------------------------- */
  const M = {
    polished: new THREE.MeshPhysicalMaterial({ color: '#eceef0', metalness: 1, roughness: 0.12, envMapIntensity: 1.25 }),
    brushed: new THREE.MeshPhysicalMaterial({ color: '#d9dcdf', metalness: 1, roughness: 0.3, anisotropy: 0.75, envMapIntensity: 1.1 }),
    gold: new THREE.MeshPhysicalMaterial({ color: '#e9c88c', metalness: 1, roughness: 0.24, envMapIntensity: 1.2 }),
    brass: new THREE.MeshPhysicalMaterial({ color: '#d6b06a', metalness: 1, roughness: 0.32 }),
    plate: new THREE.MeshPhysicalMaterial({ color: '#c9ccd1', metalness: 1, roughness: 0.42 }),
    ruby: new THREE.MeshPhysicalMaterial({ color: '#b3122e', metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
    blued: new THREE.MeshPhysicalMaterial({ color: '#2347a8', metalness: 0.9, roughness: 0.28 }),
    red: new THREE.MeshPhysicalMaterial({ color: '#d0202e', metalness: 0.3, roughness: 0.35 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2.2, clearcoat: 1 }),
    lume: new THREE.MeshPhysicalMaterial({ color: '#f4f1e8', metalness: 0, roughness: 0.6 })
  };

  /* --------------------------- Канвас-текстуры --------------------------- */
  function canvas(w, h = w) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }
  function tex(c, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }

  // Côtes de Genève — диагональные полосы, как на мостах и роторе
  const stripes = (() => {
    const [c, g] = canvas(256);
    g.fillStyle = '#a9a9a9'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      const gr = g.createLinearGradient(0, i * 32, 0, i * 32 + 32);
      gr.addColorStop(0, '#8d8d8d'); gr.addColorStop(0.45, '#ffffff'); gr.addColorStop(0.55, '#f2f2f2'); gr.addColorStop(1, '#8a8a8a');
      g.fillStyle = gr; g.fillRect(0, i * 32, 256, 32);
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.rotation = Math.PI / 5;
    t.repeat.set(1.6, 1.6);
    return t;
  })();

  // Перляж — круговое зернение основной платины
  const perlage = (() => {
    const [c, g] = canvas(512);
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 22) for (let x = (y / 22) % 2 ? 11 : 0; x < 530; x += 22) {
      const gr = g.createRadialGradient(x, y, 1, x, y, 15);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#c4c4c4'); gr.addColorStop(1, 'rgba(140,140,140,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fill();
    }
    return tex(c);
  })();
  M.plate.map = perlage;

  /* ------------------------------ Помощники ------------------------------ */
  // Скругляет углы ломаной-профиля, чтобы токарная поверхность получила тонкие фаски
  function chamfer(pts, r = 0.004) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], a = pts[i - 1], b = pts[i + 1];
      const da = new THREE.Vector2().subVectors(a, p), db = new THREE.Vector2().subVectors(b, p);
      const ra = Math.min(r, da.length() * 0.4), rb = Math.min(r, db.length() * 0.4);
      out.push(p.clone().addScaledVector(da.normalize(), ra), p.clone().addScaledVector(db.normalize(), rb));
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  // Токарная деталь вокруг оси Z: точки (радиус, z)
  function lathe(list, mat, n = 128) {
    const pts = chamfer(list.map(([r, z]) => new THREE.Vector2(r, z)));
    const geo = new THREE.LatheGeometry(pts, seg(n));
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    return m;
  }
  function circlePath(path, x, y, r, cw = false) {
    path.absarc(x, y, r, 0, TAU, cw);
    return path;
  }
  function roundedRect(shape, x, y, w, h, r) {
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }
  // Скруглённый многоугольник по точкам — для мостов механизма
  function blob(points, r) {
    const s = new THREE.Shape();
    const n = points.length;
    const P = points.map(([x, y]) => new THREE.Vector2(x, y));
    for (let i = 0; i < n; i++) {
      const p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      const pa = p.clone().lerp(a, Math.min(0.5, r / p.distanceTo(a)));
      const pb = p.clone().lerp(b, Math.min(0.5, r / p.distanceTo(b)));
      if (i === 0) s.moveTo(pa.x, pa.y); else s.lineTo(pa.x, pa.y);
      s.quadraticCurveTo(p.x, p.y, pb.x, pb.y);
    }
    s.closePath();
    return s;
  }
  function extrude(shape, depth, mat, bevel = 0.004) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, curveSegments: seg(48), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2
    });
    return new THREE.Mesh(geo, mat);
  }
  function cyl(r, h, mat, n = 32) {
    const geo = new THREE.CylinderGeometry(r, r, h, seg(n));
    geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, mat);
  }

  /* ------------------------------- Сборка ------------------------------- */
  const root = new THREE.Group();     // этим управляет сцена (поза, масштаб)
  const head = new THREE.Group();     // голова часов без браслета
  root.add(head);

  const layers = {};
  const layer = (name, offset) => {
    const g = new THREE.Group();
    g.userData.offset = offset;
    head.add(g);
    layers[name] = g;
    return g;
  };
  const L = {
    crystal: layer('crystal', 1.55),
    bezel: layer('bezel', 1.2),
    sec: layer('sec', 1.0),
    min: layer('min', 0.9),
    hour: layer('hour', 0.8),
    dial: layer('dial', 0.52),
    case: layer('case', 0),
    plate: layer('plate', -0.42),
    gears: layer('gears', -0.78),
    bridges: layer('bridges', -1.1),
    rotor: layer('rotor', -1.45),
    back: layer('back', -1.82)
  };

  /* ---- Корпус ---- */
  L.case.add(lathe([[0.885, 0.125], [0.885, -0.215], [0.962, -0.224], [0.992, -0.19], [1.006, -0.13], [1.006, 0.07], [0.992, 0.114], [0.95, 0.128], [0.885, 0.125]], M.brushed));

  // Ушки: боковой профиль вытянут по X
  const lugGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0.76, 0.095);
    s.bezierCurveTo(0.95, 0.09, 1.1, 0.06, 1.21, 0.0);
    s.quadraticCurveTo(1.255, -0.035, 1.22, -0.075);
    s.bezierCurveTo(1.1, -0.11, 0.97, -0.15, 0.78, -0.19);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.15, curveSegments: seg(20), bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3 });
    g.translate(0, 0, -0.075);
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    return g;
  })();
  for (const sy of [1, -1]) for (const sx of [1, -1]) {
    const lug = new THREE.Mesh(lugGeo, M.polished);
    if (sy < 0) lug.rotation.z = Math.PI;
    lug.position.x = sx * sy * 0.53;
    L.case.add(lug);
  }

  // Заводная головка с насечкой
  const crown = (() => {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.125, 0.125, 0.15, seg(96), 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 0.1) continue;
      const a = Math.atan2(z, x);
      const k = 1 - 0.06 * (0.5 + 0.5 * Math.cos(a * 30));
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    geo.computeVertexNormals();
    geo.rotateZ(Math.PI / 2);
    const knurl = new THREE.Mesh(geo, M.polished);
    knurl.position.x = 1.13;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, seg(24)).rotateZ(Math.PI / 2), M.polished);
    stem.position.x = 1.03;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.012, seg(48)).rotateZ(Math.PI / 2), M.red);
    cap.position.x = 1.21;
    g.add(knurl, stem, cap);
    g.userData.cap = cap;
    g.position.z = -0.04;
    return g;
  })();
  L.case.add(crown);

  /* ---- Безель и внутреннее кольцо ---- */
  L.bezel.add(lathe([[0.835, 0.112], [0.835, 0.188], [0.862, 0.212], [0.94, 0.206], [0.985, 0.176], [1.0, 0.142], [0.99, 0.12], [0.9, 0.116], [0.835, 0.112]], M.polished));
  L.bezel.add(lathe([[0.84, 0.186], [0.8, 0.108]], M.brushed, 96));

  /* ---- Стекло: слегка выпуклый сапфир ---- */
  {
    const R = 5, th = Math.asin(0.84 / R);
    const geo = new THREE.SphereGeometry(R, seg(72), 6, 0, TAU, 0, th);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -R * Math.cos(th) + 0.205);
    const glass = new THREE.Mesh(geo, M.glass);
    glass.renderOrder = 5;
    L.crystal.add(glass);
  }

  /* ---- Циферблат ---- */
  const DIAL_R = 0.84;
  const DATE = { x: 0.5, y: -0.055, w: 0.14, h: 0.11 };
  const CROSS = { y: 0.4, s: 0.13 };   // накладной красный крест под «12»

  // Карта анизотропии: направление «шлифовки» радиальное → солнечные лучи
  const sunburst = (() => {
    const N = Q < 1 ? 192 : 256;
    const [c, g] = canvas(N);
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x / (N - 1) - 0.5, dy = 0.5 - y / (N - 1), l = Math.hypot(dx, dy) || 1;
      const i = (y * N + x) * 4;
      img.data[i] = (dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = tex(c, false);
    t.repeat.set(1 / (DIAL_R * 2), 1 / (DIAL_R * 2));
    t.offset.set(0.5, 0.5);
    return t;
  })();

  const DIALS = {
    noir: { base: '#0f1012', hi: '#2c3036', ink: '#f1eee6', accent: '#e0322a' },
    rouge: { base: '#8a1013', hi: '#c42820', ink: '#fbf6ef', accent: '#fbf6ef' },
    marine: { base: '#101e3c', hi: '#2f4c86', ink: '#eef1f6', accent: '#e0322a' },
    foret: { base: '#252d1f', hi: '#56634a', ink: '#efe9d6', accent: '#e0322a' },
    blanc: { base: '#d9d8d3', hi: '#fbfaf7', ink: '#17181b', accent: '#d0202e' }
  };
  const [dialC, dg] = canvas(texSize);
  const dialTex = tex(dialC);
  dialTex.repeat.set(1 / (DIAL_R * 2), 1 / (DIAL_R * 2));
  dialTex.offset.set(0.5, 0.5);

  const mix = (a, b, t) => {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return '#' + ca.lerp(cb, t).getHexString();
  };
  function drawDial(pal) {
    const S = texSize, k = S / (DIAL_R * 2);
    const P = (x, y) => [(x + DIAL_R) * k, (DIAL_R - y) * k];
    dg.save();
    dg.clearRect(0, 0, S, S);
    // база + мягкие лучи
    const rg = dg.createRadialGradient(S / 2, S / 2, S * 0.02, S / 2, S / 2, S * 0.5);
    rg.addColorStop(0, pal.hi); rg.addColorStop(0.55, mix(pal.base, pal.hi, 0.35)); rg.addColorStop(1, pal.base);
    dg.fillStyle = rg; dg.fillRect(0, 0, S, S);
    if (dg.createConicGradient) {
      const cg = dg.createConicGradient(0, S / 2, S / 2);
      for (let i = 0; i <= 12; i++) cg.addColorStop(i / 12, i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)');
      dg.fillStyle = cg; dg.fillRect(0, 0, S, S);
    }
    dg.translate(S / 2, S / 2);
    // минутная дорожка
    dg.strokeStyle = pal.ink;
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU, big = i % 5 === 0;
      const r1 = (big ? 0.765 : 0.79) * k, r2 = 0.825 * k;
      dg.lineWidth = (big ? 0.008 : 0.004) * k;
      dg.beginPath();
      dg.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1);
      dg.lineTo(Math.sin(a) * r2, -Math.cos(a) * r2);
      dg.stroke();
    }
    dg.lineWidth = 0.003 * k;
    dg.beginPath(); dg.arc(0, 0, 0.83 * k, 0, TAU); dg.stroke();
    // арабские цифры (на «3» — окно даты) и внутренняя шкала 13–24
    dg.fillStyle = pal.ink;
    dg.textAlign = 'center'; dg.textBaseline = 'middle';
    if ('letterSpacing' in dg) dg.letterSpacing = '0px';
    for (let i = 1; i <= 12; i++) {
      const a = i / 12 * TAU;
      if (i !== 3) {
        dg.font = `700 ${(i % 3 === 0 ? 0.135 : 0.105) * k}px Unbounded, Arial, sans-serif`;
        const r = (i % 3 === 0 ? 0.6 : 0.62) * k;
        dg.fillText(String(i), Math.sin(a) * r, -Math.cos(a) * r + 0.006 * k);
      }
      if (i !== 3 && i !== 12) {
        dg.font = `500 ${0.036 * k}px Onest, Arial, sans-serif`;
        dg.fillStyle = pal.accent;
        const r2 = 0.43 * k;
        dg.fillText(String(i + 12), Math.sin(a) * r2, -Math.cos(a) * r2);
        dg.fillStyle = pal.ink;
      }
    }
    dg.font = `700 ${0.05 * k}px Unbounded, Arial, sans-serif`;
    if ('letterSpacing' in dg) dg.letterSpacing = `${0.01 * k}px`;
    dg.fillText('KANTON', 0, -0.255 * k);
    dg.font = `500 ${0.024 * k}px Onest, Arial, sans-serif`;
    if ('letterSpacing' in dg) dg.letterSpacing = `${0.008 * k}px`;
    dg.fillText('AUTOMATIC', 0, 0.21 * k);
    dg.fillText('SWISS  MADE', 0, 0.745 * k);
    dg.fillStyle = pal.accent;
    dg.font = `600 ${0.022 * k}px Onest, Arial, sans-serif`;
    dg.fillText('100 M', 0, 0.255 * k);
    dg.restore();
    dialTex.needsUpdate = true;
  }

  const dialMat = new THREE.MeshPhysicalMaterial({
    map: dialTex, metalness: 0.3, roughness: 0.4, anisotropy: 0.55, anisotropyMap: sunburst, clearcoat: 0.5, clearcoatRoughness: 0.2
  });
  {
    const s = circlePath(new THREE.Shape(), 0, 0, DIAL_R);
    const dh = new THREE.Path();
    dh.moveTo(DATE.x, DATE.y); dh.lineTo(DATE.x, DATE.y + DATE.h); dh.lineTo(DATE.x + DATE.w, DATE.y + DATE.h); dh.lineTo(DATE.x + DATE.w, DATE.y); dh.closePath();
    s.holes.push(dh);
    const dial = extrude(s, 0.012, dialMat, 0);
    dial.position.z = 0.088;
    L.dial.add(dial);
  }
  // Полированные ободки окон
  const ring = (x, y, r1, r2, z = 0.101) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, seg(64)), M.polished);
    m.position.set(x, y, z);
    L.dial.add(m);
  };
  {
    const s = roundedRect(new THREE.Shape(), DATE.x - 0.016, DATE.y - 0.016, DATE.w + 0.032, DATE.h + 0.032, 0.012);
    const h = new THREE.Path();
    h.moveTo(DATE.x, DATE.y); h.lineTo(DATE.x + DATE.w, DATE.y); h.lineTo(DATE.x + DATE.w, DATE.y + DATE.h); h.lineTo(DATE.x, DATE.y + DATE.h); h.closePath();
    s.holes.push(h);
    const f = extrude(s, 0.008, M.polished, 0.002);
    f.position.z = 0.1;
    L.dial.add(f);
  }

  // Накладные точки-индексы на минутной дорожке и красный крест
  {
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 0.016, seg(20)).rotateX(Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      if (i === 3) continue;
      const a = i / 12 * TAU, r = 0.78;
      const m = new THREE.Mesh(geo, M.polished);
      m.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.106);
      const lume = new THREE.Mesh(new THREE.CircleGeometry(0.015, seg(16)), M.lume);
      lume.position.set(m.position.x, m.position.y, 0.1145);
      L.dial.add(m, lume);
    }
    const plate = extrude(roundedRect(new THREE.Shape(), -CROSS.s / 2, -CROSS.s / 2, CROSS.s, CROSS.s, 0.022), 0.012, M.red, 0.004);
    plate.position.set(0, CROSS.y, 0.1);
    const bar = CROSS.s * 0.19, len = CROSS.s * 0.62;
    const cs = new THREE.Shape();
    [[-bar / 2, len / 2], [bar / 2, len / 2], [bar / 2, bar / 2], [len / 2, bar / 2], [len / 2, -bar / 2], [bar / 2, -bar / 2], [bar / 2, -len / 2], [-bar / 2, -len / 2], [-bar / 2, -bar / 2], [-len / 2, -bar / 2], [-len / 2, bar / 2], [-bar / 2, bar / 2]]
      .forEach(([x, y], i) => (i ? cs.lineTo(x, y) : cs.moveTo(x, y)));
    cs.closePath();
    const cross = extrude(cs, 0.006, M.polished, 0.0015);
    cross.position.set(0, CROSS.y, 0.117);
    L.dial.add(plate, cross);
    M.crossShape = cs;
  }

  // Диск даты
  {
    const [c, g] = canvas(128, 100);
    g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, 128, 100);
    g.fillStyle = '#16181b'; g.font = '600 64px Onest, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(new Date().getDate()), 64, 54);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(DATE.w + 0.03, DATE.h + 0.02), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.5 }));
    m.position.set(DATE.x + DATE.w / 2, DATE.y + DATE.h / 2, 0.084);
    L.dial.add(m);
  }

  /* ---- Стрелки (дофин, гранёные) ---- */
  function dauphine(len, w, tail, h = 0.012) {
    const A = [0, len, 0], B = [0, -tail, 0], C = [w, 0, 0], D = [-w, 0, 0], E = [0, 0, h];
    const tri = [A, E, C, E, B, C, A, D, E, E, D, B, A, C, B, A, B, D].flat();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    geo.computeVertexNormals();
    return geo;
  }
  const hand = (len, w, tail, z) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(dauphine(len, w, tail), M.polished));
    const lume = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, len * 0.62), M.lume);
    lume.position.set(0, len * 0.42, 0.0125);
    g.add(lume);
    g.position.z = z;
    return g;
  };
  const hourHand = hand(0.46, 0.055, 0.1, 0.128);
  L.hour.add(hourHand);
  const minHand = hand(0.7, 0.045, 0.12, 0.142);
  L.min.add(minHand);
  const secHand = new THREE.Group();
  {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.92, 0.006), M.red);
    bar.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.007), M.lume);
    tip.position.y = 0.68;
    const cw = extrude(M.crossShape, 0.006, M.red, 0);
    cw.scale.setScalar(0.85);
    cw.position.set(0, -0.15, -0.003);
    const cap = cyl(0.026, 0.02, M.red);
    cap.position.z = 0.006;
    secHand.add(bar, tip, cw, cap);
    secHand.position.z = 0.156;
  }
  L.sec.add(secHand);

  /* ---- Механизм ---- */
  // основная платина (видна сквозь открытое сердце и задний сапфир)
  {
    const plate = cyl(0.83, 0.05, M.plate, 96);
    plate.position.z = -0.085;
    L.plate.add(plate);
  }
  // баланс: обод, спицы, спираль
  const balance = new THREE.Group();
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 10, seg(64)), M.gold);
    balance.add(rim);
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.26, 0.01), M.gold);
      sp.rotation.z = i / 3 * TAU;
      balance.add(sp);
    }
    for (let i = 0; i < 8; i++) {
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10).rotateZ(Math.PI / 2), M.gold);
      const a = i / 8 * TAU;
      sc.position.set(Math.cos(a) * 0.147, Math.sin(a) * 0.147, 0);
      sc.rotation.z = a;
      balance.add(sc);
    }
    const pts = [];
    for (let i = 0; i < 220; i++) { const a = i / 220 * TAU * 6; const r = 0.02 + i / 220 * 0.075; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.012)); }
    const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg(260), 0.0022, 4), M.blued);
    balance.add(spring);
    // баланс виден сквозь задний сапфир, рядом с анкерным колесом
    const BAL = { x: -0.36, y: -0.36 };
    balance.position.set(BAL.x, BAL.y, -0.14);
    L.gears.add(balance);
    // мост баланса (балансовый кок) поверх
    const br = extrude(blob([[-0.26, -0.045], [0.0, -0.028], [0.26, -0.045], [0.26, 0.045], [0, 0.028], [-0.26, 0.045]], 0.02), 0.014, M.polished, 0.003);
    br.position.set(BAL.x, BAL.y, -0.168);
    br.rotation.z = -0.75;
    L.bridges.add(br);
    const jw = cyl(0.016, 0.012, M.ruby, 16);
    jw.position.set(BAL.x, BAL.y, -0.176);
    L.bridges.add(jw);
  }

  // шестерни колёсной передачи (вид с обратной стороны)
  function gearShape(n, ro, rr, hole, spokes) {
    const s = new THREE.Shape(), step = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const pts = [[rr, a], [ro, a + step * 0.18], [ro, a + step * 0.42], [rr, a + step * 0.6]];
      pts.forEach(([r, t], j) => { const x = Math.cos(t) * r, y = Math.sin(t) * r; (i === 0 && j === 0) ? s.moveTo(x, y) : s.lineTo(x, y); });
    }
    s.closePath();
    const rin = rr * 0.8, rh = hole + 0.035;
    if (spokes && rin - rh > 0.03) {
      const gap = 0.022 / rin + 0.12;
      for (let k = 0; k < spokes; k++) {
        const a1 = k / spokes * TAU + gap, a2 = (k + 1) / spokes * TAU - gap;
        const p = new THREE.Path();
        p.absarc(0, 0, rin, a1, a2, false);
        p.absarc(0, 0, rh, a2 - 0.05, a1 + 0.05, true);
        p.closePath();
        s.holes.push(p);
      }
    }
    s.holes.push(circlePath(new THREE.Path(), 0, 0, hole, true));
    return s;
  }
  const gears = [];
  [
    { n: 72, r: 0.3, x: -0.32, y: 0.26, sp: 0.04, mat: M.brass, spokes: 5 },     // барабан
    { n: 60, r: 0.22, x: 0.02, y: 0.02, sp: -0.12, mat: M.brass, spokes: 4 },     // центральное
    { n: 48, r: 0.16, x: 0.33, y: 0.24, sp: 0.5, mat: M.gold, spokes: 4 },        // третье
    { n: 42, r: 0.14, x: 0.38, y: -0.14, sp: -1.2, mat: M.brass, spokes: 4 },     // секундное
    { n: 20, r: 0.085, x: 0.14, y: -0.36, sp: 3.4, mat: M.blued, spokes: 0 }      // анкерное
  ].forEach((d) => {
    const m = extrude(gearShape(seg(d.n), d.r, d.r - 0.018, 0.02, d.spokes), 0.018, d.mat, 0.002);
    m.position.set(d.x, d.y, -0.135);
    m.userData.sp = d.sp;
    L.gears.add(m);
    gears.push(m);
    const pin = cyl(0.03, 0.03, M.polished, 16);
    pin.position.set(d.x, d.y, -0.125);
    L.gears.add(pin);
  });

  // мосты с полосами и рубинами
  const bridgeMat = new THREE.MeshPhysicalMaterial({ color: '#d4d6da', metalness: 1, roughness: 0.3, map: stripes });
  {
    const b1 = extrude(blob([[-0.66, 0.1], [-0.5, 0.62], [-0.08, 0.56], [0.08, 0.2], [-0.2, -0.02]], 0.12), 0.026, bridgeMat, 0.006);
    const b2 = extrude(blob([[0.1, 0.42], [0.62, 0.38], [0.66, -0.22], [0.36, -0.46], [0.02, -0.5], [0.16, -0.12]], 0.1), 0.026, bridgeMat, 0.006);
    [b1, b2].forEach((b) => { b.position.z = -0.17; L.bridges.add(b); });
    const pivots = [[-0.32, 0.26], [0.02, 0.02], [0.33, 0.24], [0.38, -0.14], [0.14, -0.36], [-0.5, 0.42], [0.55, 0.05]];
    pivots.forEach(([x, y], i) => {
      const chaton = cyl(0.03, 0.01, M.gold, 20);
      chaton.position.set(x, y, -0.178);
      const j = cyl(0.016, 0.012, M.ruby, 16);
      j.position.set(x, y, -0.182);
      L.bridges.add(chaton, j);
      if (i >= 5) {
        const sc = cyl(0.028, 0.012, M.blued, 20);
        sc.position.set(x, y, -0.182);
        L.bridges.add(sc);
      }
    });
    [[-0.58, 0.18], [0.5, 0.32], [0.2, -0.44], [-0.2, 0.5]].forEach(([x, y]) => {
      const sc = cyl(0.026, 0.012, M.blued, 20);
      sc.position.set(x, y, -0.18);
      L.bridges.add(sc);
    });
  }

  // ротор с гравировкой
  const rotor = new THREE.Group();
  {
    const [c, g] = canvas(texSize);
    const S = texSize, k = S / 1.6;
    g.drawImage(stripes.image, 0, 0, S, S);
    g.fillStyle = 'rgba(70,52,20,.85)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${0.045 * k}px Onest, Arial, sans-serif`;
    const text = 'KANTON · CALIBRE K-28 · 26 JEWELS';
    const r = 0.56 * k;
    const span = 2.1;
    for (let i = 0; i < text.length; i++) {
      const a = Math.PI / 2 + span / 2 - (i / (text.length - 1)) * span;
      g.save();
      g.translate(S / 2 + Math.cos(a) * r, S / 2 - Math.sin(a) * r);
      g.rotate(Math.PI / 2 - a);
      g.fillText(text[i], 0, 0);
      g.restore();
    }
    const t = tex(c);
    t.repeat.set(1 / 1.6, 1 / 1.6);
    t.offset.set(0.5, 0.5);
    const rotorMat = new THREE.MeshPhysicalMaterial({ color: '#f0d39a', metalness: 1, roughness: 0.26, map: t });
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.79, 0, Math.PI, false);
    s.absarc(0, 0, 0.11, Math.PI, 0, true);
    s.closePath();
    const win = new THREE.Path();
    win.absarc(0, 0, 0.66, 0.5, Math.PI - 0.5, false);
    win.absarc(0, 0, 0.36, Math.PI - 0.6, 0.6, true);
    win.closePath();
    s.holes.push(win);
    const body = extrude(s, 0.022, rotorMat, 0.005);
    body.position.z = -0.205;
    rotor.add(body);
    const hub = cyl(0.12, 0.03, M.polished, 32);
    hub.position.z = -0.205;
    const screw = cyl(0.045, 0.012, M.blued, 20);
    screw.position.z = -0.222;
    rotor.add(hub, screw);
    L.rotor.add(rotor);
  }

  /* ---- Задняя крышка с сапфиром ---- */
  L.back.add(lathe([[0.7, -0.214], [0.7, -0.29], [0.745, -0.306], [0.9, -0.301], [0.952, -0.262], [0.962, -0.222], [0.95, -0.214]], M.polished));
  {
    const g = new THREE.Mesh(new THREE.CircleGeometry(0.705, seg(64)), M.glass);
    g.rotation.y = Math.PI;
    g.position.z = -0.29;
    g.renderOrder = 5;
    L.back.add(g);
  }

  /* ---- Ремешки: стальной браслет, кожа, NATO, каучук ----
     Все огибают «запястье» — эллипс в плоскости YZ через концы ушек.
     Каждый ремешок умеет «наматываться»: при уровне k от 0 до 1 он вырастает от ушек к застёжке. */
  const band = new THREE.Group();
  root.add(band);
  const WR = { lugY: 1.2, lugZ: -0.055, A: 1.36, B: 1.22 };
  WR.th0 = Math.asin(WR.lugY / WR.A);
  WR.zc = WR.lugZ - WR.B * Math.cos(WR.th0);
  const onWrist = (t) => new THREE.Vector2(WR.A * Math.sin(t), WR.zc + WR.B * Math.cos(t));
  const wristC = new THREE.Vector2(0, WR.zc);

  // Ломаная → n+1 точек на равных расстояниях
  function resample(pts, n) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[cum.length - 1], out = [];
    let j = 1;
    for (let i = 0; i <= n; i++) {
      const s = i / n * total;
      while (j < pts.length - 1 && cum[j] < s) j++;
      const f = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
      out.push(pts[j - 1].clone().lerp(pts[j], f));
    }
    out.total = total;
    return out;
  }
  const arc = (t0, t1, n = 200) => Array.from({ length: n + 1 }, (_, i) => onWrist(t0 + (t1 - t0) * i / n));

  // Лента вдоль пути (y, z): сечение — прямоугольник width × thick, толщина уходит к запястью.
  // Индексы идут сегмент за сегментом, поэтому drawRange «наматывает» ленту от начала пути.
  function ribbon(path, segs, width, thick, uLen = 0.5) {
    const P = resample(path, segs);
    const pos = [], nor = [], uv = [], idx = [];
    const n2 = new THREE.Vector2(), t2 = new THREE.Vector2();
    let s = 0;
    for (let i = 0; i <= segs; i++) {
      if (i > 0) s += P[i].distanceTo(P[i - 1]);
      t2.subVectors(P[Math.min(segs, i + 1)], P[Math.max(0, i - 1)]).normalize();
      n2.set(-t2.y, t2.x);
      if (n2.dot(new THREE.Vector2().subVectors(P[i], wristC)) < 0) n2.negate();
      const w = typeof width === 'function' ? width(i / segs) : width;
      const y = P[i].x, z = P[i].y, iy = y - n2.x * thick, iz = z - n2.y * thick, u = s / uLen;
      // 4 стороны × 2 вершины: верх, низ, левый и правый торец
      const v = [
        [-w / 2, y, z, 0, n2.x, n2.y, u, 0], [w / 2, y, z, 0, n2.x, n2.y, u, 1],
        [-w / 2, iy, iz, 0, -n2.x, -n2.y, u, 0], [w / 2, iy, iz, 0, -n2.x, -n2.y, u, 1],
        [-w / 2, y, z, -1, 0, 0, u, 0.02], [-w / 2, iy, iz, -1, 0, 0, u, 0.0],
        [w / 2, y, z, 1, 0, 0, u, 0.98], [w / 2, iy, iz, 1, 0, 0, u, 1.0]
      ];
      v.forEach((q) => { pos.push(q[0], q[1], q[2]); nor.push(q[3], q[4], q[5]); uv.push(q[6], q[7]); });
      if (i > 0) {
        const a = (i - 1) * 8, b = i * 8;
        for (let f = 0; f < 4; f++) {
          const p = a + f * 2, q = b + f * 2;
          idx.push(p, p + 1, q, p + 1, q + 1, q);
        }
      }
    }
    // обход треугольников согласуем с нормалями — тогда хватает FrontSide
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), vn = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
      va.fromArray(pos, a * 3); vb.fromArray(pos, b * 3).sub(va); vc.fromArray(pos, c * 3).sub(va);
      vn.fromArray(nor, a * 3);
      if (vb.cross(vc).dot(vn) < 0) { idx[i + 1] = c; idx[i + 2] = b; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.userData.segs = segs;
    return g;
  }

  // Текстуры ремешков
  const strapTex = (draw, w = 512, h = 128) => {
    const [c, g] = canvas(w, h);
    draw(g, w, h);
    const t = tex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const grain = (g, w, h, a, n) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,240,220,${a * 0.6})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  };
  const leatherMap = strapTex((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a1308'); gr.addColorStop(0.08, '#5a2c13'); gr.addColorStop(0.5, '#6b3518'); gr.addColorStop(0.92, '#5a2c13'); gr.addColorStop(1, '#2a1308');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    grain(g, w, h, 0.12, 9000);
    g.strokeStyle = '#efe1c2'; g.lineWidth = 3; g.lineCap = 'round';
    for (const y of [h * 0.14, h * 0.86]) for (let x = 6; x < w; x += 22) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y); g.stroke(); }
  });
  const natoMap = strapTex((g, w, h) => {
    g.fillStyle = '#b5151b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2efe8'; g.fillRect(0, h * 0.38, w, h * 0.24);
    for (let x = 0; x < w; x += 3) { g.fillStyle = x % 6 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.06)'; g.fillRect(x, 0, 1.5, h); }
    for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, y, w, 1); }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  }, 256, 128);
  const rubberMap = strapTex((g, w, h) => {
    g.fillStyle = '#141517'; g.fillRect(0, 0, w, h);
    // рельеф: мелкие кресты в шахматном порядке
    for (let x = 10; x < w; x += 32) for (let y = 24; y < h - 16; y += 40) {
      const ox = (Math.round(y / 40) % 2) * 16;
      g.fillStyle = '#26282c'; g.fillRect(x + ox - 6, y - 2, 12, 4); g.fillRect(x + ox - 2, y - 6, 4, 12);
    }
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  }, 256, 128);

  const SM = {
    leather: new THREE.MeshPhysicalMaterial({ map: leatherMap, roughness: 0.52, sheen: 0.25, sheenColor: '#ffcf9e', sheenRoughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    nato: new THREE.MeshPhysicalMaterial({ map: natoMap, roughness: 0.85, sheen: 1, sheenColor: '#ffffff', sheenRoughness: 0.45 }),
    rubber: new THREE.MeshPhysicalMaterial({ map: rubberMap, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.45 })
  };

  const STRAPS = {};
  const strapGroup = (key) => { const g = new THREE.Group(); g.userData.parts = []; band.add(g); STRAPS[key] = g; return g; };
  const RSEG = Q < 1 ? 46 : 72;

  // Стальной браслет: звенья упорядочены «от обоих ушек к застёжке», так их count тоже наматывает браслет
  {
    const g = strapGroup('steel');
    const pts = resample(arc(WR.th0, TAU - WR.th0, 600), 600);
    const N = Q < 1 ? 22 : 26;
    const pitch = pts.total / N;
    const link = (w) => {
      const s = roundedRect(new THREE.Shape(), -w / 2, -pitch * 0.45, w, pitch * 0.9, Math.min(0.035, w * 0.25));
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.012, bevelSegments: 3 });
      geo.translate(0, 0, -0.076);
      return geo;
    };
    const centre = new THREE.InstancedMesh(link(0.32), M.polished, N);
    const outer = new THREE.InstancedMesh(link(0.26), M.brushed, N * 2);
    const order = [];
    for (let a = 0, b = N - 1; a <= b; a++, b--) { order.push(a); if (b !== a) order.push(b); }
    const mtx = new THREE.Matrix4(), X = new THREE.Vector3(1, 0, 0), T = new THREE.Vector3(), Nn = new THREE.Vector3();
    order.forEach((li, slot) => {
      const c = pts[Math.round((li + 0.5) / N * 600)];
      const t = Math.atan2(c.x / WR.A, (c.y - WR.zc) / WR.B);
      T.set(0, WR.A * Math.cos(t), -WR.B * Math.sin(t)).normalize();
      Nn.crossVectors(X, T);
      mtx.makeBasis(X, T, Nn).setPosition(0, c.x, c.y);
      centre.setMatrixAt(slot, mtx);
      for (const sx of [-1, 1]) {
        const m2 = mtx.clone();
        m2.setPosition(sx * 0.3, c.x - Nn.y * 0.008, c.y - Nn.z * 0.008);
        outer.setMatrixAt(slot * 2 + (sx > 0 ? 1 : 0), m2);
      }
    });
    g.add(centre, outer);
    g.userData.set = (k) => {
      const n = Math.round(N * k);
      centre.count = n; outer.count = n * 2;
    };
  }

  // Пряжка на «изнанке» запястья (θ = π): рамка, язычок и шлёвка
  function buckle(g, width) {
    const b = new THREE.Group();
    const s = roundedRect(new THREE.Shape(), -width / 2 - 0.07, -0.13, width + 0.14, 0.26, 0.07);
    s.holes.push(roundedRect(new THREE.Path(), -width / 2 - 0.015, -0.085, width + 0.03, 0.17, 0.04));
    const frame = extrude(s, 0.035, M.polished, 0.008);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.03), M.polished);
    tongue.position.set(0, 0.0, 0.03);
    const keeper = extrude((() => {
      const k = roundedRect(new THREE.Shape(), -width / 2 - 0.025, -0.035, width + 0.05, 0.07, 0.02);
      return k;
    })(), 0.03, M.brushed, 0.006);
    keeper.position.y = 0.32;
    b.add(frame, tongue, keeper);
    b.position.set(0, 0, WR.zc - WR.B - 0.035);
    b.rotation.x = Math.PI;
    g.add(b);
    g.userData.buckle = b;
  }

  // Ленточные ремешки из двух половин: от каждого ушка к пряжке
  function ribbonStrap(key, mat, width, thick, extra) {
    const g = strapGroup(key);
    const halves = [];
    for (const sign of [1, -1]) {
      let path = arc(sign > 0 ? WR.th0 : TAU - WR.th0, Math.PI, 160);
      if (extra) path = extra(sign).concat(path);
      const geo = ribbon(path, RSEG, width, thick);
      const m = new THREE.Mesh(geo, mat);
      g.add(m);
      halves.push(m);
    }
    buckle(g, typeof width === 'function' ? width(1) : width);
    g.userData.set = (k) => {
      for (const m of halves) m.geometry.setDrawRange(0, Math.round(m.geometry.userData.segs * k) * 24);
      const bk = Math.min(1, Math.max(0, (k - 0.85) / 0.15));
      g.userData.buckle.visible = bk > 0.01;
      g.userData.buckle.scale.setScalar(0.6 + 0.4 * bk);
    };
    return g;
  }
  ribbonStrap('leather', SM.leather, (t) => 0.9 - 0.14 * t, 0.075);
  ribbonStrap('rubber', SM.rubber, 0.9, 0.09);
  // NATO проходит под корпусом и огибает шпильки ушек
  ribbonStrap('nato', SM.nato, 0.82, 0.035, (sign) => [
    new THREE.Vector2(0, -0.35), new THREE.Vector2(sign * 0.95, -0.35), new THREE.Vector2(sign * 1.16, -0.29),
    new THREE.Vector2(sign * 1.27, -0.17), new THREE.Vector2(sign * 1.22, -0.08)
  ]);

  /* ------------------------------ Анимация ------------------------------ */
  let explode = 0, rotorA = 0, rotorV = 0.25, bandK = 1, dialPal = DIALS.noir;
  const ease = (t) => t * t * (3 - 2 * t);
  const strapLv = { steel: 1, leather: 0, nato: 0, rubber: 0 };

  function setExplode(k) {
    explode = k;
    const e = ease(Math.min(1, Math.max(0, k)));
    for (const name in layers) {
      const g = layers[name];
      g.position.z = g.userData.offset * e;
      // слои чуть «расправляются» веером
      g.rotation.z = g.userData.offset * e * 0.18;
    }
  }
  function applyStraps() {
    for (const key in STRAPS) {
      const k = Math.min(1, Math.max(0, (strapLv[key] || 0) * bandK));
      const g = STRAPS[key];
      g.visible = k > 0.005;
      if (g.visible) g.userData.set(k);
    }
  }
  // k — общий множитель (на разнесённом механизме ремешок сматывается)
  function setBand(k) {
    if (Math.abs(k - bandK) < 1e-3) return;
    bandK = k;
    applyStraps();
  }
  // уровни ремешков { steel, leather, nato, rubber }, каждый 0…1
  function setStraps(lv) {
    let changed = false;
    for (const key in strapLv) {
      const v = lv[key] || 0;
      if (Math.abs(v - strapLv[key]) > 1e-3) { strapLv[key] = v; changed = true; }
    }
    if (changed) applyStraps();
  }

  // Время показываем живое: часы и минуты плавно, секундная — 8 полушагов в секунду (28 800 пк/ч)
  function update(now, dt, kick = 0) {
    const d = new Date();
    const ms = d.getMilliseconds();
    const s = d.getSeconds() + Math.floor(ms / 125) / 8;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    secHand.rotation.z = -s / 60 * TAU;
    minHand.rotation.z = -m / 60 * TAU;
    hourHand.rotation.z = -h / 12 * TAU;
    balance.rotation.z = Math.sin(now * TAU * 4) * 2.2;
    for (const g of gears) g.rotation.z += g.userData.sp * dt * (1 + explode * 2);
    // ротор: подзавод от движения (скролла), потом мягко затухает
    rotorV += kick;
    rotorV += (0.25 - rotorV) * Math.min(1, dt * 1.2);
    rotorA += rotorV * dt;
    rotor.rotation.z = rotorA;
  }

  let dialTween = null;
  function setDial(key, animate = true) {
    const to = DIALS[key];
    if (!to) return;
    const from = dialPal;
    dialPal = to;
    if (!animate || !window.gsap) { drawDial(to); return; }
    if (dialTween) dialTween.kill();
    const o = { t: 0 };
    dialTween = window.gsap.to(o, {
      t: 1, duration: 0.7, ease: 'power2.inOut',
      onUpdate: () => drawDial({ base: mix(from.base, to.base, o.t), hi: mix(from.hi, to.hi, o.t), ink: o.t < 0.5 ? from.ink : to.ink, accent: to.accent })
    });
  }
  drawDial(dialPal);
  setExplode(0);
  applyStraps();

  return { root, head, band, update, setExplode, setBand, setStraps, straps: Object.keys(STRAPS), setDial, dials: Object.keys(DIALS), redraw: () => drawDial(dialPal), materials: M };
};
