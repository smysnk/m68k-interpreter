import React from 'react';
import helpContent from '@/content/helpContent.json';

const HelpPanel: React.FC = () => {
  return (
    <aside className="help-panel pane-surface" aria-label="Compatibility notes">
      <div className="pane-header">
        <div className="pane-title-group">
          <p className="pane-eyebrow">Reference</p>
          <h2 className="pane-title">Compatibility Notes</h2>
          <p className="pane-caption">
            Current Nibbles workflow, runtime support, and known limits.
          </p>
        </div>
      </div>

      {helpContent.sections.map((section) => (
        <div className="help-panel-section" key={section.id}>
          <h3>{section.title}</h3>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.items ? (
            <ul className="help-panel-list">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
    </aside>
  );
};

export default HelpPanel;
