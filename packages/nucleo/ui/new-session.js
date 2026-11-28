// "Nova sessão": the header button of the Dashboard, the wall and Sessions that starts a new Claude Code
// session, in the Claude Desktop or in a terminal (src/api/new-session.ts).
//
// The button opens the one popover of the /ui (popover.js): the folder (the ones this machine's sessions ran in, from
// `GET /api/new-session/folders`, read on each opening) as the first field, "Abrir em" as a segmented control
// (Claude Desktop | Terminal, remembered) and a primary that names the verb and the destination, "Abrir no Terminal".
// The primary is `write('/api/new-session', { folder, target })`; beside it come "Abrindo…", the success (it stays
// open: the person closes it) or the core's pt-BR error with "Copiar comando". The answer of the core carries no
// session id (`{ ok, opened }`), so the success has no "Ir para a sessão" link. The link to the session needs the core to
// return the id of the opened session; #762 leaves that to an issue not opened yet. The styles are in `popover.css` and `new-session.css`.

import { el, icon } from './dom.js';
import { read as defaultRead, write as defaultWrite } from './api.js';
import { OPEN_IN_KEY, OPEN_TARGETS, destinationLabel, openPopover, popoverContext, popoverFooter, rememberedTarget, segmented } from './popover.js';

export const NEW_SESSION_ROUTE = '/api/new-session';
export const FOLDERS_ROUTE = '/api/new-session/folders';

const OPENED_TEXT = { desktop: 'Aberta no Claude Desktop', terminal: 'Aberta no Terminal' };
const COPY_ONLY = 'Aqui só dá para copiar o comando';

/** The state after an answer, without DOM: `{ kind: 'ok', text }` or `{ kind: 'fail', text, command }`. */
export function stateOfAnswer(answer, failure = null) {
  if (failure) {
    const command = typeof failure.body?.command === 'string' && failure.body.command ? failure.body.command : null;
    return { kind: 'fail', text: failure.message || 'Não deu para abrir a sessão nova.', command };
  }
  return { kind: 'ok', text: OPENED_TEXT[answer?.opened] ?? 'Aberta' };
}

/** The button and its popover. `read`/`write` swap the transport (tests, the screen's `ctx`). */
export function newSessionButton({ read = defaultRead, write = defaultWrite } = {}) {
  const button = el('button', { type: 'button', class: 'btn filled ns-button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, icon('plus'), 'Nova sessão');
  const root = el('span', { class: 'ns' }, button);
  let handle = null;
  let busy = false;

  const note = (text, cls = 'pop-note') => el('p', { class: cls }, text);
  const closeFooter = () => popoverFooter({ cancel: { label: 'Fechar', onClick: () => handle?.close() } });

  async function open() {
    const mine = openPopover({ trigger: button, host: root, title: 'Nova sessão', content: [note('Lendo as pastas…')], onClose: () => handle === mine && (handle = null) });
    handle = mine;
    let data;
    try {
      data = await read(FOLDERS_ROUTE);
    } catch {
      return void (handle === mine && mine.setContent([note('Não deu para ler as pastas.', 'pop-fail')], closeFooter()));
    }
    if (handle === mine) draw(mine, data);
  }

  function draw(pop, { folders = [], targets = {} } = {}) {
    if (!folders.length) return pop.setContent([note('Nenhuma pasta conhecida ainda: abra uma sessão do Claude Code numa pasta e ela aparece aqui.')], closeFooter());
    const select = el('select', { class: 'ns-folder', 'aria-label': 'Pasta', 'data-autofocus': '' });
    for (const f of folders) select.append(el('option', { value: f.path, title: f.path }, f.name));
    let chosen = folders[0].path;
    let target = rememberedTarget();
    // The left-to-right mark keeps the leading "/" in place under the right-to-left ellipsis.
    const path = el('span', { class: 'pop-path', title: chosen }, `‎${chosen}`);
    const status = el('div', { class: 'pop-status', role: 'status', 'aria-live': 'polite' });
    const foot = popoverFooter({ cancel: { onClick: () => pop.close() }, primary: { label: destinationLabel('Abrir', target), onClick: () => start() } });
    const primary = foot.querySelector('.btn.primary');
    const cancel = foot.querySelector('.btn.outline');
    // Without its launcher the core answers 501 with the command; the primary still offers that (#762).
    const hint = () => (targets[target] === false ? primary.setAttribute('title', COPY_ONLY) : primary.removeAttribute('title'));
    hint();
    select.addEventListener('change', () => {
      chosen = select.value;
      path.textContent = `‎${chosen}`;
      path.setAttribute('title', chosen);
    });
    const where = segmented({
      label: 'Abrir em',
      options: OPEN_TARGETS,
      value: target,
      storageKey: OPEN_IN_KEY,
      onChange: (next) => {
        target = next;
        primary.textContent = destinationLabel('Abrir', target);
        hint();
      },
    });
    const context = popoverContext([
      { label: 'Pasta', value: el('span', { class: 'pop-select' }, select, icon('chevron-down')), field: 'folder' },
      { label: 'Caminho', value: path, mono: true, field: 'path' },
    ]);
    pop.setContent([context, where, status], foot);

    async function start() {
      if (busy) return;
      busy = true;
      primary.setAttribute('aria-busy', 'true');
      primary.setAttribute('aria-disabled', 'true');
      status.replaceChildren(el('span', { class: 'ns-busy' }, 'Abrindo…'));
      let state;
      try {
        state = stateOfAnswer(await write(NEW_SESSION_ROUTE, { folder: chosen, target }));
      } catch (e) {
        state = stateOfAnswer(null, e instanceof Error ? e : new Error(String(e)));
      }
      busy = false;
      primary.removeAttribute('aria-busy');
      primary.removeAttribute('aria-disabled');
      status.replaceChildren(...[el('span', { class: `pop-${state.kind}` }, state.text), state.kind === 'fail' && state.command ? copyButton(state.command) : null].filter(Boolean));
      // The success stays until the person closes it: the only action left on the left is to close (#762).
      if (state.kind === 'ok') cancel.textContent = 'Fechar';
    }
  }

  button.addEventListener('click', () => (handle ? handle.close() : open()));
  return root;
}

/** "Copiar comando": `cd '<pasta>' && claude` to the clipboard. */
function copyButton(command) {
  const b = el('button', { type: 'button', class: 'btn outline ns-copy', title: command }, icon('copy'), 'Copiar comando');
  b.addEventListener('click', async () => {
    let done;
    try {
      await navigator.clipboard.writeText(command);
      done = 'Copiado';
    } catch {
      done = 'Não deu para copiar';
    }
    b.replaceChildren(icon('copy'), done);
  });
  return b;
}
