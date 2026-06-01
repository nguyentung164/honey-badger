'use client'

import { RefreshCw, Sparkles, Trash2, UserRound, Users, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AiUsageUsersListDialog } from '@/components/dialogs/app/AiUsageUsersListDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { formatDateByLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
type Summary = Awaited<ReturnType<typeof window.api.aiUsage.getSummary>>

type Currency = 'USD' | 'VND' | 'JPY'

const KPI_CARD_FRAME = 'flex flex-col gap-0 rounded-md border-0 py-0 shadow-none'

const CHART_SHELL = 'rounded-md border-0 bg-card/40 p-4 shadow-none'

function formatMoneyDisplay(n: number, currency: Currency): string {
  if (currency === 'VND') {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n)
  }
  if (currency === 'JPY') {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n)
}

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

export interface AiUsageStatsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin?: boolean
  currentUserId?: string
  currentUserName?: string
}

export function AiUsageStatsDialog({ open, onOpenChange, isAdmin = false, currentUserId, currentUserName }: AiUsageStatsDialogProps) {
  const { t, i18n } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [fxLoading, setFxLoading] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [usersListOpen, setUsersListOpen] = useState(false)
  const [viewUserId, setViewUserId] = useState<string | undefined>(undefined)
  const [viewUserName, setViewUserName] = useState<string | undefined>(undefined)
  const wasOpenRef = useRef(false)
  /** Optimistic currency while saving / reloading (Popover is portaled outside Dialog; also avoids lag before load()). */
  const [currencyOverride, setCurrencyOverride] = useState<Currency | null>(null)

  const fetchSummary = useCallback(async (userId: string, userName?: string, opts?: { displayCurrencyAfterSave?: Currency }) => {
    setSummary(null)
    setLoading(true)
    try {
      const s = await window.api.aiUsage.getSummary({ userId, userName })
      if (s && opts?.displayCurrencyAfterSave) {
        setSummary({ ...s, displayCurrency: opts.displayCurrencyAfterSave })
      } else {
        setSummary(s)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      setCurrencyOverride(null)
      setUsersListOpen(false)
      setViewUserId(undefined)
      setViewUserName(undefined)
      setSummary(null)
      return
    }
    if (!wasOpenRef.current && currentUserId) {
      wasOpenRef.current = true
      setViewUserId(currentUserId)
      setViewUserName(currentUserName)
      void fetchSummary(currentUserId, currentUserName)
    }
  }, [open, currentUserId, currentUserName, fetchSummary])

  const handleSelectUser = useCallback(
    (userId: string, userName: string) => {
      setViewUserId(userId)
      setViewUserName(userName)
      void fetchSummary(userId, userName)
    },
    [fetchSummary]
  )

  const currency: Currency = currencyOverride ?? summary?.displayCurrency ?? 'USD'
  const viewingOtherUser = Boolean(isAdmin && currentUserId && viewUserId && viewUserId !== currentUserId)
  const displayUserName = viewUserName ?? summary?.userName ?? currentUserName

  const resetToCurrentUser = () => {
    if (!currentUserId) return
    setViewUserId(currentUserId)
    setViewUserName(currentUserName)
    void fetchSummary(currentUserId, currentUserName)
  }

  const reload = () => {
    if (!viewUserId) return
    void fetchSummary(viewUserId, viewUserName)
  }
  const fx = summary?.fx ?? { usdToVnd: null, usdToJpy: null, updatedAt: null }
  const dbAvailable = summary?.dbAvailable ?? true

  const chartConfig = useMemo(
    () => ({
      cost: { label: t('aiUsage.cost'), color: 'var(--chart-1)' },
    }),
    [t]
  )

  const currencyOptions = useMemo(
    () => [
      { value: 'USD', label: t('aiUsage.currencyUSD') },
      { value: 'VND', label: t('aiUsage.currencyVND') },
      { value: 'JPY', label: t('aiUsage.currencyJPY') },
    ],
    [t]
  )

  const chartData = useMemo(() => {
    if (!summary?.byFeature?.length) return []
    return summary.byFeature.map((row: { costUsd: any; feature: any }, i: number) => {
      const usd = row.costUsd
      let display = 0
      if (usd != null) {
        if (currency === 'USD') display = usd
        else if (currency === 'VND' && fx.usdToVnd != null) display = usd * fx.usdToVnd
        else if (currency === 'JPY' && fx.usdToJpy != null) display = usd * fx.usdToJpy
      }
      return {
        name: t(`aiUsage.featureLabels.${row.feature}`, { defaultValue: row.feature }),
        cost: display,
        hasCost: usd != null,
        fill: `var(--chart-${(i % 5) + 1})`,
      }
    })
  }, [summary, currency, fx.usdToJpy, fx.usdToVnd, t])

  const chartTooltipFormatter = useCallback(
    (value: unknown, _name: string | number, item: { color?: string }) => {
      const n = value != null && typeof value === 'number' ? value : 0
      const formatted = formatMoneyDisplay(n, currency)
      return (
        <>
          <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item?.color ?? 'var(--chart-1)' }} />
          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
            <span className="text-muted-foreground">{t('aiUsage.cost')}</span>
            <span className="font-mono font-medium text-foreground tabular-nums">{formatted}</span>
          </div>
        </>
      )
    },
    [currency, fx, t]
  )

  const onCurrencyChange = async (v: Currency) => {
    setCurrencyOverride(v)
    const res = await window.api.aiUsage.setDisplayCurrency(v)
    if (!res.ok) {
      setCurrencyOverride(null)
      toast.error('error' in res && res.error ? res.error : t('aiUsage.error'))
      return
    }
    if (!viewUserId) return
    await fetchSummary(viewUserId, viewUserName, { displayCurrencyAfterSave: v })
    setCurrencyOverride(null)
  }

  const onRefreshFx = async () => {
    setFxLoading(true)
    try {
      const res = await window.api.aiUsage.fetchExchangeRates()
      if (res.ok) {
        toast.success(t('aiUsage.fxUpdated'))
        if (viewUserId) await fetchSummary(viewUserId, viewUserName)
      } else {
        toast.error(res.error ?? t('aiUsage.fxError'))
      }
    } finally {
      setFxLoading(false)
    }
  }

  const onClear = async () => {
    const res = await window.api.aiUsage.clear({ userId: viewUserId })
    if (!res.ok) {
      toast.error(t('aiUsage.clearFailed'))
      return
    }
    setClearOpen(false)
    if (viewUserId) await fetchSummary(viewUserId, viewUserName)
    toast.success(t('aiUsage.cleared'))
  }

  const needsFx = currency !== 'USD' && (currency === 'VND' ? fx.usdToVnd == null : fx.usdToJpy == null)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className={cn('flex max-h-[90vh] max-w-4xl! flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl')}
          onInteractOutside={e => {
            const t = e.target
            if (t instanceof Element && t.closest('[data-slot="popover-content"]')) {
              e.preventDefault()
            }
          }}
        >
          <DialogHeader className="flex shrink-0 flex-row items-center gap-1.5 space-y-0 border-b px-3 py-2 text-left sm:text-left">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
            <DialogTitle className="shrink-0 text-sm font-semibold leading-none">{t('aiUsage.title')}</DialogTitle>
            {isAdmin && displayUserName ? (
              <>
                <span className="shrink-0 text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <span className="min-w-0 max-w-[9rem] truncate text-xs font-normal text-muted-foreground" title={displayUserName}>
                  {displayUserName}
                </span>
              </>
            ) : null}
            {viewingOtherUser ? (
              <Button
                type="button"
                variant={buttonVariant}
                size="icon"
                className="h-7 w-7 shrink-0"
                title={t('aiUsage.backToMeTitle')}
                onClick={resetToCurrentUser}
              >
                <UserRound className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {isAdmin ? (
              <Button
                type="button"
                variant={buttonVariant}
                size="icon"
                className="h-7 w-7 shrink-0"
                title={t('aiUsage.browseUsersTitle')}
                onClick={() => setUsersListOpen(true)}
              >
                <Users className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <div className="min-w-2 flex-1" />
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

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{t('aiUsage.disclaimer')}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{t('aiUsage.displayCurrency')}</span>
            <Combobox
              value={currency}
              onValueChange={v => void onCurrencyChange(v as Currency)}
              options={currencyOptions}
              placeholder={t('aiUsage.currencyPlaceholder')}
              searchPlaceholder={t('common.search')}
              emptyText={t('common.noData')}
              disabled={!dbAvailable}
              size="sm"
              className="w-[min(100%,11rem)]"
              triggerClassName="h-8 text-xs"
              contentClassName="z-[110]"
            />
            <Button
              type="button"
              variant={buttonVariant}
              size="sm"
              className="h-8 gap-1"
              disabled={fxLoading || !dbAvailable}
              onClick={() => void onRefreshFx()}
              title={t('aiUsage.refreshFxTitle')}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', fxLoading && 'animate-spin')} />
              {t('aiUsage.refreshFx')}
            </Button>
            {fx.updatedAt != null && (
              <span className="text-[11px] text-muted-foreground">
                {t('aiUsage.fxAsOf', {
                  date: formatDateByLocale(new Date(fx.updatedAt), i18n.language),
                })}
              </span>
            )}
            <div className="flex-1" />
            <Button type="button" variant={buttonVariant} size="sm" className="h-8 text-destructive" disabled={!dbAvailable} onClick={() => setClearOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {t('aiUsage.clear')}
            </Button>
            <Button type="button" variant={buttonVariant} size="sm" className="h-8" disabled={loading} onClick={() => reload()}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>

          {needsFx && dbAvailable && <p className="text-xs text-amber-600 dark:text-amber-400">{t('aiUsage.needFxHint')}</p>}

          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : summary && !summary.dbAvailable ? (
            <div className="rounded-md border-0 bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground shadow-none">{t('aiUsage.dbNotConfigured')}</div>
          ) : summary && summary.totals.calls === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('aiUsage.empty')}</div>
          ) : summary ? (
            <>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
                <Card className={cn(KPI_CARD_FRAME, 'bg-card/40')}>
                  <CardHeader className="gap-0 px-3 py-2 pb-0">
                    <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('aiUsage.totalCalls')}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-2 pt-0">
                    <span className="text-base font-semibold tabular-nums leading-none">{summary.totals.calls}</span>
                  </CardContent>
                </Card>
                <Card className={cn(KPI_CARD_FRAME, 'bg-card/40')}>
                  <CardHeader className="gap-0 px-3 py-2 pb-0">
                    <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('aiUsage.totalInputTokens')}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-2 pt-0">
                    <span className="font-mono text-base font-semibold tabular-nums leading-none">{summary.totals.inputTokens.toLocaleString()}</span>
                  </CardContent>
                </Card>
                <Card className={cn(KPI_CARD_FRAME, 'bg-card/40')}>
                  <CardHeader className="gap-0 px-3 py-2 pb-0">
                    <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('aiUsage.totalOutputTokens')}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-2 pt-0">
                    <span className="font-mono text-base font-semibold tabular-nums leading-none">{summary.totals.outputTokens.toLocaleString()}</span>
                  </CardContent>
                </Card>
                <Card className={cn(KPI_CARD_FRAME, 'bg-card/40')}>
                  <CardHeader className="gap-0 px-3 py-2 pb-0">
                    <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('aiUsage.totalCost')}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-2 pt-0">
                    <span className="font-mono text-base font-semibold tabular-nums leading-none">{formatMoney(summary.totals.costUsd, currency, fx)}</span>
                  </CardContent>
                </Card>
              </div>

              {chartData.some((d: { hasCost: any; cost: any }) => d.hasCost && d.cost > 0) && (
                <div className={cn(CHART_SHELL, 'flex min-h-0 flex-col')}>
                  <h3 className="mb-3 shrink-0 text-sm font-medium">{t('aiUsage.chartTitle')}</h3>
                  <ChartContainer
                    config={chartConfig}
                    rechartsHeight={240}
                    className="aspect-auto mx-auto w-full justify-start p-0 [&_.recharts-responsive-container]:min-h-[240px]"
                  >
                    <BarChart accessibilityLayer data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} interval={0} />
                      <YAxis width={44} tick={{ fontSize: 10 }} />
                      <ChartTooltip content={<ChartTooltipContent formatter={chartTooltipFormatter} labelClassName="text-foreground" />} />
                      <Bar dataKey="cost" radius={4} name={t('aiUsage.cost')} maxBarSize={52}>
                        {chartData.map((entry: { fill: any }, i: number) => (
                          <Cell key={`cell-${i}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </div>
              )}

              <div className={cn('overflow-x-auto rounded-md border-0 bg-card/40 p-3 shadow-none')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t('aiUsage.colFeature')}</TableHead>
                      <TableHead className="text-xs">{t('aiUsage.colProvider')}</TableHead>
                      <TableHead className="text-xs">{t('aiUsage.colModel')}</TableHead>
                      <TableHead className="text-xs text-right">{t('aiUsage.colCalls')}</TableHead>
                      <TableHead className="text-xs text-right">{t('aiUsage.colInTok')}</TableHead>
                      <TableHead className="text-xs text-right">{t('aiUsage.colOutTok')}</TableHead>
                      <TableHead className="text-xs text-right">{t('aiUsage.colCost')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(summary.byDetail ?? []).map(
                      (row: {
                        feature: string
                        provider: string
                        model: string
                        unknownPricingCalls: number
                        calls: number
                        inputTokens: number
                        outputTokens: number
                        costUsd: number | null
                      }) => (
                        <TableRow key={`${row.feature}\0${row.provider}\0${row.model}`}>
                          <TableCell className="text-xs font-medium">
                            {t(`aiUsage.featureLabels.${row.feature}`, { defaultValue: row.feature })}
                            {row.unknownPricingCalls > 0 && <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">({t('aiUsage.partialPricing')})</span>}
                          </TableCell>
                          <TableCell className="max-w-[7rem] truncate text-xs" title={t(`aiUsage.providerLabels.${row.provider}`, { defaultValue: row.provider })}>
                            {t(`aiUsage.providerLabels.${row.provider}`, { defaultValue: row.provider })}
                          </TableCell>
                          <TableCell className="max-w-[10rem] truncate font-mono text-xs" title={row.model}>
                            {row.model}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{row.calls}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{row.inputTokens.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{row.outputTokens.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{formatMoney(row.costUsd, currency, fx)}</TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {isAdmin ? (
        <AiUsageUsersListDialog
          open={usersListOpen}
          onOpenChange={setUsersListOpen}
          currency={currency}
          fx={fx}
          onSelectUser={handleSelectUser}
        />
      ) : null}

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('aiUsage.clearConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('aiUsage.clearConfirmDescription', { userName: displayUserName ?? '—' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant={buttonVariant}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant={buttonVariant} onClick={() => void onClear()}>
              {t('aiUsage.clear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
