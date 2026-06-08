/**
 * background.js (service worker) v3.0
 * Cải tiến: sender validation + API path whitelist + timeout + JWT check
 */

// ── Constants ────────────────────────────────────────────────────

const API_BASE = 'https://xabacha.com';

const ALLOWED_ORIGINS = [
  'https://dhtn.dcs.vn',
  'https://xabacha.com',
];

const ALLOWED_API_PREFIXES = [
  '/api/v1/documents/capture',
  '/api/v1/documents/',
  '/api/v1/auth/me',
  '/api/v1/auth/check',
];

// ── Security helpers ─────────────────────────────────────────────

function assertAllowedSender(sender) {
  const origin = sender && sender.origin;
  if (!origin) throw new Error('Sender missing origin');
  if (!ALLOWED_ORIGINS.includes(origin)) throw new Error(`Blocked origin: ${origin}`);
}

function assertAllowedApiPath(path) {
  if (typeof path !== 'string' || !path) throw new Error('path must be non-empty string');
  const clean = path.split('?')[0];
  const ok = ALLOWED_API_PREFIXES.some(p => clean === p || clean.startsWith(p));
  if (!ok) throw new Error(`Blocked API path: ${path}`);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

// ── Token helpers ────────────────────────────────────────────────

function decodeJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch (_) { return null; }
}

async function getToken() {
  const data = await chrome.storage.local.get(['ioc_token', 'ioc_token_ts']);
  const token = data.ioc_token;
  if (!token) return null;

  const exp = decodeJwtExp(token);
  if (exp !== null) {
    if (exp < Date.now()) {
      await chrome.storage.local.remove(['ioc_token', 'ioc_token_ts']);
      return null;
    }
  } else {
    // Fallback: timestamp-based expiry (8h)
    const ts = Number(data.ioc_token_ts || 0);
    if (Date.now() - ts > 8 * 3600 * 1000) {
      await chrome.storage.local.remove(['ioc_token', 'ioc_token_ts']);
      return null;
    }
  }
  return token;
}

// ── Handlers ─────────────────────────────────────────────────────

async function handleIocApi(msg) {
  assertAllowedApiPath(msg.path);
  const token = await getToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const url = API_BASE + msg.path;
  const init = {
    method: msg.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (msg.body) init.body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);

  const resp = await withTimeout(fetch(url, init), 15_000);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  if (!resp.ok) throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
  return data;
}

// Detect file extension from base64 magic bytes when filename has no extension
function _detectExt(base64, mimeType) {
  try {
    const b = atob(base64.slice(0, 16));
    const a = b.split('').map(c => c.charCodeAt(0));
    if (a[0] === 0x25 && a[1] === 0x50 && a[2] === 0x44 && a[3] === 0x46) return '.pdf';
    if (a[0] === 0x50 && a[1] === 0x4B) {
      // ZIP-based: DOCX or XLSX — use mimeType hint, default .docx
      if ((mimeType || '').includes('sheet') || (mimeType || '').includes('excel')) return '.xlsx';
      return '.docx';
    }
    if (a[0] === 0xD0 && a[1] === 0xCF && a[2] === 0x11 && a[3] === 0xE0) {
      if ((mimeType || '').includes('excel') || (mimeType || '').includes('sheet')) return '.xls';
      return '.doc';
    }
  } catch (_) {}
  // Fallback from mimeType
  if ((mimeType || '').includes('pdf'))   return '.pdf';
  if ((mimeType || '').includes('word'))  return '.docx';
  if ((mimeType || '').includes('excel') || (mimeType || '').includes('sheet')) return '.xlsx';
  return '.pdf'; // ZK thường trả về PDF
}

async function handleIocUploadBase64(msg) {
  const apiPath = msg.path || '/api/v1/documents/capture';
  assertAllowedApiPath(apiPath);

  const token = await getToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const { base64, filename, fileName, mimeType, docId } = msg;
  let name = filename || fileName;
  if (!base64 || !name) throw new Error('Missing base64 or filename');

  // Nếu tên file không có extension (VD: "document"), tự detect từ magic bytes
  if (!name.includes('.')) {
    name = name + _detectExt(base64, mimeType);
  }

  // Size check (~0.75 ratio for base64)
  const approxBytes = Math.ceil(base64.length * 0.75);
  if (approxBytes > 15 * 1024 * 1024) {
    throw new Error(`File too large: ~${Math.round(approxBytes / 1024 / 1024)}MB (max 15MB)`);
  }

  // Decode base64
  let binary;
  try {
    const str = atob(base64);
    binary = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) binary[i] = str.charCodeAt(i);
  } catch (_) {
    throw new Error('Invalid base64 data');
  }

  const blob = new Blob([binary], { type: mimeType || 'application/octet-stream' });
  const form = new FormData();
  form.append('file', blob, name);
  if (docId) form.append('doc_id', String(docId));

  const url = API_BASE + apiPath;
  const resp = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    }),
    60_000
  );

  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = text; }
  if (!resp.ok) throw new Error(`Upload ${resp.status}: ${text.slice(0, 300)}`);
  return data;
}

async function handleIocOpenTab(msg) {
  const url = String(msg.url || '');
  if (!ALLOWED_ORIGINS.some(o => url.startsWith(o))) {
    throw new Error(`Blocked open tab: ${url}`);
  }
  const tab = await chrome.tabs.create({ url });
  return { ok: true, tabId: tab.id };
}

async function handleCheckAuth() {
  const token = await getToken();
  return { authenticated: !!token };
}

async function handleClearToken() {
  await chrome.storage.local.remove(['ioc_token', 'ioc_token_ts']);
  return { ok: true };
}

async function handleGetToken() {
  const token = await getToken();
  return { token: token || null };
}

// ── Router ───────────────────────────────────────────────────────

async function routeMessage(msg, sender) {
  try {
    assertAllowedSender(sender);
  } catch (e) {
    return { error: `Security: ${e.message}` };
  }

  try {
    switch (msg.action) {
      case 'IOC_API':           return await handleIocApi(msg);
      case 'IOC_UPLOAD_BASE64': return await handleIocUploadBase64(msg);
      case 'IOC_OPEN_TAB':      return await handleIocOpenTab(msg);
      case 'IOC_CHECK_AUTH':    return await handleCheckAuth();
      case 'IOC_GET_TOKEN':     return await handleGetToken();
      case 'IOC_CLEAR_TOKEN':   return await handleClearToken();
      default:
        return { error: `Unknown action: ${msg.action}` };
    }
  } catch (e) {
    console.error('[IOC BG]', msg.action, e.message);
    return { error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  routeMessage(msg, sender).then(sendResponse).catch(e => sendResponse({ error: e.message }));
  return true;
});

// Click icon → toggle FAB trên dhtn hoặc mở guide
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('dhtn.dcs.vn')) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { const f = document.getElementById('ioc-fab'); if (f) f.click(); },
    });
  } else {
    chrome.tabs.create({ url: 'https://xabacha.com/capture/guide' });
  }
});
