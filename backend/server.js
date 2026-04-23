const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
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
const TASK_SECTION_META = {
  standby: { label: 'Standby' },
  inProgress: { label: 'In Progress' },
  completed: { label: 'Completed' },
};

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

function sectionLabel(sectionKey, fallbackLabel) {
  return TASK_SECTION_META[sectionKey]?.label || fallbackLabel || sectionKey;
}

function inferTaskOwner(text) {
  if (!text) return null;
  const match = text.match(/(?:^|[\s([{<])@?(comandante|cyber|flow|ledger|agentmail)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function parseTaskLine(line, sectionKey, index) {
  const match = line.match(/^\s*-\s+\[([xX ])\]\s+(.*)$/);
  if (!match) return null;
  const text = match[2].trim();
  return {
    id: `${sectionKey}-${index + 1}`,
    text,
    checked: match[1].toLowerCase() === 'x',
    section: sectionKey,
    owner: inferTaskOwner(text),
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
  return `- [${task.checked ? 'x' : ' '}] ${task.text}`;
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
  if (!fs.existsSync(TASKS_PATH)) {
    return parseTasksMarkdown('');
  }

  const markdown = fs.readFileSync(TASKS_PATH, 'utf8');
  return parseTasksMarkdown(markdown);
}

function saveTasksDocument(document) {
  fs.writeFileSync(TASKS_PATH, rebuildMarkdown(document));
}

function findTaskEntry(block, text) {
  const idx = block.entries.findIndex((entry) => entry.kind === 'task' && entry.task.text === text);
  if (idx === -1) return null;
  return { index: idx, entry: block.entries[idx] };
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

// POST /api/tasks - Add a new task to a section
app.post('/api/tasks', (req, res) => {
  try {
    const { section, text } = req.body;
    if (!section || !text) {
      return res.status(400).json({ error: 'Section and text are required' });
    }
    const normalizedSection = normalizeTaskSection(section);
    if (!normalizedSection) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    const document = loadTasksDocument();
    const sectionBlock = findOrCreateSectionBlock(document, normalizedSection);
    sectionBlock.entries.push({
      kind: 'task',
      task: {
        id: `${normalizedSection}-${sectionBlock.entries.filter((entry) => entry.kind === 'task').length + 1}`,
        text: String(text).trim(),
        checked: false,
        section: normalizedSection,
        owner: inferTaskOwner(String(text).trim()),
      },
    });
    saveTasksDocument(document);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tasks - Remove a task from a section
app.delete('/api/tasks', (req, res) => {
  try {
    const { section, text } = req.body;
    if (!section || !text) {
      return res.status(400).json({ error: 'Section and text are required' });
    }
    const normalizedSection = normalizeTaskSection(section);
    if (!normalizedSection) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    if (!fs.existsSync(TASKS_PATH)) {
      return res.status(404).json({ error: 'Tasks file not found' });
    }
    const document = loadTasksDocument();
    let removed = false;

    for (const block of document.blocks) {
      if (block.canonicalSection !== normalizedSection) continue;
      const taskRef = findTaskEntry(block, String(text).trim());
      if (!taskRef) continue;
      block.entries.splice(taskRef.index, 1);
      removed = true;
      break;
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
    const { section, text, newSection } = req.body;
    if (!section || !text || !newSection) {
      return res.status(400).json({ error: 'Section, text, and newSection are required' });
    }
    const sourceSection = normalizeTaskSection(section);
    const targetSection = normalizeTaskSection(newSection);
    if (!sourceSection || !targetSection) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    if (!fs.existsSync(TASKS_PATH)) {
      return res.status(404).json({ error: 'Tasks file not found' });
    }
    const document = loadTasksDocument();
    let movedTask = null;

    for (const block of document.blocks) {
      if (block.canonicalSection !== sourceSection) continue;
      const taskRef = findTaskEntry(block, String(text).trim());
      if (!taskRef) continue;
      movedTask = taskRef.entry.task;
      block.entries.splice(taskRef.index, 1);
      break;
    }

    if (!movedTask) {
      return res.status(404).json({ error: 'Task not found in section' });
    }

    movedTask.section = targetSection;
    const targetBlock = findOrCreateSectionBlock(document, targetSection);
    targetBlock.entries.push({
      kind: 'task',
      task: movedTask,
    });

    saveTasksDocument(document);
    res.json({ success: true });
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
