/* =========================================================================
   RAM RUSH — Arranque: conecta lógica, render, audio, interfaz e input
   ========================================================================= */
(function () {
  'use strict';
  const RR = window.RR;

  const canvas = document.getElementById('game');
  const audio = new RR.AudioEngine();
  const fx = new RR.FX();
  const game = new RR.Game();
  const renderer = new RR.Renderer(canvas, game, fx);
  const ui = new RR.UI(game, audio);
  const input = new RR.Input(game, ui, audio, canvas);

  // Bus de eventos del juego → efectos visuales, sonido e interfaz.
  game.on((type, d) => {
    renderer.onEvent(type, d);
    audio.handle(type, d);
    ui.onEvent(type, d);
  });

  // Redimensionado robusto (ventana, zoom, HUD que cambia de alto).
  let resizeQueued = false;
  function resize() {
    resizeQueued = false;
    renderer.resize(window.innerWidth, window.innerHeight, ui.getInsets());
  }
  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(resize);
  }
  ui.onLayoutChange = queueResize;
  window.addEventListener('resize', queueResize);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(queueResize);
    ro.observe(document.getElementById('hud'));
    ro.observe(document.getElementById('touch'));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueResize);
  resize();

  // Pausa automática al cambiar de pestaña o minimizar.
  document.addEventListener('visibilitychange', () => { if (document.hidden) ui.autoPause(); });
  window.addEventListener('blur', () => ui.autoPause());

  // Bucle principal: lógica con paso fijo (estable a cualquier FPS) + dibujo por frame.
  const STEP = 1 / 120;
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    input.sync();
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 12) { game.update(STEP); acc -= STEP; n++; }
    if (n >= 12) acc = 0;
    fx.update(game.state === 'paused' ? 0 : dt);
    renderer.draw(dt);
    ui.update();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Útil para depurar desde la consola.
  window.RAMRUSH = { game, renderer, ui, input, audio, fx };
})();
