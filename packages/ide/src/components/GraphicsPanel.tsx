import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useGraphicsSurface } from '@/runtime/useGraphicsSurface';
import {
  commitMultimediaPanelConfiguration,
  type AppDispatch,
  type PanelInstance,
  type RootState,
} from '@/store';

export default function GraphicsPanel({ instance }: { instance: PanelInstance }) {
  const dispatch = useDispatch<AppDispatch>();
  const machineProfile = useSelector((state: RootState) => state.settings.machineProfile);
  const surface = useGraphicsSurface();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const paintedVersionRef = useRef<number | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [contextEpoch, setContextEpoch] = useState(0);
  const config =
    instance.config.kind === 'graphics'
      ? instance.config
      : { kind: 'graphics' as const, scaleMode: 'fit' as const, smoothing: false };

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = surface.state;
    if (!canvas || !state || surface.pixels.length === 0) return;
    const needsFullPaint =
      canvas.width !== state.width ||
      canvas.height !== state.height ||
      paintedVersionRef.current === null ||
      surface.patch?.full === true;
    if (canvas.width !== state.width) canvas.width = state.width;
    if (canvas.height !== state.height) canvas.height = state.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    context.imageSmoothingEnabled = config.smoothing;
    const patch = needsFullPaint
      ? {
          x: 0,
          y: 0,
          patchWidth: state.width,
          patchHeight: state.height,
          pixels: surface.pixels,
        }
      : surface.patch;
    if (!patch) return;
    const image = context.createImageData(patch.patchWidth, patch.patchHeight);
    for (let index = 0; index < patch.pixels.length; index += 1) {
      const color = patch.pixels[index] ?? 0;
      const offset = index * 4;
      image.data[offset] = (color >>> 16) & 0xff;
      image.data[offset + 1] = (color >>> 8) & 0xff;
      image.data[offset + 2] = color & 0xff;
      image.data[offset + 3] = 0xff;
    }
    context.putImageData(image, patch.x, patch.y);
    paintedVersionRef.current = state.version;
  }, [config.smoothing, contextEpoch, surface]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleLost = (event: Event) => {
      event.preventDefault();
      paintedVersionRef.current = null;
    };
    const handleRestored = () => setContextEpoch((value) => value + 1);
    canvas.addEventListener('contextlost', handleLost);
    canvas.addEventListener('contextrestored', handleRestored);
    return () => {
      canvas.removeEventListener('contextlost', handleLost);
      canvas.removeEventListener('contextrestored', handleRestored);
    };
  }, []);

  const canvasSize = useMemo(() => {
    const state = surface.state;
    if (!state || config.scaleMode === 'one-to-one') return undefined;
    const availableWidth = Math.max(0, viewportSize.width - 18);
    const availableHeight = Math.max(0, viewportSize.height - 18);
    const fitScale = Math.min(availableWidth / state.width, availableHeight / state.height);
    const scale = config.scaleMode === 'integer' ? Math.max(1, Math.floor(fitScale)) : fitScale;
    if (!Number.isFinite(scale) || scale <= 0) return undefined;
    return { width: state.width * scale, height: state.height * scale };
  }, [config.scaleMode, surface.state, viewportSize]);

  const commit = (patch: Partial<typeof config>) => {
    dispatch(
      commitMultimediaPanelConfiguration({
        panelId: instance.id,
        config: { ...config, ...patch },
      })
    );
  };

  if (machineProfile !== 'easy68k') {
    return (
      <div className="multimedia-unavailable">Graphics requires the Easy68K machine profile.</div>
    );
  }

  return (
    <div className="graphics-panel">
      <div className="multimedia-toolbar">
        <label>
          Scale
          <select
            aria-label="Graphics scale mode"
            onChange={(event) =>
              commit({ scaleMode: event.target.value as typeof config.scaleMode })
            }
            value={config.scaleMode}
          >
            <option value="fit">Fit</option>
            <option value="integer">Integer</option>
            <option value="one-to-one">1:1</option>
          </select>
        </label>
        <label>
          <input
            checked={config.smoothing}
            onChange={(event) => commit({ smoothing: event.target.checked })}
            type="checkbox"
          />
          Smooth
        </label>
        <span className="multimedia-status" role="status">
          {surface.state
            ? `${surface.state.width} × ${surface.state.height} · ${surface.state.doubleBuffered ? 'back buffer' : 'front buffer'}`
            : 'Waiting for runtime'}
        </span>
      </div>
      <div className={`graphics-viewport graphics-scale-${config.scaleMode}`} ref={viewportRef}>
        <canvas
          aria-label="Easy68K graphics output"
          className={config.smoothing ? 'graphics-canvas smooth' : 'graphics-canvas'}
          ref={canvasRef}
          style={canvasSize}
        />
      </div>
    </div>
  );
}
