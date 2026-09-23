import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PutYieldTargetPanel } from './put-yield-target-panel'
import { TooltipProvider } from './ui/tooltip'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ price: 42.6, quoteTime: '2026-09-23T14:00:00Z' }),
  }))
})

function renderPanel() {
  return render(
    <TooltipProvider>
      <PutYieldTargetPanel
        activeSymbol="SOXL"
        initialPrice={42.6}
        initialReferenceDate="2026-09-23"
        initialExpirationDate="2026-10-16"
      />
    </TooltipProvider>,
  )
}

describe('PutYieldTargetPanel', () => {
  it('顯示模式 A 的輸入與理論最低權利金結果', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: /目標年化賣 Put 試算/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Put 試算標的代號/i)).toHaveValue('SOXL')
    expect(screen.getByLabelText(/Put 試算履約價/i)).toHaveValue(40.47)
    expect(screen.getAllByText(/最低每股權利金/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\$0\.51/i).length).toBeGreaterThan(0)
  })

  it('更新履約價後重新計算最低權利金', () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText(/Put 試算履約價/i), { target: { value: '50' } })

    expect(screen.getAllByText(/\$0\.63/i).length).toBeGreaterThan(0)
  })

  it('支援新增與移除多組目標年化報酬率', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByLabelText(/新增 Put 目標年化報酬率/i), '30')
    await user.click(screen.getByRole('button', { name: /^新增$/i }))
    expect(screen.getAllByText(/\+30%/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /移除 \+15% 年化目標/i }))
    expect(screen.queryByRole('button', { name: /移除 \+15% 年化目標/i })).not.toBeInTheDocument()
  })

  it('拒絕不晚於參考日的到期日', () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText(/Put 試算到期日/i), { target: { value: '2026-09-23' } })

    expect(screen.getByText(/到期日必須晚於參考日/i)).toBeInTheDocument()
    expect(screen.queryByText(/最低每股權利金/i)).not.toBeInTheDocument()
  })

  it('日期欄位只保留瀏覽器原生日期圖示，避免自訂圖示重疊', () => {
    renderPanel()

    const panel = screen.getByTestId('put-yield-target-panel')
    expect(panel.querySelectorAll('svg.lucide-calendar')).toHaveLength(0)
  })
})
