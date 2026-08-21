import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { DebugBreakpointSpec } from '@m68k/interpreter';
import {
  commitDebuggerPanelConfiguration,
  removeBreakpoint,
  removeWatch,
  removeWatchpoint,
  setBreakOnException,
  setBreakOnInterrupt,
  toggleBreakpointEnabled,
  upsertBreakpoint,
  upsertWatch,
  upsertWatchpoint,
  type AppDispatch,
  type PanelInstance,
  type RootState,
} from '@/store';

interface Props {
  instance: PanelInstance;
}

function parseAddress(value: string): number | undefined {
  const normalized = value.trim().replace(/^\$/, '0x');
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed & 0x00ff_ffff : undefined;
}

function hex(value: number | undefined, digits = 8): string {
  return value === undefined
    ? '—'
    : `$${(value >>> 0).toString(16).toUpperCase().padStart(digits, '0')}`;
}

export default function DebuggerPanel({ instance }: Props): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const configuration = useSelector((state: RootState) => state.debugger.configuration);
  const snapshot = useSelector((state: RootState) => state.debugger.snapshot);
  const sourceStale = useSelector((state: RootState) => state.debugger.sourceStale);
  const [addressInput, setAddressInput] = useState('');
  const [watchInput, setWatchInput] = useState('');
  const [watchpointInput, setWatchpointInput] = useState('');
  const panelConfig =
    instance.config.kind === 'debugger'
      ? instance.config
      : { kind: 'debugger' as const, collapsedSections: [], radix: 'hex' as const };

  const toggleSection = (section: string): void => {
    const collapsed = panelConfig.collapsedSections.includes(section);
    dispatch(
      commitDebuggerPanelConfiguration({
        panelId: instance.id,
        config: {
          ...panelConfig,
          collapsedSections: collapsed
            ? panelConfig.collapsedSections.filter((item) => item !== section)
            : [...panelConfig.collapsedSections, section],
        },
      })
    );
  };

  const addAddressBreakpoint = (): void => {
    const address = parseAddress(addressInput);
    if (address === undefined) return;
    dispatch(
      upsertBreakpoint({
        id: `address-${address.toString(16)}-${Date.now().toString(36)}`,
        enabled: true,
        kind: 'address',
        address,
      })
    );
    setAddressInput('');
  };

  const updateCondition = (breakpoint: DebugBreakpointSpec, condition: string): void => {
    dispatch(upsertBreakpoint({ ...breakpoint, condition: condition.trim() || undefined }));
  };

  const updateHitCondition = (breakpoint: DebugBreakpointSpec, value: string): void => {
    const normalized = value.trim();
    if (!normalized) {
      dispatch(upsertBreakpoint({ ...breakpoint, hitCondition: undefined }));
      return;
    }
    const match = /^(==|>=|%)?\s*(\d+)$/.exec(normalized);
    if (!match || Number(match[2]) <= 0) return;
    dispatch(
      upsertBreakpoint({
        ...breakpoint,
        hitCondition: {
          operator: (match[1] || '>=') as '==' | '>=' | '%',
          value: Number(match[2]),
        },
      })
    );
  };

  const section = (
    id: string,
    title: string,
    count: number | undefined,
    children: React.ReactNode
  ): React.ReactElement => {
    const collapsed = panelConfig.collapsedSections.includes(id);
    return (
      <section className="debugger-section" data-debug-section={id}>
        <button
          aria-expanded={!collapsed}
          className="debugger-section-heading"
          onClick={() => toggleSection(id)}
          type="button"
        >
          <span>{title}</span>
          {count !== undefined ? <span className="debugger-count">{count}</span> : null}
        </button>
        {!collapsed ? <div className="debugger-section-body">{children}</div> : null}
      </section>
    );
  };

  return (
    <div className="debugger-panel" data-testid="debugger-panel">
      <div className="debugger-stop-summary" aria-live="polite">
        <strong>{snapshot.status}</strong>
        <span>{snapshot.stop ? snapshot.stop.reason.replace(/-/g, ' ') : 'No active stop'}</span>
        <code>{hex(snapshot.stop?.pc)}</code>
        {snapshot.stop?.source ? <span>Line {snapshot.stop.source.line}</span> : null}
        {sourceStale ? (
          <span className="debugger-warning">Source changed · reassemble to bind</span>
        ) : null}
      </div>

      {section(
        'breakpoints',
        'Breakpoints',
        configuration.breakpoints.length,
        <>
          <form
            className="debugger-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              addAddressBreakpoint();
            }}
          >
            <input
              aria-label="Breakpoint address"
              onChange={(event) => setAddressInput(event.target.value)}
              placeholder="$00001000"
              value={addressInput}
            />
            <button type="submit">Add</button>
          </form>
          <label className="debugger-policy-toggle">
            <input
              checked={configuration.breakOnException === true}
              onChange={(event) => dispatch(setBreakOnException(event.target.checked))}
              type="checkbox"
            />
            Break on exception
          </label>
          <label className="debugger-policy-toggle">
            <input
              checked={configuration.breakOnInterrupt === true}
              onChange={(event) => dispatch(setBreakOnInterrupt(event.target.checked))}
              type="checkbox"
            />
            Break on interrupt
          </label>
          <div className="debugger-list">
            {configuration.breakpoints.map((breakpoint) => {
              const resolved = snapshot.breakpoints.find((item) => item.id === breakpoint.id);
              const label =
                breakpoint.kind === 'source'
                  ? `Line ${breakpoint.line ?? '?'}`
                  : breakpoint.kind === 'address'
                    ? hex(breakpoint.address)
                    : (breakpoint.label ?? breakpoint.kind);
              return (
                <div className="debugger-list-item" key={breakpoint.id}>
                  <input
                    aria-label={`Enable ${label}`}
                    checked={breakpoint.enabled}
                    onChange={() => dispatch(toggleBreakpointEnabled(breakpoint.id))}
                    type="checkbox"
                  />
                  <span
                    aria-label={resolved?.bound ? 'Bound breakpoint' : 'Unbound breakpoint'}
                    className={`debugger-breakpoint-dot ${resolved?.bound ? 'bound' : 'unbound'}`}
                  />
                  <div className="debugger-list-main">
                    <strong>{label}</strong>
                    <small>{resolved?.diagnostic ?? `${resolved?.hitCount ?? 0} hits`}</small>
                    <input
                      aria-label={`Condition for ${label}`}
                      defaultValue={breakpoint.condition ?? ''}
                      key={`${breakpoint.id}:${breakpoint.condition ?? ''}`}
                      onBlur={(event) => updateCondition(breakpoint, event.target.value)}
                      placeholder="Condition"
                    />
                    <input
                      aria-label={`Hit count for ${label}`}
                      defaultValue={
                        breakpoint.hitCondition
                          ? `${breakpoint.hitCondition.operator}${breakpoint.hitCondition.value}`
                          : ''
                      }
                      key={`${breakpoint.id}:hit:${breakpoint.hitCondition?.operator ?? ''}:${breakpoint.hitCondition?.value ?? ''}`}
                      onBlur={(event) => updateHitCondition(breakpoint, event.target.value)}
                      placeholder="Hits: >=3, ==1, %5"
                    />
                    <input
                      aria-label={`Log message for ${label}`}
                      defaultValue={breakpoint.logMessage ?? ''}
                      key={`${breakpoint.id}:log:${breakpoint.logMessage ?? ''}`}
                      onBlur={(event) =>
                        dispatch(
                          upsertBreakpoint({
                            ...breakpoint,
                            logMessage: event.target.value.trim() || undefined,
                          })
                        )
                      }
                      placeholder="Log message (does not pause)"
                    />
                  </div>
                  <button
                    aria-label={`Remove ${label}`}
                    onClick={() => dispatch(removeBreakpoint(breakpoint.id))}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {configuration.breakpoints.length === 0 ? (
              <p className="debugger-empty">No breakpoints</p>
            ) : null}
          </div>
        </>
      )}

      {section(
        'call-stack',
        'Call Stack',
        snapshot.callStack.length,
        <div className="debugger-list">
          {[...snapshot.callStack].reverse().map((frame, index) => (
            <div className="debugger-list-item debugger-call-frame" key={frame.id}>
              <span>{index}</span>
              <div className="debugger-list-main">
                <strong>{frame.name}</strong>
                <small>
                  {frame.kind} · {hex(frame.address)}
                </small>
              </div>
            </div>
          ))}
          {snapshot.callStack.length === 0 ? (
            <p className="debugger-empty">No active frames</p>
          ) : null}
        </div>
      )}

      {section(
        'watches',
        'Watch',
        configuration.watches?.length ?? 0,
        <>
          <form
            className="debugger-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!watchInput.trim()) return;
              dispatch(
                upsertWatch({
                  id: `watch-${Date.now().toString(36)}`,
                  expression: watchInput.trim(),
                })
              );
              setWatchInput('');
            }}
          >
            <input
              aria-label="Watch expression"
              onChange={(event) => setWatchInput(event.target.value)}
              placeholder="D0 or (A0).W"
              value={watchInput}
            />
            <button type="submit">Add</button>
          </form>
          <div className="debugger-list">
            {(configuration.watches ?? []).map((watch) => {
              const value = snapshot.watches.find((item) => item.id === watch.id);
              return (
                <div className="debugger-list-item" key={watch.id}>
                  <div className="debugger-list-main">
                    <strong>{watch.expression}</strong>
                    <small>{value?.diagnostic ?? hex(value?.value)}</small>
                  </div>
                  <button
                    aria-label={`Remove watch ${watch.expression}`}
                    onClick={() => dispatch(removeWatch(watch.id))}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section(
        'watchpoints',
        'Data Breakpoints',
        configuration.watchpoints?.length ?? 0,
        <>
          <form
            className="debugger-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const address = parseAddress(watchpointInput);
              if (address === undefined) return;
              dispatch(
                upsertWatchpoint({
                  id: `watchpoint-${Date.now().toString(36)}`,
                  enabled: true,
                  address,
                  size: 1,
                  access: 'write',
                })
              );
              setWatchpointInput('');
            }}
          >
            <input
              aria-label="Data breakpoint address"
              onChange={(event) => setWatchpointInput(event.target.value)}
              placeholder="$00002000"
              value={watchpointInput}
            />
            <button type="submit">Watch writes</button>
          </form>
          <div className="debugger-list">
            {(configuration.watchpoints ?? []).map((watchpoint) => (
              <div className="debugger-list-item" key={watchpoint.id}>
                <div className="debugger-list-main">
                  <strong>{hex(watchpoint.address)}</strong>
                  <small>
                    {watchpoint.access} · {watchpoint.size * 8}-bit
                  </small>
                </div>
                <button
                  aria-label={`Remove watchpoint ${hex(watchpoint.address)}`}
                  onClick={() => dispatch(removeWatchpoint(watchpoint.id))}
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {section(
        'stop-details',
        'Stop Details',
        undefined,
        snapshot.stop ? (
          <dl className="debugger-stop-details">
            <dt>Reason</dt>
            <dd>{snapshot.stop.reason}</dd>
            <dt>PC</dt>
            <dd>{hex(snapshot.stop.pc)}</dd>
            <dt>Source</dt>
            <dd>{snapshot.stop.source ? `Line ${snapshot.stop.source.line}` : '—'}</dd>
            <dt>Message</dt>
            <dd>{snapshot.stop.message ?? snapshot.stop.fault?.message ?? '—'}</dd>
            {snapshot.stop.access ? (
              <>
                <dt>Access</dt>
                <dd>
                  {snapshot.stop.access.type} {snapshot.stop.access.size * 8}-bit at{' '}
                  {hex(snapshot.stop.access.address)}
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="debugger-empty">Run, pause, or step to inspect a stop.</p>
        )
      )}

      {snapshot.logs.length > 0
        ? section(
            'logs',
            'Logpoints',
            snapshot.logs.length,
            <pre className="debugger-log">{snapshot.logs.join('\n')}</pre>
          )
        : null}
    </div>
  );
}
