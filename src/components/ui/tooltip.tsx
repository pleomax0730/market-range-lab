import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  return <TooltipPrimitive.Provider delayDuration={250}><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-64 rounded bg-[#0D0D0D] px-2.5 py-1.5 text-xs text-white shadow-lg">{content}<TooltipPrimitive.Arrow className="fill-[#0D0D0D]" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></TooltipPrimitive.Provider>
}

