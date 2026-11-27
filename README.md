# RAM RUSH: Cache & Bus

Jogo de plataformas rápido e educativo sobre **o funcionamento da memória RAM**.
Controlas o **BIT**, um robô mensageiro de dados que corre pela placa-mãe a apanhar os
**chips de RAM** espalhados pelo caminho, enfrenta bugs, fugas de memória e malware,
derrota **3 chefes** e entrega os dados ao **CPU** no fim de cada zona.

> Dedicado a **Helena Nogueira**: «Helena Nogueira a melhor professora do mundo uma mulher extraodinaria e hermosa».
> A dedicatória aparece no ecrã inicial e no ecrã final, quando ganhas o jogo.

## Como executar

- **Opção 1 (a mais rápida):** abre o `index.html` com duplo clique no Chrome, Edge ou Firefox. Não é preciso instalar nada.
- **Opção 2 (com Node.js):**
  ```bash
  npm run dev
  ```
  e abre <http://localhost:5173>. O servidor (`server.js`) não tem dependências.

## Como se joga

- Corre, salta (com **salto duplo** no ar) e **apanha chips de RAM** (cada um vale 1 GB).
- **Salta em cima dos inimigos** (ou rola sobre eles no ar) ou **dispara pacotes ECC** para os eliminar.
- Se fores atingido **perdes toda a RAM**: os chips saltam pelos ares e desaparecem se não os apanhares a tempo (a RAM é *volátil*). Se fores atingido **sem RAM**, perdes uma vida.
- Os **SSD** são pontos de gravação: se perderes uma vida, voltas ao último SSD… mas com a RAM vazia.
- Chega ao **CPU** para concluir a zona. A RAM entregue transforma-se em pontos (100 por GB), mais um bónus de tempo.
- A cada 60 GB apanhados ganhas uma **vida extra**. Há **módulos DDR5** escondidos (+5 GB e 1000 pontos) e **Bombas de Refresh**.

### Zonas e chefes

| Zona | Nome | Desafio |
|---|---|---|
| 1 | Zona da Placa-Mãe | Introdução: chips, bugs, fugas e torres |
| 2 | Autoestrada do Barramento | Impulsionadores de velocidade · **Chefe: Rei das Fugas** |
| 3 | Deserto da Paginação | Areia lenta (o disco usado como RAM) |
| 4 | Núcleo da Cache | Muitos inimigos · **Chefe: Colmeia de Malware** |
| 5 | Zona do Overclock | Tudo mais rápido e com mais inimigos |
| 6 | Câmara do Kernel | **Chefe final: Módulo Corrompido** |

- **Rei das Fugas:** fuga de memória gigante que salta, cria ondas de choque ao aterrar, cospe gotas de memória perdida e invoca fugas pequenas. Também se pode saltar em cima dele.
- **Colmeia de Malware:** voa pela cache infetada, lança drones, dispara bits corrompidos, faz chover lixo, dispara um laser e ativa um **escudo de paridade**.
- **Módulo Corrompido:** módulo DDR5 gigante cheio de *bit flips*: rajadas de bits, chuva de lixo, laser rasante, invocações e escudo. Tem 3 fases.

## Controlos

| Ação | Teclado | Rato / ecrã tátil |
|---|---|---|
| Correr | `←` `→` / `A` `D` | Botões ◀ ▶ |
| Saltar · salto duplo | `Espaço` / `W` / `↑` (outra vez no ar) | Botão ⤒ |
| Cair depressa / disparar na diagonal | `↓` / `S` no ar | — |
| Disparar pacotes ECC | `F` / `X` / `J` | Clique no ecrã · botão ✦ |
| Trocar de arma | `Tab` / `1` `2` | Clique no painel da arma |
| Bomba de Refresh | `B` / `C` | Botão 💣 |
| Dual Channel (energia a 100 %) | `E` / `Shift` | Botão **E** |
| Garbage Collector | `Q` | Botão **Q** |
| Pausa / continuar | `P` / `Esc` | Botão ⏸ |
| Reiniciar o nível | `R` | Menu de pausa |
| Som · Ajuda | `M` · `H` | Botões 🔊 · ? |

### Armas

- **Canhão ECC:** disparo rápido. Sobreaquece se disparares sem parar (barra de calor no HUD). Nas arenas dos chefes os pacotes procuram o alvo sozinhos.
- **Disparo Dual Channel:** 3 pacotes em leque. Desbloqueia ao vencer o primeiro chefe.
- **Bomba de Refresh:** elimina os inimigos e projéteis à tua volta e fere os chefes (até 5 bombas).

## O que representa cada mecânica

| No jogo | Num computador real |
|---|---|
| **Chips de RAM e contador de GB** | A RAM é a memória de trabalho rápida onde estão os dados que o CPU usa. |
| **Entregar a RAM ao CPU** | O CPU só consegue trabalhar com dados carregados na RAM. |
| **Perder a RAM ao ser atingido** | A RAM é **volátil**: sem energia (ou numa falha) o conteúdo perde-se. |
| **Pontos de gravação SSD** | O armazenamento (SSD/HDD) conserva os dados mesmo com o computador desligado. |
| **Fugas de memória / Rei das Fugas** | Programas que reservam memória (`malloc`) e nunca a libertam. |
| **Bugs, torres e drones de malware** | Erros e software malicioso que corrompem dados. |
| **Areia laranja «SWAP» (paginação)** | Quando a RAM enche, o sistema usa o disco como memória: funciona, mas muito devagar. |
| **Impulsionadores do barramento** | O barramento de memória e a sua largura de banda. |
| **Pacotes ECC** | *Error-Correcting Code*: memória que deteta e corrige bits trocados. |
| **Bits 0/1 corrompidos e laser de bit flip** | Um *bit flip* é quando um 0 passa a 1 (ou ao contrário) por interferência. |
| **Escudo de paridade** | O bit de paridade é uma forma simples de detetar erros na memória. |
| **Bomba de Refresh** | A DRAM tem de ser refrescada (reescrita) a cada ~64 ms para não perder dados. |
| **Dual Channel (E)** | Dois canais de memória em paralelo duplicam a largura de banda. |
| **Garbage Collector (Q)** | O recoletor de lixo liberta automaticamente a memória que já não é usada. |
| **Módulo DDR5** | Instalar mais memória. |
| **Condensadores (molas)** | A DRAM guarda cada bit num minúsculo condensador. |
| **Overclock** | Mais frequência = mais velocidade, mas também mais calor e mais erros. |

Cada zona e cada SSD mostram uma curiosidade sobre a RAM.

## Estrutura do código

```
index.html          Ecrãs (dedicatória, ajuda, pausa, zona concluída, fim, vitória), HUD e controlos táteis
css/styles.css      Estilos e animações (estética cyber-hardware)
js/data.js          Física, troços de nível em ASCII, zonas, chefes, temas visuais e curiosidades
js/game.js          Lógica: física com subpassos, salto duplo, colisões, inimigos, armas, bombas e chefes
js/renderer.js      Canvas 2D: câmara com zoom nas arenas, parallax em 3 camadas, iluminação, BIT, inimigos e chefes
js/particles.js     Partículas, anéis, textos flutuantes, confettis, flashes e tremor do ecrã
js/audio.js         Efeitos sonoros sintetizados com a Web Audio API (sem ficheiros de áudio)
js/ui.js            HUD, barra do chefe, banners, avisos e ecrãs
js/input.js         Teclado, rato e botões táteis
js/main.js          Arranque e ciclo principal (lógica a 120 Hz em passo fixo + desenho a 60 FPS)
tests/bot.js        Testes automáticos: bot que joga as 6 zonas e vence os chefes, testes aleatórios e validação dos troços
server.js           Servidor estático opcional para `npm run dev`
```

### Testes automáticos

Com o jogo aberto através de `npm run dev`, escreve na consola do navegador:

```js
const s = document.createElement('script'); s.src = 'tests/bot.js'; document.body.appendChild(s);
// quando carregar:
RRTEST.runAll()
```

Verifica que todas as zonas podem ser concluídas, que os 3 chefes podem ser derrotados, que o personagem
nunca fica dentro de uma parede, que não surgem erros nem valores inválidos com entradas aleatórias
(pausas, reinícios, armas, bombas) e que todos os troços de nível estão bem formados.

O jogo pausa sozinho ao mudar de separador, adapta-se ao tamanho da janela (incluindo telemóvel)
e guarda o recorde e a preferência de som no navegador (`localStorage`).
