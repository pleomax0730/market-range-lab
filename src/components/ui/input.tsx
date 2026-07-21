import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-10 w-full rounded-md border border-[#D8D8D8] bg-white px-3 text-sm text-[#0D0D0D] outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100', className)} {...props} />
}

