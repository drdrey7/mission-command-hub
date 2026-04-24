const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const SNAPSHOT_TTL_MS = 5000;

const cache = {
  vps: { promise: null, value: null, collectedAt: 0 },
  fail2ban: { promise: null, value: null, collectedAt: 0 },
};

const ipv4Regex = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  return error.stderr || error.message || String(error);
}

function roundPercent(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

function formatBinaryBytes(bytes) {
  if (!Number.isFinite(bytes)) return null;
  const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : size < 10 ? 1 : 0;
  return `${size.toFixed(digits)}${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const totalMinutes = Math.floor(seconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  const parts = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function extractIpv4List(text) {
  if (!text) return [];
  const matches = String(text).match(ipv4Regex);
  return matches ? [...new Set(matches)] : [];
}

async function execCommand(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, {
    timeout: options.timeout ?? 5000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024,
  });
  return String(stdout || '').trim();
}

function getCpuTimes() {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8').split('\n').find((line) => line.startsWith('cpu '));
    if (!stat) return null;
    const parts = stat.trim().split(/\s+/).slice(1).map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) return null;
    const idle = (parts[3] || 0) + (parts[4] || 0);
    const total = parts.reduce((sum, part) => sum + part, 0);
    return { idle, total };
  } catch {
    return null;
  }
}

async function measureCpuPercent(sampleMs = 150) {
  const first = getCpuTimes();
  if (!first) return null;
  await delay(sampleMs);
  const second = getCpuTimes();
  if (!second) return null;
  const totalDelta = second.total - first.total;
  const idleDelta = second.idle - first.idle;
  if (totalDelta <= 0) return null;
  const used = ((totalDelta - idleDelta) / totalDelta) * 100;
  return roundPercent(Math.max(0, Math.min(100, used)));
}

async function getDiskSnapshot(mountPoint = '/') {
  const output = await execCommand('df', ['-Pk', mountPoint]);
  const lines = output.split('\n').filter(Boolean);
  if (lines.length < 2) {
    throw new Error(`Unexpected df output for ${mountPoint}`);
  }

  const columns = lines[1].trim().split(/\s+/);
  const usedPercent = parseNumber(columns[4]);
  const total = parseNumber(columns[1]);
  const used = parseNumber(columns[2]);
  return {
    usedPercent,
    total,
    used,
  };
}

async function getDockerSnapshot() {
  const output = await execCommand('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}']);
  if (!output) {
    return {
      containers: [],
      total: 0,
      healthy: 0,
      unhealthy: 0,
    };
  }

  const containers = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...statusParts] = line.split('\t');
      const status = statusParts.join('\t').trim();
      const healthy = /healthy/i.test(status) ? !/unhealthy/i.test(status) : /^Up\b/i.test(status);
      return {
        name: name?.trim() || 'unknown',
        status: status || 'Unknown',
        healthy,
      };
    });

  const healthyCount = containers.filter((container) => container.healthy).length;
  return {
    containers,
    total: containers.length,
    healthy: healthyCount,
    unhealthy: Math.max(0, containers.length - healthyCount),
  };
}

async function buildVpsSnapshot() {
  const collectedAt = new Date().toISOString();
  const warnings = [];
  const errors = [];
  const host = {
    hostname: os.hostname(),
    uptime: formatDuration(os.uptime()),
    cpuPercent: null,
    ramUsed: null,
    ramTotal: null,
    ramPercent: null,
    diskUsedPercent: null,
  };

  const totalRam = os.totalmem();
  const usedRam = totalRam - os.freemem();
  host.ramUsed = formatBinaryBytes(usedRam);
  host.ramTotal = formatBinaryBytes(totalRam);
  host.ramPercent = totalRam > 0 ? roundPercent((usedRam / totalRam) * 100) : null;

  const [cpuResult, diskResult, dockerResult] = await Promise.allSettled([
    measureCpuPercent(),
    getDiskSnapshot('/'),
    getDockerSnapshot(),
  ]);

  if (cpuResult.status === 'fulfilled') {
    host.cpuPercent = cpuResult.value;
  } else {
    host.cpuPercent = null;
    warnings.push(`CPU unavailable: ${toMessage(cpuResult.reason)}`);
  }

  if (diskResult.status === 'fulfilled') {
    host.diskUsedPercent = diskResult.value.usedPercent;
  } else {
    host.diskUsedPercent = null;
    errors.push(`Disk unavailable: ${toMessage(diskResult.reason)}`);
  }

  let containers = [];
  let docker = { total: 0, healthy: 0, unhealthy: 0 };
  if (dockerResult.status === 'fulfilled') {
    containers = dockerResult.value.containers;
    docker = {
      total: dockerResult.value.total,
      healthy: dockerResult.value.healthy,
      unhealthy: dockerResult.value.unhealthy,
    };
  } else {
    warnings.push(`Docker unavailable: ${toMessage(dockerResult.reason)}`);
  }

  return {
    ok: true,
    collectedAt,
    source: 'system',
    warnings,
    errors,
    host,
    containers,
    docker,
  };
}

function parseFail2banJailList(output) {
  if (!output) return [];
  const match = String(output).match(/Jail list:\s*(.+)$/im);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFail2banJailStatus(jail, output) {
  const result = {
    name: jail,
    enabled: true,
    currentlyFailed: null,
    totalFailed: null,
    currentlyBanned: null,
    totalBanned: null,
    bannedList: [],
  };

  let inBannedList = false;
  for (const rawLine of String(output || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      if (inBannedList) {
        continue;
      }
      continue;
    }

    const currentFailed = line.match(/Currently failed:\s*(\d+)/i);
    if (currentFailed) {
      result.currentlyFailed = Number(currentFailed[1]);
    }

    const totalFailed = line.match(/Total failed:\s*(\d+)/i);
    if (totalFailed) {
      result.totalFailed = Number(totalFailed[1]);
    }

    const currentlyBanned = line.match(/Currently banned:\s*(\d+)/i);
    if (currentlyBanned) {
      result.currentlyBanned = Number(currentlyBanned[1]);
    }

    const totalBanned = line.match(/Total banned:\s*(\d+)/i);
    if (totalBanned) {
      result.totalBanned = Number(totalBanned[1]);
    }

    if (/Banned IP list:/i.test(line)) {
      inBannedList = true;
      continue;
    }

    if (inBannedList) {
      const ips = extractIpv4List(line);
      if (ips.length > 0) {
        result.bannedList.push(...ips);
      }
    }
  }

  result.bannedList = [...new Set(result.bannedList)];
  return result;
}

async function getFail2banSnapshot() {
  const collectedAt = new Date().toISOString();
  const warnings = [];
  const errors = [];
  const jails = [];
  const bannedMap = new Map();
  let jailNames = [];
  let fallbackJails = null;

  try {
    const globalStatus = await execCommand('fail2ban-client', ['status']);
    jailNames = parseFail2banJailList(globalStatus);
  } catch (error) {
    warnings.push(`fail2ban-client status unavailable: ${toMessage(error)}`);
    try {
      const sshdStatus = await execCommand('fail2ban-client', ['status', 'sshd']);
      fallbackJails = [parseFail2banJailStatus('sshd', sshdStatus)];
    } catch (fallbackError) {
      errors.push(`fail2ban sshd unavailable: ${toMessage(fallbackError)}`);
      return {
        ok: true,
        collectedAt,
        source: 'fail2ban',
        warnings,
        errors,
        totalBanned: null,
        bannedCount: null,
        jailsActive: null,
        jails: [],
        bannedList: [],
      };
    }
  }

  if (!fallbackJails && jailNames.length === 0) {
    warnings.push('fail2ban-client did not report any active jails');
  }

  if (fallbackJails) {
    jails.push(...fallbackJails);
  } else {
    const jailResults = await Promise.allSettled(
      jailNames.map(async (jail) => {
        const output = await execCommand('fail2ban-client', ['status', jail]);
        return parseFail2banJailStatus(jail, output);
      }),
    );

    for (const result of jailResults) {
      if (result.status === 'fulfilled') {
        jails.push(result.value);
      } else {
        errors.push(`Fail2ban jail unavailable: ${toMessage(result.reason)}`);
      }
    }
  }

  for (const jail of jails) {
    for (const ip of jail.bannedList) {
      const key = `${jail.name}:${ip}`;
      if (!bannedMap.has(key)) {
        bannedMap.set(key, {
          ip,
          jail: jail.name,
        });
      }
    }
  }

  const totalBanned = jails.reduce((sum, jail) => sum + (Number.isFinite(jail.currentlyBanned) ? jail.currentlyBanned : 0), 0);
  const bannedList = [...bannedMap.values()];

  return {
    ok: true,
    collectedAt,
    source: 'fail2ban',
    warnings,
    errors,
    totalBanned: Number.isFinite(totalBanned) ? totalBanned : null,
    bannedCount: bannedList.length,
    jailsActive: jails.length,
    jails,
    bannedList,
  };
}

async function getCachedSnapshot(cacheKey, builder) {
  const entry = cache[cacheKey];
  const now = Date.now();
  if (entry.value && now - entry.collectedAt < SNAPSHOT_TTL_MS) {
    return entry.value;
  }
  if (entry.promise) {
    return entry.promise;
  }

  entry.promise = (async () => {
    try {
      const value = await builder();
      entry.value = value;
      entry.collectedAt = Date.now();
      return value;
    } finally {
      entry.promise = null;
    }
  })();

  return entry.promise;
}

function toLegacyVpsPayload(snapshot, fail2banSnapshot = null) {
  const banned = fail2banSnapshot?.totalBanned ?? 0;
  const bannedList = fail2banSnapshot?.bannedList?.map((item) => item.ip).filter(Boolean) ?? [];
  return {
    cpu: snapshot.host.cpuPercent ?? 0,
    ram: snapshot.host.ramPercent ?? 0,
    ramRaw: snapshot.host.ramUsed && snapshot.host.ramTotal ? `${snapshot.host.ramUsed}/${snapshot.host.ramTotal}` : '0/0',
    disk: snapshot.host.diskUsedPercent ?? 0,
    uptime: snapshot.host.uptime ? `up ${snapshot.host.uptime}` : 'N/A',
    containers: snapshot.containers,
    banned: String(banned),
    bannedList,
    warnings: snapshot.warnings,
    errors: snapshot.errors,
  };
}

async function getVpsSnapshot() {
  return getCachedSnapshot('vps', buildVpsSnapshot);
}

async function getFail2banSnapshotCached() {
  return getCachedSnapshot('fail2ban', getFail2banSnapshot);
}

async function getFail2banStats() {
  const snapshot = await getFail2banSnapshotCached();
  return {
    ok: snapshot.ok,
    collectedAt: snapshot.collectedAt,
    source: snapshot.source,
    warnings: snapshot.warnings,
    errors: snapshot.errors,
    totalBanned: snapshot.totalBanned,
    bannedCount: snapshot.bannedCount,
    jailsActive: snapshot.jailsActive,
  };
}

async function getFail2banJails() {
  const snapshot = await getFail2banSnapshotCached();
  return {
    ok: snapshot.ok,
    collectedAt: snapshot.collectedAt,
    source: snapshot.source,
    warnings: snapshot.warnings,
    errors: snapshot.errors,
    jailsActive: snapshot.jailsActive,
    jails: snapshot.jails,
  };
}

async function getFail2banBanned() {
  const snapshot = await getFail2banSnapshotCached();
  return {
    ok: snapshot.ok,
    collectedAt: snapshot.collectedAt,
    source: snapshot.source,
    warnings: snapshot.warnings,
    errors: snapshot.errors,
    totalBanned: snapshot.totalBanned,
    bannedCount: snapshot.bannedCount,
    bannedList: snapshot.bannedList,
  };
}

module.exports = {
  getVpsSnapshot,
  getFail2banSnapshot: getFail2banSnapshotCached,
  getFail2banStats,
  getFail2banJails,
  getFail2banBanned,
  toLegacyVpsPayload,
  // Exported for tests and future reuse.
  formatBinaryBytes,
  formatDuration,
  parseFail2banJailStatus,
  parseFail2banJailList,
};
