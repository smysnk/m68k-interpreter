import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { easy68kAudioHost } from '@/runtime/easy68kAudioHost';
import { runtimeCommandPort } from '@/runtime/runtimeCommandPort';
import { useSoundSurface } from '@/runtime/useSoundSurface';
import { createEasy68kSoundAsset } from '@/runtime/easy68kSoundAssetManifest';
import {
  commitMultimediaPanelConfiguration,
  type AppDispatch,
  type PanelInstance,
  type RootState,
} from '@/store';

export default function SoundPanel({ instance }: { instance: PanelInstance }) {
  const dispatch = useDispatch<AppDispatch>();
  const machineProfile = useSelector((state: RootState) => state.settings.machineProfile);
  const surface = useSoundSurface();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const config =
    instance.config.kind === 'sound'
      ? instance.config
      : { kind: 'sound' as const, showAssets: true, showVoices: true };
  const device = surface.device;

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
      <div className="multimedia-unavailable">Sound requires the Easy68K machine profile.</div>
    );
  }

  const references = [
    ...(device?.standardReferences ?? []),
    ...(device?.polyphonicReferences ?? []),
  ];
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const asset = await createEasy68kSoundAsset(file);
      const accepted = await runtimeCommandPort.registerSoundAssets([asset]);
      setUploadError(accepted.length === 1 ? null : 'The runtime rejected this WAV asset.');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="sound-panel">
      <div className="multimedia-toolbar sound-toolbar">
        <button onClick={() => void easy68kAudioHost.unlock()} type="button">
          {surface.host.unlocked ? 'Audio enabled' : 'Enable audio'}
        </button>
        <label>
          <input
            checked={surface.host.muted}
            onChange={(event) => easy68kAudioHost.setMuted(event.target.checked)}
            type="checkbox"
          />
          Mute
        </label>
        <label>
          Volume
          <input
            aria-label="Sound master volume"
            max="1"
            min="0"
            onChange={(event) => easy68kAudioHost.setVolume(Number(event.target.value))}
            step="0.05"
            type="range"
            value={surface.host.volume}
          />
        </label>
        <button onClick={() => void runtimeCommandPort.stopAllSounds()} type="button">
          Stop all
        </button>
        <label className="sound-upload">
          Add WAV
          <input
            accept="audio/wav,.wav"
            aria-label="Add WAV asset"
            onChange={(event) => void upload(event.target.files?.[0])}
            type="file"
          />
        </label>
      </div>

      <div className="sound-summary" role="status">
        <span>
          Standard: {device?.voices.filter((voice) => voice.player === 'standard').length ?? 0}
        </span>
        <span>
          Polyphonic: {device?.voices.filter((voice) => voice.player === 'polyphonic').length ?? 0}
        </span>
        <span>Assets: {device?.assets.length ?? 0}</span>
        {device?.lastTaskResult ? (
          <span>
            Task {device.lastTaskResult.task}:{' '}
            {device.lastTaskResult.success ? 'success' : 'failed'}
          </span>
        ) : null}
      </div>

      <label className="sound-section-toggle">
        <input
          checked={config.showVoices}
          onChange={(event) => commit({ showVoices: event.target.checked })}
          type="checkbox"
        />
        Show voices
      </label>
      {config.showVoices ? (
        <ul className="sound-list" aria-label="Active sound voices">
          {(device?.voices ?? []).map((voice) => (
            <li key={voice.id}>
              <strong>#{voice.id}</strong> {voice.player} · {voice.path}
              {voice.loop ? ' · loop' : ''}
            </li>
          ))}
          {(device?.voices.length ?? 0) === 0 ? <li className="muted">No active voices</li> : null}
        </ul>
      ) : null}

      <label className="sound-section-toggle">
        <input
          checked={config.showAssets}
          onChange={(event) => commit({ showAssets: event.target.checked })}
          type="checkbox"
        />
        Show references
      </label>
      {config.showAssets ? (
        <>
          <ul className="sound-list" aria-label="Available sound assets">
            {(device?.assets ?? []).map((asset) => (
              <li key={asset.id}>
                {asset.path} · {Math.ceil(asset.byteLength / 1024)} KB
              </li>
            ))}
            {(device?.assets.length ?? 0) === 0 ? (
              <li className="muted">No available WAV assets</li>
            ) : null}
          </ul>
          <ul className="sound-list" aria-label="Loaded sound references">
            {references.map((entry) => (
              <li key={`${entry.player}-${entry.reference}`}>
                #{entry.reference} · {entry.player} · {entry.path}{' '}
                <button
                  aria-label={`Stop ${entry.player} sound reference ${entry.reference}`}
                  onClick={() =>
                    void runtimeCommandPort.stopSoundReference(entry.player, entry.reference)
                  }
                  type="button"
                >
                  Stop
                </button>
              </li>
            ))}
            {references.length === 0 ? <li className="muted">No loaded references</li> : null}
          </ul>
        </>
      ) : null}

      {uploadError ? <p className="sound-diagnostic">{uploadError}</p> : null}
      {surface.host.error ? <p className="sound-diagnostic">{surface.host.error}</p> : null}
      {(device?.diagnostics ?? []).slice(-3).map((message) => (
        <p className="sound-diagnostic" key={message}>
          {message}
        </p>
      ))}
    </div>
  );
}
