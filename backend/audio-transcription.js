const fs = require('fs');
const path = require('path');

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3';
const GROQ_ENV_CANDIDATES = [
  process.env.GROQ_API_KEY?.trim(),
  process.env.OPENCLAW_GROQ_API_KEY?.trim(),
  '/root/openclaw/.env',
  '/home/node/.openclaw/.env',
].filter(Boolean);

function readGroqApiKey() {
  for (const candidate of GROQ_ENV_CANDIDATES) {
    if (!candidate) continue;
    if (candidate.startsWith('gsk_')) return candidate;
    try {
      if (!fs.existsSync(candidate)) continue;
      const content = fs.readFileSync(candidate, 'utf8');
      const match = content.match(/^\s*GROQ_API_KEY\s*=\s*([^\s#]+)\s*$/m);
      if (match?.[1]) return match[1].trim();
    } catch {
      // Continue to the next candidate.
    }
  }
  return null;
}

function extractGroqTranscript(json) {
  const direct = String(json?.text || json?.transcript || json?.result?.text || '').trim();
  if (direct) return direct;
  const alternatives = [
    json?.result?.data?.text,
    json?.data?.text,
    json?.segments?.map?.((segment) => segment?.text).filter(Boolean).join(' '),
  ];
  for (const value of alternatives) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function detectFilename(mimeType = 'audio/webm') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('mp4') || normalized.includes('m4a')) return `recording-${Date.now()}.m4a`;
  if (normalized.includes('ogg')) return `recording-${Date.now()}.ogg`;
  if (normalized.includes('wav')) return `recording-${Date.now()}.wav`;
  return `recording-${Date.now()}.webm`;
}

async function transcribeAudioBuffer({ fetchImpl, buffer, mimeType, filename, agentId } = {}) {
  const apiKey = readGroqApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured on this host');
  }
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Audio payload is empty');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available');
  }

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  form.append('file', blob, filename || detectFilename(mimeType));
  form.append('model', GROQ_MODEL);

  const response = await fetchImpl(GROQ_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const rawText = await response.text();
  let payload;
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    const message = extractGroqTranscript(payload) || payload?.error?.message || payload?.error || rawText || `Groq transcription failed (${response.status})`;
    throw new Error(message);
  }

  const transcript = extractGroqTranscript(payload);
  if (!transcript) {
    throw new Error('Groq returned an empty transcript');
  }

  return {
    ok: true,
    collectedAt: new Date().toISOString(),
    source: 'groq',
    warnings: [],
    errors: [],
    agentId: agentId || null,
    model: GROQ_MODEL,
    transcript,
    filename: filename || detectFilename(mimeType),
    mimeType: mimeType || 'application/octet-stream',
    bytes: buffer.length,
    raw: payload,
  };
}

module.exports = {
  GROQ_MODEL,
  GROQ_TRANSCRIPTION_URL,
  readGroqApiKey,
  extractGroqTranscript,
  detectFilename,
  transcribeAudioBuffer,
};
