/**
 * Bookmarklet cho dhtn.dcs.vn → xabacha.com
 *
 * Cách dùng:
 * 1. Tạo bookmark mới trong trình duyệt
 * 2. URL = toàn bộ nội dung file này (từ javascript: đến hết)
 * 3. Khi đang ở trang dhtn.dcs.vn, click bookmark → nút "→IOC" xuất hiện trên mỗi dòng
 * 4. Click "→IOC" trên văn bản muốn nhập → form xabacha.com mở ra đã điền sẵn
 */

javascript:(function(){
  var IOC_URL='https://xabacha.com';
  var MARKER='__dhtn_ioc__';

  if(window[MARKER]){
    // Đã inject rồi — chạy lại để cập nhật các dòng mới
    if(typeof window[MARKER+'_inject']==='function') window[MARKER+'_inject']();
    return;
  }
  window[MARKER]=true;

  /* ── Thêm style cho nút IOC ── */
  var style=document.createElement('style');
  style.textContent='.ioc-capture-btn{display:inline-flex;align-items:center;gap:4px;background:#2563eb;color:#fff;border:none;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;margin:1px;transition:background .15s;}.ioc-capture-btn:hover{background:#1d4ed8;}.ioc-capture-btn svg{width:11px;height:11px;}';
  document.head.appendChild(style);

  /* ── Trích xuất text sạch từ cell ── */
  function cellText(el){return(el?el.textContent||'':'').replace(/\s+/g,' ').trim();}

  /* ── Nhận diện kiểu trang ── */
  function pageType(){
    var url=window.location.href.toLowerCase();
    var title=(document.title||'').toLowerCase();
    if(url.includes('van-ban-den')||url.includes('vanbanden')||title.includes('văn bản đến')) return 'incoming';
    if(url.includes('van-ban-di')||url.includes('vanban-ban-hanh')||title.includes('văn bản đi')||title.includes('ban hành')) return 'outgoing';
    return 'unknown';
  }

  /* ── Tìm dòng văn bản trong bảng ZK ── */
  function getDocRows(){
    // ZK Framework dùng z-listitem hoặc z-row
    var sel=['tr.z-listitem','tr.z-row','tbody tr','table tr'];
    for(var s=0;s<sel.length;s++){
      var rows=document.querySelectorAll(sel[s]);
      if(rows.length>0) return rows;
    }
    return [];
  }

  /* ── Phát hiện cột dựa trên nội dung header ── */
  function detectColumns(){
    var headers=document.querySelectorAll('th,td.z-listheader-content,.z-listheader td');
    var map={};
    headers.forEach(function(h,i){
      var t=cellText(h).toLowerCase();
      if(t.includes('số')||t.includes('ký hiệu')||t.includes('kỳ hiệu')) map.doc_number=i;
      if(t.includes('trích yếu')||t.includes('nội dung')) map.title=i;
      if(t.includes('đơn vị ban hành')||t.includes('nơi gửi')) map.issuer=i;
      if(t.includes('thời gian nhận')||t.includes('ngày văn bản')||t.includes('ngày vb')) map.date=i;
      if(t.includes('độ mật')) map.do_mat=i;
    });
    return map;
  }

  /* ── Regex nhận diện nhanh ── */
  var rxDocNum=/^\d{2,4}-[A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊ-]+[\/\-][A-ZĐÀÁẢÃẠĂẮẶẲẴẰÂẤẬẨẪẦÊ]{2,10}$/i;
  var rxDate=/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/;

  function extractFromRow(row,colMap,type){
    var cells=row.querySelectorAll('td,div.z-listcell-cnt,span.z-label');
    if(!cells.length) return null;

    var doc={doc_type:type,cells:[]};
    cells.forEach(function(c){doc.cells.push(cellText(c));});

    // 1. Dùng map nếu có
    if(colMap.doc_number!==undefined) doc.doc_number=doc.cells[colMap.doc_number]||'';
    if(colMap.title!==undefined)      doc.title=doc.cells[colMap.title]||'';
    if(colMap.issuer!==undefined)     doc.issuer=doc.cells[colMap.issuer]||'';
    if(colMap.date!==undefined)       doc.date=doc.cells[colMap.date]||'';
    if(colMap.do_mat!==undefined)     doc.do_mat=doc.cells[colMap.do_mat]||'';

    // 2. Fallback: scan qua từng cell bằng regex
    doc.cells.forEach(function(t){
      if(!doc.doc_number&&rxDocNum.test(t)) doc.doc_number=t;
      if(!doc.date&&rxDate.test(t)) doc.date=t;
      if(!doc.title&&t.length>20&&(t.startsWith('V/v')||t.startsWith('Về việc')||t.startsWith('v/v'))) doc.title=t;
      if(!doc.issuer&&(t.includes('ủy')&&t.length>5)) doc.issuer=t;
    });

    // 3. Nếu không có title thì lấy cell dài nhất
    if(!doc.title){
      var longest='';
      doc.cells.forEach(function(t){if(t.length>longest.length&&t.length>10) longest=t;});
      doc.title=longest;
    }

    if(!doc.title) return null;
    return doc;
  }

  /* ── Inject nút IOC vào mỗi dòng ── */
  function inject(){
    var type=pageType();
    var colMap=detectColumns();
    var rows=getDocRows();
    var count=0;

    rows.forEach(function(row){
      if(row.querySelector('.ioc-capture-btn')) return; // đã có rồi
      var doc=extractFromRow(row,colMap,type==='unknown'?'incoming':type);
      if(!doc) return;

      var btn=document.createElement('button');
      btn.className='ioc-capture-btn';
      btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>IOC';
      btn.title='Gửi văn bản sang xabacha.com';

      btn.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        var p=new URLSearchParams({
          title:       doc.title||'',
          doc_number:  doc.doc_number||'',
          doc_type:    doc.doc_type||'incoming',
          issuer:      doc.issuer||'',
          issue_date:  doc.date||'',
          source_url:  window.location.href,
          do_mat:      doc.do_mat||''
        });
        window.open(IOC_URL+'/capture?'+p.toString(),'_blank','width=520,height=700,left=200,top=50');
      });

      // Thêm vào cột đầu tiên (Thao tác)
      var firstCell=row.querySelector('td');
      if(firstCell){firstCell.style.minWidth='80px';firstCell.insertBefore(btn,firstCell.firstChild);}
      count++;
    });

    if(count>0) console.log('[IOC] Đã thêm '+count+' nút →IOC');
  }

  window[MARKER+'_inject']=inject;
  inject();

  /* ── Theo dõi thay đổi DOM (ZK dùng AJAX để load thêm) ── */
  var obs=new MutationObserver(function(){setTimeout(inject,600);});
  obs.observe(document.body,{childList:true,subtree:true});

  /* ── Thông báo ── */
  var toast=document.createElement('div');
  toast.style.cssText='position:fixed;top:16px;right:16px;z-index:99999;background:#2563eb;color:white;padding:10px 18px;border-radius:12px;font-size:13px;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25);';
  toast.textContent='✅ IOC Capture đã bật — nhấn nút →IOC trên mỗi văn bản';
  document.body.appendChild(toast);
  setTimeout(function(){toast.remove();},4000);
})();
