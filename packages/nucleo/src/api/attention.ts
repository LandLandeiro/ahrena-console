// The attention levels (issues #140 and #761): who needs the person. One rule decides it, `needsYou`
// (src/states/needs-you.ts): what blocks the session until the person acts, and "Sua vez", the turn that
// ended and awaits the answer. Esc and a new session at the prompt await nobody.
//
// With confidence, from the hooks and the transcript:
// - permission: waiting on `notification` (Notification `permission_prompt`);
// - question with options: Notification `elicitation_dialog`, or an AskUserQuestion with no answer;
// - plan to approve: an ExitPlanMode with no answer;
// - decision asked: the turn's closing in the Desktop (`wrap_up`) with `ask` or `blocked`;
// - error: the session stopped on an error.
// The turn that ended ("Sua vez") needs the person too, with the lowest urgency: a row, not a card.
// Esc and a new session at the prompt are idle: no highlight.
// An agent text ending in "?" does not count: it is the natural back-and-forth.

import type { Agent, AwaitingReason, Session, SessionEvent } from '../model.ts';
import { readInbox, type InboxReading } from '../states/inbox.ts';
import { NEEDS_YOU_REASONS, needsYou } from '../states/needs-you.ts';
import { isBlockingNotification } from '../states/rules.ts';
import type { ResumoDosEventos } from './summary.ts';

export type NivelDeAtencao = 'precisa' | 'sua-vez';
export type MotivoDaAtencao = 'permissao' | 'pergunta' | 'plano' | 'decisao' | 'erro' | 'sua-vez' | 'interrompida' | 'no-prompt';

export function atencaoDe(inbox: Pick<InboxReading, 'status' | 'state' | 'reason'>, r: Pick<ResumoDosEventos, 'pendentes' | 'pedidoNoFechamento' | 'ultimoPedido'> | null): { nivel: NivelDeAtencao; porque: MotivoDaAtencao } {
  const porque = reasonOf(inbox, r);
  return { nivel: needsYouOf(porque) ? 'precisa' : 'sua-vez', porque };
}

/** The `nivel` follows the one rule (`needsYou`): `precisa` for the reasons it names, `sua-vez` only for Esc and the prompt (#761). */
const needsYouOf = (porque: MotivoDaAtencao): boolean => needsYou(REASON_OF[porque]);

function reasonOf(inbox: Pick<InboxReading, 'status' | 'state' | 'reason'>, r: Pick<ResumoDosEventos, 'pendentes' | 'pedidoNoFechamento' | 'ultimoPedido'> | null): MotivoDaAtencao {
  if (inbox.state === 'error' || inbox.status === 'error') return 'erro';
  const pendente = r?.pendentes.at(-1)?.ferramenta ?? null;
  if (inbox.reason === 'notification') {
    const pergunta = r?.ultimoPedido?.tipo === 'elicitation_dialog' || pendente === 'AskUserQuestion';
    return pergunta ? 'pergunta' : pendente === 'ExitPlanMode' ? 'plano' : 'permissao';
  }
  if (pendente) return pendente === 'ExitPlanMode' ? 'plano' : 'pergunta';
  if (inbox.reason === 'stop' && r?.pedidoNoFechamento) return 'decisao';
  if (inbox.reason === 'interrupted') return 'interrompida';
  if (inbox.reason === 'session_start') return 'no-prompt';
  return 'sua-vez';
}

// ---------------------------------------------------------------------------------------------
// #245: the English attention every /ui route answers, one shape for every screen.
//
// `attention: { level, reason } | null`:
// - `level` `blocked` ("Precisa de você" on screen): `needsYou(reason)`, the one rule (#761): the session
//   is stuck until the person acts (`permission`, `question`, `plan`, `decision`, `error`) or the turn
//   ended and awaits the answer (`turn_ended`, "Sua vez", the lowest urgency); the `precisa` level above;
// - `level` `idle` ("Ociosa" on screen): nothing awaits the person, with the reason `interrupted` (Esc)
//   or `first_prompt` (a new session at the prompt); the `sua-vez` level above;
// - `null`: the session is not waiting on you and not in error (working, delegating, in background,
//   completed, abandoned).
// The reason values are the MCP's (`McpAttentionReason`, src/mcp/fleet.ts), so a screen, the tray and an
// agent name a reason alike. Everything comes from `atencaoDe`: no route re-derives the split.
// ---------------------------------------------------------------------------------------------

export type SessionAttentionLevel = 'blocked' | 'idle';
/** The reasons of level `blocked`: the ones `needsYou` names (#761), "Sua vez" (`turn_ended`) included. */
export const BLOCKED_REASONS = NEEDS_YOU_REASONS;
/** The reasons of level `idle`: Esc and a new session at the prompt. The union keeps the MCP schema's enum order. */
export const IDLE_REASONS = ['interrupted', 'first_prompt'] as const;
export const SESSION_ATTENTION_REASONS = [...BLOCKED_REASONS, ...IDLE_REASONS] as const;
export type SessionAttentionReason = (typeof SESSION_ATTENTION_REASONS)[number];

export interface SessionAttention {
  level: SessionAttentionLevel;
  reason: SessionAttentionReason;
}

const REASON_OF: Readonly<Record<MotivoDaAtencao, SessionAttentionReason>> = {
  permissao: 'permission',
  pergunta: 'question',
  plano: 'plan',
  decisao: 'decision',
  erro: 'error',
  'sua-vez': 'turn_ended',
  interrompida: 'interrupted',
  'no-prompt': 'first_prompt',
};

/** `atencaoDe` in English. */
export function englishAttention({ porque }: { nivel?: NivelDeAtencao; porque: MotivoDaAtencao }): SessionAttention {
  const reason = REASON_OF[porque];
  return { level: needsYou(reason) ? 'blocked' : 'idle', reason };
}

/** The attention of a session from its inbox reading and event summary; `null` when it does not need you. */
export function sessionAttention(
  inbox: Pick<InboxReading, 'status' | 'state' | 'reason' | 'needsYou'>,
  r: Pick<ResumoDosEventos, 'pendentes' | 'pedidoNoFechamento' | 'ultimoPedido'> | null,
): SessionAttention | null {
  return inbox.needsYou ? englishAttention(atencaoDe(inbox, r)) : null;
}

/**
 * The attention of a stored session. Only a waiting session reads its event summary (through the
 * caller's cache): an error needs none, and the rest have no attention.
 */
export async function readSessionAttention(
  session: Session,
  agents: readonly Agent[],
  summaries: { ler(sessionId: string, updatedAt: string): Promise<ResumoDosEventos> },
): Promise<SessionAttention | null> {
  const inbox = readInbox(session, agents);
  if (!inbox.needsYou) return null;
  const r = inbox.state === 'error' ? null : await summaries.ler(session.id, session.updatedAt);
  return sessionAttention(inbox, r);
}

/**
 * The attention one event stands for, for the activity feed: the session state that event alone would
 * leave, read by the same `atencaoDe`. A blocking request (the `BLOCKING_NOTIFICATIONS` of the state
 * machine, or a `PermissionRequest`) is blocked; the end of a turn, an idle notification and Esc are idle;
 * an API error is blocked; every other event has none.
 */
export function eventAttention(e: Pick<SessionEvent, 'type' | 'data' | 'summary'>): SessionAttention | null {
  const data = e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : {};
  const waiting = (reason: AwaitingReason) => ({ status: 'waiting' as const, state: 'waiting' as const, reason, needsYou: true });
  const asked = (notificationType: string | null) => ({ pendentes: [], pedidoNoFechamento: null, ultimoPedido: { texto: e.summary, tipo: notificationType, em: '' } });
  switch (e.type) {
    case 'Notification': {
      const notificationType = typeof data.notification_type === 'string' ? data.notification_type : null;
      return sessionAttention(waiting(isBlockingNotification(notificationType, e.summary, data) ? 'notification' : 'stop'), asked(notificationType));
    }
    case 'PermissionRequest':
      return sessionAttention(waiting('notification'), asked('permission_prompt'));
    case 'Stop':
      return sessionAttention(waiting('stop'), null);
    case 'Interrupted':
      return sessionAttention(waiting('interrupted'), null);
    case 'APIError':
    case 'StopFailure':
      return sessionAttention({ status: 'error', state: 'error', reason: null, needsYou: true }, null);
    default:
      return null;
  }
}
