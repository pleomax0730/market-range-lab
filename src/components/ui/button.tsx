import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const styles = cva('inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-[color,background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none', {
  variants: { variant: { default: 'bg-blue-600 text-white hover:bg-blue-700', accent: 'bg-[#B5FF4D] text-[#0D0D0D] hover:bg-[#A8F040]', outline: 'border border-[#E5E5E5] bg-white text-[#0D0D0D] hover:bg-[#F8F8F8]', ghost: 'text-[#0D0D0D] hover:bg-[#F0F0F0]' }, size: { default: 'h-10', icon: 'size-10 p-0', sm: 'h-9 px-3' } },
  defaultVariants: { variant: 'default', size: 'default' },
})

export function Button({ className, variant, size, asChild, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(styles({ variant, size }), className)} {...props} />
}
