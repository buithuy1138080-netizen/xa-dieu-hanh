/**
 * Bookmarklet dhtn.dcs.vn → xabacha.com  (v2 — ZK Framework compatible)
 *
 * Chiến lược mới: Quét toàn bộ text node trong trang để tìm
 * số hiệu, ngày tháng, trích yếu — không phụ thuộc CSS class của ZK.
 *
 * URL để dùng làm bookmark:
 *   Sao chép toàn bộ nội dung file này và dán vào URL của bookmark.
 */

javascript:(function(){
var IOC='https://xabacha.com';
var PANEL_ID='__ioc_panel__';

/* ── Nếu đã mở rồi thì toggle hiện/ẩn ── */
var existing=document.getElementById(PANEL_ID);
if(existing){existing.style.display=existing.style.display==='none'?'flex':'none';return;}

/* ══════════════════════════════════════
   BƯỚC 1: Quét text toàn trang
══════════════════════════════════════ */
var rxNum  = /\b\d{2,4}-[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊẾ\-]+\/[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊẾ]{2,15}/g;
var rxDate = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
var rxVv   = /V\/v\s.{10,200}/g;

function getAllText(){
  var texts=[];
  var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);
  var n;
  while((n=walker.nextNode())){
    var t=(n.textContent||'').replace(/\s+/g,' ').trim();
    if(t.length>2) texts.push(t);
  }
  return texts.join('\n');
}

var pageText = getAllText();

/* Tìm số hiệu văn bản */
var nums = (pageText.match(rxNum)||[]).filter(function(v,i,a){return a.indexOf(v)===i;});
/* Tìm ngày tháng */
var dates= (pageText.match(/\d{1,2}\/\d{1,2}\/\d{4}/g)||[]).filter(function(v,i,a){return a.indexOf(v)===i;});
/* Tìm trích yếu V/v */
var vvs  = (pageText.match(rxVv)||[]).map(function(s){return s.trim();}).filter(function(v,i,a){return a.indexOf(v)===i;});

/* Nhận diện loại trang */
var pageUrl = window.location.href.toLowerCase();
var docType = pageUrl.includes('van-ban-den') ? 'incoming'
            : pageUrl.includes('ban-hanh') || pageUrl.includes('van-ban-di') ? 'outgoing'
            : 'incoming';

/* Trích xuất đơn vị ban hành (tìm tên cơ quan phổ biến) */
var issuerMatch = pageText.match(/(Tỉnh ủy[^,\n]+|Đảng ủy[^,\n]+|UBND[^,\n]+|Ban[^,\n]{3,40})/);
var issuer = issuerMatch ? issuerMatch[0].trim().slice(0,80) : '';

/* ══════════════════════════════════════
   BƯỚC 2: Tạo panel giao diện
══════════════════════════════════════ */
var panel=document.createElement('div');
panel.id=PANEL_ID;
panel.style.cssText=[
  'position:fixed','top:60px','right:16px','z-index:2147483647',
  'width:340px','max-height:90vh','overflow-y:auto',
  'background:#fff','border-radius:16px',
  'box-shadow:0 8px 40px rgba(0,0,0,0.25)',
  'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
  'font-size:13px','display:flex','flex-direction:column',
].join(';');

function inp(id,val,ph){
  return '<input id="ioc_'+id+'" value="'+esc(val)+'" placeholder="'+ph+'"'
    +' style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;'
    +'padding:6px 10px;font-size:12px;outline:none;margin-top:4px;">';
}
function sel(id,opts,cur){
  var o=opts.map(function(v){return '<option value="'+v[0]+'"'+(v[0]===cur?' selected':'')+'>'+v[1]+'</option>';}).join('');
  return '<select id="ioc_'+id+'" style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;margin-top:4px;">'+o+'</select>';
}
function lbl(text){return '<label style="font-weight:600;color:#475569;font-size:11px;display:block;margin-top:10px;">'+text+'</label>';}
function esc(s){return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

/* Danh sách gợi ý số hiệu */
var numOpts = nums.slice(0,5).map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join('');
var numSel = nums.length>0
  ? '<select id="ioc_num_sel" style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;margin-top:4px;" onchange="document.getElementById(\'ioc_doc_number\').value=this.value"><option value="">-- Chọn số hiệu --</option>'+numOpts+'</select>'
  : '';

/* Danh sách gợi ý trích yếu */
var titleOpts = vvs.slice(0,5).map(function(v){return '<option value="'+esc(v)+'">'+esc(v.slice(0,60))+'...</option>';}).join('');
var titleSel = vvs.length>0
  ? '<select id="ioc_title_sel" style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;margin-top:4px;" onchange="document.getElementById(\'ioc_title\').value=this.value"><option value="">-- Chọn trích yếu --</option>'+titleOpts+'</select>'
  : '';

panel.innerHTML=[
  /* Header */
  '<div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:12px 16px;border-radius:16px 16px 0 0;display:flex;align-items:center;justify-content:space-between;">',
    '<div style="color:white;font-weight:700;font-size:14px;">📥 Nhập sang IOC</div>',
    '<button onclick="document.getElementById(\''+PANEL_ID+'\').style.display=\'none\'" style="background:rgba(255,255,255,0.2);border:none;color:white;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1;">×</button>',
  '</div>',

  /* Body */
  '<div style="padding:14px 16px;">',

  /* Loại văn bản */
  lbl('Loại văn bản'),
  sel('doc_type',[['incoming','📥 Văn bản đến'],['outgoing','📤 Văn bản đi']],docType),

  /* Số hiệu */
  lbl('Số/Ký hiệu'),
  numSel,
  inp('doc_number', nums[0]||'', 'VD: 811-CV/ĐU'),

  /* Trích yếu */
  lbl('Trích yếu nội dung '+(vvs.length>0?'('+vvs.length+' gợi ý tìm thấy)':'')),
  titleSel,
  '<textarea id="ioc_title" rows="3" placeholder="Nhập hoặc chọn trích yếu..." style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;margin-top:4px;resize:vertical;">'+esc(vvs[0]||'')+'</textarea>',

  /* Đơn vị ban hành */
  lbl('Đơn vị ban hành / Nơi gửi'),
  inp('issuer', issuer, 'VD: Đảng ủy xã Bắc Hà - Tỉnh ủy Lào Cai'),

  /* Ngày ban hành */
  lbl('Ngày ban hành '+(dates.length>0?'(tìm thấy '+dates.length+' ngày)':'')),
  dates.length>0
    ? '<select id="ioc_date_sel" style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;margin-top:4px;" onchange="document.getElementById(\'ioc_date\').value=this.value"><option value="">-- Chọn ngày --</option>'+dates.slice(0,5).map(function(d){return '<option value="'+d+'">'+d+'</option>';}).join('')+'</select>'
    : '',
  inp('date', dates[0]||'', 'dd/mm/yyyy'),

  /* Tạo nhiệm vụ */
  '<div style="margin-top:12px;padding:10px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;">',
    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;color:#1e40af;font-size:12px;">',
      '<input type="checkbox" id="ioc_create_task" style="width:14px;height:14px;">',
      'Tạo nhiệm vụ từ văn bản này',
    '</label>',
  '</div>',

  '</div>',

  /* Footer */
  '<div style="padding:12px 16px;border-top:1px solid #f1f5f9;display:flex;gap:8px;">',
    '<button id="ioc_send_btn" style="flex:1;background:#2563eb;color:white;border:none;padding:9px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;" onclick="__iocSend()">',
      '🚀 Gửi sang IOC',
    '</button>',
    '<button onclick="document.getElementById(\''+PANEL_ID+'\').style.display=\'none\'" style="padding:9px 14px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;font-size:13px;cursor:pointer;">',
      'Đóng',
    '</button>',
  '</div>',
].join('');

document.body.appendChild(panel);

/* ══════════════════════════════════════
   BƯỚC 3: Hàm gửi sang IOC
══════════════════════════════════════ */
window.__iocSend = function(){
  var docNumber = (document.getElementById('ioc_doc_number')||{}).value||'';
  var title     = (document.getElementById('ioc_title')||{}).value||'';
  var docType2  = (document.getElementById('ioc_doc_type')||{}).value||docType;
  var issuer2   = (document.getElementById('ioc_issuer')||{}).value||'';
  var date2     = (document.getElementById('ioc_date')||{}).value||'';
  var createTask= (document.getElementById('ioc_create_task')||{}).checked||false;

  if(!title.trim()){alert('Vui lòng nhập trích yếu nội dung văn bản!');return;}

  var p=new URLSearchParams({
    title:      title.trim(),
    doc_number: docNumber.trim(),
    doc_type:   docType2,
    issuer:     issuer2.trim(),
    issue_date: date2.trim(),
    source_url: window.location.href,
    create_task: createTask?'1':'0',
  });

  window.open(IOC+'/capture?'+p.toString(),'ioc_capture',
    'width=540,height=720,left='+(screen.width-560)+',top=50');
};

/* ── Thông báo nhỏ ── */
var toast=document.createElement('div');
toast.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#2563eb;color:white;padding:8px 20px;border-radius:999px;font-family:sans-serif;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.2);white-space:nowrap;';
toast.textContent='✅ IOC Capture: tìm thấy '+nums.length+' số hiệu, '+vvs.length+' trích yếu, '+dates.length+' ngày';
document.body.appendChild(toast);
setTimeout(function(){toast.remove();},4000);
})();
