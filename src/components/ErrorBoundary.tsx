import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="card p-4 text-center text-sm text-slate-500">
          تعذّر تحميل هذا القسم. أعد تحميل الصفحة للمحاولة مرة أخرى.
        </div>
      );
    }
    return this.props.children;
  }
}
