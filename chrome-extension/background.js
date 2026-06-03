/**
 * Background Service Worker — IOC Capture Extension
 * Relay API calls từ content script (bị CORS) sang xabacha.com
 * Background scripts bypass CORS hoàn toàn.
 */

const IOC_URL = 'https://xabacha.com';
const API_URL = `${IOC_URL}/api/v1`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Gọi API xabacha.com (không bị CORS từ background) ──
  if (msg.action === 'IOC_API') {
    const { method, path, token, body } = msg;
    fetch(`${API_URL}${path}`, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })))
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  // ── Upload file từ base64 (content script đã fetch từ dhtn) ──
  if (msg.action === 'IOC_UPLOAD_BASE64') {
    const { docId, fileName, mimeType, base64, token } = msg;
    try {
      // base64 → binary → Blob
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType || 'application/pdf' });

      const fd = new FormData();
      fd.append('file', blob, fileName || 'document.pdf');

      const resp = await fetch(`${API_URL}/documents/${docId}/file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      const data = await resp.json().catch(() => ({}));
      sendResponse({ ok: resp.ok, status: resp.status, data });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }

  // ── Mở tab xabacha.com ──
  if (msg.action === 'IOC_OPEN_TAB') {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
  }

});

// Khi click icon extension
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('dhtn.dcs.vn')) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const fab = document.getElementById('ioc-fab');
        if (fab) fab.click();
      }
    });
  } else {
    chrome.tabs.create({ url: 'https://xabacha.com/capture/guide' });
  }
});
