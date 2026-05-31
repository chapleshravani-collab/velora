import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("CRITICAL MISSION FAILURE:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100vh', width: '100vw', background: '#020408', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontFamily: '\'JetBrains Mono\', monospace', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '20px' }}>⚠️ TERMINAL CRASHOUT ⚠️</h1>
          <p style={{ opacity: 0.8, marginBottom: '40px' }}>A critical error occurred while processing intelligence. Attempting to restore transmission...</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #10b981, #065f46)', borderRadius: '24px', color: 'white', fontWeight: 900, cursor: 'pointer', border: 'none', boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)' }}
          >
            REBOOT SYSTEM
          </button>
          {process.env.NODE_ENV !== 'production' && (
            <pre style={{ marginTop: '40px', fontSize: '0.8rem', color: '#ef4444', background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '12px', textAlign: 'left', maxWidth: '100%', overflow: 'auto' }}>
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
