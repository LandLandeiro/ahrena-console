// "Exibir" (#754): the button of the Mural's header and its panel, drawn by the one popover of #762 (popover.js). Densidade is
// a segmented control, Mostrar a group of checkboxes; every change is stored (display.js) and `onChange(value)` lets the screen draw again.
// The keyboard: the focus goes to the chosen density, Tab cycles inside the panel, Esc closes it and the focus returns to the button.

import { el, icon } from './dom.js';
import { FIELDS, chooseDensity, getDisplay, setField } from './display.js';
import { openPopover, popoverFooter, segmented, trapFocus } from './popover.js';

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Confortável' },
  { value: 'compact', label: 'Compacto' },
];
const FIELD_LABELS = {
  agent: 'Agente',
  phrase: 'O que está fazendo',
  plan: 'Progresso do plano',
  machine: 'Máquina',
  model: 'Modelo e custo',
  usage: 'Uso da conversa',
  branch: 'Branch',
};

/** The button and its popover. `onChange(value)` runs after each choice, with the stored value. */
export function displayButton({ onChange = null } = {}) {
  const button = el('button', { type: 'button', class: 'btn outline', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, icon('settings'), 'Exibir');
  const root = el('span', { class: 'ns' }, button);
  let handle = null;

  function draw() {
    const now = getDisplay();
    const boxes = new Map();
    const checks = FIELDS.map((field) => {
      const input = el('input', { type: 'checkbox', 'data-field': field });
      input.checked = now.show[field];
      input.addEventListener('change', () => {
        setField(field, input.checked);
        onChange?.(getDisplay());
      });
      boxes.set(field, input);
      return el('label', { class: 'pop-check' }, input, el('span', {}, FIELD_LABELS[field]));
    });
    const density = segmented({
      label: 'Densidade',
      options: DENSITY_OPTIONS,
      value: now.density,
      field: 'density',
      onChange: (value) => {
        chooseDensity(value);
        const fresh = getDisplay();
        for (const [field, input] of boxes) input.checked = fresh.show[field];
        mark(density);
        onChange?.(fresh);
      },
    });
    const mark = (field) => {
      for (const r of field.querySelectorAll('[role="radio"]')) {
        if (r.getAttribute('aria-checked') === 'true') r.setAttribute('data-autofocus', '');
        else r.removeAttribute('data-autofocus');
      }
    };
    mark(density);
    return {
      content: [density, el('fieldset', { class: 'pop-field pop-checks' }, el('legend', { class: 'pop-label' }, 'Mostrar'), ...checks)],
      footer: popoverFooter({ cancel: { label: 'Fechar', onClick: () => handle?.close() } }),
    };
  }

  button.addEventListener('click', () => {
    if (handle?.isOpen()) return handle.close();
    const { content, footer } = draw();
    const mine = openPopover({ trigger: button, host: root, title: 'Exibir', content, footer, onClose: () => handle === mine && (handle = null) });
    handle = mine;
    trapFocus(mine.element);
  });
  return root;
}
