import React, { createContext, useContext, useState, ReactNode } from "react";
import type { Tour } from "../../shared/schema";

interface TourState {
  activeTour: Tour | null;
  setActiveTour: (tour: Tour | null) => void;
  currentStopIndex: number;
  setCurrentStopIndex: (index: number) => void;
  isTourActive: boolean;
  advanceToNextStop: () => void;
  completeTour: () => void;
}

const TourContext = createContext<TourState | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);

  const advanceToNextStop = () => {
    if (activeTour && currentStopIndex < activeTour.item_count - 1) {
      setCurrentStopIndex(currentStopIndex + 1);
    }
  };

  const completeTour = () => {
    setActiveTour(null);
    setCurrentStopIndex(0);
  };

  return (
    <TourContext.Provider
      value={{
        activeTour,
        setActiveTour: (tour) => {
          setActiveTour(tour);
          setCurrentStopIndex(0);
        },
        currentStopIndex,
        setCurrentStopIndex,
        isTourActive: activeTour !== null,
        advanceToNextStop,
        completeTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}
