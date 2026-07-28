import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface the real error (message + component stack) for debugging.
    console.error('[v0] ErrorBoundary caught:', error?.message, error?.stack, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl border border-red-500/30 bg-red-500/[0.06] p-6">
            <h1 className="text-red-400 text-lg font-bold mb-2">Something went wrong</h1>
            <p className="text-slate-300 text-sm mb-3">
              {this.state.error?.message || String(this.state.error)}
            </p>
            <pre className="text-slate-500 text-[11px] whitespace-pre-wrap max-h-60 overflow-auto mb-4">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
