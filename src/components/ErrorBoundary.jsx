import React from 'react';

class BoundaryCore extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        // eslint-disable-next-line no-console
        console.error(`[${this.props.scope || 'Boundary'}] React error boundary caught an error`, error, info);
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return this.props.fallback || (
            <div className="mx-auto max-w-3xl rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-rose-50">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-200">{this.props.scope || 'Application'} error</p>
                <h1 className="mt-3 text-3xl font-semibold">Something went wrong</h1>
                <p className="mt-4 leading-7 text-rose-50/90">
                    {this.state.error?.message || 'A runtime error interrupted this view. Refresh after checking the logs.'}
                </p>
            </div>
        );
    }
}

export const AppErrorBoundary = ({ children }) => <BoundaryCore scope="Application">{children}</BoundaryCore>;

export const RouteErrorBoundary = ({ children }) => <BoundaryCore scope="Route">{children}</BoundaryCore>;