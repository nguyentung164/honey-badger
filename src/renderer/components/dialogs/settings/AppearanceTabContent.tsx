'use client'

import { ALargeSmall, Languages, Palette, TypeOutline } from 'lucide-react'
import type { Theme } from 'main/store/AppearanceStore'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import { BUTTON_VARIANTS, FONT_FAMILIES, FONT_SIZES, LANGUAGES, THEMES } from '../../shared/constants'

export const AppearanceTabContent = memo(function AppearanceTabContent() {
  const { t } = useTranslation()
  const theme = useAppearanceStoreSelect(s => s.theme)
  const setTheme = useAppearanceStoreSelect(s => s.setTheme)
  const themeMode = useAppearanceStoreSelect(s => s.themeMode)
  const fontSize = useAppearanceStoreSelect(s => s.fontSize)
  const setFontSize = useAppearanceStoreSelect(s => s.setFontSize)
  const fontFamily = useAppearanceStoreSelect(s => s.fontFamily)
  const setFontFamily = useAppearanceStoreSelect(s => s.setFontFamily)
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const setButtonVariant = useAppearanceStoreSelect(s => s.setButtonVariant)
  const language = useAppearanceStoreSelect(s => s.language)
  const setLanguage = useAppearanceStoreSelect(s => s.setLanguage)
  const [isDarkMode, setIsDarkMode] = useState(themeMode === 'dark')
  useEffect(() => {
    setIsDarkMode(themeMode === 'dark')
  }, [themeMode])

  const handleDarkModeToggle = useCallback((checked: boolean) => {
    setIsDarkMode(checked)
    const html = document.documentElement
    html.classList.remove('dark', 'light')
    if (checked) {
      html.classList.add('dark')
      useAppearanceStoreSelect.getState().setThemeMode('dark')
    } else {
      html.classList.add('light')
      useAppearanceStoreSelect.getState().setThemeMode('light')
    }
  }, [])

  return (
    <>
      <div className="grid grid-cols-2 gap-4 space-y-4">
        <div className="space-y-4">
          <Card id="settings-language-card" className="gap-2 py-4 rounded-md">
            <CardHeader>
              <CardTitle className="flex flex-row gap-2">
                <Languages className="w-5 h-5" />
                {t('settings.language')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Combobox
                value={language}
                onValueChange={value => setLanguage(value as any)}
                options={LANGUAGES.map(({ code, label }) => ({ value: code, label }))}
                placeholder={t('settings.selectLanguage')}
                size="sm"
                className="w-full"
              />
            </CardContent>
          </Card>

          <Card id="settings-theme-card" className="gap-2 py-4 rounded-md">
            <CardHeader>
              <CardTitle className="flex flex-row gap-2">
                <Palette className="w-5 h-5" />
                <div className="flex items-center justify-between w-full">
                  {t('settings.theme')}
                  <div id="settings-dark-mode-switch" className="flex items-center space-x-2">
                    <Label className="cursor-pointer" htmlFor="dark-mode">
                      {t('settings.darkMode')}
                    </Label>
                    <Switch id="dark-mode" checked={isDarkMode} onCheckedChange={handleDarkModeToggle} />
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Combobox
                value={theme}
                onValueChange={value => setTheme(value as Theme)}
                options={THEMES.map((themeName: string) => ({
                  value: themeName,
                  label: themeName
                    .replace(/^theme-/, '')
                    .replace(/-/g, ' ')
                    .replace(/^./, c => c.toUpperCase()),
                }))}
                placeholder={t('settings.selectTheme')}
                size="sm"
                className="w-full"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card id="settings-font-family-card" className="gap-2 py-4 rounded-md">
            <CardHeader>
              <CardTitle className="flex flex-row gap-2">
                <TypeOutline className="w-5 h-5" />
                {t('settings.fontFamily')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Combobox
                value={fontFamily}
                onValueChange={value => setFontFamily(value as any)}
                options={FONT_FAMILIES.map((f: string) => ({
                  value: f,
                  label: f.charAt(0).toUpperCase() + f.slice(1).replace(/-/g, ' '),
                  render: <span style={{ fontFamily: `var(--font-${f})` }}>{f.charAt(0).toUpperCase() + f.slice(1).replace(/-/g, ' ')}</span>,
                }))}
                placeholder={t('settings.selectFont')}
                size="sm"
                className="w-full"
                triggerStyle={{ fontFamily: `var(--font-${fontFamily})` }}
              />
            </CardContent>
          </Card>

          <Card id="settings-font-size-card" className="gap-2 py-4 rounded-md">
            <CardHeader>
              <CardTitle className="flex flex-row gap-2">
                <ALargeSmall className="w-5 h-5" />
                {t('settings.fontSize.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {FONT_SIZES.map(size => (
                  <Button
                    key={size}
                    variant={buttonVariant}
                    className={fontSize === size ? 'ring-1 ring-offset-2 ring-primary font-medium' : 'font-normal'}
                    onClick={() => setFontSize(size)}
                  >
                    {t(`settings.fontSize.${size}`)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card id="settings-button-variant-card" className="gap-2 py-4 mb-4 rounded-md">
        <CardHeader>
          <CardTitle>{t('settings.buttonVariant')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {BUTTON_VARIANTS.map(v => (
              <Button key={v} variant={v} className={buttonVariant === v ? 'ring-1 ring-offset-2 ring-primary font-medium' : 'font-normal'} onClick={() => setButtonVariant(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
})
