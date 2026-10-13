'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import Icon from './Icon';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const hideToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={hideToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onClose }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" role="region" aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

function Toast({ toast, onClose }) {
  const bgColor = toast.type === 'error' ? 'bg-[#fdecec] border-[#f1b0b0] text-danger' : 'bg-okgreenbg border-[#b7dfc2] text-okgreen';
  const icon = toast.type === 'error' ? 'alert-circle' : 'check-circle';

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg min-w-[280px] max-w-[400px] animate-slide-in ${bgColor}`}
      role="alert"
    >
      <Icon name={icon} size={18} className="shrink-0" />
      <span className="text-[13.5px] font-medium">{toast.message}</span>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="ml-auto shrink-0 text-current opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}