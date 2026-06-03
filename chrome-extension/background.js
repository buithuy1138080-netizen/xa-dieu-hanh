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

  // ── Upload file (fetch từ dhtn + upload lên xabacha) ──
  if (msg.action === 'IOC_UPLOAD') {
    const { docId, fileUrl, fileName, token } = msg;
    // Fetch file từ dhtn.dcs.vn (background bypass same-origin)
    fetch(fileUrl, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`File fetch failed: ${r.status}`);
        return r.blob();
      })
      .then(blob => {
        const fd = new FormData();
        fd.append('file', blob, fileName || 'document.pdf');
        return fetch(`${API_URL}/documents/${docId}/file`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
        });
      })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
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
