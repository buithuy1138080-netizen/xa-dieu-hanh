/**
 * modules/attachment-finder.js
 * Tìm và lọc file đính kèm trên trang detail dhtn.dcs.vn
 * Chỉ lấy PDF (configurable), validate URL, filter trùng
 * Depends on: CONFIG (config.js)
 */

/* global CONFIG */

const AttachmentFinder = (() => {
  'use strict';

  const PDF_EXT_RE = /\.pdf(\?.*)?$/i;
  const FILE_EXT_RE = /\.(pdf|doc|docx|xls|xlsx|zip|rar|ppt|pptx|txt|odt|ods)(\?.*)?$/i;
  const DOWNLOAD_PATH_RE = /\/(download|export|attachment|getfile|downloadfile)/i;

  function isPdfUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    const path = url.split('?')[0];
    return PDF_EXT_RE.test(path) ||
           (lower.includes('/download') && (lower.includes('.pdf') || lower.includes('pdf')));
  }

  function isPdfFile(filename) {
    return PDF_EXT_RE.test(String(filename || ''));
  }

  function isFileUrl(url) {
    if (!url) return false;
    const path = url.split('?')[0];
    return FILE_EXT_RE.test(path) || DOWNLOAD_PATH_RE.test(url);
  }

  function validateFileUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url, location.href);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
      if (!u.hostname.includes('dhtn.dcs.vn') && !u.hostname.includes('xabacha.com')) return false;
      return true;
    } catch (_) { return false; }
  }

  function normalizeUrl(url) {
    try {
      return new URL(url, location.href).href;
    } catch (_) { return url; }
  }

  function extractFilenameFromUrl(url) {
    try {
      const path = new URL(url, location.href).pathname;
      const parts = path.split('/');
      const last = parts[parts.length - 1];
      if (last && last.includes('.')) return decodeURIComponent(last);
    } catch (_) {}
    return null;
  }

  function extractFilenameFromText(text) {
    if (!text) return null;
    const t = text.trim();
    if (t.length > 0 && t.length < 200) return t;
    return null;
  }

  /**
   * Quét toàn bộ trang để tìm link file
   * @returns {Array<{url, filename, isPdf}>}
   */
  function scanPageLinks(container) {
    const root = container || document;
    const seen = new Set();
    const results = [];

    // 1. Tìm <a href> với extension file
    root.querySelectorAll('a[href]').forEach(a => {
      const href = a.href || a.getAttribute('href') || '';
      const absUrl = normalizeUrl(href);
      if (!validateFileUrl(absUrl) || !isFileUrl(absUrl)) return;
      if (seen.has(absUrl)) return;
      seen.add(absUrl);

      const textName = extractFilenameFromText(a.textContent);
      const urlName = extractFilenameFromUrl(absUrl);
      const filename = textName || urlName || 'document';
      results.push({ url: absUrl, filename, isPdf: isPdfUrl(absUrl) || isPdfFile(filename) });
    });

    // 2. Tìm button/span có data-href hoặc onclick chứa download URL
    root.querySelectorAll('[data-href], [onclick]').forEach(el => {
      const attr = el.getAttribute('data-href') || el.getAttribute('onclick') || '';
      const match = attr.match(/https?:\/\/[^\s'"]+/g);
      if (!match) return;
      match.forEach(url => {
        const absUrl = normalizeUrl(url);
        if (!validateFileUrl(absUrl) || !isFileUrl(absUrl)) return;
        if (seen.has(absUrl)) return;
        seen.add(absUrl);
        const filename = extractFilenameFromUrl(absUrl) || 'document';
        results.push({ url: absUrl, filename, isPdf: isPdfUrl(absUrl) || isPdfFile(filename) });
      });
    });

    return results;
  }

  /**
   * Lọc chỉ lấy PDF
   */
  function filterPdfAttachments(attachments) {
    return attachments.filter(a => a.isPdf);
  }

  /**
   * Quyết định có upload attachment không
   * Nếu CONFIG.AUTO_UPLOAD_ONLY_PDF = true → chỉ PDF
   */
  function shouldUpload(attachment) {
    if (CONFIG.AUTO_UPLOAD_ONLY_PDF) return attachment.isPdf;
    return true;
  }

  /**
   * Tìm file trong danh sách popup (ZK file list dialog)
   * Dùng sau khi popup đã mở, truyền vào container element
   */
  function scanFilePopup(popupContainer) {
    if (!popupContainer) return [];
    return scanPageLinks(popupContainer);
  }

  return {
    isPdfUrl,
    isPdfFile,
    isFileUrl,
    validateFileUrl,
    normalizeUrl,
    extractFilenameFromUrl,
    scanPageLinks,
    scanFilePopup,
    filterPdfAttachments,
    shouldUpload,
  };
})();
