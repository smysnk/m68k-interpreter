import React from 'react';
import { useSelector } from 'react-redux';
import { selectStatusBarModel } from '@/store/statusBarSelectors';
import type { RootState } from '@/store';
import { useCompactShell } from '@/hooks/useCompactShell';

const PERSONAL_WEBSITE_URL = 'https://smysnk.com';
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/josh1g';

const StatusBar: React.FC = () => {
  const model = useSelector((state: RootState) => selectStatusBarModel(state));
  const isCompactShell = useCompactShell();

  const websiteLink = (
    <a
      className="status-bar-link status-bar-link-website"
      href={PERSONAL_WEBSITE_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      smysnk.com
    </a>
  );

  const coffeeLink = (
    <a
      className="status-bar-link status-bar-link-coffee"
      href={BUY_ME_A_COFFEE_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      Buy me a coffee
    </a>
  );

  return (
    <footer
      className="status-bar"
      aria-label="IDE status bar"
      data-compact={isCompactShell ? 'true' : 'false'}
    >
      {isCompactShell ? (
        <div className="status-bar-inline" data-testid="status-bar-inline">
          <span className={`status-pill status-pill-${model.runtime.tone}`}>{model.runtime.label}</span>
          {websiteLink}
          {coffeeLink}
        </div>
      ) : (
        <>
          <div className="status-bar-section status-bar-section-left">
            <span className={`status-pill status-pill-${model.runtime.tone}`}>{model.runtime.label}</span>
          </div>
          <div className="status-bar-section status-bar-section-center" />
          <div className="status-bar-section status-bar-section-right">
            {websiteLink}
            {coffeeLink}
          </div>
        </>
      )}
    </footer>
  );
};

export default StatusBar;
