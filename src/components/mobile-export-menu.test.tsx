import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileExportMenu } from "./mobile-export-menu";

afterEach(cleanup);

describe("MobileExportMenu", () => {
  it("closes with Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<MobileExportMenu disabled={false} onExport={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "匯出分析" });
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "匯出格式" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "匯出格式" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MobileExportMenu disabled={false} onExport={vi.fn()} />
        <button type="button">外部按鈕</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "匯出分析" }));
    await user.click(screen.getByRole("button", { name: "外部按鈕" }));
    expect(screen.queryByRole("menu", { name: "匯出格式" })).not.toBeInTheDocument();
  });

  it("exports the selected format and closes", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<MobileExportMenu disabled={false} onExport={onExport} />);

    const trigger = screen.getByRole("button", { name: "匯出分析" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: /CSV/ }));

    expect(onExport).toHaveBeenCalledWith("csv");
    expect(screen.queryByRole("menu", { name: "匯出格式" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
