import React from 'react';
import { useSelector } from 'react-redux';
import { selectStatusBarModel } from '@/store/statusBarSelectors';
import type { RootState } from '@/store';

const PERSONAL_WEBSITE_URL = 'https://smysnk.com';
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/josh1g';

const StatusBar: React.FC = () => {
  const model = useSelector((state: RootState) => selectStatusBarModel(state));

  return (
    <footer className="status-bar" aria-label="IDE status bar">
      <div className="status-bar-section status-bar-section-left">
        <span className={`status-pill status-pill-${model.runtime.tone}`}>{model.runtime.label}</span>
      </div>
      <div className="status-bar-section status-bar-section-center" />
      <div className="status-bar-section status-bar-section-right">
        <a
          className="status-bar-link status-bar-link-website"
          href={PERSONAL_WEBSITE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          smysnk.com
        </a>
        <a
          className="status-bar-link status-bar-link-coffee"
          href={BUY_ME_A_COFFEE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Buy me a coffee
        </a>
      </div>
    </footer>
  );
};

export default StatusBar;
