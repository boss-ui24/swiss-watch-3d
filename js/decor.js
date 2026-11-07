/* KANTON — декор: бегущие строки и печати (ускоряются и разворачиваются от скролла),
   кольцо-шкала вокруг часов, выноски к деталям 3D-модели с размерной линией,
   шкала прогресса справа, свой курсор и зерно бумаги.
   Всё, что привязано к часам, берёт координаты из scene.project() после отрисовки кадра. */
window.KantonDecor = function (opts) {
  'use strict';

  const { scene, fine = false, reduced = false } = opts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const html = document.documentElement;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  /* ---------- Зерно бумаги: маленькая плитка шума под сеткой из плюсов ---------- */
  {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d'), img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 13;
    }
    g.putImageData(img, 0, 0);
    html.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
  }

  /* ---------- Скорость скролла: общая для строк и печатей ---------- */
  const vel = ScrollTrigger.create({ start: 0, end: 'max' });
  let boost = 1, dir = 1;

  /* ---------- Бегущие строки ---------- */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { e.target.__on = e.isIntersecting; })) : null;
  const loops = $$('[data-marquee]').map((el) => {
    const track = $('.marquee__track', el);
    track.innerHTML += track.innerHTML; // вторая копия для бесшовного круга
    el.__on = !io;
    if (io) io.observe(el);
    return { el, track, speed: 50 / (+el.dataset.speed || 36), sign: el.dataset.marquee === 'rev' ? -1 : 1, pos: Math.random() * 50 };
  });

  /* ---------- Печати ---------- */
  // крутим только те, что на экране: лишние изменения во время скролла на телефоне трясут липкие секции
  const seals = $$('.seal__text').map((el) => {
    el.__on = !io;
    if (io) io.observe(el);
    return { el, a: Math.random() * 360 };
  });

  /* ---------- Кольцо-шкала ---------- */
  const ring = $('[data-ring]'), ringScale = $('[data-ring-scale]'), ringSec = $('[data-ring-sec]');
  if (ring) {
    svg('circle', { class: 'ring__c', cx: 500, cy: 500, r: 490, 'stroke-opacity': 0.45 }, ringScale);
    svg('circle', { class: 'ring__c', cx: 500, cy: 500, r: 396, 'stroke-opacity': 0.3, 'stroke-dasharray': '2 9' }, ringScale);
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU, big = i % 5 === 0, r1 = big ? 450 : 470, r2 = 490;
      svg('line', {
        x1: 500 + Math.sin(a) * r1, y1: 500 - Math.cos(a) * r1, x2: 500 + Math.sin(a) * r2, y2: 500 - Math.cos(a) * r2,
        'stroke-opacity': big ? 0.75 : 0.35
      }, ringScale);
      if (big) {
        const t = svg('text', { x: 500 + Math.sin(a) * 423, y: 500 - Math.cos(a) * 423, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, ringScale);
        t.textContent = String(i === 0 ? 60 : i).padStart(2, '0');
      }
    }
  }
  const c0 = {}, c1 = {};
  let ringOn = false;
  function updateRing(y) {
    if (!ring || !scene) return;
    const w = clamp(1 - y / (innerHeight * 0.65), 0, 1) * smooth(clamp(scene.intro.k * 1.4 - 0.3, 0, 1));
    if (w <= 0.001) {
      if (ringOn) { ring.style.opacity = 0; ringOn = false; }
      return;
    }
    ringOn = true;
    scene.project(0, 0, 0, c0);
    scene.project(0, 1, 0, c1);
    const r = Math.hypot(c1.x - c0.x, c1.y - c0.y);
    const s = r * 3.3 / 1000 * (1 + (1 - w) * 0.35);
    ring.style.transform = `translate3d(${(c0.x - 500).toFixed(1)}px, ${(c0.y - 500).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    ring.style.opacity = (w * 0.9).toFixed(3);
    ringScale.setAttribute('transform', `rotate(${(y * 0.05).toFixed(2)} 500 500)`);
    // красная точка обходит шкалу ровно за минуту — секундная стрелка страницы
    ringSec.setAttribute('transform', `rotate(${((Date.now() / 1000) % 60 * 6).toFixed(2)} 500 500)`);
  }

  /* ---------- Выноски к деталям (секция «42MM») ---------- */
  const callouts = $('[data-callouts]'), csvg = $('[data-callouts-svg]');
  // p — точка на модели, d — смещение подписи в пикселях.
  // На телефоне подписи рядом с часами не помещаются (там есть таблица характеристик) — остаётся только размерная линия
  const CALL = {
    crown: { p: [1.22, 0, -0.04], d: [200, -110] },
    back: { p: [0, -0.42, -0.3], d: [190, 34] },
    lug: { p: [0.53, -1.2, -0.05], d: [150, 104] }
  };
  let dimPath = null, dimText = null;
  if (callouts) {
    for (const k in CALL) {
      const C = CALL[k];
      C.path = svg('path', { class: 'lead-line', pathLength: 1, 'stroke-dasharray': 1 }, csvg);
      C.dot = svg('circle', { class: 'dot', r: 0 }, csvg);
      C.label = $(`[data-callout="${k}"]`, callouts);
      C.pt = {};
    }
    dimPath = svg('path', { class: 'dim', pathLength: 1, 'stroke-dasharray': 1 }, csvg);
    dimText = svg('text', { class: 'dim-text', 'text-anchor': 'middle' }, csvg);
    dimText.textContent = 'Ø 42.0 MM';
  }
  const DA = {}, DB = {};
  let callOn = false, profileAt = null;
  function updateCallouts(y) {
    if (!callouts || !scene || profileAt === null) return;
    const w = clamp(1 - Math.abs(y - profileAt) / (innerHeight * 0.55), 0, 1);
    if (w <= 0.001) {
      if (callOn) { callouts.classList.remove('is-on'); callOn = false; }
      return;
    }
    if (!callOn) { callouts.classList.add('is-on'); callOn = true; }
    const draw = smooth(clamp((w - 0.15) / 0.55, 0, 1)), show = smooth(clamp((w - 0.45) / 0.4, 0, 1));
    const mob = scene.narrow;
    for (const k in CALL) {
      const C = CALL[k];
      if (mob) {
        if (C.shown) { C.shown = false; C.path.style.strokeDashoffset = 1; C.dot.setAttribute('r', 0); C.label.style.opacity = 0; }
        continue;
      }
      C.shown = true;
      const p = scene.project(C.p[0], C.p[1], C.p[2], C.pt);
      const [dx, dy] = C.d;
      const ex = p.x + dx, ey = p.y + dy, mx = p.x + dx * 0.4;
      C.path.setAttribute('d', `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${mx.toFixed(1)} ${ey.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`);
      C.path.style.strokeDashoffset = 1 - draw;
      C.dot.setAttribute('cx', p.x.toFixed(1));
      C.dot.setAttribute('cy', p.y.toFixed(1));
      C.dot.setAttribute('r', (4 * draw).toFixed(2));
      C.label.style.transform = `translate3d(${(ex + (dx < 0 ? -4 : 4)).toFixed(1)}px, ${ey.toFixed(1)}px, 0) translate(${dx < 0 ? '-100%' : '0'}, -50%)`;
      C.label.style.opacity = show.toFixed(3);
      C.label.classList.toggle('is-left', dx < 0);
    }
    // размерная линия диаметра — параллельно оси корпуса, со стороны циферблата
    const a = scene.project(0, 1.0, 0.21, DA), b = scene.project(0, -1.0, 0.21, DB);
    let ux = b.x - a.x, uy = b.y - a.y;
    const len = Math.hypot(ux, uy) || 1;
    ux /= len; uy /= len;
    let nx = -uy, ny = ux;
    if (nx > 0) { nx = -nx; ny = -ny; }
    const off = mob ? 34 : 70, t = 7;
    const ax = a.x + nx * off, ay = a.y + ny * off, bx = b.x + nx * off, by = b.y + ny * off;
    dimPath.setAttribute('d', `M${(ax - nx * t).toFixed(1)} ${(ay - ny * t).toFixed(1)}L${(ax + nx * t).toFixed(1)} ${(ay + ny * t).toFixed(1)}` +
      `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}` +
      `M${(bx - nx * t).toFixed(1)} ${(by - ny * t).toFixed(1)}L${(bx + nx * t).toFixed(1)} ${(by + ny * t).toFixed(1)}`);
    dimPath.style.strokeDashoffset = 1 - draw;
    const ang = Math.atan2(uy, ux) * 180 / Math.PI - 180;
    dimText.setAttribute('transform', `translate(${((ax + bx) / 2 + nx * 14).toFixed(1)} ${((ay + by) / 2 + ny * 14).toFixed(1)}) rotate(${ang.toFixed(1)})`);
    dimText.style.opacity = show.toFixed(3);
  }

  /* ---------- Шкала скролла справа ---------- */
  const track = $('[data-track]'), hand = $('[data-track-hand]'), num = $('[data-track-num]');
  if (track) {
    const ticks = $('[data-track-ticks]');
    for (let i = 0; i <= 60; i++) {
      const t = document.createElement('i');
      if (i % 5 === 0) t.className = 'is-5';
      t.style.top = (i / 60 * 100) + '%';
      ticks.appendChild(t);
    }
  }
  let trackH = 0, sectionTops = [], lastNum = '', lastHand = -1;
  function refresh(anchors) {
    const p = anchors && anchors.find((a) => a.name === 'profile');
    profileAt = p ? p.at : null;
    trackH = track ? track.clientHeight : 0;
    sectionTops = $$('[data-pose]').map((s) => s.getBoundingClientRect().top + window.scrollY);
  }
  function updateTrack(y) {
    if (!track || !trackH) return;
    const max = ScrollTrigger.maxScroll(window) || 1;
    const hy = Math.round(clamp(y / max, 0, 1) * trackH);
    if (hy !== lastHand) { lastHand = hy; hand.style.transform = `translate3d(0, ${hy}px, 0)`; }
    let i = 0;
    while (i < sectionTops.length - 1 && sectionTops[i + 1] <= y + innerHeight * 0.5) i++;
    const n = String(i + 1).padStart(2, '0');
    if (n !== lastNum) { lastNum = n; num.textContent = n; }
  }

  /* ---------- Тень от часов только на светлом фоне ---------- */
  const gl = $('#gl');
  const shadowOK = fine && innerWidth > 900;
  let shadowOn = false;
  function updateShadow(dark) {
    const on = shadowOK && dark < 0.5;
    if (on !== shadowOn) { shadowOn = on; gl.classList.toggle('has-shadow', on); }
  }

  /* ---------- Курсор ---------- */
  const cur = { x: -100, y: -100, rx: -100, ry: -100, ring: null, dot: null };
  if (fine && !reduced) {
    const mk = (cls) => { const d = document.createElement('div'); d.className = cls + ' is-hidden'; d.appendChild(document.createElement('i')); document.body.appendChild(d); return d; };
    cur.ring = mk('cursor');
    cur.dot = mk('cursor-dot');
    html.classList.add('has-cursor');
    const show = (on) => { cur.ring.classList.toggle('is-hidden', !on); cur.dot.classList.toggle('is-hidden', !on); };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      cur.x = e.clientX; cur.y = e.clientY;
      if (cur.rx < -50) { cur.rx = cur.x; cur.ry = cur.y; }
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const field = e.target.closest && e.target.closest('input, select, textarea');
      show(!field);
      cur.ring.classList.toggle('is-hover', !!(e.target.closest && e.target.closest('a, button, label, .swatch, .chip')));
    });
    document.addEventListener('pointerdown', () => cur.ring.classList.add('is-down'));
    document.addEventListener('pointerup', () => cur.ring.classList.remove('is-down'));
    document.documentElement.addEventListener('pointerleave', () => show(false));
  }
  function updateCursor(dt) {
    if (!cur.ring) return;
    cur.rx = damp(cur.rx, cur.x, 16, dt);
    cur.ry = damp(cur.ry, cur.y, 16, dt);
    cur.ring.style.transform = `translate3d(${cur.rx.toFixed(1)}px, ${cur.ry.toFixed(1)}px, 0)`;
    cur.dot.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
  }

  /* ---------- Кадр ---------- */
  function update(time, dt, state) {
    const y = window.scrollY;
    const v = vel.getVelocity();
    if (Math.abs(v) > 40) dir = v > 0 ? 1 : -1;
    boost = damp(boost, 1 + Math.min(5, Math.abs(v) / 450), 5, dt);

    if (!reduced) {
      for (const L of loops) {
        if (!L.el.__on) continue;
        L.pos += dt * L.speed * boost * dir * L.sign;
        const p = ((L.pos % 50) + 50) % 50;
        L.track.style.transform = `translate3d(${(-p).toFixed(3)}%, 0, 0)`;
      }
      for (const S of seals) {
        if (!S.el.__on) continue;
        S.a += dt * 18 * boost * dir;
        S.el.style.transform = `rotate(${S.a.toFixed(2)}deg)`;
      }
      updateRing(y);
      updateCallouts(y);
    }
    updateTrack(y);
    if (state) updateShadow(state.dark);
    updateCursor(dt);
  }

  return { update, refresh };
};
