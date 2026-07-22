import React from 'react';
import './PanelWorkspacePrototype.css';

type PanelAction = {
  label: string;
  symbol: string;
};

type PanelFrameProps = React.PropsWithChildren<{
  className?: string;
  headerAccessory?: React.ReactNode;
  minified?: boolean;
  title: string;
}>;

const PANEL_ACTIONS: readonly PanelAction[] = [
  { label: 'Minimize panel', symbol: '−' },
  { label: 'Duplicate panel', symbol: '□' },
  { label: 'Float panel', symbol: '↗' },
  { label: 'More panel actions', symbol: '⋮' },
  { label: 'Close panel', symbol: '×' },
] as const;

const CODE_ROWS = [
  ['00000000', '4E56', 'LINK', 'A6,#$0000'],
  ['00000002', '203C 0000', 'MOVE.L', '#$00000000,D0'],
  ['00000006', '303C 0FFF', 'MOVE.L', '#$0000FFF,D1'],
  ['0000000A', '33FC 000C', 'MOVE.L', '#$0000000C,D1'],
  ['0000000E', '23FC 0000', 'MOVE.L', '#$00000000,A0'],
  ['00000012', '7200', 'MOVEQ', '#0,D1'],
  ['00000014', '33C0', 'MOVE.L', 'D0,(A0)'],
  ['00000016', '5280', 'ADDQ.L', '#4,A0'],
  ['0000001A', '5241', 'ADDQ.L', '#1,D1'],
  ['0000001E', 'B2FC 000C', 'CMP.L', 'D1,#$0000000C'],
  ['00000022', '6C F6', 'BGE', '$0000001A'],
  ['00000024', '7001', 'MOVEQ', '#1,D0'],
  ['00000026', '4E75', 'RTS', ''],
  ['00000028', '0000', 'DC.W', '$0000'],
  ['0000002A', '0000', 'DC.W', '$0000'],
  ['0000002C', '0000', 'DC.W', '$0000'],
  ['0000002E', '0000', 'DC.W', '$0000'],
  ['00000030', '0000', 'DC.W', '$0000'],
  ['00000032', '0000', 'DC.W', '$0000'],
  ['00000034', '0000', 'DC.W', '$0000'],
  ['00000036', '0000', 'DC.W', '$0000'],
  ['00000038', '0000', 'DC.W', '$0000'],
  ['0000003A', '0000', 'DC.W', '$0000'],
  ['0000003C', '0000', 'DC.W', '$0000'],
  ['0000003E', '0000', 'DC.W', '$0000'],
  ['00000040', '0000', 'DC.W', '$0000'],
  ['00000042', '0000', 'DC.W', '$0000'],
  ['00000044', '0000', 'DC.W', '$0000'],
  ['00000046', '0000', 'DC.W', '$0000'],
  ['00000048', '0000', 'DC.W', '$0000'],
  ['0000004A', '0000', 'DC.W', '$0000'],
  ['0000004C', '0000', 'DC.W', '$0000'],
  ['0000004E', '0000', 'DC.W', '$0000'],
  ['00000050', '0000', 'DC.W', '$0000'],
  ['00000052', '0000', 'DC.W', '$0000'],
] as const;

const DATA_REGISTERS = [
  ['D0', '00000001', true],
  ['D1', '0000000C', false],
  ['D2', '00000000', false],
  ['D3', '00000000', false],
  ['D4', '00000000', false],
  ['D5', '00000000', false],
  ['D6', '00000000', false],
  ['D7', '00000000', false],
] as const;

const ADDRESS_REGISTERS = [
  ['A0', '00001030', true],
  ['A1', '00000000', false],
  ['A2', '00000000', false],
  ['A3', '00000000', false],
  ['A4', '00000000', false],
  ['A5', '00000000', false],
  ['A6', '0000FFF0', true],
  ['A7', '00001000', true],
] as const;

const MEMORY_ROWS = [
  [
    '00001000:',
    [
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
  [
    '00001010:',
    [
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
  [
    '00001020:',
    [
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
  [
    '00001030:',
    [
      '01',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '30',
      '10',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
  [
    '00001040:',
    [
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
  [
    '00001050:',
    [
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
  [
    '00001060:',
    [
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
  [
    '00001070:',
    [
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
      '00',
    ],
  ],
] as const;

function StaticControl({
  children,
  className = '',
  label,
}: React.PropsWithChildren<{ className?: string; label: string }>): React.ReactElement {
  return (
    <span aria-label={label} className={`panel-prototype-control ${className}`.trim()} role="img">
      {children}
    </span>
  );
}

function PanelFrame({
  children,
  className = '',
  headerAccessory,
  minified = false,
  title,
}: PanelFrameProps): React.ReactElement {
  return (
    <section
      aria-label={`${title} prototype panel`}
      className={`panel-prototype-frame ${minified ? 'panel-prototype-frame--minified' : ''} ${className}`.trim()}
      data-panel-prototype={title.toLowerCase().replace(/\s+/g, '-')}
    >
      <header className="panel-prototype-header">
        <span aria-hidden="true" className="panel-prototype-grip">
          ⠿
        </span>
        <h2>{title}</h2>
        {headerAccessory ? (
          <div className="panel-prototype-header-accessory">{headerAccessory}</div>
        ) : null}
        <div aria-hidden="true" className="panel-prototype-actions">
          {PANEL_ACTIONS.map((action) => (
            <span className="panel-prototype-action" key={action.label} title={action.label}>
              {action.symbol}
            </span>
          ))}
        </div>
      </header>
      {!minified ? <div className="panel-prototype-body">{children}</div> : null}
    </section>
  );
}

function PrototypeToolbar(): React.ReactElement {
  return (
    <header className="panel-prototype-toolbar">
      <StaticControl className="panel-prototype-brand" label="M68K">
        68
      </StaticControl>
      <StaticControl className="panel-prototype-menu" label="Menu">
        <span className="panel-prototype-menu-icon">☰</span>
        <span>Menu</span>
      </StaticControl>
      <StaticControl
        className="panel-prototype-select panel-prototype-select--view"
        label="Debug view"
      >
        <strong>Debug</strong>
        <span className="panel-prototype-chevron" />
      </StaticControl>
      <StaticControl
        className="panel-prototype-select panel-prototype-select--columns"
        label="Three columns"
      >
        <span className="panel-prototype-grid-icon" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <strong>3 Columns</strong>
        <span className="panel-prototype-chevron" />
      </StaticControl>
      <StaticControl className="panel-prototype-add" label="Add panel">
        <span className="panel-prototype-plus">＋</span>
        <strong>Add Panel</strong>
      </StaticControl>
      <div className="panel-prototype-execution" aria-label="Execution controls">
        <StaticControl className="panel-prototype-square-control" label="Play">
          <span className="panel-prototype-play" />
        </StaticControl>
        <StaticControl className="panel-prototype-square-control" label="Stop">
          <span className="panel-prototype-stop" />
        </StaticControl>
        <StaticControl
          className="panel-prototype-square-control panel-prototype-rotate"
          label="Redo"
        >
          ⟳
        </StaticControl>
        <StaticControl
          className="panel-prototype-square-control panel-prototype-rotate"
          label="Undo"
        >
          ⟲
        </StaticControl>
      </div>
      <div className="panel-prototype-speed">
        <span>SPEED</span>
        <StaticControl className="panel-prototype-speed-value" label="Speed one">
          <span className="panel-prototype-gauge" />
          <strong>1</strong>
        </StaticControl>
      </div>
    </header>
  );
}

function PrototypeCodePanel(): React.ReactElement {
  return (
    <PanelFrame className="panel-prototype-code-panel" title="Code">
      <div className="panel-prototype-code" role="table" aria-label="Static assembly listing">
        {CODE_ROWS.map(([address, words, opcode, operand]) => {
          const selected = address === '0000001A';
          return (
            <div
              className={`panel-prototype-code-row ${selected ? 'panel-prototype-code-row--selected' : ''}`}
              key={address}
              role="row"
            >
              <span className="panel-prototype-code-pointer">{selected ? '➜' : ''}</span>
              <span className="panel-prototype-code-address">{address}</span>
              <span>{words}</span>
              <span className="panel-prototype-code-opcode">{opcode}</span>
              <span className="panel-prototype-code-operand">{operand}</span>
            </div>
          );
        })}
      </div>
    </PanelFrame>
  );
}

function PrototypeScreenPanel(): React.ReactElement {
  const status = (
    <span className="panel-prototype-interactive">
      <i />
      Interactive
    </span>
  );

  return (
    <PanelFrame className="panel-prototype-screen-panel" headerAccessory={status} title="Screen">
      <div className="panel-prototype-crt-shell">
        <div className="panel-prototype-crt">
          <div className="panel-prototype-game-title">
            <span>NIBBLES</span>
            <span>NEON SERPENT ARCADE</span>
            <span>SELECT DIFFICULTY</span>
          </div>
          <div className="panel-prototype-difficulty-grid">
            <span>EASY</span>
            <span className="panel-prototype-difficulty--selected">MEDIUM</span>
            <span className="panel-prototype-difficulty--hard">HARD</span>
            <span className="panel-prototype-difficulty--insane">INSANE</span>
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}

function RegisterList({
  entries,
}: {
  entries: readonly (readonly [string, string, boolean])[];
}): React.ReactElement {
  return (
    <div className="panel-prototype-register-card">
      {entries.map(([name, value, changed]) => (
        <div className="panel-prototype-register-row" key={name}>
          <strong>{name}</strong>
          <span className={changed ? 'is-changed' : ''}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function PrototypeRegistersPanel(): React.ReactElement {
  return (
    <PanelFrame className="panel-prototype-registers-panel" title="Registers">
      <div className="panel-prototype-register-grid">
        <RegisterList entries={DATA_REGISTERS} />
        <RegisterList entries={ADDRESS_REGISTERS} />
        <div className="panel-prototype-register-card panel-prototype-status-card">
          <div className="panel-prototype-register-row">
            <strong>PC</strong>
            <span className="is-changed">0000001E</span>
          </div>
          <div className="panel-prototype-register-row">
            <strong>SR</strong>
            <span className="is-changed">2000</span>
          </div>
          {(['X', 'N', 'Z', 'V', 'C'] as const).map((flag) => (
            <div className="panel-prototype-flag-row" key={flag}>
              <strong>{flag}</strong>
              <span className={flag === 'Z' ? 'is-set' : ''}>0</span>
            </div>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}

function PrototypeMemoryPanel(): React.ReactElement {
  const offsets = Array.from({ length: 16 }, (_, index) => `+${index.toString(16).toUpperCase()}`);

  return (
    <PanelFrame className="panel-prototype-memory-panel" title="Memory">
      <div className="panel-prototype-memory-toolbar">
        <span>ADDRESS</span>
        <StaticControl className="panel-prototype-memory-field" label="Address 00001000">
          00001000
        </StaticControl>
        <StaticControl className="panel-prototype-memory-small" label="Previous memory page">
          ‹
        </StaticControl>
        <StaticControl className="panel-prototype-memory-size" label="Sixteen bytes">
          <span>16</span>
          <span className="panel-prototype-chevron" />
        </StaticControl>
        <span className="panel-prototype-refresh-label">REFRESH</span>
        <StaticControl className="panel-prototype-memory-small" label="Refresh memory">
          ↻
        </StaticControl>
      </div>
      <div className="panel-prototype-memory-table" role="table" aria-label="Static memory dump">
        <div className="panel-prototype-memory-head" role="row">
          <span />
          <span className="panel-prototype-offsets">
            {offsets.map((offset) => (
              <i key={offset}>{offset}</i>
            ))}
          </span>
          <span>ASCII</span>
        </div>
        {MEMORY_ROWS.map(([address, values], rowIndex) => (
          <div className="panel-prototype-memory-row" key={address} role="row">
            <span>{address}</span>
            <span className="panel-prototype-memory-values">
              {values.map((value, valueIndex) => (
                <i
                  className={
                    rowIndex === 3 && ['01', '30', '10'].includes(value) ? 'is-changed' : ''
                  }
                  key={`${address}-${valueIndex}`}
                >
                  {value}
                </i>
              ))}
            </span>
            <span>................</span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

export default function PanelWorkspacePrototype(): React.ReactElement {
  return (
    <div className="panel-workspace-prototype" data-testid="panel-workspace-prototype">
      <PrototypeToolbar />
      <main className="panel-prototype-workspace">
        <div className="panel-prototype-column panel-prototype-column--code">
          <PrototypeCodePanel />
        </div>
        <div className="panel-prototype-column panel-prototype-column--screen">
          <PrototypeScreenPanel />
          <PanelFrame className="panel-prototype-help-panel" title="Help">
            <span className="panel-prototype-empty" />
          </PanelFrame>
        </div>
        <div className="panel-prototype-column panel-prototype-column--inspector">
          <PrototypeRegistersPanel />
          <PrototypeMemoryPanel />
          <PanelFrame className="panel-prototype-hardware-panel" minified title="Hardware I/O" />
        </div>
      </main>
    </div>
  );
}
