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
      click('btn-play', () => this.startGame());
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

      this.renderMute();
      this.el['title-best'].textContent = this.fmt(game.best);
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-device');
      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') document.body.classList.add('touch-device');
      }, { passive: true });
    }

    fmt(n) { return Math.round(n).toLocaleString('pt-PT'); }
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
      ['screen-title', 'screen-pause', 'screen-over', 'screen-clear', 'screen-win', 'screen-help'].forEach((id) => this.show(id, false));
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
      this.game.startNew();
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
      this.hideScreens();
      const g = this.game;
      g.loadLevel(0);
      g.state = 'title';
      this.el['title-best'].textContent = this.fmt(g.best);
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
        case 'level': this.levelBanner(d); break;
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
          else if (d.what === 'weapon') this.toast('Ainda só tens o Canhão ECC. Vence o primeiro chefe para desbloquear outra arma', 'warn');
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
        case 'unlock': this.toast('🔓 Nova arma: Disparo Dual Channel (3 pacotes em leque). Troca com Tab', 'save', 4500); break;
        case 'weapon': this.toast(d.weapon === 'spread' ? 'Arma: Disparo Dual Channel' : 'Arma: Canhão ECC', 'info', 1400); break;
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
      $('over-score').textContent = this.fmt(g.score);
      $('over-best').textContent = this.fmt(g.best);
      $('over-record').style.display = d.isRecord && g.score > 0 ? '' : 'none';
      $('over-level').textContent = `${g.levelIndex + 1} · ${g.def.name}`;
      $('over-chips').textContent = this.fmt(t.chips) + ' GB';
      $('over-kills').textContent = t.kills;
      $('over-leaks').textContent = t.leaks;
      this.later(() => {
        this.show('screen-over', true);
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
      this.set('weapon', el['hud-weapon'], g.weapon === 'spread' ? 'Dual Channel ×3' : 'Canhão ECC');
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
