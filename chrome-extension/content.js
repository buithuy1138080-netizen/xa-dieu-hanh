/**
 * IOC Capture v2 — Content Script (Chrome Extension)
 * Hỗ trợ cả trang DANH SÁCH và trang CHI TIẾT của dhtn.dcs.vn
 * Bao gồm: tìm + tải file đính kèm PDF, upload lên xabacha.com
 */

const IOC_URL = 'https://xabacha.com';
const API_URL = `${IOC_URL}/api/v1`;

/* ══════════════════════════════════════
   TÌM FILE ĐÍNH KÈM
══════════════════════════════════════ */

function findAttachments() {
  const FILE_EXTS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg'];
  const links = Array.from(document.querySelectorAll('a[href]'));
  const seen = new Set();
  return links.filter(a => {
    const href = (a.href || '').toLowerCase();
    const isFile = FILE_EXTS.some(ext => href.includes(ext))
                || href.includes('download')
                || href.includes('attachment');
    if (!isFile || seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  }).map(a => {
    const name = a.textContent.trim()
              || a.getAttribute('download')
              || a.href.split('/').pop().split('?')[0]
              || 'van-ban.pdf';
    return { url: a.href, name };
  }).slice(0, 5);
}

/* ══════════════════════════════════════
   NHẬN DIỆN TRANG
══════════════════════════════════════ */

function getPageInfo() {
  const url = location.href.toLowerCase();
  const title = (document.title || '').toLowerCase();

  // Trang CHI TIẾT: có nhãn "Trích yếu" và "Số, ký hiệu" dạng label-value
  const detailLabels = ['Trích yếu', 'Số, ký hiệu', 'Ngày văn bản', 'Thông tin chi tiết'];
  const cells = Array.from(document.querySelectorAll('td, th, b, strong'));
  const isDetail = detailLabels.some(lbl =>
    cells.some(el => el.textContent.trim() === lbl)
  );

  const docType = (url.includes('van-ban-den') || title.includes('văn bản đến'))
    ? 'incoming'
    : (url.includes('ban-hanh') || url.includes('van-ban-di') || title.includes('văn bản đi') || title.includes('ban hành'))
    ? 'outgoing'
    : 'incoming';

  return { isDetail, docType };
}

/* ══════════════════════════════════════
   TRÍCH XUẤT DỮ LIỆU — TRANG CHI TIẾT
   (Trang "Thông tin chi tiết văn bản")
══════════════════════════════════════ */

function extractFromDetailPage() {
  // Tìm theo label text — cách đáng tin nhất
  function findValue(labelTexts) {
    const tds = Array.from(document.querySelectorAll('td, th, div, span, label'));
    for (const td of tds) {
      const text = (td.textContent || '').trim();
      const isLabel = labelTexts.some(l => text === l || text.startsWith(l));
      if (!isLabel) continue;
      // Lấy ô kế tiếp (sibling hoặc next td)
      const next = td.nextElementSibling;
      if (next) {
        const val = (next.textContent || '').trim();
        if (val && val.length > 0) return val;
      }
      // Hoặc parent row, lấy tất cả tds
      const row = td.closest('tr');
      if (row) {
        const cells = Array.from(row.querySelectorAll('td'));
        const idx = cells.indexOf(td);
        if (idx >= 0 && cells[idx + 1]) {
          return (cells[idx + 1].textContent || '').trim();
        }
      }
    }
    return '';
  }

  const docNumber = findValue(['Số, ký hiệu', 'Số ký hiệu', 'Số/ký hiệu', 'Ký hiệu']);
  const title     = findValue(['Trích yếu', 'Trích yếu nội dung']);
  const issueDate = findValue(['Ngày văn bản', 'Ngày ban hành', 'Ngày VB', 'Thời gian nhận']);
  const issuer    = findValue(['Đơn vị ban hành', 'Nơi gửi', 'Cơ quan ban hành']);

  return { docNumber, title, issueDate, issuer };
}

/* ══════════════════════════════════════
   TRÍCH XUẤT DỮ LIỆU — TRANG DANH SÁCH
   (Quét toàn bộ text)
══════════════════════════════════════ */

function extractFromListPage() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const parts = [];
  let node;
  while ((node = walker.nextNode())) {
    const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length > 2) parts.push(t);
  }
  const pageText = parts.join('\n');

  const numRx  = /\b\d{2,4}-[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊẾỘỢ\-]+\/[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊẾỘỢ]{2,15}/g;
  const vvRx   = /V\/v\s+.{10,300}/g;

  const nums  = [...new Set(pageText.match(numRx) || [])].slice(0, 8);
  const dates = [...new Set(pageText.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [])].slice(0, 6);
  const vvs   = [...new Set((pageText.match(vvRx) || []).map(s => s.trim()))].slice(0, 6);

  const issuerRx   = /(Tỉnh ủy[^,\n\r]{3,60}|Đảng ủy[^,\n\r]{3,60}|UBND[^,\n\r]{3,60})/;
  const issuerMatch = pageText.match(issuerRx);
  const issuer     = issuerMatch ? issuerMatch[0].trim().slice(0, 80) : '';

  return { nums, dates, vvs, issuer };
}

/* ══════════════════════════════════════
   TẠO PANEL GIAO DIỆN
══════════════════════════════════════ */

let currentDocType = 'incoming';

function buildPanel() {
  const { isDetail, docType } = getPageInfo();
  currentDocType = docType;

  let data = {};
  if (isDetail) {
    data = extractFromDetailPage();
    // Fallback nếu không trích xuất được từ detail
    if (!data.title && !data.docNumber) {
      const d = extractFromListPage();
      data = { docNumber: d.nums[0]||'', title: d.vvs[0]||'', issueDate: d.dates[0]||'', issuer: d.issuer||'', nums: d.nums, dates: d.dates, vvs: d.vvs };
    }
  } else {
    const d = extractFromListPage();
    data = { docNumber: d.nums[0]||'', title: d.vvs[0]||'', issueDate: d.dates[0]||'', issuer: d.issuer||'', nums: d.nums, dates: d.dates, vvs: d.vvs };
  }

  const panel = document.createElement('div');
  panel.id = 'ioc-panel';

  const badgeHtml = (n, label) => n > 0 ? `<span class="ioc-badge">${n} ${label}</span>` : '';

  // Build select options
  const makeOpts = (arr) => arr.map(v =>
    `<option value="${escHtml(v)}">${escHtml(v.slice(0, 70))}</option>`
  ).join('');

  const listSelect = (id, arr, targetId, placeholder) => arr && arr.length > 1
    ? `<select id="${id}" class="ioc-select" data-ioc-select-target="${targetId}">
         <option value="">-- ${placeholder} --</option>${makeOpts(arr)}
       </select>`
    : '';

  panel.innerHTML = `
    <div class="ioc-header">
      <div>
        <div class="ioc-header-title">📥 Nhập văn bản sang IOC</div>
        <div class="ioc-header-sub">
          ${isDetail
            ? 'Trang chi tiết ✅ — dữ liệu tự động'
            : '⚠️ Trang danh sách — hãy <b>mở chi tiết văn bản</b> để điền tự động'
          }
        </div>
      </div>
      <button class="ioc-close" data-ioc-action="close">×</button>
    </div>

    <div class="ioc-body">

      <label class="ioc-label">Loại văn bản</label>
      <div class="ioc-type-row">
        <button class="ioc-type-btn ${docType === 'incoming' ? 'active' : ''}"
                data-ioc-action="set-type" data-type="incoming">📥 Văn bản đến</button>
        <button class="ioc-type-btn ${docType === 'outgoing' ? 'active' : ''}"
                data-ioc-action="set-type" data-type="outgoing">📤 Văn bản đi</button>
      </div>
      <input type="hidden" id="ioc_doc_type" value="${docType}">

      <label class="ioc-label">Số/Ký hiệu ${badgeHtml((data.nums||[]).length, 'gợi ý')}</label>
      ${listSelect('ioc_num_sel', data.nums, 'ioc_doc_number', 'Chọn số hiệu')}
      <input id="ioc_doc_number" class="ioc-input" value="${escHtml(data.docNumber || '')}"
             placeholder="VD: 811-CV/ĐU" style="margin-top:4px">

      <label class="ioc-label">Trích yếu nội dung * ${badgeHtml((data.vvs||[]).length, 'gợi ý')}</label>
      ${listSelect('ioc_vv_sel', data.vvs, 'ioc_title', 'Chọn trích yếu')}
      <textarea id="ioc_title" class="ioc-textarea"
                placeholder="Nhập hoặc chọn trích yếu..." style="margin-top:4px">${escHtml(data.title || '')}</textarea>

      <label class="ioc-label">Đơn vị ban hành / Nơi gửi</label>
      <input id="ioc_issuer" class="ioc-input" value="${escHtml(data.issuer || '')}"
             placeholder="VD: Đảng ủy xã Bắc Hà - Tỉnh ủy Lào Cai">

      <label class="ioc-label">Ngày ban hành ${badgeHtml((data.dates||[]).length, 'gợi ý')}</label>
      ${listSelect('ioc_date_sel', data.dates, 'ioc_date', 'Chọn ngày')}
      <input id="ioc_date" class="ioc-input" value="${escHtml(data.issueDate || '')}"
             placeholder="dd/mm/yyyy" style="margin-top:4px">

      <!-- File đính kèm -->
      ${buildAttachmentUI()}

      <div class="ioc-task-box">
        <label class="ioc-task-toggle">
          <input type="checkbox" id="ioc_create_task">
          Tự động tạo nhiệm vụ từ văn bản này
        </label>
      </div>

    </div>

    <div class="ioc-footer">
      <button class="ioc-btn-primary" data-ioc-action="send">🚀 Gửi sang xabacha.com</button>
      <button class="ioc-btn-secondary" data-ioc-action="close">Đóng</button>
    </div>
  `;

  // Event delegation — tất cả events xử lý tại đây (không dùng inline onclick)
  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ioc-action]');
    if (!btn) return;
    const action = btn.dataset.iocAction;

    if (action === 'close') {
      panel.classList.remove('visible');
    }
    if (action === 'set-type') {
      currentDocType = btn.dataset.type;
      panel.querySelectorAll('.ioc-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const hidden = panel.querySelector('#ioc_doc_type');
      if (hidden) hidden.value = currentDocType;
    }
    if (action === 'send') {
      sendToIOC(panel);
    }
  });

  // Select change — fill target input
  panel.addEventListener('change', (e) => {
    const target = e.target.dataset.iocSelectTarget;
    if (target && e.target.value) {
      const inp = panel.querySelector('#' + target);
      if (inp) inp.value = e.target.value;
    }
  });

  return panel;
}

function buildAttachmentUI() {
  const attachments = findAttachments();
  if (!attachments.length) return '';

  const items = attachments.map((f, i) => `
    <label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;">
      <input type="checkbox" class="ioc-attach-cb" data-url="${escHtml(f.url)}"
             data-name="${escHtml(f.name)}" checked
             style="width:14px;height:14px;flex-shrink:0;">
      <span style="font-size:11px;color:#334155;word-break:break-all;">
        📎 ${escHtml(f.name.slice(0, 50))}
      </span>
    </label>
  `).join('');

  return `
    <label class="ioc-label">File đính kèm <span class="ioc-badge">${attachments.length} file</span></label>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
      ${items}
      <p style="font-size:10px;color:#94a3b8;margin:4px 0 0;">File được tải từ dhtn.dcs.vn và đính kèm vào văn bản IOC</p>
    </div>
  `;
}

async function getIOCToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['ioc_token', 'ioc_token_ts'], (data) => {
      const ts = data.ioc_token_ts || 0;
      const age = Date.now() - ts;
      // Token hợp lệ trong 8 giờ
      if (data.ioc_token && age < 8 * 3600 * 1000) {
        resolve(data.ioc_token);
      } else {
        resolve(null);
      }
    });
  });
}

async function sendToIOC(panel) {
  const get = (id) => ((panel || document).querySelector('#' + id) || {}).value || '';
  const title = get('ioc_title');

  if (!title.trim()) {
    showToast('⚠️ Vui lòng nhập trích yếu nội dung!', '#dc2626');
    return;
  }

  // Lấy file đính kèm được chọn
  const checkedFiles = Array.from(
    (panel || document).querySelectorAll('.ioc-attach-cb:checked')
  ).map(cb => ({ url: cb.dataset.url, name: cb.dataset.name }));

  // Lấy token IOC
  const token = await getIOCToken();

  const sendBtn = panel.querySelector('[data-ioc-action="send"]');
  if (sendBtn) sendBtn.textContent = '⏳ Đang gửi...';

  try {
    if (token && checkedFiles.length > 0) {
      // ── Cách 1: Gửi trực tiếp qua API (có file) ──
      await sendViaAPI(token, {
        title: title.trim(),
        doc_number:  get('ioc_doc_number').trim(),
        doc_type:    get('ioc_doc_type') || currentDocType,
        issuer:      get('ioc_issuer').trim(),
        issue_date:  get('ioc_date').trim(),
        source_url:  location.href,
        create_task: ((panel || document).querySelector('#ioc_create_task') || {}).checked,
      }, checkedFiles);
    } else {
      // ── Cách 2: Mở trang capture (không có file hoặc chưa đăng nhập) ──
      const params = new URLSearchParams({
        title:       title.trim(),
        doc_number:  get('ioc_doc_number').trim(),
        doc_type:    get('ioc_doc_type') || currentDocType,
        issuer:      get('ioc_issuer').trim(),
        issue_date:  get('ioc_date').trim(),
        source_url:  location.href,
        create_task: ((panel || document).querySelector('#ioc_create_task') || {}).checked ? '1' : '0',
      });
      window.open(
        `${IOC_URL}/capture?${params.toString()}`,
        'ioc_capture',
        `width=540,height=720,left=${Math.max(0, screen.width - 560)},top=50`
      );
      if (!token) {
        showToast('ℹ️ Đã mở xabacha.com. Đăng nhập để lần sau tự upload file!');
      }
    }
  } catch (err) {
    showToast('❌ Lỗi: ' + (err.message || 'Không xác định'), '#dc2626');
  } finally {
    if (sendBtn) sendBtn.textContent = '🚀 Gửi sang xabacha.com';
  }
}

async function sendViaAPI(token, docInfo, files) {
  // Bước 1: Tạo document
  const captureResp = await fetch(`${API_URL}/documents/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...docInfo,
      create_task: docInfo.create_task || false,
    }),
  });

  if (!captureResp.ok) {
    const err = await captureResp.json().catch(() => ({}));
    throw new Error(err.detail || `Lỗi API ${captureResp.status}`);
  }

  const captured = await captureResp.json();
  const docId = captured.doc_id;

  showToast(`✅ Đã tạo văn bản #${docId}${files.length ? ' — đang tải file...' : ''}`);

  // Bước 2: Upload từng file đính kèm
  let uploadedCount = 0;
  for (const file of files) {
    try {
      // Tải file từ dhtn (dùng session dhtn của user)
      const fileResp = await fetch(file.url, { credentials: 'include' });
      if (!fileResp.ok) continue;

      const blob = await fileResp.blob();
      const formData = new FormData();
      formData.append('file', blob, file.name);

      const uploadResp = await fetch(`${API_URL}/documents/${docId}/file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (uploadResp.ok) uploadedCount++;
    } catch (e) {
      console.warn('[IOC] Upload file thất bại:', file.name, e);
    }
  }

  const msg = uploadedCount > 0
    ? `✅ Đã nhập văn bản + ${uploadedCount} file đính kèm vào IOC!`
    : `✅ Đã tạo văn bản #${docId} (file sẽ cần upload thủ công)`;
  showToast(msg);

  // Mở trang văn bản vừa tạo
  setTimeout(() => {
    window.open(`${IOC_URL}/documents/${docId}`, 'ioc_doc');
  }, 1500);
}

/* ══════════════════════════════════════
   FAB BUTTON + TOGGLE PANEL
══════════════════════════════════════ */

function createFAB() {
  if (document.getElementById('ioc-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'ioc-fab';
  fab.title = 'IOC Capture — Nhập văn bản sang xabacha.com';
  fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" width="24" height="24">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke-width="1.8"/>
    <path d="M8 12h8M14 8l4 4-4 4"/>
  </svg>`;

  fab.addEventListener('click', () => {
    let panel = document.getElementById('ioc-panel');
    if (!panel) {
      panel = buildPanel();
      document.body.appendChild(panel);
    }
    panel.classList.toggle('visible');
  });

  document.body.appendChild(fab);
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */

function escHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showToast(msg, color = '#2563eb') {
  const old = document.getElementById('ioc-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'ioc-toast';
  t.className = 'ioc-toast';
  t.style.background = color;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ══════════════════════════════════════
   KHỞI ĐỘNG
══════════════════════════════════════ */

function init() {
  createFAB();

  // Tự động phân tích và thông báo
  const { isDetail } = getPageInfo();
  if (isDetail) {
    const d = extractFromDetailPage();
    if (d.title || d.docNumber) {
      setTimeout(() => {
        showToast(`✅ Đã tìm thấy văn bản: ${(d.docNumber || d.title || '').slice(0, 40)} — Nhấn 🔵 để nhập`);
      }, 800);
    }
  }
}

if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}

// Theo dõi navigate trong ZK (SPA-style)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    const panel = document.getElementById('ioc-panel');
    if (panel) panel.remove();
    setTimeout(init, 1000);
  }
}).observe(document.body, { childList: true, subtree: true });
