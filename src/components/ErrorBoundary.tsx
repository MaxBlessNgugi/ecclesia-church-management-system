// =============================================================================
// ErrorBoundary — Application-level React error boundary
// =============================================================================
//
// PURPOSE
//   Catches uncaught JavaScript errors thrown during rendering in any child
//   component tree and displays a graceful fallback UI instead of an invisible
//   blank screen. Without this, any unhandled render error crashes the entire
//   SPA and leaves the user with a white page and no recourse.
//
// USAGE
//   Wrap the root <App /> in main.tsx:
//     <ErrorBoundary>
//       <App />
//     </ErrorBoundary>
//
// ERROR REPORTING
//   componentDidCatch() logs the error and component stack to the console.
//   In a production setup, replace the console.error with a call to an
//   error reporting service (e.g., Sentry, Rollbar).
//
// RECOVERY
//   The "Reload page" button calls window.location.reload() which re-mounts
//   the entire React tree from scratch — the simplest and most reliable
//   recovery path.
// =============================================================================
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /**
   * React lifecycle: called during render when a descendant throws.
   * Updates state to trigger the fallback UI on the next render pass.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  /**
   * React lifecycle: called after the error has been committed.
   * Use this to report to an external monitoring service.
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
    // TODO: forward to an error reporting service in production:
    // reportError(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f9f9f9',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '2.5rem 3rem',
              maxWidth: '480px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
            }}
          >
            {/* Red warning icon */}
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>

            <h2 style={{ margin: '0 0 0.5rem', color: '#1a1a1a', fontSize: '1.25rem', fontWeight: 600 }}>
              Something went wrong
            </h2>

            <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: '1.5' }}>
              An unexpected error occurred in the application. Your data has not been affected.
            </p>

            {/* Show error message in development for debugging */}
            {this.state.error && process.env.NODE_ENV !== 'production' && (
              <pre
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  fontSize: '0.75rem',
                  color: '#b91c1c',
                  textAlign: 'left',
                  overflowX: 'auto',
                  marginBottom: '1.5rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </pre>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#1d4ed8')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#2563eb')}
              >
                Reload page
              </button>

              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                style={{
                  background: '#fff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = '#9ca3af')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = '#d1d5db')}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
