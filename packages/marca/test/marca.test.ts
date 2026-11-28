// Garante que os tokens gerados estão em dia com docs/brand/tokens.json e que o
// painel e o artefato leem as mesmas cores. Roda também a validação da marca
// (contraste AA, os 5 status, o laranja) de test/tokens.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import '../../../test/tokens.test.mjs'
import { gerar, gerarCss, gerarTs, lerTokens, SAIDAS } from '../src/gerar.ts'
import * as marca from '../gerado/marca.ts'
import * as marcaDoPainel from '../../../spikes/painel-teste/hooks/marca.ts'

const raiz = new URL('../../../', import.meta.url)
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), 'utf8')
const tokens = lerTokens()
const semNotas = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')))
const regenerar = 'rode `node packages/marca/src/gerar.ts` e faça commit do resultado'

test('cada saída gerada está em dia com o tokens.json', () => {
  for (const [caminho, esperado] of Object.entries(gerar(tokens))) {
    assert.equal(ler(caminho), esperado, `${caminho} está desatualizado: ${regenerar}`)
  }
})

test('todo plugin que usa a marca tem a mesma cópia do módulo', () => {
  const [principal, ...copias] = SAIDAS.ts
  for (const copia of copias) assert.equal(ler(copia), ler(principal!), `${copia} difere de ${principal}: ${regenerar}`)
  assert.deepEqual({ ...marcaDoPainel }, { ...marca })
})

test('mudar um token muda a saída', () => {
  const mexido = structuredClone(tokens)
  mexido.themes.light.bg = '#ffffff'
  assert.notEqual(gerarTs(mexido), gerarTs(tokens))
  assert.notEqual(gerarCss(mexido), gerarCss(tokens))
})

test('o módulo do painel traz as cores do tokens.json, em hex', () => {
  assert.equal(marca.paleta.orange['500'], '#f47720', 'o laranja não muda')
  for (const escala of Object.keys(marca.paleta) as (keyof typeof marca.paleta)[]) {
    assert.deepEqual(marca.paleta[escala], semNotas(tokens[escala]), escala)
  }
  assert.ok(!('purple' in marca.paleta) && !('pink' in marca.paleta), 'o roxo e o rosa antigo ficam de fora')
  assert.deepEqual(marca.ci, tokens.ci)
  for (const tema of ['dark', 'light'] as const) assert.deepEqual(marca.temas[tema], semNotas(tokens.themes[tema]))
  assert.deepEqual(marca.ordemStatus, tokens.status._ordem)
  for (const id of marca.ordemStatus) {
    const s = marca.status[id]
    const fonte = tokens.status[id]
    assert.deepEqual([s.label, s.glyph, s.color, s.dark, s.light], [fonte.label, fonte.glyph, fonte.color, fonte.dark, fonte.light], id)
  }
  assert.equal(marca.tipografia.mono, tokens.typography.mono)
  assert.equal(marca.tipografia.sans, tokens.typography.sans)
  assert.ok(!('googleFonts' in marca.tipografia))
})

// Lê as variáveis de um bloco do CSS gerado.
function bloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(`${seletor} {`)
  assert.ok(inicio >= 0, `falta o bloco ${seletor}`)
  const corpo = css.slice(inicio, css.indexOf('}', inicio))
  return Object.fromEntries([...corpo.matchAll(/--([\w-]+): ([^;]+);/g)].map(m => [m[1], m[2]]))
}

test('o CSS do artefato: escuro no :root, claro por prefers-color-scheme e por data-theme', () => {
  const css = ler('packages/marca/gerado/marca.css')
  const raizCss = bloco(css, ':root')
  const peloSistema = bloco(css, ':root:not([data-theme="dark"])')
  const fixado = bloco(css, ':root[data-theme="light"]')
  assert.match(css, /@media \(prefers-color-scheme: light\) \{\n {2}:root:not\(\[data-theme="dark"\]\)/)
  const papel = (k: string) => k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
  for (const [k, cor] of Object.entries(semNotas(tokens.themes.dark))) assert.equal(raizCss[papel(k)], cor, `--${papel(k)} no escuro`)
  for (const [k, cor] of Object.entries(semNotas(tokens.themes.light))) {
    assert.equal(peloSistema[papel(k)], cor, `--${papel(k)} no claro pelo sistema`)
    assert.equal(fixado[papel(k)], cor, `--${papel(k)} no claro fixado`)
  }
  assert.deepEqual(peloSistema, fixado, 'os dois blocos do claro são iguais')
  for (const id of tokens.status._ordem) {
    assert.equal(raizCss[`status-${id}`], tokens.status[id].color)
    for (const p of Object.keys(tokens.status[id].dark)) {
      assert.equal(raizCss[`status-${id}-${p}`], tokens.status[id].dark[p], `${id} ${p} no escuro`)
      assert.equal(fixado[`status-${id}-${p}`], tokens.status[id].light[p], `${id} ${p} no claro`)
    }
  }
  assert.equal(raizCss['orange-500'], '#f47720')
  assert.equal(raizCss['font-sans'], tokens.typography.sans)
  assert.equal(raizCss['font-mono'], tokens.typography.mono)
  assert.equal(raizCss['text-title'], '30px')
  assert.equal(raizCss['text-hero'], '64px')
  assert.equal(raizCss['tracking-title'], '-0.02em')
  assert.doesNotMatch(css, /googleapis|@font-face|https?:/, 'o CSS não carrega fonte de fora')
})

test('o painel de teste não fixa à mão nenhuma cor que já está na marca', () => {
  const fonte = ler('spikes/painel-teste/hooks/register.tsx')
  assert.match(fonte, /from '\.\/marca'/, 'o painel importa o módulo gerado')
  const daMarca = new Set(Object.values(marca.paleta).flatMap(escala => Object.values(escala)).map(c => c.toLowerCase()))
  const fixas = [...fonte.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0].toLowerCase())
  for (const cor of fixas) assert.ok(!daMarca.has(cor), `register.tsx fixa ${cor}, que já está no módulo da marca`)
})

// #749: the radius scale, the agent colours, the float shadow and the status borders reach the CSS and the module.
const cssVar = (name: string) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

test('the CSS has the radius scale as --radius-*, the same in every theme', () => {
  const css = ler('packages/marca/gerado/marca.css')
  const raizCss = bloco(css, ':root')
  const names = Object.keys(semNotas(tokens.radius))
  assert.deepEqual(names.map(cssVar), ['card', 'control', 'tag', 'segment', 'segment-item', 'full'])
  for (const name of names) assert.equal(raizCss[`radius-${cssVar(name)}`], tokens.radius[name], `--radius-${cssVar(name)}`)
  const claro = bloco(css, ':root[data-theme="light"]')
  assert.ok(!Object.keys(claro).some(k => k.startsWith('radius-')), 'the radius is not theme-dependent')
  assert.deepEqual(marca.radius, semNotas(tokens.radius))
})

test('the CSS has each agent colour and the float shadow per theme, and the module carries them', () => {
  const css = ler('packages/marca/gerado/marca.css')
  const escuro = bloco(css, ':root')
  const claro = bloco(css, ':root[data-theme="light"]')
  assert.equal(escuro['shadow-float'], tokens.shadow.dark.float)
  assert.equal(claro['shadow-float'], tokens.shadow.light.float)
  for (const cor of Object.keys(semNotas(tokens.agent))) {
    for (const papel of ['text', 'bg']) {
      assert.equal(escuro[`agent-${cor}-${papel}`], tokens.agent[cor].dark[papel], `--agent-${cor}-${papel} no escuro`)
      assert.equal(claro[`agent-${cor}-${papel}`], tokens.agent[cor].light[papel], `--agent-${cor}-${papel} no claro`)
    }
  }
  assert.deepEqual(marca.agent, semNotas(tokens.agent))
  assert.deepEqual(marca.shadow, semNotas(tokens.shadow))
})

test('the new theme roles and the two status borders exist in both themes of the CSS', () => {
  const css = ler('packages/marca/gerado/marca.css')
  const escuro = bloco(css, ':root')
  const claro = bloco(css, ':root[data-theme="light"]')
  for (const papel of ['subtle', 'sidebar', 'segment', 'track', 'avatar', 'primary', 'on-primary', 'accent-line', 'border-control']) {
    assert.ok(papel in escuro && papel in claro, `--${papel} falta em um dos temas`)
  }
  for (const id of ['active', 'waiting']) {
    assert.equal(escuro[`status-${id}-border`], tokens.status[id].dark.border)
    assert.equal(claro[`status-${id}-border`], tokens.status[id].light.border)
  }
  for (const id of ['completed', 'error', 'abandoned']) assert.ok(!(`status-${id}-border` in escuro), `${id} has no border`)
})

// #749: the motion tokens reach the CSS; reduced motion zeroes the three durations and leaves the easings alone.
test('the CSS has the five motion variables in :root and the module carries them', () => {
  const css = ler('packages/marca/gerado/marca.css')
  const rootVars = bloco(css, ':root')
  assert.deepEqual(
    Object.fromEntries(Object.entries(rootVars).filter(([k]) => k.startsWith('motion-') || k.startsWith('ease-'))),
    { 'motion-fast': '120ms', 'motion-base': '180ms', 'motion-move': '220ms', 'ease-out': 'cubic-bezier(0.2, 0, 0, 1)', 'ease-in': 'cubic-bezier(0.4, 0, 1, 1)' },
  )
  assert.deepEqual(marca.motion, semNotas(tokens.motion))
  assert.ok(!Object.keys(bloco(css, ':root[data-theme="light"]')).some(k => k.startsWith('motion-') || k.startsWith('ease-')), 'motion is not theme-dependent')
})

test('reduced motion zeroes exactly the three durations, after every theme block', () => {
  const css = ler('packages/marca/gerado/marca.css')
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)')
  assert.ok(start >= 0, 'missing prefers-reduced-motion block')
  const reduced = css.slice(start)
  assert.deepEqual(bloco(reduced, ':root'), { 'motion-fast': '0ms', 'motion-base': '0ms', 'motion-move': '0ms' })
  assert.ok(start > css.indexOf(':root[data-theme="light"] {'), 'the reduced-motion block comes after the light theme blocks, so it wins in both themes')
  assert.ok(start > css.indexOf('@media (prefers-color-scheme: light)'))
})
