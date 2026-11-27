/* =========================================================================
   RAM RUSH — Interface DOM: HUD, ecrãs, banners e avisos (pt-PT)
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const C = RR.CONFIG;
  const $ = (id) => document.getElementById(id);

  class UI {
    constructor(game, audio) {
      this.game = game;
      this.audio = audio;
      this.helpOpen = false;
      this.pausedByHelp = false;
      this.overlayReady = false;
      this.timers = [];
      this.cache = {};
      this.onLayoutChange = null;
      this.lastRam = 0;

      const ids = ['hud', 'touch', 'screen-title', 'screen-help', 'screen-pause', 'screen-over', 'screen-clear', 'screen-win',
        'screen-chars', 'screen-rank', 'screen-login', 'char-grid', 'zone-grid', 'zone-unlocked', 'rank-body',
        'banner', 'toasts', 'hud-ram', 'hud-ram-box', 'hud-lives', 'hud-score', 'hud-time', 'hud-level', 'hud-zone',
        'energy-fill', 'energy-box', 'btn-dash', 'btn-gc', 'gc-sub', 'dash-sub', 'btn-mute', 'title-best',
        'boss-bar', 'boss-name', 'boss-phase', 'boss-fill', 'hud-weapon', 'hud-bombs', 'heat-fill', 'weapon-box'];
      this.el = {};
      ids.forEach((id) => { this.el[id] = $(id); });

      const click = (id, fn) => $(id).addEventListener('click', (e) => {
        e.currentTarget.blur();
        this.audio.unlock();
        this.audio.play('ui');
        fn();
      });
      click('btn-play', () => this.openChars());
      click('btn-chars-go', () => this.startGame());
      click('btn-chars-back', () => this.closeChars());
      click('btn-title-rank', () => this.openRanking());
      click('btn-rank-back', () => this.closeRanking());
      click('btn-over-rank', () => this.openRanking(this.playerName()));
      click('btn-win-rank', () => this.openRanking(this.playerName()));
      click('btn-switch', () => this.openLogin());
      $('login-form').addEventListener('submit', (e) => { e.preventDefault(); this.doLogin($('login-name').value); });
      this.zoneSel = 0;
      this.loadProfileSelection();
      this.buildChars();
      // Ao entrar no jogo pede-se logo o nome (se ainda não houver conta ativa).
      if (!RR.Profiles.current()) setTimeout(() => this.openLogin(), 0);
      else this.renderPlayerBar();
      click('btn-title-help', () => this.openHelp());
      click('btn-help-close', () => this.closeHelp());
      click('btn-help', () => this.openHelp());
      click('btn-pause', () => this.togglePause());
      click('btn-mute', () => this.toggleMute());
      click('btn-resume', () => this.togglePause());
      click('btn-pause-restart', () => this.restartLevel());
      click('btn-pause-help', () => this.openHelp());
      click('btn-pause-menu', () => this.toMenu());
      click('btn-retry', () => this.continueLevel());
      click('btn-over-menu', () => this.toMenu());
      click('btn-next', () => this.nextLevel());
      click('btn-win-again', () => this.startGame());
      click('btn-win-menu', () => this.toMenu());
      $('btn-dash').addEventListener('click', (e) => { e.currentTarget.blur(); this.audio.unlock(); this.game.dash(); });
      $('btn-gc').addEventListener('click', (e) => { e.currentTarget.blur(); this.audio.unlock(); this.game.garbageCollect(); });
      $('weapon-box').addEventListener('click', () => this.game.switchWeapon());
      $('btn-special').addEventListener('click', (e) => { e.currentTarget.blur(); this.audio.unlock(); this.game.special(); });

      this.renderMute();
      this.el['title-best'].textContent = this.fmt(this.bestScore());
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-device');
      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') document.body.classList.add('touch-device');
      }, { passive: true });
    }

    fmt(n) { return Math.round(n).toLocaleString('pt-PT'); }
    bestScore() { return RR.Ranking.best(); }

    // ---------------------------------------------------- contas de jogador
    playerName() { const p = RR.Profiles.current(); return p ? p.name : 'Anónimo'; }

    loadProfileSelection() {
      const save = RR.Save.get();
      this.sel = Math.max(0, RR.CHARACTERS.findIndex((c) => c.id === save.char));
      this.zoneSel = 0;
    }

    renderPlayerBar() {
      const p = RR.Profiles.current();
      $('title-player').textContent = p ? p.name : '—';
      $('title-pbest').textContent = this.fmt(p ? p.best || 0 : 0);
      this.el['title-best'].textContent = this.fmt(this.bestScore());
    }

    openLogin() {
      this.loginOpen = true;
      this.show('screen-title', false);
      const list = $('profile-list');
      list.innerHTML = '';
      const profiles = RR.Profiles.list();
      $('profiles-title').style.display = profiles.length ? '' : 'none';
      profiles.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'profile-btn';
        const ch = RR.getCharacter(p.char);
        b.style.setProperty('--c', ch.colors.main);
        b.innerHTML = `<b></b><small>Recorde: ${this.fmt(p.best || 0)} · Zona ${p.unlocked || 1} · ${p.games || 0} jogos</small>`;
        b.querySelector('b').textContent = p.name;
        b.addEventListener('click', () => this.doLogin(p.name));
        list.appendChild(b);
      });
      $('login-error').textContent = '';
      const cur = RR.Profiles.current();
      $('login-name').value = '';
      this.show('screen-login', true);
      setTimeout(() => $('login-name').focus({ preventScroll: true }), 80);
      this.loginCanCancel = !!cur;
    }

    doLogin(name) {
      const n = String(name || '').trim();
      if (n.length < 2) { $('login-error').textContent = 'O nome tem de ter pelo menos 2 letras.'; this.audio.play('error'); return; }
      this.audio.unlock();
      const isNew = !RR.Profiles.get(n);
      const p = RR.Profiles.login(n);
      this.audio.play('checkpoint');
      this.loginOpen = false;
      this.show('screen-login', false);
      this.loadProfileSelection();
      this.renderPlayerBar();
      this.show('screen-title', true);
      this.toast(isNew ? `👋 Bem-vindo(a), ${p.name}! Conta criada.` : `👋 Olá outra vez, ${p.name}!`, 'save', 2600);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    // Regista a pontuação da partida na conta e no TOP 10 (automático).
    submitRun(won) {
      const g = this.game;
      const p = RR.Profiles.current();
      if (!p || g.score <= 0) return { rank: p ? RR.Ranking.positionOf(p.name) : -1, improved: false, personal: false };
      const personal = g.score > (p.best || 0);
      RR.Profiles.update({
        best: Math.max(p.best || 0, g.score),
        games: (p.games || 0) + 1,
        wins: (p.wins || 0) + (won ? 1 : 0),
        chips: (p.chips || 0) + (g.totals.chips || 0),
        bosses: Math.max(p.bosses || 0, g.totals.bosses || 0),
      });
      const data = { zone: g.levelIndex + 1, char: g.charId, won };
      const res = RR.Ranking.submit(p.name, g.score, data);
      res.personal = personal;
      // Envia também para o ranking mundial (em segundo plano).
      if (RR.Online.enabled()) res.online = RR.Online.submit(p.name, g.score, data).catch(() => null);
      return res;
    }

    showRankResult(prefix, res) {
      const msg = $(prefix + '-rankmsg');
      if (res.rank >= 0 && res.improved) msg.innerHTML = `🏆 <b></b> entrou no TOP 10 em <b>#${res.rank + 1}</b>!`;
      else if (res.personal) msg.innerHTML = '⭐ Novo recorde pessoal de <b></b>!';
      else if (res.rank >= 0) msg.innerHTML = `<b></b> continua no TOP 10 em <b>#${res.rank + 1}</b>.`;
      else msg.innerHTML = '<b></b>: ainda não chegou ao TOP 10. Tenta outra vez!';
      msg.querySelector('b').textContent = this.playerName();
      if (res.online) {
        const w = document.createElement('div');
        w.className = 'world-rank';
        w.textContent = '🌍 A enviar para o ranking mundial…';
        msg.appendChild(w);
        res.online.then((o) => {
          if (!o) { w.textContent = '🌍 Sem ligação: o ranking mundial fica para a próxima.'; return; }
          w.textContent = o.rank >= 0 ? `🌍 Posição mundial: #${this.fmt(o.rank + 1)}${o.improved ? ' (novo recorde!)' : ''}` : '🌍 Ranking mundial atualizado';
        });
      }
    }

    // ------------------------------------------------- escolha de personagem
    buildChars() {
      const grid = this.el['char-grid'];
      grid.innerHTML = '';
      this.charCanvases = [];
      RR.CHARACTERS.forEach((c, i) => {
        const card = document.createElement('button');
        card.className = 'char-card';
        card.style.setProperty('--c', c.colors.main);
        const stats = Object.entries(c.stats).map(([k, v]) =>
          `<div class="stat"><span>${k}</span><i>${'<b></b>'.repeat(v)}${'<em></em>'.repeat(5 - v)}</i></div>`).join('');
        card.innerHTML = `<canvas width="240" height="200" aria-hidden="true"></canvas>
          <div class="char-name">${c.name}</div><div class="char-tag">${c.tagline}</div>
          <div class="char-stats">${stats}</div><div class="char-desc">${c.desc}</div>
          <div class="char-special">★ <b>${c.special.name}</b>: ${c.special.desc}</div>`;
        card.addEventListener('click', () => { this.sel = i; this.audio.unlock(); this.audio.play('ui'); this.renderChars(); });
        card.addEventListener('dblclick', () => this.startGame());
        grid.appendChild(card);
        this.charCanvases.push(card.querySelector('canvas'));
      });
    }

    renderChars() {
      [...this.el['char-grid'].children].forEach((card, i) => card.classList.toggle('selected', i === this.sel));
      const unlocked = RR.Save.get().unlocked;
      this.zoneSel = Math.min(this.zoneSel, unlocked - 1);
      const zg = this.el['zone-grid'];
      zg.innerHTML = '';
      RR.LEVELS.forEach((lv, i) => {
        const b = document.createElement('button');
        b.className = 'zone-btn' + (i === this.zoneSel ? ' selected' : '');
        b.disabled = i >= unlocked;
        b.style.setProperty('--z', RR.THEMES[lv.theme].edge);
        b.innerHTML = `<b>${i + 1}</b><span>${i >= unlocked ? '🔒 Bloqueada' : lv.name}</span>${lv.boss ? `<small>👑 ${RR.BOSSES[lv.boss].name}</small>` : '<small>&nbsp;</small>'}`;
        b.addEventListener('click', () => { this.zoneSel = i; this.audio.play('ui'); this.renderChars(); });
        zg.appendChild(b);
      });
      this.el['zone-unlocked'].textContent = `(${unlocked}/${RR.LEVELS.length} desbloqueadas)`;
    }

    openChars() {
      this.hideScreens();
      this.renderChars();
      this.show('screen-chars', true);
      this.charsOpen = true;
      const loop = (now) => {
        if (!this.charsOpen) return;
        const t = now / 1000;
        this.charCanvases.forEach((cv, i) => {
          const ctx = cv.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cv.width, cv.height);
          const sel = i === this.sel;
          const c = RR.CHARACTERS[i];
          const grd = ctx.createRadialGradient(120, 120, 10, 120, 120, 110);
          grd.addColorStop(0, sel ? c.colors.main + '66' : c.colors.main + '22');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(20, 168, 200, 3);
          ctx.translate(120, 168);
          ctx.scale(2.6, 2.6);
          const moving = sel;
          RR.drawCharacter(ctx, c.id, { t, run: moving ? t * 320 : 0, moving, air: false, speed: moving ? 400 : 0 });
        });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    closeChars() {
      this.charsOpen = false;
      this.show('screen-chars', false);
      this.show('screen-title', true);
    }

    moveChar(d) {
      this.sel = (this.sel + d + RR.CHARACTERS.length) % RR.CHARACTERS.length;
      this.audio.play('move');
      this.renderChars();
    }

    moveZone(d) {
      const unlocked = RR.Save.get().unlocked;
      this.zoneSel = Math.max(0, Math.min(unlocked - 1, this.zoneSel + d));
      this.audio.play('move');
      this.renderChars();
    }

    // ------------------------------------------------------------- ranking
    // Ecrã de ranking: mostra o top 10, deixa paginar até ao top 10 000 e
    // mostra sempre a posição do jogador em baixo.
    openRanking() {
      this.rankOpen = true;
      this.rankOffset = 0;
      if (!this.rankBound) {
        this.rankBound = true;
        $('rank-tab-online').addEventListener('click', () => this.setRankSource('online'));
        $('rank-tab-local').addEventListener('click', () => this.setRankSource('local'));
        $('rank-prev').addEventListener('click', () => this.rankGo(this.rankOffset - 10));
        $('rank-next').addEventListener('click', () => this.rankGo(this.rankOffset + 10));
        $('rank-goto-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const n = parseInt($('rank-goto').value, 10);
          if (n >= 1) this.rankGo(Math.floor((Math.min(10000, n) - 1) / 10) * 10);
          $('rank-goto').blur();
        });
      }
      this.rankSource = RR.Online.enabled() ? (this.rankSource || 'online') : 'local';
      $('rank-tab-online').style.display = RR.Online.enabled() ? '' : 'none';
      this.show('screen-rank', true);
      this.renderRanking();
    }

    setRankSource(src) { this.rankSource = src; this.rankOffset = 0; this.audio.play('ui'); this.renderRanking(); }
    rankGo(off) { this.rankOffset = Math.max(0, Math.min(9990, off)); this.audio.play('move'); this.renderRanking(); }

    async renderRanking() {
      const token = (this.rankToken = (this.rankToken || 0) + 1);
      const online = this.rankSource === 'online';
      const off = this.rankOffset;
      const me = this.playerName();
      $('rank-tab-online').classList.toggle('active', online);
      $('rank-tab-local').classList.toggle('active', !online);
      $('rank-note').textContent = online
        ? 'Ranking mundial: todos os jogadores do RAM RUSH. Cada conta aparece uma vez, com a sua melhor pontuação.'
        : 'Ranking deste computador. Cada jogador aparece uma vez, com a sua melhor pontuação.';
      const status = $('rank-status');
      const body = this.el['rank-body'];
      let rows = [], total = 0, mine = null;
      if (online) {
        status.textContent = '⏳ A carregar o ranking mundial…';
        try {
          [rows, total, mine] = await Promise.all([RR.Online.page(off, 10), RR.Online.count(), RR.Online.me(me).catch(() => null)]);
          status.textContent = '';
        } catch (e) {
          if (token !== this.rankToken) return;
          status.textContent = '⚠ Sem ligação ao ranking mundial. A mostrar o ranking deste computador.';
          this.rankSource = 'local';
          return this.renderRanking();
        }
      } else {
        status.textContent = '';
        rows = RR.Ranking.page(off, 10);
        total = RR.Ranking.count();
        mine = RR.Ranking.entryOf(me);
      }
      if (token !== this.rankToken || !this.rankOpen) return;
      total = Math.min(10000, total);
      body.innerHTML = '';
      if (!rows.length) body.innerHTML = `<tr><td colspan="6" class="empty">${off ? 'Não há mais jogadores nesta página.' : 'Ainda não há pontuações. Sê o primeiro!'}</td></tr>`;
      rows.forEach((e, i) => {
        const pos = off + i;
        const tr = document.createElement('tr');
        const isMe = mine && (online ? e.id === mine.entry.id : e.name.toLowerCase() === me.toLowerCase());
        if (isMe) tr.className = 'me';
        const medal = ['🥇', '🥈', '🥉'][pos] || (pos + 1);
        const cells = [medal, e.name, this.fmt(e.score), (e.won ? '🏆 ' : '') + e.zone, RR.getCharacter(e.char).name, e.date];
        cells.forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
        body.appendChild(tr);
      });
      $('rank-range').textContent = total ? `${off + 1}–${Math.min(off + 10, total)} de ${this.fmt(total)}` : '—';
      $('rank-prev').disabled = off <= 0;
      $('rank-next').disabled = off + 10 >= total || off + 10 >= 10000;
      // A tua posição, sempre visível em baixo (sem ter de a procurar).
      const meBox = $('rank-me');
      meBox.innerHTML = '';
      if (mine) {
        const pos = mine.rank + 1;
        meBox.innerHTML = '<span class="rank-me-pos"></span><span class="rank-me-name"></span><span class="rank-me-score"></span><button class="btn small-btn" type="button">Ver a minha página</button>';
        meBox.querySelector('.rank-me-pos').textContent = pos <= 3 ? ['🥇', '🥈', '🥉'][pos - 1] + ' #' + pos : '#' + this.fmt(pos);
        meBox.querySelector('.rank-me-name').textContent = 'A tua posição · ' + mine.entry.name;
        meBox.querySelector('.rank-me-score').textContent = this.fmt(mine.entry.score) + ' pts';
        meBox.querySelector('button').addEventListener('click', () => this.rankGo(Math.floor(mine.rank / 10) * 10));
      } else {
        meBox.innerHTML = '<span class="rank-me-name"></span>';
        meBox.querySelector('.rank-me-name').textContent = `${me}: ainda não tens pontuação ${online ? 'no ranking mundial' : 'neste computador'}. Joga uma partida!`;
      }
    }

    closeRanking() {
      this.rankOpen = false;
      this.show('screen-rank', false);
      if (this.game.state === 'title') this.renderPlayerBar();
    }

    // Teclas nos menus (conta / personagens / ranking). Devolve true se tratou a tecla.
    menuKey(code) {
      if (this.loginOpen) {
        if (code === 'Escape' && this.loginCanCancel) { this.loginOpen = false; this.show('screen-login', false); this.show('screen-title', true); }
        return true;
      }
      if (this.rankOpen) {
        if (code === 'Escape' || code === 'Enter' || code === 'Space') { this.closeRanking(); return true; }
        return true;
      }
      if (this.charsOpen) {
        if (code === 'ArrowLeft' || code === 'KeyA') this.moveChar(-1);
        else if (code === 'ArrowRight' || code === 'KeyD') this.moveChar(1);
        else if (code === 'ArrowUp' || code === 'KeyW') this.moveZone(-1);
        else if (code === 'ArrowDown' || code === 'KeyS') this.moveZone(1);
        else if (code === 'Enter' || code === 'Space') this.startGame();
        else if (code === 'Escape') this.closeChars();
        return true;
      }
      return false;
    }
    fmtTime(t) {
      const m = Math.floor(t / 60), s = Math.floor(t % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    getInsets() {
      const hud = this.el.hud.getBoundingClientRect();
      const touch = this.el.touch.getBoundingClientRect();
      const touchVisible = getComputedStyle(this.el.touch).display !== 'none' && touch.height > 0;
      // Os botões táteis flutuam por cima do cenário: só se reserva uma margem pequena.
      return { top: Math.max(0, hud.bottom), bottom: touchVisible ? Math.min(36, Math.max(0, window.innerHeight - touch.top)) : 0 };
    }

    show(id, on) {
      const el = this.el[id];
      el.classList.toggle('visible', !!on);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
    }

    hideScreens() {
      ['screen-title', 'screen-pause', 'screen-over', 'screen-clear', 'screen-win', 'screen-help', 'screen-chars', 'screen-rank', 'screen-login'].forEach((id) => this.show(id, false));
      this.loginOpen = false;
      this.charsOpen = false;
      this.rankOpen = false;
      this.helpOpen = false;
      this.pausedByHelp = false;
      this.overlayReady = false;
      this.timers.forEach(clearTimeout);
      this.timers = [];
    }

    later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

    // ------------------------------------------------------------------ fluxo
    startGame() {
      this.audio.unlock();
      this.hideScreens();
      document.body.classList.add('in-game');
      this.cache = {};
      const ch = RR.CHARACTERS[this.sel] || RR.CHARACTERS[0];
      this.game.setCharacter(ch.id);
      RR.Save.set({ char: ch.id });
      this.game.startNew(this.zoneSel || 0);
      if (this.onLayoutChange) this.onLayoutChange();
      if (document.body.classList.contains('touch-device') && window.innerHeight > window.innerWidth) {
        this.later(() => this.toast('📱 Dica: roda o telemóvel na horizontal para veres mais do nível', 'info', 3500), 4500);
      }
    }

    restartLevel() {
      this.hideScreens();
      this.cache = {};
      this.game.restartLevel();
      this.toast('↻ Nível reiniciado', 'info');
    }

    continueLevel() {
      this.hideScreens();
      this.cache = {};
      this.game.continueLevel();
    }

    nextLevel() {
      this.hideScreens();
      this.cache = {};
      this.game.nextLevel();
    }

    toMenu() {
      const g = this.game;
      // Sair a meio da partida também conta para o recorde e o ranking.
      if (g.state === 'paused' || g.state === 'playing' || g.state === 'cleared') this.submitRun(false);
      this.hideScreens();
      g.loadLevel(0);
      g.state = 'title';
      this.renderPlayerBar();
      this.show('screen-title', true);
      document.body.classList.remove('in-game');
      this.cache = {};
      if (this.onLayoutChange) this.onLayoutChange();
    }

    togglePause() {
      const g = this.game;
      if (g.state === 'playing') { g.pause(); this.show('screen-pause', true); }
      else if (g.state === 'paused') { this.show('screen-pause', false); g.resume(); }
    }

    autoPause() {
      if (this.game.state === 'playing' && !this.helpOpen) this.togglePause();
    }

    openHelp() {
      if (this.helpOpen) return;
      if (this.game.state === 'playing') { this.game.pause(); this.pausedByHelp = true; }
      this.helpOpen = true;
      this.show('screen-help', true);
      setTimeout(() => $('btn-help-close').focus({ preventScroll: true }), 50);
    }

    closeHelp() {
      if (!this.helpOpen) return;
      this.helpOpen = false;
      this.show('screen-help', false);
      if (this.pausedByHelp) { this.pausedByHelp = false; this.game.resume(); }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    toggleMute() {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.muted);
      this.renderMute();
    }

    renderMute() {
      const b = this.el['btn-mute'];
      b.textContent = this.audio.muted ? '🔇' : '🔊';
      b.setAttribute('aria-label', this.audio.muted ? 'Ativar som' : 'Silenciar');
    }

    // --------------------------------------------------------------- eventos
    onEvent(type, d) {
      switch (type) {
        case 'level': RR.Save.unlock(d.index); this.levelBanner(d); break;
        case 'hint': if (d.text) this.toast(d.text, 'hint'); break;
        case 'checkpoint': this.toast('💾 ' + d.fact, 'save', 4200); break;
        case 'cleared': this.showCleared(d); break;
        case 'victory': this.showVictory(d); break;
        case 'gameover': this.showGameOver(d); break;
        case 'extraLife': this.toast(`⭐ Vida extra por apanhares ${C.EXTRA_LIFE_EVERY} GB! Vidas: ${d.lives}`, 'save'); break;
        case 'respawn': this.toast(`Recomeças no último SSD · a RAM foi apagada (é volátil) · Vidas: ${d.lives}`, 'bad', 3000); break;
        case 'denied':
          if (d.what === 'gc') this.toast(`Garbage Collector a recarregar (${Math.ceil(this.game.gcCooldown)} s)`, 'warn');
          else if (d.what === 'dash') this.toast('Energia insuficiente: apanha RAM e elimina inimigos', 'warn');
          else if (d.what === 'bomb') this.toast('Não tens Bombas de Refresh! Procura-as pelo nível', 'warn');
          else if (d.what === 'weapon') this.toast('Essa arma ainda está bloqueada: vence mais chefes para a desbloquear', 'warn');
          else if (d.what === 'special') this.toast(`Habilidade especial a recarregar (${Math.ceil(this.game.specialCd)} s)`, 'warn');
          break;
        case 'energyFull':
          this.el['btn-dash'].classList.add('flash');
          this.later(() => this.el['btn-dash'].classList.remove('flash'), 1000);
          break;
        case 'hurt':
          this.el['hud-ram-box'].classList.remove('lost');
          void this.el['hud-ram-box'].offsetWidth;
          this.el['hud-ram-box'].classList.add('lost');
          break;
        case 'bossIntro': this.bossBanner(d.boss); break;
        case 'bossPhase': this.toast(d.phase === 3 ? '⚠ O chefe entrou em fúria total!' : '⚠ O chefe ficou mais forte! Fase 2', 'bad'); break;
        case 'bossDefeated': this.toast('🏆 Chefe derrotado! O CPU está desbloqueado: vai até à meta', 'save', 4000); break;
        case 'unlock': this.toast(`🔓 Nova arma: ${RR.WEAPONS[d.weapon].name}. ${RR.WEAPONS[d.weapon].desc} Troca com Tab ou 1–4`, 'save', 5000); break;
        case 'weapon': this.toast('Arma: ' + RR.WEAPONS[d.weapon].name, 'info', 1400); break;
        case 'special': this.toast(`★ ${d.name}!`, 'boost', 1600); break;
        default: break;
      }
    }

    levelBanner(d) {
      $('banner-kicker').textContent = d.restart ? 'NÍVEL REINICIADO' : `ZONA ${d.index + 1} DE ${RR.LEVELS.length}` + (d.def.boss ? ' · COM CHEFE' : '');
      $('banner-title').textContent = d.def.name;
      $('banner-fact').textContent = d.def.fact;
      this.flashBanner(4200, false);
    }

    bossBanner(b) {
      $('banner-kicker').textContent = '⚠ ALERTA: CHEFE';
      $('banner-title').textContent = b.name;
      $('banner-fact').textContent = b.subtitle;
      this.flashBanner(2800, true);
    }

    flashBanner(ms, boss) {
      const b = this.el.banner;
      b.classList.toggle('boss', !!boss);
      b.classList.remove('visible');
      void b.offsetWidth;
      b.classList.add('visible');
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => b.classList.remove('visible'), ms);
    }

    toast(text, kind = 'info', ms = 2600) {
      const t = document.createElement('div');
      t.className = 'toast ' + kind;
      t.textContent = text;
      this.el.toasts.appendChild(t);
      while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), ms - 450);
      setTimeout(() => t.remove(), ms);
    }

    showCleared(d) {
      $('clear-title').textContent = d.last ? 'Última zona concluída!' : `${this.game.def.name} concluída!`;
      $('clear-ram').textContent = `${d.ram} GB × 100 = ${this.fmt(d.ramBonus)}`;
      $('clear-time').textContent = `${this.fmtTime(d.time)} → +${this.fmt(d.timeBonus)}`;
      $('clear-chips').textContent = `${d.chips}/${d.chipTotal}` + (d.perfectBonus ? `  ★ +${this.fmt(d.perfectBonus)}` : '');
      $('clear-modules').textContent = `${d.modules}/${d.moduleTotal}`;
      $('clear-score').textContent = this.fmt(this.game.score);
      $('btn-next').textContent = d.last ? '🏆 Ver o final' : '▶ Zona seguinte';
      this.later(() => {
        this.show('screen-clear', true);
        this.later(() => { this.overlayReady = true; $('btn-next').focus({ preventScroll: true }); }, 450);
      }, 1300);
    }

    showGameOver(d) {
      const g = this.game, t = g.totals;
      const res = this.submitRun(false);
      $('over-score').textContent = this.fmt(g.score);
      $('over-best').textContent = this.fmt(g.best);
      $('over-record').style.display = d.isRecord && g.score > 0 ? '' : 'none';
      $('over-level').textContent = `${g.levelIndex + 1} · ${g.def.name}`;
      $('over-chips').textContent = this.fmt(t.chips) + ' GB';
      $('over-kills').textContent = t.kills;
      $('over-leaks').textContent = t.leaks;
      $('over-best').textContent = this.fmt(this.bestScore());
      this.later(() => {
        this.show('screen-over', true);
        this.showRankResult('over', res);
        this.later(() => { this.overlayReady = true; $('btn-retry').focus({ preventScroll: true }); }, 450);
      }, 900);
    }

    showVictory(d) {
      const g = this.game, t = g.totals;
      $('win-score').textContent = this.fmt(g.score);
      $('win-record').style.display = d.isRecord ? '' : 'none';
      $('win-chips').textContent = this.fmt(t.chips) + ' GB';
      $('win-kills').textContent = t.kills;
      $('win-bosses').textContent = t.bosses || 0;
      $('win-modules').textContent = t.modules;
      $('win-deaths').textContent = t.deaths;
      this.show('screen-clear', false);
      this.show('screen-win', true);
      this.showRankResult('win', this.submitRun(true));
      this.later(() => { this.overlayReady = true; $('btn-win-again').focus({ preventScroll: true }); }, 600);
    }

    // ------------------------------------------------------------ HUD (frame)
    set(key, el, val) { if (this.cache[key] !== val) { this.cache[key] = val; el.textContent = val; } }
    bar(key, el, frac) {
      const v = Math.max(0, Math.min(1, frac)).toFixed(3);
      if (this.cache[key] !== v) { this.cache[key] = v; el.style.transform = `scaleX(${v})`; }
    }
    cls(key, el, name, on) {
      const k = key + '.' + name;
      if (this.cache[k] !== on) { this.cache[k] = on; el.classList.toggle(name, on); }
    }

    update() {
      const g = this.game, el = this.el;
      if (g.state === 'title') {
        this.cls('boss', el['boss-bar'], 'visible', false);
        return;
      }
      this.set('ram', el['hud-ram'], String(g.ram));
      if (g.ram > this.lastRam) {
        el['hud-ram-box'].classList.remove('pop');
        void el['hud-ram-box'].offsetWidth;
        el['hud-ram-box'].classList.add('pop');
      }
      this.lastRam = g.ram;
      this.cls('ram', el['hud-ram-box'], 'empty', g.ram === 0);
      this.set('lives', el['hud-lives'], '×' + Math.max(0, g.lives));
      this.set('score', el['hud-score'], this.fmt(g.score));
      this.set('time', el['hud-time'], this.fmtTime(g.time));
      this.set('lvl', el['hud-level'], `ZONA ${g.levelIndex + 1}`);
      this.set('zone', el['hud-zone'], g.def.name);

      // Arma, sobreaquecimento e bombas
      this.set('weapon', el['hud-weapon'], (RR.WEAPONS[g.weapon] || RR.WEAPONS.ecc).name);
      const sp = g.char.special;
      if (sp) {
        const scd = g.specialCd;
        this.set('spname', $('special-name'), sp.name);
        this.set('spsub', $('special-sub'), scd > 0 ? `${Math.ceil(scd)} s` : 'Pronto (V)');
        this.cls('sp', $('btn-special'), 'ready', scd <= 0);
        $('btn-special').style.setProperty('--cd', (scd / sp.cd).toFixed(3));
      }
      this.set('bombs', el['hud-bombs'], '💣×' + g.bombs);
      this.bar('heat', el['heat-fill'], g.heat / 100);
      this.cls('heat', el['weapon-box'], 'overheat', g.overheat);

      const dashing = g.dashTime > 0;
      this.bar('energy', el['energy-fill'], dashing ? g.dashTime / C.DASH_TIME : g.energy / 100);
      this.cls('energy', el['energy-box'], 'active', dashing);
      const ready = !dashing && g.energy >= 100;
      this.cls('dash', el['btn-dash'], 'ready', ready);
      this.cls('dash', el['btn-dash'], 'active', dashing);
      this.set('dashsub', el['dash-sub'], dashing ? `Ativo! ${g.dashTime.toFixed(1)} s` : ready ? 'Pronto! (E)' : `${Math.floor(g.energy)} %`);
      const cd = g.gcCooldown;
      el['btn-gc'].style.setProperty('--cd', (cd / C.GC_COOLDOWN).toFixed(3));
      this.cls('gc', el['btn-gc'], 'ready', cd <= 0);
      this.set('gcsub', el['gc-sub'], cd > 0 ? `${Math.ceil(cd)} s` : 'Pronto (Q)');

      // Barra do chefe
      const b = g.boss;
      const showBoss = !!(b && (b.state === 'intro' || b.state === 'fight' || b.state === 'dying'));
      this.cls('boss', el['boss-bar'], 'visible', showBoss);
      this.cls('bossbody', document.body, 'boss-fight', showBoss);
      if (showBoss) {
        this.set('bossname', el['boss-name'], b.name);
        this.set('bossphase', el['boss-phase'], b.state === 'dying' ? 'A REPARAR…' : b.shieldT > 0 ? 'ESCUDO ATIVO' : `FASE ${b.phase}`);
        this.bar('bossfill', el['boss-fill'], b.hp / b.max);
        this.cls('bossshield', el['boss-bar'], 'shield', b.shieldT > 0);
      }
    }
  }

  RR.UI = UI;
})();
