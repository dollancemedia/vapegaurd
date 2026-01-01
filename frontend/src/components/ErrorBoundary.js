import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Runtime error:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, width: '90%', maxWidth: 420, boxShadow: '0 10px 15px rgba(0,0,0,0.05)' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>Something went wrong</h2>
            <p style={{ marginTop: 8, fontSize: 14, color: '#6b7280' }}>
              The page crashed due to a runtime error. Try reloading.
            </p>
            <button
              onClick={this.handleRetry}
              style={{ marginTop: 12, padding: '8px 12px', background: '#00C2CB', color: '#fff', borderRadius: 6, border: 'none' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
