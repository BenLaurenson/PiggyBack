"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const providers = [
  { id: "google", name: "Google Gemini", defaultModel: "gemini-2.0-flash" },
  { id: "openai", name: "OpenAI", defaultModel: "gpt-4o-mini" },
  { id: "anthropic", name: "Anthropic Claude", defaultModel: "claude-sonnet-4-5-20250929" },
];

interface AiStepProps {
  userId: string;
  onNext: () => void;
  onComplete: () => void;
}

export function AiStep({ userId, onNext, onComplete }: AiStepProps) {
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const handleSave = async () => {
    if (!provider || !apiKey.trim()) {
      onNext();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const selectedProvider = providers.find(p => p.id === provider);
      await supabase.from("profiles").update({
        ai_provider: provider,
        ai_api_key: apiKey.trim(),
        ai_model: selectedProvider?.defaultModel || null,
      }).eq("id", userId);
      setVerified(true);
      setTimeout(() => onComplete(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
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
        <div className="space-y-2">
          <Label>AI Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue placeholder="Choose a provider" /></SelectTrigger>
            <SelectContent>
              {providers.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {provider && (
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input id="apiKey" type={showKey ? "text" : "password"} placeholder="Enter your API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="pr-10" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm" style={{ color: "var(--pastel-coral)" }}>{error}</p>}
        <Button onClick={handleSave} className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold" style={{ backgroundColor: "var(--pastel-coral)", color: "white" }} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {provider && apiKey ? "Save & Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
