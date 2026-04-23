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
    const path = '/root/.openclaw/TASKS.md';
    if (!fs.existsSync(path)) return res.json({ tasks: [] });
    const data = fs.readFileSync(path, 'utf8');
    res.json({ raw: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/tasks - Add a new task to a section
app.post('/api/tasks', (req, res) => {
  try {
    const { section, text } = req.body;
    if (!section || !text) {
      return res.status(400).json({ error: 'Section and text are required' });
    }
    const validSections = ['Standby', 'In Progress', 'Blocked', 'Done'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    const path = '/root/.openclaw/TASKS.md';
    let data = '';
    if (fs.existsSync(path)) {
      data = fs.readFileSync(path, 'utf8');
    }
    // Ensure the section exists
    const sectionHeader = `## ${section}`;
    if (!data.includes(sectionHeader)) {
      // If file is empty, just add the section and task
      if (data.trim() === '') {
        data = `${sectionHeader}\n\n- [ ] ${text}\n`;
      } else {
        // Append section and task
        data += `\n\n${sectionHeader}\n\n- [ ] ${text}\n`;
      }
    } else {
      // Find the section and append the task after the last task in that section
      const lines = data.split('\n');
      let inSection = false;
      let lastTaskIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('## ')) {
          const currentSection = line.substring(3).trim();
          if (currentSection === section) {
            inSection = true;
          } else if (inSection) {
            // We've moved to a new section, so stop looking
            break;
          }
        }
        if (inSection && line.startsWith('- [ ')) {
          lastTaskIndex = i;
        }
      }
      if (lastTaskIndex !== -1) {
        // Insert the new task after the last task in the section
        lines.splice(lastTaskIndex + 1, 0, `- [ ] ${text}`);
        data = lines.join('\n');
      } else {
        // No tasks in section yet, add after the section header
        const headerIndex = lines.findIndex(line => line.trim() === sectionHeader);
        if (headerIndex !== -1) {
          lines.splice(headerIndex + 1, 0, '', `- [ ] ${text}`);
          data = lines.join('\n');
        }
      }
    }
    fs.writeFileSync(path, data);
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
    const path = '/root/.openclaw/TASKS.md';
    if (!fs.existsSync(path)) {
      return res.status(404).json({ error: 'Tasks file not found' });
    }
    let data = fs.readFileSync(path, 'utf8');
    const lines = data.split('\n');
    let inSection = false;
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## ')) {
        const currentSection = line.substring(3).trim();
        inSection = (currentSection === section);
        newLines.push(line);
        continue;
      }
      if (inSection && line.trim() === `- [ ] ${text}`) {
        // Skip this line (delete the task)
        continue;
      }
      newLines.push(line);
    }
    data = newLines.join('\n');
    fs.writeFileSync(path, data);
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
    const validSections = ['Standby', 'In Progress', 'Blocked', 'Done'];
    if (!validSections.includes(section) || !validSections.includes(newSection)) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    const path = '/root/.openclaw/TASKS.md';
    if (!fs.existsSync(path)) {
      return res.status(404).json({ error: 'Tasks file not found' });
    }
    let data = fs.readFileSync(path, 'utf8');
    const lines = data.split('\n');
    let inSection = false;
    let taskLineIndex = -1;
    // Find the task to move
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## ')) {
        const currentSection = line.substring(3).trim();
        inSection = (currentSection === section);
        continue;
      }
      if (inSection && line.trim() === `- [ ] ${text}`) {
        taskLineIndex = i;
        break;
      }
    }
    if (taskLineIndex === -1) {
      return res.status(404).json({ error: 'Task not found in section' });
    }
    // Remove the task from the current section
    lines.splice(taskLineIndex, 1);
    // Now find the new section and insert the task after the last task in that section
    let inNewSection = false;
    let lastTaskIndexInNewSection = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## ')) {
        const currentSection = line.substring(3).trim();
        inNewSection = (currentSection === newSection);
        continue;
      }
      if (inNewSection && line.startsWith('- [ ')) {
        lastTaskIndexInNewSection = i;
      }
    }
    if (lastTaskIndexInNewSection !== -1) {
      // Insert after the last task in the new section
      lines.splice(lastTaskIndexInNewSection + 1, 0, `- [ ] ${text}`);
    } else {
      // No tasks in new section yet, find the section header and insert after it
      const headerIndex = lines.findIndex(line => line.trim() === `## ${newSection}`);
      if (headerIndex !== -1) {
        lines.splice(headerIndex + 1, 0, '', `- [ ] ${text}`);
      } else {
        // Section doesn't exist, add it at the end
        lines.push(`\n## ${newSection}\n\n- [ ] ${text}`);
      }
    }
    data = lines.join('\n');
    fs.writeFileSync(path, data);
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
