import { startPresenterWeb } from './sidecars/f/gui/presenter-web-v1.js?v=a6d70f14e3912ce9';
import { startLocalArtifactWeb } from './sidecars/f/local-artifact/local-artifact-web-v1.js?v=a6d70f14e3912ce9';
import { startSpeakerWeb } from './sidecars/f/speaker/speaker-web-v2.js?v=a6d70f14e3912ce9';
import { startDerivedArtifactWeb } from './sidecars/f/derived-artifact/derived-artifact-web-v1.js?v=a6d70f14e3912ce9';

const BOOT_PROTOCOL = 'freelang.worker.boot';
const VERSION = 1;

export async function bootFreelang(options = {}) {
  const canvas = options.canvas || document.querySelector('canvas[data-freelang]');
  const output = options.output || document.querySelector('[data-freelang-output]');
  const status = options.status || document.querySelector('[data-freelang-status]');
  const inputTrace = options.inputTrace === true ||
    new URL(location.href).searchParams.get('freelang-input-trace') === '1';
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Freelang host: Canvas is required');
  }
  if (typeof Worker !== 'function' || typeof MessageChannel !== 'function') {
    throw new Error('Freelang host: Dedicated Worker and MessageChannel are required');
  }

  const presenterChannel = new MessageChannel();
  const presenter = startPresenterWeb({
    port: presenterChannel.port1,
    canvas,
    output,
    status,
    traceButton: document.querySelector('[data-freelang-trace-download]'),
    inputTrace,
  });

  const artifactChannel = new MessageChannel();
  const artifact = startLocalArtifactWeb({
    port: artifactChannel.port1,
    panel: document.querySelector('[data-freelang-artifact-panel]'),
    input: document.querySelector('[data-freelang-artifact-input]'),
    status: document.querySelector('[data-freelang-artifact-status]'),
    forget: document.querySelector('[data-freelang-artifact-forget]'),
  });

  const speakerChannel = new MessageChannel();
  const speaker = startSpeakerWeb({ port: speakerChannel.port1 });

  const derivedArtifactChannel = new MessageChannel();
  const derivedArtifact = startDerivedArtifactWeb({ port: derivedArtifactChannel.port1 });

  const worker = new Worker(
    new URL('./freelang-worker-v1.js?v=a6d70f14e3912ce9', import.meta.url),
    { type: 'module', name: 'freelang-wasm' },
  );
  worker.addEventListener('error', (event) => {
    if (status) status.textContent = 'Freelang Worker stopped: ' + event.message;
    console.error(event.error || event.message);
  });
  worker.postMessage({
    protocol: BOOT_PROTOCOL,
    version: VERSION,
    presenterPort: presenterChannel.port2,
    artifactPort: artifactChannel.port2,
    speakerPort: speakerChannel.port2,
    derivedArtifactPort: derivedArtifactChannel.port2,
    inputTrace,
    targetUrl: new URL('./freelang-target.json?v=a6d70f14e3912ce9', import.meta.url).href,
    wasmUrl: new URL('./app.wasm?v=a6d70f14e3912ce9', import.meta.url).href,
  }, [presenterChannel.port2, artifactChannel.port2, speakerChannel.port2, derivedArtifactChannel.port2]);

  return {
    worker,
    stop() {
      presenter.stop();
      if (artifact) artifact.stop();
      if (speaker) speaker.stop();
      if (derivedArtifact) derivedArtifact.stop();
      worker.terminate();
      if (status) status.textContent = 'stopped';
    },
  };
}
