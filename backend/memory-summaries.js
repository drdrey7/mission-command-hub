const fs = require('fs');
const path = require('path');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const AGENT_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const DEFAULT_AGENT_ORDER = ['comandante', 'cyber', 'flow', 'ledger'];
const CACHE_TTL_MS = 15_000;
const BASE_DIR_CANDIDATES = [
  process.env.DAILY_SUMMARIES_DIR?.trim(),
  '/root/.openclaw/shared/daily-summaries',
  '/home/node/.openclaw/shared/daily-summaries',
].filter(Boolean);

const state = {
  manifest: null,
  manifestLoadedAt: 0,
  manifestKey: null,
  fileCache: new Map(),
};

function normalizeAgentName(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidDay(day) {
  return typeof day === 'string' && DAY_RE.test(day);
}

function isValidAgent(agent) {
  return typeof agent === 'string' && AGENT_RE.test(agent.trim());
}

function sortAgents(agentSet) {
  const values = Array.from(agentSet || [])
    .map(normalizeAgentName)
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  unique.sort((a, b) => {
    const ai = DEFAULT_AGENT_ORDER.indexOf(a);
    const bi = DEFAULT_AGENT_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.localeCompare(b);
  });
  return unique;
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function safeReadJson(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveBaseDir() {
  for (const candidate of BASE_DIR_CANDIDATES) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

function extractEntriesFromIndex(raw) {
  const days = new Map();
  const agents = new Set();

  const addDay = (day, agentList = []) => {
    if (!isValidDay(day)) return;
    const normalizedAgents = sortAgents(agentList);
    const entry = days.get(day) || { day, agents: new Set(), exists: false };
    for (const agent of normalizedAgents) {
      entry.agents.add(agent);
      agents.add(agent);
    }
    days.set(day, entry);
  };

  const addFromObject = (value) => {
    if (!value || typeof value !== 'object') return;
    const day = value.day || value.date || value.id || value.name;
    const agentList = [];

    if (Array.isArray(value.agents)) {
      for (const item of value.agents) {
        if (typeof item === 'string') {
          agentList.push(item);
        } else if (item && typeof item === 'object') {
          agentList.push(item.agent || item.key || item.name || item.id);
        }
      }
    }

    if (Array.isArray(value.files)) {
      for (const item of value.files) {
        if (typeof item === 'string') {
          const agent = path.basename(item, path.extname(item));
          agentList.push(agent);
        } else if (item && typeof item === 'object') {
          agentList.push(item.agent || item.key || item.name || item.id);
        }
      }
    }

    addDay(day, agentList);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        addDay(item, []);
      } else {
        addFromObject(item);
      }
    }
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.days)) {
      for (const item of raw.days) {
        if (typeof item === 'string') {
          addDay(item, []);
        } else {
          addFromObject(item);
        }
      }
    } else if (raw.days && typeof raw.days === 'object') {
      for (const [day, value] of Object.entries(raw.days)) {
        if (Array.isArray(value)) {
          addDay(day, value);
        } else if (value && typeof value === 'object') {
          addDay(day, value.agents || []);
        } else {
          addDay(day, []);
        }
      }
    } else if (Array.isArray(raw.entries)) {
      for (const item of raw.entries) {
        if (typeof item === 'string') {
          addDay(item, []);
        } else {
          addFromObject(item);
        }
      }
    } else {
      for (const [key, value] of Object.entries(raw)) {
        if (!isValidDay(key)) continue;
        if (Array.isArray(value)) {
          addDay(key, value);
        } else if (value && typeof value === 'object') {
          addDay(key, value.agents || value.files || []);
        } else {
          addDay(key, []);
        }
      }
    }
  }

  return {
    days,
    agents: sortAgents(agents),
  };
}

function scanBaseDir(baseDir) {
  const days = new Map();
  const agents = new Set();

  if (!baseDir || !fs.existsSync(baseDir)) {
    return { days, agents: [] };
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidDay(entry.name)) continue;
    const dayDir = path.join(baseDir, entry.name);
    const dayAgents = new Set();
    for (const fileName of fs.readdirSync(dayDir, { withFileTypes: true })) {
      if (!fileName.isFile() || !fileName.name.toLowerCase().endsWith('.md')) continue;
      const agent = normalizeAgentName(path.basename(fileName.name, '.md'));
      if (!isValidAgent(agent)) continue;
      dayAgents.add(agent);
      agents.add(agent);
    }
    days.set(entry.name, {
      day: entry.name,
      agents: dayAgents,
      exists: dayAgents.size > 0,
    });
  }

  return { days, agents: sortAgents(agents) };
}

function mergeManifests(indexManifest, scanManifest) {
  const dayMap = new Map();
  const agents = new Set();

  for (const [day, entry] of indexManifest.days.entries()) {
    dayMap.set(day, {
      day,
      agents: new Set(entry.agents),
      exists: false,
    });
    for (const agent of entry.agents) agents.add(agent);
  }

  for (const [day, entry] of scanManifest.days.entries()) {
    const current = dayMap.get(day) || { day, agents: new Set(), exists: false };
    for (const agent of entry.agents) {
      current.agents.add(agent);
      agents.add(agent);
    }
    current.exists = current.exists || entry.exists || current.agents.size > 0;
    dayMap.set(day, current);
  }

  const days = Array.from(dayMap.values())
    .map((entry) => ({
      day: entry.day,
      agents: sortAgents(entry.agents),
      exists: Boolean(entry.exists || (entry.agents && entry.agents.size > 0)),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));

  return {
    days,
    agents: sortAgents(agents),
  };
}

function buildManifest() {
  const baseDir = resolveBaseDir();
  if (!baseDir) {
    return {
      baseDir: null,
      source: 'none',
      days: [],
      agents: [],
      latestDay: null,
      indexPath: null,
      indexExists: false,
    };
  }

  const indexPath = path.join(baseDir, 'index.json');
  const indexStat = safeStat(indexPath);
  const cacheKey = `${baseDir}:${indexStat ? indexStat.mtimeMs : 'no-index'}`;
  const now = Date.now();

  if (
    state.manifest &&
    state.manifestKey === cacheKey &&
    now - state.manifestLoadedAt < CACHE_TTL_MS
  ) {
    return state.manifest;
  }

  const indexRaw = indexStat ? safeReadJson(indexPath) : null;
  const indexManifest = extractEntriesFromIndex(indexRaw);
  const scanManifest = scanBaseDir(baseDir);
  const merged = mergeManifests(indexManifest, scanManifest);
  const source = indexStat ? (scanManifest.days.size > 0 ? 'index+scan' : 'index') : 'scan';
  const latestDay = merged.days[0]?.day || null;

  const manifest = {
    baseDir,
    source,
    days: merged.days,
    agents: merged.agents,
    latestDay,
    indexPath,
    indexExists: Boolean(indexStat),
  };

  state.manifest = manifest;
  state.manifestLoadedAt = now;
  state.manifestKey = cacheKey;
  return manifest;
}

function getKnownAgents(manifest = buildManifest()) {
  const agents = new Set(manifest.agents);
  for (const day of manifest.days) {
    for (const agent of day.agents) agents.add(agent);
  }
  return sortAgents(agents);
}

function getDayAgents(manifest, day) {
  const dayEntry = manifest.days.find((entry) => entry.day === day);
  if (dayEntry) return sortAgents(dayEntry.agents);
  return manifest.agents;
}

function getDayDir(baseDir, day) {
  return path.join(baseDir, day);
}

function getAgentFilePath(baseDir, day, agent) {
  return path.join(getDayDir(baseDir, day), `${agent}.md`);
}

function readMarkdownFile(filePath) {
  const stat = safeStat(filePath);
  if (!stat || !stat.isFile()) {
    return {
      exists: false,
      content: '',
      mtime: null,
    };
  }

  const cacheEntry = state.fileCache.get(filePath);
  if (cacheEntry && cacheEntry.mtimeMs === stat.mtimeMs && cacheEntry.size === stat.size) {
    return cacheEntry.payload;
  }

  const payload = {
    exists: true,
    content: fs.readFileSync(filePath, 'utf8'),
    mtime: stat.mtime.toISOString(),
  };

  state.fileCache.set(filePath, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    payload,
  });

  return payload;
}

function normalizeDayPayload(day, agent, payload) {
  return {
    day,
    agent,
    content: payload.content || '',
    exists: Boolean(payload.exists),
    mtime: payload.mtime || null,
  };
}

function getMemoryEntry(day, agent, manifest = buildManifest()) {
  if (!isValidDay(day)) {
    return { error: 'Invalid day format. Use YYYY-MM-DD', status: 400 };
  }

  const normalizedAgent = normalizeAgentName(agent);
  const knownAgents = new Set(getKnownAgents(manifest));
  const dayAgents = new Set(getDayAgents(manifest, day));
  const allowedAgents = new Set([...knownAgents, ...dayAgents]);

  if (!isValidAgent(normalizedAgent) || (allowedAgents.size > 0 && !allowedAgents.has(normalizedAgent))) {
    return { error: 'Unknown agent for this memory index', status: 404 };
  }

  const baseDir = manifest.baseDir;
  if (!baseDir) {
    return normalizeDayPayload(day, normalizedAgent, { exists: false, content: '', mtime: null });
  }

  const filePath = getAgentFilePath(baseDir, day, normalizedAgent);
  return normalizeDayPayload(day, normalizedAgent, readMarkdownFile(filePath));
}

function getMemoryDay(day, manifest = buildManifest()) {
  if (!isValidDay(day)) {
    return { error: 'Invalid day format. Use YYYY-MM-DD', status: 400 };
  }

  const agents = getDayAgents(manifest, day);
  const entries = agents.map((agent) => getMemoryEntry(day, agent, manifest));
  const validEntries = entries.filter((entry) => !entry?.error);
  const exists = validEntries.some((entry) => entry.exists);
  const mtime = validEntries
    .map((entry) => entry.mtime)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    day,
    agents,
    entries: validEntries,
    exists,
    mtime,
  };
}

function getLatestMemory(manifest = buildManifest()) {
  const latestDay = manifest.latestDay;
  if (!latestDay) {
    return {
      day: null,
      agents: [],
      entries: [],
      exists: false,
      mtime: null,
    };
  }

  return getMemoryDay(latestDay, manifest);
}

function getMemoryIndex(manifest = buildManifest()) {
  return {
    latestDay: manifest.latestDay,
    source: manifest.source,
    indexExists: manifest.indexExists,
    days: manifest.days,
    agents: manifest.agents,
  };
}

module.exports = {
  buildManifest,
  getLatestMemory,
  getMemoryDay,
  getMemoryEntry,
  getMemoryIndex,
  isValidDay,
  isValidAgent,
  normalizeAgentName,
  resolveBaseDir,
};
