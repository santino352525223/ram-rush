/* =========================================================================
   RAM RUSH — Configuração do ranking online (Firebase / Firestore)
   Se estes valores estiverem vazios, o jogo usa só o ranking deste computador.
   A apiKey do Firebase para a web é pública por natureza: a segurança está
   nas regras do Firestore (ver README).
   ========================================================================= */
window.RR = window.RR || {};
window.RR.ONLINE_CONFIG = {
  apiKey: '',
  projectId: '',
};
