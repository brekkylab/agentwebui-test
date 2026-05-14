import { useEffect } from 'react';
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  show: (msg: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (msg) => set({ message: msg }),
  clear: () => set({ message: null }),
}));

export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const clear = useToastStore((s) => s.clear);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 3500);
    return () => clearTimeout(t);
  }, [message, clear]);
  if (!message) return null;
  return <div className="cw-toast" role="status">{message}</div>;
}
