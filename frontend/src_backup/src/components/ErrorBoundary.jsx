'use client';
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("UI Uncaught Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#09090b',
                    color: '#fff',
                    padding: '20px'
                }}>
                    <div style={{
                        maxWidth: '400px',
                        textAlign: 'center',
                        padding: '30px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 51, 102, 0.3)',
                        borderRadius: '16px'
                    }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'rgba(255, 51, 102, 0.1)',
                            color: '#ff3366',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px'
                        }}>
                            <AlertTriangle size={24} />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px' }}>Something went wrong</h2>
                        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.875rem', marginBottom: '24px' }}>
                            {this.state.error?.toString() || 'An unexpected error occurred.'}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                background: '#ff3366',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            <RefreshCw size={16} />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
