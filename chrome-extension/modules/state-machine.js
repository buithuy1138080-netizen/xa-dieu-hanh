/**
 * modules/state-machine.js
 * State machine tự động hóa: IDLE → CHECK_AUTH → SCAN → PROCESS_DOC → DONE
 * Depends on: CONFIG, DedupManager, AttachmentFinder, PdfDownloader
 */

/* global CONFIG, DedupManager, AttachmentFinder, PdfDownloader */

const AutomationStateMachine = (() => {
  'use strict';

  // ── States ─────────────────────────────────────────────────────

  const STATE = {
    IDLE:          'IDLE',
    CHECK_AUTH:    'CHECK_AUTH',
    SCAN_LIST:     'SCAN_LIST',
    PROCESS_DOC:   'PROCESS_DOC',
    OPEN_DETAIL:   'OPEN_DETAIL',
    EXTRACT_DATA:  'EXTRACT_DATA',
    DETECT_PDF:    'DETECT_PDF',
    DOWNLOAD_PDF:  'DOWNLOAD_PDF',
    CREATE_DOC:    'CREATE_DOC',
    UPLOAD_PDF:    'UPLOAD_PDF',
    MARK_DONE:     'MARK_DONE',
    ERROR:         'ERROR',
    DONE:          'DONE',
  };

  // ── Automation instance ────────────────────────────────────────

  let _state = STATE.IDLE;
  let _aborted = false;
  let _currentDoc = null;
  let _results = [];
  let _onProgress = null;
  let _onLog = null;

  function onProgress(cb) { _onProgress = cb; }
  function onLog(cb) { _onLog = cb; }

  function log(msg, level) {
    const entry = { ts: Date.now(), msg, level: level || 'info' };
    if (_onLog) _onLog(entry);
    console.log(`[IOC SM][${_state}]`, msg);
  }

  function progress(data) {
    if (_onProgress) _onProgress({ state: _state, ...data });
  }

  function abort() {
    _aborted = true;
    log('Đã hủy', 'warn');
    transition(STATE.IDLE);
  }

  function isRunning() { return _state !== STATE.IDLE && _state !== STATE.DONE && _state !== STATE.ERROR; }

  function transition(newState) {
    log(`${_state} → ${newState}`);
    _state = newState;
    progress({ state: newState });
  }

  // ── Helpers ────────────────────────────────────────────────────

  function extractDocInfoFromRow(row) {
    if (!row) return null;

    const DOC_NUM_RE = /\b\d{2,4}[-–][A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦ\-]+\/[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦ]{2,15}/u;
    const FILE_EXT   = /\.(pdf|docx?|xlsx?|pptx?|zip|rar)\b/i;
    const SHORT_STAT = /^(Thường|Khẩn|Hỏa tốc|Mật|Bí mật|Tối mật|Chờ xử lý|Đã xử lý|Đã trả lại|Công văn|Thông báo|Quyết định|Chỉ thị|Nghị quyết|Kế hoạch|Tờ trình|Báo cáo|Đề án|Hướng dẫn)$/i;

    const allText  = row.textContent || '';
    const numMatch = allText.match(DOC_NUM_RE);
    const docNumber = numMatch ? numMatch[0].trim() : null;

    // Tìm ngày ban hành
    const dateMatch = allText.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
    let issueDate = null;
    if (dateMatch) {
      const [, d, m, y] = dateMatch;
      issueDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    // Tìm trích yếu: ưu tiên <td> trực tiếp, bỏ qua cell chứa tên file / status ngắn
    const directTds = Array.from(row.children).filter(el => el.tagName === 'TD');
    const tds = directTds.length > 0 ? directTds : Array.from(row.querySelectorAll('td'));

    let title = '';
    for (const td of tds) {
      const t = td.textContent.trim().replace(/\s+/g, ' ');
      if (t.length < 15)           continue;  // quá ngắn (status, mã, ...)
      if (FILE_EXT.test(t))        continue;  // chứa tên file đính kèm
      if (SHORT_STAT.test(t))      continue;  // status ngắn
      if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/.test(t)) continue; // ngày thuần
      if (DOC_NUM_RE.test(t) && t.length < 50) continue; // chỉ là số văn bản
      if (t.length > title.length) title = t.slice(0, 500);
    }

    // Fallback: lấy text dài nhất không chứa filename
    if (!title) {
      row.querySelectorAll('td').forEach(td => {
        const t = td.textContent.trim().replace(/\s+/g, ' ');
        if (t.length > 20 && !FILE_EXT.test(t) && t.length > title.length) {
          title = t.slice(0, 500);
        }
      });
    }

    // Lấy link detail
    let detailUrl = null;
    const link = row.querySelector('a[href]');
    if (link) detailUrl = link.href;

    return { docNumber, issueDate, title, detailUrl };
  }

  function iocApiCall(method, path, body) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'IOC_API',
        method,
        path,
        body,
      }, resp => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (resp && resp.error) reject(new Error(resp.error));
        else resolve(resp);
      });
    });
  }

  // ── Main automation flow ───────────────────────────────────────

  /**
   * Xử lý 1 văn bản từ row element
   * @param {HTMLElement} row
   * @returns {object} result
   */
  async function processDocument(row) {
    if (_aborted) throw new Error('Aborted');

    const docInfo = extractDocInfoFromRow(row);
    if (!docInfo) return { status: 'skip', reason: 'Không đọc được thông tin văn bản' };

    _currentDoc = docInfo;
    log(`Xử lý: ${docInfo.docNumber || '(no num)'} — ${(docInfo.title || '').slice(0, 60)}`);

    // ── 1. Check dedup ──
    if (docInfo.docNumber && await DedupManager.isProcessed(docInfo.docNumber, docInfo.issueDate)) {
      log(`Đã xử lý trước đó: ${docInfo.docNumber}`, 'info');
      return { status: 'duplicate', docNumber: docInfo.docNumber };
    }
    if (docInfo.detailUrl && await DedupManager.isUrlProcessed(docInfo.detailUrl)) {
      log(`URL đã xử lý: ${docInfo.detailUrl}`, 'info');
      return { status: 'duplicate', docNumber: docInfo.docNumber };
    }

    // ── 2. Server dedup ──
    if (docInfo.docNumber) {
      const serverDup = await DedupManager.checkServerDuplicate(docInfo.docNumber);
      if (serverDup) {
        log(`Server: đã tồn tại ${docInfo.docNumber}`, 'info');
        await DedupManager.markProcessed(docInfo.docNumber, docInfo.issueDate, null);
        return { status: 'server_duplicate', docNumber: docInfo.docNumber };
      }
    }

    // ── 3. Tìm attachments (từ row) ──
    transition(STATE.DETECT_PDF);
    const attachments = AttachmentFinder.scanPageLinks(row);
    const pdfs = AttachmentFinder.filterPdfAttachments(attachments);
    log(`Tìm thấy ${attachments.length} file, ${pdfs.length} PDF`);

    // ── 4. Nếu không có PDF, tùy config có tạo doc không ──
    if (pdfs.length === 0 && !CONFIG.CREATE_DOC_WHEN_NO_PDF) {
      return { status: 'skip', reason: 'Không có PDF', docNumber: docInfo.docNumber };
    }

    // ── 5. Tạo văn bản trên IOC ──
    transition(STATE.CREATE_DOC);
    let iocDoc;
    try {
      iocDoc = await iocApiCall('POST', '/api/v1/documents/capture', {
        title:      docInfo.title || docInfo.docNumber || 'Văn bản chưa có trích yếu',
        doc_number: docInfo.docNumber,
        issue_date: docInfo.issueDate,
        source_url: docInfo.detailUrl || location.href,
      });
    } catch (e) {
      log(`Tạo văn bản lỗi: ${e.message}`, 'error');
      return { status: 'error', reason: `Tạo văn bản: ${e.message}`, docNumber: docInfo.docNumber };
    }

    const docId = iocDoc && (iocDoc.id || iocDoc.doc_id);
    if (!docId) {
      return { status: 'error', reason: 'API không trả về doc_id', docNumber: docInfo.docNumber };
    }
    log(`Tạo thành công: docId=${docId}`);

    // ── 6. Download + Upload PDFs ──
    const uploadResults = [];
    const pdfsToUpload = CONFIG.UPLOAD_ALL_PDFS ? pdfs : pdfs.slice(0, 1);

    for (const pdf of pdfsToUpload) {
      if (_aborted) break;
      transition(STATE.DOWNLOAD_PDF);
      log(`Download: ${pdf.filename}`);

      const downloaded = await PdfDownloader.downloadPdf(pdf.url, pdf.filename, docId);
      if (downloaded.status === 'error') {
        log(`Download lỗi: ${downloaded.reason}`, 'warn');
        uploadResults.push(downloaded);
        continue;
      }

      transition(STATE.UPLOAD_PDF);
      log(`Upload: ${pdf.filename} (${Math.round(downloaded.size / 1024)}KB)`);
      const uploaded = await PdfDownloader.safeUploadFile(downloaded, docId);
      uploadResults.push(uploaded);

      if (uploaded.status === 'uploaded') {
        log(`Upload OK: ${pdf.filename}`);
      } else {
        log(`Upload lỗi: ${uploaded.reason}`, 'warn');
      }
    }

    // ── 7. Mark processed ──
    transition(STATE.MARK_DONE);
    await DedupManager.markProcessed(docInfo.docNumber, docInfo.issueDate, docId);
    if (docInfo.detailUrl) await DedupManager.markUrlProcessed(docInfo.detailUrl, docId);

    const successUploads = uploadResults.filter(r => r.status === 'uploaded').length;
    log(`Hoàn tất: ${docInfo.docNumber} — ${successUploads}/${pdfsToUpload.length} PDF`);

    return {
      status: 'success',
      docNumber: docInfo.docNumber,
      iocDocId: docId,
      uploads: uploadResults,
    };
  }

  /**
   * Chạy automation trên danh sách rows
   * @param {HTMLElement[]} rows - Các row cần xử lý
   */
  async function run(rows) {
    if (isRunning()) {
      log('Đang chạy, bỏ qua lệnh run mới', 'warn');
      return;
    }

    _aborted = false;
    _results = [];
    _currentDoc = null;

    // ── Check auth ──
    transition(STATE.CHECK_AUTH);
    try {
      const auth = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'IOC_CHECK_AUTH' }, resp => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
      });
      if (!auth || !auth.authenticated) {
        transition(STATE.ERROR);
        log('Chưa đăng nhập IOC. Vui lòng đăng nhập tại xabacha.com', 'error');
        return { error: 'NOT_AUTHENTICATED' };
      }
    } catch (e) {
      transition(STATE.ERROR);
      log(`Kiểm tra auth lỗi: ${e.message}`, 'error');
      return { error: e.message };
    }

    // ── Scan ──
    transition(STATE.SCAN_LIST);
    const toProcess = rows.filter(r => r && r.nodeType === Node.ELEMENT_NODE);
    log(`Bắt đầu xử lý ${toProcess.length} văn bản`);
    progress({ total: toProcess.length, done: 0 });

    let done = 0;
    for (const row of toProcess) {
      if (_aborted) break;

      transition(STATE.PROCESS_DOC);
      try {
        const result = await processDocument(row);
        _results.push(result);
      } catch (e) {
        _results.push({ status: 'error', reason: e.message });
        log(`Lỗi: ${e.message}`, 'error');
      }

      done++;
      progress({ total: toProcess.length, done, lastResult: _results[_results.length - 1] });
    }

    transition(_aborted ? STATE.IDLE : STATE.DONE);
    const summary = {
      total: toProcess.length,
      success: _results.filter(r => r.status === 'success').length,
      duplicate: _results.filter(r => r.status === 'duplicate' || r.status === 'server_duplicate').length,
      error: _results.filter(r => r.status === 'error').length,
      skip: _results.filter(r => r.status === 'skip').length,
      results: _results,
    };
    log(`Tổng kết: ${summary.success} thành công, ${summary.duplicate} trùng, ${summary.error} lỗi`);
    progress({ summary });
    return summary;
  }

  return {
    STATE,
    run,
    abort,
    isRunning,
    onProgress,
    onLog,
    processDocument,
  };
})();
