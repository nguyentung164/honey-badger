import { Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function DevPipelinesTitleBarButton() {
  const { t } = useTranslation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => window.api.devPipelines.openWindow()}
          className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-700 dark:hover:text-violet-300"
          aria-label={t('devPipelines.titleBarTooltip')}
        >
          <Rocket strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t('devPipelines.titleBarTooltip')}</TooltipContent>
    </Tooltip>
  )
}
