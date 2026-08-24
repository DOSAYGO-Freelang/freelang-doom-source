// Trusted reduced-authority WASM Worker adapter. This is compiler/runtime
// infrastructure, not a sidecar: it owns WebAssembly.Memory and copies only
// measured values across the named capability ports.

const HOST_MODULE = 'freelang_host_v1';
const BOOT_PROTOCOL = 'freelang.worker.boot';
const PRESENTER_PROTOCOL = 'freelang.presenter.web';
const ARTIFACT_PROTOCOL = 'freelang.local-artifact.web';
const VERSION = 1;
const MAX_DIMENSION = 2048;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_INPUT_RECORDS = 513;
const MAX_CHOICES = 256;
const MAX_CHOICE_CONTROLS = 16;
const MAX_TIMING_MICROS = 60 * 1000 * 1000;
const MAX_SPEAKER_FRAME_BYTES = 33557536;
const MAX_PENDING_SPEAKER_FRAMES = 256;
const MAX_DERIVED_CACHE_REQUEST_BYTES = 16777408;
const MAX_DERIVED_CACHE_RESPONSE_BYTES = 16777276;
const decoder = new TextDecoder('utf-8', { fatal: true });

let presenterPort = null;
let artifactPort = null;
let speakerPort = null;
let derivedArtifactPort = null;
let speakerFailed = false;
let speakerReady = false;
const pendingSpeakerFrames = [];
let target = null;
let instance = null;
let memory = null;
let stopped = false;
let lastNowMs = 0;
let frameSequence = 0;
let inputSequence = -1;
let inputTrace = false;
let inputTraceState = '';
let tickCopyMicros = 0;
let tickFrameBytes = 0;
let tickPresentations = 0;
const choiceValues = new Map();

function elapsedMicros(started) {
  return Math.max(0, Math.min(
    MAX_TIMING_MICROS,
    Math.round((performance.now() - started) * 1000),
  ));
}

function measuredSpan(ptr, len) {
  ptr >>>= 0;
  len >>>= 0;
  if (!memory || ptr + len < ptr || ptr + len > memory.buffer.byteLength) {
    throw new Error('Freelang Worker: measured memory span is out of bounds');
  }
  return new Uint8Array(memory.buffer, ptr, len);
}

function presenter(message, transfer = []) {
  presenterPort.postMessage({
    protocol: PRESENTER_PROTOCOL,
    version: VERSION,
    ...message,
  }, transfer);
}

function artifact(message, transfer = []) {
  if (!artifactPort) throw new Error('Freelang Worker: artifact port is absent');
  artifactPort.postMessage({
    protocol: ARTIFACT_PROTOCOL,
    version: VERSION,
    ...message,
  }, transfer);
}

function derivedArtifact(buffer) {
  if (!derivedArtifactPort) {
    throw new Error('Freelang Worker: derived-artifact port is absent');
  }
  derivedArtifactPort.postMessage(buffer, [buffer]);
}

function handleSpeaker(message) {
  if (!(message instanceof ArrayBuffer) || message.byteLength < 16 ||
      message.byteLength > 272) {
    throw new Error('Freelang Worker: invalid speaker response capsule');
  }
  const view = new DataView(message);
  const length = view.getUint32(0, true);
  const kind = view.getUint32(4, true);
  if (length !== message.byteLength) {
    throw new Error('Freelang Worker: speaker response length mismatch');
  }
  if (kind === 0x8001 && length === 16 &&
      view.getUint32(8, true) === 2 && view.getUint32(12, true) === 0) {
    speakerReady = true;
    while (pendingSpeakerFrames.length > 0) {
      const frame = pendingSpeakerFrames.shift();
      speakerPort.postMessage(frame, [frame]);
    }
    return;
  }
  if (kind === 0x80ff && length >= 16) {
    const textLength = view.getUint32(12, true);
    if (textLength !== length - 16 || textLength > 256) {
      throw new Error('Freelang Worker: invalid speaker ERROR frame');
    }
    const detail = decoder.decode(new Uint8Array(message, 16, textLength));
    presenter({ kind: 'output', channel: 2, text: `speaker unavailable: ${detail}\n` });
    speakerPort.close();
    speakerPort = null;
    speakerFailed = true;
    speakerReady = false;
    pendingSpeakerFrames.length = 0;
    return;
  }
  throw new Error('Freelang Worker: unexpected speaker response');
}

function handleDerivedArtifact(message) {
  if (!(message instanceof ArrayBuffer) || message.byteLength < 12 ||
      message.byteLength > MAX_DERIVED_CACHE_RESPONSE_BYTES) {
    throw new Error('Freelang Worker: invalid derived-cache response capsule');
  }
  const view = new DataView(message);
  const kind = view.getUint32(4, true);
  if (view.getUint32(0, true) !== message.byteLength ||
      (kind !== 0x8001 && kind !== 0x8002)) {
    throw new Error('Freelang Worker: invalid derived-cache response frame');
  }
  const cache = target && target.browserLifecycle && target.browserLifecycle.derivedCache;
  if (!cache || message.byteLength > cache.maximumResponseBytes) {
    throw new Error('Freelang Worker: undeclared derived-cache response');
  }
  const begin = exactExport(cache.beginExport, true);
  const commit = exactExport(cache.commitExport, true);
  const cancel = exactExport(cache.cancelExport, true);
  let pending = false;
  try {
    const ptr = begin(message.byteLength) >>> 0;
    pending = true;
    measuredSpan(ptr, message.byteLength).set(new Uint8Array(message));
    commit(message.byteLength);
    pending = false;
  } finally {
    if (pending) cancel();
  }
  refreshChoices();
}

function fail(error) {
  stopped = true;
  const text = error instanceof Error ? error.message : String(error);
  try { presenter({ kind: 'status', text: `stopped: ${text}`, terminal: true }); }
  catch (_) { /* the Worker error remains the terminal evidence */ }
  throw error;
}

function exactExport(name, required = false) {
  const value = instance && instance.exports[name];
  if (typeof value === 'function') return value;
  if (required) throw new Error(`Freelang Worker: required export ${name} is missing`);
  return null;
}

function refreshChoices(requestedControl = null) {
  if (choiceValues.size === 0) return;
  const available = exactExport('freelang_wasm_choice_available');
  const current = exactExport('freelang_wasm_choice_current');
  if (!available || !current) return;
  for (const [control, values] of choiceValues) {
    if (requestedControl !== null && control !== requestedControl) continue;
    const enabled = [];
    for (const value of values) {
      if ((available(control, value) | 0) === 1) enabled.push(value);
    }
    presenter({
      kind: 'choice_state',
      control,
      enabled,
      selected: current(control) | 0,
    });
  }
}

function traceInput(message) {
  if (!inputTrace) return;
  let state = null;
  for (const record of message.records) {
    if (record[0] === 12) state = record;
  }
  const held = message.records.filter((record) => record[0] === 13)
    .map((record) => record[1]).sort((a, b) => a - b);
  const edges = message.records.filter((record) =>
    [1, 2, 4, 5, 7, 11].includes(record[0]));
  const motion = message.records.filter((record) =>
    record[0] === 8 || record[0] === 10);
  const next = state
    ? `${state[1]}/${state[2]}/${state[3]}/${held.join(',')}`
    : `missing/${held.join(',')}`;
  if (next === inputTraceState && edges.length === 0 && motion.length === 0 &&
      message.dropped === 0) return;
  inputTraceState = next;
  const stateText = state
    ? `epoch=${state[1]} focus=${state[2] & 1} capture=${(state[2] >> 1) & 1} mouse=${state[3]}`
    : 'state=missing';
  const edgeText = edges.map((record) => record.join(':')).join(',');
  const motionText = motion.map((record) => record.join(':')).join(',');
  presenter({
    kind: 'trace',
    text: `input-wire seq=${message.sequence} ms=${message.nowMs} dropped=${message.dropped} ${stateText} held=[${held.join(',')}] edges=[${edgeText}] motion=[${motionText}]\n`,
  });
}

function handlePresenter(message) {
  if (!message || message.protocol !== PRESENTER_PROTOCOL ||
      message.version !== VERSION || stopped) return;
  if (message.kind === 'events') {
    if (!Number.isInteger(message.sequence) || message.sequence <= inputSequence ||
        !Number.isInteger(message.nowMs) || !Number.isInteger(message.dropped) ||
        message.dropped < 0 || !Array.isArray(message.records) ||
        message.records.length > MAX_INPUT_RECORDS) {
      throw new Error('Freelang Worker: invalid presenter event batch');
    }
    const workerStarted = performance.now();
    tickCopyMicros = 0;
    tickFrameBytes = 0;
    tickPresentations = 0;
    inputSequence = message.sequence;
    lastNowMs = message.nowMs | 0;
    traceInput(message);
    const input = exactExport('freelang_wasm_input');
    if (input) {
      for (const record of message.records) {
        if (!Array.isArray(record) || record.length !== 4 ||
            record.some((value) => !Number.isInteger(value))) {
          throw new Error('Freelang Worker: invalid presenter event record');
        }
        input(record[0] | 0, record[1] | 0, record[2] | 0, record[3] | 0);
      }
    }
    const frame = exactExport('freelang_wasm_frame');
    if (frame) frame(lastNowMs);
    const workerMicros = Math.max(elapsedMicros(workerStarted), tickCopyMicros);
    presenter({
      kind: 'tick_done',
      sequence: message.sequence,
      workerMicros,
      copyMicros: tickCopyMicros,
      frameBytes: tickFrameBytes,
      presentations: tickPresentations,
    });
    return;
  }
  if (message.kind === 'choice_values') {
    if (!Number.isInteger(message.control) || !Array.isArray(message.values) ||
        message.control <= 0 || message.values.length === 0 ||
        message.values.length > MAX_CHOICES ||
        message.values.some((value) => !Number.isInteger(value))) {
      throw new Error('Freelang Worker: invalid choice declaration');
    }
    const control = message.control | 0;
    const values = message.values.map((value) => value | 0);
    if (choiceValues.has(control) || choiceValues.size >= MAX_CHOICE_CONTROLS ||
        new Set(values).size !== values.length) {
      throw new Error('Freelang Worker: duplicate or excess choice declaration');
    }
    choiceValues.set(control, values);
    refreshChoices(control);
    return;
  }
  if (message.kind === 'choice') {
    const control = message.control | 0;
    const values = choiceValues.get(control);
    if (!values || !values.includes(message.value | 0)) {
      throw new Error('Freelang Worker: invalid choice selection');
    }
    const select = exactExport('freelang_wasm_choice_select');
    if (select) select(control, message.value | 0);
    refreshChoices(control);
    return;
  }
  throw new Error(`Freelang Worker: unsupported presenter message ${String(message.kind)}`);
}

function handleArtifact(message) {
  if (!message || message.protocol !== ARTIFACT_PROTOCOL ||
      message.version !== VERSION || stopped) return;
  if (message.kind !== 'artifact') {
    throw new Error(`Freelang Worker: unsupported artifact message ${String(message.kind)}`);
  }
  const ingress = target.browserLifecycle && target.browserLifecycle.byteIngress;
  if (!ingress || !Number.isInteger(message.id) || typeof message.name !== 'string' ||
      message.name.length === 0 || message.name.length > 255 ||
      !Number.isInteger(message.size) || message.size < 0 ||
      message.size > ingress.maximumBytes || !(message.bytes instanceof ArrayBuffer) ||
      message.bytes.byteLength !== message.size) {
    throw new Error('Freelang Worker: invalid measured artifact');
  }
  const begin = exactExport(ingress.beginExport, true);
  const commit = exactExport(ingress.commitExport, true);
  const cancel = exactExport(ingress.cancelExport, true);
  let pending = false;
  let status = 1;
  try {
    const ptr = begin(message.size) >>> 0;
    pending = true;
    measuredSpan(ptr, message.size).set(new Uint8Array(message.bytes));
    status = commit(message.size) | 0;
    pending = false;
  } finally {
    if (pending) cancel();
  }
  artifact({ kind: 'result', id: message.id | 0, status });
  if (status === 0) refreshChoices();
}

async function boot(message) {
  if (!message || message.protocol !== BOOT_PROTOCOL || message.version !== VERSION ||
      !(message.presenterPort instanceof MessagePort) ||
      !(message.artifactPort === null || message.artifactPort instanceof MessagePort) ||
      !(message.speakerPort === null || message.speakerPort instanceof MessagePort) ||
      !(message.derivedArtifactPort === null ||
        message.derivedArtifactPort instanceof MessagePort) ||
      !(message.inputTrace === undefined || typeof message.inputTrace === 'boolean') ||
      typeof message.targetUrl !== 'string' || typeof message.wasmUrl !== 'string') {
    throw new Error('Freelang Worker: invalid boot capsule');
  }
  presenterPort = message.presenterPort;
  artifactPort = message.artifactPort;
  speakerPort = message.speakerPort;
  derivedArtifactPort = message.derivedArtifactPort;
  inputTrace = message.inputTrace === true;
  presenterPort.onmessage = (event) => {
    try { handlePresenter(event.data); } catch (error) { fail(error); }
  };
  presenterPort.start();
  if (artifactPort) {
    artifactPort.onmessage = (event) => {
      try { handleArtifact(event.data); } catch (error) { fail(error); }
    };
    artifactPort.start();
  }
  if (speakerPort) {
    speakerPort.onmessage = (event) => {
      try { handleSpeaker(event.data); } catch (error) { fail(error); }
    };
    speakerPort.start();
  }
  if (derivedArtifactPort) {
    derivedArtifactPort.onmessage = (event) => {
      try { handleDerivedArtifact(event.data); } catch (error) { fail(error); }
    };
    derivedArtifactPort.start();
  }

  const [loadedTarget, response] = await Promise.all([
    fetch(message.targetUrl, { cache: 'no-store' }).then((result) => {
      if (!result.ok) throw new Error(`target manifest HTTP ${result.status}`);
      return result.json();
    }),
    fetch(message.wasmUrl, { cache: 'no-store' }),
  ]);
  if (!response.ok) throw new Error(`WASM HTTP ${response.status}`);
  if (loadedTarget.formatVersion !== 1 || loadedTarget.hostModule !== HOST_MODULE ||
      !loadedTarget.execution || loadedTarget.execution.isolation !== 'dedicated-worker' ||
      loadedTarget.execution.transport !== 'messageport-structured-clone-v1') {
    throw new Error('Freelang Worker: unsupported target manifest');
  }
  target = loadedTarget;
  const declaredIngress = target.browserLifecycle && target.browserLifecycle.byteIngress;
  if (Boolean(declaredIngress) !== Boolean(artifactPort)) {
    throw new Error('Freelang Worker: artifact port disagrees with target manifest');
  }
  const declaredSpeaker = target.browserLifecycle && target.browserLifecycle.speaker;
  if (Boolean(declaredSpeaker) !== Boolean(speakerPort)) {
    throw new Error('Freelang Worker: speaker port disagrees with target manifest');
  }
  const declaredDerivedCache = target.browserLifecycle && target.browserLifecycle.derivedCache;
  if (Boolean(declaredDerivedCache) !== Boolean(derivedArtifactPort)) {
    throw new Error('Freelang Worker: derived-artifact port disagrees with target manifest');
  }
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module).map((item) => item.name);
  if (imports.join(',') !== target.imports.join(',')) {
    throw new Error('Freelang Worker: artifact imports disagree with target manifest');
  }

  const host = {
    panic(ptr, len, code) {
      if ((len >>> 0) > MAX_TEXT_BYTES) throw new Error('Freelang panic text exceeds bound');
      const text = decoder.decode(measuredSpan(ptr, len));
      presenter({ kind: 'status', text: `stopped (fatal ${code | 0})`, terminal: true });
      stopped = true;
      throw new Error(text);
    },
    write(ptr, len, channel) {
      len >>>= 0;
      channel |= 0;
      if (len > MAX_TEXT_BYTES || (channel !== 1 && channel !== 2)) {
        throw new Error('Freelang Worker: invalid output');
      }
      const text = decoder.decode(measuredSpan(ptr, len));
      if (inputTrace && text.startsWith('input-freelang ')) {
        presenter({ kind: 'trace', text });
      }
      presenter({ kind: 'output', channel, text });
    },
    present_rgba(ptr, len, width, height, stride) {
      ptr >>>= 0;
      len >>>= 0;
      width >>>= 0;
      height >>>= 0;
      stride >>>= 0;
      if (width === 0 || height === 0 || width > MAX_DIMENSION ||
          height > MAX_DIMENSION || stride !== width * 4 || len !== stride * height) {
        throw new Error('Freelang Worker: invalid measured presentation');
      }
      const copyStarted = performance.now();
      const pixels = measuredSpan(ptr, len).slice().buffer;
      tickCopyMicros = Math.min(
        MAX_TIMING_MICROS,
        tickCopyMicros + elapsedMicros(copyStarted),
      );
      tickFrameBytes = len;
      tickPresentations++;
      presenter({
        kind: 'frame',
        sequence: frameSequence++,
        width,
        height,
        stride,
        pixels,
      }, [pixels]);
    },
    speaker_frame(ptr, len) {
      ptr >>>= 0;
      len >>>= 0;
      if (speakerFailed) return;
      if (!speakerPort || len < 8 || len > MAX_SPEAKER_FRAME_BYTES) {
        throw new Error('Freelang Worker: invalid measured speaker frame');
      }
      const span = measuredSpan(ptr, len);
      const view = new DataView(span.buffer, span.byteOffset, span.byteLength);
      if (view.getUint32(0, true) !== len) {
        throw new Error('Freelang Worker: speaker frame length mismatch');
      }
      const kind = view.getUint32(4, true);
      if (kind === 1) {
        speakerReady = false;
        pendingSpeakerFrames.length = 0;
      }
      const frame = span.slice().buffer;
      if (kind === 3) {
        speakerReady = false;
        pendingSpeakerFrames.length = 0;
      } else if ((kind === 2 || kind === 4) && !speakerReady) {
        if (pendingSpeakerFrames.length >= MAX_PENDING_SPEAKER_FRAMES) {
          throw new Error('Freelang Worker: pending speaker command bound exceeded');
        }
        pendingSpeakerFrames.push(frame);
        return;
      }
      speakerPort.postMessage(frame, [frame]);
    },
    derived_cache_frame(ptr, len) {
      ptr >>>= 0;
      len >>>= 0;
      const cache = target && target.browserLifecycle && target.browserLifecycle.derivedCache;
      if (!cache || !derivedArtifactPort || len < 16 ||
          len > MAX_DERIVED_CACHE_REQUEST_BYTES || len > cache.maximumRequestBytes) {
        throw new Error('Freelang Worker: invalid measured derived-cache frame');
      }
      const span = measuredSpan(ptr, len);
      const view = new DataView(span.buffer, span.byteOffset, span.byteLength);
      if (view.getUint32(0, true) !== len) {
        throw new Error('Freelang Worker: derived-cache frame length mismatch');
      }
      const frame = span.slice().buffer;
      derivedArtifact(frame);
    },
    monotonic_ms() { return lastNowMs | 0; },
    exit(code) {
      stopped = true;
      presenter({ kind: 'status', text: `exited ${code | 0}`, terminal: true });
    },
  };

  instance = await WebAssembly.instantiate(module, { [HOST_MODULE]: host });
  memory = instance.exports.memory;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error('Freelang Worker: module did not export memory');
  }
  exactExport('freelang_main', true)();
  if (inputTrace) {
    const diagnostic = exactExport('freelang_wasm_diagnostic');
    if (diagnostic) diagnostic(1, 1);
    presenter({ kind: 'trace', text: 'input tracing enabled\n' });
  }

  const ingress = target.browserLifecycle && target.browserLifecycle.byteIngress;
  if (artifactPort) artifact({ kind: 'hello', maximumBytes: ingress.maximumBytes });
  presenter({
    kind: 'hello',
    maximumFrameBytes: MAX_DIMENSION * MAX_DIMENSION * 4,
    maximumInputRecords: MAX_INPUT_RECORDS,
  });
  refreshChoices();
}

self.onmessage = (event) => {
  if (instance || presenterPort) return;
  boot(event.data).catch((error) => fail(error));
};
