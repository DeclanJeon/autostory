import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

/**
 * 토스트 프로바이더 컴포넌트
 */
export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration || 5000,
    };

    setToasts((prev) => [...prev, newToast]);

    // 자동 제거
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const value: ToastContextType = {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

/**
 * 토스트 컨테이너 컴포넌트
 */
const ToastContainer: React.FC<{
  toasts: Toast[];
  onRemove: (id: string) => void;
}> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

/**
 * 개별 토스트 아이템 컴포넌트
 */
const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({
  toast,
  onRemove,
}) => {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    // 진입 애니메이션
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // 퇴장 애니메이션 후 제거
    setTimeout(() => onRemove(toast.id), 300);
  };

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      default:
        return "ℹ️";
    }
  };

  const getStyles = () => {
    const baseStyles =
      "max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden transform transition-all duration-300 ease-in-out";

    const typeStyles = {
      success: "border-l-4 border-green-500",
      error: "border-l-4 border-red-500",
      warning: "border-l-4 border-yellow-500",
      info: "border-l-4 border-blue-500",
    };

    const visibilityStyles = isVisible
      ? "translate-x-0 opacity-100 scale-100"
      : "translate-x-full opacity-0 scale-95";

    return `${baseStyles} ${typeStyles[toast.type]} ${visibilityStyles}`;
  };

  return (
    <div className={getStyles()}>
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 text-2xl mr-3">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{toast.title}</p>
            {toast.message && (
              <p className="mt-1 text-sm text-gray-500">{toast.message}</p>
            )}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={handleClose}
              className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <span className="sr-only">닫기</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 편의 훅들
 */
export const useToastHelpers = () => {
  const { addToast, removeToast, clearAllToasts } = useToast();

  const showSuccess = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) => {
      return addToast({ type: "success", title, message, ...options });
    },
    [addToast]
  );

  const showError = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) => {
      return addToast({
        type: "error",
        title,
        message,
        duration: 8000,
        ...options,
      });
    },
    [addToast]
  );

  const showWarning = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) => {
      return addToast({
        type: "warning",
        title,
        message,
        duration: 6000,
        ...options,
      });
    },
    [addToast]
  );

  const showInfo = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) => {
      return addToast({ type: "info", title, message, ...options });
    },
    [addToast]
  );

  const showWithAction = useCallback(
    (toast: Omit<Toast, "id">) => {
      return addToast({ ...toast, duration: 10000 });
    },
    [addToast]
  );

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showWithAction,
    removeToast,
    clearAllToasts,
  };
};

export default ToastProvider;
