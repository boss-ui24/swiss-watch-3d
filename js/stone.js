/* KANTON — процедурный камень для фонов: чёрный мрамор «неро» и белый «калакатта».
   Рисуется один раз (фрактальный шум + прожилки) и отдаётся как картинка для CSS.
   Основной путь — фрагментный шейдер на отдельном WebGL-канвасе (миллисекунды);
   запасной — тот же алгоритм на процессоре в половинном разрешении. */
window.KantonStone = (() => {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  // Сглаженный value-noise на решётке 256×256 с повтором
  function makeNoise(seed) {
    const R = rng(seed), N = 256, g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = R();
    const fade = (t) => t * t * (3 - 2 * t);
    const at = (x, y) => g[(y & 255) * N + (x & 255)];
    const noise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
    return (x, y, oct = 5) => {
      let v = 0, amp = 0.5, f = 1;
      for (let o = 0; o < oct; o++) { v += noise(x * f, y * f) * amp; f *= 2.03; amp *= 0.5; }
      return v / (1 - Math.pow(0.5, oct));
    };
  }

  const STYLES = {
    // чёрный мрамор: глубокий фон, редкие белые прожилки и тонкие «волоски»
    black: {
      seed: 7, base: [11, 11, 13], cloud: [27, 27, 31], vein: [176, 172, 165], gold: [160, 134, 92], oct: 3,
      veins: [{ angle: 0.62, freq: 1.3, turb: 0.8, sharp: 120, amp: 0.6 }, { angle: 0.35, freq: 3, turb: 1.0, sharp: 220, amp: 0.4 }, { angle: -0.9, freq: 6.5, turb: 1.3, sharp: 520, amp: 0.25 }],
      goldK: 0.18, speck: 0.05
    },
    // белый мрамор: тёплый белый, облачные тени, серо-золотые прожилки
    white: {
      seed: 21, base: [244, 241, 235], cloud: [222, 218, 210], vein: [120, 116, 110], gold: [178, 152, 104], oct: 4,
      veins: [{ angle: 0.55, freq: 1.2, turb: 0.9, sharp: 45, amp: 0.9 }, { angle: 0.25, freq: 3, turb: 1.2, sharp: 150, amp: 0.5 }, { angle: -1.0, freq: 7.5, turb: 1.6, sharp: 380, amp: 0.3 }],
      goldK: 0.35, speck: 0.015
    }
  };

  function render(style, w, h) {
    const S = STYLES[style];
    const fbm = makeNoise(S.seed), warp = makeNoise(S.seed + 99);
    const vn = S.veins.map((V, i) => Object.assign({ f: makeNoise(S.seed + 13 * (i + 1)), c: Math.cos(V.angle), s: Math.sin(V.angle) }, V));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    const R = rng(S.seed + 5);
    const sc = 3.2 / Math.max(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x * sc, v = y * sc;
        const n = fbm(u * 1.4, v * 1.4, 4);
        const wv = warp(u * 0.9 + 10, v * 0.9 + 3, 3);
        // облачная основа
        let k = Math.min(1, Math.max(0, (n - 0.42) * 1.3));
        let r = S.base[0] + (S.cloud[0] - S.base[0]) * k;
        let gg = S.base[1] + (S.cloud[1] - S.base[1]) * k;
        let b = S.base[2] + (S.cloud[2] - S.base[2]) * k;
        // прожилки: |sin| вдоль направления, искажённый шумом, → тонкие линии
        let vein = 0, halo = 0;
        // «гребни» шума в вытянутых вдоль направления координатах → длинные трещины-прожилки
        for (const V of vn) {
          const ru = u * V.c + v * V.s, rv = -u * V.s + v * V.c;
          const t = V.f(ru * V.freq * 0.22 + wv * V.turb, rv * V.freq + n * V.turb, S.oct);
          const line = 1 - Math.abs(2 * t - 1);
          // прожилка то проявляется, то уходит в глубину камня
          const mk = V.f(ru * 0.7 + 40, rv * 0.7 + 40, 2), fade = Math.min(1, Math.max(0, (mk - 0.42) / 0.2));
          vein = Math.max(vein, Math.pow(line, V.sharp) * V.amp * fade);
          halo = Math.max(halo, Math.pow(line, V.sharp * 0.18) * V.amp * 0.06 * fade);
        }
        const gold = Math.max(0, wv - 0.55) * 2.2 * S.goldK;
        const vr = S.vein[0] + (S.gold[0] - S.vein[0]) * gold, vg = S.vein[1] + (S.gold[1] - S.vein[1]) * gold, vb = S.vein[2] + (S.gold[2] - S.vein[2]) * gold;
        const m = Math.min(1, vein + halo);
        r += (vr - r) * m; gg += (vg - gg) * m; b += (vb - b) * m;
        // зерно
        const sp = (R() - 0.5) * 255 * S.speck;
        const i = (y * w + x) * 4;
        d[i] = r + sp; d[i + 1] = gg + sp; d[i + 2] = b + sp; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const FRAG = `
    precision highp float;
    uniform vec2 uRes; uniform float uSeed;
    uniform vec3 uBase, uCloud, uVein, uGold; uniform float uGoldK, uSpeck;
    uniform vec4 uV[3]; uniform float uAmp[3]; uniform int uOct;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21) + uSeed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p, int oct) {
      float v = 0.0, a = 0.5, s = 0.0;
      for (int i = 0; i < 5; i++) { if (i >= oct) break; v += noise(p) * a; s += a; p = p * 2.03 + 17.1; a *= 0.5; }
      return v / s;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy * (3.2 / max(uRes.x, uRes.y));
      float n = fbm(uv * 1.4, 4);
      float wv = fbm(uv * 0.9 + vec2(60.0, 53.0), 3);
      vec3 col = mix(uBase, uCloud, clamp((n - 0.42) * 1.3, 0.0, 1.0));
      float vein = 0.0, halo = 0.0;
      for (int i = 0; i < 3; i++) {
        vec4 V = uV[i]; float c = cos(V.x), s = sin(V.x);
        vec2 r = vec2(uv.x * c + uv.y * s, -uv.x * s + uv.y * c);
        vec2 o = vec2(13.0 * float(i + 1));
        float t = fbm(vec2(r.x * V.y * 0.22 + wv * V.z, r.y * V.y + n * V.z) + o, uOct);
        float line = 1.0 - abs(2.0 * t - 1.0);
        float fade = clamp((fbm(r * 0.7 + 40.0 + o, 2) - 0.42) / 0.2, 0.0, 1.0);
        vein = max(vein, pow(line, V.w) * uAmp[i] * fade);
        halo = max(halo, pow(line, V.w * 0.18) * uAmp[i] * 0.06 * fade);
      }
      vec3 vc = mix(uVein, uGold, clamp((wv - 0.55) * 2.2 * uGoldK, 0.0, 1.0));
      col = mix(col, vc, min(1.0, vein + halo));
      col += (hash(gl_FragCoord.xy * 0.37) - 0.5) * uSpeck;
      gl_FragColor = vec4(col, 1.0);
    }`;

  // Общий запуск фрагментного шейдера на отдельном канвасе
  function shade(frag, w, h, set, opts = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: true, alpha: !!opts.alpha });
    if (!gl) return null;
    if (opts.derivatives && !gl.getExtension('OES_standard_derivatives')) return null;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    set(gl, (n) => gl.getUniformLocation(pr, n));
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return c;
  }
  async function toURL(c, type, q) {
    const url = await new Promise((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : c.toDataURL(type, q)), type, q));
    const gl = c.getContext('webgl');
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext(); // лишний WebGL-контекст сразу отдаём
    return url;
  }

  function renderGL(style, w, h) {
    const S = STYLES[style];
    const rgb = (a) => a.map((v) => v / 255);
    return shade(FRAG, w, h, (gl, U) => {
      gl.uniform2f(U('uRes'), w, h);
      gl.uniform1f(U('uSeed'), S.seed * 0.137);
      gl.uniform3fv(U('uBase'), rgb(S.base)); gl.uniform3fv(U('uCloud'), rgb(S.cloud));
      gl.uniform3fv(U('uVein'), rgb(S.vein)); gl.uniform3fv(U('uGold'), rgb(S.gold));
      gl.uniform1f(U('uGoldK'), S.goldK); gl.uniform1f(U('uSpeck'), S.speck);
      gl.uniform4fv(U('uV'), S.veins.flatMap((V) => [V.angle, V.freq, V.turb, V.sharp]));
      gl.uniform1fv(U('uAmp'), S.veins.map((V) => V.amp));
      gl.uniform1i(U('uOct'), S.oct);
    });
  }

  // Отдаёт blob-URL; между стилями уступаем поток, чтобы прелоадер не замирал
  async function make(style, w, h) {
    await new Promise((r) => setTimeout(r, 0));
    let c = null;
    try { c = renderGL(style, w, h); } catch (err) { console.warn('Камень на GPU не вышел:', err); }
    if (!c) c = render(style, Math.round(w / 2), Math.round(h / 2));
    return toURL(c, 'image/jpeg', 0.9);
  }

  /* Топографическая карта «гор Юра»: изолинии высот, каждая пятая — толще.
     Прозрачный PNG: ложится поверх любого фона. Без WebGL просто не рисуется. */
  const TOPO = `
    #extension GL_OES_standard_derivatives : enable
    precision highp float;
    uniform vec2 uRes; uniform float uSeed; uniform vec3 uInk; uniform float uAlpha;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21) + uSeed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p, int oct) {
      float v = 0.0, a = 0.5, s = 0.0;
      for (int i = 0; i < 5; i++) { if (i >= oct) break; v += noise(p) * a; s += a; p = p * 2.03 + 17.1; a *= 0.5; }
      return v / s;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy * (2.4 / max(uRes.x, uRes.y));
      vec2 q = vec2(fbm(uv * 0.7 + 3.1, 3), fbm(uv * 0.7 + 8.3, 3));
      float f = fbm(uv * 0.9 + q * 1.2, 5) * 24.0;
      float w = fwidth(f);
      float d = abs(fract(f + 0.5) - 0.5);
      float line = 1.0 - smoothstep(w * 0.6, w * 1.6, d);
      float major = 1.0 - step(0.5, mod(floor(f + 0.5), 5.0));
      float a = clamp(line * mix(1.0, 2.2, major) * uAlpha, 0.0, 1.0);
      gl_FragColor = vec4(uInk * a, a);
    }`;
  async function topo(w, h, ink = [19, 19, 20], alpha = 0.1) {
    await new Promise((r) => setTimeout(r, 0));
    let c = null;
    try {
      c = shade(TOPO, w, h, (gl, U) => {
        gl.uniform2f(U('uRes'), w, h);
        gl.uniform1f(U('uSeed'), 0.731);
        gl.uniform3fv(U('uInk'), ink.map((v) => v / 255));
        gl.uniform1f(U('uAlpha'), alpha);
      }, { alpha: true, derivatives: true });
    } catch (err) { console.warn('Топокарта не вышла:', err); }
    return c ? toURL(c, 'image/png') : null;
  }

  return { make, topo };
})();
