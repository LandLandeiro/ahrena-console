# 0029 · Barra de seis itens fixos, modo Projeto e uma regra para "precisa de você"

- **Status:** proposta, para o Fernando decidir.
- **Data:** 2026-11-27
- **Base:** revisão de UI e UX de 27/11/2026 (documento fora do repositório: achados A1, A3, A4, M12 e a seção 4, do modo Projeto) e o protótipo da revisão (fora do repositório).
- **Emenda:** [0028](0028-console-visual-redesign.md), em dois pontos: "Sua vez" e a cor de agente.
- **Issues:** #760 (mapa de rótulos), #761 (contagem única), #762 (pop-up único, de onde nasce o Exibir), #754 (Exibir, modo e barra), #759 (telas), #766 (subtítulos)

## Contexto

- **Barra:** são 18 itens em 5 grupos, e 17 deles são vistas de 7 coisas:
  - Dashboard e Mural (2 viram 1);
  - Sessões, Histórico, Kanban e Feed (4 viram 1);
  - Analytics e Workflows (2 viram 1);
  - Kanban do projeto e Quadro do trabalho (2 viram 1);
  - Repositórios e Dev Console (2 viram 1);
  - Das sessões, ADR e PDR (3 viram 1);
  - Agent Config e Conexões (2 viram 1).
- **Nomes em inglês na tela:** Dashboard, Feed, Kanban, Analytics, Workflows, Dev Console e Agent Config ferem a regra da [0009](0009-english-internals.md) (pt-BR na tela).
- **"Precisa de você":** tem quatro contagens diferentes.
- **Público duplo:** quem é de produto vê o mesmo detalhe técnico que quem é dev.

## Decisão

1. **Barra de seis itens fixos no modo Dev (Agora 3 e Entrega 3), mais um por máquina e a Configuração no pé, sem perder nenhuma tela.** Com três máquinas, a barra chega a dez. O que se funde vira aba ou filtro, e a rota antiga continua abrindo. A fusão por dentro é uma issue própria, a abrir com o aceite desta decisão (achado A3 da revisão); até lá, a aba é um link para a rota que já existe, no topo da tela que a recebe, e o item da barra fica marcado em qualquer uma delas.

   | Grupo | Itens |
   | --- | --- |
   | Agora | Mural ao vivo · Sessões · Uso e custo |
   | Entrega | Quadro do trabalho · Repositórios · Decisões |
   | Máquinas | um item por máquina |
   | Menu da conta | Configuração (Configuração do Claude e Conexões, como abas) |

   O Dashboard some: o "precisa de você" fica no Mural, e os números vão para Uso e custo. Histórico, Kanban de sessões e Feed viram vistas de Sessões; Analytics vira Uso e custo, e Workflows, aba dela; Kanban do projeto, vista do Quadro; Dev Console, vista de Repositórios; ADR, PDR e Das sessões, abas de Decisões.
2. **Modo Projeto**, num botão ao lado do de tema ("Ver como Projeto" / "Ver como Dev"):
   - **o que ele é:** a soma do preset do Exibir (#754, campos), da coluna Projeto do mapa de rótulos (#760, vocabulário) e da barra de 5 itens (Mural ao vivo, Conversas, Quadro do trabalho, Decisões e Custo);
   - **onde fica a escolha:** junto com a do tema. Hoje o tema fica no `localStorage` do navegador (`docs/design.md`), e o modo e o Exibir ficam ali também; os três passam ao núcleo juntos, na issue do tema que se perde ao reabrir, ainda a abrir;
   - **a regra que não se quebra:** o que pede ação nunca some. Aprovação mostra "Ver o comando" antes do botão; máquina caída, conexão expirada e conversa quase cheia aparecem nos dois modos. No modo Projeto, o item de uma máquina que pede ação continua na barra enquanto durar o estado: Sem conexão, Acesso bloqueado, Versão diferente ou Sem configuração, com o ponto de estado, ou o núcleo desatualizado, com a seta. Parada por você e Atualizando não pedem ação e não entram. A faixa no Mural fica para depois.
3. **Uma regra para "precisa de você"** no núcleo (#761): pergunta, permissão, plano, erro e "Sua vez". "Sua vez" sai de "Em pausa" e entra em "Precisam de você" como linha, o que emenda a 0028.
4. **Cor de agente só com dois agentes ou mais na tela.** Com todas as linhas "C · Claude", a cor vira enfeite; emenda a 0028.
5. **Subtítulo só com estado** (#766): quanto, quem, o que mudou. Explicação de como a tela funciona sai.

## Alternativas consideradas

- **Modo Projeto como sistema paralelo, com telas próprias.** Recusada: dois lugares decidiriam o que aparece.
- **Manter os 18 itens e só traduzir os nomes.** Recusada: não resolve as vistas repetidas.

## Fica de fora

- Mudar rotas `/ui`: as rotas novas, se houver, são aliases. O app de desktop e as notificações abrem `/ui/sessions/<id>` e `/ui/machines/<id>`, que continuam iguais.
- Mudar regras de estado, ids ou a ordem do #245.

## Consequências

- **#759:** fica menor, porque não gasta trabalho em telas que viram abas.
- **#753:** passa a depender da #760 e da #761.
- **Testes:** os que conferem itens da barra e subtítulos mudam junto.
- **Modo e Exibir se perdem ao reabrir o app instalado:** no `localStorage` como o tema, herdam a perda dele (o `localStorage` é por origem e a porta muda a cada abertura, `docs/design.md`). Quem está no Projeto volta ao Dev ao reabrir, até a issue do tema que se perde.
