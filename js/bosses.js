/* =========================================================================
   RAM RUSH — Chefes adicionais: comportamento (IA) e desenho
   Verme do Buffer Overflow · Golem da Fragmentação · Fantasma do Page Fault
   · Dragão do Overclock. Os chefes originais estão em game.js / renderer.js.
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const T = RR.CONFIG.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

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

  // Rasto de posições (para corpos segmentados: verme e cauda do dragão).
  function pushTrail(b, n) {
    b.hist.push({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    if (b.hist.length > n) b.hist.shift();
  }
  // Coloca os segmentos ao longo do rasto com espaçamento constante (em píxeis).
  function segments(b, count, spacing) {
    const out = [];
    const h = b.hist;
    let need = spacing, acc = 0;
    for (let i = h.length - 1; i > 0 && out.length < count; i--) {
      const d = Math.hypot(h[i].x - h[i - 1].x, h[i].y - h[i - 1].y);
      acc += d;
      while (acc >= need && out.length < count) {
        const k = (acc - need) / (d || 1);
        out.push({ x: h[i - 1].x + (h[i].x - h[i - 1].x) * k, y: h[i - 1].y + (h[i].y - h[i - 1].y) * k });
        need += spacing;
      }
    }
    while (out.length < count && h.length) out.push(out.length ? out[out.length - 1] : h[0]);
    return out;
  }
  function aimed(game, b, n, spread, speed, kind, from) {
    const p = game.player;
    const sx = from ? from.x : b.x + b.w / 2, sy = from ? from.y : b.y + b.h / 2;
    const base = Math.atan2(p.y + p.h / 2 - sy, p.x + p.w / 2 - sx);
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * 2);
      game.bullets.push({ x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 9, life: 5, kind, glyph: Math.random() < 0.5 ? '0' : '1' });
    }
  }

  RR.BOSS_AI = {
    // ------------------------------------------------------------------ VERME
    worm: {
      init(game, b) { b.hist = []; b.hx = b.x + b.w / 2; b.hy = b.y + b.h / 2; b.dive = null; b.ang = 0; },
      update(game, b, dt) {
        const spd = [0.75, 0.95, 1.2][b.phase - 1];
        let tx, ty, k;
        if (b.dive) {
          b.dive.t += dt;
          tx = b.dive.x; ty = b.dive.y; k = 4.5;
          if (b.dive.t > 1.1) b.dive = null;
        } else {
          tx = b.cx + Math.sin(b.t * 0.8 * spd) * (b.range + 40);
          ty = b.homeY + 120 + Math.sin(b.t * 2.1 * spd) * 120;
          k = 2.6;
        }
        const nx = b.hx + (tx - b.hx) * Math.min(1, dt * k);
        const ny = b.hy + (ty - b.hy) * Math.min(1, dt * k);
        b.ang = Math.atan2(ny - b.hy, nx - b.hx);
        b.hx = nx; b.hy = clamp(ny, 2 * T, 13 * T);
        b.x = b.hx - b.w / 2; b.y = b.hy - b.h / 2;
        pushTrail(b, 600);
        b.segs = segments(b, 11, 26);
      },
      attack(game, b) {
        const opts = [['spit', 'dive'], ['spit', 'dive', 'acid'], ['spit', 'dive', 'acid', 'rain']][b.phase - 1];
        const a = pick(opts);
        const p = game.player;
        if (a === 'spit') { aimed(game, b, 3 + b.phase, 0.35, 260 + b.phase * 40, 'acid'); game.emit('bossShot', { x: b.hx, y: b.hy }); }
        else if (a === 'dive') { b.dive = { x: p.x + p.w / 2, y: p.y, t: 0 }; game.emit('bossJump', { x: b.hx, y: b.hy }); }
        else if (a === 'acid') {
          (b.segs || []).forEach((s, i) => { if (i % 2 === 0) game.bullets.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 140, vy: -120, g: 900, r: 9, life: 4, kind: 'acid', drip: true }); });
          game.emit('bossShot', { x: b.hx, y: b.hy });
        } else game.spawnRain(5 + b.phase, 'junk');
      },
      box(b) { return { x: b.hx - 28, y: b.hy - 24, w: 56, h: 48 }; },
      hurtRects(b) { return (b.segs || []).map((s, i) => { const r = 18 - i * 0.6; return { x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 }; }); },
      blockers(b) { return this.hurtRects(b); },
      draw(R, ctx, b) {
        const t = R.t, flash = b.hurtT > 0;
        const segs = b.segs || [];
        ctx.save();
        if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        ctx.globalCompositeOperation = 'lighter';
        R.drawGlow(ctx, b.hx, b.hy, 90, 'rgba(157,255,58,0.35)');
        ctx.globalCompositeOperation = 'source-over';
        for (let i = segs.length - 1; i >= 0; i--) {
          const s = segs[i];
          const r = 18 - i * 0.6;
          const g = ctx.createRadialGradient(s.x - 4, s.y - 4, 2, s.x, s.y, r);
          g.addColorStop(0, '#d4ffa8'); g.addColorStop(0.5, i % 2 ? '#5fae1c' : '#7ed321'); g.addColorStop(1, '#1f4a08');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(20,40,5,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.font = '800 8px monospace'; ctx.fillStyle = 'rgba(20,50,5,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(((i * 37 + 0xA0) & 0xFF).toString(16).toUpperCase(), s.x, s.y);
        }
        // cabeça
        ctx.save();
        ctx.translate(b.hx, b.hy);
        ctx.rotate(b.ang);
        const hg = ctx.createRadialGradient(-6, -8, 3, 0, 0, 30);
        hg.addColorStop(0, flash ? '#fff' : '#e6ffb8'); hg.addColorStop(0.5, flash ? '#fff' : '#8be026'); hg.addColorStop(1, '#2a6008');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.ellipse(0, 0, 32, 25, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d4ffa8'; ctx.lineWidth = 2; ctx.stroke();
        // boca com dentes
        const open = 0.35 + 0.25 * Math.sin(t * 8);
        ctx.fillStyle = '#1a0805';
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(34, -14 * open - 4); ctx.lineTo(34, 14 * open + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(20 + i * 5, -4); ctx.lineTo(22 + i * 5, 2); ctx.lineTo(24 + i * 5, -4); ctx.fill(); }
        // olhos
        for (const ey of [-10, 10]) {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(4, ey, 6, 0, TAU); ctx.fill();
          ctx.fillStyle = b.phase === 3 ? '#ff1744' : '#1a0805'; ctx.beginPath(); ctx.arc(6, ey, 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.font = '900 10px monospace'; ctx.fillStyle = '#d4ffa8'; ctx.textAlign = 'center';
        ctx.fillText('OVERFLOW!', b.hx, b.hy - 38);
        ctx.restore();
      },
    },

    // ------------------------------------------------------------------ GOLEM
    golem: {
      init(game, b) {
        b.vx = 0; b.vy = 0; b.jumping = false; b.squash = 0;
        b.blocks = [];
        const cols = ['#5b4f7a', '#6d5e94', '#4b4266', '#7a6aa8', '#3d3655'];
        for (let i = 0; i < 16; i++) {
          b.blocks.push({ x: (i % 4) * 0.25 + (Math.random() - 0.5) * 0.05, y: Math.floor(i / 4) * 0.22 + 0.08, w: 0.22 + Math.random() * 0.06, h: 0.18 + Math.random() * 0.05, c: cols[i % cols.length], addr: (0x1000 + i * 0x40 * 7).toString(16).toUpperCase(), lost: false });
        }
      },
      update(game, b, dt) {
        const p = game.player;
        const ax0 = game.arena.x0 + T, ax1 = game.arena.x1 - T;
        b.squash = Math.max(0, b.squash - dt * 3);
        if (b.jumping) {
          b.vy = Math.min(1400, b.vy + 2300 * dt);
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.y >= b.homeY) {
            b.y = b.homeY; b.vy = 0; b.jumping = false; b.squash = 1;
            const sp = 340 + b.phase * 50;
            game.waves.push({ x: b.x + 10, dir: -1, speed: sp, life: 3 });
            game.waves.push({ x: b.x + b.w - 10, dir: 1, speed: sp, life: 3 });
            game.emit('bossLand', { x: b.x + b.w / 2, y: b.groundY, big: true });
          }
        } else {
          const dir = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
          b.x += dir * [45, 65, 90][b.phase - 1] * dt;
        }
        if (b.x < ax0) b.x = ax0;
        if (b.x + b.w > ax1) b.x = ax1 - b.w;
        // perde blocos à medida que perde vida (fragmentação)
        const lostN = Math.floor((1 - b.hp / b.max) * 10);
        b.blocks.forEach((bl, i) => { bl.lost = i < lostN; });
      },
      attack(game, b) {
        const opts = [['throw', 'throw', 'stomp'], ['throw', 'stomp', 'fragment'], ['throw', 'stomp', 'fragment', 'rain']][b.phase - 1];
        const a = b.jumping ? 'throw' : pick(opts);
        const p = game.player;
        if (a === 'throw') {
          const n = 1 + b.phase;
          for (let i = 0; i < n; i++) {
            const sx = b.x + b.w / 2, sy = b.y + 20;
            const tx = p.x + p.w / 2 + (i - (n - 1) / 2) * 70;
            game.bullets.push({ x: sx, y: sy, vx: (tx - sx) / 1.05, vy: -620 - i * 30, g: 1250, r: 13, life: 4, kind: 'block', drip: true });
          }
          game.emit('bossShot', { x: b.x + b.w / 2, y: b.y });
        } else if (a === 'stomp') {
          b.jumping = true; b.vy = -820; b.vx = (p.x < b.x ? -1 : 1) * (140 + b.phase * 40);
          game.emit('bossJump', { x: b.x + b.w / 2, y: b.y + b.h });
        } else if (a === 'fragment') {
          for (const side of [-1, 1]) {
            const e = game.makeEnemy('spiky', { x: b.x + b.w / 2 + side * (b.w / 2 + 30) - T / 2, y: 13 * T });
            e.summoned = true; e.dir = side;
            game.enemies.push(e);
          }
          game.emit('summon', { x: b.x + b.w / 2, y: b.y + b.h / 2 });
        } else game.spawnRain(5 + b.phase, 'junk');
      },
      box(b) { return { x: b.x + b.w * 0.15, y: b.y + b.h * 0.1, w: b.w * 0.7, h: b.h * 0.75 }; },
      draw(R, ctx, b) {
        const t = R.t, flash = b.hurtT > 0;
        const sq = b.squash || 0;
        ctx.save();
        if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
        const cx = b.x + b.w / 2, by = b.y + b.h;
        ctx.translate(cx, by);
        ctx.scale(1 + sq * 0.15, 1 - sq * 0.12);
        ctx.translate(-cx, -by);
        ctx.globalCompositeOperation = 'lighter';
        R.drawGlow(ctx, cx, b.y + b.h * 0.45, b.w, b.phase === 3 ? 'rgba(255,80,80,0.4)' : 'rgba(201,168,255,0.35)');
        ctx.globalCompositeOperation = 'source-over';
        // pernas
        ctx.fillStyle = '#3d3655';
        const step = b.jumping ? 0 : Math.sin(t * 5) * 6;
        rr(ctx, b.x + b.w * 0.18 + step, by - 30, 34, 30, 6); ctx.fill();
        rr(ctx, b.x + b.w * 0.58 - step, by - 30, 34, 30, 6); ctx.fill();
        // braços
        ctx.fillStyle = '#4b4266';
        const sw = Math.sin(t * 3) * 8;
        rr(ctx, b.x - 18, b.y + 30 + sw, 26, 60, 8); ctx.fill();
        rr(ctx, b.x + b.w - 8, b.y + 30 - sw, 26, 60, 8); ctx.fill();
        // blocos do corpo
        for (const bl of b.blocks) {
          if (bl.lost) continue;
          const x = b.x + bl.x * b.w, y = b.y + bl.y * (b.h - 30);
          const w = bl.w * b.w, h = bl.h * (b.h - 30);
          rr(ctx, x, y, w, h, 3);
          ctx.fillStyle = flash ? '#ffffff' : bl.c;
          ctx.fill();
          ctx.strokeStyle = 'rgba(232,220,255,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.font = '700 6px monospace'; ctx.fillStyle = 'rgba(232,220,255,0.6)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('0x' + bl.addr, x + 2, y + 2);
        }
        // núcleo
        const coreY = b.y + b.h * 0.38;
        const pulse = 0.6 + 0.4 * Math.sin(t * 6);
        ctx.globalCompositeOperation = 'lighter';
        R.drawGlow(ctx, cx, coreY, 34 + pulse * 10, b.phase === 3 ? 'rgba(255,60,60,0.8)' : 'rgba(255,209,102,0.8)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = b.phase === 3 ? '#ff4d4d' : '#ffd166';
        ctx.beginPath(); ctx.arc(cx, coreY, 10, 0, TAU); ctx.fill();
        // olhos
        ctx.fillStyle = '#fff3a0';
        ctx.fillRect(cx - 24, b.y + 14, 12, 5); ctx.fillRect(cx + 12, b.y + 14, 12, 5);
        ctx.restore();
      },
    },

    // ----------------------------------------------------------------- FANTASMA
    ghost: {
      init(game, b) { b.alpha = 1; b.vanish = 0; b.visibleT = 4; b.fx = b.cx; b.fy = b.homeY; },
      update(game, b, dt) {
        if (b.vanish > 0) {
          b.alpha = Math.max(0, b.alpha - dt * 3);
          b.vanish -= dt;
          if (b.vanish <= 0) {
            const a = game.arena;
            b.fx = a.x0 + 3 * T + Math.random() * (a.x1 - a.x0 - 6 * T);
            b.fy = b.homeY - 40 + Math.random() * 140;
            b.visibleT = [4.2, 3.4, 2.7][b.phase - 1];
            game.emit('bossTeleport', { x: b.fx, y: b.fy });
          }
        } else {
          b.alpha = Math.min(1, b.alpha + dt * 2.5);
          b.visibleT -= dt;
          if (b.visibleT <= 0) { b.vanish = [1.3, 1.1, 0.9][b.phase - 1]; game.hint('vanish'); }
        }
        b.x = b.fx - b.w / 2 + Math.sin(b.t * 1.3) * 40;
        b.y = b.fy + Math.sin(b.t * 2.2) * 18;
      },
      attack(game, b) {
        if (b.alpha < 0.8) { b.attackT = 0.4; return; }
        const opts = [['ring', 'bits'], ['ring', 'bits', 'summon', 'rain'], ['ring', 'bits', 'summon', 'rain', 'ring']][b.phase - 1];
        const a = pick(opts);
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (a === 'ring') {
          const n = 10 + b.phase * 3, off = Math.random() * TAU;
          for (let i = 0; i < n; i++) {
            const ang = off + (i / n) * TAU;
            game.bullets.push({ x: cx, y: cy, vx: Math.cos(ang) * 190, vy: Math.sin(ang) * 190, r: 9, life: 5, kind: 'ghost' });
          }
          game.emit('bossShot', { x: cx, y: cy });
        } else if (a === 'bits') { aimed(game, b, 4 + b.phase, 0.4, 260, 'ghost'); game.emit('bossShot', { x: cx, y: cy }); }
        else if (a === 'summon') {
          for (const side of [-1, 1]) {
            const e = game.makeEnemy('drone', { x: cx + side * 90, y: cy });
            e.summoned = true; e.amp = 80; e.baseY = Math.min(e.baseY, 11 * T);
            game.enemies.push(e);
          }
          game.emit('summon', { x: cx, y: cy });
        } else game.spawnRain(5 + b.phase, 'junk');
      },
      canHit(b) { return b.alpha > 0.6; },
      canTouch(b) { return b.alpha > 0.5; },
      box(b) { return { x: b.x + 14, y: b.y + 10, w: b.w - 28, h: b.h - 20 }; },
      draw(R, ctx, b) {
        const t = R.t, flash = b.hurtT > 0;
        const a = b.state === 'intro' ? 1 : b.alpha;
        if (a <= 0.02) return;
        ctx.save();
        ctx.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 9));
        if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        const cx = b.x + b.w / 2, top = b.y;
        ctx.globalCompositeOperation = 'lighter';
        R.drawGlow(ctx, cx, top + b.h / 2, b.w * 1.1, 'rgba(127,255,225,0.45)');
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(0, top, 0, top + b.h);
        g.addColorStop(0, flash ? '#ffffff' : 'rgba(220,255,248,0.95)');
        g.addColorStop(1, 'rgba(127,255,225,0.25)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - b.w / 2, top + b.h);
        ctx.lineTo(cx - b.w / 2, top + b.h * 0.45);
        ctx.bezierCurveTo(cx - b.w / 2, top - 10, cx + b.w / 2, top - 10, cx + b.w / 2, top + b.h * 0.45);
        ctx.lineTo(cx + b.w / 2, top + b.h);
        for (let i = 0; i < 5; i++) {
          const x0 = cx + b.w / 2 - (i + 0.5) * (b.w / 5);
          ctx.lineTo(x0, top + b.h - 16 - Math.sin(t * 6 + i) * 6);
          ctx.lineTo(x0 - b.w / 10, top + b.h);
        }
        ctx.closePath();
        ctx.fill();
        // olhos "404"
        ctx.font = '900 20px monospace';
        ctx.fillStyle = b.phase === 3 ? '#ff1744' : '#0b2a26';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('4', cx - 22, top + 44);
        ctx.fillText('4', cx + 22, top + 44);
        ctx.beginPath(); ctx.ellipse(cx, top + 72, 14, 9 + Math.sin(t * 5) * 3, 0, 0, TAU); ctx.fill();
        ctx.font = '800 9px monospace'; ctx.fillStyle = '#0b2a26';
        ctx.fillText('PAGE FAULT', cx, top + 96);
        ctx.restore();
      },
    },

    // ------------------------------------------------------------------ DRAGÃO
    dragon: {
      shield: true,
      init(game, b) { b.hist = []; b.flameT = 0; b.flameAcc = 0; },
      update(game, b, dt) {
        const spd = [0.6, 0.8, 1.05][b.phase - 1];
        b.x = b.cx - b.w / 2 + Math.sin(b.t * spd) * b.range;
        b.y = b.homeY + Math.sin(b.t * 1.3 * spd) * 60;
        pushTrail(b, 600);
        b.segs = segments(b, 7, 22);
        if (b.flameT > 0) {
          b.flameT -= dt;
          b.flameAcc += dt;
          const p = game.player;
          const mx = b.x + b.w / 2 + (p.x > b.x + b.w / 2 ? 60 : -60), my = b.y + b.h * 0.7;
          while (b.flameAcc > 0.07) {
            b.flameAcc -= 0.07;
            // mira para onde o jogador ESTAVA no início da rajada: dá para fugir
            if (!b.flameAim) b.flameAim = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
            const ang = Math.atan2(b.flameAim.y - my, b.flameAim.x - mx) + (Math.random() - 0.5) * 0.5;
            const sp = 300 + Math.random() * 60;
            game.bullets.push({ x: mx, y: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 10, life: 1.6, kind: 'fire' });
          }
        }
      },
      attack(game, b) {
        const opts = [['flame', 'meteor'], ['flame', 'meteor', 'heat'], ['flame', 'meteor', 'heat', 'flame']][b.phase - 1];
        let a = pick(opts);
        if (a === 'heat' && game.laser) a = 'flame';
        if (a === 'flame') { b.flameT = 0.75 + b.phase * 0.2; b.flameAim = null; game.emit('bossShot', { x: b.x + b.w / 2, y: b.y + b.h / 2 }); }
        else if (a === 'meteor') game.spawnRain(6 + b.phase * 2, 'meteor');
        else { game.laser = { y: 14 * T - 16, warn: 1.1, on: 0.75, hit: false, kind: 'heat' }; game.emit('laserWarn'); }
      },
      box(b) { return { x: b.x + 20, y: b.y + 10, w: b.w - 40, h: b.h - 20 }; },
      draw(R, ctx, b) {
        const t = R.t, flash = b.hurtT > 0, g = R.game;
        const p = g.player;
        const face = p.x + p.w / 2 > b.x + b.w / 2 ? 1 : -1;
        ctx.save();
        if (b.state === 'dying') ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ctx.globalCompositeOperation = 'lighter';
        R.drawGlow(ctx, cx, cy, b.w * 0.9, b.phase === 3 ? 'rgba(255,60,20,0.55)' : 'rgba(255,122,26,0.45)');
        ctx.globalCompositeOperation = 'source-over';
        // cauda de dissipadores
        (b.segs || []).forEach((s, i) => {
          const r = 16 - i * 1.6;
          ctx.fillStyle = i % 2 ? '#8a2a0a' : '#b0400e';
          ctx.beginPath(); ctx.arc(s.x, s.y + 10, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 1; ctx.stroke();
        });
        // asas (ventoinhas)
        for (const s of [-1, 1]) {
          ctx.save();
          ctx.translate(cx + s * 50, cy - 26);
          ctx.fillStyle = 'rgba(60,20,10,0.85)';
          ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2; ctx.stroke();
          ctx.rotate(t * 18 * s);
          ctx.fillStyle = 'rgba(255,170,90,0.6)';
          for (let i = 0; i < 5; i++) { ctx.rotate(TAU / 5); ctx.beginPath(); ctx.ellipse(14, 0, 14, 5, 0.4, 0, TAU); ctx.fill(); }
          ctx.restore();
        }
        // corpo: chip a ferver
        rr(ctx, b.x + 30, b.y + 20, b.w - 60, b.h - 30, 12);
        const bg = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        bg.addColorStop(0, flash ? '#fff' : '#d2531a'); bg.addColorStop(1, flash ? '#ffd' : '#5a1405');
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 2.5; ctx.stroke();
        // aletas de dissipador
        ctx.fillStyle = 'rgba(255,200,120,0.35)';
        for (let i = 0; i < 7; i++) ctx.fillRect(b.x + 44 + i * ((b.w - 88) / 6), b.y + 26, 5, b.h - 46);
        ctx.font = '900 11px monospace'; ctx.fillStyle = '#fff3d0'; ctx.textAlign = 'center';
        ctx.fillText(`${(4.8 + b.phase * 0.9).toFixed(1)} GHz · ${85 + b.phase * 7}°C`, cx, b.y + b.h - 16);
        // cabeça
        const hx = cx + face * (b.w / 2 - 6), hy = cy + 4;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(face, 1);
        ctx.fillStyle = flash ? '#fff' : '#b0400e';
        ctx.beginPath(); ctx.moveTo(-20, -24); ctx.lineTo(30, -12); ctx.lineTo(40, 6); ctx.lineTo(28, 18); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#ff2a00';
        ctx.beginPath(); ctx.moveTo(-14, -24); ctx.lineTo(-22, -40); ctx.lineTo(-4, -26); ctx.fill();
        ctx.fillStyle = '#fff3a0';
        ctx.beginPath(); ctx.ellipse(12, -8, 6, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillRect(13, -11, 2, 6);
        if (b.flameT > 0) {
          ctx.globalCompositeOperation = 'lighter';
          R.drawGlow(ctx, 44, 8, 30, 'rgba(255,180,60,0.9)');
        }
        ctx.restore();
        ctx.restore();
      },
    },
  };
})();
