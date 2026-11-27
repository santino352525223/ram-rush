/* =========================================================================
   RAM RUSH — Ranking online para todos os jogadores (Firestore, via REST)
   - Não usa contas nem dados pessoais: cada navegador tem um identificador
     aleatório e cada conta de jogador desse navegador tem um registo
     "<identificador>_<nome>" na coleção ramrush_scores.
   - As regras do Firestore só deixam criar registos válidos e só deixam
     SUBIR a pontuação (nunca baixar, apagar ou mudar o nome).
   - A posição mundial calcula-se contando quantos jogadores têm mais pontos.
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const DEVICE_KEY = 'ramrush.device.v1';
  const TIMEOUT = 9000;

  const cfg = () => RR.ONLINE_CONFIG || {};
  const slug = (name) => String(name || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_').slice(0, 30) || 'jogador';
  const clean = (name) => String(name || '').replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

  function deviceId() {
    let id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) { /* sem storage */ }
    if (!id || !/^[a-z0-9]{16,40}$/.test(id)) {
      const a = new Uint8Array(12);
      (window.crypto || window.msCrypto).getRandomValues(a);
      id = Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) { /* ignorar */ }
    }
    return id;
  }

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

  function fromDoc(doc) {
    const f = (doc && doc.fields) || {};
    const v = (x) => (x == null ? undefined : x.stringValue ?? (x.integerValue != null ? Number(x.integerValue) : x.booleanValue ?? x.doubleValue));
    return {
      id: doc && doc.name ? doc.name.split('/').pop() : '',
      name: v(f.name) || '???', score: v(f.score) || 0, zone: v(f.zone) || 1,
      char: v(f.char) || 'bit', won: !!v(f.won), date: v(f.date) || '',
    };
  }

  RR.Online = {
    enabled() { return !!cfg().projectId; },
    coll() { return cfg().collection || 'ramrush_scores'; },
    base() { return `https://firestore.googleapis.com/v1/projects/${cfg().projectId}/databases/(default)/documents`; },
    key() { return cfg().apiKey ? `?key=${cfg().apiKey}` : ''; },
    docId(name) { return deviceId() + '_' + slug(name); },

    async getMine(name) {
      try { return fromDoc(await http(`${this.base()}/${this.coll()}/${this.docId(name)}${this.key()}`)); }
      catch (e) { if (e.status === 404) return null; throw e; }
    },

    // Envia a pontuação (só se for melhor do que a já registada) e devolve a posição mundial.
    async submit(name, score, data = {}) {
      score = Math.round(score) || 0;
      const mine = await this.getMine(name);
      let improved = false;
      if (score > 0 && (!mine || score > mine.score)) {
        const fields = {
          name: { stringValue: mine ? mine.name : (clean(name).length >= 2 ? clean(name) : 'Anónimo') },
          score: { integerValue: String(Math.min(5000000, score)) },
          zone: { integerValue: String(Math.max(1, Math.min(10, data.zone || 1))) },
          char: { stringValue: String(data.char || 'bit').slice(0, 10) },
          won: { booleanValue: !!data.won },
          date: { stringValue: new Date().toISOString().slice(0, 10) },
        };
        await http(`${this.base()}/${this.coll()}/${this.docId(name)}${this.key()}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
        });
        improved = true;
      }
      const best = Math.max(score, mine ? mine.score : 0);
      return { improved, best, rank: best > 0 ? await this.countAbove(best) : -1 };
    },

    async aggregate(where) {
      const q = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: this.coll() }] }, aggregations: [{ alias: 'n', count: {} }] } };
      if (where) q.structuredAggregationQuery.structuredQuery.where = where;
      const r = await http(`${this.base()}:runAggregationQuery${this.key()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      const row = Array.isArray(r) ? r.find((x) => x.result) : null;
      return row ? Number(row.result.aggregateFields.n.integerValue || 0) : 0;
    },
    // Quantos jogadores têm mais pontos (= posição, a começar em 0).
    countAbove(score) {
      return this.aggregate({ fieldFilter: { field: { fieldPath: 'score' }, op: 'GREATER_THAN', value: { integerValue: String(Math.round(score)) } } });
    },
    count() { return this.aggregate(null); },

    async page(offset, n) {
      const q = { structuredQuery: { from: [{ collectionId: this.coll() }], orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }], offset, limit: n } };
      const r = await http(`${this.base()}:runQuery${this.key()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      return (Array.isArray(r) ? r : []).filter((x) => x.document).map((x) => fromDoc(x.document));
    },

    // A minha linha no ranking mundial (para mostrar sempre em baixo).
    async me(name) {
      const mine = await this.getMine(name);
      if (!mine) return null;
      return { entry: mine, rank: await this.countAbove(mine.score) };
    },
  };
})();
