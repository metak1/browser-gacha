import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Toast = (message: string, tone?: 'info' | 'error') => void;

const ToastContext = createContext<Toast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; tone: 'info' | 'error'; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback<Toast>((message, tone = 'info') => {
    clearTimeout(timer.current);
    setCurrent({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setCurrent(null), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`toast ${current ? 'show' : ''} ${current?.tone ?? ''}`} role="status">
        {current?.message}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
