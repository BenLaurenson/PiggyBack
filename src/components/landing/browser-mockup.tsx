interface BrowserMockupProps {
  url?: string;
  children: React.ReactNode;
  className?: string;
}

export function BrowserMockup({ url = "piggyback.app", children, className = "" }: BrowserMockupProps) {
  return (
    <div className={`rounded-2xl overflow-hidden border border-white/20 shadow-2xl ${className}`}
      style={{ backgroundColor: "var(--surface-elevated)" }}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1.5 px-4 py-1 rounded-md text-xs"
            style={{ backgroundColor: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {url}
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="overflow-hidden">
        {children}
      </div>
    </div>
  );
}
