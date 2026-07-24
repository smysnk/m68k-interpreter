import React from 'react';

interface Props extends React.PropsWithChildren {
  panelTitle: string;
  onClose: () => void;
}

interface State { failed: boolean }

export default class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="panel-error" role="alert">
        <strong>{this.props.panelTitle} could not render.</strong>
        <div className="panel-error-actions">
          <button onClick={() => this.setState({ failed: false })} type="button">Retry</button>
          <button onClick={this.props.onClose} type="button">Close panel</button>
        </div>
      </div>
    );
  }
}
