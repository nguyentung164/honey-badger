import type { LucideIcon } from 'lucide-react'
import { SettingsAccordionSection } from '@/components/settings/settingsDialogUi'

export function TerminalSettingsAccordionSection({
  value,
  title,
  hint,
  icon,
  children,
}: {
  value: string
  title: string
  hint?: string
  icon?: LucideIcon
  children: React.ReactNode
}) {
  return (
    <SettingsAccordionSection value={value} title={title} description={hint} icon={icon}>
      {children}
    </SettingsAccordionSection>
  )
}
