/* =========================================================================
   RAM RUSH — Contas de jogador, ranking TOP 10 e progresso (no navegador)
   Cada nome é uma "conta": tem o seu recorde, zonas desbloqueadas e personagem.
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const KEY_RANK = 'ramrush.ranking.v2';
  const KEY_PROFILES = 'ramrush.profiles.v1';
  const KEY_CURRENT = 'ramrush.current.v1';
  const MAX = 10;        // o ranking mostra o top 10…
  const STORE = 10000;   // …mas guarda (e deixa ver) até ao top 10 000

  function read(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  const clean = (name) => String(name || '').replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  const keyOf = (name) => clean(name).toLowerCase();

  // ------------------------------------------------------------- contas
  RR.Profiles = {
    all() { const m = read(KEY_PROFILES, {}); return m && typeof m === 'object' ? m : {}; },
    list() { return Object.values(this.all()).sort((a, b) => (b.last || 0) - (a.last || 0)); },
    current() { const k = read(KEY_CURRENT, ''); return k && this.all()[k] ? this.all()[k] : null; },
    get(name) { return this.all()[keyOf(name)] || null; },
    // Entra com um nome: se não existir, cria uma conta nova.
    login(name) {
      const n = clean(name);
      if (!n) return null;
      const all = this.all();
      const k = keyOf(n);
      if (!all[k]) all[k] = { name: n, best: 0, games: 0, wins: 0, chips: 0, bosses: 0, unlocked: 1, char: 'bit', created: Date.now() };
      all[k].last = Date.now();
      write(KEY_PROFILES, all);
      write(KEY_CURRENT, k);
      return all[k];
    },
    logout() { write(KEY_CURRENT, ''); },
    update(patch) {
      const cur = this.current();
      if (!cur) return null;
      const all = this.all();
      const k = keyOf(cur.name);
      all[k] = Object.assign(all[k], patch, { last: Date.now() });
      write(KEY_PROFILES, all);
      return all[k];
    },
    remove(name) {
      const all = this.all();
      delete all[keyOf(name)];
      write(KEY_PROFILES, all);
      if (read(KEY_CURRENT, '') === keyOf(name)) this.logout();
    },
  };

  // ------------------------------------------------------- ranking TOP 10
  // Um lugar por jogador (fica a melhor pontuação de cada conta).
  RR.Ranking = {
    MAX,
    list() {
      const l = read(KEY_RANK, []);
      return Array.isArray(l) ? l.filter((e) => e && typeof e.score === 'number').sort((a, b) => b.score - a.score).slice(0, MAX) : [];
    },
    best() { const l = this.list(); return l.length ? l[0].score : 0; },
    positionOf(name) { return this.list().findIndex((e) => keyOf(e.name) === keyOf(name)); },
    all() {
      const l = read(KEY_RANK, []);
      return Array.isArray(l) ? l.filter((e) => e && typeof e.score === 'number').sort((a, b) => b.score - a.score) : [];
    },
    // Páginas para o ecrã de ranking (até ao top 10 000).
    page(offset, n) { return this.all().slice(offset, offset + n); },
    count() { return Math.min(STORE, this.all().length); },
    entryOf(name) {
      const l = this.all();
      const i = l.findIndex((e) => keyOf(e.name) === keyOf(name));
      return i >= 0 ? { entry: l[i], rank: i } : null;
    },
    // Regista automaticamente a pontuação. Devolve a posição (0..9) ou -1.
    submit(name, score, data = {}) {
      const n = clean(name) || 'Anónimo';
      score = Math.round(score) || 0;
      if (score <= 0) return { rank: this.positionOf(n), improved: false };
      const l = this.all();
      const i = l.findIndex((e) => keyOf(e.name) === keyOf(n));
      let improved = false;
      const entry = {
        name: n, score, zone: data.zone || 1, char: data.char || 'bit', won: !!data.won,
        date: new Date().toISOString().slice(0, 10),
      };
      if (i >= 0) {
        if (score > l[i].score) { l[i] = entry; improved = true; }
      } else { l.push(entry); improved = true; }
      l.sort((a, b) => b.score - a.score);
      write(KEY_RANK, l.slice(0, STORE));
      const e = this.entryOf(n);
      return { rank: e ? e.rank : -1, improved };
    },
    clear() { write(KEY_RANK, []); },
  };

  // Compatibilidade: progresso do jogador atual.
  RR.Save = {
    get() {
      const p = RR.Profiles.current();
      return { unlocked: p ? p.unlocked || 1 : 1, char: p ? p.char || 'bit' : 'bit', name: p ? p.name : '' };
    },
    set(patch) { RR.Profiles.update(patch); return this.get(); },
    unlock(zoneIndex) {
      const p = RR.Profiles.current();
      if (p && zoneIndex + 1 > (p.unlocked || 1)) RR.Profiles.update({ unlocked: Math.min(RR.LEVELS.length, zoneIndex + 1) });
    },
  };
})();
