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

`border` continua sendo o **divisor**: separa e não precisa de 3:1. A regra é que nenhum controle use só a `border` como borda; é para isso que existe a `borderControl`. As telas de hoje já seguem isso: campos, seletores, caixas de seleção e botões sem fundo (`.btn.outline` entre eles) usam `var(--border-control)`, e o teste [test/ui-control-borders.test.mjs](../test/ui-control-borders.test.mjs) falha se um controle voltar à `border`. Divisores, cartões, tabelas, painéis, etiquetas e selos ficam na `border`. Quando um controle é marcado ou definido, a borda passa a `accentLine` (`var(--accent-line)`), não ao laranja puro, que no claro dá só 2,55:1 sobre `bg`. O #750 já passou a `accentLine` o anel de foco da moldura (itens da barra, marca, botões de 28 px, a linha do GitHub, a versão) e o do `.btn`; o #751 passou a `accentLine` o foco dos controles do Mural, o do botão "Nova sessão" e do seu painel (`new-session.css`), o das ações de abrir (`open-action.css`) e o do seletor de máquina, cuja borda também passou a `borderControl` (`machine-filter.css`); os das outras telas seguem o laranja puro (2,55:1 sobre `bg` no claro) até a vez delas.

O ponto do "Esperando você" no claro era `#664e04` e passou a `#a87e00` (3,65:1 sobre o cartão e 3,15:1 sobre `sidebar`), para se parecer com o amarelo da marca.

Contraste, nos dois temas (todos os valores conferidos por [test/tokens.test.mjs](../test/tokens.test.mjs)):

- **Texto, 4,5:1:** `text`, `muted` e `subtle` sobre `bg`, `surface`, `raised`, `sidebar` e `segment`, e sobre `avatar`; `onPrimary` sobre `primary`; o texto de cada cor de agente sobre o fundo dela.
- **Ícone, traço e borda de controle, 3:1:** `accentLine` sobre `bg`, `surface`, `raised`, `sidebar` e `segment`; `borderControl` sobre `bg`, `surface`, `sidebar` e `segment` (no mínimo 3,02:1, no claro sobre `segment`).
- **Fora da regra:** o `borderControl` não é garantido sobre `track` no escuro (2,63:1). `subtle` não é texto sobre `track` no escuro (4,47:1).
- **O `#f47720` não é texto sobre `track` no escuro:** dá 4,47:1, abaixo de 4,5:1. Vale para `accentText`, `accentLine` e `status.active.text`, que têm esse valor no escuro. Sobre `track` ele serve como traço (progresso), que só pede 3:1.
- **O texto de erro do escuro (`status.error.text`, `#f06463`) não é texto sobre `track` nem sobre `avatar`:** dá 4,00:1 e 4,30:1. Sobre `bg`, `surface`, `raised`, `sidebar` e `segment` ele passa.
- **O `#ab5316` não é texto sobre `sidebar`, `segment`, `track` nem `avatar` no tema claro:** dá 4,47:1, 4,24:1, 4,24:1 e 4,47:1, abaixo de 4,5:1. Ali ele vale como traço (foco, progresso), que só pede 3:1. Não use o `#ab5316` como texto ali. O rótulo de status Ativa no claro (`status.active.light.text`) e o `accentText` do claro têm o mesmo valor, então vale o mesmo para eles.
- **O `#a87e00` não é ícone sobre `segment` nem sobre `track` no tema claro:** dá 2,98:1, abaixo de 3:1. Ali a contagem usa o `#664e04` (`status.waiting.light.text`), que dá 6,35:1. Sobre `bg`, `surface` e `raised` o `#a87e00` passa (3,38:1, 3,65:1 e 3,24:1).
- **Fora essas exceções, todo texto passa 4,5:1 sobre todo fundo, nos dois temas:** `text`, `muted`, `subtle`, `accentText` e o texto de cada status sobre `bg`, `surface`, `raised`, `sidebar`, `segment`, `track` e `avatar`. O [test/tokens.test.mjs](../test/tokens.test.mjs) confere a matriz inteira e falha se um par entrar ou sair desta lista.

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

### Barra lateral e moldura

Decisão [0028](decisoes/0028-console-visual-redesign.md), issue 750. A barra tem 248 px e usa `sidebar`; o item atual fica em `surface` com borda `border` e peso 500; o item tem no mínimo 31 px, uma linha só (reticências se faltar espaço) e o nome inteiro no rótulo acessível. Só a navegação rola: o topo e o rodapé ficam fixos, e a janela de 1100 por 700 mostra o rodapé inteiro. As contagens são número simples em mono e `subtle`; quem espera é a etiqueta amarela "N esperam" no Mural, e a fila do Quadro do trabalho é a etiqueta laranja com o número. As etiquetas usam o par gerado do status (texto sobre o próprio fundo opaco, mais de 4,5:1 nos dois temas), nunca `accentText`, que no claro não passa sobre `sidebar`. O foco da moldura é `accentLine` de 2 px com afastamento de 2 px. O tema segue o sistema até a pessoa escolher; a escolha fica em `localStorage` e vira `data-theme` no `<html>`. O `localStorage` é por origem e o app instalado sobe em porta nova a cada abertura, então hoje a escolha se perde ao reabrir; isso fica para outra issue. O rodapé tem uma linha de ponta a ponta, o bloco "Ao vivo" (ponto de 8 px, o texto e a nota "N máquinas · versão X"; sem conexão o ponto fica vazado, além da palavra) e a linha da pessoa (avatar de 32 px, "GitHub conectado" com o login só no `title`, os botões de tema e de opções da conta). As contagens se atualizam sozinhas: a etiqueta do Mural na partida e a cada mudança de sessão, a fila do Quadro depois de uma escrita da pessoa no quadro e, enquanto houver fila, a cada mudança de sessão, no máximo uma leitura a cada 30 s; a mudança que cai dentro da janela agenda uma leitura para o fim dela, e com o número em zero nada se agenda. Abaixo de 860 px a barra é uma gaveta com barra superior e véu a 30%; qualquer link da barra ou troca de rota a fecha e o foco volta ao botão do menu.

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

## O Mural (decisão 0028, issue 751)

As sessões que precisam de você são cards na seção "Precisam de você", na ordem do núcleo, em grade `auto-fill` de 330 px no mínimo (3 colunas a 1440 px, 2 a 1100 px, 1 abaixo de 600 px), com a mesma altura e os pés alinhados. Sem nenhuma, não há seção nem título vazio. As demais são uma lista só, sem agrupar (o agrupamento é o #752). O card tem, de cima para baixo: monograma e nome ("Claude", fixo, porque `/api/wall` não traz o agente), há quanto tempo e o estado à direita; o título (13,5 px, `subtle`, uma linha, e o link do card inteiro); o pedido (18 px, peso 500, até 4 linhas); a ação primária ("Responder no Claude", ou "Abrir para retomar" no erro); e o pé com "Passo X de Y" e a barra neutra (o mesmo passo no número, na barra e na fatia do ícone), ou "Uso da conversa N%" (no erro, ou a partir de 90%), em vermelho a partir de 90% e na cor normal abaixo disso, e a máquina. O kit diz "acima de 90%"; a pessoa pediu "a partir de 90%" (#751), então 90% já é vermelho, e num erro abaixo de 90% o texto aparece na cor normal, sem o vermelho do número nem da barra. Modelo, esforço, agentes e custo saíram do card e voltam no #754; "Detalhe ›" saiu do pé e o título esticado cobre o card. A linha da lista é um link só, de 68 px, com título de 15 px, a frase de 13,5 px (a da sessão ociosa começa pelo motivo: "Sua vez · texto do núcleo"), o estado com a fatia, "X de Y" (o mesmo passo do card) quando há plano e a sessão não está ociosa (a ociosa é o ícone, o rótulo escrito e a hora) e a máquina; o pé, o lado direito e a frase de quem não está trabalhando usam `subtle`, e a frase de quem trabalha, `muted`; abaixo de 600 px a máquina some e o lado (estado, "X de Y" e hora) desce para uma segunda linha, sob o texto, e quebra se faltar espaço, de modo que o título tem a mesma largura em qualquer linha (a linha passa de 68 para 98 px). O rótulo longo de uma máquina remota (até 40 caracteres) e o do estado são cortados com reticências, sem rolagem lateral de 320 a 1000 px com a faixa "Paradas" fechada, que é a padrão; com ela aberta, abaixo de 390 px a página ainda rola algumas dezenas de pixels para o lado (medido a 320, 340 e 360 px). No botão do card o texto também é cortado. O botão do card tem 32 px (`md`, quem decide é a `openAction`). A lista não corta nada (o anel de foco e o aviso de falha da ação passam por cima das outras linhas) e o redesenho devolve o foco ao mesmo controle enquanto ele continua na tela: o "Tentar de novo" (ou o Atualizar, se ele sumir), o link do aviso de máquina (ou o botão da máquina, se ele existir), o copiar ou o fechar do aviso de falha (ou o botão de abrir), a sessão que vira filha (o link da filha, ou o da líder se a árvore está fechada) ou estacionada com a faixa aberta e, depois de "Mostrar mais", a primeira linha nova. Fora desses casos o foco ainda cai no corpo da página, como já era: a sessão vira estacionada com a faixa "Paradas" fechada (a padrão); a sessão de um aviso de falha aberto vira estacionada ou filha (fechada) ou perde a ação de abrir; a linha sai pelo filtro ativo; o botão "Mostrar mais" some num redesenho comum; e o Fechar ou o Escape do aviso. Sem sombra; borda `border` de 1 px; foco `accentLine` de 2 px com afastamento de 2 px.
