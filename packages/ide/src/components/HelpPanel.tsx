import React from 'react';

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

      <div className="help-panel-section">
        <h3>Panel Workspace</h3>
        <ul className="help-panel-list">
          <li>
            Choose one to four columns, then add Screen, Code, Registers, Memory, Seven-segment,
            combined Digital I/O and IRQ, or Help panels from the View menu.
          </li>
          <li>Drag a panel by its header to reorder it or move it between columns.</li>
          <li>
            Minimize retains a compact header, and close removes the panel from the current layout.
          </li>
          <li>
            Only the Screen marked Interactive owns keyboard, touch, focus, and terminal geometry.
            Click a passive Screen mirror to transfer ownership.
          </li>
          <li>
            The Layouts menu applies immutable built-in views and saves, restores, renames, or
            deletes personal views. The active draft resumes automatically after reload.
          </li>
          <li>
            On compact screens, the desktop layout is preserved and projected through a single-panel
            switcher.
          </li>
        </ul>
      </div>

      <div className="help-panel-section">
        <h3>Play Nibbles</h3>
        <p>
          Select `nibbles.asm` from the file explorer, press Run, then use W A S D, arrow keys, or
          keypad 4 5 6 8. Press Enter to confirm menus.
        </p>
        <p>
          Reset clears the current emulator session and terminal so the loaded program can be
          launched again from a clean state.
        </p>
        <p>
          The IDE composes a strict byte-addressed CPU model with an independent machine profile.
          The Easy68K machine layers terminal, trap, and trainer-board services onto either CPU.
        </p>
      </div>

      <div className="help-panel-section">
        <h3>MC68000 And Easy68K Support</h3>
        <ul className="help-panel-list">
          <li>
            Assembler compatibility for standalone labels, `END &lt;label&gt;`, `EQU`, `DC.B/W/L`,
            `DS.B/W/L`, and character immediates.
          </li>
          <li>
            The strict core implements every MC68000 instruction form in the generated ISA manifest.
            MC68010 additions depend only on the selected CPU model.
          </li>
          <li>
            Easy68K trap tasks used by Nibbles: `TRAP #15` tasks `1`, `3`, and `4`, plus `TRAP #11`
            task `0` for halt.
          </li>
          <li>
            Terminal rendering for clear screen, cursor motion, carriage return, line feed, and ANSI
            SGR color/style sequences used by the game.
          </li>
          <li>
            Memory-mapped EASy68K hardware: independently addressable eight-byte seven-segment
            displays and digital I/O boards with shared switch/LED bytes, active-low buttons, and
            configurable 24-bit addresses.
          </li>
          <li>
            Level 1–7 autovector interrupts with SR masking, supervisor stack frames, automatic
            scheduling, and `RTE`.
          </li>
        </ul>
      </div>

      <div className="help-panel-section">
        <h3>Known Limitations</h3>
        <ul className="help-panel-list">
          <li>
            Easy68K terminal and device services are a targeted compatibility subset; this does not
            limit strict MC68000 instruction coverage.
          </li>
          <li>
            Trainer board DUART routines and generic graphics/framebuffer devices beyond the
            Hardware I/O Board are not implemented.
          </li>
          <li>
            Exact address-error microcycles, internal frame words, and prefetch-stage attribution
            remain temporal-conformance quarantines.
          </li>
          <li>
            The IDE currently uses the internal fixed-grid terminal adapter surface; broader display
            integration remains a future swap.
          </li>
        </ul>
      </div>
    </aside>
  );
};

export default HelpPanel;
