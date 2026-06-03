/**
 * IOC Capture — Content Script
 * Chạy tự động khi vào dhtn.dcs.vn
 */

const IOC_URL = 'https://xabacha.com';

/* ══════════════════════════════════════
   QUÉT TEXT TOÀN TRANG
══════════════════════════════════════ */

function getAllPageText() {
  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_TEXT, null
  );
  const parts = [];
  let node;
  while ((node = walker.nextNode())) {
    const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length > 2) parts.push(t);
  }
  return parts.join('\n');
}

function extractData() {
  const text = getAllPageText();

  // Số hiệu văn bản: NNN-CV/ĐU, NNN-TB/TU, v.v.
  const numRx = /\b\d{2,4}-[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊẾỘỢỜỞỞỞỚ\-]+\/[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊẾỘỢỜỞỞỞỚ]{2,15}/g;
  const nums = [...new Set(text.match(numRx) || [])].slice(0, 8);

  // Ngày tháng: dd/mm/yyyy
  const dates = [...new Set(text.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [])].slice(0, 6);

  // Trích yếu V/v
  const vvRx = /V\/v\s+.{10,300}/g;
  const vvs = [...new Set((text.match(vvRx) || []).map(s => s.trim()))].slice(0, 6);

  // Đơn vị ban hành
  const issuerRx = /(Tỉnh ủy[^,\n\r]{3,60}|Đảng ủy[^,\n\r]{3,60}|UBND[^,\n\r]{3,60}|Ban [A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊẾ][^,\n\r]{3,60})/;
  const issuerMatch = text.match(issuerRx);
  const issuer = issuerMatch ? issuerMatch[0].trim().slice(0, 80) : '';

  // Loại trang
  const url = location.href.toLowerCase();
  const docType = url.includes('van-ban-den') ? 'incoming'
               : (url.includes('ban-hanh') || url.includes('van-ban-di')) ? 'outgoing'
               : 'incoming';

  return { nums, dates, vvs, issuer, docType };
}

/* ══════════════════════════════════════
   TẠO GIAO DIỆN
══════════════════════════════════════ */

function createFAB() {
  if (document.getElementById('ioc-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'ioc-fab';
  fab.title = 'IOC Capture — Gửi văn bản sang xabacha.com';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke-width="1.8"/>
      <path d="M8 12h8M12 8l4 4-4 4"/>
    </svg>`;
  fab.addEventListener('click', togglePanel);
  document.body.appendChild(fab);
}

function togglePanel() {
  let panel = document.getElementById('ioc-panel');
  if (!panel) {
    panel = createPanel();
    document.body.appendChild(panel);
  }
  panel.classList.toggle('visible');
}

function createPanel() {
  const d = extractData();

  const panel = document.createElement('div');
  panel.id = 'ioc-panel';

  // --- Helpers ---
  const makeOpts = (arr) => arr.map(v =>
    `<option value="${esc(v)}">${esc(v.slice(0, 70))}</option>`
  ).join('');

  const makeSelect = (id, opts, onchange) => opts.length
    ? `<select id="${id}" class="ioc-select" onchange="${onchange}">
        <option value="">-- Chọn --</option>${makeOpts(opts)}
       </select>`
    : '';

  panel.innerHTML = `
    <!-- Header -->
    <div class="ioc-header">
      <div>
        <div class="ioc-header-title">📥 Nhập văn bản sang IOC</div>
        <div class="ioc-header-sub">xabacha.com · Hệ thống điều hành</div>
      </div>
      <button class="ioc-close" onclick="document.getElementById('ioc-panel').classList.remove('visible')">×</button>
    </div>

    <!-- Body -->
    <div class="ioc-body">

      <!-- Loại văn bản -->
      <label class="ioc-label">Loại văn bản</label>
      <div class="ioc-type-row">
        <button class="ioc-type-btn ${d.docType === 'incoming' ? 'active' : ''}"
                onclick="iocSetType('incoming',this)">📥 Văn bản đến</button>
        <button class="ioc-type-btn ${d.docType === 'outgoing' ? 'active' : ''}"
                onclick="iocSetType('outgoing',this)">📤 Văn bản đi</button>
      </div>
      <input type="hidden" id="ioc_doc_type" value="${d.docType}">

      <!-- Số hiệu -->
      <label class="ioc-label">
        Số/Ký hiệu
        ${d.nums.length ? `<span class="ioc-badge">${d.nums.length} tìm thấy</span>` : ''}
      </label>
      ${makeSelect('ioc_num_sel', d.nums, "document.getElementById('ioc_doc_number').value=this.value")}
      <input id="ioc_doc_number" class="ioc-input" value="${esc(d.nums[0] || '')}"
             placeholder="VD: 811-CV/ĐU" style="margin-top:4px;">

      <!-- Trích yếu -->
      <label class="ioc-label">
        Trích yếu nội dung *
        ${d.vvs.length ? `<span class="ioc-badge">${d.vvs.length} tìm thấy</span>` : ''}
      </label>
      ${makeSelect('ioc_vv_sel', d.vvs, "document.getElementById('ioc_title').value=this.value")}
      <textarea id="ioc_title" class="ioc-textarea" placeholder="Nhập hoặc chọn trích yếu..." style="margin-top:4px;">${esc(d.vvs[0] || '')}</textarea>

      <!-- Đơn vị ban hành -->
      <label class="ioc-label">Đơn vị ban hành / Nơi gửi</label>
      <input id="ioc_issuer" class="ioc-input" value="${esc(d.issuer)}"
             placeholder="VD: Đảng ủy xã Bắc Hà - Tỉnh ủy Lào Cai">

      <!-- Ngày ban hành -->
      <label class="ioc-label">
        Ngày ban hành
        ${d.dates.length ? `<span class="ioc-badge">${d.dates.length} tìm thấy</span>` : ''}
      </label>
      ${makeSelect('ioc_date_sel', d.dates, "document.getElementById('ioc_date').value=this.value")}
      <input id="ioc_date" class="ioc-input" value="${esc(d.dates[0] || '')}"
             placeholder="dd/mm/yyyy" style="margin-top:4px;">

      <!-- Tạo nhiệm vụ -->
      <div class="ioc-task-box">
        <label class="ioc-task-toggle">
          <input type="checkbox" id="ioc_create_task" style="width:14px;height:14px;">
          Tự động tạo nhiệm vụ từ văn bản này
        </label>
      </div>

    </div>

    <!-- Footer -->
    <div class="ioc-footer">
      <button class="ioc-btn-primary" onclick="iocSend()">
        🚀 Gửi sang xabacha.com
      </button>
      <button class="ioc-btn-secondary"
              onclick="document.getElementById('ioc-panel').classList.remove('visible')">
        Đóng
      </button>
    </div>
  `;

  return panel;
}

/* ══════════════════════════════════════
   ACTIONS
══════════════════════════════════════ */

function iocSetType(type, btn) {
  document.getElementById('ioc_doc_type').value = type;
  document.querySelectorAll('.ioc-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function iocSend() {
  const title = (document.getElementById('ioc_title') || {}).value || '';
  if (!title.trim()) {
    showToast('⚠️ Vui lòng nhập trích yếu nội dung!', '#dc2626');
    return;
  }
  const params = new URLSearchParams({
    title:       title.trim(),
    doc_number:  ((document.getElementById('ioc_doc_number') || {}).value || '').trim(),
    doc_type:    ((document.getElementById('ioc_doc_type')   || {}).value || 'incoming'),
    issuer:      ((document.getElementById('ioc_issuer')     || {}).value || '').trim(),
    issue_date:  ((document.getElementById('ioc_date')       || {}).value || '').trim(),
    source_url:  location.href,
    create_task: (document.getElementById('ioc_create_task') || {}).checked ? '1' : '0',
  });
  window.open(
    `${IOC_URL}/capture?${params.toString()}`,
    'ioc_capture',
    `width=540,height=720,left=${screen.width - 560},top=50`
  );
}

function showToast(msg, color = '#2563eb') {
  const t = document.createElement('div');
  t.className = 'ioc-toast';
  t.style.background = color;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* Expose to inline onclick */
window.iocSetType = iocSetType;
window.iocSend    = iocSend;

/* ══════════════════════════════════════
   KHỞI ĐỘNG
══════════════════════════════════════ */

function init() {
  createFAB();

  // Thông báo nhỏ khi trang load
  const d = extractData();
  const found = d.nums.length + d.vvs.length;
  if (found > 0) {
    setTimeout(() => {
      showToast(`✅ IOC sẵn sàng — tìm thấy ${found} thông tin văn bản. Nhấn nút 🔵 góc phải.`);
    }, 1200);
  }
}

// Chạy ngay + chờ trang ZK load xong
if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}

// ZK dùng AJAX nên lắng nghe thay đổi URL
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => {
      const panel = document.getElementById('ioc-panel');
      if (panel) panel.remove(); // recreate với data mới
      createFAB();
    }, 800);
  }
}).observe(document.body, { childList: true, subtree: true });
