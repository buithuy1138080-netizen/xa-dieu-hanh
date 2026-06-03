/**
 * Background Service Worker — IOC Capture Extension v1.2
 * Relay API calls từ content script (dhtn.dcs.vn) sang xabacha.com
 */

const IOC_URL = 'https://xabacha.com';
const API_URL = `${IOC_URL}/api/v1`;

// Tất cả xử lý async trong hàm riêng
async function handleMessage(msg, sendResponse) {
  try {

    // ── Gọi API xabacha.com (POST/GET) ──
    if (msg.action === 'IOC_API') {
      const resp = await fetch(`${API_URL}${msg.path}`, {
        method: msg.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${msg.token}`,
        },
        body: msg.body ? JSON.stringify(msg.body) : undefined,
      });
      const data = await resp.json().catch(() => ({}));
      sendResponse({ ok: resp.ok, status: resp.status, data });
      return;
    }

    // ── Upload file (nhận base64 từ content script, upload lên xabacha) ──
    if (msg.action === 'IOC_UPLOAD_BASE64') {
      const { docId, fileName, mimeType, base64, token } = msg;

      // Giải mã base64 → Blob
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });

      const fd = new FormData();
      fd.append('file', blob, fileName || 'document.pdf');

      const resp = await fetch(`${API_URL}/documents/${docId}/file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      const data = await resp.json().catch(() => ({}));
      sendResponse({ ok: resp.ok, status: resp.status, data });
      return;
    }

    // ── Mở tab mới ──
    if (msg.action === 'IOC_OPEN_TAB') {
      await chrome.tabs.create({ url: msg.url });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown action: ' + msg.action });

  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// Listener — gọi async handler, trả về true để giữ kênh mở
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sendResponse);
  return true; // QUAN TRỌNG: giữ sendResponse hợp lệ cho async
});

// Click icon extension → toggle panel trên dhtn hoặc mở guide
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('dhtn.dcs.vn')) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const fab = document.getElementById('ioc-fab');
        if (fab) fab.click();
      },
    });
  } else {
    chrome.tabs.create({ url: 'https://xabacha.com/capture/guide' });
  }
});
