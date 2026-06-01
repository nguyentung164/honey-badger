'use client'

import { addDays, eachDayOfInterval, format, getDay, isBefore, isValid, startOfDay, subDays } from 'date-fns'
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

/** date-holidays JP timestamps are JST calendar days; normalize before placing on the grid. */
const JP_HOLIDAY_TZ = 'Asia/Tokyo'

function jpCalendarDate(d: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JP_HOLIDAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = Number(parts.find(p => p.type === 'year')?.value)
  const m = Number(parts.find(p => p.type === 'month')?.value)
  const day = Number(parts.find(p => p.type === 'day')?.value)
  return new Date(y, m - 1, day)
}

function expandJpHolidayInterval(h: { start?: Date; end?: Date }): Date[] | null {
  if (h.start == null || h.end == null) return null
  const s = jpCalendarDate(h.start)
  const endExclusive = jpCalendarDate(h.end)
  let endInclusive = subDays(endExclusive, 1)
  if (isBefore(endInclusive, s)) endInclusive = s
  if (!isValid(s) || !isValid(endInclusive)) return null
  try {
    return eachDayOfInterval({ start: s, end: endInclusive })
  } catch {
    return null
  }
}

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
    const days = expandJpHolidayInterval(h)
    if (days == null) continue
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

function isJpNationalPublicHoliday(h: { type?: string }): boolean {
  return h.type === 'public'
}

/** date-holidays substitute row (振替休日) — shown via compensatory builder, not the main list. */
function isJpSubstituteEntry(h: { name?: string; rule?: string }): boolean {
  const rule = (h.rule ?? '').toLowerCase()
  const name = (h.name ?? '').toLowerCase()
  return rule.includes('substitutes') || name.includes('substitute')
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

type HolidayDay = { day: Date; name: string; ruleKey: string }

function expandHolidayInterval(h: { start?: Date; end?: Date }): Date[] | null {
  if (h.start == null || h.end == null) return null
  const s = startOfDay(h.start)
  const endExclusive = startOfDay(h.end)
  let endInclusive = subDays(endExclusive, 1)
  if (isBefore(endInclusive, s)) endInclusive = s
  if (!isValid(s) || !isValid(endInclusive)) return null
  try {
    return eachDayOfInterval({ start: s, end: endInclusive })
  } catch {
    return null
  }
}

function collectVnPublicHolidayDays(years: number[], nameLang: string): { publicOffDayKeys: Set<string>; weekendHolidayDays: HolidayDay[] } {
  const publicOffDayKeys = new Set<string>()
  const weekendHolidayDays: HolidayDay[] = []

  for (const y of years) {
    for (const h of vnHd.getHolidays(y, nameLang) ?? []) {
      if (!isVnLegalDayOff(h)) continue
      const days = expandHolidayInterval(h)
      if (days == null) continue
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

/** Strip date-holidays substitute suffix so the compensatory label reads like the original holiday. */
function jpSubstituteBaseName(name: string): string {
  return name
    .replace(/\s*\(substitute day\)\s*$/i, '')
    .replace(/\s*（substitute day）\s*$/i, '')
    .replace(/\s*（振替休日）\s*$/i, '')
    .trim()
}

function buildJpCompensatoryFeatures(displayYear: number, nameLang: string, status: HolidayFeatureStatus, t: TFunction): Feature[] {
  const years = [displayYear - 1, displayYear, displayYear + 1]
  const out: Feature[] = []
  const seenCompDay = new Set<string>()

  for (const y of years) {
    for (const h of jpHd.getHolidays(y, nameLang) ?? []) {
      if (!isJpNationalPublicHoliday(h) || !isJpSubstituteEntry(h)) continue
      const days = expandJpHolidayInterval(h)
      if (days == null) continue
      const ruleKey = h.rule ?? h.name
      const baseName = jpSubstituteBaseName(h.name)
      for (const day of days) {
        const compKey = format(day, 'yyyy-MM-dd')
        if (seenCompDay.has(compKey)) continue
        seenCompDay.add(compKey)
        out.push({
          id: `jp-bu-${compKey}-${ruleKey}`,
          name: t('title.holidayCalendarJpCompensatoryName', { name: baseName }),
          startAt: day,
          endAt: day,
          status,
        })
      }
    }
  }

  return out
}

/** VN (Điều 111 BLĐ 2019): lễ trùng ngày nghỉ hằng tuần → nghỉ bù ngày làm việc kế tiếp. */
function buildCompensatoryFeatures(
  sourceDays: HolidayDay[],
  publicOffDayKeys: Set<string>,
  status: HolidayFeatureStatus,
  t: TFunction,
  idPrefix: string,
  nameKey: 'title.holidayCalendarVnCompensatoryName',
): Feature[] {
  const usedCompensatory = new Set<string>()
  const out: Feature[] = []
  const seenSourceDay = new Set<string>()

  for (const { day, name, ruleKey } of sourceDays) {
    const sourceKey = format(day, 'yyyy-MM-dd')
    if (seenSourceDay.has(sourceKey)) continue
    seenSourceDay.add(sourceKey)
    const comp = firstFreeWeekdayFrom(addDays(day, 1), publicOffDayKeys, usedCompensatory)
    if (comp == null) continue
    const compKey = format(comp, 'yyyy-MM-dd')
    usedCompensatory.add(compKey)
    out.push({
      id: `${idPrefix}-${compKey}-${sourceKey}-${ruleKey}`,
      name: t(nameKey, { name }),
      startAt: comp,
      endAt: comp,
      status,
    })
  }

  return out
}

function buildVnCompensatoryFeatures(displayYear: number, nameLang: string, status: HolidayFeatureStatus, t: TFunction): Feature[] {
  const years = [displayYear - 1, displayYear, displayYear + 1]
  const { publicOffDayKeys, weekendHolidayDays } = collectVnPublicHolidayDays(years, nameLang)
  return buildCompensatoryFeatures(weekendHolidayDays, publicOffDayKeys, status, t, 'vn-bu', 'title.holidayCalendarVnCompensatoryName')
}

function mergeJpHolidayNameMaps(years: number[], lang: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const y of years) {
    for (const [key, name] of jpHolidayNameByDayRule(y, lang)) map.set(key, name)
  }
  return map
}

function buildHolidayFeatures(year: number, nameLang: string, statuses: { jp: HolidayFeatureStatus; vn: HolidayFeatureStatus }, t: TFunction): Feature[] {
  try {
    const out: Feature[] = []
    const years = [year - 1, year, year + 1]
    const jpViByDayRule = mergeJpHolidayNameMaps(years, 'vi')
    const jpEnByDayRule = mergeJpHolidayNameMaps(years, 'en')

    const addList = (list: ReturnType<typeof jpHd.getHolidays>, status: HolidayFeatureStatus) => {
      for (const h of list) {
        if (status.countryCode === 'jp' && isJpSubstituteEntry(h)) continue
        if (h.start == null || h.end == null) continue
        const days = status.countryCode === 'jp' ? expandJpHolidayInterval(h) : expandHolidayInterval(h)
        if (days == null) continue
        const ruleKey = h.rule ?? h.name
        for (const day of days) {
          const dayKey = format(day, 'yyyy-MM-dd')
          const mapKey = `${dayKey}|${ruleKey}`
          const viName = status.countryCode === 'jp' ? jpViByDayRule.get(mapKey) : undefined
          const enName = status.countryCode === 'jp' ? jpEnByDayRule.get(mapKey) : undefined
          const jpTooltipSubtitle = status.countryCode === 'jp' ? computeJpTooltipSubtitle(h.name, viName, enName, nameLang) : undefined
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

    for (const y of years) {
      addList(jpHd.getHolidays(y, nameLang) ?? [], statuses.jp)
      addList(vnHd.getHolidays(y, nameLang) ?? [], statuses.vn)
    }
    out.push(...buildVnCompensatoryFeatures(year, nameLang, statuses.vn, t))
    out.push(...buildJpCompensatoryFeatures(year, nameLang, statuses.jp, t))
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
      <DialogContent overlayClassName="z-[100]" className="z-[101] max-h-[90vh]! max-w-4xl! overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title.holidayCalendar')}</DialogTitle>
        </DialogHeader>
        <ResetCalendarOnOpen open={open} />
        <CalendarProvider className="min-h-[450px] rounded-md border bg-card" density="compact" locale={calendarLocale} showLunar startDay={0}>
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
          <span className="basis-full sm:basis-auto">{t('title.holidayCalendarLegendJpCompensatory')}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
