import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react'

const TooltipTimingContext = createContext<{ hasOpenedTooltip: boolean; markOpened: () => void }>({ hasOpenedTooltip: false, markOpened: () => undefined })

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [hasOpenedTooltip, setHasOpenedTooltip] = useState(false)
  return <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}><TooltipTimingContext.Provider value={{ hasOpenedTooltip, markOpened: () => setHasOpenedTooltip(true) }}>{children}</TooltipTimingContext.Provider></TooltipPrimitive.Provider>
}

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  const tooltipId = useId()
  const wasOpened = useRef(false)
  const [instant, setInstant] = useState(false)
  const { hasOpenedTooltip, markOpened } = useContext(TooltipTimingContext)
  return <TooltipPrimitive.Root onOpenChange={(open) => { if (open) { setInstant(wasOpened.current || hasOpenedTooltip); wasOpened.current = true; markOpened() } }}><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content id={tooltipId} data-instant={instant ? "" : undefined} sideOffset={6} className="tooltip-content z-50 max-w-72 rounded bg-[#0D0D0D] px-2.5 py-1.5 text-xs leading-5 text-white shadow-lg">{content}<TooltipPrimitive.Arrow className="fill-[#0D0D0D]" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root>
}
