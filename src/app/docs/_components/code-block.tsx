export function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="rounded-xl border border-border-medium overflow-hidden bg-[#1e1e2e] text-sm">
      {title && (
        <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
            <span className="w-3 h-3 rounded-full bg-green-400/80" />
          </div>
          <span className="text-white/50 text-xs ml-2 font-mono">{title}</span>
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-white/90 font-mono text-[13px] leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}
