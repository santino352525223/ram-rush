/* =========================================================================
   RAM RUSH — Sistema de partículas y efectos (chispas, anillos, textos, haces)
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const TAU = Math.PI * 2;
  const MAX_PARTS = 900;

  class FX {
    constructor() { this.clear(); }

    clear() {
      this.parts = [];
      this.rings = [];
      this.texts = [];
      this.shake = 0;
      this.flashA = 0;
      this.flashColor = '255,255,255';
    }

    burst(x, y, color, n = 14, spd = 160, life = 0.6, size = 2.6) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = spd * (0.25 + Math.random() * 0.75);
        const l = life * (0.6 + Math.random() * 0.6);
        this.parts.push({ k: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, size: size * (0.5 + Math.random() * 0.9), color });
      }
      this.cap();
    }

    // Chispas que caen como confeti (subida de nivel).
    confetti(x, y, colors, n = 60) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const s = 220 + Math.random() * 320;
        const l = 1.2 + Math.random() * 0.8;
        this.parts.push({ k: 2, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, size: 2 + Math.random() * 3, color: colors[i % colors.length] });
      }
      this.cap();
    }

    // Haz de datos que viaja de A a B (carga en RAM, page-in, etc.).
    beam(x1, y1, x2, y2, color, n = 8, dur = 0.38) {
      for (let i = 0; i < n; i++) {
        const j = 6;
        this.parts.push({
          k: 1, x1, y1, x2: x2 + (Math.random() - 0.5) * j, y2: y2 + (Math.random() - 0.5) * j,
          t: -i * 0.035, dur, color, size: 2.2 + Math.random() * 1.6,
          arc: (Math.random() - 0.5) * 60, px: x1, py: y1,
        });
      }
      this.cap();
    }

    ring(x, y, color, r1 = 50, life = 0.5, width = 2, r0 = 4) {
      this.rings.push({ x, y, color, r0, r1, life, max: life, width });
    }

    text(x, y, str, color = '#fff', size = 16, life = 1.1) {
      this.texts.push({ x, y, str, color, size, life, max: life });
      if (this.texts.length > 40) this.texts.shift();
    }

    flash(rgb, a = 0.35) {
      this.flashColor = rgb;
      this.flashA = Math.max(this.flashA, a);
    }

    addShake(v) { this.shake = Math.min(16, this.shake + v); }

    cap() {
      if (this.parts.length > MAX_PARTS) this.parts.splice(0, this.parts.length - MAX_PARTS);
    }

    update(dt) {
      if (dt <= 0) return;
      this.shake = Math.max(0, this.shake - dt * 28);
      this.flashA = Math.max(0, this.flashA - dt * 1.8);
      const drag = Math.pow(0.04, dt);
      const ps = this.parts;
      let w = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.k === 1) {
          p.t += dt / p.dur;
          if (p.t >= 1) continue;
        } else {
          p.life -= dt;
          if (p.life <= 0) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.k === 2) { p.vy += 520 * dt; p.vx *= Math.pow(0.5, dt); }
          else { p.vx *= drag; p.vy *= drag; }
        }
        ps[w++] = p;
      }
      ps.length = w;

      for (let i = this.rings.length - 1; i >= 0; i--) {
        this.rings[i].life -= dt;
        if (this.rings[i].life <= 0) this.rings.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        t.y -= 34 * dt;
        if (t.life <= 0) this.texts.splice(i, 1);
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        if (p.k === 1) {
          if (p.t < 0) continue;
          const e = 1 - Math.pow(1 - p.t, 3);
          const nx = p.x1 + (p.x2 - p.x1) * e;
          const ny = p.y1 + (p.y2 - p.y1) * e + Math.sin(e * Math.PI) * p.arc;
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(nx, ny);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(nx, ny, p.size * 0.7, 0, TAU);
          ctx.fill();
          p.px = nx; p.py = ny;
        } else {
          const a = p.life / p.max;
          ctx.globalAlpha = Math.min(1, a * 1.4);
          ctx.fillStyle = p.color;
          const s = p.size * (p.k === 2 ? 1 : 0.4 + a * 0.6);
          if (p.k === 2) ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s * 1.6);
          else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, s, 0, TAU);
            ctx.fill();
          }
        }
      }
      for (const r of this.rings) {
        const t = 1 - r.life / r.max;
        const e = 1 - Math.pow(1 - t, 2);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const age = 1 - t.life / t.max;
        const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.55 : 1.15 - Math.min(0.15, (age - 0.12) * 0.6);
        ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
        ctx.font = `800 ${Math.round(t.size * pop)}px "Exo 2", "Segoe UI", sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(5,8,16,0.85)';
        ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.restore();
    }
  }

  RR.FX = FX;
})();
