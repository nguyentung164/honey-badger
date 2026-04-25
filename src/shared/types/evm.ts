export interface EVMProject {
  id: string
  projectNo?: string
  projectName: string
  endUser?: string
  startDate: string
  endDate: string
  reportDate: string
}

/** PM/PL từ `user_project_roles` (hiển thị chip trong dialog thông tin dự án). */
export interface EvmProjectRoleUser {
  userId: string
  name?: string
  userCode?: string
  role: 'pm' | 'pl'
}

/** Một dòng WBS Master (rollup phase/category/feature). */
export interface WbsMasterRow {
  id: string
  projectId: string
  sortNo: number
  phase?: string
  category?: string
  feature?: string
  note?: string
  planStartDate?: string
  planEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  assignee?: string
  assigneeName?: string
  bac?: number
  pv?: number
  ev?: number
  sv?: number
  spi?: number
  /** 0..1 hoặc % tùy DB; UI chuẩn hoá. */
  progress?: number
}

/** Một dòng WBS Detail (task); id = khóa trong evm_wbs_details. */
export interface WBSRow {
  id: string
  projectId: string
  /** evm_wbs_master.id; optional khi tạo mới (server gán). */
  masterId?: string
  no: number
  phase?: string
  category?: string
  feature?: string
  task?: string
  planStartDate?: string
  planEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  assignee?: string
  assigneeName?: string
  /** 0..1 (đồng bộ evmCalculations). */
  percentDone: number
  status?: string
  statusName?: string
  bac?: number
  /** Ghi chú dòng (Details). */
  wbsNote?: string
  durationDays?: number | null
  predecessor?: string
  effort?: number | null
  estMd?: number | null
}

export interface ACRow {
  id: string
  projectId: string
  no: number
  /** Ngày báo cáo (timeline cột N+ trên Excel; ở đây một dòng / lần báo cáo). */
  date?: string
  phase?: string
  /** Khớp sheet AC Excel (cột D–E). */
  category?: string
  feature?: string
  /** Tên task khớp cột WBS Task (cột F); nếu trống dùng workContents. */
  task?: string
  planStartDate?: string
  planEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  /** 0..1 tại thời điểm báo cáo (cột %Done trên sheet AC). */
  percentDone?: number
  assignee?: string
  workingHours: number
  workContents?: string
}

export interface EVMMaster {
  projectId: string
  /** Preset / fallback; ưu tiên hiển thị danh mục từ bảng evm_phases. */
  phases: { code: string; name?: string }[]
  /**
   * Thành viên dự án (users có dòng trong `user_project_roles` cho project).
   * Không lưu trong `evm_master`; backend điền khi load EVM.
   */
  assignees: { code: string; name?: string; userCode?: string }[]
  statuses: { code: string; name?: string }[]
  percentDoneOptions: number[]
  nonWorkingDays: { date: string; note?: string }[]
  /** Giờ làm/ngày để quy đổi AC → man-day (Excel Master, thường 8). */
  hoursPerDay?: number
  /** Ghi chú báo cáo theo mã phase (Report tab). */
  phaseReportNotes?: Record<string, string>
  /** Ghi chú báo cáo theo mã assignee (user id). */
  assigneeReportNotes?: Record<string, string>
  /**
   * Map trường → chữ cái cột spreadsheet (Excel Master Y:Z) cho import/CSV.
   * Key: phase | category | feature | task | planStart | planEnd | actualStart | actualEnd | assignee | percentDone | estMd
   */
  issueImportMap?: Partial<Record<IssueImportMapField, string>>
}

/** PATCH evm_master — không gửi `assignees` (nguồn: user_project_roles). */
export type EVMMasterUpdatePayload = Omit<Partial<EVMMaster>, 'assignees' | 'projectId'>

export type IssueImportMapField =
  | 'phase'
  | 'category'
  | 'feature'
  | 'task'
  | 'planStart'
  | 'planEnd'
  | 'actualStart'
  | 'actualEnd'
  | 'assignee'
  | 'percentDone'
  | 'estMd'

/** Một ô phân bổ ngày trên WBS detail (Resource / Excel BZ). */
export interface WbsDayUnitRow {
  wbsId: string
  workDate: string
  unit: number
}

export interface EVMData {
  project: EVMProject
  wbsMaster: WbsMasterRow[]
  wbs: WBSRow[]
  ac: ACRow[]
  master: EVMMaster
  /** Sparse: chỉ các (detailId, ngày) có nhập. */
  wbsDayUnits?: WbsDayUnitRow[]
}
