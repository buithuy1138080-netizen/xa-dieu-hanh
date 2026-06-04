/**
 * interceptor.js — chạy trong MAIN world của dhtn.dcs.vn
 * Bắt chặn file download từ ZK Framework TRƯỚC khi xuống máy user
 *
 * Kỹ thuật:
 *  1. Override URL.createObjectURL → bắt Blob được tạo ra
 *  2. Override fetch → bắt binary response (PDF, DOCX...)
 *  3. Override XMLHttpRequest → bắt XHR binary response
 *  4. Dispatch CustomEvent → gửi file data sang content.js (isolated world)
 */

(function () {
  'use strict';

  const FILE_MIME = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument',
    'application/vnd.ms-excel',
    'application/octet-stream',
    'application/zip',
  ];

  function isBinaryMime(mime) {
    return FILE_MIME.some(m => (mime || '').toLowerCase().startsWith(m));
  }

  function guessFilename(url, contentDisposition, mimeType) {
    // Try Content-Disposition header first
    if (contentDisposition) {
      const m = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
      if (m) return decodeURIComponent(m[1].trim());
    }
    // Try URL
    if (url) {
      const part = url.split('/').pop()?.split('?')[0];
      if (part && part.includes('.')) return part;
    }
    // Fallback by mime
    const ext = (mimeType || '').includes('pdf') ? '.pdf'
              : (mimeType || '').includes('word') ? '.docx'
              : (mimeType || '').includes('excel') || (mimeType || '').includes('sheet') ? '.xlsx'
              : '';
    return `document${ext}`;
  }

  function dispatchFile(blob, filename, sourceUrl) {
    if (!blob || blob.size === 0) return;
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = (reader.result || '').toString().split(',')[1];
      if (!base64) return;
      window.dispatchEvent(new CustomEvent('__ioc_file_captured__', {
        detail: {
          base64,
          filename: filename || 'document.pdf',
          mimeType: blob.type || 'application/octet-stream',
          sourceUrl: sourceUrl || location.href,
          size: blob.size,
        },
      }));
    };
    reader.readAsDataURL(blob);
  }

  /* ══════════════════════════════
     1. Bắt URL.createObjectURL
     ZK tạo blob URL → trigger download
  ══════════════════════════════ */
  const _createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (blob) {
    const url = _createObjectURL(blob);
    if (blob instanceof Blob && isBinaryMime(blob.type)) {
      const filename = guessFilename(null, null, blob.type);
      dispatchFile(blob, filename, location.href);
    }
    return url;
  };

  /* ══════════════════════════════
     2. Bắt window.fetch binary
  ══════════════════════════════ */
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await _fetch(...args);
    const url = (args[0] instanceof Request ? args[0].url : args[0]) || '';
    const contentType = response.headers.get('content-type') || '';
    const contentDisp  = response.headers.get('content-disposition') || '';

    if (isBinaryMime(contentType) || contentDisp.includes('attachment')) {
      const cloned = response.clone();
      cloned.blob().then(blob => {
        const filename = guessFilename(url, contentDisp, contentType);
        dispatchFile(blob, filename, url);
      }).catch(() => {});
    }
    return response;
  };

  /* ══════════════════════════════
     3. Bắt XMLHttpRequest binary
  ══════════════════════════════ */
  const _XHROpen = XMLHttpRequest.prototype.open;
  const _XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ioc_url__ = url;
    return _XHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const contentType = this.getResponseHeader('content-type') || '';
        const contentDisp  = this.getResponseHeader('content-disposition') || '';
        if ((isBinaryMime(contentType) || contentDisp.includes('attachment'))
            && this.response instanceof Blob) {
          const filename = guessFilename(this.__ioc_url__, contentDisp, contentType);
          dispatchFile(this.response, filename, this.__ioc_url__);
        }
      } catch (_) {}
    });
    // Ensure binary response type for blobs
    if (!this.responseType) this.responseType = 'blob';
    return _XHRSend.apply(this, arguments);
  };

  console.log('[IOC Interceptor] Active on', location.hostname);
})();
