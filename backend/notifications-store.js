const fs = require('fs');
const path = require('path');
const { buildOpenClawState, relativeLabel } = require('./openclaw-state');

const STORE_PATH = '/root/.openclaw/projects/mission-control/data/notifications-state.json';
const DEFAULT_LIMIT = 50;
const ATTENTION_LIMIT = 5;

function isoNow() {
  return new Date().toISOString();
}

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function createEmptyStore() {
  return {
    version: 1,
    updatedAt: isoNow(),
    readAtById: {},
  };
}

function loadStore() {
  const store = readJsonSafe(STORE_PATH);
  if (!store || typeof store !== 'object') return createEmptyStore();
  if (!store.readAtById || typeof store.readAtById !== 'object') store.readAtById = {};
  if (!store.version) store.version = 1;
  return store;
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  store.updatedAt = isoNow();
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function normalizeAgentId(value) {
  return String(value || '').trim().toLowerCase();
}

function buildAgentLabelMap(state) {
  const map = new Map();
  for (const agent of Array.isArray(state?.agents) ? state.agents : []) {
    const agentId = normalizeAgentId(agent?.key || agent?.id || '');
    if (!agentId) continue;
    map.set(agentId, agent?.name || agentId);
  }
  return map;
}

function excerpt(text, max = 160) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function classifyLevel(type, severity, text) {
  const normalizedType = String(type || '').toLowerCase();
  const normalizedText = String(text || '').toLowerCase();
  if (normalizedType === 'dispatch_failed' || normalizedType === 'error') return 'critical';
  if (/fail|error|critical/.test(normalizedText)) return 'critical';
  if (normalizedType === 'reopened' || normalizedType === 'follow_up_requested') return 'warning';
  if (normalizedType === 'dispatch_requested' || normalizedType === 'created') return 'info';
  if (normalizedType === 'completed' || normalizedType === 'assistant_message') return 'info';
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function classifyOperationalTitle(message) {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('gateway') || normalized.includes('sessions_list')) return 'Gateway sem resposta';
  if (normalized.includes('dispatch')) return 'Dispatch falhou';
  if (normalized.includes('session') || normalized.includes('sess')) return 'Sessão com erro';
  if (normalized.includes('agent') || normalized.includes('agente')) return 'Agente com erro';
  return 'Erro operacional';
}

function signalId(prefix, value, index = 0) {
  const safe = String(value || `${prefix}:${index}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .slice(0, 180);
  return `attention:${prefix}:${safe || index}`;
}

function isActionableNotification(notification) {
  const kind = String(notification?.kind || '').toLowerCase();
  const title = String(notification?.title || '');
  const body = String(notification?.body || '');
  const text = `${title} ${body}`.toLowerCase();
  if (notification?.level === 'critical') return true;
  if (['dispatch_failed', 'error', 'failed'].includes(kind)) return true;
  if (/(dispatch falh|falha|failed|error|erro|critical|gateway sem resposta|sem resposta)/i.test(text)) return true;
  return false;
}

function buildSignalFromNotification(notification) {
  const kind = String(notification?.kind || '').toLowerCase();
  const title = kind === 'dispatch_failed'
    ? 'Dispatch falhou'
    : classifyOperationalTitle(`${notification?.title || ''} ${notification?.body || ''}`);
  return {
    id: `attention:${notification.id}`,
    title,
    body: notification.body || notification.title || 'Evento operacional requer atenção.',
    level: notification.level === 'critical' ? 'critical' : 'warning',
    category: kind || 'activity',
    time: notification.time,
    timestamp: notification.timestamp || null,
    source: notification.source || notification.agent || 'sistema',
    kind: notification.kind || null,
    sessionKey: notification.sessionKey || null,
    sessionId: notification.sessionId || null,
    runId: notification.runId || null,
  };
}

function buildAttentionSignalsFromState(state, notifications, limit = ATTENTION_LIMIT) {
  const signals = [];
  const now = Date.now();

  for (const [index, error] of (Array.isArray(state?.errors) ? state.errors : []).entries()) {
    signals.push({
      id: signalId('state-error', error, index),
      title: classifyOperationalTitle(error),
      body: excerpt(error, 180) || 'Erro real reportado pelo Mission Control.',
      level: 'critical',
      category: 'system',
      time: relativeLabel(state?.generatedAt, now),
      timestamp: state?.generatedAt || isoNow(),
      source: 'sistema',
      kind: 'state_error',
      sessionKey: null,
      sessionId: null,
      runId: null,
    });
  }

  for (const [index, warning] of (Array.isArray(state?.warnings) ? state.warnings : []).entries()) {
    const text = String(warning || '');
    if (!/(gateway|token|session|agent|config|unavailable|missing|erro|error|falha|fail)/i.test(text)) continue;
    signals.push({
      id: signalId('state-warning', warning, index),
      title: /token/i.test(text) ? 'Gateway sem token' : classifyOperationalTitle(text),
      body: excerpt(text, 180) || 'Aviso operacional real reportado pelo Mission Control.',
      level: 'warning',
      category: 'system',
      time: relativeLabel(state?.generatedAt, now),
      timestamp: state?.generatedAt || isoNow(),
      source: 'sistema',
      kind: 'state_warning',
      sessionKey: null,
      sessionId: null,
      runId: null,
    });
  }

  for (const notification of notifications || []) {
    if (!isActionableNotification(notification)) continue;
    signals.push(buildSignalFromNotification(notification));
  }

  for (const session of Array.isArray(state?.sessions) ? state.sessions : []) {
    const status = String(session?.status || session?.executionState || '').toLowerCase();
    const hasSessionRef = Boolean(session?.sessionId || session?.sessionKey);
    const linkedTaskIds = Array.isArray(session?.linkedTaskIds) ? session.linkedTaskIds.filter(Boolean) : [];
    const finished = ['completed', 'done', 'complete'].includes(status) || session?.executionState === 'completed';
    if (!hasSessionRef || !finished || session?.finalResult || linkedTaskIds.length === 0) continue;
    const timestamp = session.updatedAt || session.endedAt || session.startedAt || state?.generatedAt || isoNow();
    signals.push({
      id: signalId('session-no-result', `${session.sessionId || session.sessionKey}:${linkedTaskIds.join(',')}`),
      title: 'Sessão sem conclusão',
      body: `Sessão ligada a task sem resposta final capturada (${linkedTaskIds.slice(0, 2).join(', ')}).`,
      level: 'warning',
      category: 'session',
      time: relativeLabel(timestamp, now),
      timestamp,
      source: session.agentId || 'sistema',
      kind: 'session_missing_final_result',
      sessionKey: session.sessionKey || null,
      sessionId: session.sessionId || null,
      runId: null,
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const signal of signals) {
    if (seen.has(signal.id)) continue;
    seen.add(signal.id);
    deduped.push(signal);
  }

  deduped.sort((a, b) => {
    const severity = { critical: 2, warning: 1, info: 0 };
    const severityDiff = (severity[b.level] || 0) - (severity[a.level] || 0);
    if (severityDiff) return severityDiff;
    return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  });

  return deduped.slice(0, limit);
}

function isRelevantActivity(entry) {
  const type = String(entry?.type || '').toLowerCase();
  const text = String(entry?.text || '');
  if (!text) return false;
  if (type === 'user_message') return false;
  if (['created', 'dispatch_requested', 'dispatch_failed', 'completed', 'reopened', 'follow_up_requested', 'assistant_message'].includes(type)) {
    return true;
  }
  if (['error', 'warning'].includes(type)) return true;
  if (type === 'log') {
    return /(dispatch|session|agent|reply|ban|fail|error|warning|critical|task)/i.test(text);
  }
  return false;
}

function buildNotification(entry, labelMap, readAtById) {
  if (!isRelevantActivity(entry)) return null;
  const type = String(entry?.type || 'log').toLowerCase();
  const sourceId = normalizeAgentId(entry?.source || '');
  const agentLabel = sourceId && sourceId !== 'sistema'
    ? (labelMap.get(sourceId) || sourceId)
    : 'Sistema';
  const timestamp = entry?.timestamp || isoNow();
  const time = relativeLabel(timestamp, Date.now());
  let title = `Atividade de ${agentLabel}`;
  let body = excerpt(entry?.text || entry?.note || '', 160) || 'Sem detalhes adicionais';

  switch (type) {
    case 'created':
      title = sourceId && sourceId !== 'sistema'
        ? `Nova tarefa para ${agentLabel}`
        : 'Nova atividade registada';
      break;
    case 'dispatch_requested':
      title = sourceId && sourceId !== 'sistema'
        ? `Tarefa enviada a ${agentLabel}`
        : 'Dispatch solicitado';
      break;
    case 'dispatch_failed':
      title = sourceId && sourceId !== 'sistema'
        ? `Falha ao despachar para ${agentLabel}`
        : 'Falha de dispatch';
      break;
    case 'completed':
      title = sourceId && sourceId !== 'sistema'
        ? `Resposta recebida de ${agentLabel}`
        : 'Resposta recebida';
      break;
    case 'reopened':
      title = sourceId && sourceId !== 'sistema'
        ? `Tarefa reaberta para ${agentLabel}`
        : 'Tarefa reaberta';
      break;
    case 'follow_up_requested':
      title = sourceId && sourceId !== 'sistema'
        ? `Follow-up enviado a ${agentLabel}`
        : 'Follow-up solicitado';
      break;
    case 'assistant_message':
      title = sourceId && sourceId !== 'sistema'
        ? `Nova resposta de ${agentLabel}`
        : 'Nova resposta recebida';
      break;
    case 'error':
      title = 'Erro operacional';
      break;
    default:
      break;
  }

  const id = `activity:${entry.id || `${type}:${timestamp}:${sourceId || 'system'}`}`;
  return {
    id,
    title,
    body,
    level: classifyLevel(type, entry?.severity, entry?.text),
    agent: sourceId || 'sistema',
    time,
    timestamp,
    read: Boolean(readAtById?.[id]),
    kind: type,
    source: entry?.source || 'sistema',
    sessionKey: entry?.sessionKey || null,
    sessionId: entry?.sessionId || null,
    runId: entry?.runId || null,
  };
}

async function getNotificationsFeed({ fetchImpl, token, limit = DEFAULT_LIMIT } = {}) {
  const state = await buildOpenClawState({
    fetchImpl,
    token,
    activityLimit: Math.max(100, limit * 4),
    sessionLimit: 100,
  });

  const store = loadStore();
  const readAtById = store.readAtById || {};
  const labelMap = buildAgentLabelMap(state);
  const warnings = Array.isArray(state.warnings) ? [...state.warnings] : [];
  const errors = Array.isArray(state.errors) ? [...state.errors] : [];

  const items = [];
  const seen = new Set();
  for (const entry of Array.isArray(state.activity) ? state.activity : []) {
    const notification = buildNotification(entry, labelMap, readAtById);
    if (!notification) continue;
    if (seen.has(notification.id)) continue;
    seen.add(notification.id);
    items.push(notification);
  }

  items.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  const normalizedItems = items.slice(0, limit);
  const unreadCount = normalizedItems.filter((item) => !item.read).length;

  return {
    ok: true,
    collectedAt: state.generatedAt || isoNow(),
    source: 'openclaw-activity',
    warnings,
    errors,
    totalCount: items.length,
    unreadCount,
    items: normalizedItems,
    sources: state.sources || null,
  };
}

async function getAttentionSignals({ fetchImpl, token, limit = ATTENTION_LIMIT } = {}) {
  const feed = await getNotificationsFeed({
    fetchImpl,
    token,
    limit: Math.max(DEFAULT_LIMIT, Number(limit) * 10),
  });
  const state = await buildOpenClawState({
    fetchImpl,
    token,
    activityLimit: 100,
    sessionLimit: 100,
  });
  const signals = buildAttentionSignalsFromState(state, feed.items || [], Number(limit) || ATTENTION_LIMIT);

  return {
    ok: true,
    collectedAt: state.generatedAt || feed.collectedAt || isoNow(),
    source: 'openclaw-attention',
    totalCount: signals.length,
    items: signals,
    rules: [
      'state errors are critical',
      'operational warnings about gateway/token/session/agent/config are warning',
      'critical notifications and dispatch/error activity are actionable',
      'completed task-linked sessions without final result are warning',
    ],
    sources: state.sources || feed.sources || null,
  };
}

async function markNotificationsRead({ ids = [], all = false, fetchImpl, token, limit = DEFAULT_LIMIT } = {}) {
  const normalizedIds = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];

  let targetIds = normalizedIds;
  if (all || targetIds.length === 0) {
    const feed = await getNotificationsFeed({ fetchImpl, token, limit });
    targetIds = feed.items.map((item) => item.id);
  }

  const store = loadStore();
  const now = isoNow();
  for (const id of targetIds) {
    store.readAtById[id] = now;
  }
  saveStore(store);

  return {
    ok: true,
    readAt: now,
    updatedCount: targetIds.length,
    readIds: targetIds,
  };
}

module.exports = {
  STORE_PATH,
  loadStore,
  saveStore,
  getNotificationsFeed,
  markNotificationsRead,
  isRelevantActivity,
  buildNotification,
  classifyLevel,
  getAttentionSignals,
  buildAttentionSignalsFromState,
};
