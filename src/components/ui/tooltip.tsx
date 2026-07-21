import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>{children}</TooltipPrimitive.Provider>
}

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  return <TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={6} className="tooltip-content z-50 max-w-72 rounded bg-[#0D0D0D] px-2.5 py-1.5 text-xs leading-5 text-white shadow-lg">{content}<TooltipPrimitive.Arrow className="fill-[#0D0D0D]" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root>
}
