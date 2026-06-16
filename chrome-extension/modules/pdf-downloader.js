/**
 * modules/pdf-downloader.js
 * Download file an toàn: timeout, retry, AbortController, size limit
 * Converts blob → base64 để gửi qua chrome.runtime.sendMessage
 * Depends on: CONFIG (config.js), AttachmentFinder
 */

/* global CONFIG, AttachmentFinder */

const PdfDownloader = (() => {
  'use strict';

  /**
   * Fetch với timeout và AbortController
   */
  async function fetchWithTimeout(url, timeoutMs, retries) {
    const maxRetries = retries !== undefined ? retries : CONFIG.MAX_RETRIES;
    let lastErr;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs || CONFIG.DOWNLOAD_TIMEOUT_MS);

      try {
        const resp = await fetch(url, {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timer);
        return resp;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (e.name === 'AbortError') {
          lastErr = new Error(`Timeout sau ${timeoutMs || CONFIG.DOWNLOAD_TIMEOUT_MS}ms`);
        }
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // backoff: 1s, 2s
        }
      }
    }
    throw lastErr || new Error('Download failed');
  }

  /**
   * Validate PDF blob:
   * - Size > 0 và < MAX_FILE_SIZE_MB
   * - Byte đầu tiên phải là %PDF header (25 50 44 46)
   */
  async function validatePdfBlob(blob) {
    if (!blob || blob.size < 100) {
      throw new Error('File rỗng hoặc quá nhỏ');
    }
    const maxBytes = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (blob.size > maxBytes) {
      throw new Error(`File quá lớn: ${Math.round(blob.size / 1024 / 1024)}MB (max ${CONFIG.MAX_FILE_SIZE_MB}MB)`);
    }
    // Check PDF magic bytes
    try {
      const header = await blob.slice(0, 5).text();
      if (!header.startsWith('%PDF')) {
        throw new Error('Không phải file PDF hợp lệ (thiếu header %PDF)');
      }
    } catch (e) {
      if (e.message.includes('PDF')) throw e;
      // Nếu .text() không hoạt động, bỏ qua kiểm tra magic bytes
    }
    return true;
  }

  /**
   * Blob → base64 string (không có data URL prefix)
   */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (!dataUrl) { reject(new Error('FileReader trả về null')); return; }
        const base64 = dataUrl.split(',')[1];
        if (!base64) { reject(new Error('Không tách được base64 từ data URL')); return; }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('FileReader lỗi'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Download PDF từ URL và upload lên IOC
   * @param {string} url - URL download file
   * @param {string} filename - Tên file
   * @param {string} docId - IOC doc id để attach
   * @returns {{fileName, status, reason, size, durationMs}}
   */
  async function downloadPdf(url, filename, docId) {
    const start = Date.now();

    try {
      const resp = await fetchWithTimeout(url, CONFIG.DOWNLOAD_TIMEOUT_MS, CONFIG.MAX_RETRIES);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

      const ct = resp.headers.get('content-type') || '';
      const cd = resp.headers.get('content-disposition') || '';

      // Nếu server trả về HTML (lỗi auth hoặc redirect) → bỏ
      if (ct.includes('text/html') && !ct.includes('pdf')) {
        throw new Error('Server trả về HTML (cần đăng nhập dhtn?)');
      }

      const blob = await resp.blob();

      // Validate size
      const maxBytes = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
      if (blob.size > maxBytes) {
        throw new Error(`File quá lớn: ${Math.round(blob.size / 1024 / 1024)}MB (max ${CONFIG.MAX_FILE_SIZE_MB}MB)`);
      }

      // Xác định tên file
      let name = filename;
      if (!name) {
        const cdMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
        if (cdMatch) name = decodeURIComponent(cdMatch[1].trim());
        else name = AttachmentFinder.extractFilenameFromUrl(url) || 'document.pdf';
      }

      // Chắc đuôi .pdf
      if (!name.toLowerCase().endsWith('.pdf')) {
        if (ct.includes('pdf')) name += '.pdf';
      }

      const base64 = await blobToBase64(blob);

      return {
        fileName: name,
        status: 'downloaded',
        base64,
        mimeType: blob.type || 'application/pdf',
        size: blob.size,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        fileName: filename || 'unknown',
        status: 'error',
        reason: e.message,
        size: 0,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Upload file lên IOC thông qua background.js
   * @param {object} fileData - Kết quả từ downloadPdf()
   * @param {string} docId - IOC doc id
   * @returns {{fileName, status, reason, size, durationMs}}
   */
  async function safeUploadFile(fileData, docId) {
    const start = Date.now();
    if (fileData.status !== 'downloaded' || !fileData.base64) {
      return { ...fileData, status: 'skip', reason: fileData.reason || 'Không có dữ liệu' };
    }

    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'IOC_UPLOAD_BASE64',
          path: `/api/v1/documents/${docId}/file`,
          base64: fileData.base64,
          filename: fileData.fileName,
          mimeType: fileData.mimeType,
          docId,
        }, resp => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
      });

      if (result && result.error) throw new Error(result.error);

      return {
        fileName: fileData.fileName,
        status: 'uploaded',
        size: fileData.size,
        durationMs: fileData.durationMs + (Date.now() - start),
      };
    } catch (e) {
      return {
        fileName: fileData.fileName,
        status: 'upload_error',
        reason: e.message,
        size: fileData.size,
        durationMs: fileData.durationMs + (Date.now() - start),
      };
    }
  }

  return {
    fetchWithTimeout,
    validatePdfBlob,
    blobToBase64,
    downloadPdf,
    safeUploadFile,
  };
})();
