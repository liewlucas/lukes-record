/**
 * A broken scene must never take the page with it: on any error the island unmounts itself and
 * the 2D layer (which is the whole site anyway) carries on.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class SceneErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    delete document.documentElement.dataset.scene;
    if (import.meta.env.DEV) console.error('[scene]', error, info.componentStack);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
