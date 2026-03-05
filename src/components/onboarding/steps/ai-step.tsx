"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Eye, EyeOff, CheckCircle, ChevronDown, Sparkles } from "lucide-react";

const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  anthropic: [
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — Fast & capable" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6 — Most capable, 1M context" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — Fastest, most affordable" },
  ],
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2 — Latest, advanced reasoning (400K context)" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini — Fast & affordable" },
    { id: "gpt-4.1", label: "GPT-4.1 — Smartest non-reasoning model" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 Nano — Fastest, cheapest" },
    { id: "o4-mini", label: "o4-mini — Fast reasoning" },
  ],
  google: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — Fast & capable (GA)" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — Most affordable (GA)" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — Most capable (GA)" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash — Latest flash (Preview)" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro — Latest pro (Preview)" },
    { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (Preview)" },
  ],
};

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-mini",
  google: "gemini-2.5-flash",
};

interface AiStepProps {
  userId: string;
  onNext: () => void;
  onComplete: () => void;
}

export function AiStep({ onNext, onComplete }: AiStepProps) {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const defaultModel = DEFAULT_MODELS[provider] || "";
  const isCustomModel =
    model &&
    model !== "custom" &&
    !(PROVIDER_MODELS[provider] || []).some((m) => m.id === model);

  const handleSave = async () => {
    if (!provider || !apiKey.trim()) {
      onNext();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const selectedModel = model && model !== "custom" ? model : defaultModel;
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: selectedModel,
          apiKey: apiKey.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      // Test the connection after saving
      setTesting(true);
      const testRes = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const testData = await testRes.json().catch(() => ({}));
      if (!testRes.ok) {
        // Connection failed — clear the saved key so user can retry
        await fetch("/api/ai/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey: null }),
        });
        throw new Error(testData.error || "Connection failed. Please check your API key.");
      }

      setVerified(true);
      setTimeout(() => onComplete(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
      setTesting(false);
    }
  };

  if (verified) {
    return (
      <div className="text-center space-y-4 py-8">
        <CheckCircle className="h-16 w-16 mx-auto" style={{ color: "var(--pastel-mint)" }} />
        <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>AI Configured!</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center" style={{ backgroundColor: "var(--pastel-coral-light)" }}>
          <Brain className="h-8 w-8" style={{ color: "var(--pastel-coral-dark)" }} />
        </div>
        <h2 className="text-xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>Set up AI Assistant</h2>
        <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>Ask questions about your finances using AI</p>
      </div>
      <div className="space-y-4 max-w-sm mx-auto">
        {/* Provider Selection */}
        <div>
          <label
            className="text-sm font-medium block mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            AI Provider
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "anthropic", label: "Anthropic (Claude)" },
              { id: "openai", label: "OpenAI (GPT)" },
              { id: "google", label: "Google (Gemini)" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProvider(p.id);
                  setModel("");
                  setError(null);
                }}
                className="p-3 rounded-xl text-sm font-medium transition-all border-2"
                style={{
                  backgroundColor:
                    provider === p.id
                      ? "var(--pastel-blue-light)"
                      : "var(--surface)",
                  borderColor:
                    provider === p.id
                      ? "var(--pastel-blue)"
                      : "transparent",
                  color:
                    provider === p.id
                      ? "var(--pastel-blue-dark)"
                      : "var(--text-secondary)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {provider && (
          <>
            {/* API Key */}
            <div>
              <label
                className="text-sm font-medium block mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setError(null); }}
                  placeholder={
                    provider === "google"
                      ? "AIza..."
                      : provider === "anthropic"
                        ? "sk-ant-..."
                        : "sk-..."
                  }
                  className="w-full p-3 pr-10 rounded-xl text-sm outline-none border-2 transition-colors"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p
                className="text-xs mt-1.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                Your key is stored in your profile and used server-side only.
              </p>
            </div>

            {/* Model Selection */}
            <div>
              <label
                className="text-sm font-medium block mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Model
              </label>
              <div className="relative">
                <select
                  value={isCustomModel ? "custom" : model || defaultModel}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "custom") {
                      setModel("custom");
                    } else {
                      setModel(val === defaultModel ? "" : val);
                    }
                  }}
                  className="w-full p-3 pr-10 rounded-xl text-sm outline-none border-2 transition-colors appearance-none cursor-pointer"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  {(PROVIDER_MODELS[provider] || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value="custom">Custom model ID...</option>
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "var(--text-tertiary)" }}
                />
              </div>
              {(model === "custom" || isCustomModel) && (
                <input
                  type="text"
                  value={model === "custom" ? "" : model}
                  onChange={(e) => setModel(e.target.value || "custom")}
                  placeholder="Enter model ID, e.g. gemini-2.0-flash-lite"
                  autoFocus
                  className="w-full mt-2 p-3 rounded-xl text-sm outline-none border-2 transition-colors"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              )}
            </div>
          </>
        )}

        {error && <p className="text-sm" style={{ color: "var(--pastel-coral)" }}>{error}</p>}

        <Button
          onClick={handleSave}
          disabled={loading || testing}
          className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold"
          style={{
            backgroundColor: provider && apiKey ? "var(--pastel-coral)" : "var(--surface)",
            color: provider && apiKey ? "white" : "var(--text-tertiary)",
          }}
        >
          {loading || testing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {testing ? "Testing connection..." : "Saving..."}
            </>
          ) : provider && apiKey ? (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Connect & Continue
            </>
          ) : (
            "Skip for now"
          )}
        </Button>
      </div>
    </div>
  );
}
