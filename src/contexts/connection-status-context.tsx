"use client";

import { createContext, useContext, type ReactNode } from "react";

interface ConnectionStatusContextValue {
  hasAccounts: boolean;
  hasGoals: boolean;
  hasCompletedGoals: boolean;
  hasPayday: boolean;
  fireOnboarded: boolean;
  hasInvestments: boolean;
  hasNetWorthData: boolean;
}

const ConnectionStatusContext = createContext<ConnectionStatusContextValue | null>(null);

export function ConnectionStatusProvider({
  hasAccounts,
  hasGoals,
  hasCompletedGoals,
  hasPayday,
  fireOnboarded,
  hasInvestments,
  hasNetWorthData,
  children,
}: ConnectionStatusContextValue & {
  children: ReactNode;
}) {
  return (
    <ConnectionStatusContext.Provider value={{ hasAccounts, hasGoals, hasCompletedGoals, hasPayday, fireOnboarded, hasInvestments, hasNetWorthData }}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatus(): ConnectionStatusContextValue {
  const context = useContext(ConnectionStatusContext);
  if (!context) {
    return { hasAccounts: true, hasGoals: true, hasCompletedGoals: true, hasPayday: true, fireOnboarded: true, hasInvestments: true, hasNetWorthData: true };
  }
  return context;
}
