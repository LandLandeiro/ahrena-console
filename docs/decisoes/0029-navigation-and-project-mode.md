# 0029 · Navegação em 10 itens, modo Projeto e uma regra para "precisa de você"

- **Status:** proposta, para o Fernando decidir.
- **Data:** 2026-11-27
- **Base:** revisão de UI e UX de 27/11/2026 (documento fora do repositório: achados A1, A3, A4, M12 e a seção 4, do modo Projeto) e o protótipo (https://claude.ai/artifact/E2fe861uXseQ9xnTcWwds1).
- **Emenda:** [0028](0028-console-visual-redesign.md), em dois pontos: "Sua vez" e a cor de agente.
- **Issues:** #760 (mapa de rótulos), #761 (contagem única), #762 (pop-up único, de onde nasce o Exibir), #754 (Exibir, modo e barra), #759 (telas)

## Contexto

- **Barra:** são 18 itens em 5 grupos, e cerca de 8 são vistas da mesma coisa:
  - dois "agora" (Dashboard e Mural);
  - três listas de sessões (Sessões, Histórico e Kanban);
  - três quadros (Kanban, Kanban do projeto e Quadro do trabalho);
  - três itens de decisão.
- **Nomes em inglês na tela:** Dashboard, Feed, Kanban, Analytics, Workflows, Dev Console e Agent Config ferem a regra da 0009 (pt-BR na tela).
- **"Precisa de você":** tem quatro contagens diferentes.
- **Público duplo:** quem é de produto vê o mesmo detalhe técnico que quem é dev.

## Decisão proposta

1. **Barra de 10 itens no modo Dev, sem perder nenhuma tela.** O que se funde vira aba ou filtro, e a rota antiga continua abrindo. Enquanto as telas não se fundem por dentro (#759), a aba é um link para a rota que já existe, no topo da tela que a recebe, e o item da barra fica marcado em qualquer uma delas.

   | Grupo | Itens |
   | --- | --- |
   | Agora | Mural ao vivo · Sessões · Uso e custo |
   | Entrega | Quadro do trabalho · Repositórios · Decisões |
   | Máquinas | um item por máquina |
   | Menu da conta | Configuração (Configuração do Claude e Conexões, como abas) |

   O Dashboard some: o "precisa de você" fica no Mural, e os números vão para Uso e custo. Histórico, Kanban de sessões e Feed viram vistas de Sessões; Workflows vira aba de Uso e custo; Kanban do projeto, vista do Quadro; Dev Console, vista de Repositórios; ADR, PDR e Das sessões, abas de Decisões.
2. **Modo Projeto**, num botão ao lado do de tema ("Ver como Projeto" / "Ver como Dev"):
   - **o que ele é:** a soma do preset do Exibir (#754, campos), da coluna Projeto do mapa de rótulos (#760, vocabulário) e da barra de 5 itens (Mural ao vivo, Conversas, Quadro do trabalho, Decisões e Custo);
   - **onde fica a escolha:** junto com a do tema. Hoje o tema fica no `localStorage` do navegador (`docs/design.md`), e o modo e o Exibir ficam ali também; os três passam ao núcleo juntos, na issue do tema que se perde;
   - **a regra que não se quebra:** o que pede ação nunca some. Aprovação mostra "Ver o comando" antes do botão; máquina caída, conexão expirada e conversa quase cheia aparecem nos dois modos.
3. **Uma regra para "precisa de você"** no núcleo (#761): pergunta, permissão, plano, erro e "Sua vez". "Sua vez" sai de "Em pausa" e entra em "Precisam de você" como linha, o que emenda a 0028.
4. **Cor de agente só com dois agentes ou mais na tela.** Com todas as linhas "C · Claude", a cor vira enfeite; emenda a 0028.
5. **Subtítulo só com estado** (#766): quanto, quem, o que mudou. Explicação de como a tela funciona sai.

## Fica de fora

- Mudar rotas `/ui`: as rotas novas, se houver, são aliases. O app de desktop e as notificações abrem `/ui/sessions/<id>` e `/ui/machines/<id>`, que continuam iguais.
- Mudar regras de estado, ids ou a ordem do #245.

## Consequências

- **#759:** fica menor, porque não gasta trabalho em telas que viram abas.
- **#753:** passa a depender da #760 e da #761.
- **Testes:** os que conferem itens da barra e subtítulos mudam junto.
