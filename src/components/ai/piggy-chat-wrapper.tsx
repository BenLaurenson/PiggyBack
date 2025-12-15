"use client";

import { useState, useEffect } from "react";
import { PiggyChat } from "./piggy-chat";

export function PiggyChatWrapper() {
  const [context, setContext] = useState<string>("");
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    // Fetch financial context and API key status
    async function loadContext() {
      try {
        const res = await fetch("/api/ai/context");
        if (res.ok) {
          const data = await res.json();
          setContext(data.context || "");
          setHasApiKey(data.hasApiKey || false);
        }
      } catch {
        // Silently fail - chat will show "configure API key" message
      }
    }
    loadContext();
  }, []);

  return <PiggyChat financialContext={context} hasApiKey={hasApiKey} />;
}
