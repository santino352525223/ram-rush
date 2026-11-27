/* =========================================================================
   RAM RUSH — Personagens jogáveis (dados, habilidades e desenho)
   Personagens originais inspirados em memes populares da internet.
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});
  const TAU = Math.PI * 2;

  RR.CHARACTERS = [
    {
      id: 'bit', name: 'BIT', tagline: 'O robô mensageiro original',
      desc: 'Equilibrado em tudo. Começa com uma Bomba de Refresh extra.',
      colors: { main: '#4cc9ff', dark: '#1a4fc0', light: '#bff0ff', accent: '#7dffb5' },
      speed: 1, jump: 1, airJumps: 1, fireMul: 1, heatMul: 1, energyMul: 1, extraLives: 0, extraBombs: 1,
      stats: { Velocidade: 3, Salto: 3, Resistência: 3, Poder: 3 },
    },
    {
      id: 'shiba', name: 'Shiba Turbo', tagline: 'muito rápido · tanta RAM · uau',
      desc: 'O cão mais rápido da internet. A energia do Dual Channel enche 60 % mais depressa.',
      colors: { main: '#e8953a', dark: '#a85a1a', light: '#fff1de', accent: '#ffd166' },
      speed: 1.18, jump: 0.97, airJumps: 1, fireMul: 1, heatMul: 1, energyMul: 1.6, extraLives: 0, extraBombs: 0,
      stats: { Velocidade: 5, Salto: 3, Resistência: 2, Poder: 3 },
    },
    {
      id: 'capy', name: 'Capivara Zen', tagline: 'Nada a abala. Nem um kernel panic.',
      desc: 'Mais lenta, mas só perde metade da RAM quando é atingida e começa com +1 vida.',
      colors: { main: '#9a6b43', dark: '#5e3d22', light: '#c99a6c', accent: '#ff9f1a' },
      speed: 0.9, jump: 0.95, airJumps: 1, fireMul: 1, heatMul: 1, energyMul: 1, extraLives: 1, extraBombs: 0, keepHalf: true,
      stats: { Velocidade: 2, Salto: 2, Resistência: 5, Poder: 3 },
    },
    {
      id: 'duck', name: 'Pato Depurador', tagline: 'Explica-lhe o código e o bug desaparece',
      desc: 'O famoso "rubber duck debugging": salto triplo, plana ao manter o salto e elimina bugs só de lhes tocar.',
      colors: { main: '#ffd23a', dark: '#d99a00', light: '#fff4b8', accent: '#ff8a1a' },
      speed: 0.98, jump: 0.92, airJumps: 2, fireMul: 1.1, heatMul: 1, energyMul: 1, extraLives: 0, extraBombs: 0, glide: true, bugTouch: true,
      stats: { Velocidade: 3, Salto: 5, Resistência: 3, Poder: 2 },
    },
    {
      id: 'cat', name: 'Gato do Teclado', tagline: 'Toca teclado e dispara ao ritmo',
      desc: 'Dedos rápidos: dispara 30 % mais depressa e o canhão aquece muito menos.',
      colors: { main: '#9aa3b5', dark: '#5b6273', light: '#e6e9f0', accent: '#4c7dff' },
      speed: 1.05, jump: 1.05, airJumps: 1, fireMul: 0.7, heatMul: 0.6, energyMul: 1, extraLives: 0, extraBombs: 0,
      stats: { Velocidade: 4, Salto: 4, Resistência: 2, Poder: 5 },
    },
    {
      id: 'hamster', name: 'Hamster Gerador', tagline: 'É ele que faz o computador funcionar',
      desc: 'Corre na roda e gera energia sozinho. O Garbage Collector recarrega 40 % mais depressa.',
      colors: { main: '#f0c08a', dark: '#b07a45', light: '#fff4e6', accent: '#ff7ab6' },
      speed: 1.08, jump: 1, airJumps: 1, fireMul: 1, heatMul: 1, energyMul: 1, extraLives: 0, extraBombs: 0, energyRegen: 5, gcMul: 0.6,
      stats: { Velocidade: 4, Salto: 3, Resistência: 3, Poder: 4 },
    },
  ];
  RR.getCharacter = (id) => RR.CHARACTERS.find((c) => c.id === id) || RR.CHARACTERS[0];

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Pernas genéricas (duas, animadas). o = {moving, ph, air, color, shoe}
  function legs(ctx, o, spread = 4, len = 8, top = -10) {
    const a = o.moving ? Math.sin(o.ph) * 7 : 0;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const f1 = -spread + (o.air ? -3 : a), f2 = spread + (o.air ? 4 : -a);
    ctx.beginPath();
    ctx.moveTo(-spread, top); ctx.lineTo(f1, top + len);
    ctx.moveTo(spread, top); ctx.lineTo(f2, top + len);
    ctx.stroke();
    ctx.fillStyle = o.shoe;
    rr(ctx, f1 - 4, -4, 9, 5, 2.5); ctx.fill();
    rr(ctx, f2 - 4, -4, 9, 5, 2.5); ctx.fill();
  }

  const DRAW = {
    // BIT: robô com visor, antena e chip de RAM no peito.
    bit(ctx, o) {
      const c = o.c.colors;
      legs(ctx, { ...o, color: '#1c2740', shoe: '#e8f0ff' });
      ctx.fillStyle = o.dash ? '#ff4fd8' : '#4cc9ff';
      const top = -38 - o.bob;
      const grd = ctx.createLinearGradient(-13, top, 13, top + 30);
      if (o.hurt) { grd.addColorStop(0, '#ff9aa8'); grd.addColorStop(1, '#8a1030'); }
      else if (o.dash) { grd.addColorStop(0, '#ffc2f3'); grd.addColorStop(0.5, '#ff4fd8'); grd.addColorStop(1, '#5b2bd6'); }
      else { grd.addColorStop(0, c.light); grd.addColorStop(0.45, c.main); grd.addColorStop(1, c.dark); }
      ctx.fillStyle = grd;
      rr(ctx, -13, top, 26, 30, 11); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#071025';
      rr(ctx, -8, top + 6, 20, 10, 5); ctx.fill();
      ctx.fillStyle = o.hurt ? '#ff4d6d' : c.accent;
      if (o.blink) { ctx.fillRect(-1, top + 10.5, 4, 1.2); ctx.fillRect(6, top + 10.5, 4, 1.2); }
      else { rr(ctx, -1, top + 8.5, 4, 5, 1.5); ctx.fill(); rr(ctx, 6, top + 8.5, 4, 5, 1.5); ctx.fill(); }
      ctx.fillStyle = '#1f8f5a'; ctx.fillRect(-7, top + 19, 12, 6);
      ctx.fillStyle = '#0b0f17'; ctx.fillRect(-6, top + 20, 3, 3); ctx.fillRect(-2, top + 20, 3, 3); ctx.fillRect(2, top + 20, 2, 3);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(-7, top + 24, 12, 1);
      ctx.strokeStyle = '#c8d6f0'; ctx.lineWidth = 1.6;
      const ax = -10 - Math.min(6, o.speed / 90);
      ctx.beginPath(); ctx.moveTo(-3, top + 1); ctx.quadraticCurveTo(-6, top - 7, ax, top - 9); ctx.stroke();
      ctx.fillStyle = Math.sin(o.t * 6) > -0.2 ? '#ff4fd8' : '#6a1a5a';
      ctx.beginPath(); ctx.arc(ax, top - 9, 2.6, 0, TAU); ctx.fill();
    },

    // Shiba Turbo: cão laranja com olhar de lado e sobrancelhas levantadas.
    shiba(ctx, o) {
      const c = o.c.colors;
      legs(ctx, { ...o, color: c.dark, shoe: c.light }, 5, 8, -10);
      const top = -34 - o.bob;
      // cauda enrolada
      ctx.strokeStyle = c.main; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-14, top + 12, 6, Math.PI * 0.3, Math.PI * 1.7); ctx.stroke();
      ctx.strokeStyle = c.light; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-14, top + 12, 6, Math.PI * 0.9, Math.PI * 1.5); ctx.stroke();
      // corpo
      ctx.fillStyle = o.hurt ? '#ff9aa8' : c.main;
      rr(ctx, -12, top + 12, 22, 16, 8); ctx.fill();
      ctx.fillStyle = c.light;
      rr(ctx, 0, top + 16, 9, 11, 5); ctx.fill();
      // cabeça
      ctx.fillStyle = o.hurt ? '#ff9aa8' : c.main;
      ctx.beginPath(); ctx.ellipse(4, top + 6, 13, 11, 0, 0, TAU); ctx.fill();
      // orelhas
      ctx.beginPath(); ctx.moveTo(-6, top - 1); ctx.lineTo(-4, top - 13); ctx.lineTo(2, top - 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, top - 4); ctx.lineTo(11, top - 14); ctx.lineTo(14, top - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb3a0';
      ctx.beginPath(); ctx.moveTo(-4, top - 2); ctx.lineTo(-3.5, top - 9); ctx.lineTo(0, top - 3); ctx.closePath(); ctx.fill();
      // focinho branco
      ctx.fillStyle = c.light;
      ctx.beginPath(); ctx.ellipse(9, top + 10, 8, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath(); ctx.ellipse(15, top + 8, 2.6, 2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(15, top + 10); ctx.quadraticCurveTo(12, top + 14, 8, top + 12); ctx.stroke();
      // olhos de lado (o olhar famoso)
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(1, top + 3, 3.2, 2.6, 0, 0, TAU); ctx.ellipse(8, top + 2, 3.2, 2.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a0d05';
      ctx.beginPath(); ctx.arc(-0.6, top + 3.4, 1.6, 0, TAU); ctx.arc(6.4, top + 2.4, 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6b3a12'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-2, top - 1.5); ctx.lineTo(3, top - 0.5); ctx.moveTo(5, top - 2.5); ctx.lineTo(10.5, top - 3); ctx.stroke();
    },

    // Capivara Zen: corpo quadrado castanho, olhos semicerrados e uma laranja na cabeça.
    capy(ctx, o) {
      const c = o.c.colors;
      legs(ctx, { ...o, color: c.dark, shoe: c.dark }, 6, 7, -9);
      const top = -30 - o.bob;
      ctx.fillStyle = o.hurt ? '#ff9aa8' : c.main;
      rr(ctx, -15, top + 6, 28, 20, 9); ctx.fill();
      // cabeça (focinho grande e quadrado)
      rr(ctx, 2, top, 17, 15, 6); ctx.fill();
      ctx.fillStyle = c.dark;
      rr(ctx, 14, top + 3, 6, 9, 3); ctx.fill();
      ctx.fillStyle = '#2a1608';
      ctx.fillRect(17, top + 5, 2, 2);
      // orelha
      ctx.fillStyle = c.dark;
      ctx.beginPath(); ctx.ellipse(4, top + 1, 3, 2.5, 0, 0, TAU); ctx.fill();
      // olho calmo (semicerrado)
      ctx.strokeStyle = '#1a0d05'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(10, top + 5, 2, 0.1, Math.PI - 0.1); ctx.stroke();
      // pelo
      ctx.strokeStyle = 'rgba(60,35,15,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-10 + i * 5, top + 10); ctx.lineTo(-8 + i * 5, top + 14); ctx.stroke(); }
      // laranja na cabeça
      const bob2 = Math.sin(o.t * 3) * 0.8;
      const og = ctx.createRadialGradient(7, top - 6 + bob2, 1, 8, top - 5 + bob2, 6);
      og.addColorStop(0, '#ffd27a'); og.addColorStop(1, c.accent);
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(8, top - 5 + bob2, 5.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3aa04a';
      ctx.beginPath(); ctx.ellipse(10, top - 11 + bob2, 3, 1.4, -0.5, 0, TAU); ctx.fill();
    },

    // Pato Depurador: pato de borracha amarelo com óculos de programador.
    duck(ctx, o) {
      const c = o.c.colors;
      // patas
      const a = o.moving ? Math.sin(o.ph) * 6 : 0;
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.ellipse(-4 + (o.air ? -2 : a), -2, 5, 2.5, 0, 0, TAU); ctx.ellipse(5 + (o.air ? 3 : -a), -2, 5, 2.5, 0, 0, TAU); ctx.fill();
      const top = -32 - o.bob;
      const grd = ctx.createRadialGradient(-2, top + 14, 2, 0, top + 18, 18);
      grd.addColorStop(0, c.light); grd.addColorStop(1, o.hurt ? '#ff8aa0' : c.main);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(-1, top + 20, 15, 11, 0, 0, TAU); ctx.fill();
      // cauda
      ctx.beginPath(); ctx.moveTo(-14, top + 16); ctx.lineTo(-19, top + 9); ctx.lineTo(-10, top + 13); ctx.closePath(); ctx.fill();
      // asa (bate quando plana)
      ctx.fillStyle = c.dark;
      const flap = o.glide ? Math.sin(o.t * 30) * 0.6 : 0;
      ctx.save(); ctx.translate(-4, top + 18); ctx.rotate(-0.3 + flap);
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
      // cabeça
      ctx.fillStyle = o.hurt ? '#ff8aa0' : c.main;
      ctx.beginPath(); ctx.arc(5, top + 5, 9, 0, TAU); ctx.fill();
      // bico
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.ellipse(14, top + 8, 6, 3, 0.1, 0, TAU); ctx.fill();
      // óculos
      ctx.strokeStyle = '#1b2233'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(5, top + 3, 3.2, 0, TAU); ctx.arc(11.5, top + 3, 3.2, 0, TAU); ctx.moveTo(8.2, top + 3); ctx.lineTo(8.3, top + 3); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(6, top + 3.5, 1.3, 0, TAU); ctx.arc(12.5, top + 3.5, 1.3, 0, TAU); ctx.fill();
    },

    // Gato do Teclado: gato cinzento de t-shirt com um pequeno teclado.
    cat(ctx, o) {
      const c = o.c.colors;
      legs(ctx, { ...o, color: c.dark, shoe: c.light }, 4, 8, -10);
      const top = -38 - o.bob;
      // cauda
      ctx.strokeStyle = c.main; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, top + 26); ctx.quadraticCurveTo(-20, top + 18, -16, top + 6 + Math.sin(o.t * 4) * 3); ctx.stroke();
      // corpo com t-shirt
      ctx.fillStyle = o.hurt ? '#ff8aa0' : c.accent;
      rr(ctx, -10, top + 16, 20, 14, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('</>', 0, top + 25);
      // teclado
      ctx.fillStyle = '#1b2233';
      rr(ctx, 2, top + 22, 16, 6, 1.5); ctx.fill();
      ctx.fillStyle = '#e6e9f0';
      for (let i = 0; i < 6; i++) ctx.fillRect(3.5 + i * 2.4, top + 23.5 + (Math.sin(o.t * 20 + i) > 0.6 ? 0.6 : 0), 1.6, 1.4);
      // cabeça
      ctx.fillStyle = o.hurt ? '#ff8aa0' : c.main;
      ctx.beginPath(); ctx.ellipse(1, top + 8, 12, 10, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, top + 3); ctx.lineTo(-8, top - 9); ctx.lineTo(-2, top - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, top - 1); ctx.lineTo(10, top - 9); ctx.lineTo(12, top + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb3c8';
      ctx.beginPath(); ctx.moveTo(-8, top + 1); ctx.lineTo(-7.5, top - 5); ctx.lineTo(-4, top - 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.light;
      ctx.beginPath(); ctx.ellipse(5, top + 12, 6, 4, 0, 0, TAU); ctx.fill();
      // olhos
      ctx.fillStyle = '#7dffb5';
      ctx.beginPath(); ctx.ellipse(-2, top + 7, 2.4, 3, 0, 0, TAU); ctx.ellipse(6, top + 7, 2.4, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(-2.5, top + 5, 1.2, 4); ctx.fillRect(5.5, top + 5, 1.2, 4);
      ctx.fillStyle = '#ff7a9a';
      ctx.beginPath(); ctx.arc(5, top + 11, 1.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(8, top + 12); ctx.lineTo(16, top + 10); ctx.moveTo(8, top + 13); ctx.lineTo(16, top + 14); ctx.stroke();
    },

    // Hamster Gerador: hamster redondo dentro de uma roda que gira quando corre.
    hamster(ctx, o) {
      const c = o.c.colors;
      const top = -30 - o.bob;
      // roda
      ctx.save();
      ctx.translate(0, -19);
      ctx.strokeStyle = 'rgba(200,215,240,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.stroke();
      ctx.rotate((o.run || 0) * 0.05);
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19); ctx.stroke(); }
      ctx.restore();
      // patas
      const a = o.moving ? Math.sin(o.ph * 1.6) * 5 : 0;
      ctx.fillStyle = '#ffb3c8';
      ctx.beginPath(); ctx.ellipse(-4 + a, -3, 3.5, 2.2, 0, 0, TAU); ctx.ellipse(5 - a, -3, 3.5, 2.2, 0, 0, TAU); ctx.fill();
      // corpo
      const grd = ctx.createRadialGradient(2, top + 12, 2, 0, top + 14, 16);
      grd.addColorStop(0, c.light); grd.addColorStop(0.6, o.hurt ? '#ff8aa0' : c.main); grd.addColorStop(1, c.dark);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(0, top + 16, 13, 13, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c.light;
      ctx.beginPath(); ctx.ellipse(5, top + 19, 7, 8, 0, 0, TAU); ctx.fill();
      // bochechas cheias de RAM
      ctx.fillStyle = 'rgba(255,140,170,0.55)';
      ctx.beginPath(); ctx.arc(9, top + 14, 3.5, 0, TAU); ctx.fill();
      // orelhas
      ctx.fillStyle = c.dark;
      ctx.beginPath(); ctx.arc(-4, top + 4, 3.5, 0, TAU); ctx.arc(5, top + 3, 3.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb3c8';
      ctx.beginPath(); ctx.arc(5, top + 3, 1.8, 0, TAU); ctx.fill();
      // olho e nariz
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(7, top + 10, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(7.6, top + 9.4, 0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff7a9a';
      ctx.beginPath(); ctx.arc(12.5, top + 12.5, 1.3, 0, TAU); ctx.fill();
    },
  };

  /* Desenha a personagem com origem nos pés, virada para a direita.
     o = { t, run, moving, air, hurt, dash, speed, glide } */
  RR.drawCharacter = function (ctx, id, o) {
    const c = RR.getCharacter(id);
    const ph = (o.run || 0) * 0.045;
    const bob = o.moving ? Math.abs(Math.sin(ph)) * 2 : Math.sin((o.t || 0) * 3) * 0.8;
    const blink = ((o.t || 0) % 3.2) < 0.12;
    (DRAW[c.id] || DRAW.bit)(ctx, { ...o, c, ph, bob, blink, speed: o.speed || 0, t: o.t || 0 });
  };

  // Versão "bola a rolar" (salto), com as cores da personagem.
  RR.drawCharacterBall = function (ctx, id, r, dash) {
    const c = RR.getCharacter(id).colors;
    const grd = ctx.createRadialGradient(-5, -6, 2, 0, 0, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, dash ? '#ff7ae0' : c.main);
    grd.addColorStop(1, dash ? '#6a1a8a' : c.dark);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r - 4, -0.4, 1.0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r - 4, 2.7, 4.1); ctx.stroke();
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.1, 3, 0, TAU); ctx.fill();
  };
})();
