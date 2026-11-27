/* =========================================================================
   RAM RUSH — Testes automáticos (não são carregados no jogo normal).
   Uso (com o jogo aberto através de `npm run dev`), na consola do navegador:
     const s = document.createElement('script'); s.src = 'tests/bot.js'; document.body.appendChild(s);
     RRTEST.runAll()
   ========================================================================= */
(function () {
  'use strict';
  const RR = window.RR;
  const T = RR.CONFIG.TILE;
  const SOLIDS = { '#': 1, '~': 1, '>': 1, '<': 1, '_': 1 };
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message + ' @' + e.filename + ':' + e.lineno));

  function where(li, col) {
    let x = 0;
    for (const n of RR.LEVELS[li].chunks) {
      const w = RR.CHUNKS[n][RR.CHUNKS[n].length - 1].length;
      if (col < x + w) return n + '+' + (col - x);
      x += w;
    }
    return 'fim';
  }

  const groundBelow = (g, col, row) => { for (let r = row; r < g.rows; r++) { const ch = g.tile(col, r); if (SOLIDS[ch] || ch === '=' || ch === '+') return true; } return false; };

  // Bot: corre para a direita, salta (e salto duplo) perante buracos, muros, espinhos e inimigos,
  // dispara contra inimigos e luta contra os chefes.
  function botLevel(li, opts = {}) {
    const max = opts.max || 500;
    const g = window.RAMRUSH.game;
    g.setCharacter(opts.char || 'bit');
    g.lives = 999;
    if (opts.weapons) g.weapons.spread = true;
    g.bombs = 3;
    g.loadLevel(li);
    g.state = 'playing';
    if (opts.fromArena && g.arena) { g.player.x = g.arena.x0 + 2 * T; g.player.y = 14 * T - g.player.h; g.spawnPoint = { x: g.player.x, y: 14 * T }; }
    const inp = g.input;
    const dt = 1 / 120;
    let best = 0, stuckT = 0, hold = 0, t = 0, embedded = 0, bossTime = 0, lastGroundY = 14 * T;
    const deaths = {}, stuck = {}, hurts = {};
    const fn = (ty, d) => {
      const k = where(li, Math.floor(g.player.x / T));
      if (ty === 'die') deaths[k + ':' + d.cause] = (deaths[k + ':' + d.cause] || 0) + 1;
      if (ty === 'hurt') hurts[k] = (hurts[k] || 0) + 1;
    };
    g.on(fn);
    while (t < max && g.state === 'playing') {
      const p = g.player;
      t += dt;
      if (g.lives < 50) g.lives = 999; // o teste não deve acabar por falta de vidas
      if (opts.god) p.invuln = 5;
      if (!p.dead) {
        const b = g.boss;
        const fighting = g.arenaLocked && b && b.state !== 'dead';
        if (fighting) {
          bossTime += dt;
          // fica longe do chefe e salta perante ondas, laser e lixo
          const bx = b.x + b.w / 2, px = p.x + p.w / 2;
          const away = px < bx ? -1 : 1;
          const dist = Math.abs(px - bx);
          inp.right = dist < 220 ? away > 0 : (px < (g.arena.x0 + g.arena.x1) / 2 - 200);
          inp.left = dist < 220 ? away < 0 : (px > (g.arena.x0 + g.arena.x1) / 2 + 200);
          let want = false;
          for (const w of g.waves) if (Math.abs(w.x - px) < 140 && Math.sign(px - w.x) === w.dir) want = true;
          if (g.laser && g.laser.warn < 0.25) want = true;
          for (const j of g.junk) if (j.warnT <= 0 && Math.abs(j.x + j.w / 2 - px) < 40) { inp.right = !inp.right; inp.left = !inp.left; }
          if (want && p.onGround) { g.pressJump(); hold = 0.6; }
          g.shoot();
        } else {
          inp.right = true; inp.left = false;
          if (p.onGround) lastGroundY = p.y + p.h;
          // não ir depressa demais sobre plataformas que se desfazem/gelo com buracos à frente
          const col = Math.floor((p.x + p.w) / T), feetRow = Math.floor((p.y + p.h + 2) / T);
          let want = false;
          if (p.onGround) {
            const look = Math.max(2, Math.ceil(Math.abs(p.vx) / 170));
            const edge = Math.max(1, Math.ceil(Math.abs(p.vx) / 420)); // salta só na borda dos buracos
            for (let k = 1; k <= look; k++) {
              const ch = g.tile(col + k, feetRow);
              if (!(SOLIDS[ch] || ch === '=' || ch === '+') && k <= edge) want = true;
              if (g.solidAt(col + k, feetRow - 2)) want = true;
              const hz = g.tile(col + k, feetRow - 1);
              if (hz === '^' || hz === '%') want = true;
            }
            for (const e of g.enemies) if (e.alive && e.x > p.x && e.x - p.x < 120 + Math.abs(p.vx) * 0.2 && Math.abs(e.y - p.y) < 90) want = true;
          } else if (p.vy > 150 && p.airJumps > 0 && p.y + p.h > lastGroundY + 24 && !groundBelow(g, Math.floor((p.x + p.w / 2) / T) + 1, feetRow)) {
            g.pressJump(); hold = 0.5; // salto duplo de emergência
          }
          if (want && p.onGround) { g.pressJump(); hold = 0.6; }
          for (const e of g.enemies) if (e.alive && e.x > p.x && e.x - p.x < 420 && Math.abs(e.y - p.y) < 50) { g.shoot(); break; }
        }
        hold -= dt;
        inp.jump = hold > 0;
        if (!fighting) {
          if (p.x > best + 4) { best = p.x; stuckT = 0; } else stuckT += dt;
          if (stuckT > 4) {
            const k = where(li, Math.floor(p.x / T));
            stuck[k] = (stuck[k] || 0) + 1;
            p.x = best + 4 * T; p.y = 2 * T; p.vy = 0; best = p.x; stuckT = 0;
          }
        } else { best = p.x; stuckT = 0; }
        if (g.solidAt(Math.floor((p.x + p.w / 2) / T), Math.floor((p.y + p.h / 2) / T))) embedded++;
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.vx) || !isFinite(p.vy)) { errors.push('NaN no jogador'); break; }
        if (g.boss && !isFinite(g.boss.x + g.boss.y + g.boss.hp)) { errors.push('NaN no chefe'); break; }
      } else best = Math.min(best, g.spawnPoint.x);
      g.update(dt);
      window.RAMRUSH.fx.update(dt);
    }
    g.off(fn);
    return {
      zona: li + 1, estado: g.state, tempo: +t.toFixed(1), chefe: g.boss ? `${g.boss.kind}:${g.boss.state} hp=${g.boss.hp}` : '-',
      tempoChefe: +bossTime.toFixed(1),
      chips: g.chips.filter((c) => c.taken).length + '/' + g.chipTotal,
      inimigos: g.enemies.filter((e) => !e.alive).length + '/' + g.enemies.length,
      mortes: deaths, golpes: Object.values(hurts).reduce((a, b) => a + b, 0), atascos: stuck, dentroDeMuro: embedded,
    };
  }

  // Entrada aleatória intensiva: teclas, pausas, reinícios, armas, bombas.
  function fuzz(seconds = 300, seed = 7, startLevel = 0) {
    const g = window.RAMRUSH.game, ui = window.RAMRUSH.ui;
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const dt = 1 / 120;
    let t = 0, embedded = 0, maxScore = 0;
    const levels = new Set();
    ui.startGame();
    if (startLevel) { g.loadLevel(startLevel); g.state = 'playing'; }
    while (t < seconds) {
      t += dt;
      const r = rnd();
      const inp = g.input;
      if (r < 0.02) inp.left = !inp.left;
      else if (r < 0.06) inp.right = rnd() < 0.85;
      else if (r < 0.09) g.pressJump();
      else if (r < 0.1) inp.jump = !inp.jump;
      else if (r < 0.103) g.dash();
      else if (r < 0.106) g.garbageCollect();
      else if (r < 0.15) g.shoot();
      else if (r < 0.152) g.bomb();
      else if (r < 0.154) g.switchWeapon();
      else if (r < 0.1545) ui.togglePause();
      else if (r < 0.1548) ui.restartLevel();
      if (g.state === 'paused' && rnd() < 0.05) ui.togglePause();
      if (g.state === 'cleared') g.nextLevel();
      if (g.state === 'gameover') g.continueLevel();
      if (g.state === 'victory') ui.startGame();
      if (rnd() < 0.002) g.energy = 100;
      if (rnd() < 0.0005 && g.arena) { g.player.x = g.arena.x0 + 9 * T; g.player.y = 10 * T; }
      g.update(dt);
      window.RAMRUSH.fx.update(dt);
      if (Math.floor(t * 120) % 12 === 0) window.RAMRUSH.renderer.draw(dt * 12);
      const p = g.player;
      if (!isFinite(p.x) || !isFinite(p.y)) { errors.push('NaN no fuzz'); break; }
      if (!p.dead && g.solidAt(Math.floor((p.x + p.w / 2) / T), Math.floor((p.y + p.h / 2) / T))) embedded++;
      levels.add(g.levelIndex + 1);
      maxScore = Math.max(maxScore, g.score);
    }
    return { segundos: seconds, dentroDeMuro: embedded, zonas: [...levels], maxScore, estadoFinal: g.state };
  }

  function lintChunks() {
    const issues = [];
    for (const [name, rows] of Object.entries(RR.CHUNKS)) {
      const w = rows[rows.length - 1].length;
      rows.forEach((r, i) => { if (r.length !== w) issues.push(`${name}: linha ${i} mede ${r.length} (esperado ${w})`); });
      if (rows.length > RR.CONFIG.ROWS) issues.push(`${name}: demasiadas linhas`);
      const ground = rows[rows.length - 1];
      if (name !== 'start' && ground[0] !== '#') issues.push(`${name}: não começa com chão`);
      if (ground[w - 1] !== '#') issues.push(`${name}: não acaba com chão`);
    }
    RR.LEVELS.forEach((lv, i) => {
      lv.chunks.forEach((c) => { if (!RR.CHUNKS[c]) issues.push(`nível ${i + 1}: troço ${c} não existe`); });
      const built = RR.buildLevel(lv);
      if (!built.objects.some((o) => o.ch === 'G')) issues.push(`nível ${i + 1}: sem meta`);
      if (!built.objects.some((o) => o.ch === 'P')) issues.push(`nível ${i + 1}: sem início`);
      if (lv.boss && !built.objects.some((o) => o.ch === 'Z')) issues.push(`nível ${i + 1}: chefe sem arena`);
      if (lv.boss && !RR.BOSSES[lv.boss]) issues.push(`nível ${i + 1}: chefe ${lv.boss} não existe`);
    });
    return issues;
  }

  /* Prova de viabilidade: procura (beam search) uma sequência de botões que atravesse
     um troço sem inimigos. Se encontrar, o troço é possível para um humano. */
  function solveChunk(li, chunkName, beamW = 80, maxDepth = 90) {
    const g = window.RAMRUSH.game;
    g.setCharacter('bit'); g.loadLevel(li); g.state = 'playing'; g.enemies = []; g.lives = 999;
    const sp = RR.buildLevel(RR.LEVELS[li]).spans.find((s) => s.name === chunkName);
    if (!sp) return { ok: false, reason: 'troço inexistente' };
    const x0 = sp.c0 * T, x1 = (sp.c0 + sp.w) * T;
    // começa num ponto onde o jogador caiba de pé, perto do início do troço
    const p0 = g.player;
    let sc = sp.c0, sr = 14;
    search: for (const c of [sp.c0 - 2, sp.c0 - 1, sp.c0, sp.c0 - 3, sp.c0 + 1, sp.c0 + 2]) {
      for (let r = 15; r >= 2; r--) {
        if (SOLIDS[g.tile(c, r)] && !SOLIDS[g.tile(c, r - 1)] && !SOLIDS[g.tile(c, r - 2)] && !SOLIDS[g.tile(c + 1, r - 1)]) { sc = c; sr = r; break search; }
      }
    }
    p0.x = sc * T + 2; p0.y = sr * T - p0.h; p0.vx = 300;
    const snap = () => ({ p: JSON.parse(JSON.stringify(g.player)), tiles: g.tiles.map((r) => r.slice()), cr: [...g.crumbles].map(([k, v]) => [k, { ...v }]) });
    const load = (s) => { g.player = JSON.parse(JSON.stringify(s.p)); g.tiles = s.tiles.map((r) => r.slice()); g.crumbles = new Map(s.cr.map(([k, v]) => [k, { ...v }])); };
    const ACTS = [{ r: 1, j: 0, press: 0 }, { r: 1, j: 1, press: 1 }, { r: 1, j: 1, press: 0 }, { r: 0, j: 0, press: 0 }, { r: 0, j: 1, press: 1 }, { r: 1, j: 0, press: 1 }];
    let beam = [{ s: snap() }];
    for (let d = 0; d < maxDepth; d++) {
      const next = [];
      for (const node of beam) {
        for (const A of ACTS) {
          load(node.s);
          g.input.right = !!A.r; g.input.left = false; g.input.jump = !!A.j; g.input.jumpPressed = false;
          if (A.press) g.pressJump();
          let dead = false;
          for (let k = 0; k < 12; k++) { g.updatePlayer(1 / 120); g.updateCrumbles(1 / 120); if (g.player.dead) { dead = true; break; } }
          if (dead || g.player.y > 15 * T) continue;
          if (g.player.x > x1 + 16) return { ok: true, passos: d + 1 };
          next.push({ s: snap(), score: g.player.x + (g.player.onGround ? 40 : 0) - g.player.y * 0.2 });
        }
      }
      if (!next.length) return { ok: false, reason: 'sem estados vivos' };
      next.sort((a, b) => b.score - a.score);
      const seen = {};
      beam = [];
      for (const n of next) {
        const k = Math.floor(n.s.p.x / 16) + ',' + Math.floor(n.s.p.y / 16) + ',' + n.s.p.airJumps;
        if ((seen[k] = (seen[k] || 0) + 1) > 2) continue;
        beam.push(n);
        if (beam.length >= beamW) break;
      }
    }
    return { ok: false, reason: 'profundidade' };
  }

  // Prova todos os troços de todas as zonas (cada troço distinto uma vez).
  function solveAll() {
    const done = {}, out = {};
    RR.LEVELS.forEach((lv, li) => lv.chunks.forEach((c) => {
      if (done[c] || c === 'arena' || c === 'goal' || c === 'start') return;
      done[c] = true;
      out[c] = solveChunk(li, c).ok;
    }));
    return out;
  }

  window.RRTEST = {
    errors, where, botLevel, fuzz, lintChunks, solveChunk, solveAll,
    runAll() {
      const lint = lintChunks();
      const viabilidade = solveAll();
      const bots = RR.LEVELS.map((_, i) => botLevel(i, { weapons: i > 1 }));
      const god = RR.LEVELS.map((lv, i) => (lv.boss ? botLevel(i, { god: true, weapons: i > 1, fromArena: true }) : null)).filter(Boolean)
        .map((r) => ({ zona: r.zona, estado: r.estado, chefe: r.chefe, tempoChefe: r.tempoChefe }));
      // Cada personagem numa zona com perigos diferentes.
      const chars = RR.CHARACTERS.map((c, k) => { const z = [3, 5, 6, 8, 9, 7][k % 6]; const r = botLevel(z, { char: c.id, weapons: true }); return `${c.id}@Z${z + 1}:${r.estado}`; });
      const fz = [fuzz(200, 11), fuzz(200, 23, 3), fuzz(200, 37, 6), fuzz(200, 41, 8)];
      window.RAMRUSH.game.setCharacter('bit');
      window.RAMRUSH.ui.toMenu();
      return { lint, viabilidade, bots, chefesModoDeus: god, personagens: chars, fuzz: fz, erros: errors.slice() };
    },
  };
})();
