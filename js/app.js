/* KANTON — интерфейс: прелоадер, плавный скролл, позы часов по секциям, текстовые анимации, конфигуратор.
   Скрипт обычный (не модуль): Three.js подгружается динамическим import() с CDN,
   поэтому сайт открывается и с локального сервера, и с GitHub Pages без сборки. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const html = document.documentElement;
  const hasG = !!window.gsap;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const small = matchMedia('(max-width: 760px)').matches;
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let lenis = null;
  let scene = null;
  let decor = null;

  const DIALS = {
    noir: { name: 'Noir', ref: 'K-4210.N', note: 'Matte black with white numerals. The classic field look.' },
    rouge: { name: 'Rouge', ref: 'K-4210.R', note: 'Signal red sunburst — the colour of the cross, on the whole dial.' },
    marine: { name: 'Marine', ref: 'K-4210.M', note: 'Deep navy sunburst that turns almost black in shade.' },
    foret: { name: 'Forêt', ref: 'K-4210.F', note: 'Olive-forest green with cream numerals, made for the outdoors.' },
    blanc: { name: 'Blanc', ref: 'K-4210.B', note: 'Opaline white with black numerals. Crisp in any light.' }
  };

  const STRAPS = ['steel', 'leather', 'nato', 'rubber'];
  let strapPick = 'rubber';   // что выбрано в конфигураторе (после секции ремешков)

  /* ============================ Часы в шапке ============================ */
  function initClocks() {
    const fmt = {};
    const els = $$('[data-clock]');
    const local = $('[data-clock-local]');
    const tick = () => {
      const now = new Date();
      els.forEach((el) => {
        const tz = el.dataset.clock;
        try {
          fmt[tz] = fmt[tz] || new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
          el.textContent = fmt[tz].format(now);
        } catch (e) { el.textContent = ''; }
      });
      if (local) local.textContent = now.toTimeString().slice(0, 8);
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ============================ Прелоадер ============================ */
  function preloader() {
    const bar = $('[data-pre-bar]'), num = $('[data-pre-num]');
    const st = { v: 0 };
    const draw = () => {
      bar.style.transform = `scaleX(${st.v / 100})`;
      num.textContent = String(Math.round(st.v)).padStart(2, '0');
    };
    return {
      step(v, d = 1.2) { if (hasG) gsap.to(st, { v, duration: d, ease: 'power2.out', onUpdate: draw, overwrite: true }); },
      done() {
        return new Promise((resolve) => {
          const el = $('[data-preloader]');
          if (!hasG) { el.classList.add('is-done'); resolve(); return; }
          gsap.timeline({ onComplete: () => { el.classList.add('is-done'); resolve(); } })
            .to(st, { v: 100, duration: 0.5, ease: 'power2.out', onUpdate: draw })
            .to('.preloader > *', { y: -24, autoAlpha: 0, duration: 0.5, stagger: 0.05, ease: 'power2.in' })
            .to(el, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '-=0.15');
        });
      }
    };
  }

  /* ============================ Скролл ============================ */
  function initScroll() {
    if (!reduced && window.Lenis && fine) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      lenis.stop();
    }
    $$('[data-scroll-to]').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.6 });
      else if (window.ScrollToPlugin) gsap.to(window, { scrollTo: target, duration: 1.2, ease: 'power2.inOut' });
      else if (target === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      else target.scrollIntoView({ behavior: 'smooth' });
    }));
  }

  // Якоря поз: секция с одной позой — когда её центр в центре экрана;
  // секция с несколькими позами (липкая) — равномерно по её липкому участку
  function computeAnchors() {
    if (!scene && !decor) return;
    const vh = window.innerHeight;
    const max = ScrollTrigger.maxScroll(window);
    const list = [];
    $$('[data-pose]').forEach((sec) => {
      const names = sec.dataset.pose.split(',').map((s) => s.trim());
      const top = sec.getBoundingClientRect().top + window.scrollY;
      const h = sec.offsetHeight;
      if (names.length === 1) list.push({ name: names[0], at: Math.max(0, Math.min(max, top + h / 2 - vh / 2)) });
      else names.forEach((n, i) => list.push({ name: n, at: Math.min(max, top + (h - vh) * i / (names.length - 1)) }));
    });
    list[0].at = 0;
    if (scene) scene.setAnchors(list);
    if (decor) decor.refresh(list);
  }

  /* ============================ Анимации текста ============================ */
  function splitChars(el) {
    if (!window.SplitText) return null;
    return SplitText.create(el, { type: 'lines,words,chars', linesClass: 'split-line', mask: 'lines' });
  }

  function initAnimations() {
    // Заголовки по буквам при входе в экран
    $$('[data-split]').forEach((el) => {
      const sp = splitChars(el);
      if (!sp) return;
      gsap.from(sp.chars, {
        yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.025,
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' }
      });
    });
    $$('[data-reveal]').forEach((el) => gsap.from(el, {
      y: 40, autoAlpha: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' }
    }));

    // Гигантская надпись первого экрана расходится в стороны при скролле
    const words = $$('.hero__word');
    gsap.to(words[0], { xPercent: -18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to(words[1], { xPercent: 18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.profile .giant', { xPercent: small ? -8 : -6, ease: 'none', scrollTrigger: { trigger: '.profile', start: 'top bottom', end: 'bottom top', scrub: true } });

    // Механизм: две панели текста по прогрессу липкой секции
    const p0 = $('[data-panel="0"]'), p1 = $('[data-panel="1"]');
    const counters = $$('[data-count]');
    let counted = false;
    const count = (on) => {
      if (on === counted) return;
      counted = on;
      counters.forEach((el) => {
        const end = +el.dataset.count, o = { v: on ? 0 : end };
        gsap.to(o, {
          v: on ? end : 0, duration: on ? 1.6 : 0.3, ease: on ? 'power3.out' : 'none', overwrite: true,
          onUpdate: () => {
            const v = Math.round(o.v);
            el.textContent = el.dataset.format === 'space' ? v.toLocaleString('en-US').replace(/,/g, ' ') : String(v);
          }
        });
      });
    };
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.calibre', start: 'top top', end: 'bottom bottom', scrub: 0.6,
        onUpdate: (self) => count(self.progress > 0.55)
      }
    });
    tl.to('[data-calibre-bar]', { scaleX: 1, ease: 'none', duration: 1 }, 0)
      .to(p0, { autoAlpha: 0, y: -40, duration: 0.12, ease: 'power2.in' }, 0.42)
      .fromTo(p1, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.14, ease: 'power2.out', immediateRender: false }, 0.52);

    // Ремешки: прогресс липкой секции → какой ремешок намотан
    const sItems = $$('[data-strap-item]'), sNum = $('[data-strap-num]');
    let sIdx = 0;
    const strapUI = (i) => {
      if (i === sIdx) return;
      sIdx = i;
      sItems.forEach((li, k) => li.classList.toggle('is-active', k === i));
      sNum.textContent = String(i + 1).padStart(2, '0');
      gsap.fromTo(sNum, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out' });
    };
    ScrollTrigger.create({
      trigger: '.straps', start: 'top top', end: 'bottom bottom',
      onUpdate: (self) => { if (scene) strapUI(scene.strapScroll(self.progress)); },
      onRefresh: (self) => { if (!scene) return; if (self.progress < 1) strapUI(scene.strapScroll(self.progress)); else scene.pickStrap(strapPick); },
      onLeave: () => { if (scene) scene.pickStrap(strapPick); },
      onLeaveBack: () => { if (scene) strapUI(scene.strapScroll(0)); }
    });
    gsap.fromTo('[data-strap-bar]', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.straps', start: 'top top', end: 'bottom bottom', scrub: 0.4 } });

    // Камень плывёт медленнее страницы
    $$('.contours .stone, .reserve .stone').forEach((el) => gsap.fromTo(el, { yPercent: -6 }, {
      yPercent: 6, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
    }));
    gsap.fromTo('.stone--black', { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.straps', start: 'top bottom', end: 'bottom bottom', scrub: true } });

    // Активный пункт меню
    ['case', 'calibre', 'design', 'straps', 'dial'].forEach((id) => ScrollTrigger.create({
      trigger: '#' + id, start: 'top 55%', end: 'bottom 45%',
      onToggle: (self) => { const a = $(`.nav a[href="#${id}"]`); if (a) a.classList.toggle('is-active', self.isActive); }
    }));

    // toggleClass снимал класс в самом низу страницы (там триггер считается покинутым), поэтому по позиции
    const header = $('[data-header]');
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => header.classList.toggle('is-scrolled', self.scroll() > 80) });

    ScrollTrigger.addEventListener('refresh', computeAnchors);
  }

  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    if (scene) tl.to(scene.intro, { k: 1, duration: reduced ? 0.01 : 2.4, ease: 'power3.out' }, 0);
    tl.from('.hero__word', { yPercent: 105, duration: 1.4, stagger: 0.12 }, 0.1)
      .from('[data-fade]', { y: 20, autoAlpha: 0, duration: 1, stagger: 0.08, ease: 'power3.out' }, 0.5)
      .from('[data-header]', { y: -16, autoAlpha: 0, duration: 0.9, ease: 'power3.out' }, 0.4);
  }

  /* ============================ Фон страницы ============================ */
  const PAPER = [235, 231, 223], NIGHT = [11, 11, 12];
  let lastDark = -1;
  function paintBg(d) {
    const k = Math.round(d * 200) / 200;
    if (k === lastDark) return;
    lastDark = k;
    const c = PAPER.map((v, i) => Math.round(v + (NIGHT[i] - v) * k));
    document.body.style.backgroundColor = `rgb(${c})`;
    html.classList.toggle('is-dark', k > 0.5);
  }

  /* ============================ Конфигуратор и форма ============================ */
  function selectDial(key, from) {
    const d = DIALS[key];
    if (!d) return;
    $$('[data-dial]').forEach((b) => {
      const on = b.dataset.dial === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on);
    });
    $('[data-dial-name]').textContent = d.name;
    $('[data-dial-ref]').textContent = 'Ref. ' + d.ref;
    $('[data-dial-note]').textContent = d.note;
    if (from !== 'form') $('[data-form-dial]').value = key;
    if (scene) scene.setDial(key);
    if (hasG && from === 'swatch') gsap.fromTo('.dial-name, [data-dial-note]', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out' });
  }
  function selectStrap(key, from) {
    if (!STRAPS.includes(key)) return;
    strapPick = key;
    $$('[data-strap]').forEach((b) => {
      const on = b.dataset.strap === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on);
    });
    if (from !== 'form') $('[data-form-strap]').value = key;
    if (scene) scene.pickStrap(key);
  }
  function initUI() {
    $$('[data-strap]').forEach((b) => b.addEventListener('click', () => selectStrap(b.dataset.strap, 'chip')));
    $('[data-form-strap]').addEventListener('change', (e) => selectStrap(e.target.value, 'form'));
    $$('[data-dial]').forEach((b) => b.addEventListener('click', () => selectDial(b.dataset.dial, 'swatch')));
    $('[data-form-dial]').addEventListener('change', (e) => selectDial(e.target.value, 'form'));
    const form = $('[data-form]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      $$('input', form).forEach((i) => { const bad = !i.value.trim(); i.setAttribute('aria-invalid', bad); if (bad) ok = false; });
      if (!ok) { $('input[aria-invalid="true"]', form).focus(); return; }
      const msg = $('[data-form-ok]');
      msg.hidden = false;
      $('button[type="submit"]', form).disabled = true;
      if (hasG) gsap.from(msg, { y: 10, autoAlpha: 0, duration: 0.5 });
    });
  }

  /* ============================ Запуск ============================ */
  async function boot() {
    initClocks();
    initUI();
    if (!hasG) {
      $('[data-preloader]').classList.add('is-done');
      html.classList.remove('is-loading');
      return;
    }
    gsap.registerPlugin(...[window.ScrollTrigger, window.SplitText, window.ScrollToPlugin].filter(Boolean));
    ScrollTrigger.clearScrollMemory('manual');
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    html.style.overflow = 'hidden';
    initScroll();
    const pre = preloader();
    pre.step(20, 0.8);

    // шрифты нужны до сборки модели: надписи на циферблате и роторе рисуются в канвасе
    const fontList = ['700 40px Unbounded', '600 40px Unbounded', '500 20px Onest', '600 20px Onest', '400 20px Onest'];
    const fonts = (document.fonts ? Promise.all(fontList.map((f) => document.fonts.load(f))).then(() => document.fonts.ready) : Promise.resolve())
      .catch(() => {}).then(() => pre.step(40, 1));
    const three = import(THREE_URL).then((m) => { pre.step(70, 1.4); return m; }).catch((err) => { console.warn('Three.js не загрузился:', err); return null; });
    const [THREE] = await Promise.all([three, fonts, wait(reduced ? 200 : 1200)]);

    if (THREE && window.KantonScene) {
      try {
        scene = KantonScene(THREE, { canvas: $('#gl'), mobile: small || !fine, reduced });
        await scene.warmup();
        pre.step(90, 0.6);
      } catch (err) {
        console.error('3D-сцена не запустилась:', err);
        scene = null;
      }
    }
    if (!scene) html.classList.add('no-webgl');

    // фоны из камня: генерируем под размер экрана, пока идёт прелоадер
    if (window.KantonStone) {
      try {
        const big = Math.max(innerWidth, innerHeight), k = Math.min(1, (small ? 1200 : 1800) / big);
        const w = Math.round(innerWidth * k), h = Math.round(innerHeight * k);
        const urls = {};
        for (const style of ['black', 'white']) urls[style] = await KantonStone.make(style, w, h);
        $$('[data-stone]').forEach((el) => { el.style.backgroundImage = `url(${urls[el.dataset.stone]})`; el.classList.add('is-ready'); });
        // изолинии рисуем в плотности экрана, иначе тонкие линии расплываются на ретине
        const d = Math.min(2, window.devicePixelRatio || 1), kt = Math.min(d, 2400 / big);
        const topo = await KantonStone.topo(Math.round(innerWidth * kt), Math.round(innerHeight * kt), undefined, small ? 0.15 : 0.1);
        if (topo) $$('[data-topo]').forEach((el) => { el.style.backgroundImage = `url(${topo})`; el.classList.add('is-ready'); });
      } catch (err) { console.warn('Камень не сгенерировался:', err); }
    }
    pre.step(96, 0.4);

    if (window.KantonDecor) {
      try { decor = KantonDecor({ scene, fine, reduced }); } catch (err) { console.warn('Декор не запустился:', err); }
    }
    initAnimations();
    computeAnchors();
    gsap.ticker.add((time, dtMs) => {
      const dt = Math.min(dtMs / 1000, 0.05);
      const st = scene ? scene.render(time, dt) : null;
      if (st) paintBg(st.dark);
      if (decor) decor.update(time, dt, st);
    });

    await pre.done();
    html.style.overflow = '';
    html.classList.remove('is-loading');
    if (lenis) lenis.start();
    ScrollTrigger.refresh();
    heroIntro();
  }

  boot().catch((err) => {
    console.error('KANTON: ошибка запуска', err);
    $('[data-preloader]').classList.add('is-done');
    html.style.overflow = '';
    if (lenis) lenis.start();
  });
})();
