const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STORE_PATH = '/root/.openclaw/projects/mission-control/data/chat-sessions.json';
const MAX_MESSAGES = 200;

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
    agents: {},
  };
}

function loadStore() {
  const store = readJsonSafe(STORE_PATH);
  if (!store || typeof store !== 'object') return createEmptyStore();
  if (!store.agents || typeof store.agents !== 'object') store.agents = {};
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

function defaultSessionKey(agentId) {
  return `agent:${agentId}:mc-chat`;
}

function defaultSessionId(agentId) {
  return `mc-chat:${agentId}`;
}

function trimMessages(messages) {
  return Array.isArray(messages) ? messages.slice(-MAX_MESSAGES) : [];
}

function selectVisibleMessages(conversation) {
  const messages = trimMessages(conversation?.messages || []);
  if (messages.length <= 1) return messages;

  const currentSessionId = conversation?.sessionId || null;
  const currentSessionKey = conversation?.sessionKey || null;
  const sessionIds = [...new Set(messages.map((message) => message.sessionId).filter(Boolean))];
  const sessionKeys = [...new Set(messages.map((message) => message.sessionKey).filter(Boolean))];

  const hasCurrentSessionId = currentSessionId && messages.some((message) => message.sessionId === currentSessionId);
  const hasCurrentSessionKey = currentSessionKey && messages.some((message) => message.sessionKey === currentSessionKey);
  if (hasCurrentSessionId || hasCurrentSessionKey) {
    return messages.filter((message) => (
      (currentSessionId && message.sessionId === currentSessionId)
      || (currentSessionKey && message.sessionKey === currentSessionKey)
    ));
  }

  if (sessionIds.length <= 1 && sessionKeys.length <= 1) {
    return messages;
  }

  const nonDefaultSessionIds = sessionIds.filter((sessionId) => sessionId !== defaultSessionId(conversation?.agentId || ''));
  const preferredSessionId = nonDefaultSessionIds.length > 0
    ? nonDefaultSessionIds[nonDefaultSessionIds.length - 1]
    : sessionIds[sessionIds.length - 1] || null;

  if (!preferredSessionId) {
    return messages;
  }

  return messages.filter((message) => message.sessionId === preferredSessionId);
}

function ensureConversation(store, agentId) {
  const normalizedAgentId = normalizeAgentId(agentId);
  if (!normalizedAgentId) return null;

  if (!store.agents[normalizedAgentId]) {
    const now = isoNow();
    store.agents[normalizedAgentId] = {
      agentId: normalizedAgentId,
      sessionKey: defaultSessionKey(normalizedAgentId),
      sessionId: defaultSessionId(normalizedAgentId),
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
  }

  const conversation = store.agents[normalizedAgentId];
  if (!Array.isArray(conversation.messages)) conversation.messages = [];
  conversation.messages = trimMessages(conversation.messages);
  if (!conversation.sessionKey) conversation.sessionKey = defaultSessionKey(normalizedAgentId);
  if (!conversation.sessionId) conversation.sessionId = defaultSessionId(normalizedAgentId);
  if (!conversation.createdAt) conversation.createdAt = isoNow();
  if (!conversation.updatedAt) conversation.updatedAt = conversation.createdAt;
  conversation.agentId = normalizedAgentId;
  return conversation;
}

function buildConversationSnapshot(conversation) {
  if (!conversation) return null;
  const visibleMessages = selectVisibleMessages(conversation);
  const messages = visibleMessages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    at: message.at || null,
    source: message.source || null,
    sessionKey: message.sessionKey || null,
    sessionId: message.sessionId || null,
    status: message.status || null,
    error: message.error || null,
  }));

  return {
    agentId: conversation.agentId,
    sessionKey: conversation.sessionKey || null,
    sessionId: conversation.sessionId || null,
    createdAt: conversation.createdAt || null,
    updatedAt: conversation.updatedAt || null,
    messages,
    messageCount: messages.length,
  };
}

function getConversation(agentId) {
  const store = loadStore();
  const conversation = ensureConversation(store, agentId);
  saveStore(store);
  return buildConversationSnapshot(conversation);
}

function peekConversation(agentId) {
  const store = loadStore();
  const conversation = store.agents[normalizeAgentId(agentId)] || null;
  return buildConversationSnapshot(conversation);
}

function appendChatTurn(agentId, { userMessage, assistantMessage, sessionKey, sessionId, assistantMeta = {} } = {}) {
  const store = loadStore();
  const conversation = ensureConversation(store, agentId);
  if (!conversation) return null;

  const now = isoNow();
  if (sessionKey) conversation.sessionKey = String(sessionKey).trim() || conversation.sessionKey;
  if (sessionId) conversation.sessionId = String(sessionId).trim() || conversation.sessionId;

  if (userMessage) {
    conversation.messages.push({
      id: `msg-${randomUUID()}`,
      role: 'user',
      content: String(userMessage).trim(),
      at: now,
      source: 'user',
      sessionKey: conversation.sessionKey,
      sessionId: conversation.sessionId,
      status: 'sent',
    });
  }

  if (assistantMessage) {
    conversation.messages.push({
      id: `msg-${randomUUID()}`,
      role: 'assistant',
      content: String(assistantMessage).trim(),
      at: now,
      source: 'agent',
      sessionKey: conversation.sessionKey,
      sessionId: conversation.sessionId,
      status: 'sent',
      ...assistantMeta,
    });
  }

  conversation.messages = trimMessages(conversation.messages);
  conversation.updatedAt = now;
  saveStore(store);
  return buildConversationSnapshot(conversation);
}

function listConversationSnapshots() {
  const store = loadStore();
  return Object.values(store.agents || {})
    .map((conversation) => buildConversationSnapshot(conversation))
    .filter(Boolean);
}

module.exports = {
  STORE_PATH,
  loadStore,
  saveStore,
  normalizeAgentId,
  defaultSessionKey,
  defaultSessionId,
  ensureConversation,
  buildConversationSnapshot,
  getConversation,
  peekConversation,
  appendChatTurn,
  listConversationSnapshots,
};
