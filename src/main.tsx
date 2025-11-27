import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./hooks/useTheme";
import { ToastProvider } from "./components/Toast";


class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  componentDidMount() {
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    // Ignore Tauri dialog cancellation errors (user cancelled dialog)
    const reason = event.reason as { type?: string } | undefined;
    if (reason && reason.type === 'cancelation') {
      event.preventDefault(); // Suppress the error
      return;
    }

    console.error("Unhandled Promise Rejection:", event.reason);
    if (typeof event.reason === 'object') {
      try {
        console.error("Rejection details:", JSON.stringify(event.reason, null, 2));
      } catch {
        console.error("Could not stringify rejection reason");
      }
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-950 text-red-200 h-screen w-screen overflow-auto">
          <h1 className="text-xl font-bold mb-2">Something went wrong.</h1>
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {this.state.error?.toString()}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

console.log("React app mounted");
