const fs = require('fs');
const path = require('path');

const STORE_PATH = '/root/.openclaw/projects/mission-control/data/task-executions.json';

function isoNow() {
  return new Date().toISOString();
}

function readJsonFileSafe(filePath) {
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
    tasks: {},
  };
}

function loadStore() {
  const store = readJsonFileSafe(STORE_PATH);
  if (!store || typeof store !== 'object') return createEmptyStore();
  if (!store.tasks || typeof store.tasks !== 'object') store.tasks = {};
  if (!store.version) store.version = 1;
  return store;
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  store.updatedAt = isoNow();
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function ensureTaskRecord(store, taskId, base = {}) {
  if (!taskId) return null;

  if (!store.tasks[taskId]) {
    store.tasks[taskId] = {
      taskId,
      title: base.title || '',
      currentText: base.currentText || base.title || '',
      currentSection: base.currentSection || null,
      currentStatus: base.currentStatus || 'standby',
      currentAgentId: base.currentAgentId || null,
      currentSessionKey: base.currentSessionKey || null,
      currentRunId: base.currentRunId || null,
      currentSessionId: base.currentSessionId || null,
      currentConclusion: base.currentConclusion || null,
      createdAt: base.createdAt || isoNow(),
      updatedAt: base.updatedAt || isoNow(),
      deletedAt: base.deletedAt || null,
      history: Array.isArray(base.history) ? base.history : [],
      events: Array.isArray(base.events) ? base.events : [],
    };
  }

  const record = store.tasks[taskId];
  if (base.title !== undefined && base.title !== null) record.title = base.title;
  if (base.currentText !== undefined && base.currentText !== null) record.currentText = base.currentText;
  if (base.currentSection !== undefined && base.currentSection !== null) record.currentSection = base.currentSection;
  if (base.currentStatus !== undefined && base.currentStatus !== null) record.currentStatus = base.currentStatus;
  if (base.currentAgentId !== undefined) record.currentAgentId = base.currentAgentId;
  if (base.currentSessionKey !== undefined) record.currentSessionKey = base.currentSessionKey;
  if (base.currentRunId !== undefined) record.currentRunId = base.currentRunId;
  if (base.currentSessionId !== undefined) record.currentSessionId = base.currentSessionId;
  if (base.currentConclusion !== undefined) record.currentConclusion = base.currentConclusion;
  if (base.deletedAt !== undefined) record.deletedAt = base.deletedAt;
  record.updatedAt = isoNow();
  return record;
}

function appendTaskEvent(store, taskId, event) {
  const record = ensureTaskRecord(store, taskId);
  if (!record) return null;
  record.events = Array.isArray(record.events) ? record.events : [];
  record.events.push({
    id: `${taskId}:${record.events.length + 1}`,
    at: isoNow(),
    ...event,
  });
  record.updatedAt = isoNow();
  return record;
}

function appendTaskRun(store, taskId, run) {
  const record = ensureTaskRecord(store, taskId);
  if (!record) return null;
  record.history = Array.isArray(record.history) ? record.history : [];
  record.history.push({
    id: run.runId || `${taskId}:run:${record.history.length + 1}`,
    recordedAt: isoNow(),
    ...run,
  });
  if (run.currentText !== undefined) record.currentText = run.currentText;
  if (run.title !== undefined) record.title = run.title;
  if (run.currentSection !== undefined) record.currentSection = run.currentSection;
  if (run.currentStatus !== undefined) record.currentStatus = run.currentStatus;
  if (run.agentId !== undefined) record.currentAgentId = run.agentId;
  if (run.sessionKey !== undefined) record.currentSessionKey = run.sessionKey;
  if (run.runId !== undefined) record.currentRunId = run.runId;
  if (run.sessionId !== undefined) record.currentSessionId = run.sessionId;
  if (run.conclusion !== undefined) record.currentConclusion = run.conclusion;
  record.updatedAt = isoNow();
  return record;
}

function removeTaskRecord(store, taskId) {
  if (!store?.tasks || !taskId || !store.tasks[taskId]) return false;
  delete store.tasks[taskId];
  store.updatedAt = isoNow();
  return true;
}

module.exports = {
  STORE_PATH,
  loadStore,
  saveStore,
  ensureTaskRecord,
  appendTaskEvent,
  appendTaskRun,
  removeTaskRecord,
};
