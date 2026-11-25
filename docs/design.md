# Design

## Direção da interface

A referência de interface é o **Claude Code Agent Monitor** (ficha no benchmark interno), não o Podium. O que vem dele:

- dashboard com as sessões e os agentes ao vivo;
- kanban de status das sessões;
- detalhe da sessão com a conversa renderizada e a árvore de subagentes;
- feed de atividade;
- analytics de custo, tokens e modelos;
- visão de workflows (delegação e concorrência entre agentes).

Do Podium entram ideias pontuais, não o visual: o estado "quem precisa de você" em destaque e responder a sessão pelo painel.

## Marca

A marca é a da Ahrena, a mesma do **The Forward Deployed Engineer** ([theforwarddeployedengineer.io](https://theforwarddeployedengineer.io)).

A paleta parte da do The Forward Deployed Engineer ([brand/tokens.json](brand/tokens.json)) e vai se afastando dela aos poucos. **Só o laranja fica.** As outras cores são trocadas uma de cada vez, testando na tela.

| Papel | Cor | Hex | Origem |
| --- | --- | --- | --- |
| Destaque, ações, barras | laranja | `#f47720` | The Forward Deployed Engineer (fica) |
| Institucional, réguas, seleção | rosa | `#df285d` | Rosa da marca; substitui o roxo `#552973` desde 2026-10-18 |
| Sucesso (CI, PR aprovado, sessão e subagente concluídos, "Online") | cinza 100 no escuro, cinza 500 no claro, sempre com `✓` | `#d7d7d9` / `#3a3a44` | Decisão do dono do produto em 2026-11-15 (issue 698): o verde deixa de ser cor de sucesso e fica no `tokens.json` só como histórico. Contraste do texto: 12,4:1 sobre o fundo, 11,5:1 sobre o cartão e 10,2:1 sobre o realce no escuro; 10,2:1, 11,0:1 e 9,8:1 no claro. Mais forte que o cinza da Abandonada nos dois temas |
| Pendente (CI e sessão esperando) | amarelo | `#ffc30a` | Cor do CI |
| Erro, falha (CI e sessão com erro) | vermelho | `#e34948` | Cor do CI, reaproveitada (ver abaixo) |
| Fundo (tema escuro) | cinza 900 | `#17171b` | The Forward Deployed Engineer |
| Superfícies | cinza 800 / 700 | `#1e1e24` / `#28282f` | The Forward Deployed Engineer |
| Texto principal | quase branco | `#f2f2f3` | Ajustado na decisão 0028, um degrau acima do cinza 100 |

Os valores ficam em [brand/tokens.json](brand/tokens.json), e a amostra com os dois temas e os status está em [brand/amostra.html](brand/amostra.html) (captura em [brand/amostra.png](brand/amostra.png)). O teste [test/tokens.test.mjs](../test/tokens.test.mjs) confere as cores obrigatórias e o contraste AA:

```bash
node --test test/
```

O painel e o artefato não copiam esses valores: leem o que [packages/marca](../packages/marca/) gera do `tokens.json` (um módulo TS com as cores em hex para o painel e as variáveis CSS para o artefato). Para mudar uma cor, edite o `tokens.json` e rode `node packages/marca/src/gerar.ts`.

### Cor de erro

O erro usa o **mesmo vermelho do CI, `#e34948`**. Uma sessão com erro e um CI que falhou dizem a mesma coisa para quem olha: algo falhou e precisa de você. Dois vermelhos para a mesma ideia só confundiriam.

O `#db6286` provisório saiu porque era um rosa mais claro: no matiz (LCh), ficava a 10° do rosa da marca. O `#e34948` fica a 16° do rosa e a 26° do laranja, no vermelho entre os dois. Além disso:

- o rosa nunca é cor de status nem de erro, só institucional;
- o erro sempre vem com o glifo `✕` e o rótulo, nunca só a cor.

No tema escuro, o texto de erro usa `#f06463`, um degrau mais claro, porque o `#e34948` não chega a 4,5:1 sobre o cartão realçado. O ponto e as barras continuam `#e34948`.

### Temas

O escuro é o padrão. O claro é o equivalente, com os mesmos papéis em três degraus de superfície:

| Papel | Escuro | Claro |
| --- | --- | --- |
| Fundo (`bg`) | `#17171b` | `#f4f4f5` |
| Cartão (`surface`) | `#1e1e24` | `#fdfdfd` |
| Realce, hover (`raised`) | `#28282f` | `#efeff1` |
| Borda (divisor) | `#2e2e36` | `#e3e3e6` |
| Texto | `#f2f2f3` | `#17171b` |
| Texto secundário | `#c4c4c8` | `#4a4a52` |
| Destaque (preenchimento) | `#f47720` com texto `#17171b` | `#f47720` com texto `#17171b` |
| Destaque como texto | `#f47720` | `#ab5316` (laranja 700) |

O laranja não muda no tema claro. Ele continua sendo o preenchimento de botões, barras e do logo, sempre com texto escuro por cima. Como texto sobre fundo claro, o `#f47720` fica em 2,6:1, então ali entra o laranja 700, que já estava na escala.

Todo texto passa AA (4,5:1) sobre fundo, cartão e realce nos dois temas. Pontos e ícones de status passam 3:1.

#### Papéis novos dos temas

Desde a decisão [0028](decisoes/0028-console-visual-redesign.md), cada tema tem também estes papéis. Os valores estão em [brand/tokens.json](brand/tokens.json) e viram variáveis CSS (`--subtle`, `--sidebar`, `--on-primary`, `--accent-line`, `--border-control`…).

| Papel | Escuro | Claro | Para quê |
| --- | --- | --- | --- |
| `subtle` | `#9a9aa0` | `#64646c` | Metadados (hora, máquina): texto abaixo do secundário |
| `sidebar` | `#1b1b20` | `#ececef` | Fundo da barra lateral |
| `segment` | `#26262c` | `#e6e6e9` | Trilho do filtro segmentado |
| `track` | `#33333b` | `#e6e6e9` | Trilho de barra de progresso |
| `avatar` | `#2e2e36` | `#ececef` | Fundo do monograma |
| `primary` / `onPrimary` | `#e4e4e7` / `#17171b` | `#17171b` / `#fdfdfd` | Botão primário e o texto dele. No escuro, um degrau abaixo do texto, para não brilhar mais que a pergunta |
| `accentLine` | `#f47720` | `#ab5316` | O laranja como traço (foco, progresso) |
| `borderControl` | `#72727c` | `#83838b` | Borda de campo, caixa de seleção e botão sem fundo |

`border` continua sendo o **divisor**: separa e não precisa de 3:1. A regra é que nenhum controle use só a `border` como borda; é para isso que existe a `borderControl`. As telas de hoje (`.btn.outline`, campos e seletores) ainda usam `var(--border)` e passam à `borderControl` no #750 e no #751.

O ponto do "Esperando você" no claro era `#664e04` e passou a `#a87e00` (3,65:1 sobre o cartão e 3,15:1 sobre `sidebar`), para se parecer com o amarelo da marca.

Contraste, nos dois temas (todos os valores conferidos por [test/tokens.test.mjs](../test/tokens.test.mjs)):

- **Texto, 4,5:1:** `text`, `muted` e `subtle` sobre `bg`, `surface`, `raised`, `sidebar` e `segment`, e sobre `avatar`; `onPrimary` sobre `primary`; o texto de cada cor de agente sobre o fundo dela.
- **Ícone, traço e borda de controle, 3:1:** `accentLine` sobre `bg`, `surface`, `raised`, `sidebar` e `segment`; `borderControl` sobre `bg`, `surface`, `sidebar` e `segment` (no mínimo 3,02:1, no claro sobre `segment`).
- **Fora da regra:** o `borderControl` não é garantido sobre `track` no escuro (2,63:1). `subtle` não é texto sobre `track` no escuro (4,47:1).
- **O `#ab5316` não é texto sobre `sidebar` nem sobre `segment`:** dá 4,47:1 e 4,24:1, abaixo de 4,5:1. Ali ele vale como traço (foco, progresso), que só pede 3:1. Não use o `#ab5316` como texto ali. O rótulo de status Ativa no claro (`status.active.light.text`) tem o mesmo valor, então vale o mesmo para ele.
- **O `#a87e00` não é ícone sobre `segment` nem sobre `track` no tema claro:** dá 2,98:1, abaixo de 3:1. Ali a contagem usa o `#664e04` (`status.waiting.light.text`), que dá 6,35:1. Sobre `bg`, `surface` e `raised` o `#a87e00` passa (3,38:1, 3,65:1 e 3,24:1).

#### Raios

Escala em `radius`, que vira `--radius-*`. Não muda com o tema.

| Nome | Valor | Onde |
| --- | --- | --- |
| `card` | 8px | Cards, listas, painéis, popover, aviso |
| `control` | 6px | Botões, busca, campos, itens da barra |
| `tag` | 4px | Contagens, teclas |
| `segment` / `segmentItem` | 8px / 6px | Filtro segmentado e seus itens (`--radius-segment`, `--radius-segment-item`) |
| `full` | 999px | Só monogramas e pontos. Nada mais é pílula |

#### Cores de agente

Pintam só o monograma de um agente com nome. São identidade, nunca estado: nenhuma é cor de status. Cada uma tem texto e fundo por tema (`--agent-violet-text`, `--agent-violet-bg`…).

| Cor | Escuro (texto / fundo) | Claro (texto / fundo) |
| --- | --- | --- |
| `violet` | `#c4b2f5` / `#2d2640` | `#5b3fa8` / `#efe9fb` |
| `blue` | `#9cc1f5` / `#1f2a3d` | `#2456a6` / `#e6eefb` |
| `teal` | `#84d3c8` / `#1c3331` | `#11695f` / `#e2f3f1` |
| `indigo` | `#aeb6f0` / `#262a42` | `#3b4594` / `#e8eaf8` |

O texto passa 4,5:1 sobre o fundo (no mínimo 5,71:1, o `teal` claro).

#### Sombra

Cards e listas não têm sombra: a separação vem da borda e da diferença entre `bg` e `surface`. Só o que flutua (popover, aviso, busca) tem a `shadow.<tema>.float`, que vira `--shadow-float`: `0 12px 32px rgba(0,0,0,0.5)` no escuro e `0 12px 32px rgba(0,0,0,0.14)` no claro. Fica num grupo próprio porque os papéis de `themes.*` são todos hex.

### Status de sessão

Os cinco status do Claude Code Agent Monitor (detalhe no benchmark interno, seção 3). Cada um tem cor, glifo e rótulo, para que o status nunca dependa só da cor, inclusive no painel nativo, que só tem texto.

| Status | Rótulo | Glifo | Cor | Por que existe |
| --- | --- | --- | --- | --- |
| `active` | Ativa | `●` | laranja `#f47720` | O Claude está no meio de um turno. Não pede nada, só dá para acompanhar. Laranja porque é onde a ação está, como nas barras de progresso |
| `waiting` | Esperando você | `◐` | amarelo `#ffc30a` | O turno parou e a vez é sua. É o estado que alimenta o inbox "quem precisa de você". Amarelo como o pendente do CI: algo aguarda alguém |
| `completed` | Concluída | `✓` | cinza `#d7d7d9` (escuro) / `#3a3a44` (claro) | Terminou sem erro. Cinza com `✓`, como o sucesso do CI, e mais forte que a Abandonada. O verde e o rosa nunca são status |
| `error` | Com erro | `✕` | vermelho `#e34948` | Parou num erro e não se recuperou. Vermelho como a falha do CI |
| `abandoned` | Abandonada | `○` | cinza `#a6a6aa` | Ficou ativa sem sinal por 180 min. Não pede ação e não é erro, então sai do caminho em cinza |

As etiquetas de **Ativa** e de **Esperando você** têm também uma `border` decorativa (`--status-active-border`, `--status-waiting-border`): `#55392a` e `#4f4426` no escuro, `#f4d3bb` e `#f1e2b0` no claro. É só o contorno da etiqueta, fora da medida de contraste; o estado continua dito pelo ícone e pelo rótulo. Os outros três status não têm `border`.

O motivo do "Esperando você" aparece num chip ao lado do status: **Pede permissão** (`notification`) e **Interrompida** (`interrupted`) são urgentes; **Sua vez** (`stop`) e **No prompt** (`session_start`) não são.

No tema claro, ponto e rótulo usam um tom mais escuro da mesma cor (laranja 700, amarelo, vermelho 700, cinza 300 e, na Concluída, cinza 500), para passar o contraste. O ponto do "Esperando você" é `#a87e00` e o rótulo é o amarelo 900, `#664e04`. A pílula é a cor canônica a 12% sobre o cartão.

### Tipografia

A fonte é a **do sistema**. Não se baixa nada: a política de conteúdo do núcleo não tem `font-src` e a `/ui` não serve arquivo de fonte, então Poppins e JetBrains Mono, que a marca pedia até a decisão [0028](decisoes/0028-console-visual-redesign.md), nunca carregavam.

- **Sans**, para títulos, rótulos e texto corrido no artefato: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif` (`--font-sans`). SF Pro no Mac, Segoe UI no Windows;
- **Mono**, para ids, caminhos, números de tabela, custo e tokens: `ui-monospace, "SF Mono", Menlo, Consolas, monospace` (`--font-mono`).

No painel nativo do Claude Desktop não dá para escolher fonte: ele usa a monoespaçada do app. Ali a hierarquia vem de peso (negrito nos títulos), caixa alta nos cabeçalhos de seção, cor (texto principal e secundário) e dos glifos de status.

Escala do artefato: 12, 13, 14, 16, 20 e 28 px (`--text-xs` a `--text-xxl`), mais dois tamanhos novos:

- **título de tela**, 30 px (`--text-title`), peso 600, espaçamento `-0.02em` (`--tracking-title`);
- **número herói**, 64 px (`--text-hero`), peso 500, com dígitos tabulares (`font-variant-numeric: tabular-nums`) e sem ajuste de espaçamento.

Pesos 400, 500 e 600.

## Logo

| Fundo laranja | Fundo preto |
| --- | --- |
| ![Logo com fundo laranja](brand/logo-laranja.svg) | ![Logo com fundo preto](brand/logo-preto.svg) |
| [brand/logo-laranja.svg](brand/logo-laranja.svg) | [brand/logo-preto.svg](brand/logo-preto.svg) |

O logo é um **"A" com um triângulo apontando para baixo no centro**, num quadrado de cantos arredondados. Existem duas versões, uma o negativo da outra:

- **fundo laranja, "A" preto:** para telas escuras, onde o quadrado laranja se destaca. É a versão padrão ([brand/logo.svg](brand/logo.svg));
- **fundo preto, "A" laranja:** para telas claras.

O triângulo é sempre rosa (`#df285d`). O logo nasceu no painel de teste do mod em 2026-10-18.
