"use client";

import React, { createContext, useContext, useState } from "react";

export type IncomeMode = "all_positive" | "marked_sources";

interface IncomeConfigContextType {
  incomeMode: IncomeMode;
  setIncomeMode: (mode: IncomeMode) => void;
}

const IncomeConfigContext = createContext<IncomeConfigContextType>({
  incomeMode: "all_positive",
  setIncomeMode: () => {},
});

export function IncomeConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [incomeMode, setIncomeMode] = useState<IncomeMode>("all_positive");

  return (
    <IncomeConfigContext.Provider value={{ incomeMode, setIncomeMode }}>
      {children}
    </IncomeConfigContext.Provider>
  );
}

export function useIncomeConfig() {
  return useContext(IncomeConfigContext);
}
