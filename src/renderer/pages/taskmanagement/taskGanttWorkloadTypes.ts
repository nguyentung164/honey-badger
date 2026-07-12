export type WorkloadDayCell = {
    userId: string
    date: string
    derivedHours: number
    /** Giờ thực tế (daily report); hiển thị khi không có override */
    actualWorkHours: number | null
    overrideHours: number | null
    taskCount: number
    taskIds: string[]
}
export type WorkloadUserMeta = {
    userId: string
    name: string
    userCode: string
    role: 'pm' | 'pl' | 'dev'
}
export type WorkloadData = {
    users: WorkloadUserMeta[]
    days: WorkloadDayCell[]
    hoursPerDay: number
    nonWorkingDates: string[]
    canEditAll: boolean
    selfUserId: string
}
/** Một khối workload theo project — Gantt có thể ghép nhiều segment. */
export type WorkloadBoardSegment = {
    projectId: string
    projectLabel: string
    data: WorkloadData
}
export type WorkloadScale = 'week' | 'month' | 'monthly'
export type WorkloadDisplayMode = 'hours' | 'tasks'
/** `full`: một khối (banner / đợi load). `header`|`body`: tách header khỏi overflow-y — không dùng sticky dọc, tránh lệch subpixel Chrome. */
export type WorkloadTableSegment = 'full' | 'header' | 'body'
export type WorkloadOverrideUpsertInput = {
    projectId: string
    userId: string
    workDate: string
    overrideHours: number | null
    note: string | null
}
/** Một dòng chọn ngày trong Dialog override (snapshot khi mở — không đọc cellMap lại trong ô). */
export type WorkloadOverrideChoiceSnapshot = {
    iso: string
    weekend: boolean
    label: string
    overrideHours: number | null
}
/** Payload mở editor override duy nhất cho pane workload. */
export type WorkloadOverrideEditSnapshot = {
    projectId: string
    userId: string
    canEditAll: boolean
    choices: WorkloadOverrideChoiceSnapshot[]
    /** Ngày chọn mặc định (ưu tiên ngày làm việc đầu trong bucket). */
    initialIso: string
}
/** Task đã lên lịch trên Gantt — đếm Tasks theo trùng plan với **ngày trong tuần** trong bucket (không T7/CN). */
export type WorkloadGanttScheduledTaskRef = {
    id: string
    projectId: string | null
    assigneeUserId: string | null
    planStartDate: string
    planEndDate: string
}
/** Kết quả gộp bucket — tiền tính để tránh gọi aggregate trong từng ô. */
export type WorkloadBucketAgg = {
    hours: number
    tasks: number
    workingDays: number
    isFullyNonWorking: boolean
    hasOverride: boolean
}