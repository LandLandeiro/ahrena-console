# 0028 · Redesign visual do console

- **Status:** aceita. A direção foi aprovada pelo Fernando em 2026-11-24, depois de ver o protótipo navegável e o Design System, com cinco escolhas: tema claro e escuro, cantos suaves, fonte do sistema, ícones de estado desenhados e os nomes "Trabalhando" e "Em pausa".
- **Data:** 2026-11-24
- **Issue:** [#748](https://github.com/ahrenatechnology/ahrena-console/issues/748) (épico); implementam [#749](https://github.com/ahrenatechnology/ahrena-console/issues/749) a [#759](https://github.com/ahrenatechnology/ahrena-console/issues/759)
- **Emenda:**
  - a tipografia de `docs/design.md` e de `docs/brand/tokens.json` (Poppins e JetBrains Mono, desde a criação);
  - os rótulos de estado do [#245](https://github.com/ahrenatechnology/ahrena-console/issues/245) ("Ativa" e "Ociosa"), só no texto da tela.
- **Toca:**
  - [0009](0009-english-internals.md): nomes internos em inglês, texto da tela em pt-BR;
  - [0025](0025-permission-requests-from-the-console.md): o card do Mural responde permissão como a [#621](https://github.com/ahrenatechnology/ahrena-console/issues/621) já faz.

## Contexto

O console atende dois públicos ao mesmo tempo: quem é dev e quer número, branch e contexto, e quem é FDE ou de produto e quer saber o que está acontecendo e se precisa agir. A interface de hoje dá o mesmo peso a tudo. No Mural, a pergunta de um agente que espera você tem o mesmo tamanho de uma sessão que só está rodando.

Três fatos pesaram:

1. **As fontes da marca nunca carregaram.** O `UI_CONTENT_POLICY` (`packages/nucleo/src/api/ui.ts`) não tem `font-src`, e a `/ui` só serve `.js`, `.css` e `.svg`. Poppins e JetBrains Mono caem sempre no fallback.
2. **A pílula de estado com glifo (`● ◐ ○ ✓ ✕`) depende da fonte.** O `◐` sai pequeno e torto em várias delas.
3. **O tema claro foi derivado do escuro**, sem degraus próprios para barra lateral, filtro e botão primário. O laranja `#f47720` como linha fina dá 2,7:1 sobre branco.

## Decisão

**Calmo por padrão, denso quando pedido, e a hierarquia guiada por quem precisa de você.**

- **Dois temas no mesmo nível.** Claro e escuro têm os mesmos papéis em degraus equivalentes. O tema segue o sistema até a pessoa escolher pelo botão no pé da barra lateral. A escolha fica no navegador.
- **A fonte é a do sistema:**
  - SF Pro no Mac e Segoe UI no Windows;
  - SF Mono, Menlo ou Consolas na mono;
  - nada é baixado, o que também resolve o fato 1 sem mudar o núcleo.
- **Cantos suaves**, escolhidos entre três níveis testados no protótipo:
  - 8px em cards, listas e painéis;
  - 6px em controles;
  - 4px em contagens e teclas;
  - 999px só em monogramas e pontos. Nada mais é pílula.
- **Sem sombra em cards e listas.** A separação vem da borda de 1px e da diferença entre `bg` e `surface`. Só o que flutua (popover, aviso, busca) tem sombra.
- **Estado é ícone desenhado mais rótulo, sem fundo colorido.**
  - SVG de 16px: anel aberto para o que está em andamento, círculo cheio para o que terminou.
  - Trabalhando: uma fatia que cresce com o passo do plano.
  - Em pausa: o anel tracejado.
  - A cor fica só no ícone (amarelo para quem precisa de você, laranja para quem trabalha, vermelho para erro, cinza para pausa e concluída). A forma diz o estado sem a cor.
- **Nomes dos estados:**
  - "Trabalhando" substitui "Ativa" e "Em pausa" substitui "Ociosa", só no texto da tela; os ids (`active`, `idle`, `blocked`) não mudam;
  - "Precisa de você", "Concluída", "Com erro" e "Abandonada" ficam;
  - a frase amigável ("Iris está escrevendo os testes") fica no texto de apoio, nunca no rótulo.
- **Cor de agente.** Quatro cores (violeta, azul, verde-azulado e índigo), com texto e fundo por tema, só no monograma de um agente com nome. São identidade, nunca estado. O verde continua não sendo cor de sucesso (#700).
- **Laranja.**
  - Como preenchimento: só o logo e o botão Nova sessão.
  - Como traço (foco e progresso): `accentLine`, que no claro é o laranja 700 (`#ab5316`).
  - No escuro, o botão primário é `#e4e4e7`, um degrau abaixo do texto, para não brilhar mais que a pergunta.
- **O Mural se organiza por quem precisa de você:**
  1. cards só para quem espera;
  2. listas para quem trabalha, quem está em pausa e quem terminou;
  3. uma frase-resumo no topo.

## O que fica de fora

- **A logo não muda.** O ícone de app foi montado a partir dela e fica guardado no Design System.
- **Rotas, ids, regras de estado e a ordem do #245 não mudam.**
- **Responder pergunta pelo card** depende de rota nova e de emenda à 0003: #757.
- **O nome do agente no Mural** é dado novo no `/api/wall`: #756.

## Consequências

- **Teste de tokens:** `test/tokens.test.mjs` passa a conferir a pilha do sistema, e não mais Poppins e JetBrains Mono, e cada papel novo nas superfícies onde é usado.
- **Tokens** (`docs/brand/tokens.json`):
  - raios em `radius` (`card`, `control`, `tag`, `segment`, `segmentItem`, `full`) e cores de agente em `agent` (`violet`, `blue`, `teal`, `indigo`, cada uma com texto e fundo por tema);
  - nos dois temas, os papéis novos `subtle`, `sidebar`, `segment`, `track`, `avatar`, `primary`, `onPrimary`, `accentLine` e `borderControl`; `text`, `muted` e `border` mudam de valor;
  - `borderControl` é a borda de campo, caixa de seleção e botão sem fundo, para que o controle nunca dependa da `border`, que é só divisor. As telas de `packages/nucleo/ui` já seguem a regra desde o #749: campos, seletores, caixas de seleção e botões sem fundo (`.btn.outline` entre eles) usam `var(--border-control)`; divisores, cartões, tabelas, painéis, etiquetas e selos ficam na `border`. `test/ui-control-borders.test.mjs` falha se um controle voltar à `border`. O estado marcado ou definido desses controles usa `accentLine` (`var(--accent-line)`), que passa 3:1 nos dois temas; o laranja puro não passa sobre o claro. O anel de foco ainda é o laranja puro na maioria dos controles (2,55:1 sobre `bg` no claro) e passa a `accentLine` no #750 e no #751. Aplicar o redesign às telas fica no #750 e no #751;
  - `shadow.<tema>.float`, a sombra do que flutua, em grupo próprio para que `themes.*` continue todo em hex;
  - `status.active` e `status.waiting` ganham `border`, a borda decorativa da etiqueta do estado; os outros três não têm;
  - o ponto de "Precisa de você" no claro passa de `#664e04` a `#a87e00`;
  - sai o `typography.googleFonts`, e entram o título de tela (30px), o número herói (64px) e `tracking.title`.
- **`packages/marca`** passa a gerar `--radius-*`, `--agent-<cor>-text` e `-bg`, `--shadow-float` e as variáveis dos papéis novos.
- **Contraste, critério revisto** (vale nos dois temas):
  - texto passa 4,5:1 sobre as superfícies onde é usado;
  - ícone, traço e `borderControl` passam 3:1;
  - `border` é divisor e não é medido contra 3:1; nenhum controle usa só ela como borda, e o teste `test/ui-control-borders.test.mjs` confere isso nas telas;
  - a borda das etiquetas de estado é decorativa e fica fora da medida.
- **Exceções registradas** em `docs/design.md`, cada uma com o teste da troca:
  - `#ab5316` (o laranja como traço no claro; também `accentText` e `status.active.text` do claro) não é texto sobre `sidebar`, `segment`, `track` nem `avatar` (4,47:1, 4,24:1, 4,24:1 e 4,47:1); como traço passa;
  - `#f47720` no escuro (`accentText`, `accentLine`, `status.active.text`) não é texto sobre `track` (4,47:1); como traço passa;
  - `#f06463` (o texto de erro do escuro) não é texto sobre `track` nem `avatar` (4,00:1 e 4,30:1);
  - `subtle` do escuro não é texto sobre `track` (4,47:1);
  - `#a87e00` (o ponto de espera no claro) não é ícone sobre `segment` nem `track` (2,98:1); ali a contagem usa `#664e04`;
  - fora dessas, todo texto passa 4,5:1 sobre todo fundo, nos dois temas, e `test/tokens.test.mjs` confere a matriz inteira.
- **Testes de vocabulário e de classe do Mural** mudam junto com cada PR.
- **Wireframes antigos:** os do #245 que mostram "Ociosa" ficam como histórico, e a nota apontando para esta decisão não está nesta mudança: vem com o [#753](https://github.com/ahrenatechnology/ahrena-console/issues/753).

## Referências

- Protótipo e capturas: `docs/wireframes/`, seção do redesign (`redesign-*`).
- Design System: tokens, brandbook e componentes, guardados como artefato no claude.ai.
