import { useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { BookOpen, Check, Copy, ExternalLink } from 'lucide-react'

const BOOKMARKLET_CODE = `javascript:(function(){var IOC_URL='https://xabacha.com';var MARKER='__dhtn_ioc__';if(window[MARKER]){if(typeof window[MARKER+'_inject']==='function')window[MARKER+'_inject']();return;}window[MARKER]=true;var style=document.createElement('style');style.textContent='.ioc-capture-btn{display:inline-flex;align-items:center;gap:4px;background:#2563eb;color:#fff;border:none;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;margin:1px;transition:background .15s;}.ioc-capture-btn:hover{background:#1d4ed8;}.ioc-capture-btn svg{width:11px;height:11px;}';document.head.appendChild(style);function cellText(el){return(el?el.textContent||'':'').replace(/\\s+/g,' ').trim();}function pageType(){var url=window.location.href.toLowerCase();var title=(document.title||'').toLowerCase();if(url.includes('van-ban-den')||title.includes('văn bản đến'))return 'incoming';if(url.includes('van-ban-di')||title.includes('văn bản đi')||title.includes('ban hành'))return 'outgoing';return 'unknown';}function getDocRows(){var sel=['tr.z-listitem','tr.z-row','tbody tr','table tr'];for(var s=0;s<sel.length;s++){var rows=document.querySelectorAll(sel[s]);if(rows.length>0)return rows;}return[];}function detectColumns(){var headers=document.querySelectorAll('th,td.z-listheader-content,.z-listheader td');var map={};headers.forEach(function(h,i){var t=cellText(h).toLowerCase();if(t.includes('số')||t.includes('ký hiệu'))map.doc_number=i;if(t.includes('trích yếu')||t.includes('nội dung'))map.title=i;if(t.includes('đơn vị ban hành')||t.includes('nơi gửi'))map.issuer=i;if(t.includes('thời gian nhận')||t.includes('ngày văn bản'))map.date=i;if(t.includes('độ mật'))map.do_mat=i;});return map;}var rxDocNum=/^\\d{2,4}-[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊ-]+[\\/\\-][A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊ]{2,10}$/i;var rxDate=/^\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{4}$/;function extractFromRow(row,colMap,type){var cells=row.querySelectorAll('td,div.z-listcell-cnt,span.z-label');if(!cells.length)return null;var doc={doc_type:type,cells:[]};cells.forEach(function(c){doc.cells.push(cellText(c));});if(colMap.doc_number!==undefined)doc.doc_number=doc.cells[colMap.doc_number]||'';if(colMap.title!==undefined)doc.title=doc.cells[colMap.title]||'';if(colMap.issuer!==undefined)doc.issuer=doc.cells[colMap.issuer]||'';if(colMap.date!==undefined)doc.date=doc.cells[colMap.date]||'';if(colMap.do_mat!==undefined)doc.do_mat=doc.cells[colMap.do_mat]||'';doc.cells.forEach(function(t){if(!doc.doc_number&&rxDocNum.test(t))doc.doc_number=t;if(!doc.date&&rxDate.test(t))doc.date=t;if(!doc.title&&t.length>20&&(t.startsWith('V/v')||t.startsWith('Về việc')))doc.title=t;if(!doc.issuer&&(t.includes('ủy')&&t.length>5))doc.issuer=t;});if(!doc.title){var longest='';doc.cells.forEach(function(t){if(t.length>longest.length&&t.length>10)longest=t;});doc.title=longest;}if(!doc.title)return null;return doc;}function inject(){var type=pageType();var colMap=detectColumns();var rows=getDocRows();var count=0;rows.forEach(function(row){if(row.querySelector('.ioc-capture-btn'))return;var doc=extractFromRow(row,colMap,type==='unknown'?'incoming':type);if(!doc)return;var btn=document.createElement('button');btn.className='ioc-capture-btn';btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>IOC';btn.title='Gửi văn bản sang xabacha.com';btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var p=new URLSearchParams({title:doc.title||'',doc_number:doc.doc_number||'',doc_type:doc.doc_type||'incoming',issuer:doc.issuer||'',issue_date:doc.date||'',source_url:window.location.href,do_mat:doc.do_mat||''});window.open(IOC_URL+'/capture?'+p.toString(),'_blank','width=520,height=700,left=200,top=50');});var firstCell=row.querySelector('td');if(firstCell){firstCell.style.minWidth='80px';firstCell.insertBefore(btn,firstCell.firstChild);}count++;});if(count>0)console.log('[IOC] Đã thêm '+count+' nút →IOC');}window[MARKER+'_inject']=inject;inject();var obs=new MutationObserver(function(){setTimeout(inject,600);});obs.observe(document.body,{childList:true,subtree:true});var toast=document.createElement('div');toast.style.cssText='position:fixed;top:16px;right:16px;z-index:99999;background:#2563eb;color:white;padding:10px 18px;border-radius:12px;font-size:13px;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25);';toast.textContent='✅ IOC Capture đã bật — nhấn nút →IOC trên mỗi văn bản';document.body.appendChild(toast);setTimeout(function(){toast.remove();},4000);})();`

const STEPS = [
  {
    n: '1',
    title: 'Copy đoạn code bookmarklet',
    desc: 'Nhấn nút "Copy code" bên dưới để copy toàn bộ đoạn javascript.',
  },
  {
    n: '2',
    title: 'Tạo bookmark mới trong trình duyệt',
    desc: 'Chrome/Cốc Cốc: nhấn Ctrl+D (hoặc nhấn ⭐ trên thanh địa chỉ) → chọn "Sửa" → xóa URL hiện tại → dán code vừa copy vào ô URL.',
  },
  {
    n: '3',
    title: 'Đặt tên bookmark',
    desc: 'Đặt tên ví dụ: "→IOC" hoặc "Gửi sang IOC" để dễ nhận biết.',
  },
  {
    n: '4',
    title: 'Sử dụng',
    desc: 'Khi đang ở trang dhtn.dcs.vn (văn bản đến hoặc đi), click bookmark → nút →IOC xuất hiện trên từng dòng văn bản → click để nhập vào IOC.',
  },
]

export default function BookmarkletGuidePage() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(BOOKMARKLET_CODE).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
            <BookOpen size={22} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Nhập văn bản từ dhtn.dcs.vn</h1>
            <p className="text-slate-500 text-sm mt-1">
              Công cụ Bookmarklet — bấm 1 click để chuyển văn bản từ hệ thống tỉnh sang IOC xã
            </p>
          </div>
        </div>

        {/* Demo banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
          <p className="font-semibold text-lg mb-1">Quy trình hoạt động</p>
          <div className="flex items-center gap-2 text-sm text-blue-100 flex-wrap">
            <span className="bg-white/20 px-2.5 py-1 rounded-lg">dhtn.dcs.vn</span>
            <span>→ Click "→IOC"</span>
            <span className="bg-white/20 px-2.5 py-1 rounded-lg">Form xabacha.com</span>
            <span>→ Xác nhận</span>
            <span className="bg-white/20 px-2.5 py-1 rounded-lg">Văn bản + Nhiệm vụ</span>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-slate-700">Hướng dẫn cài đặt</h2>
          {STEPS.map(s => (
            <div key={s.n} className="flex gap-4">
              <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold">
                {s.n}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{s.title}</p>
                <p className="text-slate-500 text-xs mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Code box */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-700 text-sm">Code Bookmarklet</p>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                copied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {copied ? <><Check size={14} /> Đã copy!</> : <><Copy size={14} /> Copy code</>}
            </button>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
            <code className="text-green-400 text-xs font-mono break-all whitespace-pre-wrap">
              {BOOKMARKLET_CODE.slice(0, 200)}...
            </code>
            <p className="text-slate-500 text-xs mt-2">(Nhấn "Copy code" để lấy toàn bộ đoạn code)</p>
          </div>
        </div>

        {/* Link to dhtn */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="font-semibold text-amber-800 text-sm mb-2">Lưu ý quan trọng</p>
          <ul className="text-amber-700 text-xs space-y-1 list-disc list-inside">
            <li>Bạn phải <strong>đăng nhập vào xabacha.com trước</strong> khi dùng bookmarklet</li>
            <li>Bookmarklet chỉ hoạt động trên trang dhtn.dcs.vn khi đã đăng nhập dhtn</li>
            <li>Dữ liệu được trích xuất tự động nhưng bạn có thể <strong>sửa trước khi lưu</strong></li>
            <li>Bookmarklet không lưu mật khẩu dhtn, không gửi dữ liệu ra ngoài ngoài xabacha.com</li>
          </ul>
          <a
            href="https://dhtn.dcs.vn"
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 text-amber-700 hover:text-amber-900 text-sm font-semibold"
          >
            <ExternalLink size={14} /> Mở dhtn.dcs.vn
          </a>
        </div>
      </div>
    </AppLayout>
  )
}
