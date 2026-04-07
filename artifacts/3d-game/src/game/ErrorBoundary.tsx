import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }
  render() {
    if (this.state.hasError) {
      const isWebGL = this.state.message.toLowerCase().includes('webgl');
      return (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-8"
          style={{ background: '#030610' }}
        >
          <div
            className="text-4xl font-black mb-4"
            style={{ color: '#cc3300', fontFamily: 'Georgia, serif' }}
          >
            {isWebGL ? 'WebGL Required' : 'Error'}
          </div>
          <div className="text-base mb-6" style={{ color: '#a08060', maxWidth: 480 }}>
            {isWebGL
              ? 'Your browser or device does not support WebGL, which is required to run this 3D game. Please try a modern browser like Chrome, Firefox, or Edge with hardware acceleration enabled.'
              : this.state.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(180deg, #6b1a1a, #380808)',
              border: '2px solid #991100',
              color: '#ffcc80',
              padding: '10px 28px',
              cursor: 'pointer',
              fontFamily: 'Georgia, serif',
              letterSpacing: '0.1em',
            }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
