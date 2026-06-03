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

function findAttachments() {
  const EXT = ['.pdf','.doc','.docx','.xls','.xlsx'];
  const seen = new Set();
  return Array.from(document.querySelectorAll('a[href]'))
    .filter(a => {
      const h = (a.href||'').toLowerCase();
      const ok = EXT.some(e=>h.includes(e)) || h.includes('download') || h.includes('attachment');
      if (!ok || seen.has(a.href)) return false;
      seen.add(a.href); return true;
    })
    .map(a => ({
      url: a.href,
      name: a.textContent.trim() || a.href.split('/').pop().split('?')[0] || 'file.pdf',
    })).slice(0,5);
}

/* ══════════════════════════════════════
   INJECT NÚT →IOC VÀO TỪNG DÒNG (list page)
══════════════════════════════════════ */

function injectRowButtons() {
  // Tìm tất cả link "Xem thêm" trong bảng
  const xemThemLinks = Array.from(document.querySelectorAll('a'))
    .filter(a => a.textContent.trim() === 'Xem thêm');

  let added = 0;
  xemThemLinks.forEach(link => {
    if (link.parentNode.querySelector('.ioc-row-btn')) return;

    const btn = document.createElement('span');
    btn.className = 'ioc-row-btn';
    btn.textContent = '→IOC';
    btn.style.cssText = [
      'display:inline-block','background:#2563eb','color:white',
      'padding:2px 8px','border-radius:4px','font-size:11px',
      'font-weight:700','cursor:pointer','margin-left:6px',
      'border:none','vertical-align:middle','white-space:nowrap',
    ].join(';');
    btn.title = 'Nhấn để xem chi tiết và gửi sang xabacha.com';

    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      watchForDetail = true;
      showToast('⏳ Đang mở chi tiết văn bản...', '#2563eb');
      link.click();  // ZK tải trang chi tiết
    });

    link.insertAdjacentElement('afterend', btn);
    added++;
  });

  if (added > 0) {
    const existing = document.getElementById('ioc-list-hint');
    if (!existing) {
      const hint = document.createElement('div');
      hint.id = 'ioc-list-hint';
      hint.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:2147483646;background:#1e3a8a;color:white;padding:8px 14px;border-radius:10px;font-size:12px;font-family:sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:220px;line-height:1.4;';
      hint.innerHTML = `📥 IOC sẵn sàng<br><span style="opacity:0.8;font-size:11px;">Nhấn <b>→IOC</b> trên dòng văn bản để nhập sang xabacha.com</span>`;
      document.body.appendChild(hint);
      setTimeout(() => hint.remove(), 6000);
    }
  }
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
    // Trang danh sách: hướng dẫn
    panel.innerHTML = `
      <div class="ioc-header">
        <div>
          <div class="ioc-header-title">📥 IOC Capture</div>
          <div class="ioc-header-sub">xabacha.com</div>
        </div>
        <button class="ioc-close" data-ioc-action="close">×</button>
      </div>
      <div class="ioc-body" style="text-align:center;padding:20px 16px;">
        <div style="font-size:32px;margin-bottom:12px;">👆</div>
        <p style="font-weight:700;color:#1e40af;font-size:14px;margin:0 0 8px;">Nhấn nút →IOC</p>
        <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0;">
          Nhấn nút <b style="background:#2563eb;color:white;padding:1px 6px;border-radius:4px;">→IOC</b>
          bên cạnh văn bản trong danh sách để xem chi tiết và gửi sang xabacha.com
        </p>
      </div>
      <div class="ioc-footer">
        <button class="ioc-btn-secondary" style="flex:1" data-ioc-action="close">Đóng</button>
      </div>`;
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
    .map(cb=>({url:cb.dataset.url, name:cb.dataset.name}));

  const token = await getIOCToken();
  const sendBtn = panel.querySelector('[data-ioc-action="send"]');
  if (sendBtn) sendBtn.textContent = '⏳ Đang gửi...';

  try {
    if (token) {
      // Gọi API trực tiếp
      const resp = await fetch(`${API_URL}/documents/capture`, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body: JSON.stringify({
          title: title.trim(),
          doc_number: get('ioc_doc_number').trim(),
          doc_type:   get('ioc_doc_type') || currentDocType,
          issuer:     get('ioc_issuer').trim(),
          issue_date: get('ioc_date').trim(),
          source_url: location.href,
          create_task: !!(panel.querySelector('#ioc_create_task')||{}).checked,
        }),
      });

      if (!resp.ok) {
        const e = await resp.json().catch(()=>({}));
        throw new Error(e.detail || `Lỗi ${resp.status}`);
      }

      const result = await resp.json();
      showToast(`✅ Đã tạo văn bản #${result.doc_id}${checkedFiles.length?' — đang tải file...':''}`);

      // Upload file
      let uploaded = 0;
      for (const f of checkedFiles) {
        try {
          const fr = await fetch(f.url, {credentials:'include'});
          if (!fr.ok) continue;
          const blob = await fr.blob();
          const fd = new FormData();
          fd.append('file', blob, f.name);
          const ur = await fetch(`${API_URL}/documents/${result.doc_id}/file`, {
            method:'POST', headers:{'Authorization':`Bearer ${token}`}, body:fd,
          });
          if (ur.ok) uploaded++;
        } catch {}
      }

      const msg = uploaded > 0
        ? `✅ Đã nhập văn bản + ${uploaded} file vào IOC!`
        : `✅ Văn bản #${result.doc_id} đã được tạo trong IOC`;
      showToast(msg);
      panel.classList.remove('visible');
      setTimeout(() => window.open(`${IOC_URL}/documents/${result.doc_id}`, '_blank'), 1000);

    } else {
      // Fallback: mở trang capture
      const p = new URLSearchParams({
        title: title.trim(),
        doc_number: get('ioc_doc_number').trim(),
        doc_type:   get('ioc_doc_type') || currentDocType,
        issuer:     get('ioc_issuer').trim(),
        issue_date: get('ioc_date').trim(),
        source_url: location.href,
      });
      window.open(`${IOC_URL}/capture?${p}`, 'ioc_cap',
        `width=540,height=720,left=${Math.max(0,screen.width-560)},top=50`);
      showToast('ℹ️ Đã mở xabacha.com — đăng nhập để lần sau tự upload file!');
    }
  } catch(err) {
    showToast('❌ ' + (err.message||'Lỗi không xác định'), '#dc2626');
  } finally {
    if (sendBtn) sendBtn.textContent = '🚀 Gửi sang xabacha.com';
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
    // Trang chi tiết — nếu đang chờ (sau khi click →IOC) thì auto mở
    if (watchForDetail) {
      watchForDetail = false;
      setTimeout(() => {
        const old = document.getElementById('ioc-panel');
        if (old) old.remove();
        openPanel();
      }, 300);
    }
  } else {
    // Trang danh sách — inject →IOC vào từng dòng
    injectRowButtons();
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
