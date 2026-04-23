const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const { randomUUID } = require('crypto');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

function getToken() {
  try {
    const lines = fs.readFileSync('/root/openclaw/.env', 'utf8').split('\n');
    const line = lines.find(l => l.startsWith('OPENCLAW_GATEWAY_TOKEN='));
    return line ? line.split('=')[1].trim() : 'default-token';
  } catch { return 'default-token'; }
}

function run(cmd) {
  return new Promise(resolve => {
    exec(cmd, (err, stdout) => resolve(err ? 'N/A' : stdout.trim()));
  });
}

const TASKS_PATH = '/root/.openclaw/TASKS.md';
const TASK_TASK_ID_COMMENT_RE = /<!--\s*mc-task-id:\s*([^>]+?)\s*-->/i;
const TASK_AGENT_ID_COMMENT_RE = /<!--\s*mc-agent-id:\s*([^>]+?)\s*-->/i;
const TASK_SESSION_KEY_COMMENT_RE = /<!--\s*mc-session-key:\s*([^>]+?)\s*-->/i;
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
    runId: null,
    dispatchStatus: null,
    conclusion: null,
  };

  const raw = String(text || '');
  const taskId = raw.match(TASK_TASK_ID_COMMENT_RE)?.[1]?.trim();
  const agentId = raw.match(TASK_AGENT_ID_COMMENT_RE)?.[1]?.trim();
  const sessionKey = raw.match(TASK_SESSION_KEY_COMMENT_RE)?.[1]?.trim();
  const runId = raw.match(TASK_RUN_ID_COMMENT_RE)?.[1]?.trim();
  const dispatchStatus = raw.match(TASK_STATUS_COMMENT_RE)?.[1]?.trim();
  const conclusion = raw.match(TASK_CONCLUSION_COMMENT_RE)?.[1]?.trim();

  if (taskId) parsed.taskId = taskId;
  if (agentId) parsed.agentId = agentId;
  if (sessionKey) parsed.sessionKey = sessionKey;
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

function toTaskSessionKey(agentId, taskId) {
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

function collectTasks(document) {
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
      sections[sectionKey].push({ ...entry.task });
      summary[sectionKey] += 1;
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
  if (!task?.sessionKey) return null;
  const sessionRecord = findSessionRecordByKey(task.sessionKey);
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

  const sessionFilePath = candidateSessionFiles.find((candidate) => fs.existsSync(candidate)) || null;

  return extractFinalAssistantText(sessionFilePath);
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

function buildOpenClawEnv() {
  const env = { ...process.env };
  const token = getToken();
  if (token) {
    env.OPENCLAW_GATEWAY_TOKEN = token;
  }
  return env;
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
    'gateway',
    'call',
    'agent',
    '--json',
    '--params',
    JSON.stringify({
      message: params.message,
      sessionKey: params.sessionKey,
      idempotencyKey: params.idempotencyKey,
      agentId: params.agentId,
      deliver: false,
    }),
  ];
  const { stdout } = await execFileAsync(cli, args, {
    env: buildOpenClawEnv(),
    timeout: 20000,
  });
  const parsed = JSON.parse(stdout || '{}');
  return parsed;
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/vps', async (req, res) => {
  try {
    const [cpuStr, ramStr, diskStr, uptime, containersRaw, fail2banOutput] = await Promise.all([
      run("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
      run("free -h | grep Mem | awk '{print $3\"/\"$2}'"),
      run("df -h / | tail -1 | awk '{print $5}'"),
      run("uptime -p"),
      run('docker ps --format "{{.Names}}: {{.Status}}"') || '',
      run("fail2ban-client status sshd") || ''
    ]);

    // Parse containers into structured array with safe fallback
    let containers = [];
    if (containersRaw && containersRaw !== 'N/A' && containersRaw.trim()) {
      containers = containersRaw.split('\n')
        .filter(line => line.trim() && line.includes(':'))
        .map(line => {
          const parts = line.split(':');
          const name = parts[0]?.trim() || '';
          const statusRaw = parts.slice(1).join(':').trim();
          const parts2 = statusRaw.split('(');
          const status = parts2[0]?.trim() || 'Unknown';
          const healthy = statusRaw.toLowerCase().includes('healthy') || statusRaw.toLowerCase().includes('up');
          return { name, status, healthy };
        });
    }

    // Parse CPU/RAM/Disk as numbers with fallback
    const cpu = parseFloat(cpuStr) || 0;
    const ramStrParts = (ramStr || '--/--').split('/');
    const ramUsed = parseFloat(ramStrParts[0]?.replace(/[^\d.]/g, '')) || 0;
    const ramTotal = parseFloat(ramStrParts[1]?.replace(/[^\d.]/g, '')) || 1;
    const ram = Math.round((ramUsed / ramTotal) * 100);
    const ramRaw = ramStr || '0/0';
    const disk = parseFloat(diskStr) || 0;

    // Parse fail2ban output to get banned count and list
    let bannedCount = '0';
    let bannedList = [];
    if (fail2banOutput && fail2banOutput !== 'N/A') {
      const lines = fail2banOutput.split('\n');
      let inBannedList = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Currently banned:')) {
          const match = trimmed.match(/Currently banned:\s*(\d+)/);
          if (match) bannedCount = match[1];
        }
        if (trimmed === 'Banned IP list:') {
          inBannedList = true;
          continue;
        }
        if (inBannedList) {
          if (trimmed === '' || trimmed.startsWith('|-') || trimmed.startsWith('`-')) {
            inBannedList = false;
            continue;
          }
          const ipMatches = trimmed.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/g);
          if (ipMatches) {
            bannedList.push(...ipMatches);
          }
        }
      }
      bannedList = [...new Set(bannedList)];
    }

    res.json({
      cpu,
      ram,
      ramRaw,
      disk,
      uptime,
      containers,
      banned: bannedCount,
      bannedList
    });
  } catch (error) {
    console.error('Error in /api/vps:', error);
    res.json({
      cpu: 0,
      ram: 0,
      ramRaw: '0/0',
      disk: 0,
      uptime: 'N/A',
      containers: [],
      banned: '0',
      bannedList: []
    });
  }
});

app.get('/api/tasks', (req, res) => {
  try {
    const document = loadTasksDocument();
    const { summary, sections } = collectTasks(document);
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
    const sessionKey = toTaskSessionKey(agentId, taskId);
    const taskText = idea;
    const sectionBlock = findOrCreateSectionBlock(document, section);
    const existingTaskRef = findTaskEntryById(document, taskId);
    const targetTaskRef = existingTaskRef || { block: sectionBlock, index: -1, entry: null };

    let taskRecord = existingTaskRef?.entry?.task || null;
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
        dispatchStatus: 'queued',
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
      taskRecord.dispatchStatus = 'queued';
    }

    saveTasksDocument(document);

    try {
      const dispatchResult = await runAgentDispatch({
        message: prompt,
        sessionKey,
        idempotencyKey: `task:${taskId}:dispatch`,
        agentId,
      });

      updateTaskEntryMetadata(taskRecord, {
        taskId,
        agentId,
        sessionKey,
        runId: dispatchResult?.runId ? String(dispatchResult.runId) : null,
        dispatchStatus: normalizeDispatchStatus(dispatchResult?.status || 'accepted'),
      });
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
        dispatchStatus: 'failed',
      });
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
    let movedTask = null;
    let sourceBlock = null;
    let sourceIndex = null;

    if (taskId) {
      const taskRef = findTaskEntryById(document, String(taskId).trim());
      if (taskRef) {
        movedTask = taskRef.entry.task;
        sourceBlock = taskRef.block;
        sourceIndex = taskRef.index;
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

    saveTasksDocument(document);
    res.json({ success: true, task: movedTask });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/activity', (req, res) => {
  try {
    const path = '/root/.openclaw/projects/mission-control/data/mc-activity.json';
    if (!fs.existsSync(path)) return res.json([]);
    res.json(JSON.parse(fs.readFileSync(path, 'utf8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agents', async (req, res) => {
  try {
    const configPath = '/root/.openclaw/openclaw.json';
    if (!fs.existsSync(configPath)) {
      return res.status(500).json({ error: 'OpenClaw config not found' });
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const agentIds = (config.agents?.list || []).map(a => a.id).filter(Boolean);
    const agents = [];
    for (const id of agentIds) {
      const sessionsPath = `/root/.openclaw/agents/${id}/sessions`;
      let lastActivity = null;
      let sessionCount = 0;
      if (fs.existsSync(sessionsPath)) {
        const allFiles = fs.readdirSync(sessionsPath);
        const jsonlFiles = allFiles.filter(file => file.endsWith('.jsonl') && !file.includes('.deleted'));
        sessionCount = jsonlFiles.length;
        let latestTime = 0;
        for (const file of jsonlFiles) {
          const filePath = path.join(sessionsPath, file);
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs > latestTime) {
            latestTime = stat.mtimeMs;
          }
        }
        if (latestTime > 0) {
          lastActivity = new Date(latestTime).toISOString();
        }
      }
      agents.push({
        id,
        name: id,
        sessionCount,
        lastActivity: lastActivity || null
      });
    }
    res.json({ agents });
  } catch (e) {
    console.error('Error in /api/agents:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const token = getToken();
    const r = await fetch('http://localhost:18789/tools/invoke', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'sessions_list', args: { limit: 20 } })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const [cpu, ram, disk, uptime, containers, fail2ban] = await Promise.all([
      run("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
      run("free -h | grep Mem | awk '{print $3\"/\"$2}'"),
      run("df -h / | tail -1 | awk '{print $5}'"),
      run("uptime -p"),
      run('docker ps --format "{{.Names}}: {{.Status}}"'),
      run("fail2ban-client status sshd | grep 'Currently banned' | awk '{print $NF}'")
    ]);

    io.emit('vps-update', {
      cpu,
      ram,
      disk,
      uptime,
      containers,
      banned: fail2ban || '0'
    });
  } catch (error) {
    console.error('Error updating VPS data:', error);
  }
}, 5000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Running on port ${PORT}`));
