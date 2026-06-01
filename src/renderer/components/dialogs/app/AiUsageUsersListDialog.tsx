'use client'

import { Users, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
type UsersSummaryRow = {
  userId: string
  userName: string
  calls: number
  inputTokens: number
  outputTokens: number
  costUsd: number | null
}

type Currency = 'USD' | 'VND' | 'JPY'

function formatMoney(amount: number | null, currency: Currency, fx: { usdToVnd: number | null; usdToJpy: number | null }): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  let value = amount
  if (currency === 'VND') {
    if (fx.usdToVnd == null) return '—'
    value = amount * fx.usdToVnd
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
  }
  if (currency === 'JPY') {
    if (fx.usdToJpy == null) return '—'
    value = amount * fx.usdToJpy
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value)
}

export interface AiUsageUsersListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: Currency
  fx: { usdToVnd: number | null; usdToJpy: number | null }
  onSelectUser: (userId: string, userName: string) => void
}

export function AiUsageUsersListDialog({ open, onOpenChange, currency, fx, onSelectUser }: AiUsageUsersListDialogProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<UsersSummaryRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.aiUsage.getUsersSummary()
      if (!res.ok) {
        toast.error(t('aiUsage.usersListForbidden'))
        setRows([])
        return
      }
      setRows(res.rows ?? [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const rowLabel = (row: UsersSummaryRow) => row.userName?.trim() || '—'

  const handleSelect = (row: UsersSummaryRow) => {
    onSelectUser(row.userId, rowLabel(row))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="z-[110] flex max-h-[80vh] max-w-3xl! flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="flex shrink-0 flex-row items-center gap-1.5 space-y-0 border-b px-3 py-2 text-left sm:text-left">
          <Users className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
          <DialogTitle className="min-w-0 flex-1 text-sm font-semibold leading-none">{t('aiUsage.usersListTitle')}</DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t('common.close')}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('common.noData')}</div>
          ) : (
            <div className="overflow-x-auto rounded-md border-0 bg-card/40 p-2 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t('aiUsage.colUserName')}</TableHead>
                    <TableHead className="text-xs text-right">{t('aiUsage.colCalls')}</TableHead>
                    <TableHead className="text-xs text-right">{t('aiUsage.colInTok')}</TableHead>
                    <TableHead className="text-xs text-right">{t('aiUsage.colOutTok')}</TableHead>
                    <TableHead className="text-xs text-right">{t('aiUsage.totalCost')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => {
                    const label = rowLabel(row)
                    const key = row.userId
                    return (
                      <TableRow
                        key={key}
                        tabIndex={0}
                        role="button"
                        className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => handleSelect(row)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleSelect(row)
                          }
                        }}
                      >
                        <TableCell className="text-xs font-medium">{label}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{row.calls}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{row.inputTokens.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{row.outputTokens.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatMoney(row.costUsd, currency, fx)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
