import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getCheckedInPlaceIds } from '@/lib/checkins';

interface CheckinState {
  checkedInPlaceIds: Set<string>;
  addCheckin: (placeId: string) => void;
  removeCheckin: (placeId: string) => void;
  isCheckedIn: (placeId: string) => boolean;
  refreshCheckins: () => Promise<void>;
  refreshTrigger: number;
}

const CheckinContext = createContext<CheckinState | undefined>(undefined);

export function CheckinProvider({ children }: { children: ReactNode }) {
  const { user, isGuest } = useAuth();
  const [checkedInPlaceIds, setCheckedInPlaceIds] = useState<Set<string>>(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshCheckins = useCallback(async () => {
    if (!user || isGuest) {
      setCheckedInPlaceIds(new Set());
      return;
    }
    
    try {
      const ids = await getCheckedInPlaceIds(user.id);
      setCheckedInPlaceIds(new Set(ids));
    } catch (error) {
      console.error('Error fetching checked-in place IDs:', error);
    }
  }, [user?.id, isGuest]);

  useEffect(() => {
    refreshCheckins();
  }, [refreshCheckins]);

  const addCheckin = useCallback((placeId: string) => {
    setCheckedInPlaceIds(prev => new Set([...prev, placeId]));
    setRefreshTrigger(t => t + 1);
  }, []);

  const removeCheckin = useCallback((placeId: string) => {
    setCheckedInPlaceIds(prev => {
      const next = new Set(prev);
      next.delete(placeId);
      return next;
    });
    setRefreshTrigger(t => t + 1);
  }, []);

  const isCheckedIn = useCallback((placeId: string) => {
    return checkedInPlaceIds.has(placeId);
  }, [checkedInPlaceIds]);

  return (
    <CheckinContext.Provider
      value={{
        checkedInPlaceIds,
        addCheckin,
        removeCheckin,
        isCheckedIn,
        refreshCheckins,
        refreshTrigger,
      }}
    >
      {children}
    </CheckinContext.Provider>
  );
}

export function useCheckins() {
  const context = useContext(CheckinContext);
  if (!context) {
    throw new Error('useCheckins must be used within a CheckinProvider');
  }
  return context;
}
