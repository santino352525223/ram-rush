/* =========================================================================
   RAM RUSH — Entrada: teclado, rato e botões táteis
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});

  const MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', Enter: 'jump', NumpadEnter: 'jump',
    KeyF: 'shoot', KeyX: 'shoot', KeyJ: 'shoot', KeyK: 'shoot',
  };

  class Input {
    constructor(game, ui, audio, canvas) {
      this.game = game;
      this.ui = ui;
      this.audio = audio;
      this.held = { left: new Set(), right: new Set(), down: new Set(), jump: new Set(), shoot: new Set() };

      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      window.addEventListener('keyup', (e) => this.onKeyUp(e));
      window.addEventListener('blur', () => this.releaseAll());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
      if (canvas) {
        canvas.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'touch') return; // no tátil usam-se os botões
          if (e.button !== 0) return;
          this.audio.unlock();
          if (this.game.state === 'playing') this.held.shoot.add('mouse');
        });
        window.addEventListener('pointerup', () => this.held.shoot.delete('mouse'));
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      this.bindTouch();
    }

    // Chamado a cada frame: copia o estado das teclas para o jogo.
    sync() {
      const i = this.game.input;
      i.left = this.held.left.size > 0;
      i.right = this.held.right.size > 0;
      i.down = this.held.down.size > 0;
      i.jump = this.held.jump.size > 0;
      if (this.held.shoot.size > 0 && this.game.state === 'playing') this.game.shoot();
    }

    releaseAll() {
      for (const k in this.held) this.held[k].clear();
      this.game.clearInput();
      document.querySelectorAll('.tbtn.on').forEach((b) => b.classList.remove('on'));
    }

    press(action, source) {
      const g = this.game;
      if (g.state !== 'playing') return;
      if (action === 'jump' && !this.held.jump.size) g.pressJump();
      if (action === 'shoot' && !this.held.shoot.size) g.shoot();
      this.held[action].add(source);
    }

    release(action, source) {
      this.held[action].delete(source);
    }

    onKeyDown(e) {
      const code = e.code;
      const g = this.game, ui = this.ui;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this.audio.unlock();
      if (code in MAP || code === 'Tab') e.preventDefault();

      if (ui.helpOpen) {
        if (!e.repeat && ['Escape', 'KeyH', 'Enter', 'Space'].includes(code)) ui.closeHelp();
        return;
      }
      if (code === 'KeyM' && !e.repeat) { ui.toggleMute(); return; }

      switch (g.state) {
        case 'title':
          if (!e.repeat && (code === 'Enter' || code === 'Space')) ui.startGame();
          else if (code === 'KeyH') ui.openHelp();
          return;
        case 'cleared':
          if (!e.repeat && ui.overlayReady && (code === 'Enter' || code === 'Space')) ui.nextLevel();
          return;
        case 'gameover':
          if (!e.repeat && ui.overlayReady) {
            if (code === 'Enter' || code === 'Space' || code === 'KeyR') ui.continueLevel();
            else if (code === 'Escape') ui.toMenu();
          }
          return;
        case 'victory':
          if (!e.repeat && ui.overlayReady) {
            if (code === 'Enter' || code === 'Space') ui.startGame();
            else if (code === 'Escape') ui.toMenu();
          }
          return;
        case 'paused':
          if (e.repeat) return;
          if (code === 'KeyP' || code === 'Escape' || code === 'Enter' || code === 'Space') ui.togglePause();
          else if (code === 'KeyR') ui.restartLevel();
          else if (code === 'KeyH') ui.openHelp();
          return;
        default:
          break;
      }

      // A jogar
      if (code in MAP) { if (!e.repeat) this.press(MAP[code], code); return; }
      if (e.repeat) return;
      switch (code) {
        case 'KeyP': case 'Escape': ui.togglePause(); break;
        case 'KeyR': ui.restartLevel(); break;
        case 'KeyH': ui.openHelp(); break;
        case 'KeyE': case 'ShiftLeft': case 'ShiftRight': g.dash(); break;
        case 'KeyQ': g.garbageCollect(); break;
        case 'KeyB': case 'KeyC': g.bomb(); break;
        case 'Tab': g.switchWeapon(); break;
        case 'Digit1': if (g.weapon !== 'ecc') g.switchWeapon(); break;
        case 'Digit2': if (g.weapon !== 'spread') g.switchWeapon(); break;
        default: break;
      }
    }

    onKeyUp(e) {
      const a = MAP[e.code];
      if (a) this.release(a, e.code);
    }

    // Botões táteis (também funcionam com o rato).
    bindTouch() {
      document.querySelectorAll('.tbtn').forEach((btn) => {
        const act = btn.dataset.act;
        const src = 'touch-' + act;
        const down = (e) => {
          e.preventDefault();
          this.audio.unlock();
          try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignorar */ }
          btn.classList.add('on');
          if (act === 'dash') this.game.dash();
          else if (act === 'gc') this.game.garbageCollect();
          else if (act === 'bomb') this.game.bomb();
          else this.press(act, src);
        };
        const up = () => {
          btn.classList.remove('on');
          if (this.held[act]) this.release(act, src);
        };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('lostpointercapture', up);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    }
  }

  RR.Input = Input;
})();
