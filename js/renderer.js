/* =========================================================================
   RAM RUSH — Renderizado (Canvas 2D)
   Cámara con anticipación, parallax en 3 capas, tiles cacheados por segmentos,
   iluminación aditiva, personaje BIT y enemigos dibujados por código.
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const C = RR.CONFIG;
  const T = C.TILE;
  const TAU = Math.PI * 2;
  const SEG = 512;   // ancho (px de mundo) de cada segmento cacheado
  const PAD = 4;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const UI_FONT = '"Exo 2", "Segoe UI", system-ui, sans-serif';
  const MONO = '"JetBrains Mono", Consolas, monospace';
  const SOLID = { '#': 1, '~': 1, '>': 1, '<': 1 };

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function seeded(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  class Renderer {
    constructor(canvas, game, fx) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.fx = fx;
      this.W = 0; this.H = 0; this.dpr = 1; this.s = 1;
      this.insets = { top: 0, bottom: 0 };
      this.camX = 0; this.camY = 0;
      this.t = 0;
      this.segs = new Map();
      this.segK = 0;
      this.glowCache = {};
      this.trail = [];
      this.dustAcc = 0;
      this.bgKey = '';
      this.snap = true;
      this.chipSprite = null;
    }

    // ------------------------------------------------------------ tamaño
    resize(w, h, insets) {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = Math.max(300, w);
      this.H = Math.max(300, h);
      this.insets = insets || { top: 0, bottom: 0 };
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      const avail = Math.max(200, this.H - this.insets.top - this.insets.bottom);
      let s = avail / (12.5 * T);
      s = Math.min(s, this.W / (13 * T));
      this.s = clamp(s, 0.42, 2.6);
      if (!this.zoom) this.zoom = 1;
      this.es = this.s * this.zoom;
      this.viewW = this.W / this.es;
      this.invalidate();
      this.snap = true;
    }

    invalidate() {
      this.segs.clear();
      this.bgKey = '';
      this.chipSprite = null;
    }

    // ---------------------------------------------------------- utilidades
    glow(color) {
      let g = this.glowCache[color];
      if (!g) {
        g = makeCanvas(64, 64);
        const c = g.getContext('2d');
        const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, color);
        grd.addColorStop(0.35, color.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.35).toFixed(3) + ')'));
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = grd;
        c.fillRect(0, 0, 64, 64);
        this.glowCache[color] = g;
      }
      return g;
    }
    drawGlow(ctx, x, y, r, color) {
      ctx.drawImage(this.glow(color), x - r, y - r, r * 2, r * 2);
    }

    // ---------------------------------------------------------------- cámara
    updateCamera(dt) {
      const g = this.game, p = g.player;
      // Zoom automático: nas arenas de chefe afasta a câmara para mostrar tudo.
      let zt = 1;
      if (g.arenaLocked && g.arena) zt = clamp((this.W / this.s) / (g.arena.x1 - g.arena.x0 + 2 * T), 0.5, 1);
      if (this.snap || dt <= 0) { if (this.snap) this.zoom = zt; }
      else this.zoom += (zt - this.zoom) * Math.min(1, dt * 2.5);
      this.es = this.s * this.zoom;
      const s = this.es;
      const viewW = this.W / s;
      const top = this.insets.top, bottom = this.insets.bottom;
      let tx;
      if (g.state === 'title') {
        const span = Math.max(0, g.worldW - viewW);
        tx = span > 0 ? (Math.sin(this.t * 0.05) * 0.5 + 0.5) * span : 0;
      } else {
        const look = clamp(p.vx * 0.42, -220, 220) + p.facing * 40;
        tx = p.x + p.w / 2 + look - viewW * 0.42;
      }
      let minX = 0, maxX = g.worldW - viewW;
      if (g.arenaLocked && g.arena) {
        const aw = g.arena.x1 - g.arena.x0;
        if (aw <= viewW) { minX = maxX = g.arena.x0 - (viewW - aw) / 2; }
        else { minX = g.arena.x0; maxX = g.arena.x1 - viewW; }
      }
      tx = maxX >= minX ? clamp(tx, minX, maxX) : maxX / 2;
      const camYMax = g.worldH - (this.H - bottom) / s;
      const camYMin = -top / s;
      let ty;
      if (camYMin >= camYMax) ty = camYMax;
      else ty = clamp(p.y + p.h / 2 - (top / s + (this.H - top - bottom) / s * 0.55), camYMin, camYMax);
      if (this.snap || dt <= 0) {
        if (this.snap) { this.camX = tx; this.camY = ty; this.snap = false; }
      } else {
        const k = 1 - Math.pow(0.0008, dt);
        this.camX += (tx - this.camX) * k;
        this.camY += (ty - this.camY) * k;
      }
    }

    // --------------------------------------------------------------- fondo
    buildBackground() {
      const g = this.game, th = g.theme;
      const key = g.def.theme + '|' + this.W + 'x' + this.H + '|' + this.dpr;
      if (this.bgKey === key) return;
      this.bgKey = key;
      const W = this.W, H = this.H, dpr = this.dpr;

      // Cielo
      const sky = makeCanvas(W * dpr, H * dpr);
      let c = sky.getContext('2d');
      c.scale(dpr, dpr);
      let grd = c.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, th.sky[0]);
      grd.addColorStop(1, th.sky[1]);
      c.fillStyle = grd;
      c.fillRect(0, 0, W, H);
      grd = c.createRadialGradient(W * 0.7, H * 0.25, 10, W * 0.7, H * 0.25, Math.max(W, H) * 0.7);
      grd.addColorStop(0, th.far + '0.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grd;
      c.fillRect(0, 0, W, H);
      // rejilla fina
      c.strokeStyle = th.far + '0.05)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x < W; x += 32) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
      for (let y = 0; y < H; y += 32) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); }
      c.stroke();
      this.skyCanvas = sky;

      // Capa lejana: grandes chips y condensadores (silueta)
      const BAND = Math.max(1400, W * 1.3);
      this.band = BAND;
      const far = makeCanvas(BAND * dpr, H * dpr);
      c = far.getContext('2d');
      c.scale(dpr, dpr);
      let rnd = seeded(g.levelIndex * 977 + 31);
      const baseY = H - this.insets.bottom;
      for (let i = 0; i < 9; i++) {
        const x = rnd() * BAND;
        const kind = rnd();
        if (kind < 0.45) {
          const w = 120 + rnd() * 200, h = 90 + rnd() * 220;
          const y = baseY - h - rnd() * H * 0.25;
          c.fillStyle = 'rgba(0,0,0,0.38)';
          rr(c, x, y, w, h, 10);
          c.fill();
          c.strokeStyle = th.far + '0.14)';
          c.lineWidth = 2;
          c.stroke();
          c.fillStyle = th.far + '0.09)';
          for (let k = 8; k < w - 8; k += 14) { c.fillRect(x + k, y - 8, 6, 8); c.fillRect(x + k, y + h, 6, 8); }
          c.fillStyle = th.far + '0.08)';
          rr(c, x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5, 6);
          c.fill();
        } else if (kind < 0.75) {
          const r = 26 + rnd() * 40, h = 120 + rnd() * 200;
          const y = baseY - h;
          const cg = c.createLinearGradient(x - r, 0, x + r, 0);
          cg.addColorStop(0, 'rgba(0,0,0,0.45)');
          cg.addColorStop(0.5, th.far + '0.12)');
          cg.addColorStop(1, 'rgba(0,0,0,0.45)');
          c.fillStyle = cg;
          c.fillRect(x - r, y, r * 2, h);
          c.beginPath();
          c.ellipse(x, y, r, r * 0.3, 0, 0, TAU);
          c.fillStyle = th.far + '0.14)';
          c.fill();
        } else {
          const w = 40 + rnd() * 60, h = H * (0.4 + rnd() * 0.4);
          c.fillStyle = 'rgba(0,0,0,0.3)';
          for (let k = 0; k < 6; k++) c.fillRect(x + k * (w / 6), baseY - h, w / 12, h);
        }
      }
      this.farCanvas = far;

      // Capa media: pistas de circuito
      const mid = makeCanvas(BAND * dpr, H * dpr);
      c = mid.getContext('2d');
      c.scale(dpr, dpr);
      rnd = seeded(g.levelIndex * 131 + 7);
      this.midLines = [];
      c.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        let x = rnd() * BAND, y = H * (0.1 + rnd() * 0.75);
        const pts = [{ x, y }];
        for (let k = 0; k < 4; k++) {
          const len = 60 + rnd() * 220;
          const d = rnd();
          if (d < 0.5) x += len; else if (d < 0.75) { x += len * 0.7; y += len * 0.7 * (rnd() < 0.5 ? -1 : 1); } else y += len * (rnd() < 0.5 ? -0.5 : 0.5);
          pts.push({ x, y });
        }
        c.strokeStyle = th.far + '0.13)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(pts[0].x, pts[0].y);
        for (const pt of pts) c.lineTo(pt.x, pt.y);
        c.stroke();
        c.fillStyle = th.far + '0.25)';
        for (const pt of [pts[0], pts[pts.length - 1]]) { c.beginPath(); c.arc(pt.x, pt.y, 3.5, 0, TAU); c.fill(); }
        this.midLines.push(pts);
      }
      this.midCanvas = mid;

      // Viñeta
      const vig = makeCanvas(W * dpr, H * dpr);
      c = vig.getContext('2d');
      c.scale(dpr, dpr);
      grd = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = grd;
      c.fillRect(0, 0, W, H);
      this.vigCanvas = vig;

      // Bokeh (polvo luminoso)
      rnd = seeded(g.levelIndex * 71 + 3);
      this.bokeh = [];
      for (let i = 0; i < 26; i++) this.bokeh.push({ x: rnd() * BAND, y: rnd() * H, r: 1.5 + rnd() * 5, a: 0.05 + rnd() * 0.12, sp: 4 + rnd() * 12, ph: rnd() * TAU });
    }

    drawBackground(ctx) {
      this.buildBackground();
      const W = this.W, H = this.H, BAND = this.band;
      ctx.drawImage(this.skyCanvas, 0, 0, W, H);
      const layer = (img, f) => {
        let off = -((this.camX * this.es * f) % BAND);
        if (off > 0) off -= BAND;
        for (let x = off; x < W; x += BAND) ctx.drawImage(img, x, 0, BAND, H);
        return off;
      };
      layer(this.farCanvas, 0.12);
      const off = layer(this.midCanvas, 0.35);
      // Paquetes de datos que recorren las pistas del fondo
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const col = this.game.theme.far + '0.7)';
      this.midLines.forEach((pts, i) => {
        const t = ((this.t * 0.18 + i * 0.37) % 1);
        const seg = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
        const k = t * (pts.length - 1) - seg;
        const x = pts[seg].x + (pts[seg + 1].x - pts[seg].x) * k;
        const y = pts[seg].y + (pts[seg + 1].y - pts[seg].y) * k;
        for (let ox = off; ox < W; ox += BAND) {
          const sx = x + ox;
          if (sx < -20 || sx > W + 20) continue;
          this.drawGlow(ctx, sx, y, 14, col);
        }
      });
      // bokeh
      for (const b of this.bokeh) {
        let x = (b.x - this.camX * this.es * 0.55) % BAND;
        if (x < 0) x += BAND;
        const y = (b.y + Math.sin(this.t * 0.3 + b.ph) * 20) % H;
        for (let ox = 0; ox - BAND < W; ox += BAND) {
          const sx = x + ox - BAND;
          if (sx < -20 || sx > W + 20) continue;
          ctx.globalAlpha = b.a * (0.7 + 0.3 * Math.sin(this.t + b.ph));
          this.drawGlow(ctx, sx, y, b.r * 3, col);
        }
      }
      ctx.restore();
    }

    // ------------------------------------------------- tiles (segmentos cache)
    getSegment(i) {
      const k = Math.min(this.s * this.dpr, 2.5);
      if (Math.abs(k - this.segK) > 0.001) { this.segs.clear(); this.segK = k; }
      let seg = this.segs.get(i);
      if (seg) return seg;
      const g = this.game;
      const wpx = SEG + PAD * 2;
      seg = makeCanvas(wpx * k, g.worldH * k);
      const c = seg.getContext('2d');
      c.setTransform(k, 0, 0, k, -(i * SEG - PAD) * k, 0);
      const c0 = Math.floor((i * SEG - PAD) / T) - 1, c1 = Math.ceil(((i + 1) * SEG + PAD) / T) + 1;
      for (let r = 0; r < g.rows; r++) for (let col = c0; col <= c1; col++) this.drawStaticTile(c, col, r);
      this.segs.set(i, seg);
      if (this.segs.size > 10) {
        const cur = Math.floor(this.camX / SEG);
        let far = null, fd = -1;
        for (const key of this.segs.keys()) { const d = Math.abs(key - cur); if (d > fd) { fd = d; far = key; } }
        this.segs.delete(far);
      }
      return seg;
    }

    drawStaticTile(c, col, r) {
      const g = this.game, th = g.theme;
      const ch = g.tile(col, r);
      if (ch === '.' || col < 0 || col >= g.cols) return;
      const x = col * T, y = r * T;
      if (SOLID[ch]) {
        const up = g.tile(col, r - 1), left = g.tile(col - 1, r), right = g.tile(col + 1, r);
        const exposedTop = !SOLID[up];
        const depth = exposedTop ? 0 : (SOLID[g.tile(col, r - 2)] ? 2 : 1);
        c.fillStyle = depth >= 2 ? th.deep : th.ground;
        c.fillRect(x, y, T, T);
        if (depth === 1) {
          const grd = c.createLinearGradient(0, y, 0, y + T);
          grd.addColorStop(0, th.ground);
          grd.addColorStop(1, th.deep);
          c.fillStyle = grd;
          c.fillRect(x, y, T, T);
        }
        // pistas internas y vías
        const h1 = hash(col, r);
        c.strokeStyle = th.far + '0.16)';
        c.lineWidth = 1.5;
        if (h1 < 0.45) {
          c.beginPath();
          const yy = y + 8 + Math.floor(h1 * 40) % 16;
          c.moveTo(x, yy); c.lineTo(x + T * 0.55, yy); c.lineTo(x + T * 0.75, yy + 8); c.lineTo(x + T, yy + 8);
          c.stroke();
        }
        if (h1 > 0.7) {
          const vx = x + 8 + (h1 * 97 % 16), vy = y + 10 + (h1 * 53 % 14);
          c.fillStyle = 'rgba(230,180,70,0.5)';
          c.beginPath(); c.arc(vx, vy, 3.2, 0, TAU); c.fill();
          c.fillStyle = th.deep;
          c.beginPath(); c.arc(vx, vy, 1.4, 0, TAU); c.fill();
        }
        // bordes laterales
        if (!SOLID[left]) {
          const grd = c.createLinearGradient(x, 0, x + 6, 0);
          grd.addColorStop(0, th.edge);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          c.globalAlpha = 0.35;
          c.fillStyle = grd;
          c.fillRect(x, y, 6, T);
          c.globalAlpha = 1;
        }
        if (!SOLID[right]) {
          const grd = c.createLinearGradient(x + T, 0, x + T - 6, 0);
          grd.addColorStop(0, 'rgba(0,0,0,0.6)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = grd;
          c.fillRect(x + T - 6, y, 6, T);
        }
        if (exposedTop) {
          if (ch === '~') {
            c.fillStyle = '#6b4416';
            c.fillRect(x, y, T, 10);
          } else if (ch === '>' || ch === '<') {
            c.fillStyle = '#0a0f1c';
            c.fillRect(x, y, T, T * 0.55);
            c.strokeStyle = th.edge;
            c.lineWidth = 1.5;
            c.strokeRect(x + 1, y + 1, T - 2, T * 0.55 - 2);
          } else {
            const grd = c.createLinearGradient(0, y, 0, y + 14);
            grd.addColorStop(0, th.edge);
            grd.addColorStop(0.25, th.far + '0.55)');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = grd;
            c.fillRect(x, y, T, 14);
            c.fillStyle = 'rgba(255,255,255,0.55)';
            c.fillRect(x, y, T, 1.5);
            // contactos dorados
            c.fillStyle = 'rgba(230,180,70,0.6)';
            c.fillRect(x + 6, y + 5, 7, 3);
            c.fillRect(x + 19, y + 5, 7, 3);
          }
          if (!SOLID[left]) { c.fillStyle = th.edge; c.fillRect(x, y, 2, T * 0.6); }
          if (!SOLID[right]) { c.fillStyle = th.edge; c.fillRect(x + T - 2, y, 2, T * 0.6); }
        }
      } else if (ch === '=') {
        const grd = c.createLinearGradient(0, y, 0, y + 12);
        grd.addColorStop(0, th.edge);
        grd.addColorStop(0.3, th.ground);
        grd.addColorStop(1, th.deep);
        c.fillStyle = grd;
        c.fillRect(x, y, T, 12);
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillRect(x, y, T, 1.5);
        c.fillStyle = 'rgba(230,180,70,0.55)';
        c.fillRect(x + 4, y + 13, 3, 6);
        c.fillRect(x + T - 7, y + 13, 3, 6);
        if (g.tile(col - 1, r) !== '=') { c.fillStyle = th.edge; c.fillRect(x, y, 3, 12); }
        if (g.tile(col + 1, r) !== '=') { c.fillStyle = th.edge; c.fillRect(x + T - 3, y, 3, 12); }
      } else if (ch === '^') {
        c.fillStyle = '#141824';
        c.fillRect(x + 2, y + T - 6, T - 4, 6);
      }
    }

    drawTiles(ctx) {
      const g = this.game;
      const viewW = this.W / this.es;
      const i0 = Math.floor(this.camX / SEG), i1 = Math.floor((this.camX + viewW) / SEG);
      for (let i = i0; i <= i1; i++) {
        if (i * SEG > g.worldW + PAD) break;
        const seg = this.getSegment(i);
        ctx.drawImage(seg, i * SEG - PAD, 0, SEG + PAD * 2, g.worldH);
      }
    }

    // Tiles animados (pagefile, impulsores, cortocircuitos).
    drawDynamicTiles(ctx) {
      const g = this.game, th = g.theme, t = this.t;
      const viewW = this.W / this.es;
      const c0 = Math.max(0, Math.floor(this.camX / T) - 1), c1 = Math.min(g.cols - 1, Math.ceil((this.camX + viewW) / T) + 1);
      for (let r = 0; r < g.rows; r++) {
        const row = g.tiles[r];
        for (let col = c0; col <= c1; col++) {
          const ch = row[col];
          if (ch !== '~' && ch !== '>' && ch !== '<' && ch !== '^') continue;
          const x = col * T, y = r * T;
          if (ch === '~' && !SOLID[g.tile(col, r - 1)]) {
            ctx.fillStyle = '#8a5a1e';
            ctx.beginPath();
            ctx.moveTo(x, y + 10);
            for (let k = 0; k <= 8; k++) {
              const xx = x + (k / 8) * T;
              ctx.lineTo(xx, y + 3 + Math.sin(t * 2.4 + xx * 0.08) * 2.2);
            }
            ctx.lineTo(x + T, y + 10);
            ctx.closePath();
            ctx.fill();
            if (hash(col, Math.floor(t * 1.3 + col)) > 0.93) {
              ctx.fillStyle = 'rgba(255,200,120,0.5)';
              ctx.beginPath();
              ctx.arc(x + 8 + hash(col, 9) * 16, y + 2, 2.5, 0, TAU);
              ctx.fill();
            }
            if (col % 6 === 0) {
              ctx.font = `700 7px ${MONO}`;
              ctx.fillStyle = 'rgba(255,190,110,0.45)';
              ctx.textAlign = 'left';
              ctx.fillText('SWAP', x + 2, y + 20);
            }
          } else if (ch === '>' || ch === '<') {
            const d = ch === '>' ? 1 : -1;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 2, y + 2, T - 4, T * 0.55 - 4);
            ctx.clip();
            ctx.globalCompositeOperation = 'lighter';
            for (let k = -1; k < 3; k++) {
              const ox = (((t * 90 * d) % 14) + 14) % 14;
              const ax = x + k * 14 + ox;
              ctx.strokeStyle = th.edge;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(ax + (d > 0 ? 0 : 7), y + 4);
              ctx.lineTo(ax + (d > 0 ? 7 : 0), y + 9);
              ctx.lineTo(ax + (d > 0 ? 0 : 7), y + 14);
              ctx.stroke();
            }
            ctx.restore();
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            this.drawGlow(ctx, x + T / 2, y + 6, 26, th.far + '0.35)');
            ctx.restore();
          } else if (ch === '^') {
            const flick = 0.6 + 0.4 * Math.sin(t * 30 + col * 3);
            ctx.fillStyle = '#c9d2e6';
            for (let k = 0; k < 3; k++) {
              const bx = x + 2 + k * 9.3;
              const grd = ctx.createLinearGradient(bx, y + 10, bx + 9, y + T);
              grd.addColorStop(0, '#ffffff');
              grd.addColorStop(1, '#5b6378');
              ctx.fillStyle = grd;
              ctx.beginPath();
              ctx.moveTo(bx, y + T - 5);
              ctx.lineTo(bx + 4.65, y + 9);
              ctx.lineTo(bx + 9.3, y + T - 5);
              ctx.closePath();
              ctx.fill();
            }
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = flick;
            this.drawGlow(ctx, x + T / 2, y + 12, 22, 'rgba(255,230,90,0.55)');
            if (hash(col, Math.floor(t * 12)) > 0.7) {
              ctx.strokeStyle = 'rgba(255,255,160,0.9)';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              let zx = x + 4, zy = y + 8;
              ctx.moveTo(zx, zy);
              for (let k = 0; k < 4; k++) { zx += 6; zy += (hash(col + k, Math.floor(t * 20)) - 0.5) * 10; ctx.lineTo(zx, zy); }
              ctx.stroke();
            }
            ctx.restore();
          }
        }
      }
    }

    // --------------------------------------------------------- objetos
    getChipSprite() {
      if (this.chipSprite) return this.chipSprite;
      const k = 3;
      const cv = makeCanvas(26 * k, 14 * k);
      const c = cv.getContext('2d');
      c.scale(k, k);
      rr(c, 1, 1, 24, 12, 2);
      const grd = c.createLinearGradient(0, 1, 0, 13);
      grd.addColorStop(0, '#2fbf77');
      grd.addColorStop(1, '#126b40');
      c.fillStyle = grd;
      c.fill();
      c.strokeStyle = '#9dffd0';
      c.lineWidth = 0.8;
      c.stroke();
      c.fillStyle = '#0b0f17';
      for (let i = 0; i < 3; i++) c.fillRect(3 + i * 7.2, 2.6, 5.4, 5.6);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 3; i++) c.fillRect(3 + i * 7.2, 2.6, 5.4, 1);
      c.fillStyle = '#f2c14e';
      for (let i = 0; i < 9; i++) if (i !== 4) c.fillRect(2.4 + i * 2.4, 9.6, 1.5, 2.6);
      this.chipSprite = cv;
      return cv;
    }

    drawChip(ctx, cx, cy, phase, alpha) {
      const spin = Math.cos(this.t * 3.2 + phase);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, cx, cy, 22, 'rgba(90,255,170,0.45)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.12, Math.abs(spin)), 1);
      ctx.drawImage(this.getChipSprite(), -13, -7, 26, 14);
      if (spin > 0.85) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(-13, -7, 26, 2);
      }
      ctx.restore();
    }

    drawModule(ctx, m) {
      const t = this.t;
      const cx = m.x + m.w / 2, cy = m.y + m.h / 2 + Math.sin(t * 2.5) * 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, cx, cy, 60, 'rgba(255,200,90,0.5)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 1.7) * 0.08);
      const w = 44, h = 22;
      rr(ctx, -w / 2, -h / 2, w, h, 3);
      ctx.fillStyle = '#10131c';
      ctx.fill();
      const hue = (t * 120) % 360;
      const grd = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      grd.addColorStop(0, `hsl(${hue},100%,60%)`);
      grd.addColorStop(0.5, `hsl(${(hue + 120) % 360},100%,60%)`);
      grd.addColorStop(1, `hsl(${(hue + 240) % 360},100%,60%)`);
      ctx.fillStyle = grd;
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 4);
      ctx.fillStyle = '#2a3142';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 7, w - 4, 9);
      ctx.font = `800 7px ${MONO}`;
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DDR5', 0, -h / 2 + 11.8);
      ctx.fillStyle = '#f2c14e';
      for (let i = 0; i < 14; i++) if (i !== 6) ctx.fillRect(-w / 2 + 3 + i * 2.9, h / 2 - 4, 1.8, 4);
      ctx.restore();
      // destellos
      if (Math.sin(t * 3 + m.x) > 0.96) this.fx.burst(cx + (Math.random() - 0.5) * 30, cy + (Math.random() - 0.5) * 16, '#ffe9a8', 2, 40, 0.5, 1.6);
    }

    drawSpring(ctx, s) {
      const comp = s.comp;
      const h = 22 - comp * 9;
      const x = s.x + s.w / 2, base = s.y + s.h;
      ctx.save();
      ctx.fillStyle = '#1b2233';
      ctx.fillRect(x - 13, base - 4, 26, 4);
      const grd = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
      grd.addColorStop(0, '#1f4f9e');
      grd.addColorStop(0.45, '#5aa8ff');
      grd.addColorStop(1, '#173b78');
      ctx.fillStyle = grd;
      rr(ctx, x - 10, base - 4 - h, 20, h, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(x + 4, base - 4 - h + 3, 3, h - 6);
      ctx.fillStyle = '#c7d2e8';
      rr(ctx, x - 11, base - 7 - h, 22, 5, 2);
      ctx.fill();
      ctx.font = `800 9px ${UI_FONT}`;
      ctx.fillStyle = '#e6f0ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('−', x - 3, base - 4 - h / 2);
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, x, base - 6 - h, 22 + comp * 20, 'rgba(90,168,255,0.5)');
      ctx.restore();
    }

    drawCheckpoint(ctx, cp) {
      const x = cp.x, base = cp.y;
      const on = cp.active;
      ctx.save();
      ctx.fillStyle = '#2a3142';
      ctx.fillRect(x - 2, base - 64, 4, 64);
      ctx.fillStyle = '#1b2233';
      ctx.fillRect(x - 10, base - 4, 20, 4);
      const bx = x - 22, by = base - 92;
      rr(ctx, bx, by, 44, 28, 4);
      const grd = ctx.createLinearGradient(0, by, 0, by + 28);
      grd.addColorStop(0, '#2b3448');
      grd.addColorStop(1, '#151a26');
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = on ? '#7dffb5' : 'rgba(160,180,220,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `800 9px ${MONO}`;
      ctx.fillStyle = on ? '#bfffe0' : '#9fb3d9';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('SSD', bx + 5, by + 10);
      ctx.font = `600 6px ${MONO}`;
      ctx.fillText(on ? 'GRAVADO' : 'NVMe', bx + 5, by + 20);
      const led = on ? '#7dffb5' : (Math.sin(this.t * 6) > 0 ? '#ff4d6d' : '#5a1a26');
      ctx.fillStyle = led;
      ctx.beginPath();
      ctx.arc(bx + 37, by + 8, 3, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, bx + 37, by + 8, on ? 26 : 14, on ? 'rgba(125,255,181,0.7)' : 'rgba(255,77,109,0.4)');
      if (on) this.drawGlow(ctx, x, by + 14, 60, 'rgba(125,255,181,0.18)');
      ctx.restore();
    }

    drawGoal(ctx, gl) {
      const t = this.t, th = this.game.theme;
      const boss = this.game.boss;
      const locked = boss && boss.state !== 'dead';
      const x = gl.x, y = gl.y, w = gl.w, h = gl.h;
      const cx = x + w / 2, cy = y + h / 2;
      ctx.save();
      if (locked) ctx.globalAlpha = 0.55;
      // haz de luz
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, y - 400, 0, y);
      beam.addColorStop(0, 'rgba(0,0,0,0)');
      beam.addColorStop(1, th.far + (0.18 + 0.08 * Math.sin(t * 3)) + ')');
      ctx.fillStyle = beam;
      ctx.fillRect(x + 14, y - 400, w - 28, 400);
      this.drawGlow(ctx, cx, cy, w * 1.1, th.far + '0.35)');
      ctx.globalCompositeOperation = 'source-over';
      // pines
      ctx.strokeStyle = 'rgba(230,190,110,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 1; i < 10; i++) {
        const k = i / 10;
        ctx.moveTo(x + w * k, y - 6); ctx.lineTo(x + w * k, y + 4);
        ctx.moveTo(x - 6, y + h * k); ctx.lineTo(x + 4, y + h * k);
        ctx.moveTo(x + w - 4, y + h * k); ctx.lineTo(x + w + 6, y + h * k);
      }
      ctx.stroke();
      rr(ctx, x, y, w, h, 10);
      const grd = ctx.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, '#26304a');
      grd.addColorStop(1, '#0d1220');
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = th.edge;
      ctx.lineWidth = 2;
      ctx.stroke();
      const inset = 18;
      rr(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, 6);
      ctx.fillStyle = '#070b14';
      ctx.fill();
      // rejilla de núcleos
      const gw = (w - inset * 2 - 12) / 2;
      for (let i = 0; i < 4; i++) {
        const gx = x + inset + 4 + (i % 2) * (gw + 4), gy = y + inset + 4 + Math.floor(i / 2) * (gw + 4);
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 4 + i * 1.7));
        ctx.fillStyle = th.far + a + ')';
        rr(ctx, gx, gy, gw, gw, 3);
        ctx.fill();
      }
      ctx.font = `900 18px ${UI_FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = th.edge;
      ctx.shadowBlur = 12;
      ctx.fillText('CPU', cx, cy + 1);
      ctx.shadowBlur = 0;
      ctx.font = `700 8px ${MONO}`;
      ctx.fillStyle = th.glow;
      ctx.fillText(locked ? '🔒 BLOQUEADO PELO CHEFE' : 'META · ENTREGA DE DADOS', cx, y - 16 + Math.sin(t * 3) * 3);
      if (locked) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,77,109,0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 10); ctx.lineTo(x + w - 10, y + h - 10);
        ctx.moveTo(x + w - 10, y + 10); ctx.lineTo(x + 10, y + h - 10);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ------------------------------------------------------- chefe final
    drawBoss(ctx) {
      const g = this.game, b = g.boss, t = this.t;
      if (!b || b.state === 'waiting' || b.state === 'dead') return;
      if (b.kind === 'leak') { this.drawLeakBoss(ctx, b); return; }
      if (b.kind === 'hive') { this.drawHiveBoss(ctx, b); return; }
      const x = b.x, y = b.y, w = b.w, h = b.h;
      const cx = x + w / 2, cy = y + h / 2;
      const p = g.player;
      const flash = b.hurtT > 0;
      const rage = b.phase === 3;
      ctx.save();
      if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      // aura
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, cx, cy, w * 0.95, rage ? 'rgba(255,40,40,0.5)' : 'rgba(255,60,110,0.38)');
      ctx.globalCompositeOperation = 'source-over';
      // tentáculos de dados corrompidos
      ctx.strokeStyle = rage ? 'rgba(255,90,90,0.75)' : 'rgba(255,90,150,0.6)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const sx = x + 24 + i * ((w - 48) / 5);
        ctx.beginPath();
        ctx.moveTo(sx, y + h - 4);
        for (let k = 1; k <= 4; k++) ctx.lineTo(sx + Math.sin(t * 4 + i + k) * 8, y + h - 4 + k * 10);
        ctx.stroke();
      }
      // corpo: módulo DIMM gigante
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 1.3) * 0.04);
      ctx.translate(-cx, -cy);
      rr(ctx, x, y, w, h, 8);
      const grd = ctx.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, flash ? '#ffffff' : '#3a1020');
      grd.addColorStop(1, flash ? '#ffd0d8' : '#160509');
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = flash ? '#fff' : (rage ? '#ff3030' : '#ff4d6d');
      ctx.lineWidth = 3;
      ctx.stroke();
      // contactos dourados (alguns "queimados")
      for (let i = 0; i < 30; i++) {
        if (i === 13) continue;
        const burnt = hash(i, 3) > 0.75;
        ctx.fillStyle = burnt ? '#3b2a12' : '#f2c14e';
        ctx.fillRect(x + 10 + i * ((w - 20) / 30), y + h - 12, 4, 10);
      }
      // chips de memória
      const chipW = (w - 40) / 8;
      for (let i = 0; i < 8; i++) {
        const chx = x + 20 + i * chipW, chy = y + 16;
        if (i === 3 || i === 4) continue;
        ctx.fillStyle = '#0a0a10';
        ctx.fillRect(chx + 2, chy, chipW - 6, 40);
        const glitch = Math.sin(t * 9 + i * 2) > 0.6;
        ctx.fillStyle = glitch ? 'rgba(255,60,90,0.8)' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(chx + 2, chy, chipW - 6, 3);
        ctx.font = `800 9px ${MONO}`;
        ctx.fillStyle = glitch ? '#ff7a9a' : 'rgba(255,140,170,0.55)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hash(i, Math.floor(t * 6)) > 0.5 ? '1' : '0', chx + chipW / 2 - 1, chy + 24);
      }
      // olho central
      const ex = cx, ey = y + 38;
      ctx.fillStyle = '#0a0003';
      ctx.beginPath(); ctx.ellipse(ex, ey, 30, 22, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 2;
      ctx.stroke();
      const ang = Math.atan2(p.y + p.h / 2 - ey, p.x + p.w / 2 - ex);
      const px = ex + Math.cos(ang) * 10, py = ey + Math.sin(ang) * 6;
      const ig = ctx.createRadialGradient(px, py, 1, px, py, 15);
      ig.addColorStop(0, '#fff3a0');
      ig.addColorStop(0.35, rage ? '#ff2020' : '#ff4d6d');
      ig.addColorStop(1, '#4a0010');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.arc(px, py, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(px, py, 3, 9, 0, 0, TAU); ctx.fill();
      // fissuras
      ctx.strokeStyle = 'rgba(255,120,150,0.7)';
      ctx.lineWidth = 1.5;
      const cracks = b.phase + (b.max - b.hp > b.max * 0.15 ? 1 : 0);
      for (let i = 0; i < cracks; i++) {
        const sx = x + 30 + hash(i, 9) * (w - 60);
        ctx.beginPath();
        ctx.moveTo(sx, y + 4);
        ctx.lineTo(sx + 8, y + 22);
        ctx.lineTo(sx - 4, y + 36);
        ctx.lineTo(sx + 6, y + 54);
        ctx.stroke();
      }
      // rótulo
      ctx.font = `800 9px ${MONO}`;
      ctx.fillStyle = '#ffb3c1';
      ctx.textAlign = 'left';
      ctx.fillText('DDR5 · ERRO 0xDEAD', x + 10, y + h - 20);
      ctx.restore();

      // fatias de glitch
      if (Math.random() < (rage ? 0.4 : 0.18)) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(80,255,255,0.35)' : 'rgba(255,40,90,0.4)';
        ctx.fillRect(x + Math.random() * w * 0.6, y + Math.random() * h, 30 + Math.random() * 80, 3 + Math.random() * 5);
      }
      // escudo de paridade
      if (b.shieldT > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.35 + 0.2 * Math.sin(t * 20);
        ctx.strokeStyle = `rgba(120,230,255,${a + 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.62, h * 0.95, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = `rgba(80,200,255,${a * 0.25})`;
        ctx.fill();
        ctx.font = `800 10px ${MONO}`;
        ctx.fillStyle = '#bff3ff';
        ctx.textAlign = 'center';
        ctx.fillText('ESCUDO DE PARIDADE', cx, y - 14);
      }
      ctx.restore();
    }

    // Rei das Fugas: blob gigante com coroa de chips e olhos.
    drawLeakBoss(ctx, b) {
      const g = this.game, p = g.player, t = this.t;
      const flash = b.hurtT > 0;
      const cx = b.x + b.w / 2, by = b.y + b.h;
      const sq = b.squash || 0;
      const air = !b.onGround && b.state === 'fight';
      const sx = 1 + sq * 0.25 - (air ? 0.08 : 0), sy = 1 - sq * 0.22 + (air ? 0.1 : 0);
      ctx.save();
      if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, cx, by - b.h / 2, b.w * 1.1, b.phase === 3 ? 'rgba(255,40,140,0.5)' : 'rgba(255,60,170,0.4)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(cx, by);
      ctx.scale(sx, sy);
      const w = b.w, h = b.h;
      const wob = Math.sin(t * 4);
      const grd = ctx.createLinearGradient(0, -h, 0, 0);
      grd.addColorStop(0, flash ? '#ffffff' : '#ff7ad0');
      grd.addColorStop(0.6, flash ? '#ffd9ef' : '#c21877');
      grd.addColorStop(1, flash ? '#ffc0e0' : '#5a0636');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.bezierCurveTo(-w / 2 - 10, -h * 0.6, -w * 0.3, -h - 8 + wob * 4, 0, -h);
      ctx.bezierCurveTo(w * 0.3, -h - 8 - wob * 4, w / 2 + 10, -h * 0.6, w / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,230,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // bolhas internas com bits retidos
      for (let i = 0; i < 6; i++) {
        const bx = Math.sin(t * 0.8 + i * 1.7) * w * 0.3, byy = -h * 0.25 - ((t * 20 + i * 15) % (h * 0.55));
        ctx.fillStyle = 'rgba(255,220,240,0.25)';
        ctx.beginPath(); ctx.arc(bx, byy, 5 + (i % 3) * 2, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(-w * 0.22, -h * 0.72, 16, 8, -0.5, 0, TAU); ctx.fill();
      // coroa de chips de RAM roubados
      for (let i = -2; i <= 2; i++) {
        ctx.save();
        ctx.translate(i * 18, -h + 4 + Math.abs(i) * 5);
        ctx.rotate(i * 0.25);
        ctx.drawImage(this.getChipSprite(), -11, -16, 22, 12);
        ctx.restore();
      }
      // olhos
      const ang = Math.atan2(p.y - (b.y + b.h * 0.4), p.x - cx);
      for (const ex of [-24, 24]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(ex, -h * 0.55, 14, 16, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = b.phase === 3 ? '#ff1744' : '#2a0018';
        ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * 6, -h * 0.55 + Math.sin(ang) * 6, 6.5, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#3a0020';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-40, -h * 0.78); ctx.lineTo(-12, -h * 0.68); ctx.moveTo(40, -h * 0.78); ctx.lineTo(12, -h * 0.68); ctx.stroke();
      // boca
      ctx.fillStyle = '#2a0018';
      ctx.beginPath(); ctx.ellipse(0, -h * 0.28, 22, 10 + Math.abs(wob) * 6, 0, 0, TAU); ctx.fill();
      ctx.font = `900 11px ${MONO}`;
      ctx.fillStyle = 'rgba(255,230,245,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('malloc()', 0, -10);
      ctx.restore();
    }

    // Colmeia de Malware: núcleo hexagonal com favos infetados e antenas.
    drawHiveBoss(ctx, b) {
      const g = this.game, p = g.player, t = this.t;
      const flash = b.hurtT > 0;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      ctx.save();
      if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, cx, cy, b.w, b.phase === 3 ? 'rgba(255,60,60,0.5)' : 'rgba(190,80,255,0.4)');
      ctx.globalCompositeOperation = 'source-over';
      // asas de dados
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + s * b.w * 0.42, cy - 10);
        ctx.rotate(s * (0.3 + Math.sin(t * 22) * 0.25));
        ctx.fillStyle = 'rgba(200,170,255,0.28)';
        ctx.strokeStyle = 'rgba(220,200,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(s * 26, -10, 34, 16, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // favos (hexágonos)
      const hex = (x, y, r) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        ctx.closePath();
      };
      const r = 17;
      const cells = [[0, 0], [-1.73, 0], [1.73, 0], [-0.87, -1.5], [0.87, -1.5], [-0.87, 1.5], [0.87, 1.5], [-2.6, -1.5], [2.6, -1.5], [-2.6, 1.5], [2.6, 1.5]];
      cells.forEach(([hx, hy], i) => {
        const x = cx + hx * r, y = cy + hy * r;
        hex(x, y, r - 1.5);
        const infected = hash(i, Math.floor(t * 3)) > 0.55;
        ctx.fillStyle = flash ? '#fff' : (i === 0 ? '#1a0626' : infected ? '#7a1aa8' : '#3b0f55');
        ctx.fill();
        ctx.strokeStyle = b.phase === 3 ? '#ff4d6d' : '#d38bff';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (i !== 0) {
          ctx.font = `800 9px ${MONO}`;
          ctx.fillStyle = 'rgba(255,200,255,0.6)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(infected ? '☣' : '01', x, y);
        }
      });
      // olho central
      const ang = Math.atan2(p.y - cy, p.x - cx);
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 5, cy + Math.sin(ang) * 5, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(ang) * 6, cy + Math.sin(ang) * 6, 2.5, 7, 0, 0, TAU); ctx.fill();
      // antenas
      ctx.strokeStyle = '#d38bff';
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx + s * 12, cy - 40); ctx.quadraticCurveTo(cx + s * 30, cy - 70, cx + s * 44, cy - 66); ctx.stroke();
        ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff4fd8' : '#7a1aa8';
        ctx.beginPath(); ctx.arc(cx + s * 44, cy - 66, 4, 0, TAU); ctx.fill();
      }
      if (b.shieldT > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.35 + 0.2 * Math.sin(t * 20);
        ctx.strokeStyle = `rgba(120,230,255,${a + 0.3})`;
        ctx.lineWidth = 3;
        hex(cx, cy, b.w * 0.55);
        ctx.stroke();
        ctx.fillStyle = `rgba(80,200,255,${a * 0.2})`;
        ctx.fill();
        ctx.font = `800 10px ${MONO}`;
        ctx.fillStyle = '#bff3ff';
        ctx.textAlign = 'center';
        ctx.fillText('ESCUDO DE PARIDADE', cx, b.y - 22);
      }
      ctx.restore();
    }

    drawBombItem(ctx, bi) {
      const t = this.t;
      const cx = bi.x + bi.w / 2, cy = bi.y + bi.h / 2 + Math.sin(t * 3 + bi.x) * 3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, cx, cy, 34, 'rgba(255,230,120,0.55)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#1b2233';
      ctx.beginPath(); ctx.arc(cx, cy + 2, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#c8d6f0';
      ctx.beginPath(); ctx.moveTo(cx + 6, cy - 7); ctx.quadraticCurveTo(cx + 12, cy - 14, cx + 8, cy - 18); ctx.stroke();
      ctx.fillStyle = Math.sin(t * 15) > 0 ? '#fff3a0' : '#ff9f43';
      ctx.beginPath(); ctx.arc(cx + 8, cy - 18, 2.5, 0, TAU); ctx.fill();
      ctx.font = `900 9px ${MONO}`;
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('R', cx, cy + 2.5);
      ctx.restore();
    }

    drawProjectiles(ctx) {
      const g = this.game, t = this.t;
      ctx.save();
      // ondas de choque
      for (const w of g.waves) {
        const gy = 14 * T;
        ctx.globalCompositeOperation = 'lighter';
        const grd = ctx.createLinearGradient(0, gy - 30, 0, gy);
        grd.addColorStop(0, 'rgba(255,90,190,0)');
        grd.addColorStop(1, 'rgba(255,120,210,0.9)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(w.x - 18, gy);
        ctx.quadraticCurveTo(w.x, gy - 30 - Math.sin(t * 30) * 4, w.x + 18, gy);
        ctx.closePath();
        ctx.fill();
        this.drawGlow(ctx, w.x, gy - 8, 26, 'rgba(255,90,190,0.6)');
        ctx.globalCompositeOperation = 'source-over';
      }
      // avisos de lixo a cair
      for (const j of g.junk) {
        if (j.warnT > 0) {
          const a = 0.5 + 0.5 * Math.sin(t * 25);
          const gx = j.x + j.w / 2, gy = 14 * T;
          ctx.fillStyle = `rgba(255,77,109,${0.35 + a * 0.4})`;
          ctx.beginPath();
          ctx.moveTo(gx - 12, gy - 2); ctx.lineTo(gx + 12, gy - 2); ctx.lineTo(gx, gy - 20);
          ctx.closePath();
          ctx.fill();
          ctx.font = `900 11px ${UI_FONT}`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', gx, gy - 8);
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = '#ff4d6d';
          ctx.fillRect(gx - 1, 0, 2, gy - 20);
          ctx.globalAlpha = 1;
        } else {
          ctx.save();
          ctx.translate(j.x + j.w / 2, j.y + j.h / 2);
          ctx.rotate(j.rot);
          ctx.fillStyle = '#2b2f3a';
          rr(ctx, -j.w / 2, -j.h / 2, j.w, j.h, 4);
          ctx.fill();
          ctx.strokeStyle = '#ff4d6d';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7);
          ctx.stroke();
          ctx.restore();
        }
      }
      // laser
      if (g.laser) {
        const L = g.laser;
        const x0 = g.arena ? g.arena.x0 : this.camX, x1 = g.arena ? g.arena.x1 : this.camX + this.W / this.es;
        if (L.warn > 0) {
          ctx.setLineDash([10, 8]);
          ctx.lineDashOffset = -t * 60;
          ctx.strokeStyle = `rgba(255,60,90,${0.5 + 0.4 * Math.sin(t * 30)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x0, L.y); ctx.lineTo(x1, L.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `800 11px ${MONO}`;
          ctx.fillStyle = '#ff8099';
          ctx.textAlign = 'center';
          ctx.fillText('⚠ LASER DE BIT FLIP — SALTA!', (x0 + x1) / 2, L.y - 26);
        } else {
          ctx.globalCompositeOperation = 'lighter';
          const grd = ctx.createLinearGradient(0, L.y - 14, 0, L.y + 14);
          grd.addColorStop(0, 'rgba(255,40,80,0)');
          grd.addColorStop(0.5, 'rgba(255,90,120,0.95)');
          grd.addColorStop(1, 'rgba(255,40,80,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(x0, L.y - 14, x1 - x0, 28);
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(x0, L.y - 2, x1 - x0, 4);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      // bits corrompidos inimigos
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const q of g.bullets) {
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, q.x, q.y, 20, 'rgba(255,60,90,0.6)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(t * 8 + q.x * 0.01);
        ctx.fillStyle = '#2a0010';
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `900 11px ${MONO}`;
        ctx.fillStyle = '#ffd0da';
        ctx.fillText(q.glyph, 0, 1);
        ctx.restore();
      }
      // pacotes ECC do jogador
      ctx.globalCompositeOperation = 'lighter';
      for (const s of g.shots) {
        const sp = Math.hypot(s.vx, s.vy) || 1;
        const tx = s.x - (s.vx / sp) * 26, ty = s.y - (s.vy / sp) * 26;
        const grd = ctx.createLinearGradient(tx, ty, s.x, s.y);
        grd.addColorStop(0, 'rgba(76,201,255,0)');
        grd.addColorStop(1, 'rgba(160,240,255,1)');
        ctx.strokeStyle = grd;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
        this.drawGlow(ctx, s.x, s.y, 16, 'rgba(120,230,255,0.8)');
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const s of g.shots) {
        ctx.font = `800 7px ${MONO}`;
        ctx.fillStyle = '#062033';
        ctx.fillText('ECC', s.x, s.y + 0.5);
      }
      ctx.restore();
    }

    // ----------------------------------------------------------- enemigos
    drawEnemy(ctx, e) {
      const t = this.t;
      if (!e.alive) return;
      const cx = e.x + e.w / 2, by = e.y + e.h;
      ctx.save();
      if (e.type === 'bug') {
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, cx, by - 10, 30, 'rgba(255,70,70,0.35)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(cx, by);
        ctx.scale(e.dir, 1);
        // patas
        ctx.strokeStyle = '#2a0b0f';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const lx = -8 + i * 8, sw = Math.sin(t * 18 + i * 2) * 3;
          ctx.beginPath(); ctx.moveTo(lx, -6); ctx.lineTo(lx + sw - 3, 0); ctx.stroke();
        }
        // caparazón
        const grd = ctx.createLinearGradient(0, -22, 0, -2);
        grd.addColorStop(0, '#ff5a5a');
        grd.addColorStop(1, '#8a1020');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(-2, -10, 14, 10, 0, Math.PI, 0);
        ctx.lineTo(12, -4);
        ctx.lineTo(-16, -4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2a0b0f';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-2, -20); ctx.lineTo(-2, -4); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(-7, -15, 4, 2, -0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a0a0c';
        ctx.fillRect(-6, -9, 4, 3); ctx.fillRect(2, -12, 3, 3);
        // cabeza
        ctx.fillStyle = '#3a0e16';
        ctx.beginPath(); ctx.arc(13, -8, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffec5c';
        ctx.beginPath(); ctx.arc(15, -9, 2.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3a0e16';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(14, -13); ctx.quadraticCurveTo(18, -20, 22, -19); ctx.stroke();
      } else if (e.type === 'leak') {
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, cx, by - 8, 36, 'rgba(255,46,140,0.45)');
        ctx.globalCompositeOperation = 'source-over';
        const wob = Math.sin(t * 5 + e.x * 0.05);
        const w = e.w + 4, h = e.h + 2 + wob * 2;
        const grd = ctx.createLinearGradient(0, by - h, 0, by);
        grd.addColorStop(0, '#ff6ac1');
        grd.addColorStop(1, '#7a0b4a');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(cx - w / 2, by);
        ctx.quadraticCurveTo(cx - w / 2 - 2, by - h * 0.9, cx - w * 0.15, by - h);
        ctx.quadraticCurveTo(cx + wob * 2, by - h - 6, cx + w * 0.2, by - h + 1);
        ctx.quadraticCurveTo(cx + w / 2 + 2, by - h * 0.8, cx + w / 2, by);
        ctx.closePath();
        ctx.fill();
        // gotas que caen
        const dp = (t * 1.4 + e.x * 0.01) % 1;
        ctx.fillStyle = 'rgba(255,106,193,0.8)';
        ctx.beginPath(); ctx.arc(cx + w * 0.3, by - h * 0.4 + dp * h * 0.4, 2.2 * (1 - dp * 0.5), 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.ellipse(cx - w * 0.2, by - h * 0.7, 4, 2.2, -0.5, 0, TAU); ctx.fill();
        // ojos
        const ex = cx + e.dir * 3;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex - 5, by - h * 0.55, 3.6, 0, TAU); ctx.arc(ex + 5, by - h * 0.55, 3.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a0018';
        ctx.beginPath(); ctx.arc(ex - 5 + e.dir, by - h * 0.55, 1.8, 0, TAU); ctx.arc(ex + 5 + e.dir, by - h * 0.55, 1.8, 0, TAU); ctx.fill();
        ctx.font = `800 6px ${MONO}`;
        ctx.fillStyle = 'rgba(255,220,240,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText('LEAK', cx, by - 3);
      } else if (e.type === 'turret') {
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, cx, by - 16, 30, 'rgba(255,120,60,0.35)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#20242f';
        rr(ctx, e.x, by - 12, e.w, 12, 3); ctx.fill();
        ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.2; ctx.stroke();
        const charge = Math.max(0, 1 - e.fireT / 0.6);
        const grd = ctx.createRadialGradient(cx - 3, by - 22, 2, cx, by - 18, 13);
        grd.addColorStop(0, '#ffcf8a'); grd.addColorStop(1, '#7a2a0a');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(cx, by - 16, 12, Math.PI, 0); ctx.fill();
        ctx.save();
        ctx.translate(cx, by - 18);
        ctx.scale(e.dir, 1);
        ctx.fillStyle = '#3a3f4f';
        ctx.fillRect(4, -4, 14, 7);
        ctx.fillStyle = charge > 0 ? `rgba(255,${Math.round(200 - charge * 150)},60,1)` : '#ff6b3d';
        ctx.fillRect(16, -3, 3, 5);
        ctx.restore();
        ctx.fillStyle = '#ffec5c';
        ctx.beginPath(); ctx.arc(cx + e.dir * 3, by - 20, 2.5, 0, TAU); ctx.fill();
        if (charge > 0) {
          ctx.globalCompositeOperation = 'lighter';
          this.drawGlow(ctx, cx + e.dir * 20, by - 18, 12 + charge * 14, 'rgba(255,140,60,0.8)');
        }
      } else if (e.type === 'spiky') {
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, cx, by - 12, 30, 'rgba(170,120,255,0.35)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(cx, by);
        ctx.scale(e.dir, 1);
        ctx.strokeStyle = '#1a1030';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const lx = -8 + i * 8, sw = Math.sin(t * 14 + i * 2) * 3;
          ctx.beginPath(); ctx.moveTo(lx, -6); ctx.lineTo(lx + sw - 3, 0); ctx.stroke();
        }
        const grd = ctx.createLinearGradient(0, -24, 0, -2);
        grd.addColorStop(0, '#b9a3ff'); grd.addColorStop(1, '#3d2a7a');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.ellipse(-2, -10, 15, 11, 0, Math.PI, 0); ctx.lineTo(13, -4); ctx.lineTo(-17, -4); ctx.closePath(); ctx.fill();
        // espinhos metálicos
        ctx.fillStyle = '#e8eefc';
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (i + 0.5) * (Math.PI / 5);
          const bx = -2 + Math.cos(a) * 14, byy = -10 + Math.sin(a) * 10;
          ctx.beginPath();
          ctx.moveTo(bx - 3, byy + 1); ctx.lineTo(-2 + Math.cos(a) * 22, -10 + Math.sin(a) * 18); ctx.lineTo(bx + 3, byy + 1);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#26183f';
        ctx.beginPath(); ctx.arc(13, -8, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7dffb5';
        ctx.beginPath(); ctx.arc(15, -9, 2.2, 0, TAU); ctx.fill();
      } else {
        const cy = e.y + e.h / 2;
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, cx, cy, 40, 'rgba(255,60,60,0.45)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(cx, cy);
        ctx.rotate(t * 2.2);
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 2.4;
        ctx.fillStyle = '#ff9b9b';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
          ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(Math.cos(a) * 17, Math.sin(a) * 17, 2.2, 0, TAU); ctx.fill();
        }
        ctx.rotate(-t * 2.2);
        const grd = ctx.createRadialGradient(-3, -3, 1, 0, 0, 12);
        grd.addColorStop(0, '#ff8080');
        grd.addColorStop(1, '#5a0710');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
        ctx.fillStyle = '#16020a';
        ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 4.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath(); ctx.arc(e.dir * 2, 0, 2.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ------------------------------------------------------------- jugador
    drawPlayer(ctx) {
      const g = this.game, p = g.player, t = this.t;
      const cx = p.x + p.w / 2, by = p.y + p.h + (p.stepOffset || 0);
      const dash = g.dashTime > 0;
      if (p.invuln > 0 && !p.dead && Math.floor(t * 18) % 2 === 0) return;

      // estelas
      for (let i = 0; i < this.trail.length; i++) {
        const tr = this.trail[i];
        const a = (i / this.trail.length) * (dash ? 0.5 : 0.25);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, tr.x, tr.y, 22, dash ? (i % 2 ? 'rgba(255,79,216,0.9)' : 'rgba(76,201,255,0.9)') : 'rgba(76,201,255,0.7)');
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, cx, by - 20, dash ? 70 : 48, dash ? 'rgba(255,79,216,0.5)' : 'rgba(76,201,255,0.35)');
      ctx.restore();

      ctx.save();
      if (p.dead) {
        ctx.translate(cx, by - 19);
        ctx.rotate(p.spin);
        ctx.globalAlpha = Math.max(0, 1 - p.deadT / 1.5);
        this.drawBody(ctx, 0, 19, 0, true);
        ctx.restore();
        return;
      }
      if (p.ball) {
        const r = 16;
        ctx.translate(cx, by - r - 2);
        ctx.rotate(p.spin);
        const grd = ctx.createRadialGradient(-5, -6, 2, 0, 0, r);
        grd.addColorStop(0, '#d8f6ff');
        grd.addColorStop(0.35, dash ? '#ff7ae0' : '#4cc9ff');
        grd.addColorStop(1, dash ? '#6a1a8a' : '#1645a8');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r - 4, -0.4, 1.0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r - 4, 2.7, 4.1); ctx.stroke();
        ctx.fillStyle = '#071025';
        ctx.fillRect(-r + 4, -3, r * 2 - 8, 6);
        ctx.fillStyle = '#7dffb5';
        ctx.fillRect(2, -1.5, 5, 3);
        ctx.restore();
        return;
      }
      const lean = clamp(p.vx / C.BOOST_TOP, -1, 1) * 0.22;
      ctx.translate(cx, by);
      ctx.rotate(lean);
      ctx.scale(p.facing, 1);
      this.drawBody(ctx, 0, 0, p.onGround ? p.run : 0, false);
      // canhão ECC no braço
      ctx.fillStyle = '#2a3550';
      rr(ctx, 6, -24, 14, 7, 3); ctx.fill();
      ctx.fillStyle = g.overheat ? '#ff4d6d' : (g.weapon === 'spread' ? '#ffd166' : '#4cc9ff');
      ctx.fillRect(17, -23, 3, 5);
      if (p.shootFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        this.drawGlow(ctx, 22, -20, 18, 'rgba(160,240,255,0.9)');
      }
      ctx.restore();
    }

    // BIT: robot mensajero de datos (origen en los pies).
    drawBody(ctx, x, y, run, hurt) {
      const g = this.game, p = g.player, t = this.t;
      const dash = g.dashTime > 0;
      const moving = Math.abs(p.vx) > 20 && p.onGround;
      const ph = run * 0.045;
      const bob = moving ? Math.abs(Math.sin(ph)) * 2 : Math.sin(t * 3) * 0.8;
      ctx.translate(x, y);
      // piernas
      const legA = moving ? Math.sin(ph) * 7 : 0;
      const air = !p.onGround;
      ctx.strokeStyle = '#1c2740';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, -10); ctx.lineTo(-4 + (air ? -3 : legA), -2);
      ctx.moveTo(4, -10); ctx.lineTo(4 + (air ? 4 : -legA), -2);
      ctx.stroke();
      // botas
      ctx.fillStyle = '#e8f0ff';
      const f1 = -4 + (air ? -3 : legA), f2 = 4 + (air ? 4 : -legA);
      rr(ctx, f1 - 4, -4, 10, 5, 2.5); ctx.fill();
      rr(ctx, f2 - 4, -4, 10, 5, 2.5); ctx.fill();
      ctx.fillStyle = dash ? '#ff4fd8' : '#4cc9ff';
      ctx.fillRect(f1 - 4, -1, 10, 1.5);
      ctx.fillRect(f2 - 4, -1, 10, 1.5);
      // cuerpo
      const top = -38 - bob;
      const grd = ctx.createLinearGradient(-13, top, 13, top + 30);
      if (hurt) { grd.addColorStop(0, '#ff9aa8'); grd.addColorStop(1, '#8a1030'); }
      else if (dash) { grd.addColorStop(0, '#ffc2f3'); grd.addColorStop(0.5, '#ff4fd8'); grd.addColorStop(1, '#5b2bd6'); }
      else { grd.addColorStop(0, '#bff0ff'); grd.addColorStop(0.45, '#4cc9ff'); grd.addColorStop(1, '#1a4fc0'); }
      ctx.fillStyle = grd;
      rr(ctx, -13, top, 26, 30, 11);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // visor
      ctx.fillStyle = '#071025';
      rr(ctx, -8, top + 6, 20, 10, 5);
      ctx.fill();
      const blink = (t % 3.2) < 0.12;
      ctx.fillStyle = hurt ? '#ff4d6d' : '#7dffb5';
      if (blink) { ctx.fillRect(-1, top + 10.5, 4, 1.2); ctx.fillRect(6, top + 10.5, 4, 1.2); }
      else { rr(ctx, -1, top + 8.5, 4, 5, 1.5); ctx.fill(); rr(ctx, 6, top + 8.5, 4, 5, 1.5); ctx.fill(); }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, 5, top + 11, 10, hurt ? 'rgba(255,77,109,0.6)' : 'rgba(125,255,181,0.6)');
      ctx.restore();
      // chip de RAM en el pecho
      ctx.fillStyle = '#1f8f5a';
      ctx.fillRect(-7, top + 19, 12, 6);
      ctx.fillStyle = '#0b0f17';
      ctx.fillRect(-6, top + 20, 3, 3); ctx.fillRect(-2, top + 20, 3, 3); ctx.fillRect(2, top + 20, 2, 3);
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(-7, top + 24, 12, 1);
      // brazo
      const arm = moving ? -Math.sin(ph) * 6 : 0;
      ctx.strokeStyle = '#1c2740';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-2, top + 16); ctx.lineTo(-7 + arm, top + 26); ctx.stroke();
      // antena
      ctx.strokeStyle = '#c8d6f0';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-3, top + 1); ctx.quadraticCurveTo(-6, top - 7, -10 - Math.min(6, Math.abs(p.vx) / 90), top - 9); ctx.stroke();
      const ledOn = Math.sin(t * 6) > -0.2;
      ctx.fillStyle = ledOn ? '#ff4fd8' : '#6a1a5a';
      ctx.beginPath(); ctx.arc(-10 - Math.min(6, Math.abs(p.vx) / 90), top - 9, 2.6, 0, TAU); ctx.fill();
    }

    // ------------------------------------------------------------- eventos
    onEvent(type, d) {
      const fx = this.fx, g = this.game;
      switch (type) {
        case 'start':
        case 'level':
          fx.clear();
          this.trail.length = 0;
          this.invalidate();
          this.snap = true;
          break;
        case 'respawn':
          this.snap = false;
          this.trail.length = 0;
          fx.ring(g.player.x + 12, g.player.y + 20, '#4cc9ff', 60, 0.6, 3);
          fx.burst(g.player.x + 12, g.player.y + 20, '#9be7ff', 20, 200, 0.6);
          break;
        case 'chip':
          fx.burst(d.x, d.y, '#7dffb5', 7, 110, 0.4, 2);
          fx.ring(d.x, d.y, 'rgba(125,255,181,0.9)', 18, 0.25, 1.5);
          break;
        case 'module':
          fx.burst(d.x, d.y, '#ffd166', 30, 260, 0.9, 3);
          fx.ring(d.x, d.y, '#ffd166', 70, 0.6, 3);
          fx.text(d.x, d.y - 24, '+5 GB · MÓDULO DDR5!', '#ffe08a', 16, 1.5);
          fx.flash('255,220,120', 0.15);
          break;
        case 'jump':
          fx.burst(d.x, d.y, g.theme.glow, 6, 90, 0.3, 1.8);
          break;
        case 'land':
          fx.burst(d.x, d.y, g.theme.glow, Math.min(14, 4 + d.v / 80), 120, 0.35, 1.8);
          if (d.v > 900) fx.addShake(2);
          break;
        case 'kill': {
          const e = d.e;
          const col = e.type === 'leak' ? '#ff6ac1' : e.type === 'drone' ? '#ff6b6b' : '#ff8a5c';
          const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
          fx.burst(cx, cy, col, 22, 240, 0.6, 2.6);
          fx.burst(cx, cy, '#ffffff', 8, 140, 0.4, 1.8);
          fx.ring(cx, cy, col, 46, 0.4, 3);
          fx.text(cx, cy - 18, (d.chain > 1 ? `×${d.chain}  ` : '') + '+' + d.pts, d.chain > 1 ? '#ffd166' : '#ffffff', 15 + Math.min(d.chain, 6), 1);
          if (e.type === 'leak') fx.text(cx, cy - 36, 'MEMÓRIA LIBERTADA', '#ff9fd6', 12, 1.1);
          fx.addShake(2.5);
          break;
        }
        case 'hurt':
          fx.ring(d.x, d.y, '#ff4d6d', 70, 0.5, 4);
          fx.text(d.x, d.y - 34, `−${d.lost} GB`, '#ff6b81', 18, 1.2);
          fx.flash('255,40,80', 0.25);
          fx.addShake(8);
          break;
        case 'die':
          fx.burst(d.x, d.y, '#ff4d6d', 30, 300, 0.8, 3);
          fx.flash('255,30,60', 0.45);
          fx.addShake(12);
          fx.text(d.x, d.y - 40, d.cause === 'pit' ? 'SEGMENTATION FAULT' : 'KERNEL PANIC', '#ff6b81', 18, 1.5);
          break;
        case 'spring':
          fx.burst(d.x, d.y, '#9ad0ff', 14, 200, 0.5, 2.2);
          fx.ring(d.x, d.y, '#5aa8ff', 40, 0.4, 3);
          break;
        case 'pad':
          fx.burst(d.x, d.y, g.theme.edge, 14, 220, 0.4, 2);
          fx.ring(d.x, d.y - 10, g.theme.edge, 50, 0.35, 3);
          break;
        case 'dash':
          fx.flash('255,120,230', 0.16);
          fx.ring(d.x, d.y, '#ff4fd8', 120, 0.6, 5);
          fx.ring(d.x, d.y, '#4cc9ff', 80, 0.5, 4);
          fx.text(d.x, d.y - 50, 'DUAL CHANNEL ×2', '#ffb8f1', 20, 1.4);
          break;
        case 'gc':
          fx.ring(d.x, d.y, '#7dffb5', C.GC_RADIUS, 0.6, 6);
          fx.ring(d.x, d.y, '#ffffff', C.GC_RADIUS * 0.7, 0.45, 3);
          fx.flash('120,255,190', 0.18);
          fx.text(d.x, d.y - 50, d.count ? `GARBAGE COLLECTOR ×${d.count}` : 'GARBAGE COLLECTOR', '#9dffcf', 16, 1.2);
          break;
        case 'checkpoint':
          fx.burst(d.x, d.y - 78, '#7dffb5', 26, 220, 0.8, 2.5);
          fx.ring(d.x, d.y - 78, '#7dffb5', 70, 0.6, 3);
          fx.text(d.x, d.y - 120, 'GRAVADO NO SSD', '#9dffcf', 16, 1.6);
          break;
        case 'cleared': {
          const gl = g.goal;
          if (gl) {
            fx.confetti(gl.x + gl.w / 2, gl.y + 20, ['#4cc9ff', '#ff4fd8', '#ffd166', '#7dffb5', '#a78bfa'], 120);
            fx.ring(gl.x + gl.w / 2, gl.y + gl.h / 2, '#ffffff', 160, 0.8, 5);
          }
          fx.flash('255,255,255', 0.3);
          break;
        }
        case 'energyFull':
          fx.ring(g.player.x + 12, g.player.y + 20, '#ff4fd8', 60, 0.6, 3);
          break;
        case 'extraLife':
          fx.text(g.player.x + 12, g.player.y - 30, '1UP · VIDA EXTRA', '#ffe08a', 17, 1.6);
          fx.ring(g.player.x + 12, g.player.y + 20, '#ffd166', 90, 0.7, 4);
          break;
        case 'doubleJump':
          fx.ring(d.x, d.y, g.theme.glow, 34, 0.35, 3);
          fx.burst(d.x, d.y, g.theme.glow, 10, 160, 0.35, 2);
          break;
        case 'shoot':
          fx.burst(d.x, d.y, '#a0f0ff', d.spread ? 6 : 3, 120, 0.18, 1.6);
          break;
        case 'shotEnd':
          fx.burst(d.x, d.y, '#7fe3ff', 5, 110, 0.25, 1.6);
          break;
        case 'cancel':
          fx.burst(d.x, d.y, '#ffffff', 8, 140, 0.3, 1.8);
          break;
        case 'enemyShot':
          fx.burst(d.x, d.y, '#ff9f43', 5, 90, 0.25, 1.6);
          break;
        case 'overheat':
          fx.text(g.player.x + 12, g.player.y - 24, 'SOBREAQUECIMENTO!', '#ff6b6b', 14, 1.1);
          break;
        case 'bomb':
          fx.ring(d.x, d.y, '#ffffff', C.BOMB_RADIUS, 0.7, 8);
          fx.ring(d.x, d.y, '#ffd166', C.BOMB_RADIUS * 0.7, 0.55, 5);
          fx.burst(d.x, d.y, '#fff3a0', 50, 520, 0.8, 3);
          fx.flash('255,250,220', 0.55);
          fx.addShake(10);
          fx.text(d.x, d.y - 60, 'REFRESH!', '#fff3a0', 26, 1.3);
          break;
        case 'bombItem':
          fx.burst(d.x, d.y, '#ffd166', 18, 200, 0.6, 2.4);
          fx.text(d.x, d.y - 24, '+1 BOMBA DE REFRESH', '#ffe08a', 14, 1.3);
          break;
        case 'bossIntro':
          fx.flash('255,40,80', 0.25);
          fx.addShake(8);
          this.snap = false;
          break;
        case 'bossLand':
          fx.addShake(d.big ? 14 : 8);
          fx.burst(d.x, d.y, '#ff7ad0', 26, 300, 0.6, 3);
          break;
        case 'bossJump':
          fx.burst(d.x, d.y, '#ff7ad0', 14, 200, 0.4, 2.4);
          break;
        case 'splash':
          fx.burst(d.x, d.y, '#ff6ac1', 10, 150, 0.4, 2.2);
          break;
        case 'bossHit':
          fx.burst(d.x, d.y, '#ffffff', 6, 160, 0.3, 2);
          fx.burst(d.x, d.y, '#7fe3ff', 6, 200, 0.35, 2);
          break;
        case 'deflect':
          fx.ring(d.x, d.y, '#7fe3ff', 20, 0.3, 2);
          break;
        case 'shield':
          fx.ring(d.boss.x + d.boss.w / 2, d.boss.y + d.boss.h / 2, '#7fe3ff', d.boss.w * 0.7, 0.5, 4);
          break;
        case 'bossShot':
          fx.burst(d.x, d.y, '#ff4d6d', 12, 200, 0.4, 2.4);
          break;
        case 'summon':
          fx.ring(d.x, d.y, '#ff4fd8', 90, 0.5, 4);
          break;
        case 'junkHit':
          fx.burst(d.x, d.y, '#9aa3b8', 12, 180, 0.4, 2.4);
          fx.addShake(3);
          break;
        case 'laserOn':
          fx.addShake(6);
          fx.flash('255,40,80', 0.18);
          break;
        case 'bossPhase':
          fx.flash('255,80,120', 0.3);
          fx.addShake(10);
          if (g.boss) fx.text(g.boss.x + g.boss.w / 2, g.boss.y - 30, d.phase === 3 ? 'FÚRIA TOTAL!' : 'FASE 2!', '#ff8099', 22, 1.6);
          break;
        case 'bossBoom':
          fx.burst(d.x, d.y, Math.random() < 0.5 ? '#ffd166' : '#ff4d6d', 18, 260, 0.6, 3);
          fx.ring(d.x, d.y, '#ffffff', 40, 0.35, 3);
          fx.addShake(4);
          break;
        case 'bossDefeated':
          fx.flash('255,255,255', 0.7);
          fx.addShake(16);
          fx.confetti(d.x, d.y, ['#4cc9ff', '#ff4fd8', '#ffd166', '#7dffb5', '#a78bfa'], 160);
          fx.text(d.x, d.y - 40, 'MEMÓRIA REPARADA! +10 000', '#ffe08a', 22, 2.4);
          break;
        case 'unlock':
          fx.text(g.player.x + 12, g.player.y - 60, 'NOVA ARMA: DISPARO DUAL CHANNEL', '#ffd166', 16, 2.6);
          break;
        default:
          break;
      }
    }

    // ------------------------------------------------------------- dibujo
    draw(dt) {
      const ctx = this.ctx, g = this.game;
      const live = g.state === 'playing' || g.state === 'title' || g.state === 'cleared';
      const sdt = live ? dt : 0;
      this.t += sdt;
      this.updateCamera(sdt);

      // estela y polvo
      const p = g.player;
      if (sdt > 0 && g.state !== 'title') {
        const fast = Math.abs(p.vx) > 620 || g.dashTime > 0;
        if (fast && !p.dead) {
          this.trail.push({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
          if (this.trail.length > 9) this.trail.shift();
        } else if (this.trail.length) this.trail.shift();
        if (p.onGround && Math.abs(p.vx) > 330 && !p.dead) {
          this.dustAcc += sdt * (Math.abs(p.vx) / 40);
          while (this.dustAcc > 1) {
            this.dustAcc -= 1;
            this.fx.burst(p.x + p.w / 2 - Math.sign(p.vx) * 10, p.y + p.h - 1, p.mud ? '#c08040' : g.theme.glow, 1, 60, 0.35, 1.6);
          }
        }
      }

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.drawBackground(ctx);

      // Transformación de mundo (redondeada a píxel de dispositivo para evitar costuras)
      const k = this.es * this.dpr;
      let sx = 0, sy = 0;
      const sh = this.fx.shake;
      if (sh > 0.2) { sx = (Math.random() - 0.5) * sh * 2; sy = (Math.random() - 0.5) * sh * 2; }
      const tx = Math.round((-this.camX * this.es + sx) * this.dpr);
      const ty = Math.round((-this.camY * this.es + sy) * this.dpr);
      ctx.setTransform(k, 0, 0, k, tx, ty);

      this.drawTiles(ctx);
      this.drawDynamicTiles(ctx);

      const viewL = this.camX - 80, viewR = this.camX + this.W / this.es + 80;
      const vis = (x) => x > viewL && x < viewR;
      for (const cp of g.checkpoints) if (vis(cp.x)) this.drawCheckpoint(ctx, cp);
      if (g.goal && vis(g.goal.x + g.goal.w / 2)) this.drawGoal(ctx, g.goal);
      for (const s of g.springs) if (vis(s.x)) this.drawSpring(ctx, s);
      for (const ch of g.chips) if (!ch.taken && vis(ch.x)) this.drawChip(ctx, ch.x + ch.w / 2, ch.y + ch.h / 2 + Math.sin(this.t * 2 + ch.phase) * 2, ch.phase, 1);
      for (const m of g.modules) if (!m.taken && vis(m.x)) this.drawModule(ctx, m);
      for (const s of g.scatter) {
        if (!vis(s.x)) continue;
        const left = s.life - s.age;
        const a = left < 1.2 ? (Math.floor(left * 12) % 2 ? 0.25 : 1) : 1;
        this.drawChip(ctx, s.x, s.y, s.x * 0.1, a);
      }
      for (const bi of g.bombItems) if (!bi.taken && vis(bi.x)) this.drawBombItem(ctx, bi);
      for (const e of g.enemies) if (vis(e.x)) this.drawEnemy(ctx, e);
      this.drawBoss(ctx);
      if (g.state !== 'title') this.drawPlayer(ctx);
      this.drawProjectiles(ctx);
      this.fx.draw(ctx);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawScreenFX(ctx);
    }

    drawScreenFX(ctx) {
      const g = this.game, W = this.W, H = this.H;
      ctx.drawImage(this.vigCanvas, 0, 0, W, H);
      if (g.dashTime > 0 && g.state !== 'title') {
        const a = 0.02 + 0.03 * Math.sin(this.t * 10);
        const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
        grd.addColorStop(0, 'rgba(76,201,255,0)');
        grd.addColorStop(1, `rgba(255,79,216,${a + 0.1})`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
        // líneas de velocidad
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,200,250,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const y = hash(i, Math.floor(this.t * 20)) * H;
          const x = hash(i + 7, Math.floor(this.t * 20)) * W;
          ctx.moveTo(x, y); ctx.lineTo(x - 120, y);
        }
        ctx.stroke();
        ctx.restore();
      }
      // efecto glitch al morir
      const p = g.player;
      if (p.dead && p.deadT < 0.7 && g.state !== 'title') {
        const dpr = this.dpr;
        for (let i = 0; i < 6; i++) {
          const y = Math.random() * H, h = 6 + Math.random() * 26;
          const off = (Math.random() - 0.5) * 40;
          ctx.drawImage(this.canvas, 0, y * dpr, W * dpr, h * dpr, off, y, W, h);
        }
        ctx.fillStyle = 'rgba(255,0,60,0.08)';
        ctx.fillRect(0, 0, W, H);
      }
      if (this.fx.flashA > 0) {
        ctx.fillStyle = `rgba(${this.fx.flashColor},${this.fx.flashA})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  RR.Renderer = Renderer;
})();
