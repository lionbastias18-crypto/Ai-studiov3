import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado al iniciar Adventure Alpha Mobile.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('AppErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center gap-4">
          <img
            src="./assets/adventure-alpha-emblem.png"
            alt="Adventure Alpha Mobile"
            className="w-24 h-24 rounded-full shadow-2xl border border-amber-400/40 object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="text-xl font-black text-amber-400 uppercase tracking-wider">
            Adventure Alpha Mobile
          </h1>
          <p className="text-xs text-zinc-300 max-w-md font-mono bg-zinc-900 border border-white/10 rounded-xl p-3 break-words">
            {this.state.message}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase cursor-pointer"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('minecraft_device_preset');
                  localStorage.removeItem('minecraft_web_autorotate');
                } catch {}
                window.location.reload();
              }}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs uppercase cursor-pointer"
            >
              Restablecer Pantalla
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
