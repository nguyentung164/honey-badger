import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

export const TERMINAL_SETTINGS_ACCORDION_TRIGGER_CLASS = 'hover:no-underline py-3 px-1 items-center [&>svg:last-child]:self-center'

export function TerminalSettingsAccordionSection({
  value,
  title,
  hint,
  children,
}: {
  value: string
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <AccordionItem value={value} className="border-border/60">
      <AccordionTrigger className={TERMINAL_SETTINGS_ACCORDION_TRIGGER_CLASS}>
        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
          <span className="text-sm font-semibold leading-tight">{title}</span>
          {hint ? <span className="text-xs font-normal leading-relaxed text-muted-foreground">{hint}</span> : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 px-1 pb-4 pt-0">{children}</AccordionContent>
    </AccordionItem>
  )
}
