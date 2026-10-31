import React, { createContext, useContext, useState, ReactNode } from "react";
import { Curio } from "@/lib/supabase";

interface HuntState {
  activeTarget: Curio | null;
  setActiveTarget: (target: Curio | null) => void;
  isHunting: boolean;
}

const HuntContext = createContext<HuntState | undefined>(undefined);

export function HuntProvider({ children }: { children: ReactNode }) {
  const [activeTarget, setActiveTarget] = useState<Curio | null>(null);

  return (
    <HuntContext.Provider
      value={{
        activeTarget,
        setActiveTarget,
        isHunting: activeTarget !== null,
      }}
    >
      {children}
    </HuntContext.Provider>
  );
}

export function useHunt() {
  const context = useContext(HuntContext);
  if (!context) {
    throw new Error("useHunt must be used within a HuntProvider");
  }
  return context;
}
