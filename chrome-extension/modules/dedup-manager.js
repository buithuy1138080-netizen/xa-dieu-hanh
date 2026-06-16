/**
 * modules/dedup-manager.js
 * Chống tạo văn bản trùng: local cache (chrome.storage) + server check
 * Depends on: CONFIG (config.js)
 */

/* global CONFIG */

const DedupManager = (() => {
  'use strict';

  const STORAGE_KEY = 'ioc_processed_docs';
  const MAX_ENTRIES = 500; // Giới hạn để tránh chrome.storage đầy

  // Tạo key ổn định từ thông tin văn bản
  function makeKey(docNumber, issueDate) {
    const num = String(docNumber || '').trim().toUpperCase();
    const date = String(issueDate || '').trim().slice(0, 10); // YYYY-MM-DD
    return `${num}|${date}`;
  }

  // Tạo key từ URL detail (fallback)
  function makeUrlKey(url) {
    try {
      const u = new URL(url);
      return 'URL:' + u.pathname + u.search;
    } catch (_) {
      return 'URL:' + url;
    }
  }

  async function _load() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      return data[STORAGE_KEY] || {};
    } catch (_) { return {}; }
  }

  async function _save(cache) {
    // Trim nếu quá nhiều entry
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
      // Xóa entries cũ nhất (sort by timestamp)
      const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      const toDelete = sorted.slice(0, keys.length - MAX_ENTRIES);
      toDelete.forEach(k => delete cache[k]);
    }
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
    } catch (_) {}
  }

  async function isProcessed(docNumber, issueDate) {
    if (!CONFIG.LOCAL_CACHE_ENABLED) return false;
    const cache = await _load();
    const key = makeKey(docNumber, issueDate);
    return key in cache;
  }

  async function isUrlProcessed(url) {
    if (!CONFIG.LOCAL_CACHE_ENABLED) return false;
    const cache = await _load();
    const key = makeUrlKey(url);
    return key in cache;
  }

  async function markProcessed(docNumber, issueDate, iocDocId) {
    if (!CONFIG.LOCAL_CACHE_ENABLED) return;
    const cache = await _load();
    const key = makeKey(docNumber, issueDate);
    cache[key] = { ts: Date.now(), iocDocId: iocDocId || null };
    await _save(cache);
  }

  async function markUrlProcessed(url, iocDocId) {
    if (!CONFIG.LOCAL_CACHE_ENABLED) return;
    const cache = await _load();
    const key = makeUrlKey(url);
    cache[key] = { ts: Date.now(), iocDocId: iocDocId || null };
    await _save(cache);
  }

  async function getIocDocId(docNumber, issueDate) {
    const cache = await _load();
    const key = makeKey(docNumber, issueDate);
    return cache[key] ? cache[key].iocDocId : null;
  }

  async function clearAll() {
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  async function getStats() {
    const cache = await _load();
    return {
      total: Object.keys(cache).length,
      maxEntries: MAX_ENTRIES,
    };
  }

  // Server-side duplicate check — dùng list endpoint để tránh conflict với /{doc_id}
  async function checkServerDuplicate(docNumber) {
    if (!CONFIG.CHECK_SERVER_DUPLICATE || !docNumber) return false;
    try {
      const q = encodeURIComponent(docNumber);
      const resp = await chrome.runtime.sendMessage({
        action: 'IOC_API',
        method: 'GET',
        path: `/api/v1/documents/?search=${q}&size=1`,
      });
      if (!resp || resp.error) return false; // Lỗi → cứ tạo mới
      // PaginatedResponse: { total: N, items: [...] }
      return (resp.total > 0) || (Array.isArray(resp.items) && resp.items.length > 0);
    } catch (_) { return false; }
  }

  return {
    makeKey,
    makeUrlKey,
    isProcessed,
    isUrlProcessed,
    markProcessed,
    markUrlProcessed,
    getIocDocId,
    clearAll,
    getStats,
    checkServerDuplicate,
  };
})();
