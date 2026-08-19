import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnimatedNumber } from './animated-number'

afterEach(cleanup)

describe('AnimatedNumber', () => {
  it('keeps the formatted value readable and only animates subsequent changes', () => {
    const { rerender } = render(<AnimatedNumber value="$100.00" />)

    expect(screen.getByText('$100.00')).not.toHaveClass('number-pop-value-animated')

    rerender(<AnimatedNumber value="$101.25" />)

    expect(screen.getByText('$101.25')).toHaveClass('number-pop-value-animated')
  })
})
