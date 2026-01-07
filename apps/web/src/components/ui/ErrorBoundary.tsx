'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-l2-dark p-4 text-center">
          <div className="text-4xl mb-4">💀</div>
          <h2 className="text-lg font-bold text-red-400 mb-2">
            Oops! Something went wrong
          </h2>
          <p className="text-sm text-gray-400 mb-4 max-w-xs">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-l2-gold text-black rounded font-bold text-sm hover:bg-l2-gold/80"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
