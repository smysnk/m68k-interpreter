import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutter, lineNumbers } from '@codemirror/view';
import type { DebugBreakpointSpec, ResolvedDebugBreakpoint } from '@m68k/interpreter';

type BreakpointMarkerStatus = 'bound' | 'disabled' | 'conditional' | 'unbound';

class BreakpointMarker extends GutterMarker {
  constructor(private readonly status: BreakpointMarkerStatus) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof BreakpointMarker && other.status === this.status;
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = `debug-breakpoint-marker debug-breakpoint-marker-${this.status}`;
    marker.setAttribute('aria-hidden', 'true');
    marker.title = `${this.status[0].toUpperCase()}${this.status.slice(1)} breakpoint`;
    return marker;
  }
}

class CurrentInstructionMarker extends GutterMarker {
  override toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'debug-current-instruction-marker';
    marker.textContent = '▶';
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
}

class DebugLineMarker extends GutterMarker {
  constructor(
    private readonly breakpointStatus?: BreakpointMarkerStatus,
    private readonly current = false
  ) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return (
      other instanceof DebugLineMarker &&
      other.breakpointStatus === this.breakpointStatus &&
      other.current === this.current
    );
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'debug-line-marker';
    if (this.current) marker.append(new CurrentInstructionMarker().toDOM());
    if (this.breakpointStatus) {
      marker.append(new BreakpointMarker(this.breakpointStatus).toDOM());
    }
    return marker;
  }
}

const currentInstructionLine = Decoration.line({ class: 'cm-debug-current-line' });

export interface DebuggerEditorExtensionOptions {
  breakpoints: readonly DebugBreakpointSpec[];
  resolvedBreakpoints: readonly ResolvedDebugBreakpoint[];
  activeFileId: string;
  currentLine?: number;
  showLineNumbers: boolean;
  onToggleBreakpoint(line: number): void;
  onOpenBreakpointMenu?(line: number, x: number, y: number): void;
}

function markerStatus(
  breakpoint: DebugBreakpointSpec,
  resolved: ResolvedDebugBreakpoint | undefined
): BreakpointMarkerStatus {
  if (!breakpoint.enabled) return 'disabled';
  if (!resolved?.bound) return 'unbound';
  return breakpoint.condition || breakpoint.hitCondition || breakpoint.logMessage
    ? 'conditional'
    : 'bound';
}

export function createDebuggerEditorExtensions(
  options: DebuggerEditorExtensionOptions
): Extension[] {
  const resolvedById = new Map(options.resolvedBreakpoints.map((item) => [item.id, item]));
  const breakpointStatusByLine = new Map<number, BreakpointMarkerStatus>();
  for (const breakpoint of options.breakpoints) {
    if (
      breakpoint.kind !== 'source' ||
      breakpoint.fileId !== options.activeFileId ||
      breakpoint.line === undefined
    )
      continue;
    breakpointStatusByLine.set(
      breakpoint.line,
      markerStatus(breakpoint, resolvedById.get(breakpoint.id))
    );
  }

  const handleMouseDown = (view: EditorView, line: { from: number }, event: Event): boolean => {
    if (!(event instanceof MouseEvent) || event.button !== 0) return false;
    options.onToggleBreakpoint(view.state.doc.lineAt(line.from).number);
    event.preventDefault();
    return true;
  };

  const handleContextMenu = (view: EditorView, line: { from: number }, event: Event): boolean => {
    if (!(event instanceof MouseEvent) || !options.onOpenBreakpointMenu) return false;
    event.preventDefault();
    options.onOpenBreakpointMenu(
      view.state.doc.lineAt(line.from).number,
      event.clientX,
      event.clientY
    );
    return true;
  };

  const lineNumberGutter = lineNumbers({
    domEventHandlers: {
      contextmenu: handleContextMenu,
      mousedown: handleMouseDown,
    },
  });

  const breakpointGutter = gutter({
    class: 'cm-debugger-gutter',
    initialSpacer: () => new DebugLineMarker('bound'),
    markers(view) {
      const builder = new RangeSetBuilder<GutterMarker>();
      const markedLines = new Set(breakpointStatusByLine.keys());
      if (options.currentLine !== undefined) markedLines.add(options.currentLine);
      for (const lineNumber of [...markedLines].sort((left, right) => left - right)) {
        if (lineNumber < 1 || lineNumber > view.state.doc.lines) continue;
        builder.add(
          view.state.doc.line(lineNumber).from,
          view.state.doc.line(lineNumber).from,
          new DebugLineMarker(
            breakpointStatusByLine.get(lineNumber),
            lineNumber === options.currentLine
          )
        );
      }
      return builder.finish();
    },
    domEventHandlers: {
      contextmenu: handleContextMenu,
      mousedown: handleMouseDown,
    },
  });

  const currentLineDecorations = EditorView.decorations.of((view) => {
    if (options.currentLine !== undefined && options.currentLine > 0) {
      if (options.currentLine! > view.state.doc.lines) return Decoration.none;
      const line = view.state.doc.line(options.currentLine!);
      return Decoration.set([currentInstructionLine.range(line.from)]);
    }
    return Decoration.none;
  });

  return [
    ...(options.showLineNumbers ? [lineNumberGutter] : []),
    breakpointGutter,
    currentLineDecorations,
  ];
}
