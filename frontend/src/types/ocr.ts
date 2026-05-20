export type OcrStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface OcrVanBan {
  so_ky_hieu?: string
  loai_van_ban?: string
  ngay_ban_hanh?: string   // ISO date YYYY-MM-DD
  co_quan_ban_hanh?: string
  trich_yeu?: string
  uu_tien?: string
}

export interface OcrNhiemVu {
  ten_nhiem_vu: string
  mo_ta?: string
  deadline?: string | null   // ISO date or null
  don_vi_chu_tri?: string | null
  muc_uu_tien?: string       // low/medium/high/urgent
}

export interface OcrKpi {
  ten: string
  muc_tieu_pct: number
  nam: number
  quy?: number | null
  loai_kpi?: string
}

export interface OcrCanhBao {
  field: string
  message: string
}

export interface OcrAiResult {
  van_ban: OcrVanBan
  nhiem_vu: OcrNhiemVu[]
  kpi: OcrKpi[]
  canh_bao: OcrCanhBao[]
}

export interface OcrDocumentList {
  id: number
  filename: string
  file_type: string
  file_size: number
  page_count: number
  status: OcrStatus
  error_msg?: string | null
  document_id?: number | null
  linked_task_ids?: number[] | null
  created_at: string
  processed_at?: string | null
  confirmed_at?: string | null
}

export interface OcrDocumentRead extends OcrDocumentList {
  ocr_text?: string | null
  ai_result?: OcrAiResult | null
  created_by: number
}

export interface OcrUploadResponse {
  id: number
  status: OcrStatus
  filename: string
}

export interface OcrConfirmRequest {
  ai_result: OcrAiResult
  create_document: boolean
  create_tasks: boolean
  selected_task_indices: number[]
}

export interface OcrConfirmResult {
  document_id?: number | null
  task_ids: number[]
  message: string
}

export interface OcrEngineStatus {
  pytesseract: boolean
  pymupdf: boolean
  tesseract_binary: boolean
}
