import { createContext, useContext, useState, ReactNode } from 'react';

interface TransitionContextValue {
  isTransitioning: boolean;
  startTransition: (callback: () => void) => void;
}

const TransitionContext = createContext<TransitionContextValue | null>(null);

export function TransitionProvider({ children }: { children: ReactNode }) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const startTransition = (callback: () => void) => {
    setIsTransitioning(true);
    setPendingCallback(() => callback);
  };

  const handleComplete = () => {
    setIsTransitioning(false);
    if (pendingCallback) {
      pendingCallback();
      setPendingCallback(null);
    }
  };

  return (
    <TransitionContext.Provider value={{ isTransitioning, startTransition }}>
      {children}
      {/* Transition overlay will be rendered here */}
    </TransitionContext.Provider>
  );
}

export function useTransition() {
  const ctx = useContext(TransitionContext);
  if (!ctx) throw new Error('useTransition must be used within TransitionProvider');
  return ctx;
}
