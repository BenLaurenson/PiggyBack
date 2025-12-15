"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send,
  X,
  Sparkles,
  Loader2,
  Check,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useRef, useState } from "react";

// Friendly labels for tool names shown during loading
const TOOL_LABELS: Record<string, string> = {
  searchTransactions: "Searching transactions",
  getSpendingSummary: "Analyzing spending",
  getIncomeSummary: "Checking income",
  getAccountBalances: "Looking up balances",
  getUpcomingBills: "Reviewing bills",
  getSavingsGoals: "Checking savings goals",
  getMonthlyTrends: "Analyzing trends",
  getMerchantSpending: "Researching merchant",
  comparePeriods: "Comparing periods",
  getTopMerchants: "Finding top merchants",
  getBudgetStatus: "Checking budget",
  getPaySchedule: "Checking pay schedule",
  getCategoryList: "Loading categories",
  getDailySpending: "Analyzing daily spending",
  queryFinancialData: "Querying data",
  getSpendingVelocity: "Calculating burn rate",
  getCashflowForecast: "Forecasting cash flow",
  getSubscriptionCostTrajectory: "Analyzing subscriptions",
  getCoupleSplitAnalysis: "Analyzing splits",
  createBudgetAssignment: "Setting budget",
  createExpenseDefinition: "Creating expense",
  createSavingsGoal: "Creating goal",
  updateSavingsGoal: "Updating goal",
  recategorizeTransaction: "Recategorizing",
  createIncomeSource: "Adding income source",
};

const SUGGESTED_QUESTIONS = [
  "What did I spend the most on this month?",
  "How does my spending compare to last month?",
  "How much have I spent at Woolworths this year?",
  "What are my account balances?",
  "Show me my top 10 merchants this month",
  "What's my savings rate over the last 6 months?",
];

interface PiggyChatProps {
  financialContext?: string;
  hasApiKey?: boolean;
}

type AnyPart = UIMessage["parts"][number];

/** Extract tool parts (dynamic-tool or typed tool-*) from message parts */
function getToolParts(parts: AnyPart[]) {
  return parts.filter(
    (p) => p.type === "dynamic-tool" || (p.type.startsWith("tool-") && p.type !== "text")
  );
}

/** Get readable label for a tool part */
function getToolLabel(part: AnyPart): string {
  if (part.type === "dynamic-tool") {
    const p = part as { toolName: string };
    return TOOL_LABELS[p.toolName] || p.toolName;
  }
  // Typed tool parts have type "tool-{name}"
  const name = part.type.replace("tool-", "");
  return TOOL_LABELS[name] || name;
}

/** Check if a tool part is done (has output or errored) */
function isToolDone(part: AnyPart): boolean {
  const p = part as { state?: string };
  return p.state === "output-available" || p.state === "output-error";
}

/** Markdown renderer for assistant messages */
function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        h1: ({ children }) => (
          <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            className="underline"
            style={{ color: "var(--pastel-blue-dark)" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        code: (props) => {
          const { children, className } = props;
          if (className?.includes("language-")) {
            return (
              <pre
                className="rounded-lg p-2 text-xs overflow-x-auto my-2"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code
              className="rounded px-1 py-0.5 text-xs"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              {children}
            </code>
          );
        },
        hr: () => (
          <hr
            className="my-2 border-t"
            style={{ borderColor: "var(--border)" }}
          />
        ),
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-2 pl-3 my-2 italic"
            style={{
              borderColor: "var(--pastel-blue)",
              color: "var(--text-secondary)",
            }}
          >
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/** Single message bubble with tool status + markdown */
function MessageBubble({
  message,
  isLastAssistant,
  isStreaming,
}: {
  message: UIMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
}) {
  const [toolsVisible, setToolsVisible] = useState(true);

  // Collect text and tool parts
  const textContent = message.parts
    .filter((p): p is Extract<AnyPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  const toolParts = getToolParts(message.parts);
  const hasTools = toolParts.length > 0;
  const allToolsDone = hasTools && toolParts.every(isToolDone);
  const isActive = isLastAssistant && isStreaming;

  // Auto-collapse tools once done and text is showing
  useEffect(() => {
    if (allToolsDone && !isActive && textContent) {
      const timer = setTimeout(() => setToolsVisible(false), 800);
      return () => clearTimeout(timer);
    }
  }, [allToolsDone, isActive, textContent]);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm leading-relaxed"
          style={{ backgroundColor: "var(--pastel-blue)", color: "white" }}
        >
          {textContent}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed"
        style={{
          backgroundColor: "var(--surface)",
          color: "var(--text-primary)",
        }}
      >
        {/* Tool call indicators */}
        {hasTools && (
          <div className="mb-2">
            {!toolsVisible && !isActive ? (
              <button
                onClick={() => setToolsVisible(true)}
                className="flex items-center gap-1.5 text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-tertiary)" }}
              >
                <Sparkles className="h-2.5 w-2.5" />
                Used {toolParts.length} tool
                {toolParts.length !== 1 ? "s" : ""}
                <ChevronRight className="h-2.5 w-2.5" />
              </button>
            ) : (
              <div className="space-y-1">
                {allToolsDone && !isActive && (
                  <button
                    onClick={() => setToolsVisible(false)}
                    className="text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Hide
                  </button>
                )}
                {toolParts.map((part) => {
                  const done = isToolDone(part);
                  return (
                    <div
                      key={(part as { toolCallId: string }).toolCallId}
                      className="flex items-center gap-2 text-[11px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {done ? (
                        <Check
                          className="h-3 w-3 flex-shrink-0"
                          style={{ color: "var(--pastel-mint-dark)" }}
                        />
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                      )}
                      <span>{getToolLabel(part)}</span>
                    </div>
                  );
                })}
                {isActive && allToolsDone && (
                  <div
                    className="flex items-center gap-2 text-[11px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                    <span>Composing response...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Text content with markdown rendering */}
        {textContent ? (
          <ChatMarkdown content={textContent} />
        ) : isActive && !hasTools ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span style={{ color: "var(--text-tertiary)" }}>Thinking...</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

// --- Notch-style peeking pig avatar ---

const chatTransport = new DefaultChatTransport({ api: "/api/ai/chat" });

export function PiggyChat({
  hasApiKey = false,
}: PiggyChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFabHovered, setIsFabHovered] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userScrolledUp = useRef(false);

  const { messages, sendMessage, status, error } = useChat({
    transport: chatTransport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  const scrollToBottom = useCallback(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Track whether user has scrolled up from the bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // Consider "at bottom" if within 80px
      userScrolledUp.current = distanceFromBottom > 80;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Reset scroll lock when user sends a new message
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === "user") {
      userScrolledUp.current = false;
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Detect mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const showPig = !isOpen && !isMinimized && !isMobile;
  const showNotch = !isOpen && (isMinimized || isMobile);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    if (isLoading) return;
    sendMessage({ text });
  };

  // Parse error message (server returns JSON { error: "..." })
  const errorMessage = error
    ? (() => {
        try {
          const data = JSON.parse(error.message);
          return data.error || error.message;
        } catch {
          return error.message;
        }
      })()
    : null;

  return (
    <>
      {/* Full pig (desktop, not minimized) */}
      {showPig && (
        <motion.div
          className="fixed bottom-24 md:bottom-6 right-0 z-50"
          initial={{ x: 60 }}
          animate={{ x: isFabHovered ? -8 : 12 }}
          transition={
            isFabHovered
              ? { type: "spring", damping: 14, stiffness: 200, mass: 0.8 }
              : { type: "spring", damping: 22, stiffness: 280 }
          }
          onMouseEnter={() => setIsFabHovered(true)}
          onMouseLeave={() => setIsFabHovered(false)}
        >
          <div className="relative group">
            <motion.button
              onClick={() => setIsOpen(true)}
              className="relative block cursor-pointer"
              whileTap={{ scale: 0.93 }}
              aria-label="Ask Penny anything"
            >
              <motion.div
                animate={
                  isFabHovered
                    ? { y: [0, -4, 0], rotate: [0, -3, 3, 0], scale: 1.05 }
                    : { y: 0, rotate: 0, scale: 1 }
                }
                transition={
                  isFabHovered
                    ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                    : { type: "spring", damping: 18, stiffness: 200 }
                }
              >
                <div className="relative h-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/mascot/penny-peeking.png"
                    alt="Penny peeking"
                    className="h-24 w-auto drop-shadow-lg transition-opacity duration-300"
                    style={{ opacity: isFabHovered ? 0 : 1 }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/mascot/penny-revealed.png"
                    alt="Penny"
                    className="absolute inset-0 h-24 w-auto drop-shadow-lg transition-opacity duration-300"
                    style={{ opacity: isFabHovered ? 1 : 0 }}
                  />
                </div>
              </motion.div>

              {/* Speech bubble */}
              <AnimatePresence>
                {isFabHovered && (
                  <motion.div
                    className="absolute right-full top-[28%] -translate-y-1/2 mr-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap pointer-events-none"
                    style={{
                      backgroundColor: "white",
                      color: "var(--text-primary)",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                    }}
                    initial={{ opacity: 0, x: 10, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 10, scale: 0.9 }}
                    transition={{ delay: 0.2, type: "spring", damping: 16, stiffness: 280 }}
                  >
                    Oink! Need help? 🐷
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -right-[5px] w-2.5 h-2.5 rotate-45"
                      style={{ backgroundColor: "white" }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Dismiss X — visible on hover */}
            <button
              onClick={(e) => { e.stopPropagation(); setIsMinimized(true); setIsFabHovered(false); }}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
              aria-label="Hide Penny"
            >
              <X className="h-3 w-3" style={{ color: "var(--text-tertiary)" }} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Minimized notch tab (mobile default, or dismissed on desktop) */}
      {showNotch && (
        <motion.div
          className="fixed bottom-24 md:bottom-6 right-0 z-50"
          initial={{ x: 60 }}
          animate={{ x: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
        >
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-2 rounded-l-xl shadow-md cursor-pointer"
            style={{
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              borderRight: "none",
            }}
            aria-label="Ask Penny anything"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/mascot/penny-headshot.png"
              alt="Penny"
              className="w-6 h-6 object-contain"
            />
            <Sparkles className="h-3 w-3" style={{ color: "var(--pastel-coral)" }} />
          </button>
        </motion.div>
      )}

      {/* Close button (when chat is open) */}
      {isOpen && (
        <motion.div
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
        >
          <button
            onClick={() => { setIsOpen(false); if (!isMobile) setIsMinimized(false); }}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer"
            style={{ backgroundColor: "var(--pastel-coral)" }}
            aria-label="Close chat"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </motion.div>
      )}

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-40 md:bottom-22 right-4 md:right-6 z-50 w-[calc(100vw-2rem)] md:w-96 max-h-[70vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/mascot/penny-headshot.png"
                alt="Penny"
                className="w-9 h-9 object-contain"
              />
              <div className="flex-1">
                <h3
                  className="text-sm font-semibold font-[family-name:var(--font-nunito)]"
                  style={{ color: "var(--text-primary)" }}
                >
                  PiggyBack AI
                </h3>
                <p
                  className="text-[10px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Your personal finance analyst
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Sparkles
                  className="h-3 w-3"
                  style={{ color: "var(--pastel-yellow-dark)" }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  AI
                </span>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
              style={{ maxHeight: "calc(70vh - 120px)", minHeight: "200px" }}
            >
              {messages.length === 0 && !error && (
                <div className="space-y-3">
                  <p
                    className="text-sm text-center py-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {hasApiKey
                      ? "Ask me anything about your finances!"
                      : "Configure your API key in Settings to start chatting."}
                  </p>
                  {hasApiKey && (
                    <div className="space-y-2">
                      <p
                        className="text-[10px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Suggestions
                      </p>
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSuggestion(q)}
                          className="w-full text-left text-xs p-2.5 rounded-lg transition-colors hover:opacity-80"
                          style={{
                            backgroundColor: "var(--surface)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isLastAssistant={
                    msg.role === "assistant" &&
                    i === messages.length - 1
                  }
                  isStreaming={isLoading}
                />
              ))}

              {errorMessage && (
                <div
                  className="text-xs p-3 rounded-lg"
                  style={{
                    backgroundColor: "var(--pastel-coral-light)",
                    color: "var(--pastel-coral-dark)",
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {hasApiKey && (
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 px-3 py-2.5 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your spending..."
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
                  style={{ color: "var(--text-primary)" }}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!input.trim() || isLoading}
                  className="h-8 w-8 p-0 rounded-full"
                  style={{
                    backgroundColor: input.trim()
                      ? "var(--pastel-coral)"
                      : "var(--surface)",
                    color: input.trim() ? "white" : "var(--text-tertiary)",
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
