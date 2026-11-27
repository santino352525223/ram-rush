/* =========================================================================
   RAM RUSH — Lógica do jogo (física, inimigos, objetos, chefe final)
   Não desenha nada: emite eventos que o render, o áudio e a interface ouvem.
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const C = RR.CONFIG;
  const T = C.TILE;
  const BEST_KEY = 'ramrush.v3.best';

  const SOLID = { '#': 1, '~': 1, '>': 1, '<': 1 };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function seeded(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  class Game {
    constructor() {
      this.listeners = [];
      this.hintsShown = {};
      this.best = 0;
      try { this.best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { /* sem storage */ }
      this.input = { left: false, right: false, jump: false, down: false, jumpPressed: false };
      this.state = 'title'; // title | playing | paused | cleared | gameover | victory
      this.score = 0;
      this.lives = C.LIVES;
      this.levelIndex = 0;
      this.totals = { chips: 0, kills: 0, modules: 0, deaths: 0, leaks: 0, bosses: 0 };
      this.weapons = { spread: false };
      this.weapon = 'ecc';
      this.bombs = C.BOMBS_START;
      this.loadLevel(0);
      this.state = 'title';
    }

    on(fn) { this.listeners.push(fn); }
    off(fn) { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }
    emit(type, data) { const d = data || {}; for (const fn of this.listeners.slice()) fn(type, d); }

    // ------------------------------------------------------------- partidas
    startNew() {
      this.score = 0;
      this.lives = C.LIVES;
      this.totals = { chips: 0, kills: 0, modules: 0, deaths: 0, leaks: 0, bosses: 0 };
      this.weapons = { spread: false };
      this.weapon = 'ecc';
      this.bombs = C.BOMBS_START;
      this.loadLevel(0);
      this.state = 'playing';
      this.emit('start');
      this.emit('level', { index: 0, def: this.def });
    }

    restartLevel() {
      this.score = this.levelStartScore;
      if (this.levelStartBombs != null) this.bombs = this.levelStartBombs;
      this.lives = Math.max(this.lives, 1);
      this.loadLevel(this.levelIndex);
      this.state = 'playing';
      this.emit('start');
      this.emit('level', { index: this.levelIndex, def: this.def, restart: true });
    }

    continueLevel() {
      this.lives = C.LIVES;
      this.restartLevel();
    }

    nextLevel() {
      if (this.state !== 'cleared') return;
      if (this.levelIndex + 1 >= RR.LEVELS.length) { this.victory(); return; }
      this.loadLevel(this.levelIndex + 1);
      this.state = 'playing';
      this.emit('start');
      this.emit('level', { index: this.levelIndex, def: this.def });
    }

    pause() { if (this.state === 'playing') { this.state = 'paused'; this.clearInput(); this.emit('pause'); } }
    resume() { if (this.state === 'paused') { this.state = 'playing'; this.emit('resume'); } }
    clearInput() { const i = this.input; i.left = i.right = i.jump = i.down = i.jumpPressed = false; }

    loadLevel(index) {
      this.levelIndex = index;
      this.def = RR.LEVELS[index];
      this.theme = RR.THEMES[this.def.theme];
      const lv = RR.buildLevel(this.def);
      this.tiles = lv.tiles;
      this.cols = lv.cols;
      this.rows = lv.rows;
      this.worldW = this.cols * T;
      this.worldH = this.rows * T;
      this.levelStartScore = this.score;
      this.time = 0;
      this.ram = 0;
      this.energy = 0;
      this.dashTime = 0;
      this.gcCooldown = 0;
      this.shootCd = 0;
      this.heat = 0;
      this.overheat = false;
      this.waves = [];
      this.bombItems = [];
      this.levelStartBombs = this.bombs;
      this.chain = 0;
      this.chips = [];
      this.modules = [];
      this.springs = [];
      this.checkpoints = [];
      this.enemies = [];
      this.scatter = [];
      this.shots = [];
      this.bullets = [];
      this.junk = [];
      this.laser = null;
      this.boss = null;
      this.arena = null;
      this.arenaLocked = false;
      this.goal = null;
      this.moduleTotal = 0;
      this.modulesTaken = 0;
      const arenaSpan = lv.spans.find((s) => s.name === 'arena');
      if (arenaSpan) this.arena = { x0: arenaSpan.c0 * T, x1: (arenaSpan.c0 + arenaSpan.w) * T };
      let start = { x: 64, y: 13 * T };
      for (const o of lv.objects) {
        switch (o.ch) {
          case 'o': this.chips.push({ x: o.x + 6, y: o.y + 6, w: 20, h: 20, taken: false, phase: (o.c * 0.7) % 6.28 }); break;
          case 'D': this.modules.push({ x: o.x - 4, y: o.y + 4, w: 40, h: 24, taken: false }); this.moduleTotal++; break;
          case 'S': this.springs.push({ x: o.x + 2, y: o.y + T - 18, w: T - 4, h: 18, comp: 0 }); break;
          case 'C': this.checkpoints.push({ x: o.x + T / 2, y: o.y + T, active: false }); break;
          case 'G': this.goal = { x: o.x - 16, y: o.y + T - 104, w: 104, h: 104 }; break;
          case 'P': start = { x: o.x + 4, y: o.y + T }; break;
          case 'B': this.enemies.push(this.makeEnemy('bug', o)); break;
          case 'L': this.enemies.push(this.makeEnemy('leak', o)); break;
          case 'F': this.enemies.push(this.makeEnemy('drone', o)); break;
          case 'T': this.enemies.push(this.makeEnemy('turret', o)); break;
          case 'K': this.enemies.push(this.makeEnemy('spiky', o)); break;
          case 'Z': this.boss = this.makeBoss(o); break;
          case 'R': this.bombItems.push({ x: o.x + 4, y: o.y + 4, w: 24, h: 24, taken: false }); break;
          default: break;
        }
      }
      this.spawnPoint = start;
      this.populate();
      this.chipTotal = this.chips.length;
      this.player = this.makePlayer(start);
      this.clearInput();
    }

    // Distribui inimigos extra pelo nível (determinista: sempre igual em cada zona).
    populate() {
      const ex = this.def.extra;
      if (!ex) return;
      const rnd = seeded(1000 + this.levelIndex * 7919);
      const taken = this.enemies.map((e) => Math.floor(e.x / T));
      const avoid = [this.spawnPoint.x / T, ...this.checkpoints.map((c) => c.x / T), ...this.springs.map((s) => s.x / T)];
      if (this.goal) avoid.push(this.goal.x / T, this.goal.x / T + 3);
      const near = (c, list, d) => list.some((x) => Math.abs(x - c) < d);
      const limit = Math.min(this.cols - 10, this.arena ? this.arena.x0 / T - 6 : this.cols);
      let c = 20;
      while (true) {
        c += Math.max(4, Math.round(ex.every * (0.6 + rnd() * 0.8)));
        if (c >= limit) break;
        const type = ex.pool[Math.floor(rnd() * ex.pool.length)];
        if (near(c, taken, 4) || near(c, avoid, 7)) continue;
        if (type === 'drone') {
          let ok = true;
          for (let r = 7; r <= 12; r++) if (this.tile(c, r) !== '.') ok = false;
          if (!ok) continue;
          this.enemies.push(this.makeEnemy('drone', { x: c * T, y: (8 + Math.floor(rnd() * 3)) * T }));
        } else {
          let row = -1;
          for (let r = 3; r <= 13; r++) {
            if (this.tile(c, r) === '.' && this.tile(c, r - 1) === '.' && SOLID[this.tile(c, r + 1)] &&
                SOLID[this.tile(c - 1, r + 1)] && SOLID[this.tile(c + 1, r + 1)]) { row = r; break; }
          }
          if (row < 0) continue;
          this.enemies.push(this.makeEnemy(type, { x: c * T, y: row * T }));
        }
        taken.push(c);
      }
    }

    makePlayer(sp) {
      return {
        x: sp.x, y: sp.y - 38, w: 24, h: 38, vx: 0, vy: 0,
        onGround: true, facing: 1, ball: false, jumped: false, airJumps: 1,
        coyote: 0, buffer: 0, invuln: 0, dead: false, deadT: 0,
        mud: false, padT: 0, run: 0, spin: 0, stepOffset: 0, shootFlash: 0,
      };
    }

    makeEnemy(type, o) {
      const mul = this.def.speedMul || 1;
      const e = { type, alive: true, deadT: 0, t: Math.random() * 6, dir: -1, fireT: 1 + Math.random() * 1.5 };
      if (type === 'bug') { e.w = 30; e.h = 22; e.speed = 100 * mul; }
      else if (type === 'leak') { e.w = 30; e.h = 20; e.speed = 45 * mul; }
      else if (type === 'spiky') { e.w = 30; e.h = 24; e.speed = 70 * mul; }
      else if (type === 'turret') { e.w = 28; e.h = 30; e.speed = 0; }
      else { e.w = 28; e.h = 28; e.speed = 0; e.amp = 60 + Math.random() * 40; }
      e.x = o.x + (T - e.w) / 2;
      e.y = type === 'drone' ? o.y : o.y + T - e.h;
      e.baseX = e.x; e.baseY = e.y;
      return e;
    }

    makeBoss(o) {
      const kind = this.def.boss || 'module';
      const cfg = RR.BOSSES[kind];
      const w = cfg.w, h = cfg.h;
      const ground = 14 * T;
      const homeY = kind === 'leak' ? ground - h : o.y + 8;
      return {
        kind, name: cfg.name, subtitle: cfg.subtitle,
        x: o.x + T / 2 - w / 2, y: homeY - 380, homeY, w, h, groundY: ground,
        cx: o.x + T / 2, range: 0, vx: 0, vy: 0, onGround: false, hopT: 1.5, squash: 0,
        hp: cfg.hp, max: cfg.hp, phase: 1, state: 'waiting',
        t: 0, introT: 0, attackT: 2, hurtT: 0, shieldT: 0, shieldCd: 7, dashHitCd: 0, dyingT: 0, boomT: 0,
        nextDrop: cfg.hp - 12, lastAttack: '', spawn: { x: o.x, y: o.y },
      };
    }

    // ------------------------------------------------------------- tiles
    tile(c, r) {
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return '.';
      return this.tiles[r][c];
    }
    solidAt(c, r) { return !!SOLID[this.tile(c, r)]; }

    tryStep(e, col) {
      const feetRow = Math.floor((e.y + e.h - 0.01) / T);
      if (!this.solidAt(col, feetRow)) return false;
      const newY = feetRow * T - e.h;
      if (e.y - newY > T + 0.5 || e.y - newY < 0) return false;
      const top = Math.floor(newY / T), bottom = Math.floor((newY + e.h - 0.01) / T);
      const left = Math.floor(e.x / T), right = Math.floor((e.x + e.w - 0.01) / T);
      for (let r = top; r <= bottom; r++) {
        if (this.solidAt(col, r)) return false;
        for (let c = left; c <= right; c++) if (c !== col && this.solidAt(c, r)) return false;
      }
      e.stepOffset = (e.stepOffset || 0) + (e.y - newY);
      e.y = newY;
      return true;
    }

    moveX(e, dx, canStep) {
      e.x += dx;
      const top = Math.floor(e.y / T), bottom = Math.floor((e.y + e.h - 0.01) / T);
      let hit = false;
      if (dx > 0) {
        const col = Math.floor((e.x + e.w) / T);
        for (let r = top; r <= bottom; r++) {
          if (this.solidAt(col, r)) {
            if (canStep && this.tryStep(e, col)) break;
            e.x = col * T - e.w - 0.01; hit = true; break;
          }
        }
      } else if (dx < 0) {
        const col = Math.floor(e.x / T);
        for (let r = top; r <= bottom; r++) {
          if (this.solidAt(col, r)) {
            if (canStep && this.tryStep(e, col)) break;
            e.x = (col + 1) * T + 0.01; hit = true; break;
          }
        }
      }
      let minX = 0, maxX = this.worldW;
      if (this.arenaLocked && e === this.player) { minX = this.arena.x0 + 4; maxX = this.arena.x1 - 4; }
      if (e.x < minX) { e.x = minX; hit = true; }
      if (e.x + e.w > maxX) { e.x = maxX - e.w; hit = true; }
      if (hit) e.vx = 0;
      return hit;
    }

    moveY(e, dy) {
      const prevBottom = e.y + e.h;
      e.y += dy;
      const left = Math.floor(e.x / T), right = Math.floor((e.x + e.w - 0.01) / T);
      if (dy > 0) {
        const row = Math.floor((e.y + e.h) / T);
        for (let c = left; c <= right; c++) {
          const ch = this.tile(c, row);
          if (SOLID[ch] || (ch === '=' && prevBottom <= row * T + 0.5)) {
            e.y = row * T - e.h;
            e.vy = 0;
            return 'land';
          }
        }
      } else if (dy < 0) {
        const row = Math.floor(e.y / T);
        for (let c = left; c <= right; c++) {
          if (this.solidAt(c, row)) { e.y = (row + 1) * T; e.vy = 0; return 'ceil'; }
        }
      }
      return null;
    }

    groundUnder(e) {
      const row = Math.floor((e.y + e.h + 1) / T);
      const left = Math.floor((e.x + 2) / T), right = Math.floor((e.x + e.w - 2) / T);
      const feet = e.y + e.h;
      let found = null;
      for (let c = left; c <= right; c++) {
        const ch = this.tile(c, row);
        if ((SOLID[ch] || (ch === '=' && feet <= row * T + 1)) && Math.abs(feet - row * T) < 1.5) {
          if (!found || ch === '~' || ch === '>' || ch === '<') found = ch;
        }
      }
      return found;
    }

    // ------------------------------------------------------------- ciclo
    update(dt) {
      if (this.state !== 'playing') return;
      this.time += dt;
      if (this.dashTime > 0) {
        this.dashTime -= dt;
        if (this.dashTime <= 0) { this.dashTime = 0; this.emit('dashEnd'); }
      }
      if (this.gcCooldown > 0) this.gcCooldown = Math.max(0, this.gcCooldown - dt);
      if (this.shootCd > 0) this.shootCd -= dt;
      if (this.heat > 0) {
        this.heat = Math.max(0, this.heat - C.HEAT_COOL * dt);
        if (this.overheat && this.heat < 35) { this.overheat = false; this.emit('cooled'); }
      }
      if (!this.hintsShown.shoot && this.time > 3.5) this.hint('shoot');
      for (const s of this.springs) s.comp = Math.max(0, s.comp - dt * 4);

      this.updatePlayer(dt);
      if (this.state !== 'playing') return;
      this.updateArena();
      this.updateEnemies(dt);
      if (this.state !== 'playing') return;
      this.updateBoss(dt);
      if (this.state !== 'playing') return;
      this.updateProjectiles(dt);
      if (this.state !== 'playing') return;
      this.updateScatter(dt);
      this.updatePickups();
      this.updateObjects();
    }

    updatePlayer(dt) {
      const p = this.player, inp = this.input;
      if (p.dead) {
        p.deadT += dt;
        p.vy = Math.min(C.MAX_FALL, p.vy + C.GRAVITY * dt);
        p.y += p.vy * dt;
        p.spin += dt * 14;
        if (p.deadT > 1.5) this.afterDeath();
        return;
      }
      if (p.invuln > 0) p.invuln -= dt;
      if (p.shootFlash > 0) p.shootFlash -= dt;
      p.padT = Math.max(0, p.padT - dt);
      if (p.stepOffset) p.stepOffset = Math.abs(p.stepOffset) < 0.5 ? 0 : p.stepOffset * Math.pow(0.0005, dt);

      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let top = this.dashTime > 0 ? C.BOOST_TOP : C.TOP;
      if (p.mud) top *= C.MUD_SPEED;

      if (p.onGround) {
        if (dir !== 0) {
          if (p.vx * dir < 0) p.vx += dir * C.ACC * 2.2 * dt;
          else if (p.vx * dir < top) p.vx = Math.min(p.vx * dir + C.ACC * dt, top) * dir;
          p.facing = dir;
        } else {
          const f = C.FRICTION * dt;
          p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
        }
        if (Math.abs(p.vx) > top) p.vx -= Math.sign(p.vx) * (p.mud ? 2400 : 320) * dt;
      } else if (dir !== 0) {
        if (p.vx * dir < 0) p.vx += dir * C.AIR_ACC * 1.6 * dt;
        else if (p.vx * dir < top) p.vx = Math.min(p.vx * dir + C.AIR_ACC * dt, top) * dir;
        p.facing = dir;
      }

      // Salto (com margem de coyote e buffer) e salto duplo no ar.
      p.coyote = p.onGround ? C.COYOTE : p.coyote - dt;
      let fresh = false;
      if (inp.jumpPressed) { p.buffer = C.BUFFER; inp.jumpPressed = false; fresh = true; } else p.buffer -= dt;
      if (p.buffer > 0 && p.coyote > 0) {
        p.vy = -C.JUMP * (p.mud ? C.MUD_JUMP : 1);
        p.onGround = false;
        p.coyote = 0;
        p.buffer = 0;
        p.ball = true;
        p.jumped = true;
        this.emit('jump', { x: p.x + p.w / 2, y: p.y + p.h });
        if (!this.hintsShown.double && this.time > 6) this.hint('double');
      } else if (fresh && !p.onGround && p.airJumps > 0) {
        p.airJumps--;
        p.buffer = 0;
        p.vy = -C.DOUBLE_JUMP * (p.mud ? 0.9 : 1);
        p.ball = true;
        p.jumped = true;
        this.emit('doubleJump', { x: p.x + p.w / 2, y: p.y + p.h });
      }
      if (p.jumped && !inp.jump && p.vy < -260) { p.vy *= 0.45; p.jumped = false; }
      if (!p.onGround && inp.down && p.vy > -100) p.vy += C.GRAVITY * 0.8 * dt;

      p.vy = Math.min(C.MAX_FALL, p.vy + C.GRAVITY * dt);

      const steps = Math.max(1, Math.ceil((Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt) / 10));
      const sdt = dt / steps;
      let landed = false;
      const wasAir = !p.onGround;
      const fallSpeed = p.vy;
      for (let i = 0; i < steps; i++) {
        this.moveX(p, p.vx * sdt, p.onGround || landed);
        if (this.moveY(p, p.vy * sdt) === 'land') landed = true;
      }
      const under = p.vy >= 0 ? this.groundUnder(p) : null;
      p.onGround = landed || !!under;
      if (p.onGround) {
        if (wasAir && fallSpeed > 500) this.emit('land', { x: p.x + p.w / 2, y: p.y + p.h, v: fallSpeed });
        p.ball = false;
        p.jumped = false;
        p.airJumps = 1;
        this.chain = 0;
      }
      p.mud = under === '~';
      if (p.mud) this.hint('mud');
      if ((under === '>' || under === '<') && p.padT <= 0) {
        const d = under === '>' ? 1 : -1;
        p.vx = d * Math.max(Math.abs(p.vx), C.PAD_SPEED);
        p.facing = d;
        p.padT = 0.35;
        this.emit('pad', { x: p.x + p.w / 2, y: p.y + p.h });
        this.hint('pad');
      }
      p.run += Math.abs(p.vx) * dt;
      if (p.ball) p.spin += (p.vx >= 0 ? 1 : -1) * dt * (8 + Math.abs(p.vx) / 40);

      // Curto-circuitos (espinhos).
      const l = Math.floor(p.x / T), r = Math.floor((p.x + p.w) / T);
      const t0 = Math.floor(p.y / T), b0 = Math.floor((p.y + p.h) / T);
      for (let rr = t0; rr <= b0; rr++) {
        for (let cc = l; cc <= r; cc++) {
          if (this.tile(cc, rr) === '^' && overlap(p, { x: cc * T + 5, y: rr * T + 12, w: T - 10, h: T - 12 })) {
            this.hurt(true);
            if (this.state !== 'playing' || p.dead) return;
          }
        }
      }
      if (p.y > this.worldH + 40) this.die('pit');
    }

    updateEnemies(dt) {
      const p = this.player;
      for (const e of this.enemies) {
        if (!e.alive) { e.deadT += dt; continue; }
        e.t += dt;
        if (e.type === 'drone') {
          const nx = e.baseX + Math.sin(e.t * 0.9) * e.amp;
          e.dir = nx >= e.x ? 1 : -1;
          e.x = nx;
          e.y = e.baseY + Math.sin(e.t * 2.4) * 18;
        } else if (e.type === 'turret') {
          const dx = p.x + p.w / 2 - (e.x + e.w / 2);
          e.dir = dx >= 0 ? 1 : -1;
          e.fireT -= dt;
          if (e.fireT <= 0 && !p.dead && Math.abs(dx) < 560 && Math.abs(p.y - e.y) < 220) {
            e.fireT = 2.2 / (this.def.speedMul || 1);
            const sx = e.x + e.w / 2 + e.dir * 14, sy = e.y + 9;
            const ty = p.y + p.h / 2;
            const vy = Math.max(-160, Math.min(160, (ty - sy) * 0.6));
            this.bullets.push({ x: sx, y: sy, vx: e.dir * C.ENEMY_SHOT_SPEED, vy, r: 8, life: 3, glyph: Math.random() < 0.5 ? '0' : '1' });
            this.emit('enemyShot', { x: sx, y: sy });
            this.hint('turret');
          }
        } else {
          const nx = e.x + e.dir * e.speed * dt;
          const frontX = e.dir > 0 ? nx + e.w : nx;
          const col = Math.floor(frontX / T);
          const rowFeet = Math.floor((e.y + e.h + 2) / T);
          const rowBody = Math.floor((e.y + e.h - 2) / T);
          const below = this.tile(col, rowFeet);
          let blocked = this.solidAt(col, rowBody) || this.tile(col, rowBody) === '^' || !(SOLID[below] || below === '=') || nx < 0 || nx + e.w > this.worldW;
          if (this.arena && e.summoned && (nx < this.arena.x0 + T || nx + e.w > this.arena.x1 - T)) blocked = true;
          if (blocked) e.dir *= -1; else e.x = nx;
          if (e.type === 'spiky' && Math.abs(p.x - e.x) < 300) this.hint('spiky');
        }
        if (p.dead || !overlap(p, e)) continue;
        const stomp = p.vy > 0 && p.y + p.h - p.vy * dt <= e.y + 12;
        if (this.dashTime > 0) { this.killEnemy(e, 'dash'); continue; }
        if (e.type === 'spiky') { this.hurt(false, e); if (this.state !== 'playing' || p.dead) return; continue; }
        if (stomp || p.ball) {
          this.killEnemy(e, 'hit');
          if (stomp || (p.ball && p.vy > 0)) {
            p.vy = -(this.input.jump ? 860 : C.STOMP_BOUNCE);
            p.ball = true;
            p.jumped = false;
            p.onGround = false;
            p.airJumps = 1;
          }
        } else {
          this.hurt(false, e);
          if (this.state !== 'playing' || p.dead) return;
        }
      }
    }

    killEnemy(e, how) {
      if (!e.alive) return;
      e.alive = false;
      e.deadT = 0;
      this.chain++;
      const pts = 100 * Math.min(this.chain, 8) * (e.type === 'spiky' ? 2 : 1);
      this.score += pts;
      this.totals.kills++;
      this.addEnergy(C.ENERGY_KILL);
      if (e.type === 'leak') {
        this.totals.leaks++;
        for (let i = 0; i < 3; i++) {
          this.scatter.push({ x: e.x + e.w / 2, y: e.y, vx: (i - 1) * 110, vy: -420 - i * 40, age: 0, life: 7, free: true });
        }
        this.hint('leak');
      }
      this.emit('kill', { e, pts, how, chain: this.chain });
    }

    // ---------------------------------------------------------- chefe final
    updateArena() {
      const b = this.boss, p = this.player;
      if (!this.arena || !b || this.arenaLocked || b.state !== 'waiting' || p.dead) return;
      if (p.x > this.arena.x0 + 7 * T) {
        this.arenaLocked = true;
        b.state = 'intro';
        b.introT = 2.6;
        b.hp = b.max;
        b.range = Math.max(80, (this.arena.x1 - this.arena.x0) / 2 - b.w / 2 - 50);
        if (this.bombs < C.BOMBS_MAX) this.bombs++;
        this.emit('bossIntro', { boss: b });
        this.hint('boss');
      }
    }

    updateBoss(dt) {
      const b = this.boss;
      if (!b || b.state === 'waiting' || b.state === 'dead') return;
      b.t += dt;
      if (b.hurtT > 0) b.hurtT -= dt;
      if (b.dashHitCd > 0) b.dashHitCd -= dt;
      const p = this.player;
      if (b.state === 'intro') {
        if (b.kind === 'leak') {
          b.vy = Math.min(1400, b.vy + 2600 * dt);
          b.y += b.vy * dt;
          if (b.y >= b.homeY) {
            if (b.vy > 300) { this.emit('bossLand', { x: b.x + b.w / 2, y: b.groundY, big: true }); }
            b.y = b.homeY; b.vy = 0; b.onGround = true;
          }
        } else b.y += (b.homeY - b.y) * Math.min(1, dt * 2.2);
        b.introT -= dt;
        if (b.introT <= 0) { b.state = 'fight'; b.t = 0; b.attackT = 1.2; b.hopT = 1.2; this.emit('bossFight'); }
        return;
      }
      if (b.state === 'dying') {
        b.dyingT += dt;
        b.boomT -= dt;
        b.y += 30 * dt;
        if (b.boomT <= 0) {
          b.boomT = 0.12;
          this.emit('bossBoom', { x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h });
        }
        if (b.dyingT > 2.8) {
          b.state = 'dead';
          this.score += 10000;
          this.totals.bosses++;
          this.arenaLocked = false;
          this.waves.length = 0;
          this.emit('bossDefeated', { x: b.x + b.w / 2, y: b.y + b.h / 2, kind: b.kind });
          if (b.kind === 'leak' && !this.weapons.spread) {
            this.weapons.spread = true;
            this.weapon = 'spread';
            this.emit('unlock', { weapon: 'spread' });
          }
        }
        return;
      }
      // Luta: movimento próprio de cada chefe
      const speed = [0.55, 0.75, 1.0][b.phase - 1];
      if (b.kind === 'leak') {
        this.updateLeakBoss(b, dt);
      } else if (b.kind === 'hive') {
        b.x = b.cx - b.w / 2 + Math.sin(b.t * speed) * b.range;
        b.y = b.homeY + Math.sin(b.t * speed * 2) * 46;
      } else {
        b.x = b.cx - b.w / 2 + Math.sin(b.t * speed) * b.range;
        b.y = b.homeY + Math.sin(b.t * 1.7) * 22 + (b.phase === 3 ? Math.sin(b.t * 5.3) * 8 : 0);
      }
      if (b.kind === 'leak') {
        // o Rei das Fugas não tem escudo
      } else if (b.shieldT > 0) {
        b.shieldT -= dt;
        if (b.shieldT <= 0) this.emit('shieldDown');
      } else if (b.phase >= 2) {
        b.shieldCd -= dt;
        if (b.shieldCd <= 0) {
          b.shieldT = b.phase === 3 ? 2.6 : 2.0;
          b.shieldCd = b.phase === 3 ? 6 : 8;
          this.emit('shield', { boss: b });
          this.hint('shield');
        }
      }
      b.attackT -= dt;
      if (b.attackT <= 0) {
        this.bossAttack(b);
        b.attackT = [2.4, 1.9, 1.45][b.phase - 1] + Math.random() * 0.6;
      }
      if (!p.dead && overlap(p, this.bossBox(b))) {
        const stomp = b.kind === 'leak' && p.vy > 0 && p.y + p.h - p.vy * dt <= b.y + 26;
        if (this.dashTime > 0 || stomp) {
          if (b.dashHitCd <= 0) { b.dashHitCd = 0.5; this.bossHit(stomp ? 3 : 4, p.x + p.w / 2, p.y + p.h, true); }
          if (stomp) { p.vy = -900; p.ball = true; p.airJumps = 1; p.jumped = false; }
          else { p.vx = (p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1) * 420; p.vy = -500; }
        } else this.hurt(false, b);
      }
    }

    // Rei das Fugas: salta em direção ao jogador e cria ondas de choque ao aterrar.
    updateLeakBoss(b, dt) {
      const p = this.player;
      const ax0 = this.arena.x0 + T, ax1 = this.arena.x1 - T;
      if (b.onGround) {
        b.squash = Math.max(0, b.squash - dt * 3);
        b.hopT -= dt;
        if (b.hopT <= 0) {
          const dir = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
          b.vy = -(860 + b.phase * 70);
          b.vx = dir * (170 + b.phase * 70 + Math.random() * 80);
          b.onGround = false;
          this.emit('bossJump', { x: b.x + b.w / 2, y: b.y + b.h });
        }
      } else {
        b.vy = Math.min(1400, b.vy + 2300 * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < ax0) { b.x = ax0; b.vx = Math.abs(b.vx); }
        if (b.x + b.w > ax1) { b.x = ax1 - b.w; b.vx = -Math.abs(b.vx); }
        if (b.y >= b.homeY) {
          b.y = b.homeY; b.vy = 0; b.vx = 0; b.onGround = true; b.squash = 1;
          b.hopT = [1.7, 1.35, 1.0][b.phase - 1] + Math.random() * 0.4;
          const sp = 330 + b.phase * 50;
          this.waves.push({ x: b.x + 10, dir: -1, speed: sp, life: 3 });
          this.waves.push({ x: b.x + b.w - 10, dir: 1, speed: sp, life: 3 });
          this.emit('bossLand', { x: b.x + b.w / 2, y: b.groundY });
        }
      }
    }

    bossBox(b) { return { x: b.x + 12, y: b.y + 8, w: b.w - 24, h: b.h - 10 }; }

    bossAttack(b) {
      const p = this.player;
      const TABLE = {
        module: [['bits', 'bits', 'rain'], ['bits', 'rain', 'summon', 'bits'], ['bits', 'laser', 'rain', 'summon', 'laser', 'bits']],
        hive: [['bits', 'drones'], ['bits', 'drones', 'rain', 'bits'], ['bits', 'laser', 'drones', 'rain', 'bits']],
        leak: [['drip', 'drip'], ['drip', 'summon', 'drip'], ['drip', 'summon', 'drip', 'bits']],
      };
      const opts = TABLE[b.kind][b.phase - 1];
      let a = opts[Math.floor(Math.random() * opts.length)];
      if (a === b.lastAttack && a !== 'bits' && a !== 'drip') a = b.kind === 'leak' ? 'drip' : 'bits';
      if ((a === 'summon' || a === 'drones') && this.enemies.filter((e) => e.summoned && e.alive).length >= 4) a = b.kind === 'leak' ? 'drip' : 'rain';
      if (a === 'laser' && this.laser) a = 'bits';
      b.lastAttack = a;
      const cx = b.x + b.w / 2, cy = b.y + b.h * 0.62;
      if (a === 'drip') {
        // gotas de memória perdida em arco (com gravidade)
        const n = 3 + b.phase;
        for (let i = 0; i < n; i++) {
          const dirx = (p.x + p.w / 2 - cx) / 1.1 + (i - (n - 1) / 2) * 90;
          this.bullets.push({ x: cx, y: b.y + 10, vx: dirx, vy: -700 - Math.random() * 120, g: 1300, r: 10, life: 4, glyph: '●', drip: true });
        }
        this.emit('bossShot', { x: cx, y: b.y });
        return;
      }
      if (a === 'drones') {
        for (const side of [-1, 1]) {
          const e = this.makeEnemy('drone', { x: cx + side * (b.w / 2 + 20), y: b.y + b.h / 2 });
          e.summoned = true;
          e.amp = 90 + Math.random() * 60;
          e.baseY = Math.min(e.baseY, 11 * T);
          this.enemies.push(e);
        }
        this.emit('summon', { x: cx, y: cy });
        return;
      }
      if (a === 'bits') {
        const n = 3 + b.phase * 2;
        const base = Math.atan2(p.y + p.h / 2 - cy, p.x + p.w / 2 - cx);
        const spread = 0.5 + b.phase * 0.18;
        const sp = 230 + b.phase * 55;
        for (let i = 0; i < n; i++) {
          const ang = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * 2);
          this.bullets.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 9, life: 5, glyph: Math.random() < 0.5 ? '0' : '1', boss: true });
        }
        this.emit('bossShot', { x: cx, y: cy });
      } else if (a === 'rain') {
        const n = 4 + b.phase * 2;
        const w = this.arena.x1 - this.arena.x0 - 2 * T;
        for (let i = 0; i < n; i++) {
          const x = this.arena.x0 + T + ((i + Math.random() * 0.8) / n) * w;
          this.junk.push({ x: x - 14, y: -60, w: 28, h: 28, vy: 0, warnT: 0.9 + Math.random() * 0.5, rot: Math.random() * 6 });
        }
        this.junk.push({ x: p.x + p.w / 2 - 14, y: -60, w: 28, h: 28, vy: 0, warnT: 1.0, rot: 0 });
        this.emit('junkWarn');
      } else if (a === 'summon') {
        const types = b.kind === 'leak' ? ['leak', 'leak', 'bug'] : ['bug', 'leak', 'spiky'];
        for (const side of [0, 1]) {
          const col = side ? Math.floor(this.arena.x1 / T) - 3 : Math.floor(this.arena.x0 / T) + 2;
          const e = this.makeEnemy(types[Math.floor(Math.random() * types.length)], { x: col * T, y: 13 * T });
          e.summoned = true;
          e.dir = side ? -1 : 1;
          this.enemies.push(e);
        }
        this.emit('summon', { x: cx, y: cy });
      } else if (a === 'laser') {
        this.laser = { y: 14 * T - 16, warn: 1.1, on: 0.75, hit: false };
        this.emit('laserWarn');
      }
    }

    bossHit(n, x, y, force) {
      const b = this.boss;
      if (!b || b.state !== 'fight') return false;
      if (b.shieldT > 0 && !force) { this.emit('deflect', { x, y }); return false; }
      b.hp = Math.max(0, b.hp - n);
      b.hurtT = 0.12;
      this.score += 40 * n;
      this.emit('bossHit', { x, y, hp: b.hp });
      while (b.hp <= b.nextDrop && b.nextDrop > 0) {
        b.nextDrop -= 12;
        for (let i = 0; i < 3; i++) {
          this.scatter.push({ x: b.x + b.w / 2, y: b.y + b.h, vx: (i - 1) * 160, vy: -300, age: 0, life: 8, free: true });
        }
      }
      if (b.phase === 1 && b.hp <= b.max * 0.66) { b.phase = 2; b.shieldCd = 2; this.emit('bossPhase', { phase: 2 }); }
      else if (b.phase === 2 && b.hp <= b.max * 0.33) { b.phase = 3; b.shieldCd = 3; this.emit('bossPhase', { phase: 3 }); }
      if (b.hp <= 0) {
        b.state = 'dying';
        b.dyingT = 0;
        b.shieldT = 0;
        this.bullets.length = 0;
        this.junk.length = 0;
        this.laser = null;
        for (const e of this.enemies) if (e.summoned && e.alive) this.killEnemy(e, 'boss');
        this.emit('bossDying', { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      }
      return true;
    }

    resetBoss() {
      const b = this.boss;
      if (!b) return;
      Object.assign(b, this.makeBoss(b.spawn));
      this.arenaLocked = false;
      this.waves.length = 0;
      this.bullets.length = 0;
      this.junk.length = 0;
      this.laser = null;
      this.shots.length = 0;
      this.enemies = this.enemies.filter((e) => !e.summoned);
      this.emit('bossReset');
    }

    // --------------------------------------------------------- projéteis
    shoot() {
      const p = this.player;
      if (this.state !== 'playing' || p.dead) return;
      if (this.shootCd > 0) return;
      if (this.overheat) { this.emit('denied', { what: 'heat' }); this.shootCd = 0.25; return; }
      const spread = this.weapon === 'spread' && this.weapons.spread;
      this.shootCd = spread ? 0.28 : C.SHOOT_CD;
      const sx = p.x + p.w / 2 + p.facing * 12, sy = p.y + 14;
      let ang = p.facing > 0 ? 0 : Math.PI;
      if (this.input.down && !p.onGround) ang += p.facing * 0.7;
      const b = this.boss;
      if (this.arenaLocked && b && (b.state === 'fight' || b.state === 'intro')) {
        const tx = b.x + b.w / 2 + (Math.random() - 0.5) * b.w * 0.5, ty = b.y + b.h / 2;
        ang = Math.atan2(ty - sy, tx - sx);
        p.facing = Math.cos(ang) >= 0 ? 1 : -1;
      }
      const angles = spread ? [ang - 0.2, ang, ang + 0.2] : [ang];
      for (const a of angles) this.shots.push({ x: sx, y: sy, vx: Math.cos(a) * C.SHOT_SPEED, vy: Math.sin(a) * C.SHOT_SPEED, life: 1.1, spread });
      p.shootFlash = 0.08;
      this.heat += (spread ? C.HEAT_SPREAD : C.HEAT_ECC) * (this.arenaLocked ? 0.55 : 1);
      if (this.heat >= 100) {
        this.heat = 100;
        this.overheat = true;
        this.emit('overheat');
        this.hint('heat');
      }
      this.emit('shoot', { x: sx, y: sy, spread });
    }

    switchWeapon() {
      if (this.state !== 'playing') return;
      if (!this.weapons.spread) { this.emit('denied', { what: 'weapon' }); return; }
      this.weapon = this.weapon === 'ecc' ? 'spread' : 'ecc';
      this.emit('weapon', { weapon: this.weapon });
    }

    // Bomba de Refresh: como o refresh da DRAM, "reescreve" tudo à volta.
    bomb() {
      const p = this.player;
      if (this.state !== 'playing' || p.dead) return;
      if (this.bombs <= 0) { this.emit('denied', { what: 'bomb' }); return; }
      this.bombs--;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      let count = 0;
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) <= C.BOMB_RADIUS) { this.killEnemy(e, 'bomb'); count++; }
      }
      this.bullets.length = 0;
      this.junk.length = 0;
      this.waves.length = 0;
      this.laser = null;
      const b = this.boss;
      if (b && b.state === 'fight' && Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) <= C.BOMB_RADIUS * 1.8) {
        this.bossHit(C.BOMB_BOSS_DMG, b.x + b.w / 2, b.y + b.h / 2, true);
      }
      p.invuln = Math.max(p.invuln, 0.6);
      this.emit('bomb', { x: cx, y: cy, count });
    }

    updateProjectiles(dt) {
      const p = this.player;
      // Disparos ECC do jogador
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i];
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        let dead = s.life <= 0 || this.solidAt(Math.floor(s.x / T), Math.floor(s.y / T));
        if (!dead) {
          const box = { x: s.x - 6, y: s.y - 6, w: 12, h: 12 };
          for (const e of this.enemies) if (e.alive && overlap(box, e)) { this.killEnemy(e, 'shot'); dead = true; break; }
          const b = this.boss;
          if (!dead && b && b.state === 'fight' && overlap(box, this.bossBox(b))) { this.bossHit(1, s.x, s.y); dead = true; }
          // os disparos anulam bits inimigos
          if (!dead) {
            for (let j = this.bullets.length - 1; j >= 0; j--) {
              const q = this.bullets[j];
              if (Math.abs(q.x - s.x) < 14 && Math.abs(q.y - s.y) < 14) { this.bullets.splice(j, 1); this.emit('cancel', { x: q.x, y: q.y }); dead = true; break; }
            }
          }
        }
        if (dead) { this.emit('shotEnd', { x: s.x, y: s.y }); this.shots.splice(i, 1); }
      }
      // Bits corrompidos inimigos
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const q = this.bullets[i];
        if (q.g) q.vy += q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
        if (q.life <= 0 || q.y > this.worldH + 40 || this.solidAt(Math.floor(q.x / T), Math.floor(q.y / T))) {
          if (q.drip) this.emit('splash', { x: q.x, y: q.y });
          this.bullets.splice(i, 1);
          continue;
        }
        if (!p.dead && overlap(p, { x: q.x - 7, y: q.y - 7, w: 14, h: 14 })) {
          this.bullets.splice(i, 1);
          this.hurt(false, { x: q.x - 1, w: 2 });
          if (this.state !== 'playing' || p.dead) return;
        }
      }
      // Lixo que cai do teto
      for (let i = this.junk.length - 1; i >= 0; i--) {
        const j = this.junk[i];
        if (j.warnT > 0) { j.warnT -= dt; continue; }
        j.vy = Math.min(900, j.vy + 1600 * dt);
        j.y += j.vy * dt;
        j.rot += dt * 4;
        if (this.solidAt(Math.floor((j.x + j.w / 2) / T), Math.floor((j.y + j.h) / T))) {
          this.emit('junkHit', { x: j.x + j.w / 2, y: j.y + j.h });
          this.junk.splice(i, 1);
          continue;
        }
        if (!p.dead && overlap(p, j)) {
          this.junk.splice(i, 1);
          this.hurt(false, j);
          if (this.state !== 'playing' || p.dead) return;
        }
      }
      // Ondas de choque do Rei das Fugas (salta por cima!)
      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i];
        w.x += w.dir * w.speed * dt;
        w.life -= dt;
        if (w.life <= 0 || (this.arena && (w.x < this.arena.x0 || w.x > this.arena.x1))) { this.waves.splice(i, 1); continue; }
        if (!p.dead && overlap(p, { x: w.x - 14, y: 14 * T - 26, w: 28, h: 26 })) {
          this.hurt(false, { x: w.x - 1, w: 2 });
          if (this.state !== 'playing' || p.dead) return;
        }
      }
      // Laser de varrimento
      if (this.laser) {
        const L = this.laser;
        if (L.warn > 0) {
          L.warn -= dt;
          if (L.warn <= 0) this.emit('laserOn');
        } else {
          L.on -= dt;
          if (!p.dead && p.y + p.h > L.y - 8 && p.y < L.y + 8) this.hurt(false, { x: p.x - 40, w: 2 });
          if (L.on <= 0) this.laser = null;
        }
      }
    }

    updateScatter(dt) {
      for (let i = this.scatter.length - 1; i >= 0; i--) {
        const s = this.scatter[i];
        s.age += dt;
        if (s.age >= s.life) { this.scatter.splice(i, 1); continue; }
        s.vy = Math.min(900, s.vy + C.GRAVITY * 0.8 * dt);
        const nx = s.x + s.vx * dt;
        if (this.solidAt(Math.floor(nx / T), Math.floor(s.y / T))) s.vx *= -0.5; else s.x = nx;
        if (this.arenaLocked) {
          if (s.x < this.arena.x0 + 10) { s.x = this.arena.x0 + 10; s.vx = Math.abs(s.vx) * 0.5; }
          if (s.x > this.arena.x1 - 10) { s.x = this.arena.x1 - 10; s.vx = -Math.abs(s.vx) * 0.5; }
        }
        const ny = s.y + s.vy * dt;
        const row = Math.floor((ny + 8) / T);
        const ch = this.tile(Math.floor(s.x / T), row);
        if (s.vy > 0 && (SOLID[ch] || ch === '=')) {
          s.y = row * T - 8;
          s.vy = Math.abs(s.vy) > 120 ? -s.vy * 0.55 : 0;
          s.vx *= 0.8;
        } else s.y = ny;
        if (s.y > this.worldH + 60) this.scatter.splice(i, 1);
      }
    }

    updatePickups() {
      const p = this.player;
      if (p.dead) return;
      const box = { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 };
      for (const ch of this.chips) {
        if (ch.taken || !overlap(box, ch)) continue;
        ch.taken = true;
        this.gainRam(1, ch.x + ch.w / 2, ch.y + ch.h / 2);
      }
      for (let i = this.scatter.length - 1; i >= 0; i--) {
        const s = this.scatter[i];
        if (s.age < (s.free ? 0.25 : 0.5)) continue;
        if (overlap(box, { x: s.x - 9, y: s.y - 9, w: 18, h: 18 })) {
          this.scatter.splice(i, 1);
          this.gainRam(1, s.x, s.y);
        }
      }
      for (const bi of this.bombItems) {
        if (bi.taken || !overlap(box, bi)) continue;
        bi.taken = true;
        this.bombs = Math.min(C.BOMBS_MAX, this.bombs + 1);
        this.score += 250;
        this.emit('bombItem', { x: bi.x + 12, y: bi.y + 12 });
        this.hint('bomb');
      }
      for (const m of this.modules) {
        if (m.taken || !overlap(box, m)) continue;
        m.taken = true;
        this.modulesTaken++;
        this.totals.modules++;
        this.ram += 5;
        this.score += 1000;
        this.addEnergy(C.ENERGY_MODULE);
        this.emit('module', { x: m.x + m.w / 2, y: m.y + m.h / 2 });
      }
    }

    gainRam(n, x, y) {
      this.ram += n;
      this.score += 10;
      const before = this.totals.chips;
      this.totals.chips += n;
      if (Math.floor(this.totals.chips / C.EXTRA_LIFE_EVERY) > Math.floor(before / C.EXTRA_LIFE_EVERY)) {
        this.lives = Math.min(9, this.lives + 1);
        this.emit('extraLife', { x, y, lives: this.lives });
      }
      this.addEnergy(C.ENERGY_CHIP);
      this.emit('chip', { x, y, ram: this.ram });
      this.hint('chip');
    }

    updateObjects() {
      const p = this.player;
      if (p.dead) return;
      for (const s of this.springs) {
        if (p.vy >= 0 && overlap(p, s)) {
          p.y = s.y - p.h;
          p.vy = -C.SPRING;
          p.onGround = false;
          p.ball = true;
          p.jumped = false;
          p.airJumps = 1;
          s.comp = 1;
          this.emit('spring', { x: s.x + s.w / 2, y: s.y });
          this.hint('spring');
        }
      }
      for (const cp of this.checkpoints) {
        if (!cp.active && p.x + p.w / 2 >= cp.x) {
          cp.active = true;
          this.spawnPoint = { x: cp.x - 12, y: cp.y };
          this.score += 200;
          const fact = RR.FACTS[(this.levelIndex * 3 + this.checkpoints.indexOf(cp)) % RR.FACTS.length];
          this.emit('checkpoint', { x: cp.x, y: cp.y, fact });
        }
      }
      // A meta funciona como linha de chegada (qualquer altura): impossível passar por cima.
      if (this.goal && p.x + p.w > this.goal.x + 20 && p.x < this.goal.x + this.goal.w) {
        if (this.boss && this.boss.state !== 'dead') this.hint('locked');
        else this.levelClear();
      }
    }

    // ------------------------------------------------------------ ações
    pressJump() { this.input.jumpPressed = true; }

    garbageCollect() {
      if (this.state !== 'playing' || this.player.dead) return;
      if (this.gcCooldown > 0) { this.emit('denied', { what: 'gc' }); return; }
      this.gcCooldown = C.GC_COOLDOWN;
      const p = this.player;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      let count = 0;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) <= C.GC_RADIUS) { this.killEnemy(e, 'gc'); count++; }
      }
      // também limpa bits corrompidos próximos
      this.bullets = this.bullets.filter((q) => Math.hypot(q.x - cx, q.y - cy) > C.GC_RADIUS);
      this.emit('gc', { x: cx, y: cy, count });
    }

    dash() {
      if (this.state !== 'playing' || this.player.dead) return;
      if (this.dashTime > 0) return;
      if (this.energy < 100) { this.emit('denied', { what: 'dash' }); return; }
      this.energy = 0;
      this.dashTime = C.DASH_TIME;
      const p = this.player;
      p.vx = p.facing * Math.max(Math.abs(p.vx), C.TOP * 1.2);
      this.emit('dash', { x: p.x + p.w / 2, y: p.y + p.h / 2 });
    }

    addEnergy(v) {
      if (this.dashTime > 0) return;
      const before = this.energy;
      this.energy = Math.min(100, this.energy + v);
      if (before < 100 && this.energy >= 100) { this.emit('energyFull'); this.hint('energy'); }
    }

    hurt(spikes, src) {
      const p = this.player;
      if (p.dead || p.invuln > 0 || this.dashTime > 0) return;
      if (this.ram <= 0) { this.die(spikes ? 'spikes' : 'enemy'); return; }
      const lost = this.ram;
      const n = Math.min(lost, C.SCATTER_MAX);
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / Math.max(1, n - 1) - 0.5) * 2.6;
        const sp = 320 + (i % 3) * 90;
        this.scatter.push({ x: cx, y: cy - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, age: 0, life: C.SCATTER_LIFE });
      }
      this.ram = 0;
      p.invuln = C.INVULN;
      const away = src ? (cx < src.x + (src.w || 0) / 2 ? -1 : 1) : -p.facing;
      p.vx = away * 300;
      p.vy = -560;
      p.onGround = false;
      p.ball = false;
      p.jumped = false;
      p.airJumps = 1;
      this.emit('hurt', { x: cx, y: cy, lost });
      this.hint(this.hintsShown.hurt ? 'noRam' : 'hurt');
    }

    die(cause) {
      const p = this.player;
      if (p.dead) return;
      p.dead = true;
      p.deadT = 0;
      p.vx = 0;
      p.vy = cause === 'pit' ? 0 : -760;
      this.dashTime = 0;
      this.totals.deaths++;
      this.emit('die', { cause, x: p.x + p.w / 2, y: Math.min(p.y, this.worldH) });
    }

    afterDeath() {
      this.lives--;
      if (this.lives <= 0) { this.gameOver(); return; }
      this.ram = 0;
      this.energy = 0;
      this.dashTime = 0;
      this.scatter.length = 0;
      if (this.arenaLocked || (this.boss && this.boss.state !== 'waiting' && this.boss.state !== 'dead')) this.resetBoss();
      this.bullets.length = 0;
      this.player = this.makePlayer(this.spawnPoint);
      this.player.invuln = 1.5;
      this.clearInput();
      this.emit('respawn', { lives: this.lives });
    }

    levelClear() {
      if (this.state !== 'playing') return;
      const p = this.player;
      const ramBonus = this.ram * 100;
      const timeBonus = Math.max(0, Math.round((this.def.par - this.time) * 30));
      const perfect = this.chips.every((c) => c.taken);
      const perfectBonus = perfect ? 5000 : 0;
      this.score += ramBonus + timeBonus + perfectBonus;
      this.state = 'cleared';
      p.vx = 0;
      this.saveBest();
      this.emit('cleared', {
        index: this.levelIndex, ram: this.ram, ramBonus, timeBonus, perfectBonus,
        time: this.time, modules: this.modulesTaken, moduleTotal: this.moduleTotal,
        chips: this.chips.filter((c) => c.taken).length, chipTotal: this.chipTotal,
        last: this.levelIndex + 1 >= RR.LEVELS.length,
      });
    }

    victory() {
      this.state = 'victory';
      const isRecord = this.saveBest();
      this.emit('victory', { isRecord });
    }

    gameOver() {
      this.state = 'gameover';
      const isRecord = this.saveBest();
      this.emit('gameover', { isRecord });
    }

    saveBest() {
      if (this.score <= this.best) return false;
      this.best = this.score;
      try { localStorage.setItem(BEST_KEY, String(this.best)); } catch (e) { /* ignorar */ }
      return true;
    }

    hint(key) {
      if (this.hintsShown[key]) return;
      this.hintsShown[key] = true;
      this.emit('hint', { key, text: RR.HINTS[key] });
    }
  }

  RR.Game = Game;
})();
