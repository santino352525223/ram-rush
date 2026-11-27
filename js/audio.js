/* =========================================================================
   RAM RUSH — Audio sintético con Web Audio API (sin archivos externos)
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const STORE_KEY = 'ramrush.muted';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
      this.lastPlay = {};
      try { this.muted = localStorage.getItem(STORE_KEY) === '1'; } catch (e) { /* sin storage */ }
    }

    // Los navegadores exigen un gesto del usuario para iniciar el audio.
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        try {
          this.ctx = new AC();
        } catch (e) { return false; }
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        this.noiseBuf = this.makeNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }

    setMuted(m) {
      this.muted = m;
      try { localStorage.setItem(STORE_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }

    makeNoise() {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    tone({ type = 'sine', f = 440, f2 = null, dur = 0.12, vol = 0.2, delay = 0, attack = 0.006 }) {
      const c = this.ctx;
      const t0 = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }

    noise({ dur = 0.15, vol = 0.15, freq = 2000, freq2 = null, q = 1, delay = 0, type = 'bandpass' }) {
      const c = this.ctx;
      const t0 = c.currentTime + delay;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const flt = c.createBiquadFilter();
      flt.type = type;
      flt.frequency.setValueAtTime(freq, t0);
      if (freq2) flt.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
      flt.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(flt);
      flt.connect(g);
      g.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    }

    play(name, n = 0) {
      if (!this.ctx || this.muted) return;
      // Evita que un mismo sonido se apile muchas veces en el mismo instante.
      const now = this.ctx.currentTime;
      if (this.lastPlay[name] && now - this.lastPlay[name] < 0.035) return;
      this.lastPlay[name] = now;
      const pitch = Math.pow(2, Math.min(n, 16) / 24);
      switch (name) {
        case 'ui':
          this.tone({ type: 'square', f: 880, dur: 0.04, vol: 0.05 });
          break;
        case 'move':
          this.tone({ type: 'sine', f: 620, dur: 0.035, vol: 0.05 });
          break;
        case 'tick':
          this.tone({ type: 'sine', f: 1400, dur: 0.03, vol: 0.025 });
          break;
        case 'load':
          this.tone({ type: 'triangle', f: 320, f2: 760, dur: 0.12, vol: 0.18 });
          this.tone({ type: 'sine', f: 1040, dur: 0.06, vol: 0.06, delay: 0.08 });
          break;
        case 'complete':
          this.tone({ type: 'sine', f: 660 * pitch, dur: 0.12, vol: 0.12 });
          this.tone({ type: 'sine', f: 990 * pitch, dur: 0.16, vol: 0.1, delay: 0.06 });
          break;
        case 'free':
          this.tone({ type: 'triangle', f: 1200 * pitch, f2: 420 * pitch, dur: 0.16, vol: 0.14 });
          this.noise({ dur: 0.12, vol: 0.06, freq: 6000, type: 'highpass' });
          break;
        case 'fix':
          this.tone({ type: 'square', f: 520, dur: 0.06, vol: 0.07 });
          this.tone({ type: 'triangle', f: 780, dur: 0.08, vol: 0.12, delay: 0.06 });
          this.tone({ type: 'triangle', f: 1170, dur: 0.18, vol: 0.12, delay: 0.12 });
          break;
        case 'leak':
          this.tone({ type: 'sawtooth', f: 180, f2: 70, dur: 0.35, vol: 0.09 });
          this.noise({ dur: 0.25, vol: 0.05, freq: 400, q: 4 });
          break;
        case 'alert':
          this.tone({ type: 'square', f: 230, dur: 0.1, vol: 0.09 });
          this.tone({ type: 'square', f: 230, dur: 0.1, vol: 0.09, delay: 0.14 });
          break;
        case 'error':
          this.tone({ type: 'square', f: 170, f2: 120, dur: 0.16, vol: 0.08 });
          break;
        case 'thud':
          this.tone({ type: 'sine', f: 110, f2: 55, dur: 0.2, vol: 0.2 });
          break;
        case 'swap':
          this.tone({ type: 'sawtooth', f: 300, f2: 120, dur: 0.3, vol: 0.07 });
          this.noise({ dur: 0.3, vol: 0.05, freq: 800, freq2: 200 });
          break;
        case 'page':
          this.tone({ type: 'triangle', f: 240, f2: 520, dur: 0.18, vol: 0.12 });
          break;
        case 'cleanup':
          this.noise({ dur: 0.45, vol: 0.12, freq: 600, freq2: 9000, q: 2 });
          [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.14, vol: 0.08, delay: 0.05 * i }));
          break;
        case 'boost':
          this.tone({ type: 'sawtooth', f: 160, f2: 1300, dur: 0.6, vol: 0.08 });
          this.tone({ type: 'sine', f: 320, f2: 2600, dur: 0.6, vol: 0.08 });
          this.noise({ dur: 0.6, vol: 0.06, freq: 300, freq2: 8000 });
          break;
        case 'boostEnd':
          this.tone({ type: 'sine', f: 900, f2: 300, dur: 0.3, vol: 0.07 });
          break;
        case 'ready':
          this.tone({ type: 'sine', f: 880, dur: 0.1, vol: 0.08 });
          this.tone({ type: 'sine', f: 1320, dur: 0.18, vol: 0.08, delay: 0.09 });
          break;
        case 'levelup':
          [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.22, vol: 0.11, delay: 0.08 * i }));
          break;
        case 'start':
          [392, 523, 659, 784].forEach((f, i) => this.tone({ type: 'sine', f, dur: 0.3, vol: 0.1, delay: 0.06 * i }));
          break;
        case 'warn':
          this.tone({ type: 'sine', f: 520, f2: 380, dur: 0.18, vol: 0.06 });
          break;
        case 'gameover':
          this.tone({ type: 'sawtooth', f: 440, f2: 55, dur: 1.3, vol: 0.12 });
          this.noise({ dur: 0.9, vol: 0.1, freq: 1200, freq2: 100 });
          break;
        case 'jump':
          this.tone({ type: 'square', f: 330, f2: 720, dur: 0.12, vol: 0.06 });
          break;
        case 'chip': {
          // tono que sube un poco al encadenar chips
          const f = 1320 * Math.pow(2, (n % 6) / 24);
          this.tone({ type: 'sine', f, dur: 0.07, vol: 0.09 });
          this.tone({ type: 'sine', f: f * 1.5, dur: 0.12, vol: 0.07, delay: 0.045 });
          break;
        }
        case 'module':
          [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.18, vol: 0.12, delay: 0.06 * i }));
          break;
        case 'stomp':
          this.tone({ type: 'square', f: 220 * pitch, f2: 880 * pitch, dur: 0.1, vol: 0.09 });
          this.noise({ dur: 0.12, vol: 0.08, freq: 2500 });
          break;
        case 'hurt':
          this.noise({ dur: 0.5, vol: 0.12, freq: 3000, freq2: 300 });
          for (let i = 0; i < 6; i++) this.tone({ type: 'sine', f: 1500 - i * 140, dur: 0.06, vol: 0.06, delay: i * 0.04 });
          break;
        case 'die':
          this.tone({ type: 'square', f: 600, f2: 70, dur: 0.8, vol: 0.1 });
          this.noise({ dur: 0.6, vol: 0.1, freq: 900, freq2: 120 });
          break;
        case 'spring':
          this.tone({ type: 'triangle', f: 200, f2: 1100, dur: 0.25, vol: 0.12 });
          break;
        case 'pad':
          this.tone({ type: 'sawtooth', f: 300, f2: 1400, dur: 0.22, vol: 0.06 });
          this.noise({ dur: 0.25, vol: 0.06, freq: 1000, freq2: 6000 });
          break;
        case 'checkpoint':
          [659, 880, 1319].forEach((f, i) => this.tone({ type: 'sine', f, dur: 0.2, vol: 0.1, delay: 0.07 * i }));
          break;
        case 'land':
          this.tone({ type: 'sine', f: 140, f2: 70, dur: 0.08, vol: 0.08 });
          break;
        case 'shoot':
          this.tone({ type: 'square', f: 1400, f2: 700, dur: 0.06, vol: 0.035 });
          break;
        case 'bossHit':
          this.tone({ type: 'square', f: 260, f2: 180, dur: 0.07, vol: 0.06 });
          break;
        case 'deflect':
          this.tone({ type: 'sine', f: 2200, f2: 1800, dur: 0.05, vol: 0.04 });
          break;
        case 'roar':
          this.tone({ type: 'sawtooth', f: 90, f2: 45, dur: 1.2, vol: 0.14 });
          this.tone({ type: 'square', f: 140, f2: 60, dur: 1.0, vol: 0.06, delay: 0.1 });
          this.noise({ dur: 1.0, vol: 0.1, freq: 500, freq2: 120, q: 3 });
          break;
        case 'laserWarn':
          for (let i = 0; i < 4; i++) this.tone({ type: 'square', f: 980, dur: 0.07, vol: 0.05, delay: i * 0.22 });
          break;
        case 'laser':
          this.tone({ type: 'sawtooth', f: 160, f2: 120, dur: 0.7, vol: 0.1 });
          this.noise({ dur: 0.7, vol: 0.08, freq: 3000, q: 2 });
          break;
        case 'explode':
          this.noise({ dur: 0.45, vol: 0.16, freq: 900, freq2: 80, type: 'lowpass' });
          this.tone({ type: 'sine', f: 120, f2: 40, dur: 0.4, vol: 0.14 });
          break;
        case 'bomb':
          this.noise({ dur: 0.9, vol: 0.2, freq: 4000, freq2: 100, type: 'lowpass' });
          this.tone({ type: 'sine', f: 70, f2: 30, dur: 0.9, vol: 0.2 });
          [1046, 1318, 1568].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.2, vol: 0.07, delay: 0.15 + i * 0.05 }));
          break;
        case 'overheat':
          this.noise({ dur: 0.4, vol: 0.08, freq: 6000, freq2: 1500, type: 'highpass' });
          break;
        case 'victory':
          [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.28, vol: 0.11, delay: 0.11 * i }));
          break;
        default:
          break;
      }
    }

    // Traduce los eventos del juego en sonidos.
    handle(type, d) {
      switch (type) {
        case 'level': this.play('start'); break;
        case 'jump': this.play('jump'); break;
        case 'land': this.play('land'); break;
        case 'chip': this.play('chip', d.ram); break;
        case 'module': this.play('module'); break;
        case 'kill': this.play('stomp', d.chain); break;
        case 'hurt': this.play('hurt'); break;
        case 'die': this.play('die'); break;
        case 'respawn': this.play('page'); break;
        case 'spring': this.play('spring'); break;
        case 'pad': this.play('pad'); break;
        case 'dash': this.play('boost'); break;
        case 'dashEnd': this.play('boostEnd'); break;
        case 'gc': this.play('cleanup'); break;
        case 'denied': this.play('error'); break;
        case 'energyFull': this.play('ready'); break;
        case 'checkpoint': this.play('checkpoint'); break;
        case 'extraLife': this.play('module'); break;
        case 'doubleJump': this.play('jump'); break;
        case 'shoot': this.play('shoot'); break;
        case 'enemyShot': this.play('error'); break;
        case 'bossHit': this.play('bossHit'); break;
        case 'deflect': this.play('deflect'); break;
        case 'bossIntro': this.play('roar'); break;
        case 'bossPhase': this.play('roar'); break;
        case 'bossShot': this.play('swap'); break;
        case 'summon': this.play('leak'); break;
        case 'laserWarn': this.play('laserWarn'); break;
        case 'laserOn': this.play('laser'); break;
        case 'junkHit': this.play('thud'); break;
        case 'bossLand': this.play('thud'); break;
        case 'bossBoom': this.play('explode'); break;
        case 'bossDefeated': this.play('victory'); break;
        case 'unlock': this.play('module'); break;
        case 'bomb': this.play('bomb'); break;
        case 'bombItem': this.play('checkpoint'); break;
        case 'overheat': this.play('overheat'); break;
        case 'shield': this.play('page'); break;
        case 'weapon': this.play('ui'); break;
        case 'cleared': this.play('levelup'); break;
        case 'victory': this.play('victory'); break;
        case 'gameover': this.play('gameover'); break;
        default: break;
      }
    }
  }

  RR.AudioEngine = AudioEngine;
})();
