'use client'

import { addDays, addWeeks, eachDayOfInterval, format, getDay, isBefore, isValid, startOfDay, startOfWeek, subDays } from 'date-fns'
import Holidays from 'date-holidays'
import type { TFunction } from 'i18next'
import { useLayoutEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarBody,
  CalendarDate,
  CalendarDatePagination,
  CalendarHeader,
  CalendarItem,
  CalendarMonthPicker,
  CalendarProvider,
  type CalendarState,
  CalendarYearPicker,
  type Feature,
  useCalendarMonth,
  useCalendarYear,
} from '@/components/kibo-ui/calendar'
import { CountryFlag } from '@/components/kibo-ui/calendar/flag-icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import logger from '@/services/logger'

const HOLIDAY_STATUS_JP = { id: 'jp', color: '#dc2626', countryCode: 'jp' as const }
const HOLIDAY_STATUS_VN = { id: 'vn', color: '#2563eb', countryCode: 'vn' as const }

type HolidayFeatureStatus = Feature['status']

function holidayStatusesForT(t: TFunction): { jp: HolidayFeatureStatus; vn: HolidayFeatureStatus } {
  return {
    jp: { ...HOLIDAY_STATUS_JP, name: t('title.holidayCalendarCountryJp') },
    vn: { ...HOLIDAY_STATUS_VN, name: t('title.holidayCalendarCountryVn') },
  }
}

const jpHd = new Holidays('JP')
const vnHd = new Holidays('VN')

function holidayNameLang(i18nLang: string): string {
  const base = i18nLang.split('-')[0]?.toLowerCase() ?? 'en'
  if (base === 'vi') return 'vi'
  if (base === 'ja') return 'ja'
  return 'en'
}

/** `dayKey|rule` → localized holiday name from date-holidays. */
function jpHolidayNameByDayRule(year: number, lang: string): Map<string, string> {
  const map = new Map<string, string>()
  const list = jpHd.getHolidays(year, lang) ?? []
  for (const h of list) {
    if (h.start == null || h.end == null) continue
    const s = startOfDay(h.start)
    const endExclusive = startOfDay(h.end)
    let endInclusive = subDays(endExclusive, 1)
    if (isBefore(endInclusive, s)) endInclusive = s
    if (!isValid(s) || !isValid(endInclusive)) continue
    let days: Date[]
    try {
      days = eachDayOfInterval({ start: s, end: endInclusive })
    } catch {
      continue
    }
    const ruleKey = h.rule ?? h.name
    for (const day of days) {
      const dayKey = format(day, 'yyyy-MM-dd')
      map.set(`${dayKey}|${ruleKey}`, h.name)
    }
  }
  return map
}

const VI_DIACRITICS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

function looksLikeVietnamese(s: string): boolean {
  return VI_DIACRITICS.test(s)
}

/**
 * date-holidays `vi` for Japan often repeats Japanese; when so, show English so the tooltip still explains the day.
 * Prefer a real Vietnamese string; if UI is Vietnamese but the primary label is still Japanese, fall back to English.
 */
function computeJpTooltipSubtitle(primary: string, viName: string | undefined, enName: string | undefined, nameLang: string): string | undefined {
  if (viName && viName !== primary && looksLikeVietnamese(viName)) return viName
  if (nameLang === 'vi') {
    if (looksLikeVietnamese(primary)) return undefined
    return enName && enName !== primary ? enName : undefined
  }
  if (enName && enName !== primary) return enName
  return undefined
}

function isVnLegalDayOff(h: { type?: string }): boolean {
  return h.type !== 'observance'
}

/** Monday of the calendar week after the week containing `d` (weeks start Monday). */
function mondayOfWeekAfter(d: Date): Date {
  const mondayThisWeek = startOfWeek(d, { weekStartsOn: 1 })
  return addWeeks(mondayThisWeek, 1)
}

function firstFreeWeekdayFrom(from: Date, publicOffDayKeys: Set<string>, usedCompensatory: Set<string>): Date | null {
  let cur = startOfDay(from)
  for (let i = 0; i < 45; i++) {
    const wd = getDay(cur)
    const dayKey = format(cur, 'yyyy-MM-dd')
    const isWeekend = wd === 0 || wd === 6
    if (!isWeekend && !publicOffDayKeys.has(dayKey) && !usedCompensatory.has(dayKey)) return cur
    cur = addDays(cur, 1)
  }
  return null
}

type VnHolidayDay = { day: Date; name: string; ruleKey: string }

function collectVnPublicHolidayDays(years: number[], nameLang: string): { publicOffDayKeys: Set<string>; weekendHolidayDays: VnHolidayDay[] } {
  const publicOffDayKeys = new Set<string>()
  const weekendHolidayDays: VnHolidayDay[] = []

  for (const y of years) {
    for (const h of vnHd.getHolidays(y, nameLang) ?? []) {
      if (!isVnLegalDayOff(h)) continue
      if (h.start == null || h.end == null) continue
      const s = startOfDay(h.start)
      const endExclusive = startOfDay(h.end)
      let endInclusive = subDays(endExclusive, 1)
      if (isBefore(endInclusive, s)) endInclusive = s
      if (!isValid(s) || !isValid(endInclusive)) continue
      let days: Date[]
      try {
        days = eachDayOfInterval({ start: s, end: endInclusive })
      } catch {
        continue
      }
      const ruleKey = h.rule ?? h.name
      for (const day of days) {
        const dayKey = format(day, 'yyyy-MM-dd')
        publicOffDayKeys.add(dayKey)
        const wd = getDay(day)
        if (wd === 0 || wd === 6) weekendHolidayDays.push({ day, name: h.name, ruleKey })
      }
    }
  }

  weekendHolidayDays.sort((a, b) => a.day.getTime() - b.day.getTime())
  return { publicOffDayKeys, weekendHolidayDays }
}

function buildVnCompensatoryFeatures(
  displayYear: number,
  nameLang: string,
  status: HolidayFeatureStatus,
  t: TFunction,
): Feature[] {
  const years = [displayYear - 1, displayYear, displayYear + 1]
  const { publicOffDayKeys, weekendHolidayDays } = collectVnPublicHolidayDays(years, nameLang)
  const usedCompensatory = new Set<string>()
  const out: Feature[] = []
  const seenWeekendDay = new Set<string>()

  for (const { day, name, ruleKey } of weekendHolidayDays) {
    const weekendKey = format(day, 'yyyy-MM-dd')
    if (seenWeekendDay.has(weekendKey)) continue
    seenWeekendDay.add(weekendKey)
    const fromMonday = mondayOfWeekAfter(day)
    const comp = firstFreeWeekdayFrom(fromMonday, publicOffDayKeys, usedCompensatory)
    if (comp == null) continue
    const compKey = format(comp, 'yyyy-MM-dd')
    usedCompensatory.add(compKey)
    if (comp.getFullYear() !== displayYear) continue
    const origKey = format(day, 'yyyy-MM-dd')
    out.push({
      id: `vn-bu-${compKey}-${origKey}-${ruleKey}`,
      name: t('title.holidayCalendarVnCompensatoryName', { name }),
      startAt: comp,
      endAt: comp,
      status,
    })
  }

  return out
}

function buildHolidayFeatures(
  year: number,
  nameLang: string,
  statuses: { jp: HolidayFeatureStatus; vn: HolidayFeatureStatus },
  t: TFunction,
): Feature[] {
  try {
    const out: Feature[] = []
    const jpViByDayRule = jpHolidayNameByDayRule(year, 'vi')
    const jpEnByDayRule = jpHolidayNameByDayRule(year, 'en')

    const addList = (list: ReturnType<typeof jpHd.getHolidays>, status: HolidayFeatureStatus) => {
      for (const h of list) {
        if (h.start == null || h.end == null) continue
        const s = startOfDay(h.start)
        // date-holidays uses a half-open range [start, end): end is midnight on the day after the last holiday day.
        // eachDayOfInterval is inclusive on both ends, so we must not include that trailing day.
        const endExclusive = startOfDay(h.end)
        let endInclusive = subDays(endExclusive, 1)
        if (isBefore(endInclusive, s)) endInclusive = s
        if (!isValid(s) || !isValid(endInclusive)) continue
        let days: Date[]
        try {
          days = eachDayOfInterval({ start: s, end: endInclusive })
        } catch {
          continue
        }
        const ruleKey = h.rule ?? h.name
        for (const day of days) {
          const dayKey = format(day, 'yyyy-MM-dd')
          const mapKey = `${dayKey}|${ruleKey}`
          const viName = status.countryCode === 'jp' ? jpViByDayRule.get(mapKey) : undefined
          const enName = status.countryCode === 'jp' ? jpEnByDayRule.get(mapKey) : undefined
          const jpTooltipSubtitle =
            status.countryCode === 'jp' ? computeJpTooltipSubtitle(h.name, viName, enName, nameLang) : undefined
          out.push({
            id: `${status.id}-${dayKey}-${ruleKey}`,
            name: h.name,
            ...(jpTooltipSubtitle != null && jpTooltipSubtitle !== '' ? { jpTooltipSubtitle } : {}),
            startAt: day,
            endAt: day,
            status,
          })
        }
      }
    }

    const jpList = jpHd.getHolidays(year, nameLang) ?? []
    const vnList = vnHd.getHolidays(year, nameLang) ?? []
    addList(jpList, statuses.jp)
    addList(vnList, statuses.vn)
    out.push(...buildVnCompensatoryFeatures(year, nameLang, statuses.vn, t))
    return out
  } catch (e) {
    logger.error('buildHolidayFeatures failed', e)
    return []
  }
}

function ResetCalendarOnOpen({ open }: { open: boolean }) {
  const [, setMonth] = useCalendarMonth()
  const [, setYear] = useCalendarYear()
  useLayoutEffect(() => {
    if (!open) return
    const d = new Date()
    setMonth(d.getMonth() as CalendarState['month'])
    setYear(d.getFullYear())
  }, [open, setMonth, setYear])
  return null
}

function HolidayCalendarInner({ nameLang }: { nameLang: string }) {
  const { t } = useTranslation()
  const [year] = useCalendarYear()
  const statuses = useMemo(() => holidayStatusesForT(t), [t])
  const features = useMemo(() => buildHolidayFeatures(year, nameLang, statuses, t), [year, nameLang, statuses, t])
  const y0 = new Date().getFullYear()

  return (
    <>
      <CalendarDate>
        <CalendarDatePagination />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CalendarMonthPicker />
          <CalendarYearPicker end={y0 + 6} start={y0 - 6} />
        </div>
      </CalendarDate>
      <CalendarHeader />
      <CalendarBody features={features}>{({ feature }) => <CalendarItem feature={feature} />}</CalendarBody>
    </>
  )
}

export interface HolidayCalendarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HolidayCalendarDialog({ open, onOpenChange }: HolidayCalendarDialogProps) {
  const { t, i18n } = useTranslation()
  const nameLang = holidayNameLang(i18n.language)

  const calendarLocale: Intl.LocalesArgument = i18n.language?.toLowerCase().startsWith('vi') ? 'vi-VN' : i18n.language?.toLowerCase().startsWith('ja') ? 'ja-JP' : 'en-US'

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent overlayClassName="z-[100]" className="z-[101] max-h-[90vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title.holidayCalendar')}</DialogTitle>
        </DialogHeader>
        <ResetCalendarOnOpen open={open} />
        <CalendarProvider className="min-h-[380px] rounded-md border bg-card" density="compact" locale={calendarLocale} showLunar startDay={0}>
          <HolidayCalendarInner nameLang={nameLang} />
        </CalendarProvider>
        <div className="flex flex-wrap gap-4 border-t pt-3 text-muted-foreground text-xs">
          <span className="flex items-center gap-2">
            <CountryFlag className="h-3.5 w-[21px]" code="jp" />
            {t('title.holidayCalendarLegendJp')}
          </span>
          <span className="flex items-center gap-2">
            <CountryFlag className="h-3.5 w-[21px]" code="vn" />
            {t('title.holidayCalendarLegendVn')}
          </span>
          <span>{t('title.holidayCalendarLegendLunar')}</span>
          <span className="basis-full sm:basis-auto">{t('title.holidayCalendarLegendVnCompensatory')}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
