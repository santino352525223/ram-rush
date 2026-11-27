/* =========================================================================
   RAM RUSH — Dados do jogo de plataformas
   Física, troços de nível (ASCII), zonas, temas visuais, chefe final e
   curiosidades sobre a RAM (em português de Portugal).
   ========================================================================= */
(function () {
  'use strict';
  const RR = (window.RR = window.RR || {});

  RR.CONFIG = {
    TILE: 32,
    ROWS: 16,
    GRAVITY: 2300,
    MAX_FALL: 1150,
    ACC: 1350,          // aceleração no chão
    FRICTION: 1500,     // travagem sem premir nada
    AIR_ACC: 950,
    TOP: 540,           // velocidade máxima a correr
    BOOST_TOP: 900,     // velocidade máxima em Dual Channel
    JUMP: 840,
    DOUBLE_JUMP: 760,   // impulso do salto duplo
    COYOTE: 0.1,        // margem para saltar logo depois da borda
    BUFFER: 0.13,       // margem para premir saltar antes de tocar no chão
    SPRING: 1250,
    PAD_SPEED: 1080,
    STOMP_BOUNCE: 620,
    MUD_SPEED: 0.42,    // no ficheiro de paginação tudo é lento
    MUD_JUMP: 0.8,
    INVULN: 1.3,
    LIVES: 3,
    EXTRA_LIFE_EVERY: 60,
    DASH_TIME: 4.5,
    GC_COOLDOWN: 9,
    GC_RADIUS: 240,
    ENERGY_CHIP: 3,
    ENERGY_KILL: 10,
    ENERGY_MODULE: 30,
    SCATTER_MAX: 16,
    SCATTER_LIFE: 2.8,
    SHOOT_CD: 0.17,     // canhão ECC
    SHOT_SPEED: 900,
    HEAT_ECC: 9,        // aquecimento por disparo (sobreaquece a 100)
    HEAT_SPREAD: 18,
    HEAT_COOL: 38,
    BOMB_RADIUS: 340,
    BOMB_BOSS_DMG: 10,
    BOMBS_START: 2,
    BOMBS_MAX: 5,
    ENEMY_SHOT_SPEED: 330,
    BOSS_HP: 90,
  };

  // Chefes (um por arena). hp = pontos de integridade.
  RR.BOSSES = {
    leak:   { name: 'REI DAS FUGAS', subtitle: 'Uma fuga de memória gigante que nunca liberta nada!', hp: 70, w: 150, h: 110 },
    hive:   { name: 'COLMEIA DE MALWARE', subtitle: 'Infeta a cache e lança drones sem parar!', hp: 85, w: 190, h: 120 },
    module: { name: 'MÓDULO CORROMPIDO', subtitle: 'Bits trocados por todo o lado! Corrige-os com pacotes ECC', hp: 110, w: 230, h: 96 },
  };

  /* Legenda dos troços:
     #  chão (placa)            =  plataforma atravessável por baixo
     ~  paginação (lento)       >  barramento (impulso)        ^  curto-circuito (espinhos)
     o  chip de RAM (1 GB)      D  módulo DDR5 especial        S  condensador-mola
     B  bug                     L  fuga de memória             F  drone de malware
     T  torre de malware        K  bug blindado                Z  chefe final
     C  ponto de gravação SSD   G  CPU (meta)                  P  início
     Os troços alinham-se em baixo; a largura é dada pela última linha. */
  function R(w, ...specs) {
    const a = new Array(w).fill('.');
    for (const s of specs) {
      if (s.length === 2) a[s[0]] = s[1];
      else for (let c = s[0]; c <= s[1]; c++) a[c] = s[2];
    }
    return a.join('');
  }
  const G = (w, ...pits) => R(w, [0, w - 1, '#'], ...pits.map((p) => [p[0], p[1], '.']));
  const every = (a, b, step, ch) => { const out = []; for (let c = a; c <= b; c += step) out.push([c, ch]); return out; };

  RR.CHUNKS = {
    start: [
      '................',
      '..P.............',
      '################',
      '################',
    ],
    flat: [
      '........o.o.o...........',
      '........................',
      '..o.o.o.........B...o.o.',
      '########################',
      '########################',
    ],
    gap: [
      '..........o.o.........',
      '........o.....o.......',
      '......o.........o.....',
      '......................',
      '#########....#########',
      '#########....#########',
    ],
    stairs: [
      '...............o.o.o..........',
      '............##########........',
      '........o...##########...o....',
      '........##############........',
      '...o....##############..K..o..',
      '##############################',
      '##############################',
    ],
    spring: [
      '..............o.o.o.o.o.o..D....',
      '.............===============....',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '....S..........^^^^^^.......o...',
      '################################',
      '################################',
    ],
    booster: [
      '....................o.o.o.o.o.o.o.......',
      '........................................',
      '........................................',
      '........o.o.o.o.o.o.....................',
      '##>>######################.......#######',
      '##########################.......#######',
    ],
    leakden: [
      '####..........................####',
      '####.....o.o.o.o.o.o.o.o......####',
      '####....L.....K...L.......L...####',
      '##################################',
      '##################################',
    ],
    drones: [
      '.......F.........F............',
      '..............................',
      '...o.o.o.o.o.o.o.o.o.o.o.o....',
      '..............................',
      '..................B...........',
      '##############################',
      '##############################',
    ],
    spikes: [
      '..........o..........o..........',
      '........=====.....=====.........',
      '................................',
      '...^^^.......^^^^........^^^....',
      '################################',
      '################################',
    ],
    mud: [
      '.........o.o.o.o.o.o.o.o.o..........',
      '..........L.....T.....L.............',
      '####~~~~~~~~~~~~~~~~~~~~~~~~~~~~####',
      '####################################',
    ],
    checkpoint: [
      '......C.........',
      '################',
      '################',
    ],
    tower: [
      '...........D................',
      '..........===...............',
      '............................',
      '......===......===..........',
      '............................',
      '..........===....o.o........',
      '...............=====........',
      '.....===....................',
      '............................',
      '..===.....===...............',
      '............................',
      '...........B.........o.o....',
      '############################',
      '############################',
    ],
    bigjump: [
      '............D.............',
      '..........................',
      '...........o.o............',
      '.........o.....o..........',
      '........o.......o.........',
      '..........................',
      '..........................',
      '########......############',
      '########......############',
    ],
    goal: [
      '..o.o.o.........G.......',
      '########################',
      '########################',
    ],
    hills: [
      R(40, ...every(17, 23, 2, 'o')),
      R(40, [15, 26, '#']),
      R(40, [13, 28, '#'], [10, 'o'], [31, 'o']),
      R(40, [11, 30, '#'], ...every(3, 7, 2, 'o'), ...every(33, 37, 2, 'o')),
      G(40), G(40),
    ],
    cave: [
      R(40, [4, 33, '#']),
      R(40, [4, 33, '#']),
      R(40),
      R(40),
      R(40, ...every(6, 18, 2, 'o'), [20, 'R'], ...every(22, 32, 2, 'o'), [15, 'B'], [27, 'B']),
      G(40), G(40),
    ],
    pillars: [
      R(38, [10, 'o'], [18, 'T'], [27, 'o']),
      R(38, [9, 11, '#'], [17, 19, '#'], [26, 28, '#']),
      R(38, [9, 11, '#'], [17, 19, '#'], [26, 28, '#'], [5, 'o'], [32, 'o']),
      R(38, [4, 6, '#'], [9, 11, '#'], [17, 19, '#'], [26, 28, '#'], [31, 33, '#']),
      R(38, [4, 6, '#'], [9, 11, '#'], [17, 19, '#'], [26, 28, '#'], [31, 33, '#'], [13, 'o'], [15, 'o']),
      R(38, [0, 37, '#'], [21, 24, '^']),
      G(38),
    ],
    platforms: [
      R(34, ...every(14, 18, 2, 'o')),
      R(34, [13, 19, '=']),
      R(34),
      R(34, ...every(5, 8, 1, 'o'), ...every(24, 27, 1, 'o'), [16, 'F']),
      R(34, [5, 8, '='], [24, 27, '=']),
      R(34, [15, 'B']),
      G(34, [3, 10], [22, 29]), G(34, [3, 10], [22, 29]),
    ],
    rush: [
      R(48, ...every(20, 44, 2, 'o')),
      R(48),
      R(48),
      R(48, ...every(6, 18, 2, 'o')),
      R(48, [0, 47, '#'], [2, 3, '>']),
      G(48),
    ],
    leakfield: [
      R(40, ...every(8, 32, 3, 'o')),
      R(40, [10, 'L'], [20, 'B'], [30, 'L']),
      G(40), G(40),
    ],
    droneswarm: [
      R(36, [14, 'D']),
      R(36, [12, 16, '=']),
      R(36, [6, 'F'], [26, 'F']),
      R(36, [6, 'o'], [8, 'o'], [23, 'o'], [25, 'o']),
      R(36, [5, 9, '='], [22, 26, '=']),
      R(36, [16, 'F']),
      R(36, ...every(2, 4, 2, 'o'), ...every(30, 34, 2, 'o')),
      G(36), G(36),
    ],
    mudhop: [
      R(40, ...every(7, 10, 1, 'o'), ...every(17, 20, 1, 'o'), ...every(27, 30, 1, 'o')),
      R(40, [6, 11, '='], [16, 21, '='], [26, 31, '=']),
      R(40, [14, 'L'], [24, 'L']),
      R(40, [0, 3, '#'], [4, 35, '~'], [36, 39, '#']),
      G(40),
    ],
    turrets: [
      R(40, ...every(12, 18, 2, 'o'), [20, 'R'], ...every(22, 28, 2, 'o')),
      R(40, [11, 29, '=']),
      R(40),
      R(40),
      R(40, [6, 'T'], [20, 'K'], [34, 'T']),
      G(40), G(40),
    ],
    // Arena do chefe final: o CPU (G) só desbloqueia depois de vencer o módulo corrompido.
    arena: [
      R(46, [23, 'Z']),
      R(46),
      R(46),
      R(46, [5, 10, '='], [35, 40, '=']),
      R(46),
      R(46),
      R(46, [17, 28, '=']),
      R(46),
      R(46),
      R(46, [43, 'G']),
      G(46), G(46),
    ],
  };

  RR.THEMES = {
    board:  { ground: '#0f3a2b', deep: '#0a251c', edge: '#39d98a', glow: '#7dffb5', sky: ['#03110c', '#08281d'], far: 'rgba(57,217,138,' },
    bus:    { ground: '#0f2747', deep: '#0a1a31', edge: '#4cc9ff', glow: '#a9e8ff', sky: ['#040a1a', '#0b1f42'], far: 'rgba(76,201,255,' },
    disk:   { ground: '#3a2511', deep: '#26170a', edge: '#ff9f43', glow: '#ffd29a', sky: ['#120a04', '#2c1808'], far: 'rgba(255,159,67,' },
    cache:  { ground: '#2c1244', deep: '#1c0b2d', edge: '#ff4fd8', glow: '#ffb8f1', sky: ['#0b0318', '#240a3a'], far: 'rgba(255,79,216,' },
    kernel: { ground: '#33101a', deep: '#1f0910', edge: '#ff4d6d', glow: '#ffb3c1', sky: ['#0d0306', '#2c0812'], far: 'rgba(255,77,109,' },
    oc:     { ground: '#16303a', deep: '#0c1d24', edge: '#9ef6ff', glow: '#e4fdff', sky: ['#020c12', '#0a2a36'], far: 'rgba(158,246,255,' },
  };

  /* extra: inimigos adicionais distribuídos automaticamente (a cada ~N colunas). */
  RR.LEVELS = [
    {
      name: 'Zona da Placa-Mãe', theme: 'board', par: 130, speedMul: 1,
      extra: { every: 13, pool: ['bug', 'bug', 'leak', 'drone', 'turret'] },
      chunks: ['start', 'flat', 'hills', 'gap', 'stairs', 'leakfield', 'flat', 'checkpoint', 'pillars', 'tower', 'hills',
        'gap', 'leakden', 'drones', 'checkpoint', 'cave', 'turrets', 'bigjump', 'rush', 'hills', 'goal'],
      fact: 'Apanha a RAM e leva-a até ao CPU. A RAM é a memória de trabalho: o CPU só consegue usar os dados que estão carregados nela.',
    },
    {
      name: 'Autoestrada do Barramento', theme: 'bus', par: 190, speedMul: 1.1, boss: 'leak',
      extra: { every: 11, pool: ['bug', 'drone', 'turret', 'spiky', 'leak'] },
      chunks: ['start', 'rush', 'flat', 'platforms', 'booster', 'hills', 'checkpoint', 'cave', 'spikes', 'rush', 'pillars',
        'turrets', 'bigjump', 'checkpoint', 'droneswarm', 'booster', 'leakfield', 'gap', 'checkpoint', 'arena'],
      fact: 'O barramento de memória liga a RAM ao CPU: quanto mais largo e rápido, mais GB por segundo circulam. No fim espera-te um chefe!',
    },
    {
      name: 'Deserto da Paginação', theme: 'disk', par: 170, speedMul: 1.15,
      extra: { every: 10, pool: ['leak', 'leak', 'spiky', 'turret', 'drone', 'bug'] },
      chunks: ['start', 'mud', 'hills', 'stairs', 'leakden', 'mudhop', 'checkpoint', 'mud', 'spring', 'platforms', 'cave',
        'turrets', 'mudhop', 'checkpoint', 'pillars', 'mud', 'leakfield', 'gap', 'hills', 'goal'],
      fact: 'Quando a RAM enche, o sistema usa o disco como memória de emergência (ficheiro de paginação/swap). Funciona… mas muito mais devagar.',
    },
    {
      name: 'Núcleo da Cache', theme: 'cache', par: 230, speedMul: 1.25, boss: 'hive',
      extra: { every: 8, pool: ['bug', 'spiky', 'drone', 'drone', 'turret', 'leak'] },
      chunks: ['start', 'rush', 'spikes', 'platforms', 'leakden', 'checkpoint', 'spring', 'tower', 'droneswarm', 'cave',
        'pillars', 'checkpoint', 'turrets', 'booster', 'bigjump', 'spikes', 'mudhop', 'leakden', 'hills', 'checkpoint', 'arena'],
      fact: 'As caches L1, L2 e L3 ficam dentro do CPU e são ainda mais rápidas do que a RAM. Uma colmeia de malware infetou-as!',
    },
    {
      name: 'Zona do Overclock', theme: 'oc', par: 180, speedMul: 1.35,
      extra: { every: 7, pool: ['spiky', 'turret', 'drone', 'bug', 'leak', 'drone'] },
      chunks: ['start', 'rush', 'turrets', 'pillars', 'gap', 'droneswarm', 'checkpoint', 'spikes', 'tower', 'leakden', 'booster',
        'cave', 'checkpoint', 'platforms', 'turrets', 'hills', 'bigjump', 'spikes', 'rush', 'goal'],
      fact: 'Overclock: aumentar a frequência da RAM dá mais velocidade, mas também mais calor e mais erros. Tudo aqui é mais rápido!',
    },
    {
      name: 'Câmara do Kernel', theme: 'kernel', par: 240, speedMul: 1.4, boss: 'module',
      extra: { every: 7, pool: ['spiky', 'turret', 'drone', 'bug'] },
      chunks: ['start', 'flat', 'turrets', 'gap', 'leakfield', 'checkpoint', 'pillars', 'droneswarm', 'spikes', 'checkpoint', 'arena'],
      fact: 'Último desafio: um módulo de RAM corrompido bloqueia o CPU. Repara-o com o canhão ECC (código de correção de erros)!',
    },
  ];

  // Converte a lista de troços num mapa de tiles + lista de objetos.
  RR.buildLevel = function (def) {
    const ROWS = RR.CONFIG.ROWS;
    const rows = [];
    const spans = [];
    for (let r = 0; r < ROWS; r++) rows.push([]);
    for (const name of def.chunks) {
      const chunk = RR.CHUNKS[name];
      if (!chunk) { console.warn('Troço desconhecido:', name); continue; }
      const w = chunk[chunk.length - 1].length;
      spans.push({ name, c0: rows[0].length, w });
      const offset = ROWS - chunk.length;
      for (let r = 0; r < ROWS; r++) {
        const src = r >= offset ? chunk[r - offset] : '';
        for (let c = 0; c < w; c++) rows[r].push(src[c] || '.');
      }
    }
    const T = RR.CONFIG.TILE;
    const objects = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        if ('oDSBLFTKZCGPR'.includes(ch)) {
          objects.push({ ch, c, r, x: c * T, y: r * T });
          rows[r][c] = '.';
        }
      }
    }
    return { tiles: rows, cols: rows[0].length, rows: ROWS, objects, spans };
  };

  // Curiosidades sobre a RAM (aparecem nos pontos de gravação SSD).
  RR.FACTS = [
    'Gravado no SSD: o armazenamento conserva os dados mesmo com o computador desligado. A RAM não: é volátil.',
    'RAM = Random Access Memory (memória de acesso aleatório): qualquer célula é lida no mesmo tempo, esteja onde estiver.',
    'A RAM responde em nanossegundos; um SSD NVMe, em microssegundos: a RAM é centenas de vezes mais rápida.',
    'Dual Channel: dois módulos iguais trabalham em paralelo e duplicam a largura de banda teórica.',
    'Uma fuga de memória (memory leak) acontece quando um programa reserva memória e nunca a liberta.',
    'DDR = Double Data Rate: transfere dados na subida e na descida de cada ciclo de relógio.',
    'A DRAM guarda cada bit num minúsculo condensador que tem de ser refrescado aproximadamente a cada 64 ms.',
    'Um "page fault" acontece quando o CPU pede dados que não estão na RAM e é preciso ir buscá-los ao disco.',
    'Os recoletores de lixo (garbage collectors) libertam automaticamente a memória que já não é usada.',
    'Latência CAS (CL): os ciclos de relógio que a RAM demora a começar a entregar um dado pedido.',
    'Cada módulo DIMM contém vários chips de memória que trabalham juntos como se fossem um só.',
    'Memória virtual: cada programa vê endereços ordenados, mesmo que os dados estejam espalhados pela RAM física.',
    'ECC (Error-Correcting Code): memória que deteta e corrige automaticamente bits trocados por erros.',
    'Um "bit flip" é quando um 0 passa a 1 (ou ao contrário) por interferência. A memória ECC corrige-o.',
  ];

  RR.HINTS = {
    chip: 'Apanha os chips de RAM! Cada um vale 1 GB',
    hurt: 'Perdeste a tua RAM! É volátil: apanha-a antes que desapareça',
    noRam: 'Sem RAM não tens proteção: mais um toque e o sistema bloqueia',
    mud: 'Ficheiro de paginação: o disco é lento, aqui tudo anda devagar',
    pad: 'Barramento de dados: impulso à velocidade máxima!',
    energy: 'Energia a 100 %: prime E para ativar o Dual Channel',
    leak: 'Fuga eliminada: memória libertada!',
    spring: 'Condensador: atira-te pelos ares!',
    double: 'Salto duplo: prime saltar outra vez no ar!',
    shoot: 'Prime F (ou X / clique do rato) para disparar pacotes ECC! Cuidado com o sobreaquecimento',
    boss: 'Chefe! Dispara com F: na arena os pacotes ECC procuram o alvo sozinhos',
    heat: 'Sobreaquecimento! Espera que o canhão ECC arrefeça',
    bomb: 'Apanhaste uma Bomba de Refresh: prime B para limpar tudo à tua volta',
    spiky: 'Bug blindado: não lhe saltes em cima! Desvia-te ou usa o Dual Channel',
    turret: 'Torre de malware: dispara bits corrompidos. Salta-lhe para cima!',
    locked: 'O CPU está bloqueado: derrota primeiro o módulo corrompido!',
    shield: 'Escudo de paridade! Os disparos ricocheteiam: espera que caia',
  };

  RR.TEXT = {
    dedication: 'Helena Nogueira a melhor professora do mundo uma mulher extraodinaria e hermosa',
  };
})();
