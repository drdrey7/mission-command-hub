const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const { randomUUID } = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const {
  STORE_PATH: TASK_EXECUTIONS_STORE_PATH,
  loadStore: loadTaskExecutionStore,
  saveStore: saveTaskExecutionStore,
  ensureTaskRecord,
  appendTaskEvent,
  appendTaskRun,
  removeTaskRecord,
} = require('./task-execution-store');
const {
  buildOpenClawState,
  sessionState: normalizeSessionState,
  taskState: normalizeTaskState,
  resolveTranscriptPath,
} = require('./openclaw-state');
const {
  getNotificationsFeed,
  markNotificationsRead,
} = require('./notifications-store');
const {
  peekConversation,
  appendChatTurn,
  normalizeAgentId: normalizeChatAgentId,
} = require('./chat-store');
const {
  getLatestMemory,
  getMemoryDay,
  getMemoryEntry,
  getMemoryIndex,
} = require('./memory-summaries');
const {
  getVpsSnapshot,
  getFail2banStats,
  getFail2banJails,
  getFail2banBanned,
  getFail2banHistory,
  toLegacyVpsPayload,
} = require('./system-snapshot');

const app = express();
app.use(cors());
app.use(express.json());

function getToken() {
  try {
    const lines = fs.readFileSync('/root/openclaw/.env', 'utf8').split('\n');
    const line = lines.find(l => l.startsWith('OPENCLAW_GATEWAY_TOKEN='));
    const token = line ? line.split('=')[1].trim() : '';
    return token || null;
  } catch { return null; }
}

function run(cmd) {
  return new Promise(resolve => {
    exec(cmd, (err, stdout) => resolve(err ? 'N/A' : stdout.trim()));
  });
}

function extractChatMessagePayload(body) {
  const direct = String(body?.message || body?.text || '').trim();
  if (direct) return direct;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;
    const content = String(message.content || '').trim();
    if (content) return content;
  }
  return '';
}

function findOpenClawAgentById(state, agentId) {
  const normalized = String(agentId || '').trim().toLowerCase();
  if (!normalized) return null;
  return (Array.isArray(state?.agents) ? state.agents : []).find((agent) => String(agent.key || agent.id || '').trim().toLowerCase() === normalized) || null;
}

const TASKS_PATH = '/root/.openclaw/TASKS.md';
const TASK_TASK_ID_COMMENT_RE = /<!--\s*mc-task-id:\s*([^>]+?)\s*-->/i;
const TASK_AGENT_ID_COMMENT_RE = /<!--\s*mc-agent-id:\s*([^>]+?)\s*-->/i;
const TASK_SESSION_KEY_COMMENT_RE = /<!--\s*mc-session-key:\s*([^>]+?)\s*-->/i;
const TASK_SESSION_ID_COMMENT_RE = /<!--\s*mc-session-id:\s*([^>]+?)\s*-->/i;
const TASK_RUN_ID_COMMENT_RE = /<!--\s*mc-run-id:\s*([^>]+?)\s*-->/i;
const TASK_STATUS_COMMENT_RE = /<!--\s*mc-dispatch-status:\s*([^>]+?)\s*-->/i;
const TASK_CONCLUSION_COMMENT_RE = /<!--\s*mc-conclusion:\s*([^>]+?)\s*-->/i;
const TASK_COMMENT_RE = /<!--\s*mc-[a-z-]+:\s*[^>]+?\s*-->/gi;
const TASK_SECTION_META = {
  standby: { label: 'Standby' },
  inProgress: { label: 'In Progress' },
  completed: { label: 'Completed' },
};
const COMPLETED_DISPATCH_STATUSES = new Set(['completed', 'complete', 'done', 'finished', 'succeeded', 'success']);
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENCLAW_CLI_CANDIDATES = [
  process.env.OPENCLAW_CLI_PATH?.trim(),
  '/root/.nvm/versions/node/v22.22.2/bin/openclaw',
  'openclaw',
].filter(Boolean);
let cachedOpenRouterApiKey = null;

function normalizeTaskSection(value) {
  if (!value) return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (normalized === 'standby') return 'standby';
  if (normalized === 'in progress' || normalized === 'inprogress') return 'inProgress';
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'done') return 'completed';
  return null;
}

function normalizeDispatchStatus(value) {
  if (!value) return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (COMPLETED_DISPATCH_STATUSES.has(normalized)) return 'completed';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  if (normalized === 'dispatched' || normalized === 'accepted' || normalized === 'running') return 'dispatched';
  if (normalized === 'failed' || normalized === 'error' || normalized === 'errored') return 'failed';
  return String(value).trim();
}

function isTaskCompleted(task) {
  if (!task) return false;
  if (task.section === 'completed') return true;
  if (task.checked === true) return true;
  return normalizeDispatchStatus(task.dispatchStatus) === 'completed';
}

function normalizeExecutionTaskStatus(value) {
  const normalized = normalizeTaskState(value);
  if (normalized === 'completed') return 'completed';
  if (normalized === 'error') return 'error';
  if (normalized === 'in_progress') return 'in_progress';
  return 'idle';
}

function summarySectionForTask(task, record = null) {
  const status = normalizeExecutionTaskStatus(record?.currentStatus || task?.currentStatus || task?.dispatchStatus);
  if (status === 'completed') return 'completed';
  if (status === 'in_progress') return 'inProgress';
  return 'standby';
}

function mergeTaskExecutionView(task, record = null) {
  const currentStatus = normalizeExecutionTaskStatus(record?.currentStatus || task.currentStatus || task.dispatchStatus);
  const currentSection = record?.currentSection || task.currentSection || task.section || null;
  return {
    ...task,
    boardSection: task.section,
    section: task.section,
    currentSection,
    currentStatus,
    currentText: record?.currentText || task.currentText || task.text || null,
    currentAgentId: record?.currentAgentId || task.agentId || null,
    currentSessionKey: record?.currentSessionKey || task.sessionKey || null,
    currentSessionId: record?.currentSessionId || task.sessionId || null,
    currentRunId: record?.currentRunId || task.runId || null,
    currentConclusion: record?.currentConclusion || task.conclusion || null,
    dispatchStatus: normalizeDispatchStatus(task.dispatchStatus) || (currentStatus === 'in_progress' ? 'dispatched' : currentStatus === 'completed' ? 'completed' : currentStatus === 'error' ? 'failed' : task.dispatchStatus || null),
  };
}

function sectionLabel(sectionKey, fallbackLabel) {
  return TASK_SECTION_META[sectionKey]?.label || fallbackLabel || sectionKey;
}

function inferTaskOwner(text) {
  if (!text) return null;
  const match = text.match(/(?:^|[\s([{<])@?(comandante|cyber|flow|ledger|agentmail)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function stripTaskComments(text) {
  return String(text || '')
    .replace(TASK_COMMENT_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTaskComments(text) {
  const parsed = {
    taskId: null,
    agentId: null,
    sessionKey: null,
    sessionId: null,
    runId: null,
    dispatchStatus: null,
    conclusion: null,
  };

  const raw = String(text || '');
  const taskId = raw.match(TASK_TASK_ID_COMMENT_RE)?.[1]?.trim();
  const agentId = raw.match(TASK_AGENT_ID_COMMENT_RE)?.[1]?.trim();
  const sessionKey = raw.match(TASK_SESSION_KEY_COMMENT_RE)?.[1]?.trim();
  const sessionId = raw.match(TASK_SESSION_ID_COMMENT_RE)?.[1]?.trim();
  const runId = raw.match(TASK_RUN_ID_COMMENT_RE)?.[1]?.trim();
  const dispatchStatus = raw.match(TASK_STATUS_COMMENT_RE)?.[1]?.trim();
  const conclusion = raw.match(TASK_CONCLUSION_COMMENT_RE)?.[1]?.trim();

  if (taskId) parsed.taskId = taskId;
  if (agentId) parsed.agentId = agentId;
  if (sessionKey) parsed.sessionKey = sessionKey;
  if (sessionId) parsed.sessionId = sessionId;
  if (runId) parsed.runId = runId;
  if (dispatchStatus) parsed.dispatchStatus = dispatchStatus;
  if (conclusion) parsed.conclusion = conclusion;
  return parsed;
}

function buildTaskComments(task) {
  const comments = [];
  if (task.taskId) comments.push(`<!-- mc-task-id: ${task.taskId} -->`);
  if (task.agentId) comments.push(`<!-- mc-agent-id: ${task.agentId} -->`);
  if (task.sessionKey) comments.push(`<!-- mc-session-key: ${task.sessionKey} -->`);
  if (task.sessionId) comments.push(`<!-- mc-session-id: ${task.sessionId} -->`);
  if (task.runId) comments.push(`<!-- mc-run-id: ${task.runId} -->`);
  if (task.dispatchStatus) comments.push(`<!-- mc-dispatch-status: ${task.dispatchStatus} -->`);
  if (task.conclusion) {
    const conclusion = String(task.conclusion).replace(/\s+/g, ' ').trim();
    if (conclusion) comments.push(`<!-- mc-conclusion: ${conclusion} -->`);
  }
  return comments.length ? ` ${comments.join(' ')}` : '';
}

function generateTaskId() {
  return `mc-${randomUUID()}`;
}

function toAgentSessionKey(agentId) {
  return `agent:${agentId}:main`;
}

function toTaskSessionId(agentId, taskId) {
  return `agent:${agentId}:mc-task:${taskId}`;
}

function normalizeTaskDisplayText(text) {
  return stripTaskComments(text);
}

function parseTaskLine(line, sectionKey, index) {
  const match = line.match(/^\s*-\s+\[([xX ])\]\s+(.*)$/);
  if (!match) return null;
  const rawText = match[2].trim();
  const meta = parseTaskComments(rawText);
  const text = normalizeTaskDisplayText(rawText);
  return {
    id: meta.taskId || `${sectionKey}-${index + 1}`,
    text,
    checked: match[1].toLowerCase() === 'x',
    section: sectionKey,
    owner: inferTaskOwner(text),
    taskId: meta.taskId,
    agentId: meta.agentId,
    sessionKey: meta.sessionKey,
    sessionId: meta.sessionId,
    runId: meta.runId,
    dispatchStatus: meta.dispatchStatus,
    conclusion: meta.conclusion,
  };
}

function parseTasksMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const document = {
    raw: String(markdown || ''),
    preamble: [],
    blocks: [],
  };

  let currentBlock = null;

  const pushCurrentBlock = () => {
    if (currentBlock) {
      document.blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      pushCurrentBlock();
      const headingText = headingMatch[1].trim();
      currentBlock = {
        headingLine: line,
        headingText,
        canonicalSection: normalizeTaskSection(headingText),
        entries: [],
      };
      continue;
    }

    if (currentBlock) {
      const taskIndex = currentBlock.entries.filter((entry) => entry.kind === 'task').length;
      const task = currentBlock.canonicalSection ? parseTaskLine(line, currentBlock.canonicalSection, taskIndex) : null;
      if (task) {
        currentBlock.entries.push({
          kind: 'task',
          task,
        });
      } else {
        currentBlock.entries.push({
          kind: 'raw',
          line,
        });
      }
    } else {
      document.preamble.push(line);
    }
  }

  pushCurrentBlock();
  return document;
}

function collectTasks(document, executionStore = null) {
  const summary = {
    standby: 0,
    inProgress: 0,
    completed: 0,
    total: 0,
  };

  const sections = {
    standby: [],
    inProgress: [],
    completed: [],
  };

  for (const block of document.blocks) {
    const sectionKey = block.canonicalSection;
    if (!sectionKey || !sections[sectionKey]) continue;

    for (const entry of block.entries) {
      if (entry.kind !== 'task') continue;
      const task = { ...entry.task };
      const record = executionStore?.tasks?.[task.taskId] || null;
      const mergedTask = mergeTaskExecutionView(task, record);
      const liveSection = summarySectionForTask(mergedTask, record);
      sections[liveSection].push(mergedTask);
      summary[liveSection] += 1;
      summary.total += 1;
    }
  }

  return { summary, sections };
}

function stringifyTaskLine(task) {
  return `- [${task.checked ? 'x' : ' '}] ${task.text}${buildTaskComments(task)}`;
}

function createSectionBlock(sectionKey, headingText) {
  return {
    headingLine: `## ${headingText || sectionLabel(sectionKey)}`,
    headingText: headingText || sectionLabel(sectionKey),
    canonicalSection: sectionKey,
    entries: [],
  };
}

function findSectionBlock(document, sectionKey) {
  return document.blocks.find((block) => block.canonicalSection === sectionKey) || null;
}

function findOrCreateSectionBlock(document, sectionKey) {
  const existing = findSectionBlock(document, sectionKey);
  if (existing) return existing;

  const block = createSectionBlock(sectionKey);
  document.blocks.push(block);
  return block;
}

function rebuildMarkdown(document) {
  const output = [...document.preamble];
  while (output.length > 0 && output[0] === '') {
    output.shift();
  }

  for (const block of document.blocks) {
    if (output.length > 0 && output[output.length - 1] !== '') {
      output.push('');
    }

    output.push(block.headingLine || `## ${block.headingText}`);

    for (const entry of block.entries) {
      if (entry.kind === 'task') {
        output.push(stringifyTaskLine(entry.task));
      } else {
        output.push(entry.line);
      }
    }
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
}

function loadTasksDocument() {
  const markdown = fs.existsSync(TASKS_PATH) ? fs.readFileSync(TASKS_PATH, 'utf8') : '';
  const document = parseTasksMarkdown(markdown);
  if (synchronizeTasksDocument(document)) {
    saveTasksDocument(document);
    document.raw = rebuildMarkdown(document);
  }
  syncTaskExecutionStoreFromDocument(document);
  return document;
}

function saveTasksDocument(document) {
  fs.writeFileSync(TASKS_PATH, rebuildMarkdown(document));
}

function synchronizeTasksDocument(document) {
  let changed = false;
  const completedMoves = [];

  for (const block of document.blocks) {
    if (!block.canonicalSection) continue;

    for (let index = block.entries.length - 1; index >= 0; index -= 1) {
      const entry = block.entries[index];
      if (entry.kind !== 'task') continue;

      const task = entry.task;

      if (!task.taskId) {
        task.taskId = generateTaskId();
        changed = true;
      }

      if (!task.id || task.id !== task.taskId) {
        task.id = task.taskId;
        changed = true;
      }

      const normalizedDispatchStatus = normalizeDispatchStatus(task.dispatchStatus);
      if (normalizedDispatchStatus && normalizedDispatchStatus !== task.dispatchStatus) {
        task.dispatchStatus = normalizedDispatchStatus;
        changed = true;
      }

      const conclusion = resolveTaskConclusion(task);
      if (conclusion && conclusion !== task.conclusion) {
        task.conclusion = conclusion;
        changed = true;
      }

      if (task.section !== block.canonicalSection) {
        task.section = block.canonicalSection;
        changed = true;
      }

      if (block.canonicalSection === 'completed') {
        if (task.checked !== true) {
          task.checked = true;
          changed = true;
        }
        continue;
      }

      if (conclusion || isTaskCompleted(task)) {
        block.entries.splice(index, 1);
        task.section = 'completed';
        task.checked = true;
        task.dispatchStatus = 'completed';
        if (!task.conclusion && conclusion) {
          task.conclusion = conclusion;
        }
        completedMoves.push(task);
        changed = true;
      }
    }
  }

  if (completedMoves.length > 0) {
    const completedBlock = findOrCreateSectionBlock(document, 'completed');
    for (const task of completedMoves) {
      completedBlock.entries.push({
        kind: 'task',
        task,
      });
    }
  }

  return changed;
}

function findTaskEntry(block, text) {
  const normalizedText = normalizeTaskDisplayText(text);
  const idx = block.entries.findIndex((entry) => entry.kind === 'task' && entry.task.text === normalizedText);
  if (idx === -1) return null;
  return { index: idx, entry: block.entries[idx] };
}

function findTaskEntryById(document, taskId) {
  if (!taskId) return null;
  for (const block of document.blocks) {
    const idx = block.entries.findIndex(
      (entry) => entry.kind === 'task' && entry.task.taskId === taskId,
    );
    if (idx !== -1) {
      return { block, index: idx, entry: block.entries[idx] };
    }
  }
  return null;
}

function updateTaskEntryMetadata(task, patch = {}) {
  if (patch.taskId !== undefined) task.taskId = patch.taskId;
  if (patch.agentId !== undefined) task.agentId = patch.agentId;
  if (patch.sessionKey !== undefined) task.sessionKey = patch.sessionKey;
  if (patch.sessionId !== undefined) task.sessionId = patch.sessionId;
  if (patch.runId !== undefined) task.runId = patch.runId;
  if (patch.dispatchStatus !== undefined) task.dispatchStatus = patch.dispatchStatus;
  if (patch.conclusion !== undefined) task.conclusion = patch.conclusion;
  return task;
}

function readJsonFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function findSessionRecordByKey(sessionKey) {
  if (!sessionKey) return null;
  const agentsRoot = '/root/.openclaw/agents';
  if (!fs.existsSync(agentsRoot)) return null;

  for (const agentId of fs.readdirSync(agentsRoot)) {
    const storePath = path.join(agentsRoot, agentId, 'sessions', 'sessions.json');
    const store = readJsonFileSafe(storePath);
    if (!store || typeof store !== 'object') continue;

    const record = store[sessionKey];
    if (!record || typeof record !== 'object') continue;

    return {
      agentId,
      storePath,
      ...record,
    };
  }

  return null;
}

function findSessionRecordById(sessionId) {
  if (!sessionId) return null;
  const agentsRoot = '/root/.openclaw/agents';
  if (!fs.existsSync(agentsRoot)) return null;

  for (const agentId of fs.readdirSync(agentsRoot)) {
    const storePath = path.join(agentsRoot, agentId, 'sessions', 'sessions.json');
    const store = readJsonFileSafe(storePath);
    if (!store || typeof store !== 'object') continue;

    for (const [sessionKey, record] of Object.entries(store)) {
      if (!record || typeof record !== 'object') continue;
      if (String(record.sessionId || '').trim() !== String(sessionId).trim()) continue;

      return {
        agentId,
        storePath,
        sessionKey,
        ...record,
      };
    }
  }

  return null;
}

function findSessionRecord(sessionKey, sessionId = null) {
  return findSessionRecordByKey(sessionKey) || findSessionRecordById(sessionId);
}

function extractFinalAssistantText(sessionFilePath) {
  if (!sessionFilePath || !fs.existsSync(sessionFilePath)) return null;

  const lines = fs.readFileSync(sessionFilePath, 'utf8').split(/\r?\n/);
  let finalText = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry?.type !== 'message' || entry?.message?.role !== 'assistant') continue;
    const content = Array.isArray(entry.message.content) ? entry.message.content : [];
    const textParts = content
      .filter((part) => part && part.type === 'text' && typeof part.text === 'string' && part.text.trim())
      .map((part) => part.text.trim());

    if (!textParts.length) continue;
    finalText = textParts.join('\n\n');
  }

  return finalText ? finalText.trim() : null;
}

function resolveTaskConclusion(task) {
  if (!task?.sessionKey && !task?.sessionId) return null;
  const sessionRecord = findSessionRecord(task.sessionKey, task.sessionId);
  if (!sessionRecord) return null;

  const sessionStatus = String(sessionRecord.status || '').trim().toLowerCase();
  if (sessionStatus && sessionStatus !== 'done') return null;

  const candidateSessionFiles = [
    sessionRecord.sessionFile,
    sessionRecord.sessionPath,
    sessionRecord.filePath,
    sessionRecord.sessionId && sessionRecord.storePath
      ? path.join(path.dirname(sessionRecord.storePath), `${sessionRecord.sessionId}.jsonl`)
      : null,
  ].filter((candidate) => typeof candidate === 'string' && candidate.trim());

  let sessionFilePath = candidateSessionFiles.find((candidate) => fs.existsSync(candidate)) || null;
  if (!sessionFilePath) {
    sessionFilePath = resolveTranscriptPath(sessionRecord.sessionFile || sessionRecord.sessionPath || sessionRecord.filePath || null, sessionRecord.agentId || null, sessionRecord.sessionId ? `${sessionRecord.sessionId}.jsonl` : null);
  }

  return extractFinalAssistantText(sessionFilePath);
}

function normalizeTimestampValue(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
}

function summarizeSessionTranscript(sessionFilePath, limit = 12) {
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

    const timestamp = normalizeTimestampValue(entry?.timestamp) || null;

    if (entry?.type === 'message') {
      const role = entry?.message?.role || 'unknown';
      const content = Array.isArray(entry?.message?.content) ? entry.message.content : [];
      const text = content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string' && part.text.trim())
        .map((part) => part.text.trim())
        .join('\n\n')
        .trim();

      entries.push({
        type: 'message',
        role,
        timestamp,
        text: text.slice(0, 600),
      });
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
      continue;
    }
  }

  return entries.slice(-limit);
}

function buildTaskRunFromBoard(task, sessionRecord = null) {
  const sessionFilePath = resolveTranscriptPath(
    sessionRecord?.sessionFile || sessionRecord?.sessionPath || sessionRecord?.filePath || null,
    sessionRecord?.agentId || task?.agentId || null,
    sessionRecord?.sessionId ? `${sessionRecord.sessionId}.jsonl` : null,
  ) || sessionRecord?.sessionFile
    || sessionRecord?.sessionPath
    || sessionRecord?.filePath
    || (sessionRecord?.sessionId && sessionRecord?.storePath
      ? path.join(path.dirname(sessionRecord.storePath), `${sessionRecord.sessionId}.jsonl`)
      : null);
  const finalText = resolveTaskConclusion(task);
  const summary = summarizeSessionTranscript(sessionFilePath, 10);

  return {
    runId: task.runId || sessionRecord?.sessionId || null,
    sessionKey: task.sessionKey || null,
    sessionId: task.sessionId || sessionRecord?.sessionId || null,
    agentId: task.agentId || sessionRecord?.agentId || null,
    status: normalizeExecutionTaskStatus(task.currentStatus || task.dispatchStatus || (task.section === 'completed' ? 'completed' : 'idle')),
    section: task.section || null,
    instruction: task.text || null,
    prompt: task.text || null,
    conclusion: finalText || task.conclusion || null,
    summary,
    sessionFile: sessionFilePath,
    startedAt: normalizeTimestampValue(sessionRecord?.startedAt) || null,
    endedAt: normalizeTimestampValue(sessionRecord?.endedAt) || null,
    updatedAt: normalizeTimestampValue(sessionRecord?.updatedAt) || null,
    runtimeMs: typeof sessionRecord?.runtimeMs === 'number' ? sessionRecord.runtimeMs : null,
    tokens: {
      input: typeof sessionRecord?.inputTokens === 'number' ? sessionRecord.inputTokens : null,
      output: typeof sessionRecord?.outputTokens === 'number' ? sessionRecord.outputTokens : null,
      total: typeof sessionRecord?.totalTokens === 'number' ? sessionRecord.totalTokens : null,
      totalFresh: typeof sessionRecord?.totalTokensFresh === 'number' ? sessionRecord.totalTokensFresh : null,
      cacheRead: typeof sessionRecord?.cacheRead === 'number' ? sessionRecord.cacheRead : null,
      cacheWrite: typeof sessionRecord?.cacheWrite === 'number' ? sessionRecord.cacheWrite : null,
    },
    provider: sessionRecord?.modelProvider || null,
    model: sessionRecord?.model || null,
    source: 'board-sync',
  };
}

function syncTaskExecutionStoreFromDocument(document) {
  let changed = false;
  const store = loadTaskExecutionStore();

  for (const block of document.blocks) {
    if (!block.canonicalSection) continue;

    for (const entry of block.entries) {
      if (entry.kind !== 'task') continue;
      const task = entry.task;
      const taskId = task.taskId;
      if (!taskId) continue;

      const record = ensureTaskRecord(store, taskId, {
        title: task.text,
        currentText: task.text,
        currentSection: null,
        currentStatus: null,
        currentAgentId: task.agentId || null,
        currentSessionKey: task.sessionKey || null,
        currentSessionId: task.sessionId || null,
        currentRunId: task.runId || null,
        currentConclusion: task.conclusion || null,
        boardSection: task.section || block.canonicalSection,
      });

      if (!record) continue;

      const nextText = task.text || record.currentText || '';
      if (record.currentText !== nextText) {
        record.currentText = nextText;
        changed = true;
      }
      if (record.title !== nextText) {
        record.title = nextText;
        changed = true;
      }
      if (record.boardSection !== task.section) {
        record.boardSection = task.section;
        changed = true;
      }
      const boardStatus = task.checked === true || task.section === 'completed'
        ? 'completed'
        : task.dispatchStatus
          ? normalizeExecutionTaskStatus(task.dispatchStatus)
          : task.section === 'inProgress'
            ? 'in_progress'
            : 'idle';
      if (!record.currentStatus || (record.currentStatus === 'idle' && boardStatus !== 'idle')) {
        record.currentStatus = boardStatus;
        changed = true;
      } else {
        const normalizedStatus = normalizeExecutionTaskStatus(record.currentStatus);
        if (normalizedStatus !== record.currentStatus) {
          record.currentStatus = normalizedStatus;
          changed = true;
        }
      }
      if (record.currentAgentId !== (task.agentId || null)) {
        record.currentAgentId = task.agentId || null;
        changed = true;
      }
      if (record.currentSessionKey !== (task.sessionKey || null)) {
        record.currentSessionKey = task.sessionKey || null;
        changed = true;
      }
      if (record.currentSessionId !== (task.sessionId || null)) {
        record.currentSessionId = task.sessionId || null;
        changed = true;
      }
      if (record.currentRunId !== (task.runId || null)) {
        record.currentRunId = task.runId || null;
        changed = true;
      }
      if (record.currentConclusion !== (task.conclusion || null)) {
        record.currentConclusion = task.conclusion || null;
        changed = true;
      }

      const sessionRecord = findSessionRecord(task.sessionKey, task.sessionId);
      const sessionKey = task.sessionKey || null;
      const sessionId = task.sessionId || null;
      const existingRunIndex = sessionKey
        ? record.history.findIndex((run) => run.sessionKey === sessionKey || (task.runId && run.runId === task.runId))
        : -1;
      const shouldSyncRun = Boolean(sessionKey) || task.section === 'completed' || Boolean(task.dispatchStatus);
      const hasExecutionFingerprint = Boolean(sessionKey || sessionId || task.runId);

      if (shouldSyncRun && existingRunIndex === -1 && (hasExecutionFingerprint || record.history.length === 0)) {
        appendTaskRun(store, taskId, buildTaskRunFromBoard(task, sessionRecord));
        changed = true;
      } else if (existingRunIndex !== -1) {
        const existingRun = record.history[existingRunIndex];
        const finalText = resolveTaskConclusion(task);
        let runChanged = false;

        const nextRunPatch = {
          status: normalizeDispatchStatus(task.dispatchStatus) || existingRun.status,
          section: task.section || existingRun.section || null,
          currentSection: task.section || existingRun.currentSection || null,
          currentStatus: normalizeDispatchStatus(task.dispatchStatus) || task.section || existingRun.currentStatus || null,
          instruction: task.text || existingRun.instruction || null,
          conclusion: finalText || task.conclusion || existingRun.conclusion || null,
          sessionId: sessionRecord?.sessionId || existingRun.sessionId || null,
          sessionFile: sessionRecord?.sessionFile || existingRun.sessionFile || null,
          startedAt: normalizeTimestampValue(sessionRecord?.startedAt) || existingRun.startedAt || null,
          endedAt: normalizeTimestampValue(sessionRecord?.endedAt) || existingRun.endedAt || null,
          updatedAt: normalizeTimestampValue(sessionRecord?.updatedAt) || existingRun.updatedAt || null,
        };

        for (const [key, value] of Object.entries(nextRunPatch)) {
          if (existingRun[key] !== value) {
            existingRun[key] = value;
            runChanged = true;
          }
        }

        if (runChanged) changed = true;
      }
    }
  }

  if (changed) saveTaskExecutionStore(store);
  return store;
}

function buildTaskDetailPayload(task, record, boardDocument) {
  const history = Array.isArray(record?.history) ? [...record.history] : [];
  const events = Array.isArray(record?.events) ? [...record.events] : [];
  const currentRun = history.length ? history[history.length - 1] : null;
  const taskBoardSessionRecord = findSessionRecord(task?.sessionKey, task?.sessionId);
  const currentSessionRecord = taskBoardSessionRecord
    || (currentRun?.sessionKey ? findSessionRecord(currentRun.sessionKey, currentRun.sessionId) : null);

  return {
    task: {
      ...task,
      boardSection: task.section,
      currentSection: record?.currentSection || task.section || null,
      currentStatus: normalizeExecutionTaskStatus(record?.currentStatus || task.dispatchStatus || task.section),
      currentText: record?.currentText || task.text || null,
      taskId: task.taskId || task.id,
      sessionId: record?.currentSessionId || task.sessionId || null,
    },
    record: record || null,
    history,
    events,
    currentRun,
    session: currentSessionRecord || currentRun
      ? {
          sessionKey: task.sessionKey || currentRun?.sessionKey || currentSessionRecord?.sessionKey || null,
          sessionId: currentSessionRecord?.sessionId || currentRun?.sessionId || task.sessionId || null,
          status: currentSessionRecord?.status || currentRun?.status || task.dispatchStatus || null,
          startedAt: normalizeTimestampValue(currentSessionRecord?.startedAt || currentRun?.startedAt) || null,
          endedAt: normalizeTimestampValue(currentSessionRecord?.endedAt || currentRun?.endedAt) || null,
          updatedAt: normalizeTimestampValue(currentSessionRecord?.updatedAt || currentRun?.updatedAt) || null,
          runtimeMs: currentSessionRecord?.runtimeMs ?? currentRun?.runtimeMs ?? null,
          tokens: {
            input: currentSessionRecord?.inputTokens ?? currentRun?.tokens?.input ?? null,
            output: currentSessionRecord?.outputTokens ?? currentRun?.tokens?.output ?? null,
            total: currentSessionRecord?.totalTokens ?? currentRun?.tokens?.total ?? null,
            totalFresh: currentSessionRecord?.totalTokensFresh ?? currentRun?.tokens?.totalFresh ?? null,
            cacheRead: currentSessionRecord?.cacheRead ?? currentRun?.tokens?.cacheRead ?? null,
            cacheWrite: currentSessionRecord?.cacheWrite ?? currentRun?.tokens?.cacheWrite ?? null,
          },
          sessionFile: currentSessionRecord?.sessionFile || currentRun?.sessionFile || null,
          summary: summarizeSessionTranscript(resolveTranscriptPath(
            currentSessionRecord?.sessionFile || currentRun?.sessionFile || null,
            currentSessionRecord?.agentId || currentRun?.agentId || task.agentId || null,
            (currentSessionRecord?.sessionId || currentRun?.sessionId) ? `${currentSessionRecord?.sessionId || currentRun?.sessionId}.jsonl` : null,
          ) || currentSessionRecord?.sessionFile || currentRun?.sessionFile || null, 10),
          finalResult:
            extractFinalAssistantText(resolveTranscriptPath(
              currentSessionRecord?.sessionFile || currentRun?.sessionFile || null,
              currentSessionRecord?.agentId || currentRun?.agentId || task.agentId || null,
              (currentSessionRecord?.sessionId || currentRun?.sessionId) ? `${currentSessionRecord?.sessionId || currentRun?.sessionId}.jsonl` : null,
            ) || currentSessionRecord?.sessionFile || currentRun?.sessionFile || null)
            || currentRun?.conclusion
            || task.conclusion
            || null,
        }
      : null,
    boardSections: boardDocument ? collectTasks(boardDocument, loadTaskExecutionStore()).sections : null,
  };
}

function upsertTaskMetadata(document, taskId, patch) {
  const match = findTaskEntryById(document, taskId);
  if (!match) return null;
  updateTaskEntryMetadata(match.entry.task, patch);
  return match.entry.task;
}

function resolveOpenClawCli() {
  for (const candidate of OPENCLAW_CLI_CANDIDATES) {
    if (!candidate) continue;
    if (candidate === 'openclaw') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'openclaw';
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, maxBuffer: options.maxBuffer || 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const error = new Error(
          err.killed && options.timeout
            ? `command timed out after ${options.timeout}ms`
            : String(stderr || err.message || 'command failed'),
        );
        error.cause = err;
        return reject(error);
      }
      resolve({ stdout: stdout ? String(stdout) : '', stderr: stderr ? String(stderr) : '' });
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildOpenClawEnv() {
  const env = { ...process.env };
  const token = getToken();
  if (token) {
    env.OPENCLAW_GATEWAY_TOKEN = token;
  } else {
    delete env.OPENCLAW_GATEWAY_TOKEN;
  }
  return env;
}

function extractDispatchReplyText(parsed) {
  const payloads = Array.isArray(parsed?.payloads)
    ? parsed.payloads
    : Array.isArray(parsed?.result?.payloads)
      ? parsed.result.payloads
      : [];
  const text = payloads
    .map((payload) => String(payload?.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!text) return '';
  if (/^⚠️\s*Agent couldn't generate a response/i.test(text)) return '';
  if (/^Agent couldn't generate a response/i.test(text)) return '';
  return text;
}

function resolveOpenRouterApiKey() {
  if (cachedOpenRouterApiKey !== null) {
    return cachedOpenRouterApiKey;
  }

  const envKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (envKey) {
    cachedOpenRouterApiKey = envKey;
    return cachedOpenRouterApiKey;
  }

  const agentsDir = '/root/.openclaw/agents';
  if (fs.existsSync(agentsDir)) {
    for (const agentId of fs.readdirSync(agentsDir)) {
      const authProfilesPath = path.join(agentsDir, agentId, 'agent', 'auth-profiles.json');
      if (!fs.existsSync(authProfilesPath)) continue;
      try {
        const authProfiles = JSON.parse(fs.readFileSync(authProfilesPath, 'utf8'));
        const profiles = authProfiles?.profiles && typeof authProfiles.profiles === 'object'
          ? authProfiles.profiles
          : {};
        for (const profile of Object.values(profiles)) {
          if (
            profile &&
            typeof profile === 'object' &&
            profile.provider === 'openrouter' &&
            typeof profile.key === 'string' &&
            profile.key.trim()
          ) {
            cachedOpenRouterApiKey = profile.key.trim();
            return cachedOpenRouterApiKey;
          }
        }
      } catch {
        // Ignore malformed auth profile files and keep searching.
      }
    }
  }

  cachedOpenRouterApiKey = '';
  return cachedOpenRouterApiKey;
}

async function runPromptGeneration(idea, context = {}) {
  const prompt = [
    'Transforma a ideia abaixo num prompt operacional curto, claro e accionável para um agente.',
    'Requisitos:',
    '- Escreve em português.',
    '- Mantém instruções concretas, sem floreados.',
    '- Inclui objetivo, contexto, passos e definição de pronto.',
    '- Não inventes informação que não esteja na ideia.',
    '- Devolve apenas o prompt final, sem explicações nem markdown envolvente.',
    '',
    `Agente: ${context.agentId || 'não selecionado'}`,
    `Secção: ${context.section || 'Standby'}`,
    '',
    'Ideia:',
    String(idea || '').trim(),
  ].join('\n');

  const openRouterApiKey = resolveOpenRouterApiKey();
  if (openRouterApiKey) {
    try {
      const controller = new AbortController();
      const timeoutMs = 15_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://127.0.0.1:4000',
            'X-Title': 'Mission Hub',
          },
          body: JSON.stringify({
            model: context.model || 'openrouter/free',
            messages: [
              {
                role: 'system',
                content: 'Transforma a ideia em um prompt operacional claro, conciso e accionável. Responde apenas com o prompt final.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.2,
            max_tokens: 500,
          }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        const content = data?.choices?.[0]?.message?.content;
        const cleaned = String(content || '').trim();
        if (!response.ok) {
          throw new Error(`OpenRouter ${response.status}: ${String(data?.error?.message || data?.message || 'request failed')}`);
        }
        if (cleaned) {
          return {
            prompt: cleaned,
            transport: 'openrouter',
            provider: 'openrouter',
            model: String(data?.model || context.model || 'openrouter/free'),
          };
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      console.warn('[tasks] openrouter prompt generation failed:', String(error));
    }
  }

  const cli = resolveOpenClawCli();
  const args = ['capability', 'model', 'run', '--gateway', '--json', '--prompt', prompt];
  if (context.model) {
    args.push('--model', context.model);
  }

  const runs = [
    { label: 'gateway', args, timeout: 12000 },
    { label: 'local', args: ['capability', 'model', 'run', '--json', '--prompt', prompt], timeout: 6000 },
  ];

  for (const attempt of runs) {
    try {
      const result = await execFileAsync(cli, attempt.args, {
        env: buildOpenClawEnv(),
        timeout: attempt.timeout,
      });
      const parsed = JSON.parse(result.stdout || '{}');
      const generated = parsed?.outputs?.[0]?.text || parsed?.payloads?.[0]?.text || '';
      const cleaned = String(generated || '').trim();
      if (cleaned) {
        return {
          prompt: cleaned,
          transport: attempt.label,
          provider: parsed?.provider || parsed?.result?.meta?.agentMeta?.provider || null,
          model: parsed?.model || parsed?.result?.meta?.agentMeta?.model || null,
        };
      }
    } catch (error) {
      console.warn('[tasks] prompt generation attempt failed:', attempt.label, String(error));
    }
  }

  const fallback = [
    `Tarefa: ${String(idea || '').trim()}`,
    '',
    'Contexto:',
    '- Expande a ideia em passos concretos.',
    '- Mantém o foco em implementação real no Mission Control.',
    '- Se faltar contexto, faz suposições mínimas e explícitas.',
    '',
    'Definição de pronto:',
    '- A tarefa foi executada e validada.',
  ].join('\n');

  return {
    prompt: fallback,
    transport: 'fallback',
    provider: null,
    model: null,
  };
}

async function runAgentDispatch(params) {
  const cli = resolveOpenClawCli();
  const args = [
    'agent',
    '--agent',
    params.agentId,
    '--message',
    params.message,
    '--json',
  ];
  if (params.sessionId) {
    args.push('--session-id', params.sessionId);
  }
  if (params.thinking) {
    args.push('--thinking', params.thinking);
  }

  console.info('[tasks][dispatch] sending', JSON.stringify({
    agentId: params.agentId,
    taskId: params.taskId,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    idempotencyKey: params.idempotencyKey,
  }));

  let stdout;
  let stderr;
  if (params.useLoginShell) {
    const command = [cli, ...args.map(shellQuote)].join(' ');
    ({ stdout, stderr } = await execFileAsync('bash', ['-lc', command], {
      env: buildOpenClawEnv(),
      timeout: 120000,
    }));
  } else {
    ({ stdout, stderr } = await execFileAsync(cli, args, {
      env: buildOpenClawEnv(),
      timeout: 120000,
    }));
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout || '{}');
  } catch (error) {
    console.warn('[tasks][dispatch] invalid json stdout:', String(stdout || '').slice(0, 500));
    console.warn('[tasks][dispatch] stderr:', String(stderr || '').slice(0, 500));
    throw new Error(`OpenClaw dispatch returned invalid JSON: ${String(error?.message || error)}`);
  }

  const replyText = extractDispatchReplyText(parsed);
  const sessionMeta = parsed?.meta?.agentMeta || {};
  const resultMeta = parsed?.result?.meta || {};
  const sessionKey = String(
    sessionMeta.sessionKey ||
    resultMeta.systemPromptReport?.sessionKey ||
    params.sessionKey ||
    '',
  ).trim() || null;
  const sessionId = String(
    sessionMeta.sessionId ||
    resultMeta.agentMeta?.sessionId ||
    params.sessionId ||
    '',
  ).trim() || null;

  if (!replyText) {
    console.warn('[tasks][dispatch] no reply parsed:', JSON.stringify({
      agentId: params.agentId,
      sessionId: sessionId || null,
      sessionKey: sessionKey || null,
      status: parsed?.status || null,
      summary: parsed?.summary || null,
      stopReason: parsed?.result?.stopReason || parsed?.result?.completion?.stopReason || null,
      finishReason: parsed?.result?.completion?.finishReason || null,
      payloadCount: Array.isArray(parsed?.result?.payloads) ? parsed.result.payloads.length : null,
      stdout: String(stdout || '').slice(0, 1000),
      stderr: String(stderr || '').slice(0, 1000),
    }));
    const errorText = String(stderr || parsed?.error || parsed?.message || 'OpenClaw dispatch produced no reply');
    throw new Error(errorText);
  }

  return {
    ...parsed,
    replyText,
    sessionKey,
    sessionId,
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/state', async (req, res) => {
  try {
    const activityLimit = Number(req.query?.activityLimit) || 100;
    const sessionLimit = Number(req.query?.sessionLimit) || 100;
    const state = await buildOpenClawState({ fetchImpl: fetch, token: getToken(), activityLimit, sessionLimit });
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const limit = Number(req.query?.limit) || 50;
    const feed = await getNotificationsFeed({ fetchImpl: fetch, token: getToken(), limit });
    res.json({
      ok: true,
      ...feed,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'openclaw-activity',
      warnings: [],
      errors: [String(e?.message || e)],
      totalCount: 0,
      unreadCount: 0,
      items: [],
    });
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const all = req.body?.all === true || req.body?.markAll === true;
    if (!all && ids.length === 0) {
      return res.status(400).json({ error: 'ids or all=true are required' });
    }
    const result = await markNotificationsRead({
      ids,
      all,
      fetchImpl: fetch,
      token: getToken(),
      limit: Number(req.body?.limit) || 50,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/vps/snapshot', async (req, res) => {
  try {
    const snapshot = await getVpsSnapshot();
    res.json(snapshot);
  } catch (error) {
    const message = error?.message || String(error);
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'system',
      warnings: [],
      errors: [message],
      host: {
        hostname: require('os').hostname(),
        uptime: null,
        cpuPercent: null,
        ramUsed: null,
        ramTotal: null,
        ramPercent: null,
        diskUsedPercent: null,
      },
      containers: [],
      docker: {
        total: null,
        healthy: null,
        unhealthy: null,
      },
    });
  }
});

app.get('/api/vps', async (req, res) => {
  try {
    const snapshot = await getVpsSnapshot();
    const fail2ban = await getFail2banBanned();
    res.json(toLegacyVpsPayload(snapshot, fail2ban));
  } catch (error) {
    console.error('Error in /api/vps:', error);
    const message = error?.message || String(error);
    res.status(500).json({
      cpu: 0,
      ram: 0,
      ramRaw: '0/0',
      disk: 0,
      uptime: 'N/A',
      containers: [],
      banned: '0',
      bannedList: [],
      warnings: [],
      errors: [message],
    });
  }
});

app.get('/api/fail2ban/stats', async (req, res) => {
  try {
    res.json(await getFail2banStats());
  } catch (error) {
    const message = error?.message || String(error);
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'fail2ban',
      warnings: [],
      errors: [message],
      totalBanned: null,
      bannedCount: null,
      currentBannedCount: null,
      jailsActive: null,
    });
  }
});

app.get('/api/fail2ban/jails', async (req, res) => {
  try {
    res.json(await getFail2banJails());
  } catch (error) {
    const message = error?.message || String(error);
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'fail2ban',
      warnings: [],
      errors: [message],
      jailsActive: null,
      jails: [],
    });
  }
});

app.get('/api/fail2ban/banned', async (req, res) => {
  try {
    res.json(await getFail2banBanned());
  } catch (error) {
    const message = error?.message || String(error);
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'fail2ban',
      warnings: [],
      errors: [message],
      totalBanned: null,
      bannedCount: null,
      currentBannedCount: null,
      bannedList: [],
    });
  }
});

app.get('/api/fail2ban/history', async (req, res) => {
  try {
    res.json(await getFail2banHistory());
  } catch (error) {
    const message = error?.message || String(error);
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'fail2ban.log',
      retentionLimited: true,
      warnings: [],
      errors: [message],
      files: [],
      firstSeenAt: null,
      lastSeenAt: null,
      totalUniqueIps: 0,
      history: [],
    });
  }
});

app.get('/api/fail2ban/logs', async (req, res) => {
  try {
    res.json(await getFail2banHistory());
  } catch (error) {
    const message = error?.message || String(error);
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'fail2ban.log',
      retentionLimited: true,
      warnings: [],
      errors: [message],
      files: [],
      firstSeenAt: null,
      lastSeenAt: null,
      totalUniqueIps: 0,
      history: [],
    });
  }
});

app.get('/api/fail2ban/seen', async (req, res) => {
  try {
    res.json(await getFail2banHistory());
  } catch (error) {
    const message = error?.message || String(error);
    res.status(500).json({
      ok: false,
      collectedAt: new Date().toISOString(),
      source: 'fail2ban.log',
      retentionLimited: true,
      warnings: [],
      errors: [message],
      files: [],
      firstSeenAt: null,
      lastSeenAt: null,
      totalUniqueIps: 0,
      history: [],
    });
  }
});

app.get('/api/tasks', (req, res) => {
  try {
    const document = loadTasksDocument();
    const executionStore = loadTaskExecutionStore();
    const { summary, sections } = collectTasks(document, executionStore);
    res.json({ summary, sections, raw: document.raw });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks/generate-prompt', async (req, res) => {
  try {
    const idea = String(req.body?.idea || req.body?.text || '').trim();
    if (!idea) {
      return res.status(400).json({ error: 'Idea is required' });
    }
    const section = normalizeTaskSection(req.body?.section) || 'standby';
    const model = String(req.body?.model || 'openrouter/free').trim() || 'openrouter/free';
    const result = await runPromptGeneration(idea, {
      agentId: String(req.body?.agentId || '').trim() || null,
      section: sectionLabel(section),
      model,
    });
    res.json({
      ok: true,
      prompt: result.prompt,
      transport: result.transport,
      provider: result.provider,
      model: result.model,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/dispatch', async (req, res) => {
  try {
    const idea = String(req.body?.idea || '').trim();
    const prompt = String(req.body?.prompt || '').trim();
    const agentId = String(req.body?.agentId || '').trim();
    const section = normalizeTaskSection(req.body?.section);
    const providedTaskId = String(req.body?.taskId || '').trim();

    if (!idea || !prompt || !agentId || !section) {
      return res.status(400).json({
        error: 'Idea, prompt, agentId, and section are required',
      });
    }

    const document = loadTasksDocument();
    const taskId = providedTaskId || generateTaskId();
    const runId = `task:${taskId}:run:${randomUUID()}`;
    const sessionKey = toAgentSessionKey(agentId);
    const sessionId = toTaskSessionId(agentId, taskId);
    const taskText = idea;
    const sectionBlock = findOrCreateSectionBlock(document, section);
    const existingTaskRef = findTaskEntryById(document, taskId);
    const targetTaskRef = existingTaskRef || { block: sectionBlock, index: -1, entry: null };
    const executionStore = loadTaskExecutionStore();
    const previousSection = existingTaskRef?.entry?.task?.section || null;

    let taskRecord = existingTaskRef?.entry?.task || null;
    const hadTaskBefore = Boolean(taskRecord);
    if (!taskRecord) {
      taskRecord = {
        id: taskId,
        taskId,
        text: taskText,
        checked: false,
        section,
        owner: inferTaskOwner(taskText),
        agentId,
        sessionKey,
        sessionId,
        runId,
        dispatchStatus: 'queued',
        conclusion: null,
      };
      targetTaskRef.block.entries.push({
        kind: 'task',
        task: taskRecord,
      });
    } else {
      if (existingTaskRef.block !== sectionBlock) {
        existingTaskRef.block.entries.splice(existingTaskRef.index, 1);
        sectionBlock.entries.push({
          kind: 'task',
          task: taskRecord,
        });
      }
      taskRecord.text = taskText || taskRecord.text;
      taskRecord.section = section;
      taskRecord.owner = inferTaskOwner(taskRecord.text);
      taskRecord.agentId = agentId;
      taskRecord.sessionKey = sessionKey;
      taskRecord.sessionId = sessionId;
      taskRecord.runId = runId;
      taskRecord.dispatchStatus = 'queued';
      taskRecord.conclusion = null;
      taskRecord.checked = false;
    }

    const taskStoreRecord = ensureTaskRecord(executionStore, taskId, {
      title: taskRecord.text,
      currentText: taskRecord.text,
      currentSection: section,
      currentStatus: 'in_progress',
      currentAgentId: agentId,
      currentSessionKey: sessionKey,
      currentSessionId: sessionId,
      currentRunId: runId,
      currentConclusion: null,
      boardSection: section,
    });
    appendTaskEvent(executionStore, taskId, {
      type: hadTaskBefore ? (previousSection === 'completed' ? 'reopened' : 'dispatch_requested') : 'created',
      agentId,
      sessionKey,
      sessionId,
      runId,
      section,
      text: taskRecord.text,
      prompt,
    });
    if (taskStoreRecord) {
      taskStoreRecord.currentText = taskRecord.text;
      taskStoreRecord.currentSection = section;
      taskStoreRecord.currentStatus = 'in_progress';
      taskStoreRecord.currentAgentId = agentId;
      taskStoreRecord.currentSessionKey = sessionKey;
      taskStoreRecord.currentSessionId = sessionId;
      taskStoreRecord.currentRunId = runId;
      taskStoreRecord.currentConclusion = null;
      taskStoreRecord.boardSection = section;
    }
    saveTaskExecutionStore(executionStore);
    saveTasksDocument(document);

    try {
      const dispatchResult = await runAgentDispatch({
        message: prompt,
        sessionKey,
        sessionId,
        idempotencyKey: runId,
        agentId,
        taskId,
      });

      const replyText = dispatchResult.replyText;
      const completedSection = findOrCreateSectionBlock(document, 'completed');
      if (taskRecord.section !== 'completed') {
        const currentTaskRef = findTaskEntryById(document, taskId);
        if (currentTaskRef && currentTaskRef.block !== completedSection) {
          currentTaskRef.block.entries.splice(currentTaskRef.index, 1);
          completedSection.entries.push({
            kind: 'task',
            task: taskRecord,
          });
        }
      }

      taskRecord.section = 'completed';
      taskRecord.checked = true;
      taskRecord.sessionKey = dispatchResult.sessionKey || sessionKey;
      taskRecord.sessionId = dispatchResult.sessionId || sessionId;
      taskRecord.runId = dispatchResult?.runId ? String(dispatchResult.runId) : runId;
      taskRecord.dispatchStatus = 'completed';
      taskRecord.conclusion = replyText;

      updateTaskEntryMetadata(taskRecord, {
        taskId,
        agentId,
        sessionKey: dispatchResult.sessionKey || sessionKey,
        sessionId: dispatchResult.sessionId || sessionId,
        runId: dispatchResult?.runId ? String(dispatchResult.runId) : runId,
        dispatchStatus: 'completed',
        conclusion: replyText,
      });
      appendTaskEvent(executionStore, taskId, {
        type: 'completed',
        agentId,
        sessionKey: dispatchResult.sessionKey || sessionKey,
        sessionId: dispatchResult.sessionId || sessionId,
        runId: dispatchResult?.runId ? String(dispatchResult.runId) : runId,
        section: 'completed',
        status: 'completed',
        text: taskRecord.text,
        prompt,
        note: 'Agent reply captured and task completed',
      });
      appendTaskRun(executionStore, taskId, {
        runId: dispatchResult?.runId ? String(dispatchResult.runId) : runId,
        sessionKey: dispatchResult.sessionKey || sessionKey,
        sessionId: dispatchResult.sessionId || sessionId,
        agentId,
        status: 'completed',
        section: 'completed',
        instruction: taskRecord.text,
        prompt,
        conclusion: replyText,
        currentText: taskRecord.text,
        currentSection: 'completed',
        currentStatus: 'completed',
        startedAt: null,
        endedAt: null,
        updatedAt: null,
        runtimeMs: null,
        tokens: null,
        provider: dispatchResult?.meta?.agentMeta?.provider || dispatchResult?.provider || null,
        model: dispatchResult?.meta?.agentMeta?.model || dispatchResult?.model || null,
        source: 'dispatch',
      });
      saveTaskExecutionStore(executionStore);
      saveTasksDocument(document);

      res.json({
        ok: true,
        task: taskRecord,
        dispatch: dispatchResult,
      });
    } catch (dispatchError) {
      updateTaskEntryMetadata(taskRecord, {
        taskId,
        agentId,
        sessionKey,
        sessionId,
        dispatchStatus: 'failed',
        conclusion: null,
      });
      appendTaskEvent(executionStore, taskId, {
        type: 'dispatch_failed',
        agentId,
        sessionKey,
        sessionId,
        runId,
        section,
        error: String(dispatchError?.message || dispatchError),
      });
      appendTaskRun(executionStore, taskId, {
        runId,
        sessionKey,
        sessionId,
        agentId,
        status: 'error',
        section,
        instruction: taskRecord?.text || taskText,
        prompt,
        conclusion: null,
        currentText: taskRecord?.text || taskText,
        currentSection: section,
        currentStatus: 'error',
        startedAt: null,
        endedAt: null,
        updatedAt: null,
        runtimeMs: null,
        tokens: null,
        provider: null,
        model: null,
        source: 'dispatch',
      });
      saveTaskExecutionStore(executionStore);
      saveTasksDocument(document);
      throw dispatchError;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks - Add a new task to a section
app.post('/api/tasks', (req, res) => {
  try {
    const { section, text, taskId } = req.body;
    if (!section || !text) {
      return res.status(400).json({ error: 'Section and text are required' });
    }
    const normalizedSection = normalizeTaskSection(section);
    if (!normalizedSection) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    const document = loadTasksDocument();
    const resolvedTaskId = String(taskId || '').trim() || generateTaskId();
    const sectionBlock = findOrCreateSectionBlock(document, normalizedSection);
    const taskRecord = {
      id: resolvedTaskId,
      taskId: resolvedTaskId,
      text: String(text).trim(),
      checked: false,
      section: normalizedSection,
      owner: inferTaskOwner(String(text).trim()),
    };
    sectionBlock.entries.push({
        kind: 'task',
        task: taskRecord,
    });
    const executionStore = loadTaskExecutionStore();
    ensureTaskRecord(executionStore, resolvedTaskId, {
      title: taskRecord.text,
      currentText: taskRecord.text,
      currentSection: normalizedSection,
      currentStatus: 'idle',
      boardSection: normalizedSection,
    });
    appendTaskEvent(executionStore, resolvedTaskId, {
      type: 'created',
      section: normalizedSection,
      text: taskRecord.text,
    });
    saveTaskExecutionStore(executionStore);
    saveTasksDocument(document);
    res.json({ success: true, task: taskRecord });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tasks - Remove a task from a section
app.delete('/api/tasks', (req, res) => {
  try {
    const { section, text, taskId } = req.body;
    if (!section && !taskId) {
      return res.status(400).json({ error: 'Section or taskId is required' });
    }
    const normalizedSection = section ? normalizeTaskSection(section) : null;
    if (section && !normalizedSection) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    if (!fs.existsSync(TASKS_PATH)) {
      return res.status(404).json({ error: 'Tasks file not found' });
    }
    const document = loadTasksDocument();
    let removed = false;

    if (taskId) {
      const taskRef = findTaskEntryById(document, String(taskId).trim());
      if (taskRef) {
        taskRef.block.entries.splice(taskRef.index, 1);
        removed = true;
      }
    } else {
      for (const block of document.blocks) {
        if (block.canonicalSection !== normalizedSection) continue;
        const taskRef = findTaskEntry(block, String(text).trim());
        if (!taskRef) continue;
        block.entries.splice(taskRef.index, 1);
        removed = true;
        break;
      }
    }

    if (!removed) {
      return res.status(404).json({ error: 'Task not found in section' });
    }

    const executionStore = loadTaskExecutionStore();
    const deletedRecord = ensureTaskRecord(executionStore, String(taskId || '').trim(), {});
    if (deletedRecord) {
      deletedRecord.deletedAt = new Date().toISOString();
    }
    if (taskId) {
      appendTaskEvent(executionStore, String(taskId).trim(), {
        type: 'deleted',
        section: normalizedSection || null,
        text: String(text || '').trim() || null,
      });
    }
    saveTaskExecutionStore(executionStore);
    saveTasksDocument(document);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tasks - Move a task between sections
app.patch('/api/tasks', (req, res) => {
  try {
    const { section, text, taskId, newSection, newText } = req.body;
    const hasTextUpdate = newText !== undefined;
    if ((!newSection && !hasTextUpdate) || (!section && !taskId)) {
      return res.status(400).json({ error: 'section/taskId and newSection or newText are required' });
    }
    const sourceSection = section ? normalizeTaskSection(section) : null;
    const targetSection = normalizeTaskSection(newSection);
    if ((section && !sourceSection) || (newSection && !targetSection)) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    if (!fs.existsSync(TASKS_PATH)) {
      return res.status(404).json({ error: 'Tasks file not found' });
    }
    const document = loadTasksDocument();
    const executionStore = loadTaskExecutionStore();
    let movedTask = null;
    let sourceBlock = null;
    let sourceIndex = null;
    let previousSection = null;

    if (taskId) {
      const taskRef = findTaskEntryById(document, String(taskId).trim());
      if (taskRef) {
        movedTask = taskRef.entry.task;
        sourceBlock = taskRef.block;
        sourceIndex = taskRef.index;
        previousSection = taskRef.entry.task.section || taskRef.block.canonicalSection || null;
        taskRef.block.entries.splice(taskRef.index, 1);
      }
    } else {
      for (const block of document.blocks) {
        if (block.canonicalSection !== sourceSection) continue;
        const taskRef = findTaskEntry(block, String(text).trim());
        if (!taskRef) continue;
        movedTask = taskRef.entry.task;
        sourceBlock = block;
        sourceIndex = taskRef.index;
        previousSection = taskRef.entry.task.section || block.canonicalSection || null;
        block.entries.splice(taskRef.index, 1);
        break;
      }
    }

    if (!movedTask) {
      return res.status(404).json({ error: 'Task not found in section' });
    }

    if (hasTextUpdate) {
      const nextText = String(newText).trim();
      if (!nextText) {
        return res.status(400).json({ error: 'newText cannot be empty' });
      }
      movedTask.text = nextText;
      movedTask.owner = inferTaskOwner(nextText);
    }

    if (targetSection) {
      movedTask.section = targetSection;
      if (targetSection !== 'completed') {
        movedTask.checked = false;
        movedTask.sessionKey = null;
        movedTask.runId = null;
        movedTask.dispatchStatus = null;
        movedTask.conclusion = null;
      }
      const targetBlock = findOrCreateSectionBlock(document, targetSection);
      targetBlock.entries.push({
        kind: 'task',
        task: movedTask,
      });
    } else {
      const targetBlock = sourceBlock || findOrCreateSectionBlock(document, movedTask.section || sourceSection);
      const insertIndex = typeof sourceIndex === 'number' && sourceIndex >= 0 ? sourceIndex : targetBlock.entries.length;
      targetBlock.entries.splice(Math.min(insertIndex, targetBlock.entries.length), 0, {
        kind: 'task',
        task: movedTask,
      });
    }

    const existingRecord = executionStore.tasks?.[movedTask.taskId || movedTask.id] || null;
    const nextCurrentStatus = targetSection === 'completed'
      ? 'completed'
      : normalizeExecutionTaskStatus(existingRecord?.currentStatus || movedTask.currentStatus || 'idle');
    const taskStoreRecord = ensureTaskRecord(executionStore, movedTask.taskId || movedTask.id, {
      title: movedTask.text,
      currentText: movedTask.text,
      currentSection: existingRecord?.currentSection || movedTask.section || sourceSection || null,
      currentStatus: nextCurrentStatus,
      currentAgentId: movedTask.agentId || null,
      currentSessionKey: movedTask.sessionKey || null,
      currentRunId: movedTask.runId || null,
      currentConclusion: movedTask.conclusion || null,
      boardSection: movedTask.section || sourceSection || null,
    });
    if (taskStoreRecord) {
      taskStoreRecord.currentText = movedTask.text;
      taskStoreRecord.boardSection = movedTask.section || sourceSection || null;
      taskStoreRecord.currentSection = existingRecord?.currentSection || taskStoreRecord.currentSection || movedTask.section || sourceSection || null;
      taskStoreRecord.currentStatus = nextCurrentStatus;
      taskStoreRecord.currentAgentId = movedTask.agentId || null;
      taskStoreRecord.currentSessionKey = movedTask.sessionKey || null;
      taskStoreRecord.currentRunId = movedTask.runId || null;
      taskStoreRecord.currentConclusion = movedTask.conclusion || null;
    }
    appendTaskEvent(executionStore, movedTask.taskId || movedTask.id, {
      type: hasTextUpdate ? 'edited' : (previousSection === 'completed' && targetSection !== 'completed' ? 'reopened' : 'moved'),
      fromSection: previousSection,
      toSection: targetSection || previousSection,
      text: movedTask.text,
    });
    saveTaskExecutionStore(executionStore);
    saveTasksDocument(document);
    res.json({ success: true, task: movedTask });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tasks/:taskId/details', (req, res) => {
  try {
    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const document = loadTasksDocument();
    const taskRef = findTaskEntryById(document, taskId);
    if (!taskRef) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskRef.entry.task;
    const store = loadTaskExecutionStore();
    const record = ensureTaskRecord(store, taskId, {
      title: task.text,
      currentText: task.text,
      currentSection: task.section || taskRef.block.canonicalSection || null,
      currentStatus: task.section || taskRef.block.canonicalSection || null,
      currentAgentId: task.agentId || null,
      currentSessionKey: task.sessionKey || null,
      currentRunId: task.runId || null,
      currentConclusion: task.conclusion || null,
    });

    if (record && (!Array.isArray(record.history) || record.history.length === 0) && (task.sessionKey || task.dispatchStatus || task.conclusion || task.section === 'completed')) {
      appendTaskRun(store, taskId, buildTaskRunFromBoard(task, task.sessionKey ? findSessionRecordByKey(task.sessionKey) : null));
      saveTaskExecutionStore(store);
    }

    const refreshedStore = loadTaskExecutionStore();
    const refreshedRecord = refreshedStore.tasks?.[taskId] || record || null;
    res.json({
      ok: true,
      storePath: TASK_EXECUTIONS_STORE_PATH,
      ...buildTaskDetailPayload(task, refreshedRecord, document),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/:taskId/reopen', (req, res) => {
  try {
    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const nextText = String(req.body?.text || req.body?.instruction || '').trim();
    const targetSection = normalizeTaskSection(req.body?.section) || 'inProgress';
    if (!targetSection) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    const document = loadTasksDocument();
    const taskRef = findTaskEntryById(document, taskId);
    if (!taskRef) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskRef.entry.task;
    const previousSection = task.section || taskRef.block.canonicalSection || null;
    if (nextText) {
      task.text = nextText;
      task.owner = inferTaskOwner(nextText);
    }

    task.checked = false;
    task.section = targetSection;
    if (targetSection !== 'completed') {
      task.sessionKey = null;
      task.runId = null;
      task.dispatchStatus = null;
      task.conclusion = null;
    }

    if (taskRef.block !== findOrCreateSectionBlock(document, targetSection)) {
      taskRef.block.entries.splice(taskRef.index, 1);
      findOrCreateSectionBlock(document, targetSection).entries.push({
        kind: 'task',
        task,
      });
    }

    const store = loadTaskExecutionStore();
    const record = ensureTaskRecord(store, taskId, {
      title: task.text,
      currentText: task.text,
      currentSection: targetSection,
      currentStatus: 'idle',
      currentAgentId: task.agentId || null,
      currentSessionKey: null,
      currentRunId: null,
      currentConclusion: null,
      boardSection: targetSection,
    });
    if (record) {
      record.currentText = task.text;
      record.currentSection = targetSection;
      record.currentStatus = 'idle';
      record.currentSessionKey = null;
      record.currentRunId = null;
      record.currentConclusion = null;
      record.currentAgentId = task.agentId || record.currentAgentId || null;
      record.boardSection = targetSection;
    }
    appendTaskEvent(store, taskId, {
      type: 'reopened',
      fromSection: previousSection,
      toSection: targetSection,
      text: task.text,
      note: nextText ? 'Text updated during reopen' : 'Reopened without text change',
    });
    saveTaskExecutionStore(store);
    saveTasksDocument(document);
    res.json({
      ok: true,
      task,
      execution: buildTaskDetailPayload(task, record, document),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tasks/:taskId/follow-up', async (req, res) => {
  try {
    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const document = loadTasksDocument();
    const taskRef = findTaskEntryById(document, taskId);
    if (!taskRef) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskRef.entry.task;
    const previousSection = task.section || taskRef.block.canonicalSection || null;
    const store = loadTaskExecutionStore();
    const existingRecord = store.tasks?.[taskId] || null;
    const agentId = String(req.body?.agentId || task.agentId || existingRecord?.currentAgentId || '').trim();
    const instruction = String(req.body?.instruction || req.body?.idea || req.body?.text || task.text || '').trim();
    const prompt = String(req.body?.prompt || '').trim() || instruction;
    const section = normalizeTaskSection(req.body?.section) || 'inProgress';

    if (!instruction || !prompt || !agentId) {
      return res.status(400).json({ error: 'instruction, prompt and agentId are required' });
    }

    const runId = `task:${taskId}:run:${randomUUID()}`;
    const sessionKey = toAgentSessionKey(agentId);
    const sessionId = toTaskSessionId(agentId, taskId);

    task.text = instruction;
    task.owner = inferTaskOwner(instruction);
    task.agentId = agentId;
    task.checked = false;
    task.section = section;
    task.sessionKey = sessionKey;
    task.sessionId = sessionId;
    task.runId = null;
    task.dispatchStatus = 'queued';
    task.conclusion = null;
    if (taskRef.block !== findOrCreateSectionBlock(document, section)) {
      taskRef.block.entries.splice(taskRef.index, 1);
      findOrCreateSectionBlock(document, section).entries.push({
        kind: 'task',
        task,
      });
    }

    const record = ensureTaskRecord(store, taskId, {
      title: instruction,
      currentText: instruction,
      currentSection: section,
      currentStatus: 'in_progress',
      currentAgentId: agentId,
      currentSessionKey: sessionKey,
      currentSessionId: sessionId,
      currentRunId: runId,
      currentConclusion: null,
      boardSection: section,
    });
    appendTaskEvent(store, taskId, {
      type: previousSection === 'completed' ? 'reopened' : 'follow_up_requested',
      fromSection: previousSection,
      toSection: section,
      agentId,
      sessionKey,
      sessionId,
      runId,
      text: instruction,
      prompt,
    });
    saveTaskExecutionStore(store);
    saveTasksDocument(document);

    try {
      const dispatchResult = await runAgentDispatch({
        message: prompt,
        sessionKey,
        sessionId,
        idempotencyKey: runId,
        agentId,
        taskId,
      });

      const replyText = dispatchResult.replyText;
      const completedSection = findOrCreateSectionBlock(document, 'completed');
      if (task.section !== 'completed') {
        const currentTaskRef = findTaskEntryById(document, taskId);
        if (currentTaskRef && currentTaskRef.block !== completedSection) {
          currentTaskRef.block.entries.splice(currentTaskRef.index, 1);
          completedSection.entries.push({
            kind: 'task',
            task,
          });
        }
      }

      task.section = 'completed';
      task.checked = true;
      task.sessionKey = dispatchResult.sessionKey || sessionKey;
      task.sessionId = dispatchResult.sessionId || sessionId;
      task.runId = dispatchResult?.runId ? String(dispatchResult.runId) : runId;
      task.dispatchStatus = 'completed';
      task.conclusion = replyText;

      updateTaskEntryMetadata(task, {
        taskId,
        agentId,
        sessionKey: dispatchResult.sessionKey || sessionKey,
        sessionId: dispatchResult.sessionId || sessionId,
        runId: dispatchResult?.runId ? String(dispatchResult.runId) : runId,
        dispatchStatus: 'completed',
        conclusion: replyText,
      });

      appendTaskEvent(store, taskId, {
        type: 'completed',
        fromSection: previousSection,
        toSection: 'completed',
        agentId,
        sessionKey: dispatchResult.sessionKey || sessionKey,
        sessionId: dispatchResult.sessionId || sessionId,
        runId: dispatchResult?.runId ? String(dispatchResult.runId) : runId,
        status: 'completed',
        text: task.text,
        prompt,
        note: 'Agent reply captured and task completed',
      });
      appendTaskRun(store, taskId, {
        runId: dispatchResult?.runId ? String(dispatchResult.runId) : runId,
        sessionKey: dispatchResult.sessionKey || sessionKey,
        sessionId: dispatchResult.sessionId || sessionId,
        agentId,
        status: 'completed',
        section: 'completed',
        instruction,
        prompt,
        conclusion: replyText,
        currentText: instruction,
        currentSection: 'completed',
        currentStatus: 'completed',
        startedAt: null,
        endedAt: null,
        updatedAt: null,
        runtimeMs: null,
        tokens: null,
        provider: dispatchResult?.meta?.agentMeta?.provider || dispatchResult?.provider || null,
        model: dispatchResult?.meta?.agentMeta?.model || dispatchResult?.model || null,
        source: 'follow-up',
      });
      saveTaskExecutionStore(store);
      saveTasksDocument(document);

      res.json({
        ok: true,
        task,
        dispatch: dispatchResult,
        execution: buildTaskDetailPayload(task, record, document),
      });
    } catch (dispatchError) {
      updateTaskEntryMetadata(task, {
        taskId,
        agentId,
        sessionKey,
        sessionId,
        dispatchStatus: 'failed',
        conclusion: null,
      });
      appendTaskEvent(store, taskId, {
        type: 'dispatch_failed',
        fromSection: previousSection,
        toSection: section,
        agentId,
        sessionKey,
        sessionId,
        runId,
        error: String(dispatchError?.message || dispatchError),
      });
      appendTaskRun(store, taskId, {
        runId,
        sessionKey,
        sessionId,
        agentId,
        status: 'error',
        section,
        instruction,
        prompt,
        conclusion: null,
        currentText: instruction,
        currentSection: section,
        currentStatus: 'error',
        startedAt: null,
        endedAt: null,
        updatedAt: null,
        runtimeMs: null,
        tokens: null,
        provider: null,
        model: null,
        source: 'follow-up',
      });
      saveTaskExecutionStore(store);
      saveTasksDocument(document);
      throw dispatchError;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/activity', (req, res) => {
  buildOpenClawState({ fetchImpl: fetch, token: getToken(), activityLimit: Number(req.query?.limit) || 100, sessionLimit: 100 })
    .then((state) => {
      res.json({
        ok: true,
        generatedAt: state.generatedAt,
        items: state.activity,
        activity: state.activity,
        errors: state.errors,
        warnings: state.warnings,
        sources: state.sources,
      });
    })
    .catch((e) => res.status(500).json({ error: e.message }));
});

app.get('/api/agents', async (req, res) => {
  try {
    const state = await buildOpenClawState({ fetchImpl: fetch, token: getToken(), activityLimit: 50, sessionLimit: 100 });
    res.json({
      ok: true,
      generatedAt: state.generatedAt,
      agents: state.agents,
      errors: state.errors,
      warnings: state.warnings,
      sources: state.sources,
    });
  } catch (e) {
    console.error('Error in /api/agents:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const state = await buildOpenClawState({ fetchImpl: fetch, token: getToken(), activityLimit: 20, sessionLimit: Number(req.query?.limit) || 20 });
    res.json({
      ok: true,
      generatedAt: state.generatedAt,
      sessions: state.sessions,
      errors: state.errors,
      warnings: state.warnings,
      sources: state.sources,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/memory/index', (req, res) => {
  try {
    res.json({
      ok: true,
      ...getMemoryIndex(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/memory/latest', (req, res) => {
  try {
    res.json({
      ok: true,
      ...getLatestMemory(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/memory/day/:day', (req, res) => {
  try {
    const result = getMemoryDay(req.params.day);
    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/memory/day/:day/:agent', (req, res) => {
  try {
    const result = getMemoryEntry(req.params.day, req.params.agent);
    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chat/:agent', async (req, res) => {
  try {
    const agentId = normalizeChatAgentId(req.params.agent);
    if (!agentId) {
      return res.status(400).json({ error: 'Agent is required' });
    }

    const state = await buildOpenClawState({ fetchImpl: fetch, token: getToken(), activityLimit: 20, sessionLimit: 20 });
    const agent = findOpenClawAgentById(state, agentId);
    if (!agent) {
      return res.status(404).json({ error: `Unknown agent: ${agentId}` });
    }

    const conversation = peekConversation(agentId);
    res.json({
      ok: true,
      collectedAt: state.generatedAt || new Date().toISOString(),
      source: 'chat-store',
      warnings: Array.isArray(state.warnings) ? state.warnings : [],
      errors: Array.isArray(state.errors) ? state.errors : [],
      agentId,
      agentName: agent.name || agentId,
      sessionKey: conversation?.sessionKey || `agent:${agentId}:mc-chat`,
      sessionId: conversation?.sessionId || `mc-chat:${agentId}`,
      createdAt: conversation?.createdAt || null,
      updatedAt: conversation?.updatedAt || null,
      messages: conversation?.messages || [],
      messageCount: conversation?.messageCount || 0,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/chat/:agent', async (req, res) => {
  try {
    const agentId = normalizeChatAgentId(req.params.agent);
    if (!agentId) {
      return res.status(400).json({ error: 'Agent is required' });
    }

    const message = extractChatMessagePayload(req.body);
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const state = await buildOpenClawState({ fetchImpl: fetch, token: getToken(), activityLimit: 20, sessionLimit: 20 });
    const agent = findOpenClawAgentById(state, agentId);
    if (!agent) {
      return res.status(404).json({ error: `Unknown agent: ${agentId}` });
    }

    const conversation = peekConversation(agentId);
    const sessionKey = conversation?.messages?.length ? conversation.sessionKey || null : null;
    const sessionId = conversation?.messages?.length ? conversation.sessionId || null : null;

    const dispatchResult = await runAgentDispatch({
      message,
      sessionKey,
      sessionId,
      agentId,
      useLoginShell: true,
    });

    const replyText = String(dispatchResult.replyText || '').trim();
    if (!replyText) {
      return res.status(500).json({ error: 'Agent returned an empty reply' });
    }

    const updatedConversation = appendChatTurn(agentId, {
      userMessage: message,
      assistantMessage: replyText,
      sessionKey: dispatchResult.sessionKey || sessionKey,
      sessionId: dispatchResult.sessionId || sessionId,
      assistantMeta: {
        provider: dispatchResult?.meta?.agentMeta?.provider || dispatchResult?.provider || null,
        model: dispatchResult?.meta?.agentMeta?.model || dispatchResult?.model || null,
        source: 'openclaw',
      },
    });

    res.json({
      ok: true,
      collectedAt: new Date().toISOString(),
      source: 'openclaw',
      warnings: Array.isArray(state.warnings) ? state.warnings : [],
      errors: Array.isArray(state.errors) ? state.errors : [],
      agentId,
      agentName: agent.name || agentId,
      sessionKey: updatedConversation?.sessionKey || dispatchResult.sessionKey || sessionKey,
      sessionId: updatedConversation?.sessionId || dispatchResult.sessionId || sessionId,
      reply: replyText,
      messages: updatedConversation?.messages || [],
      messageCount: updatedConversation?.messageCount || 0,
      dispatch: dispatchResult,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// GET /api/diary?date=YYYY-MM-DD - Returns aggregated diary data for a given date
app.get('/api/diary', async (req, res) => {
  try {
    const { date } = req.query; // Expected format: YYYY-MM-DD
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required (format: YYYY-MM-DD)' });
    }

    // Validate date format (basic)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Fetch sessions (same as /api/sessions endpoint)
    const token = getToken();
    const sessionsResponse = await fetch('http://localhost:18789/tools/invoke', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'sessions_list', args: { limit: 100 } }) // Increase limit to get more sessions
    });
    const sessionsData = await sessionsResponse.json();
    let sessions = [];
    if (sessionsData.ok && sessionsData.result && sessionsData.result.content && sessionsData.result.content[0] && sessionsData.result.content[0].text) {
      sessions = JSON.parse(sessionsData.result.content[0].text).sessions || [];
    }

    // Fetch activity log
    const activityLogPath = '/root/.openclaw/projects/mission-control/data/mc-activity.json';
    let activityLog = [];
    if (fs.existsSync(activityLogPath)) {
      const logData = fs.readFileSync(activityLogPath, 'utf8');
      activityLog = JSON.parse(logData);
    } else {
      console.warn('Activity log file not found:', activityLogPath);
    }

    // Initialize aggregates for the given date
    let totalSessions = 0;
    let totalTokens = 0;
    const activeAgentsSet = new Set();
    const tasksForDay = [];

    // Process sessions
    sessions.forEach(session => {
      const sessionDate = session.startedAt || session.updatedAt;
      if (sessionDate) {
        const sessionDateOnly = new Date(sessionDate).toISOString().split('T')[0]; // YYYY-MM-DD
        if (sessionDateOnly === date) {
          totalSessions++;
          if (session.totalTokens) {
            totalTokens += session.totalTokens;
          }
          // Extract agent name from session.key (format: "agent:<agent_name>:<...>")
          if (session.key) {
            const parts = session.key.split(':');
            if (parts.length >= 2) {
              activeAgentsSet.add(parts[1]); // agent name
            }
          }
        }
      }
    });

    // Process activity log entries for tasks created/completed on the given date
    activityLog.forEach(entry => {
      if (entry.timestamp) {
        const entryDateOnly = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
        if (entryDateOnly === date) {
          // Check if it's a task entry
          if (entry.type === 'task' && entry.text) {
            tasksForDay.push(entry.text);
          }
          // Also consider logbook_record_created as a task? The TODO says tasks created/completed.
          // We'll stick to type 'task' for now.
        }
      }
    });

    // Convert active agents set to sorted array
    const activeAgents = Array.from(activeAgentsSet).sort();

    res.json({
      date,
      total_sessions: totalSessions,
      total_tokens: totalTokens,
      active_agents: activeAgents,
      tasks: tasksForDay
    });
  } catch (e) {
    console.error('Error in /api/diary:', e);
    res.status(500).json({ error: e.message });
  }
});

// Serve static files from frontend dist
app.use(express.static(path.join(__dirname, 'public')));

// Client-side routing: for any GET request that doesn't match an API route and isn't a static file, send index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    // If it's an API route that wasn't caught above, return 404
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// VPS update interval - send updates every 5 seconds
setInterval(async () => {
  try {
    const [snapshot, fail2ban] = await Promise.all([getVpsSnapshot(), getFail2banBanned()]);
    io.emit('vps-update', toLegacyVpsPayload(snapshot, fail2ban));
  } catch (error) {
    console.error('Error updating VPS data:', error);
  }
}, 5000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Running on port ${PORT}`));
