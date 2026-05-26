import React, { useState, useEffect, useCallback } from 'react';

// ── Toast Context ──────────────────────────────────────────
export const ToastContext = React.createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastContext);
}

// ── Toast Container ────────────────────────────────────────
function ToastContainer({ toasts, removeToast }) {
  return (
    <div style={styles.container}>
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

// ── Single Toast ───────────────────────────────────────────
function Toast({ toast, onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const showTimer = setTimeout(() => setVisible(true), 10);

    // Auto dismiss
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, toast.duration);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [toast.id, toast.duration, onRemove]);

  const config = {
    success: { icon: '✅', bg: '#eafaf1', border: '#a9dfbf', color: '#1e8449', bar: '#27ae60' },
    error:   { icon: '❌', bg: '#fdecea', border: '#f5c6cb', color: '#721c24', bar: '#e74c3c' },
    warning: { icon: '⚠️', bg: '#fff3cd', border: '#ffc107', color: '#856404', bar: '#f39c12' },
    info:    { icon: 'ℹ️', bg: '#e8f4fd', border: '#bee5eb', color: '#0c5460', bar: '#3498db' },
  }[toast.type] || { icon: 'ℹ️', bg: '#e8f4fd', border: '#bee5eb', color: '#0c5460', bar: '#3498db' };

  return (
    <div style={{
      ...styles.toast,
      background:   config.bg,
      border:       `1px solid ${config.border}`,
      transform:    visible ? 'translateX(0)' : 'translateX(120%)',
      opacity:      visible ? 1 : 0,
    }}>
      {/* Progress bar */}
      <div style={{
        ...styles.progressBar,
        background: config.bar,
        animation: `shrink ${toast.duration}ms linear forwards`,
      }} />

      {/* Content */}
      <div style={styles.toastContent}>
        <span style={styles.icon}>{config.icon}</span>
        <span style={{ ...styles.message, color: config.color }}>{toast.message}</span>
        <button
          style={styles.closeBtn}
          onClick={() => {
            setVisible(false);
            setTimeout(() => onRemove(toast.id), 300);
          }}
        >
          ✕
        </button>
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container:   { position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '380px' },
  toast:       { borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', transition: 'all 0.3s ease', minWidth: '300px' },
  progressBar: { height: '3px', width: '100%' },
  toastContent:{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' },
  icon:        { fontSize: '16px', flexShrink: 0 },
  message:     { flex: 1, fontSize: '13px', fontWeight: '500', lineHeight: '1.4' },
  closeBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '12px', padding: '2px', flexShrink: 0 },
};