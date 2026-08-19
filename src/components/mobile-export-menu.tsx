import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

type ExportFormat = "csv" | "json";

export function MobileExportMenu({
  disabled,
  onExport,
}: {
  disabled: boolean;
  onExport: (format: ExportFormat) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function moveFocus(currentIndex: number, offset: number) {
    const nextIndex = (currentIndex + offset + itemRefs.current.length) % itemRefs.current.length;
    itemRefs.current[nextIndex]?.focus();
  }

  function choose(format: ExportFormat) {
    onExport(format);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex size-9 items-center justify-center rounded-md border border-[#E5E5E5] bg-white outline-none transition-[color,background-color,border-color,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none"
        disabled={disabled}
        aria-label="匯出分析"
        aria-haspopup="menu"
        aria-expanded={open && !disabled}
        aria-controls="mobile-export-menu"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => itemRefs.current[0]?.focus());
        }}
      >
        <Download size={16} />
      </button>
      {open && !disabled && (
        <div
          id="mobile-export-menu"
          role="menu"
          aria-label="匯出格式"
          className="ui-enter absolute right-0 z-30 mt-2 w-36 rounded-md border border-[#E5E5E5] bg-white p-1 shadow-[0_8px_24px_rgba(13,13,13,0.14)]"
        >
          {(["csv", "json"] as const).map((format, index) => (
            <button
              key={format}
              ref={(node) => { itemRefs.current[index] = node; }}
              type="button"
              role="menuitem"
              className="flex h-9 w-full items-center gap-2 rounded px-3 text-left text-sm font-semibold outline-none transition-colors duration-150 hover:bg-[#F0F0F0] focus-visible:bg-[#F0F0F0]"
              onClick={() => choose(format)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveFocus(index, 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveFocus(index, -1);
                }
              }}
            >
              <Download size={14} /> {format.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
