import type { ReactNode } from 'react'
import { Tooltip } from './ui/tooltip'

export function TermHelp({ children, explanation }: { children: ReactNode; explanation: string }) {
  return <Tooltip content={explanation}><span tabIndex={0} className="cursor-help border-b border-dotted border-[#9A9A9A] outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{children}</span></Tooltip>
}
