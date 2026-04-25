'use client'

import { Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ACRow, EVMMaster } from 'shared/types/evm'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay, toYyyyMmDd } from '@/lib/dateUtils'
import { EVM_PERCENT_DONE_OPTIONS_DEFAULT, evmAssigneeDisplayName } from '@/lib/evmCalculations'
import i18n from '@/lib/i18n'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'

function ymdForDateInput(raw: string | undefined): string {
  if (!raw?.trim()) return ''
  return toYyyyMmDd(raw.trim()) ?? raw.trim().slice(0, 10)
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

function AcRowEdit({
  row,
  master,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  row: ACRow
  master: EVMMaster
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (updates: Omit<Partial<ACRow>, 'percentDone'> & { percentDone?: number | null }) => Promise<void>
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [actualStartDate, setActualStartDate] = useState(row.actualStartDate ?? '')
  const [actualEndDate, setActualEndDate] = useState(row.actualEndDate ?? '')
  const [pct, setPct] = useState(row.percentDone != null ? String(row.percentDone) : '')

  const pctOptions = master.percentDoneOptions ?? EVM_PERCENT_DONE_OPTIONS_DEFAULT

  useEffect(() => {
    if (!editing) return
    setActualStartDate(row.actualStartDate ?? '')
    setActualEndDate(row.actualEndDate ?? '')
    setPct(row.percentDone != null ? String(row.percentDone) : '')
  }, [editing, row.id, row.actualStartDate, row.actualEndDate, row.percentDone])

  const handleSave = () => {
    const ph = pct.trim()
    const payload: Omit<Partial<ACRow>, 'percentDone'> & { percentDone?: number | null } = {
      actualStartDate: actualStartDate || undefined,
      actualEndDate: actualEndDate || undefined,
    }
    if (ph === '') payload.percentDone = null
    else {
      const n = Number(ph)
      if (Number.isFinite(n)) payload.percentDone = Math.min(1, Math.max(0, n))
    }
    void onSave(payload)
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell className="font-mono">{row.no}</TableCell>
        <TableCell>{formatDateDisplay(row.date, i18n.language)}</TableCell>
        <TableCell>{row.phase ?? '—'}</TableCell>
        <TableCell>{row.category?.trim() ? row.category : '—'}</TableCell>
        <TableCell>{row.feature?.trim() ? row.feature : '—'}</TableCell>
        <TableCell>{row.task?.trim() ? row.task : row.workContents?.trim() ? row.workContents : '—'}</TableCell>
        <TableCell>{formatDateDisplay(row.planStartDate, i18n.language)}</TableCell>
        <TableCell>{formatDateDisplay(row.planEndDate, i18n.language)}</TableCell>
        <TableCell>
          <Input type="date" value={ymdForDateInput(actualStartDate)} onChange={e => setActualStartDate(e.target.value)} className="h-8 w-32" />
        </TableCell>
        <TableCell>
          <Input type="date" value={ymdForDateInput(actualEndDate)} onChange={e => setActualEndDate(e.target.value)} className="h-8 w-32" />
        </TableCell>
        <TableCell>
          <Combobox
            value={pct === '' ? '__empty__' : pct}
            onValueChange={v => setPct(v === '__empty__' ? '' : v)}
            options={[
              { value: '__empty__', label: '—' },
              ...pctOptions.map((p: number) => ({ value: String(p), label: `${(p * 100).toFixed(0)}%` })),
            ]}
            size="sm"
          />
        </TableCell>
        <TableCell>{evmAssigneeDisplayName(master, row.assignee, null)}</TableCell>
        <TableCell className="text-right font-mono tabular-nums">{(row.workingHours ?? 0).toFixed(2)}</TableCell>
        <TableCell className="max-w-[180px] truncate text-muted-foreground text-sm">{row.workContents ?? '—'}</TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button variant={buttonVariant} size="sm" className="h-7" onClick={() => void handleSave()}>
              {t('common.save')}
            </Button>
            <Button variant={buttonVariant} size="sm" className="h-7" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  const pctLabel =
    row.percentDone != null && Number.isFinite(row.percentDone) ? `${(row.percentDone * 100).toFixed(0)}%` : '—'

  return (
    <TableRow>
      <TableCell className="font-mono">{row.no}</TableCell>
      <TableCell>{formatDateDisplay(row.date, i18n.language)}</TableCell>
      <TableCell>{row.phase ?? '—'}</TableCell>
      <TableCell>{row.category?.trim() ? row.category : '—'}</TableCell>
      <TableCell>{row.feature?.trim() ? row.feature : '—'}</TableCell>
      <TableCell>{row.task?.trim() ? row.task : row.workContents?.trim() ? row.workContents : '—'}</TableCell>
      <TableCell>{formatDateDisplay(row.planStartDate, i18n.language)}</TableCell>
      <TableCell>{formatDateDisplay(row.planEndDate, i18n.language)}</TableCell>
      <TableCell>{formatDateDisplay(row.actualStartDate, i18n.language)}</TableCell>
      <TableCell>{formatDateDisplay(row.actualEndDate, i18n.language)}</TableCell>
      <TableCell>{pctLabel}</TableCell>
      <TableCell>{evmAssigneeDisplayName(master, row.assignee, null)}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">{(row.workingHours ?? 0).toFixed(2)}</TableCell>
      <TableCell className="max-w-[180px] truncate text-muted-foreground text-sm">{row.workContents ?? '—'}</TableCell>
      <TableCell>
        <Button type="button" variant={buttonVariant} size="icon" className="h-7 w-7" aria-label={t('common.edit')} onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function AcLedgerTable() {
  const { t } = useTranslation()
  const ac = useEVMStore(s => s.ac)
  const master = useEVMStore(s => s.master)
  const updateAcRow = useEVMStore(s => s.updateAcRow)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [editingId, setEditingId] = useState<string | null>(null)

  const sorted = useMemo(() => [...ac].sort((a, b) => a.no - b.no), [ac])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [ac.length])

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{t('evm.acLedgerTitle')}</h3>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/40">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Table className="w-max min-w-full text-sm">
            <TableHeader sticky>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">{t('evm.tableNo')}</TableHead>
                <TableHead className="w-28">{t('evm.acReportDate')}</TableHead>
                <TableHead className="w-24">{t('evm.tablePhase')}</TableHead>
                <TableHead className="w-24">{t('evm.tableCategory')}</TableHead>
                <TableHead className="w-24">{t('evm.tableFeature')}</TableHead>
                <TableHead className="min-w-[100px]">{t('evm.acColTask')}</TableHead>
                <TableHead className="w-28">{t('evm.planStart')}</TableHead>
                <TableHead className="w-28">{t('evm.planEnd')}</TableHead>
                <TableHead className="w-28">{t('evm.actualStart')}</TableHead>
                <TableHead className="w-28">{t('evm.actualEnd')}</TableHead>
                <TableHead className="w-16">{t('evm.percentDone')}</TableHead>
                <TableHead className="w-24">{t('evm.tableAssignee')}</TableHead>
                <TableHead className="w-20 text-right">{t('evm.acWorkingHours')}</TableHead>
                <TableHead className="min-w-[120px]">{t('evm.acWorkContents')}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(row => (
                <AcRowEdit
                  key={editingId === row.id ? `${row.id}-edit` : row.id}
                  row={row}
                  master={master}
                  editing={editingId === row.id}
                  onEdit={() => setEditingId(row.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={async updates => {
                    try {
                      await updateAcRow(row.id, updates)
                      setEditingId(null)
                      toast.success(t('common.save'))
                    } catch {
                      toast.error(t('evm.saveFailed'))
                    }
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
        {sorted.length > 0 && (
          <TablePaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={sorted.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        )}
      </div>
    </div>
  )
}
