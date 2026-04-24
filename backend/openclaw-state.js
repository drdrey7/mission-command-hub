const fs = require('fs');
const path = require('path');

const OPENCLAW_ROOT_CANDIDATES = ['/root/.openclaw', '/home/node/.openclaw'];
const ACTIVITY_LOG_CANDIDATES = [
  '/root/.openclaw/projects/mission-control/data/mc-activity.json',
  '/home/node/.openclaw/projects/mission-control/data/mc-activity.json',
];
const TASK_EXECUTIONS_STORE_CANDIDATES = [
  '/root/.openclaw/projects/mission-control/data/task-executions.json',
  '/home/node/.openclaw/projects/mission-control/data/task-executions.json',
];

const SESSION_TERMINAL_STATUSES = new Set(['done', 'completed', 'complete', 'failed', 'error', 'cancelled', 'canceled', 'aborted', 'terminated']);
const SESSION_ACTIVE_STATUSES = new Set(['active', 'running', 'working', 'in_progress', 'in progress', 'busy', 'thinking']);
const SESSION_QUEUED_STATUSES = new Set(['queued', 'pending', 'dispatching', 'starting']);

const TASK_ACTIVE_STATUSES = new Set(['in_progress', 'in-progress', 'running', 'working', 'dispatched', 'queued']);
const TASK_TERMINAL_STATUSES = new Set(['completed', 'complete', 'done', 'failed', 'error', 'errored']);

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return trimmed;
  }
  return null;
}

function timestampMs(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeLabel(isoValue, now = Date.now()) {
  const ms = timestampMs(isoValue);
  if (!ms) return 'sem actividade recente';
  const diff = Math.max(0, now - ms);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes === 1) return 'há 1 min';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'há 1 h';
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'há 1 d';
  return `há ${days} d`;
}

function sessionState(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');
  if (!normalized) return 'idle';
  if (SESSION_ACTIVE_STATUSES.has(normalized)) return 'active';
  if (SESSION_QUEUED_STATUSES.has(normalized)) return 'queued';
  if (SESSION_TERMINAL_STATUSES.has(normalized)) return normalized === 'failed' || normalized === 'error' ? 'error' : 'completed';
  return 'idle';
}

function taskState(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');
  if (!normalized) return 'idle';
  if (normalized === 'completed' || normalized === 'done' || normalized === 'complete') return 'completed';
  if (normalized === 'failed' || normalized === 'error' || normalized === 'errored') return 'error';
  if (TASK_ACTIVE_STATUSES.has(normalized)) return 'in_progress';
  return 'idle';
}

function displayAgentStatus(executionState, hasLiveSession, hasRecentActivity, hasErrors) {
  if (hasErrors) return 'on_ground';
  if (hasLiveSession && executionState === 'in_progress') return 'em_voo';
  if (hasLiveSession && executionState === 'queued') return 'taxiing';
  if (hasRecentActivity) return 'taxiing';
  return 'hangar';
}

function inferAgentState({ hasLiveSession, hasRecentActivity, hasErrors, executionState }) {
  if (hasErrors) return 'error';
  if (hasLiveSession || executionState === 'in_progress') return 'active';
  if (hasRecentActivity) return 'waiting';
  return 'idle';
}

function loadOpenClawConfig() {
  for (const root of OPENCLAW_ROOT_CANDIDATES) {
    const configPath = path.join(root, 'openclaw.json');
    const config = readJsonSafe(configPath);
    if (config) {
      return { root, configPath, config };
    }
  }
  return { root: null, configPath: null, config: null };
}

function loadTaskExecutionStore() {
  for (const filePath of TASK_EXECUTIONS_STORE_CANDIDATES) {
    const store = readJsonSafe(filePath);
    if (store) {
      return { storePath: filePath, store };
    }
  }
  return { storePath: null, store: { version: 1, updatedAt: null, tasks: {} } };
}

function loadActivityLog() {
  for (const filePath of ACTIVITY_LOG_CANDIDATES) {
    const log = readJsonSafe(filePath);
    if (Array.isArray(log)) {
      return { activityLogPath: filePath, entries: log };
    }
  }
  return { activityLogPath: null, entries: [] };
}

function agentRoots() {
  return OPENCLAW_ROOT_CANDIDATES.map((root) => path.join(root, 'agents'));
}

function resolveTranscriptPath(candidatePath, agentId, sessionFileName) {
  const tried = [];
  if (candidatePath && fs.existsSync(candidatePath)) return candidatePath;
  if (candidatePath) tried.push(candidatePath);

  const fileName = sessionFileName || (candidatePath ? path.basename(candidatePath) : null);
  if (!fileName) return null;

  for (const agentsRoot of agentRoots()) {
    const direct = path.join(agentsRoot, agentId, 'sessions', fileName);
    if (fs.existsSync(direct)) return direct;
    tried.push(direct);
  }

  for (const agentsRoot of agentRoots()) {
    const agentDir = path.join(agentsRoot, agentId, 'sessions');
    if (!fs.existsSync(agentDir)) continue;
    try {
      const match = fs.readdirSync(agentDir).find((entry) => entry === fileName || entry.endsWith(`/${fileName}`));
      if (match) {
        const resolved = path.join(agentDir, match);
        if (fs.existsSync(resolved)) return resolved;
      }
    } catch {
      // Ignore directory traversal issues and keep trying other roots.
    }
  }

  return tried.length ? null : candidatePath || null;
}

function extractAssistantText(sessionFilePath) {
  if (!sessionFilePath || !fs.existsSync(sessionFilePath)) return null;

  let finalText = null;
  const lines = fs.readFileSync(sessionFilePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== 'message' || entry?.message?.role !== 'assistant') continue;
    const parts = Array.isArray(entry?.message?.content) ? entry.message.content : [];
    const text = parts
      .filter((part) => part && part.type === 'text' && typeof part.text === 'string' && part.text.trim())
      .map((part) => part.text.trim())
      .join('\n\n')
      .trim();
    if (text) {
      finalText = text;
    }
  }
  return finalText ? finalText.trim() : null;
}

function summarizeTranscript(sessionFilePath, limit = 8) {
  if (!sessionFilePath || !fs.existsSync(sessionFilePath)) return [];

  const entries = [];
  const lines = fs.readFileSync(sessionFilePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const timestamp = normalizeTimestamp(entry?.timestamp);
    if (entry?.type === 'message') {
      const role = entry?.message?.role || 'unknown';
      const content = Array.isArray(entry?.message?.content) ? entry.message.content : [];
      const text = content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string' && part.text.trim())
        .map((part) => part.text.trim())
        .join('\n\n')
        .trim();
      if (text) {
        entries.push({
          type: 'message',
          role,
          timestamp,
          text: text.slice(0, 500),
        });
      }
      continue;
    }
    if (entry?.type === 'custom') {
      entries.push({
        type: 'custom',
        customType: entry.customType || 'custom',
        timestamp,
        summary: typeof entry.data === 'string'
          ? entry.data.slice(0, 400)
          : JSON.stringify(entry.data || {}).slice(0, 400),
      });
    }
  }
  return entries.slice(-limit);
}

function loadLocalAgentSessions() {
  const result = new Map();

  for (const agentsRoot of agentRoots()) {
    if (!fs.existsSync(agentsRoot)) continue;
    for (const agentId of fs.readdirSync(agentsRoot)) {
      const sessionsDir = path.join(agentsRoot, agentId, 'sessions');
      const sessionsPath = path.join(sessionsDir, 'sessions.json');
      const store = readJsonSafe(sessionsPath);
      if (!store || typeof store !== 'object') continue;

      for (const [sessionKey, record] of Object.entries(store)) {
        if (!record || typeof record !== 'object') continue;
        const sessionId = normalizeText(record.sessionId);
        const candidateFile = resolveTranscriptPath(record.sessionFile || record.sessionPath || record.filePath || null, agentId, sessionId ? `${sessionId}.jsonl` : null);
        const normalized = {
          agentId,
          sessionKey,
          sessionId: sessionId || null,
          status: sessionState(record.status),
          rawStatus: record.status || null,
          startedAt: normalizeTimestamp(record.startedAt),
          endedAt: normalizeTimestamp(record.endedAt),
          updatedAt: normalizeTimestamp(record.updatedAt),
          runtimeMs: typeof record.runtimeMs === 'number' ? record.runtimeMs : null,
          inputTokens: typeof record.inputTokens === 'number' ? record.inputTokens : null,
          outputTokens: typeof record.outputTokens === 'number' ? record.outputTokens : null,
          totalTokens: typeof record.totalTokens === 'number' ? record.totalTokens : null,
          totalTokensFresh: typeof record.totalTokensFresh === 'number' ? record.totalTokensFresh : null,
          cacheRead: typeof record.cacheRead === 'number' ? record.cacheRead : null,
          cacheWrite: typeof record.cacheWrite === 'number' ? record.cacheWrite : null,
          sessionFile: candidateFile || record.sessionFile || null,
          summary: Array.isArray(record.summary) ? record.summary : summarizeTranscript(candidateFile || record.sessionFile || null, 8),
          finalResult: extractAssistantText(candidateFile || record.sessionFile || null),
          source: 'local',
        };

        const existing = result.get(`${agentId}::${sessionKey}`) || null;
        if (!existing) {
          result.set(`${agentId}::${sessionKey}`, normalized);
        } else {
          const existingMs = timestampMs(existing.updatedAt || existing.endedAt || existing.startedAt);
          const nextMs = timestampMs(normalized.updatedAt || normalized.endedAt || normalized.startedAt);
          if (nextMs >= existingMs) {
            result.set(`${agentId}::${sessionKey}`, { ...existing, ...normalized });
          }
        }
      }
    }
  }

  return result;
}

async function loadGatewaySessions({ fetchImpl, token, timeoutMs = 5000 }) {
  if (typeof fetchImpl !== 'function') {
    return { sessions: [], error: 'fetch unavailable', source: 'gateway' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('http://127.0.0.1:18789/tools/invoke', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tool: 'sessions_list', args: { limit: 200 } }),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => ({}));
    const text = json?.result?.content?.[0]?.text || json?.content?.[0]?.text || null;
    const sessions = text ? JSON.parse(text).sessions || [] : [];
    return { sessions, raw: json, source: 'gateway' };
  } catch (error) {
    return { sessions: [], error: String(error?.message || error), source: 'gateway' };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeGatewaySession(raw) {
  const sessionKey = normalizeText(raw?.key || raw?.sessionKey || '');
  const agentId = normalizeText(raw?.agentId || raw?.agent || raw?.owner || sessionKey.split(':')?.[1] || '').toLowerCase() || null;
  const sessionId = normalizeText(raw?.sessionId || raw?.id || '');
  const status = sessionState(raw?.status || raw?.state || raw?.phase);
  return {
    agentId,
    sessionKey: sessionKey || null,
    sessionId: sessionId || null,
    status,
    rawStatus: raw?.status || raw?.state || raw?.phase || null,
    startedAt: normalizeTimestamp(raw?.startedAt || raw?.createdAt),
    endedAt: normalizeTimestamp(raw?.endedAt || raw?.finishedAt),
    updatedAt: normalizeTimestamp(raw?.updatedAt || raw?.lastActivityAt || raw?.lastUpdatedAt),
    runtimeMs: typeof raw?.runtimeMs === 'number' ? raw.runtimeMs : null,
    inputTokens: typeof raw?.inputTokens === 'number' ? raw.inputTokens : null,
    outputTokens: typeof raw?.outputTokens === 'number' ? raw.outputTokens : null,
    totalTokens: typeof raw?.totalTokens === 'number' ? raw.totalTokens : null,
    totalTokensFresh: typeof raw?.totalTokensFresh === 'number' ? raw.totalTokensFresh : null,
    cacheRead: typeof raw?.cacheRead === 'number' ? raw.cacheRead : null,
    cacheWrite: typeof raw?.cacheWrite === 'number' ? raw.cacheWrite : null,
    sessionFile: normalizeText(raw?.sessionFile || raw?.path || '') || null,
    summary: Array.isArray(raw?.summary) ? raw.summary : [],
    finalResult: normalizeText(raw?.finalResult || raw?.finalText || '') || null,
    source: 'gateway',
  };
}

function selectSession(records = []) {
  return [...records].sort((a, b) => {
    const aMs = timestampMs(a?.updatedAt || a?.endedAt || a?.startedAt);
    const bMs = timestampMs(b?.updatedAt || b?.endedAt || b?.startedAt);
    return bMs - aMs;
  })[0] || null;
}

function extractSessionMessages(sessionFilePath, agentId, limit = 2) {
  if (!sessionFilePath || !fs.existsSync(sessionFilePath)) return [];
  const lines = fs.readFileSync(sessionFilePath, 'utf8').split(/\r?\n/);
  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== 'message') continue;
    const timestamp = normalizeTimestamp(entry?.timestamp);
    const role = entry?.message?.role || 'unknown';
    const content = Array.isArray(entry?.message?.content) ? entry.message.content : [];
    const text = content
      .filter((part) => part && part.type === 'text' && typeof part.text === 'string' && part.text.trim())
      .map((part) => part.text.trim())
      .join('\n\n')
      .trim();
    if (!text) continue;
    events.push({
      type: role === 'assistant' ? 'assistant_message' : 'user_message',
      source: agentId || 'system',
      text: text.slice(0, 600),
      timestamp,
      severity: role === 'assistant' ? 'info' : 'default',
    });
  }
  return events.slice(-limit);
}

function normalizeActivityEntry(entry, fallbackSource = 'sistema') {
  const timestamp = normalizeTimestamp(entry?.timestamp || entry?.at || entry?.createdAt);
  return {
    id: entry?.id || `${fallbackSource}-${timestamp || Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: entry?.type || 'log',
    text: normalizeText(entry?.message || entry?.text || entry?.summary || entry?.note || ''),
    source: normalizeText(entry?.agentId || entry?.source || fallbackSource) || fallbackSource,
    timestamp,
    severity: entry?.severity || (entry?.type === 'dispatch_failed' || entry?.type === 'error' ? 'critical' : 'info'),
    sessionKey: entry?.sessionKey || null,
    sessionId: entry?.sessionId || null,
    runId: entry?.runId || null,
  };
}

function loadTaskExecutionRecords() {
  const { storePath, store } = loadTaskExecutionStore();
  const tasks = store?.tasks && typeof store.tasks === 'object' ? store.tasks : {};
  return { storePath, tasks };
}

function buildAgentState({ configAgents, gatewaySessions, localSessions, taskRecords, now = Date.now() }) {
  const gatewayByAgent = new Map();
  for (const session of gatewaySessions) {
    const key = session.agentId || session.sessionKey?.split(':')?.[1] || null;
    if (!key) continue;
    if (!gatewayByAgent.has(key)) gatewayByAgent.set(key, []);
    gatewayByAgent.get(key).push(session);
  }

  const taskByAgent = new Map();
  for (const task of Object.values(taskRecords || {})) {
    const agentId = normalizeText(task?.currentAgentId || '').toLowerCase();
    if (!agentId) continue;
    if (!taskByAgent.has(agentId)) taskByAgent.set(agentId, []);
    taskByAgent.get(agentId).push(task);
  }

  const agents = configAgents.map((agent) => {
    const agentId = normalizeText(agent.id || '').toLowerCase();
    const local = [...localSessions.values()].filter((session) => session.agentId === agentId);
    const gateway = gatewayByAgent.get(agentId) || [];
    const sessions = [...gateway, ...local];
    const latestSession = selectSession(sessions);
    const liveSession = [...gateway, ...local].find((session) => session.status === 'active' || session.status === 'queued') || null;
    const agentTasks = (taskByAgent.get(agentId) || [])
      .filter((task) => task && !task.deletedAt)
      .sort((a, b) => timestampMs(b.updatedAt || b.recordedAt) - timestampMs(a.updatedAt || a.recordedAt));
    const currentTask = agentTasks.find((task) => taskState(task.currentStatus) === 'in_progress')
      || agentTasks.find((task) => taskState(task.currentStatus) === 'completed')
      || agentTasks[0]
      || null;

    const taskStateValue = taskState(currentTask?.currentStatus);
    const sessionStateValue = liveSession?.status || latestSession?.status || 'idle';
    const executionState = sessionStateValue === 'active'
      ? 'in_progress'
      : sessionStateValue === 'queued'
        ? 'in_progress'
        : taskStateValue === 'in_progress'
          ? 'in_progress'
          : taskStateValue === 'completed'
            ? 'completed'
            : taskStateValue === 'error'
              ? 'error'
              : latestSession?.status === 'error'
                ? 'error'
                : 'idle';

    const lastActivityAt = [
      latestSession?.updatedAt,
      latestSession?.endedAt,
      latestSession?.startedAt,
      currentTask?.updatedAt,
      currentTask?.recordedAt,
      ...sessions.map((session) => session.updatedAt || session.endedAt || session.startedAt),
    ]
      .map(timestampMs)
      .filter(Boolean)
      .reduce((max, value) => Math.max(max, value), 0) || null;

    const hasRecentActivity = Boolean(lastActivityAt && now - lastActivityAt < 1000 * 60 * 60);
    const hasLiveSession = Boolean(liveSession);
    const hasErrors = executionState === 'error';
    const agentState = inferAgentState({ hasLiveSession, hasRecentActivity, hasErrors, executionState });
    const online = agentState === 'active' || agentState === 'waiting';
    const displayStatus = displayAgentStatus(executionState, hasLiveSession, hasRecentActivity, hasErrors);
    const visibleTask = executionState === 'in_progress' ? currentTask : null;

    return {
      key: agentId,
      id: agentId,
      name: agent.identity?.name || agent.name || agentId,
      role: agent.identity?.theme || 'Agente',
      status: displayStatus,
      agentState,
      online,
      executionStatus: executionState,
      sessions: sessions.length,
      sessionCount: sessions.length,
      lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
      lastActivity: lastActivityAt ? relativeLabel(lastActivityAt, now) : 'sem actividade recente',
      currentTask: visibleTask ? normalizeText(visibleTask.currentText || visibleTask.title || '') || null : null,
      currentTaskId: visibleTask?.taskId || null,
      currentSessionKey: liveSession?.sessionKey || latestSession?.sessionKey || currentTask?.currentSessionKey || null,
      currentSessionId: liveSession?.sessionId || latestSession?.sessionId || currentTask?.currentSessionId || null,
      currentRunId: currentTask?.currentRunId || null,
      source: hasLiveSession ? 'gateway' : local.length ? 'local' : 'config',
      liveSession: liveSession
        ? {
            sessionKey: liveSession.sessionKey || null,
            sessionId: liveSession.sessionId || null,
            status: liveSession.rawStatus || liveSession.status,
            startedAt: liveSession.startedAt,
            updatedAt: liveSession.updatedAt,
          }
        : null,
    };
  });

  return agents;
}

function buildSessionTimeline({ configAgents, gatewaySessions, localSessions, taskRecords, limit = 100, now = Date.now() }) {
  const sessionMap = new Map();
  const addSession = (session, source) => {
    const agentId = normalizeText(session.agentId || '').toLowerCase() || null;
    const key = `${agentId || 'unknown'}::${session.sessionKey || session.sessionId || session.sessionFile || Math.random()}`;
    const existing = sessionMap.get(key);
    const next = {
      ...existing,
      ...session,
      agentId,
      source,
    };
    const nextMs = timestampMs(next.updatedAt || next.endedAt || next.startedAt);
    const existingMs = existing ? timestampMs(existing.updatedAt || existing.endedAt || existing.startedAt) : 0;
    if (!existing || nextMs >= existingMs) {
      sessionMap.set(key, next);
    }
  };

  for (const session of localSessions.values()) addSession(session, 'local');
  for (const session of gatewaySessions) addSession(session, 'gateway');

  const taskLinks = new Map();
  for (const task of Object.values(taskRecords || {})) {
    const keys = [
      normalizeText(task?.currentSessionKey || ''),
      normalizeText(task?.currentSessionId || ''),
    ].filter(Boolean);
    for (const key of keys) {
      if (!taskLinks.has(key)) taskLinks.set(key, []);
      taskLinks.get(key).push(task.taskId || null);
    }
  }

  const sessions = [...sessionMap.values()].map((session) => {
    const linkedTaskIds = [
      ...(taskLinks.get(session.sessionKey) || []),
      ...(taskLinks.get(session.sessionId) || []),
    ].filter(Boolean);
    const finalResult = session.finalResult || extractAssistantText(session.sessionFile || null);
    return {
      sessionKey: session.sessionKey || null,
      sessionId: session.sessionId || null,
      agentId: session.agentId || null,
      status: session.status || 'idle',
      rawStatus: session.rawStatus || null,
      startedAt: session.startedAt || null,
      endedAt: session.endedAt || null,
      updatedAt: session.updatedAt || null,
      runtimeMs: session.runtimeMs ?? null,
      tokens: {
        input: session.inputTokens ?? null,
        output: session.outputTokens ?? null,
        total: session.totalTokens ?? null,
        totalFresh: session.totalTokensFresh ?? null,
        cacheRead: session.cacheRead ?? null,
        cacheWrite: session.cacheWrite ?? null,
      },
      sessionFile: session.sessionFile || null,
      summary: Array.isArray(session.summary) && session.summary.length ? session.summary : summarizeTranscript(session.sessionFile || null, 8),
      finalResult,
      active: session.status === 'active' || session.status === 'queued',
      executionState: session.status === 'active' || session.status === 'queued'
        ? 'in_progress'
        : session.status === 'error'
          ? 'error'
          : session.status === 'completed'
            ? 'completed'
            : 'idle',
      linkedTaskIds: [...new Set(linkedTaskIds)],
      source: session.source || 'local',
    };
  });

  sessions.sort((a, b) => timestampMs(b.updatedAt || b.endedAt || b.startedAt) - timestampMs(a.updatedAt || a.endedAt || a.startedAt));
  return sessions.slice(0, limit);
}

function buildActivityFeed({ baseActivity, sessions, taskRecords, limit = 100, now = Date.now() }) {
  const events = [];

  for (const entry of baseActivity) {
    const normalized = normalizeActivityEntry(entry);
    if (normalized.text) events.push(normalized);
  }

  for (const session of sessions) {
    const transcriptEvents = extractSessionMessages(session.sessionFile || null, session.agentId || 'system', 2);
    for (const event of transcriptEvents) {
      events.push({
        id: `${session.sessionId || session.sessionKey || 'session'}:${event.type}:${event.timestamp || Date.now()}`,
        type: event.type,
        text: event.text,
        source: session.agentId || event.source || 'system',
        timestamp: event.timestamp || null,
        severity: event.severity || 'info',
        sessionKey: session.sessionKey || null,
        sessionId: session.sessionId || null,
      });
    }
  }

  for (const task of Object.values(taskRecords || {})) {
    const taskEvents = Array.isArray(task.events) ? task.events : [];
    for (const event of taskEvents.slice(-4)) {
      const timestamp = normalizeTimestamp(event.at);
      if (!timestamp) continue;
      const text = event.note || event.error || event.prompt || event.text || event.type;
      if (!text) continue;
      events.push({
        id: event.id || `${task.taskId}:${event.type}:${timestamp}`,
        type: event.type || 'task_event',
        text: String(text).slice(0, 600),
        source: event.agentId || task.currentAgentId || 'task',
        timestamp,
        severity: event.type === 'dispatch_failed' || event.type === 'failed' ? 'critical' : 'info',
        sessionKey: event.sessionKey || task.currentSessionKey || null,
        sessionId: event.sessionId || task.currentSessionId || null,
      });
    }
  }

  events.sort((a, b) => timestampMs(b.timestamp) - timestampMs(a.timestamp));
  return events.slice(0, limit);
}

async function buildOpenClawState({ fetchImpl, token, activityLimit = 100, sessionLimit = 100 } = {}) {
  const errors = [];
  const warnings = [];

  const { config, configPath } = loadOpenClawConfig();
  if (!config) errors.push(`OpenClaw config not found in ${OPENCLAW_ROOT_CANDIDATES.join(', ')}`);
  const agentConfigs = Array.isArray(config?.agents?.list) ? config.agents.list.filter((agent) => agent && agent.id) : [];
  if (agentConfigs.length === 0) warnings.push('No agents configured in openclaw.json');

  const { tasks: taskRecords, storePath: taskStorePath } = loadTaskExecutionRecords();
  const localSessions = loadLocalAgentSessions();

  let gatewaySessions = [];
  let gatewayError = null;
  if (token) {
    const gateway = await loadGatewaySessions({ fetchImpl, token });
    gatewaySessions = (gateway.sessions || []).map(normalizeGatewaySession).filter(Boolean);
    gatewayError = gateway.error || null;
    if (gatewayError) errors.push(`Gateway sessions_list unavailable: ${gatewayError}`);
  } else {
    warnings.push('Missing gateway token; falling back to local session stores');
  }

  const combinedSessions = buildSessionTimeline({
    configAgents: agentConfigs,
    gatewaySessions,
    localSessions,
    taskRecords,
    limit: sessionLimit,
  });

  const agents = buildAgentState({
    configAgents: agentConfigs,
    gatewaySessions,
    localSessions,
    taskRecords,
  });
  const configuredAgents = agents.length;
  const onlineAgents = agents.filter((agent) => agent.online).length;
  const workingAgents = agents.filter((agent) => agent.agentState === 'active').length;
  const waitingAgents = agents.filter((agent) => agent.agentState === 'waiting').length;
  const idleAgents = agents.filter((agent) => agent.agentState === 'idle').length;
  const errorAgents = agents.filter((agent) => agent.agentState === 'error').length;

  const { entries: baseActivity, activityLogPath } = loadActivityLog();
  const activity = buildActivityFeed({
    baseActivity,
    sessions: combinedSessions,
    taskRecords,
    limit: activityLimit,
  });

  const state = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sources: {
      config: configPath || null,
      gateway: 'http://127.0.0.1:18789/tools/invoke',
      taskStore: taskStorePath || null,
      activityLog: activityLogPath || null,
      agentsRoot: OPENCLAW_ROOT_CANDIDATES,
    },
    warnings,
    errors,
    agents,
    sessions: combinedSessions,
    activity,
    activityCount: activity.length,
    agentCount: configuredAgents,
    configuredAgents,
    configuredAgentCount: configuredAgents,
    onlineAgents,
    onlineAgentCount: onlineAgents,
    workingAgents,
    workingAgentCount: workingAgents,
    activeAgentCount: workingAgents,
    waitingAgents,
    idleAgents,
    errorAgents,
    gatewaySessionCount: gatewaySessions.length,
    localSessionCount: localSessions.size,
    taskCount: Object.keys(taskRecords || {}).length,
    raw: {
      config,
      gatewayError,
    },
  };

  return state;
}

module.exports = {
  buildOpenClawState,
  normalizeTimestamp,
  taskState,
  sessionState,
  relativeLabel,
  resolveTranscriptPath,
  extractAssistantText,
  summarizeTranscript,
  loadTaskExecutionStore,
};
