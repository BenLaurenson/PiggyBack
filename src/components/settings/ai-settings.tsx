"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { goeyToast as toast } from "goey-toast";

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
      if (model) body.model = model;
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
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Say hello in one sentence." }],
          context: "This is a test message.",
        }),
      });

      if (res.ok) {
        toast.success("Connection successful! AI is working.");
      } else {
        const data = await res.json().catch(() => ({}));
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
              onClick={() => setProvider(p.id)}
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

      {/* Model Override (optional) */}
      <div>
        <label
          className="text-sm font-medium block mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Model{" "}
          <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>
            (optional)
          </span>
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={defaultModel}
          className="w-full p-3 rounded-xl text-sm outline-none border-2 transition-colors"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
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
