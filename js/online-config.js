/* =========================================================================
   RAM RUSH — Configuração do ranking online (Firebase / Cloud Firestore)
   Projeto Firebase "claves-mac", coleção própria "ramrush_scores".
   A segurança está nas regras do Firestore (ver README): só se pode ler o
   ranking e criar/subir pontuações válidas. Se projectId ficar vazio, o jogo
   usa apenas o ranking deste computador.
   ========================================================================= */
window.RR = window.RR || {};
window.RR.ONLINE_CONFIG = {
  projectId: 'claves-mac',
  collection: 'ramrush_scores',
  apiKey: '',
};
