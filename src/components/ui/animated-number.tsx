import { useEffect, useRef, type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type AnimatedNumberProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  as?: 'span' | 'strong' | 'dd' | 'div'
  value: string
}

export function AnimatedNumber({ as: Component = 'span', value, className, ...props }: AnimatedNumberProps) {
  const valueElementRef = useRef<HTMLSpanElement>(null)
  const mountedRef = useRef(false)
  const previousValueRef = useRef(value)

  useEffect(() => {
    const valueElement = valueElementRef.current
    if (!mountedRef.current) {
      mountedRef.current = true
      previousValueRef.current = value
      return
    }
    if (!valueElement || previousValueRef.current === value) return

    previousValueRef.current = value
    valueElement.classList.remove('number-pop-value-animated')
    void valueElement.offsetWidth
    valueElement.classList.add('number-pop-value-animated')

    const finish = () => valueElement.classList.remove('number-pop-value-animated')
    valueElement.addEventListener('animationend', finish, { once: true })
    return () => valueElement.removeEventListener('animationend', finish)
  }, [value])

  return (
    <Component className={cn('number-pop num', className)} {...props}>
      <span ref={valueElementRef} className="number-pop-value">
        {value}
      </span>
    </Component>
  )
}
