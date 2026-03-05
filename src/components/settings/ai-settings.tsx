"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { goeyToast as toast } from "goey-toast";

const PROVIDER_MODELS: Record<string, { id: string; label: string; description: string }[]> = {
  anthropic: [
    { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", description: "Best balance of speed & quality" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", description: "Fastest, most affordable" },
    { id: "claude-opus-4-20250514", label: "Claude Opus 4", description: "Most capable" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini", description: "Fast & affordable" },
    { id: "gpt-4o", label: "GPT-4o", description: "Most capable" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", description: "Latest mini model" },
    { id: "gpt-4.1", label: "GPT-4.1", description: "Latest full model" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", description: "Fast & affordable" },
    { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash", description: "Latest flash model" },
    { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro", description: "Most capable" },
  ],
};

export function AISettings() {
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("google");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);


  useEffect(() => {
    fetch("/api/ai/settings")
      .then((r) => r.json())
      .then((data) => {
        setProvider(data.provider || "anthropic");
        setModel(data.model || "");
        setHasExistingKey(data.hasApiKey || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { provider };
      // Don't send "custom" placeholder — only send actual model IDs
      if (model && model !== "custom") body.model = model;
      if (apiKey) body.apiKey = apiKey;

      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("AI settings saved");
        if (apiKey) setHasExistingKey(true);
        setApiKey("");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Connection successful! AI is working.");
      } else {
        toast.error(data.error || "Connection failed");
      }
    } catch {
      toast.error("Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const defaultModel =
    provider === "google"
      ? "gemini-2.0-flash"
      : provider === "anthropic"
        ? "claude-sonnet-4-5-20250929"
        : "gpt-4o-mini";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
              onClick={() => { setProvider(p.id); setModel(""); }}
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
        {provider === "google" && (
          <p
            className="text-xs mt-2 px-1"
            style={{ color: "var(--pastel-coral-dark)" }}
          >
            Gemini Flash models have known issues with tool calling reliability.
            For best results, use Claude or GPT-4o.
          </p>
        )}
      </div>

      {/* API Key */}
      <div>
        <label
          className="text-sm font-medium block mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          API Key
          {hasExistingKey && (
            <span
              className="ml-2 text-xs font-normal"
              style={{ color: "var(--pastel-mint-dark)" }}
            >
              <Check className="h-3 w-3 inline" /> Configured
            </span>
          )}
        </label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasExistingKey
                ? "Enter new key to replace existing..."
                : provider === "google"
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
        <div className="space-y-2">
          {(PROVIDER_MODELS[provider] || []).map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id === defaultModel ? "" : m.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border-2"
              style={{
                backgroundColor:
                  (model || defaultModel) === m.id
                    ? "var(--pastel-blue-light)"
                    : "var(--surface)",
                borderColor:
                  (model || defaultModel) === m.id
                    ? "var(--pastel-blue)"
                    : "transparent",
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{
                    color:
                      (model || defaultModel) === m.id
                        ? "var(--pastel-blue-dark)"
                        : "var(--text-primary)",
                  }}
                >
                  {m.label}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {m.description}
                </div>
              </div>
              {(model || defaultModel) === m.id && (
                <Check
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: "var(--pastel-blue-dark)" }}
                />
              )}
            </button>
          ))}
          {/* Custom model option */}
          <div>
            <button
              onClick={() => {
                const isCustom =
                  model &&
                  !(PROVIDER_MODELS[provider] || []).some((m) => m.id === model);
                if (!isCustom) setModel("custom");
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border-2"
              style={{
                backgroundColor:
                  model &&
                  !(PROVIDER_MODELS[provider] || []).some((m) => m.id === model)
                    ? "var(--pastel-blue-light)"
                    : "var(--surface)",
                borderColor:
                  model &&
                  !(PROVIDER_MODELS[provider] || []).some((m) => m.id === model)
                    ? "var(--pastel-blue)"
                    : "transparent",
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{
                    color:
                      model &&
                      !(PROVIDER_MODELS[provider] || []).some(
                        (m) => m.id === model
                      )
                        ? "var(--pastel-blue-dark)"
                        : "var(--text-primary)",
                  }}
                >
                  Custom model
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Enter a model ID manually
                </div>
              </div>
            </button>
            {model &&
              !(PROVIDER_MODELS[provider] || []).some(
                (m) => m.id === model
              ) && (
                <input
                  type="text"
                  value={model === "custom" ? "" : model}
                  onChange={(e) => setModel(e.target.value || "custom")}
                  placeholder="e.g. gemini-2.0-flash-lite"
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
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-xl"
          style={{
            backgroundColor: "var(--pastel-blue)",
            color: "white",
          }}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Save Settings
        </Button>
        {hasExistingKey && (
          <Button
            onClick={handleTest}
            disabled={testing}
            variant="outline"
            className="rounded-xl"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Test
          </Button>
        )}
      </div>

    </div>
  );
}
