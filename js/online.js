/* =========================================================================
   RAM RUSH — Ranking online para todos os jogadores (Firestore, via REST)
   - Cada navegador entra com uma sessão anónima do Firebase (sem dados pessoais).
   - Cada conta de jogador deste navegador tem um registo: <uid>_<nome>.
   - A posição mundial calcula-se contando quantos jogadores têm mais pontos.
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const AUTH_KEY = 'ramrush.online.auth.v1';
  const TIMEOUT = 9000;
  const COLLECTION = 'scores';

  const cfg = () => RR.ONLINE_CONFIG || {};
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorar */ } };
  const slug = (name) => String(name || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_').slice(0, 30) || 'jogador';
  const clean = (name) => String(name || '').replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

  async function http(url, opts = {}) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT) : null;
    try {
      const res = await fetch(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {}));
      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};
      if (!res.ok) {
        const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
      }
      return data;
    } finally { if (timer) clearTimeout(timer); }
  }

  function fromFields(doc) {
    const f = (doc && doc.fields) || {};
    const v = (x) => (x == null ? undefined : x.stringValue ?? (x.integerValue != null ? Number(x.integerValue) : x.booleanValue ?? x.doubleValue));
    return {
      id: doc && doc.name ? doc.name.split('/').pop() : '',
      name: v(f.name) || '???', score: v(f.score) || 0, zone: v(f.zone) || 1,
      char: v(f.char) || 'bit', won: !!v(f.won), date: v(f.date) || '', uid: v(f.uid) || '',
    };
  }

  RR.Online = {
    enabled() { const c = cfg(); return !!(c.apiKey && c.projectId); },
    base() { return `https://firestore.googleapis.com/v1/projects/${cfg().projectId}/databases/(default)/documents`; },

    // Sessão anónima (guardada no navegador e renovada automaticamente).
    async session() {
      const key = cfg().apiKey;
      let a = read(AUTH_KEY);
      if (a && a.project === cfg().projectId && a.exp > Date.now() + 60000) return a;
      if (a && a.project === cfg().projectId && a.refresh) {
        try {
          const r = await http(`https://securetoken.googleapis.com/v1/token?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.refresh),
          });
          a = { id: r.id_token, refresh: r.refresh_token, uid: r.user_id, exp: Date.now() + Number(r.expires_in) * 1000, project: cfg().projectId };
          write(AUTH_KEY, a);
          return a;
        } catch (e) { /* cria uma sessão nova */ }
      }
      const r = await http(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
      });
      a = { id: r.idToken, refresh: r.refreshToken, uid: r.localId, exp: Date.now() + Number(r.expiresIn) * 1000, project: cfg().projectId };
      write(AUTH_KEY, a);
      return a;
    },

    async docIdFor(name) { const s = await this.session(); return s.uid + '_' + slug(name); },

    async getMine(name) {
      const id = await this.docIdFor(name);
      try { return fromFields(await http(`${this.base()}/${COLLECTION}/${id}`)); } catch (e) { if (e.status === 404) return null; throw e; }
    },

    // Envia a pontuação (só se for melhor do que a já registada) e devolve a posição mundial.
    async submit(name, score, data = {}) {
      score = Math.round(score) || 0;
      const s = await this.session();
      const mine = await this.getMine(name);
      let improved = false;
      if (score > 0 && (!mine || score > mine.score)) {
        const id = s.uid + '_' + slug(name);
        const fields = {
          name: { stringValue: clean(name) || 'Anónimo' },
          score: { integerValue: String(score) },
          zone: { integerValue: String(data.zone || 1) },
          char: { stringValue: String(data.char || 'bit') },
          won: { booleanValue: !!data.won },
          date: { stringValue: new Date().toISOString().slice(0, 10) },
          uid: { stringValue: s.uid },
        };
        await http(`${this.base()}/${COLLECTION}/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.id },
          body: JSON.stringify({ fields }),
        });
        improved = true;
      }
      const best = Math.max(score, mine ? mine.score : 0);
      return { improved, best, rank: best > 0 ? await this.countAbove(best) : -1 };
    },

    async aggregate(where) {
      const q = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: COLLECTION }] }, aggregations: [{ alias: 'n', count: {} }] } };
      if (where) q.structuredAggregationQuery.structuredQuery.where = where;
      const r = await http(`${this.base()}:runAggregationQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      const row = Array.isArray(r) ? r.find((x) => x.result) : null;
      return row ? Number(row.result.aggregateFields.n.integerValue) : 0;
    },
    // Quantos jogadores têm mais pontos (= posição, a começar em 0).
    countAbove(score) {
      return this.aggregate({ fieldFilter: { field: { fieldPath: 'score' }, op: 'GREATER_THAN', value: { integerValue: String(Math.round(score)) } } });
    },
    count() { return this.aggregate(null); },

    async page(offset, n) {
      const q = { structuredQuery: { from: [{ collectionId: COLLECTION }], orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }], offset, limit: n } };
      const r = await http(`${this.base()}:runQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      return (Array.isArray(r) ? r : []).filter((x) => x.document).map((x) => fromFields(x.document));
    },

    // A minha linha no ranking mundial (para mostrar sempre em baixo).
    async me(name) {
      const mine = await this.getMine(name);
      if (!mine) return null;
      return { entry: mine, rank: await this.countAbove(mine.score) };
    },
  };
})();
