/**
 * interceptor.js — v2.1 (an toàn hơn)
 * Chỉ bắt file download, KHÔNG ảnh hưởng đến ZK Framework AJAX
 *
 * Kỹ thuật:
 *  1. URL.createObjectURL — ZK tạo blob trước khi download (phương pháp chính)
 *  2. fetch — chỉ bắt khi Content-Disposition = attachment (không động tới JSON/HTML)
 *  XHR KHÔNG override (sẽ phá vỡ ZK page rendering)
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
    if (contentDisposition) {
      const m = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
      if (m) return decodeURIComponent(m[1].trim());
    }
    if (url) {
      const part = url.split('/').pop()?.split('?')[0];
      if (part && part.match(/\.[a-z]{2,5}$/i)) return part;
    }
    const ext = (mimeType || '').includes('pdf') ? '.pdf'
              : (mimeType || '').includes('word') ? '.docx'
              : (mimeType || '').includes('excel') || (mimeType || '').includes('sheet') ? '.xlsx'
              : '';
    return `document${ext}`;
  }

  function dispatchFile(blob, filename, sourceUrl) {
    if (!blob || blob.size < 100) return; // bỏ qua blob rỗng
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = (reader.result || '').toString().split(',')[1];
      if (!base64) return;
      try {
        window.dispatchEvent(new CustomEvent('__ioc_file_captured__', {
          detail: {
            base64,
            filename: filename || 'document.pdf',
            mimeType: blob.type || 'application/octet-stream',
            sourceUrl: sourceUrl || location.href,
            size: blob.size,
          },
        }));
      } catch (_) {}
    };
    reader.onerror = () => {};
    reader.readAsDataURL(blob);
  }

  /* ══════════════════════════════
     1. Bắt URL.createObjectURL
     Phương pháp AN TOÀN nhất — ZK tạo blob
     URL trước khi trigger download
  ══════════════════════════════ */
  try {
    const _createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      const url = _createObjectURL(blob);
      try {
        if (blob instanceof Blob && blob.size > 500 && isBinaryMime(blob.type)) {
          const filename = guessFilename(null, null, blob.type);
          dispatchFile(blob, filename, location.href);
        }
      } catch (_) {}
      return url;
    };
  } catch (_) {}

  /* ══════════════════════════════
     2. Bắt fetch — CHỈ khi có
     Content-Disposition: attachment
     Không động tới JSON/HTML của ZK
  ══════════════════════════════ */
  try {
    const _fetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
      let response;
      try {
        response = await _fetch(...args);
      } catch (e) {
        throw e; // không can thiệp vào network errors
      }

      try {
        const url = (args[0] instanceof Request ? args[0].url : String(args[0])) || '';
        const cd   = response.headers.get('content-disposition') || '';
        const ct   = response.headers.get('content-type') || '';

        // Chỉ bắt nếu server nói đây là file download
        if (cd.toLowerCase().includes('attachment') && isBinaryMime(ct)) {
          const cloned = response.clone();
          cloned.blob().then(blob => {
            const filename = guessFilename(url, cd, ct);
            dispatchFile(blob, filename, url);
          }).catch(() => {});
        }
      } catch (_) {}

      return response; // luôn trả về response gốc
    };
  } catch (_) {}

  // KHÔNG override XMLHttpRequest — ZK dùng XHR cho mọi thứ

})();
