"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface TerminalProps {
  lines: string[];
  title?: string;
  className?: string;
}

export function Terminal({ lines, title = "Terminal", className = "" }: TerminalProps) {
  const [copied, setCopied] = useState(false);

  const copyText = lines
    .filter(l => !l.startsWith("#"))
    .map(l => l.replace(/^\$ /, ""))
    .join("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-xl overflow-hidden shadow-xl ${className}`}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a2e]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <span className="text-xs text-gray-500 font-mono">{title}</span>
        <button
          onClick={handleCopy}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
          aria-label="Copy commands"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      {/* Content */}
      <div className="bg-[#0d0d1a] px-4 py-4 font-mono text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            {line.startsWith("$ ") ? (
              <>
                <span className="text-gray-600 select-none mr-2">$</span>
                <span className="text-green-400">{line.slice(2)}</span>
              </>
            ) : line.startsWith("# ") ? (
              <span className="text-gray-600">{line}</span>
            ) : (
              <span className="text-gray-400">{line}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
