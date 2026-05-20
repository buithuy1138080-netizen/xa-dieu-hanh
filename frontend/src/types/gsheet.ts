export type EntityType = 'nq57' | 'task' | 'kpi' | 'document' | 'staff' | 'department'
export type SyncDirection = 'pull' | 'push' | 'bidirectional'
export type ConflictResolution = 'ioc_wins' | 'sheet_wins' | 'latest_wins' | 'manual'
export type SyncStatus = 'running' | 'done' | 'failed' | 'partial'
export type ConflictState = 'pending' | 'ioc_wins' | 'sheet_wins' | 'manual'

export const ENTITY_LABELS: Record<EntityType, string> = {
  nq57: 'NQ57 Nhiệm vụ',
  task: 'Nhiệm vụ',
  kpi: 'KPI',
  document: 'Văn bản',
  staff: 'Nhân sự',
  department: 'Đơn vị',
}

export const DIRECTION_LABELS: Record<SyncDirection, string> = {
  pull: '⬇ Sheet → IOC',
  push: '⬆ IOC → Sheet',
  bidirectional: '⇅ Hai chiều',
}

export const CONFLICT_LABELS: Record<ConflictResolution, string> = {
  ioc_wins: 'IOC ưu tiên',
  sheet_wins: 'Sheet ưu tiên',
  latest_wins: 'Mới nhất ưu tiên',
  manual: 'Xử lý thủ công',
}

export interface FieldMapping {
  ioc_field: string
  sheet_col: string
  transform: string | null
  default?: string | null
}

export interface SyncConfigRead {
  id: number
  name: string
  entity_type: EntityType
  source_type: string
  sheet_id: string | null
  sheet_tab: string
  data_range: string
  auth_type: string
  has_credentials: boolean
  field_mappings: FieldMapping[] | null
  key_field: string
  key_col: string
  sync_direction: SyncDirection
  conflict_resolution: ConflictResolution
  auto_sync_minutes: number
  webhook_token: string
  is_active: boolean
  last_sync_at: string | null
  created_at: string
}

export interface SyncConfigCreate {
  name: string
  entity_type: EntityType
  source_type?: string
  sheet_id?: string
  sheet_tab?: string
  data_range?: string
  auth_type?: string
  credentials_json?: string
  field_mappings?: FieldMapping[]
  key_field?: string
  key_col?: string
  sync_direction?: SyncDirection
  conflict_resolution?: ConflictResolution
  auto_sync_minutes?: number
}

export interface SyncConfigUpdate {
  name?: string
  sheet_id?: string
  sheet_tab?: string
  data_range?: string
  credentials_json?: string
  field_mappings?: FieldMapping[]
  key_field?: string
  key_col?: string
  sync_direction?: SyncDirection
  conflict_resolution?: ConflictResolution
  auto_sync_minutes?: number
  is_active?: boolean
}

export interface SyncLogRead {
  id: number
  config_id: number
  direction: string
  status: SyncStatus
  records_read: number
  records_created: number
  records_updated: number
  records_skipped: number
  records_failed: number
  records_conflict: number
  error_msg: string | null
  triggered_by: string
  started_at: string
  finished_at: string | null
}

export interface SyncConflictRead {
  id: number
  config_id: number
  log_id: number | null
  entity_type: EntityType
  entity_id: number | null
  sheet_row: number | null
  field_name: string
  ioc_value: string | null
  sheet_value: string | null
  resolution: ConflictState
  created_at: string
}

export interface SyncStats {
  configs_total: number
  configs_active: number
  logs_total: number
  pending_conflicts: number
}
