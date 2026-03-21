import React from 'react';

const HelpPanel: React.FC = () => {
  return (
    <aside className="help-panel pane-surface" aria-label="Compatibility notes">
      <div className="pane-header">
        <div className="pane-title-group">
          <p className="pane-eyebrow">Reference</p>
          <h2 className="pane-title">Compatibility Notes</h2>
          <p className="pane-caption">Current Nibbles workflow, runtime support, and known limits.</p>
        </div>
      </div>

      <div className="help-panel-section">
        <h3>Play Nibbles</h3>
        <p>Select `nibbles.asm` from the file explorer, press Run, then use W A S D, arrow keys, or keypad 4 5 6 8. Press Enter to confirm menus.</p>
        <p>Reset clears the current emulator session and terminal so the loaded program can be launched again from a clean state.</p>
        <p>Nibbles runs on the default `Interpreter` engine so the game starts on the supported runtime path.</p>
      </div>

      <div className="help-panel-section">
        <h3>Engine Modes</h3>
        <ul className="help-panel-list">
          <li>`Interpreter` is the default runtime and the recommended engine for Nibbles and general browser use.</li>
          <li>`Interpreter Redux` is experimental and is currently intended for parity work, reducer-state validation, and simple-program testing.</li>
          <li>The reducer engine stays available in the dropdown, but it is not yet the supported path for full Nibbles gameplay.</li>
        </ul>
      </div>

      <div className="help-panel-section">
        <h3>Supported Easy68K Subset</h3>
        <ul className="help-panel-list">
          <li>Assembler compatibility for standalone labels, `END &lt;label&gt;`, `EQU`, `DC.B/W/L`, `DS.B/W/L`, and character immediates.</li>
          <li>Runtime support for the Nibbles instruction subset including `MOVE`, `MOVEA`, `LEA`, `BRA/Bxx`, `BSR`, `JSR`, `RTS`, `MULU`, `DIVU`, `MOVEM`, and `BTST`.</li>
          <li>Easy68K trap tasks used by Nibbles: `TRAP #15` tasks `1`, `3`, and `4`, plus `TRAP #11` task `0` for halt.</li>
          <li>Terminal rendering for clear screen, cursor motion, carriage return, line feed, and ANSI SGR color/style sequences used by the game.</li>
        </ul>
      </div>

      <div className="help-panel-section">
        <h3>Known Limitations</h3>
        <ul className="help-panel-list">
          <li>This is a targeted Easy68K subset for terminal-first programs like Nibbles, not full simulator compatibility.</li>
          <li>Trainer board DUART routines and generic graphics devices are not implemented in this build.</li>
          <li>The runtime is tuned for browser playability and deterministic tests, not cycle accuracy.</li>
          <li>The IDE currently uses the internal fixed-grid terminal adapter surface; broader display integration remains a future swap.</li>
        </ul>
      </div>
    </aside>
  );
};

export default HelpPanel;
