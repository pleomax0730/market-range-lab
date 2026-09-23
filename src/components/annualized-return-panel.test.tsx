import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnualizedReturnPanel } from './annualized-return-panel';
import { TooltipProvider } from './ui/tooltip';
import type { HistoryDataset } from '../domain/types';

// Mock recharts ResponsiveContainer to avoid 0x0 container size issues in jsdom
vi.mock('recharts', async () => {
  const original = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

afterEach(() => {
  cleanup();
});

const mockDatasets: HistoryDataset[] = [
  {
    id: 'test-dataset-1',
    symbol: 'PLTR',
    interval: 'daily',
    filename: 'PLTR.csv',
    sha256: 'mock-sha',
    importedAt: '2026-01-01T00:00:00Z',
    sourceUrl: 'https://example.com',
    splitAdjustedConfirmed: true,
    discontinuitiesConfirmed: true,
    bars: [
      { date: '2026-01-02', open: 70, high: 75, low: 69, close: 72, volume: 1000 },
      { date: '2026-01-05', open: 72, high: 76, low: 71, close: 74, volume: 1200 },
    ],
  },
];

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('AnnualizedReturnPanel', () => {
  it('renders section title, inputs, and initial return rates', () => {
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} activeSymbol="PLTR" initialPrice={74} />);

    expect(screen.getByRole('heading', { name: /年化報酬目標賣價趨勢/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/標的代號/i)).toHaveValue('PLTR');
    expect(screen.getByLabelText(/買進日期/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/買進均價/i)).toHaveValue(74);

    // Initial default rates: 10%, 20%, 30%
    expect(screen.getAllByText(/\+10% 年化/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\+20% 年化/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\+30% 年化/i).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps custom symbol, buy price, and buy date independent from imported context', async () => {
    const user = userEvent.setup();
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} activeSymbol="PLTR" initialPrice={74} />);

    const symbolInput = screen.getByLabelText(/標的代號/i);
    const buyDateInput = screen.getByLabelText(/買進日期/i);
    const buyPriceInput = screen.getByLabelText(/買進均價/i);

    await user.clear(symbolInput);
    await user.type(symbolInput, 'NVDA');
    await user.clear(buyDateInput);
    await user.type(buyDateInput, '2025-01-02');
    await user.clear(buyPriceInput);
    await user.type(buyPriceInput, '150.25');

    expect(symbolInput).toHaveValue('NVDA');
    expect(buyDateInput).toHaveValue('2025-01-02');
    expect(buyPriceInput).toHaveValue(150.25);

    await user.click(screen.getByRole('button', { name: /帶入目前標的/i }));
    expect(symbolInput).toHaveValue('PLTR');
    expect(buyPriceInput).toHaveValue(74);
    expect(buyDateInput).toHaveValue('2025-01-02');
  });

  it('preserves custom inputs when the active imported dataset changes', () => {
    const { rerender } = renderWithTooltip(
      <AnnualizedReturnPanel datasets={mockDatasets} activeSymbol="PLTR" initialPrice={74} />,
    );
    fireEvent.change(screen.getByLabelText(/標的代號/i), { target: { value: 'NVDA' } });
    fireEvent.change(screen.getByLabelText(/買進日期/i), { target: { value: '2025-01-02' } });
    fireEvent.change(screen.getByLabelText(/買進均價/i), { target: { value: '150.25' } });

    rerender(
      <TooltipProvider>
        <AnnualizedReturnPanel datasets={mockDatasets} activeSymbol="SOXL" initialPrice={129} />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText(/標的代號/i)).toHaveValue('NVDA');
    expect(screen.getByLabelText(/買進日期/i)).toHaveValue('2025-01-02');
    expect(screen.getByLabelText(/買進均價/i)).toHaveValue(150.25);
    fireEvent.click(screen.getByRole('button', { name: /帶入目前標的/i }));
    expect(screen.getByLabelText(/標的代號/i)).toHaveValue('SOXL');
    expect(screen.getByLabelText(/買進均價/i)).toHaveValue(129);
  });

  it('allows adding a new return rate', async () => {
    const user = userEvent.setup();
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} />);

    const addInput = screen.getByPlaceholderText(/例如 15/i);
    await user.type(addInput, '15');
    await user.click(screen.getByRole('button', { name: /新增/i }));

    expect(screen.getAllByText(/\+15% 年化/i).length).toBeGreaterThanOrEqual(1);
  });

  it('allows adding rate via preset shortcut buttons', async () => {
    const user = userEvent.setup();
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} />);

    const preset25 = screen.getByRole('button', { name: /\+25%/i });
    await user.click(preset25);

    expect(screen.getAllByText(/\+25% 年化/i).length).toBeGreaterThanOrEqual(1);
  });

  it('allows removing an existing return rate', async () => {
    const user = userEvent.setup();
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} />);

    const removeBtn = screen.getByRole('button', { name: /移除 10% 年化目標/i });
    await user.click(removeBtn);

    expect(screen.queryAllByText(/\+10% 年化/i).length).toBe(0);
  });

  it('prevents removing the last return rate', async () => {
    const user = userEvent.setup();
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} />);

    // Remove 10% and 20%
    await user.click(screen.getByRole('button', { name: /移除 10% 年化目標/i }));
    await user.click(screen.getByRole('button', { name: /移除 20% 年化目標/i }));

    // Try removing 30% (the last one)
    await user.click(screen.getByRole('button', { name: /移除 30% 年化目標/i }));

    expect(screen.getByText(/請至少保留一個目標年化報酬率/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\+30% 年化/i).length).toBeGreaterThanOrEqual(1);
  });

  it('switches horizon via quick option buttons', async () => {
    const user = userEvent.setup();
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} />);

    fireEvent.change(screen.getByLabelText(/買進均價/i), { target: { value: '100' } });
    const btn30d = screen.getAllByRole('button', { name: '30 天' })[0];
    await user.click(btn30d);

    expect(screen.getAllByText(/30 日曆天/i).length).toBeGreaterThanOrEqual(1);
  });

  it('displays error message when buy price is 0 or negative', () => {
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} />);

    const buyPriceInput = screen.getByLabelText(/買進均價/i);
    fireEvent.change(buyPriceInput, { target: { value: '0' } });

    expect(screen.getByText(/請輸入大於 0 的有效買進均價/i)).toBeInTheDocument();
    expect(screen.getByText(/請輸入大於 0 的買進均價以繪製目標賣價趨勢線/i)).toBeInTheDocument();
  });

  it('handles typing an unimported or arbitrary symbol gracefully', () => {
    renderWithTooltip(<AnnualizedReturnPanel datasets={[]} />);

    const symbolInput = screen.getByLabelText(/標的代號/i);
    fireEvent.change(symbolInput, { target: { value: 'CUSTOM-TICKER' } });
    fireEvent.change(screen.getByLabelText(/買進均價/i), { target: { value: '100' } });

    // Chart container is rendered and no crash occurs
    expect(screen.getByTestId('annualized-return-chart-container')).toBeInTheDocument();
    expect(screen.getByText(/CUSTOM-TICKER/i)).toBeInTheDocument();
    expect(screen.getByText(/可輸入未匯入的標的；歷史資料不是必要條件/i)).toBeInTheDocument();
  });

  it('omits today marker when buy date is in the future', () => {
    renderWithTooltip(<AnnualizedReturnPanel datasets={mockDatasets} />);

    const buyDateInput = screen.getByLabelText(/買進日期/i);
    // Set buy date far in future
    fireEvent.change(buyDateInput, { target: { value: '2099-01-01' } });
    fireEvent.change(screen.getByLabelText(/買進均價/i), { target: { value: '100' } });

    expect(screen.getByText(/買進日在未來（僅預測投射曲線）/i)).toBeInTheDocument();
    expect(screen.getByText(/尚未到達買進日/i)).toBeInTheDocument();
    expect(screen.getByText(/投射未來情境/i)).toBeInTheDocument();
  });
});
