const fs = require('fs');
const path = require('path');
const { buildOpenClawState, relativeLabel } = require('./openclaw-state');

const STORE_PATH = '/root/.openclaw/projects/mission-control/data/notifications-state.json';
const DEFAULT_LIMIT = 50;

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
};
