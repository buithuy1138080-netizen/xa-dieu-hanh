/**
 * IOC Capture v3 — Content Script
 * - Trang danh sách: inject nút →IOC vào mỗi dòng
 * - Trang chi tiết: tự động điền form và hiển thị panel
 */

const IOC_URL = 'https://xabacha.com';
const API_URL = `${IOC_URL}/api/v1`;

let watchForDetail = false;  // khi user click →IOC trên list page

/* ══════════════════════════════════════
   NHẬN DIỆN TRANG
══════════════════════════════════════ */

function isDetailPage() {
  // Chi tiết: có nhãn "Trích yếu" với nội dung THẬT (dài, không phải header)
  const cells = Array.from(document.querySelectorAll('td'));
  for (const cell of cells) {
    const text = cell.textContent.trim();
    if (text === 'Trích yếu') {
      const next = cell.nextElementSibling;
      if (next) {
        const val = (next.textContent || '').trim();
        // Nội dung thật: > 10 ký tự, không phải tên cột
        if (val.length > 10 && !['nội dung văn bản', 'ý kiến chỉ đạo', 'thao tác'].includes(val.toLowerCase())) {
          return true;
        }
      }
    }
  }
  // Hoặc có tiêu đề trang "chi tiết"
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,.z-caption,span[class*="title"]'));
  return headings.some(h => h.textContent.toLowerCase().includes('chi tiết'));
}

function getDocType() {
  const url = location.href.toLowerCase();
  const title = (document.title || '').toLowerCase();
  if (url.includes('van-ban-den') || title.includes('văn bản đến')) return 'incoming';
  if (url.includes('ban-hanh') || url.includes('van-ban-di') || title.includes('văn bản đi')) return 'outgoing';
  // Đọc breadcrumb
  const breadcrumb = (document.querySelector('.z-breadcrumb, [class*="breadcrumb"], .z-pagetitle') || {}).textContent || '';
  if (breadcrumb.toLowerCase().includes('đến')) return 'incoming';
  if (breadcrumb.toLowerCase().includes('đi') || breadcrumb.toLowerCase().includes('ban hành')) return 'outgoing';
  return 'incoming';
}

/* ══════════════════════════════════════
   TRÍCH XUẤT — TRANG CHI TIẾT
══════════════════════════════════════ */

function extractDetail() {
  function findValue(labels) {
    const tds = Array.from(document.querySelectorAll('td'));
    for (const td of tds) {
      const text = td.textContent.trim();
      if (labels.some(l => text === l)) {
        const next = td.nextElementSibling;
        if (next) {
          const val = (next.textContent || '').replace(/\s+/g,' ').trim();
          if (val && val.length > 0) return val;
        }
        // Thử trong cùng row
        const row = td.closest('tr');
        if (row) {
          const cells = Array.from(row.querySelectorAll('td'));
          const idx = cells.indexOf(td);
          if (idx >= 0 && cells[idx+1]) {
            return (cells[idx+1].textContent || '').replace(/\s+/g,' ').trim();
          }
        }
      }
    }
    return '';
  }

  return {
    docNumber: findValue(['Số, ký hiệu','Số ký hiệu','Ký hiệu','Mã định danh']),
    title:     findValue(['Trích yếu','Trích yếu nội dung']),
    issueDate: findValue(['Ngày văn bản','Ngày ban hành','Ngày VB','Thời gian nhận']),
    issuer:    findValue(['Đơn vị ban hành','Nơi gửi','Cơ quan ban hành','Đơn vị gửi']),
  };
}

/* ══════════════════════════════════════
   TÌM FILE ĐÍNH KÈM
══════════════════════════════════════ */

const FILE_EXT_RE = /\.(pdf|doc|docx|xls|xlsx|zip|rar)(\b|$)/i;

/** Tìm file links trong một element — kiểm tra cả href VÀ text/title */
function findFileLinks(container) {
  if (!container) return [];
  const seen = new Set();

  // Mở rộng tìm kiếm: container + các anh em (sibling tds trong cùng tr)
  const searchRoots = [container];
  const row = container.closest?.('tr');
  if (row) {
    searchRoots.push(row);
    // ZK đôi khi dùng <tr> tiếp theo cho file đính kèm
    const next = row.nextElementSibling;
    if (next && next.tagName === 'TR') searchRoots.push(next);
    const prev = row.previousElementSibling;
    if (prev && prev.tagName === 'TR') searchRoots.push(prev);
  }
  // Leo thêm 6 cấp để tìm trong container cha
  let node = container;
  for (let i = 0; i < 6; i++) {
    node = node?.parentNode;
    if (node) searchRoots.push(node);
    if (node?.tagName === 'TBODY') break; // dừng ở tbody
  }

  const results = [];
  for (const root of searchRoots) {
    const links = Array.from(root.querySelectorAll?.('a[href]') || []);
    for (const a of links) {
      if (seen.has(a.href)) continue;
      const href  = (a.href || '').toLowerCase();
      const text  = (a.textContent || '').trim();
      const title = (a.title || '').toLowerCase();

      const isFile = FILE_EXT_RE.test(text)       // tên file trong text link
                  || FILE_EXT_RE.test(href)        // extension trong URL
                  || FILE_EXT_RE.test(title)       // extension trong title
                  || href.includes('/download')    // endpoint download
                  || href.includes('attachment')   // endpoint attachment
                  || href.includes('ztree')        // dhtn.dcs.vn file server
                  || a.getAttribute('download') !== null; // download attribute

      if (isFile && a.href && a.href.startsWith('http')) {
        seen.add(a.href);
        // Tên file: ưu tiên text > title > từ URL
        const name = text || title
          || a.href.split('/').pop().split('?')[0]
          || 'document.pdf';
        results.push({ url: a.href, name });
        if (results.length >= 5) break;
      }
    }
    if (results.length > 0) break; // Tìm thấy rồi, dừng
  }
  return results;
}

/** Tìm file trên toàn trang (dùng cho detail page) */
function findAttachments() {
  return findFileLinks(document.body).slice(0, 5);
}

/* ══════════════════════════════════════
   DANH SÁCH VĂN BẢN TRONG TRANG (list page)
══════════════════════════════════════ */

function getDocumentsFromPage() {
  // Tìm tất cả "Xem thêm" links — đây là link detail của từng văn bản
  const xemThemLinks = Array.from(document.querySelectorAll('a'))
    .filter(a => {
      const t = a.textContent.trim().toLowerCase();
      return t === 'xem thêm' || t === 'xem chi tiết' || t === 'chi tiết';
    });

  const docs = [];
  xemThemLinks.forEach(link => {
    // Tìm row cha → lấy text các cell
    const row = link.closest('tr') || link.closest('[class*="row"]') || link.parentNode?.parentNode;
    if (!row) return;
    const rowText = (row.textContent || '').replace(/\s+/g,' ').trim();

    // Tìm trích yếu (text dài bắt đầu V/v)
    const vvMatch = rowText.match(/V\/v\s+[^\n\r]{10,150}/);
    const title = vvMatch ? vvMatch[0].trim() : '';

    // Tìm số ký hiệu
    const numMatch = rowText.match(/\b\d{2,4}-[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦ\-]+\/[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦ]{2,15}/);
    const docNumber = numMatch ? numMatch[0] : '';

    // Tìm ngày
    const dateMatch = rowText.match(/\d{1,2}\/\d{2}\/\d{4}/);
    const date = dateMatch ? dateMatch[0] : '';

    if (title || docNumber) {
      docs.push({ title, docNumber, date, link });
    }
  });

  return docs;
}

function injectRowButtons() {
  // Tìm các cell chứa text trích yếu (bắt đầu V/v, Về việc, Báo cáo...)
  // Đây là cách đáng tin nhất với ZK Framework
  let added = 0;

  const candidates = Array.from(document.querySelectorAll('td, div'))
    .filter(el => {
      if (el.querySelector('.ioc-row-btn')) return false;  // đã có nút
      const text = el.textContent.trim();
      // Phải là node lá (không có nhiều con phức tạp) và có nội dung văn bản
      const isLeafLike = el.children.length <= 2;
      return isLeafLike && text.length > 20 &&
        (text.startsWith('V/v') || text.startsWith('Về việc') ||
         text.startsWith('Báo cáo') || text.startsWith('Tờ trình'));
    });

  candidates.forEach(el => {
    // Tìm row cha để lấy thêm thông tin
    const row = el.closest('tr');
    const rowText = row ? row.textContent : el.parentNode?.textContent || '';

    // Số ký hiệu
    const numMatch = rowText.match(/\b\d{2,4}-[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦ\-]+\/[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦ]{2,15}/);
    // Ngày
    const dateMatch = rowText.match(/\d{1,2}\/\d{2}\/\d{4}/);
    // Đơn vị ban hành — lấy từ cell "Đơn vị ban hành" riêng biệt thay vì dùng regex trên rowText
    const unitCell = row ? Array.from(row.querySelectorAll('td')).find(td => {
      const t = td.textContent.trim();
      return (t.includes('Tỉnh ủy') || t.includes('Đảng ủy') || t.includes('UBND') || t.includes('Văn phòng'))
        && t.length < 120 && !td.querySelector('a,button,.ioc-row-btn');
    }) : null;
    const unitMatch = unitCell ? [unitCell.textContent.trim()] : rowText.match(/(Văn phòng[^\n\r]{5,40}|Tỉnh ủy[^\n\r]{5,40}|Đảng ủy[^\n\r]{5,40}|UBND[^\n\r]{5,40})/);
    const title = el.textContent.trim();
    const docNumber = numMatch ? numMatch[0] : '';
    const date = dateMatch ? dateMatch[0] : '';
    const issuer = unitMatch ? unitMatch[0].trim() : '';

    // File: tìm tất cả link trong row, kiểm tra cả href VÀ text
    const attachments = findFileLinks(row || el);

    // Tạo nút →IOC
    const btn = document.createElement('span');
    btn.className = 'ioc-row-btn';
    btn.innerHTML = '📥 IOC';
    btn.style.cssText = 'display:inline-block;background:#2563eb;color:white;padding:2px 9px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;margin-left:6px;vertical-align:middle;white-space:nowrap;box-shadow:0 2px 6px rgba(37,99,235,.3);';
    btn.title = `Nhập "${title.slice(0,40)}..." vào xabacha.com`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const data = { title, docNumber, issueDate: date, issuer, attachments, docType: getDocType() };
      // Debug: thông báo tìm thấy bao nhiêu file
      if (attachments.length > 0) {
        showToast(`✅ Tìm thấy ${attachments.length} file: ${attachments[0].name.slice(0,30)}`, '#059669');
      } else {
        showToast('⚠️ Không tìm thấy file — có thể tải thủ công sau', '#f59e0b');
      }
      setTimeout(() => openPanelWithData(data), 500);
    });

    el.appendChild(btn);
    added++;
  });

  return added;
}

/* ══════════════════════════════════════
   TẠO / QUẢN LÝ PANEL
══════════════════════════════════════ */

let currentDocType = 'incoming';

function openPanel() {
  const existing = document.getElementById('ioc-panel');
  if (existing) { existing.classList.toggle('visible'); return; }
  const panel = buildPanel();
  document.body.appendChild(panel);
  panel.classList.add('visible');
}

function openPanelWithData(data) {
  // Xóa panel cũ nếu có
  const old = document.getElementById('ioc-panel');
  if (old) old.remove();

  currentDocType = data.docType || 'incoming';
  const panel = buildPanelWithData(data);
  document.body.appendChild(panel);
  panel.classList.add('visible');
}

function buildPanelWithData(data) {
  const attachUI = (data.attachments || []).length > 0 ? `
    <label class="ioc-label">File đính kèm <span class="ioc-badge">${data.attachments.length} file</span></label>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
      ${data.attachments.map(f=>`
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
          <input type="checkbox" class="ioc-attach-cb"
                 data-url="${escHtml(f.url)}" data-name="${escHtml(f.name)}" checked
                 style="width:14px;height:14px;">
          <span style="font-size:11px;color:#334155;word-break:break-all;">📎 ${escHtml(f.name.slice(0,55))}</span>
        </label>`).join('')}
    </div>` : '';

  const panel = document.createElement('div');
  panel.id = 'ioc-panel';
  panel.innerHTML = `
    <div class="ioc-header">
      <div>
        <div class="ioc-header-title">📥 Nhập văn bản sang IOC</div>
        <div class="ioc-header-sub">xabacha.com · Dữ liệu từ danh sách</div>
      </div>
      <button class="ioc-close" data-ioc-action="close">×</button>
    </div>
    <div class="ioc-body">
      <label class="ioc-label">Loại văn bản</label>
      <div class="ioc-type-row">
        <button class="ioc-type-btn ${currentDocType==='incoming'?'active':''}" data-ioc-action="set-type" data-type="incoming">📥 Văn bản đến</button>
        <button class="ioc-type-btn ${currentDocType==='outgoing'?'active':''}" data-ioc-action="set-type" data-type="outgoing">📤 Văn bản đi</button>
      </div>
      <input type="hidden" id="ioc_doc_type" value="${currentDocType}">

      <label class="ioc-label">Số/Ký hiệu</label>
      <input id="ioc_doc_number" class="ioc-input" value="${escHtml(data.docNumber||'')}" placeholder="VD: 630-CV/VPTU">

      <label class="ioc-label">Trích yếu nội dung *</label>
      <textarea id="ioc_title" class="ioc-textarea">${escHtml(data.title||'')}</textarea>

      <label class="ioc-label">Đơn vị ban hành</label>
      <input id="ioc_issuer" class="ioc-input" value="${escHtml(data.issuer||'')}" placeholder="Đơn vị ban hành">

      <label class="ioc-label">Ngày ban hành</label>
      <input id="ioc_date" class="ioc-input" value="${escHtml(data.issueDate||'')}" placeholder="dd/mm/yyyy">

      ${attachUI}

      <div class="ioc-task-box">
        <label class="ioc-task-toggle">
          <input type="checkbox" id="ioc_create_task">
          Tạo nhiệm vụ từ văn bản này
        </label>
      </div>
    </div>
    <div class="ioc-footer">
      <button class="ioc-btn-primary" data-ioc-action="send">🚀 Gửi sang xabacha.com</button>
      <button class="ioc-btn-secondary" data-ioc-action="close">Đóng</button>
    </div>`;

  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ioc-action]');
    if (!btn) return;
    if (btn.dataset.iocAction === 'close') panel.classList.remove('visible');
    if (btn.dataset.iocAction === 'set-type') {
      currentDocType = btn.dataset.type;
      panel.querySelectorAll('.ioc-type-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const h = panel.querySelector('#ioc_doc_type');
      if (h) h.value = currentDocType;
    }
    if (btn.dataset.iocAction === 'send') await sendToIOC(panel);
  });

  return panel;
}

function buildPanel() {
  const isDetail = isDetailPage();
  currentDocType = getDocType();
  const data = isDetail ? extractDetail() : {};
  const attachments = isDetail ? findAttachments() : [];

  const panel = document.createElement('div');
  panel.id = 'ioc-panel';

  const escHtml = (s) => (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const attachUI = attachments.length ? `
    <label class="ioc-label">File đính kèm <span class="ioc-badge">${attachments.length} file</span></label>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
      ${attachments.map(f=>`
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
          <input type="checkbox" class="ioc-attach-cb"
                 data-url="${escHtml(f.url)}" data-name="${escHtml(f.name)}" checked
                 style="width:14px;height:14px;flex-shrink:0;">
          <span style="font-size:11px;color:#334155;word-break:break-all;">📎 ${escHtml(f.name.slice(0,55))}</span>
        </label>`).join('')}
      <p style="font-size:10px;color:#94a3b8;margin:4px 0 0;">Tải từ dhtn và đính kèm vào văn bản IOC</p>
    </div>` : '';

  if (!isDetail) {
    const docs = getDocumentsFromPage();
    const docListHtml = docs.length > 0
      ? docs.map((d, i) => `
          <div class="ioc-doc-row" data-ioc-doc="${i}"
               style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;margin-bottom:6px;background:#f8fafc;transition:background .15s;">
            <div style="font-size:11px;font-weight:700;color:#2563eb;">${escHtml(d.docNumber || '—')}</div>
            <div style="font-size:12px;color:#334155;line-height:1.4;margin-top:2px;">${escHtml((d.title||'Chưa xác định trích yếu').slice(0,80))}${(d.title||'').length>80?'...':''}</div>
            ${d.date?`<div style="font-size:10px;color:#94a3b8;margin-top:2px;">📅 ${escHtml(d.date)}</div>`:''}
          </div>`).join('')
      : `<div style="text-align:center;color:#94a3b8;padding:16px;font-size:12px;">
           Chưa tìm thấy văn bản.<br>Hãy cuộn xuống để ZK tải danh sách.
         </div>`;

    panel.innerHTML = `
      <div class="ioc-header">
        <div>
          <div class="ioc-header-title">📥 Chọn văn bản để nhập</div>
          <div class="ioc-header-sub">Tìm thấy ${docs.length} văn bản trên trang</div>
        </div>
        <button class="ioc-close" data-ioc-action="close">×</button>
      </div>
      <div class="ioc-body" style="padding:12px 14px;">
        <p style="font-size:11px;color:#64748b;margin:0 0 10px;">
          Nhấn vào văn bản bên dưới → trang chi tiết mở → panel IOC tự hiện ra
        </p>
        ${docListHtml}
      </div>
      <div class="ioc-footer">
        <button class="ioc-btn-secondary" style="flex:1" data-ioc-action="close">Đóng</button>
      </div>`;

    // Click vào từng dòng văn bản → click "Xem thêm" tương ứng
    panel.addEventListener('click', (e) => {
      const row = e.target.closest('.ioc-doc-row');
      if (!row) return;
      const idx = parseInt(row.dataset.iocDoc || '0');
      const doc = docs[idx];
      if (doc && doc.link) {
        watchForDetail = true;
        showToast('⏳ Đang mở chi tiết...', '#2563eb');
        panel.classList.remove('visible');
        doc.link.click();
      }
    });

    // Hover effect
    panel.querySelectorAll('.ioc-doc-row').forEach(r => {
      r.addEventListener('mouseenter', () => r.style.background = '#eff6ff');
      r.addEventListener('mouseleave', () => r.style.background = '#f8fafc');
    });
  } else {
    // Trang chi tiết: form đầy đủ
    panel.innerHTML = `
      <div class="ioc-header">
        <div>
          <div class="ioc-header-title">📥 Nhập văn bản sang IOC</div>
          <div class="ioc-header-sub">xabacha.com · Trang chi tiết ✅</div>
        </div>
        <button class="ioc-close" data-ioc-action="close">×</button>
      </div>
      <div class="ioc-body">
        <label class="ioc-label">Loại văn bản</label>
        <div class="ioc-type-row">
          <button class="ioc-type-btn ${currentDocType==='incoming'?'active':''}"
                  data-ioc-action="set-type" data-type="incoming">📥 Văn bản đến</button>
          <button class="ioc-type-btn ${currentDocType==='outgoing'?'active':''}"
                  data-ioc-action="set-type" data-type="outgoing">📤 Văn bản đi</button>
        </div>
        <input type="hidden" id="ioc_doc_type" value="${currentDocType}">

        <label class="ioc-label">Số/Ký hiệu</label>
        <input id="ioc_doc_number" class="ioc-input" value="${escHtml(data.docNumber||'')}" placeholder="VD: 630-CV/VPTU">

        <label class="ioc-label">Trích yếu nội dung *</label>
        <textarea id="ioc_title" class="ioc-textarea" placeholder="Nhập trích yếu...">${escHtml(data.title||'')}</textarea>

        <label class="ioc-label">Đơn vị ban hành / Nơi gửi</label>
        <input id="ioc_issuer" class="ioc-input" value="${escHtml(data.issuer||'')}" placeholder="Đơn vị ban hành">

        <label class="ioc-label">Ngày ban hành</label>
        <input id="ioc_date" class="ioc-input" value="${escHtml(data.issueDate||'')}" placeholder="dd/mm/yyyy">

        ${attachUI}

        <div class="ioc-task-box">
          <label class="ioc-task-toggle">
            <input type="checkbox" id="ioc_create_task">
            Tạo nhiệm vụ từ văn bản này
          </label>
        </div>
      </div>
      <div class="ioc-footer">
        <button class="ioc-btn-primary" data-ioc-action="send">🚀 Gửi sang xabacha.com</button>
        <button class="ioc-btn-secondary" data-ioc-action="close">Đóng</button>
      </div>`;
  }

  // Event delegation
  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ioc-action]');
    if (!btn) return;
    if (btn.dataset.iocAction === 'close') panel.classList.remove('visible');
    if (btn.dataset.iocAction === 'set-type') {
      currentDocType = btn.dataset.type;
      panel.querySelectorAll('.ioc-type-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const h = panel.querySelector('#ioc_doc_type');
      if (h) h.value = currentDocType;
    }
    if (btn.dataset.iocAction === 'send') await sendToIOC(panel);
  });

  return panel;
}

/* ══════════════════════════════════════
   GỬI SANG IOC
══════════════════════════════════════ */

async function getIOCToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['ioc_token','ioc_token_ts'], d => {
      const age = Date.now() - (d.ioc_token_ts||0);
      resolve(age < 8*3600*1000 ? (d.ioc_token||null) : null);
    });
  });
}

async function sendToIOC(panel) {
  const get = id => ((panel||document).querySelector('#'+id)||{}).value||'';
  const title = get('ioc_title');
  if (!title.trim()) { showToast('⚠️ Vui lòng nhập trích yếu!','#dc2626'); return; }

  const checkedFiles = Array.from(panel.querySelectorAll('.ioc-attach-cb:checked'))
    .map(cb => ({ url: cb.dataset.url, name: cb.dataset.name }));

  const token = await getIOCToken();
  const sendBtn = panel.querySelector('[data-ioc-action="send"]');
  if (sendBtn) { sendBtn.textContent = '⏳ Đang gửi...'; sendBtn.disabled = true; }

  try {
    if (!token) {
      // Chưa đăng nhập → mở trang capture
      const p = new URLSearchParams({
        title:      title.trim(),
        doc_number: get('ioc_doc_number').trim(),
        doc_type:   get('ioc_doc_type') || currentDocType,
        issuer:     get('ioc_issuer').trim(),
        issue_date: get('ioc_date').trim(),
        source_url: location.href,
      });
      chrome.runtime.sendMessage({
        action: 'IOC_OPEN_TAB',
        url: `${IOC_URL}/capture?${p}`,
      });
      showToast('ℹ️ Đã mở xabacha.com — đăng nhập để lần sau tự gửi nhanh hơn!');
      panel.classList.remove('visible');
      return;
    }

    // ── Bước 1: Tạo văn bản qua background (tránh CORS) ──
    showToast('⏳ Đang tạo văn bản...', '#2563eb');
    const createResult = await chrome.runtime.sendMessage({
      action: 'IOC_API',
      method: 'POST',
      path:   '/documents/capture',
      token,
      body: {
        title:       title.trim(),
        doc_number:  get('ioc_doc_number').trim(),
        doc_type:    get('ioc_doc_type') || currentDocType,
        issuer:      get('ioc_issuer').trim(),
        issue_date:  get('ioc_date').trim(),
        source_url:  location.href,
        create_task: !!(panel.querySelector('#ioc_create_task')||{}).checked,
      },
    });

    if (!createResult.ok) {
      throw new Error(createResult.data?.detail || `Lỗi ${createResult.status}`);
    }

    const docId = createResult.data.doc_id;
    showToast(`✅ Văn bản #${docId} đã tạo${checkedFiles.length ? ' — đang tải file...' : ''}`, '#059669');

    // ── Bước 2: Tải file từ dhtn (content script có session) rồi upload ──
    let uploaded = 0;
    for (const f of checkedFiles) {
      try {
        showToast(`⏳ Đang tải file: ${f.name.slice(0, 30)}...`, '#2563eb');

        // Content script fetch file từ dhtn — cùng origin, có đủ cookies
        const fileResp = await fetch(f.url, { credentials: 'include' });
        if (!fileResp.ok) {
          console.warn('[IOC] File fetch failed:', fileResp.status, f.url);
          continue;
        }

        const blob = await fileResp.blob();
        const mimeType = blob.type || 'application/pdf';

        // Chuyển blob → base64 để gửi qua chrome.runtime.sendMessage
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]); // lấy phần sau "data:...;base64,"
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Background nhận base64 và upload lên xabacha.com
        const upResult = await chrome.runtime.sendMessage({
          action:   'IOC_UPLOAD_BASE64',
          docId,
          fileName: f.name,
          mimeType,
          base64,
          token,
        });

        if (upResult?.ok) {
          uploaded++;
          showToast(`✅ File đã đính kèm: ${f.name.slice(0, 35)}`, '#059669');
        } else {
          console.warn('[IOC] Upload failed:', upResult);
        }
      } catch (fileErr) {
        console.warn('[IOC] File error:', fileErr.message);
      }
    }

    const finalMsg = uploaded > 0
      ? `✅ Đã nhập văn bản + ${uploaded} file PDF vào IOC!`
      : `✅ Văn bản #${docId} đã tạo trong IOC`;
    showToast(finalMsg, '#059669');
    panel.classList.remove('visible');

    // Mở trang văn bản
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'IOC_OPEN_TAB', url: `${IOC_URL}/documents/${docId}` });
    }, 1200);

  } catch (err) {
    showToast('❌ ' + (err.message || 'Lỗi không xác định'), '#dc2626');
  } finally {
    if (sendBtn) { sendBtn.textContent = '🚀 Gửi sang xabacha.com'; sendBtn.disabled = false; }
  }
}

/* ══════════════════════════════════════
   FAB BUTTON
══════════════════════════════════════ */

function createFAB() {
  if (document.getElementById('ioc-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'ioc-fab';
  fab.title = 'IOC Capture';
  fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" width="22" height="22">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke-width="1.8"/>
    <path d="M8 12h8M14 8l4 4-4 4"/>
  </svg>`;
  fab.addEventListener('click', openPanel);
  document.body.appendChild(fab);
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, color='#2563eb') {
  const old = document.getElementById('ioc-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'ioc-toast'; t.className = 'ioc-toast';
  t.style.background = color; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ══════════════════════════════════════
   KHỞI ĐỘNG + MUTATION OBSERVER
══════════════════════════════════════ */

function init() {
  createFAB();

  if (isDetailPage()) {
    if (watchForDetail) {
      watchForDetail = false;
      setTimeout(() => {
        const old = document.getElementById('ioc-panel');
        if (old) old.remove();
        openPanel();
      }, 300);
    }
  } else {
    // Thử inject ngay + retry sau 1s, 2s, 4s (ZK lazy load)
    injectRowButtons();
    [1000, 2000, 4000].forEach(delay => setTimeout(injectRowButtons, delay));
  }
}

if (document.readyState === 'complete') init();
else window.addEventListener('load', init);

// ZK dùng AJAX nên theo dõi DOM thay đổi
let debounceTimer = null;
new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (isDetailPage()) {
      if (watchForDetail) {
        watchForDetail = false;
        const old = document.getElementById('ioc-panel');
        if (old) old.remove();
        setTimeout(openPanel, 200);
      }
    } else {
      injectRowButtons();
    }
  }, 600);
}).observe(document.body, {childList:true, subtree:true});
