// f/gui web presenter agent. This module owns Canvas/DOM input, pointer
// capture and animation lifecycle. It knows only presenter protocol v1; no
// application, map, game or Freelang heap object enters this context.

const PROTOCOL = 'freelang.presenter.web';
const VERSION = 1;
const MAX_RECORDS = 513;
const MAX_TRANSITIONS = 480;
const MAX_HELD = 32;
const MAX_TEXT = 1024 * 1024;
const MAX_TRACE_TEXT = 1024 * 1024;
const MAX_CHOICE_CONTROLS = 16;

const EVENT = Object.freeze({
  KEY_DOWN: 1,
  KEY_UP: 2,
  MOUSE_MOVE: 3,
  MOUSE_DOWN: 4,
  MOUSE_UP: 5,
  FOCUS: 7,
  SCROLL: 8,
  MOUSE_DELTA: 10,
  POINTER_CAPTURE: 11,
  INPUT_STATE: 12,
  KEY_HELD: 13,
});

const KEY = Object.freeze({
  ESC: 4097,
  UP: 4098,
  DOWN: 4099,
  LEFT: 4100,
  RIGHT: 4101,
  RETURN: 4102,
  BACKSPACE: 4103,
  TAB: 4104,
  DELETE: 4105,
  HOME: 4106,
  END: 4107,
  PAGE_UP: 4108,
  PAGE_DOWN: 4109,
});

function record(kind, a = 0, b = 0, mods = 0) {
  return [kind | 0, a | 0, b | 0, mods | 0];
}

function keyCode(event) {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.charCodeAt(3) + 32;
  if (/^Digit[0-9]$/.test(event.code)) return event.code.charCodeAt(5);
  if (event.code === 'Space') return 32;
  const special = {
    Escape: KEY.ESC,
    ArrowUp: KEY.UP,
    ArrowDown: KEY.DOWN,
    ArrowLeft: KEY.LEFT,
    ArrowRight: KEY.RIGHT,
    Enter: KEY.RETURN,
    Backspace: KEY.BACKSPACE,
    Tab: KEY.TAB,
    Delete: KEY.DELETE,
    Home: KEY.HOME,
    End: KEY.END,
    PageUp: KEY.PAGE_UP,
    PageDown: KEY.PAGE_DOWN,
  };
  return special[event.key] || 0;
}

function assertPort(port) {
  if (!(port instanceof MessagePort)) {
    throw new TypeError('web presenter: MessagePort is required');
  }
}

export function startPresenterWeb({
  port, canvas, output, status, traceButton, inputTrace = false,
}) {
  assertPort(port);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('web presenter: Canvas is required');
  }
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('web presenter: 2D Canvas is unavailable');

  let active = false;
  let framePending = false;
  let tickInFlight = null;
  let sequence = 0;
  let lastFrameSequence = -1;
  let epoch = 1;
  let presentedWidth = 0;
  let presentedHeight = 0;
  let dropped = 0;
  let inputAuthority = 0;
  let lastPaintMicros = 0;
  const transitions = [];
  const held = new Map();
  const mouseHeld = [0, 0, 0];
  const traceLines = [];
  let traceLength = 0;
  let traceDropped = 0;

  const appendTrace = (line) => {
    if (!line.endsWith('\n')) line += '\n';
    traceLines.push(line);
    traceLength += line.length;
    while (traceLength > MAX_TRACE_TEXT && traceLines.length > 1) {
      traceLength -= traceLines.shift().length;
      traceDropped++;
    }
    if (traceButton) {
      traceButton.hidden = false;
      traceButton.textContent = `Download input trace (${traceLines.length})`;
    }
  };

  if (traceButton) traceButton.addEventListener('click', () => {
    const prefix = traceDropped > 0
      ? `input-trace: ${traceDropped} oldest records discarded by 1 MiB bound\n`
      : '';
    const blob = new Blob([prefix, ...traceLines], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = URL.createObjectURL(blob);
    link.download = `freelang-input-trace-${stamp}.log`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  const enqueue = (value) => {
    if (transitions.length < MAX_TRANSITIONS) transitions.push(value);
    else dropped++;
  };

  const clearHeldInput = () => {
    held.clear();
    mouseHeld.fill(0);
  };

  const canvasHasInputAuthority = () => document.hasFocus() &&
    (document.activeElement === canvas || document.pointerLockElement === canvas);

  const setInputAuthority = (next) => {
    next = next ? 1 : 0;
    if (next === inputAuthority) return;
    inputAuthority = next;
    epoch++;
    if (next === 0) clearHeldInput();
    enqueue(record(EVENT.FOCUS, next));
  };

  const requestTick = () => {
    if (!active || framePending || tickInFlight !== null) return;
    framePending = true;
    requestAnimationFrame((now) => {
      framePending = false;
      if (!active) return;
      setInputAuthority(canvasHasInputAuthority());
      const focused = inputAuthority;
      const captured = document.pointerLockElement === canvas ? 1 : 0;
      const mouseMask = mouseHeld[0] + mouseHeld[1] * 2 + mouseHeld[2] * 4;
      const heldValues = focused ? Array.from(held.values()) : [];
      const transitionLimit = Math.max(0, MAX_RECORDS - 1 - heldValues.length);
      if (transitions.length > transitionLimit) {
        dropped += transitions.length - transitionLimit;
      }
      const records = transitions.splice(0, transitionLimit);
      transitions.length = 0;
      records.push(record(EVENT.INPUT_STATE, epoch, focused + captured * 2, mouseMask));
      for (const code of heldValues) {
        if (records.length >= MAX_RECORDS) { dropped++; break; }
        records.push(record(EVENT.KEY_HELD, code));
      }
      const tickSequence = sequence++;
      tickInFlight = {
        sequence: tickSequence,
        started: performance.now(),
      };
      port.postMessage({
        protocol: PROTOCOL,
        version: VERSION,
        kind: 'events',
        sequence: tickSequence,
        nowMs: Math.floor(now) | 0,
        dropped,
        records,
      });
      dropped = 0;
    });
  };

  window.addEventListener('keydown', (event) => {
    if (!canvasHasInputAuthority()) return;
    const code = keyCode(event);
    if (code === 0) return;
    event.preventDefault();
    if (!held.has(event.code)) {
      if (held.size >= MAX_HELD) { dropped++; return; }
      held.set(event.code, code);
      enqueue(record(EVENT.KEY_DOWN, code));
    }
  });
  window.addEventListener('keyup', (event) => {
    if (!held.has(event.code) && !canvasHasInputAuthority()) return;
    const code = held.get(event.code) || keyCode(event);
    if (code === 0) return;
    event.preventDefault();
    held.delete(event.code);
    enqueue(record(EVENT.KEY_UP, code));
  });
  window.addEventListener('blur', () => {
    setInputAuthority(0);
  });
  window.addEventListener('focus', () => {
    setInputAuthority(canvasHasInputAuthority());
  });
  canvas.addEventListener('blur', () => setInputAuthority(0));
  canvas.addEventListener('focus', () => setInputAuthority(1));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') setInputAuthority(0);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (document.pointerLockElement === canvas) {
      const dx = Math.max(-2048, Math.min(2048, Math.trunc(event.movementX)));
      const dy = Math.max(-2048, Math.min(2048, Math.trunc(event.movementY)));
      if (dx !== 0 || dy !== 0) enqueue(record(EVENT.MOUSE_DELTA, dx, dy));
      return;
    }
    if (canvas.hasAttribute('data-freelang-pointer-lock')) return;
    if (presentedWidth === 0 || presentedHeight === 0) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(presentedWidth - 1,
      Math.floor((event.clientX - bounds.left) * presentedWidth / bounds.width)));
    const y = Math.max(0, Math.min(presentedHeight - 1,
      Math.floor((event.clientY - bounds.top) * presentedHeight / bounds.height)));
    enqueue(record(EVENT.MOUSE_MOVE, x, y));
  });
  canvas.addEventListener('pointerdown', (event) => {
    const button = Math.max(0, Math.min(2, event.button | 0));
    if (canvas.hasAttribute('data-freelang-pointer-lock') &&
        document.pointerLockElement !== canvas) {
      canvas.focus();
      canvas.requestPointerLock();
      return;
    }
    mouseHeld[button] = 1;
    enqueue(record(EVENT.MOUSE_DOWN, 0, 0, button * 65536));
  });
  canvas.addEventListener('pointerup', (event) => {
    const button = Math.max(0, Math.min(2, event.button | 0));
    mouseHeld[button] = 0;
    enqueue(record(EVENT.MOUSE_UP, 0, 0, button * 65536));
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const dy = Math.max(-1200, Math.min(1200, Math.trunc(event.deltaY)));
    enqueue(record(EVENT.SCROLL, 0, dy));
  }, { passive: false });

  if (canvas.hasAttribute('data-freelang-pointer-lock')) {
    document.addEventListener('pointerlockchange', () => {
      epoch++;
      const captured = document.pointerLockElement === canvas ? 1 : 0;
      if (!captured) clearHeldInput();
      enqueue(record(EVENT.POINTER_CAPTURE, captured));
      if (status && active) {
        status.textContent = captured
          ? 'running · mouse captured (Escape releases)'
          : 'running · click Canvas for mouse look';
      }
    });
  }

  document.querySelectorAll('[data-freelang-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const code = Number(button.dataset.freelangKey) | 0;
      enqueue(record(EVENT.KEY_DOWN, code));
      enqueue(record(EVENT.KEY_UP, code));
      canvas.focus();
    });
  });

  const choices = new Map();
  const choiceElements = document.querySelectorAll('[data-freelang-choice]');
  if (choiceElements.length > MAX_CHOICE_CONTROLS) {
    throw new Error('web presenter: choice-control bound exceeded');
  }
  for (const choice of choiceElements) {
    const control = Number(choice.dataset.freelangChoice) | 0;
    let values;
    let kind;
    if (choice instanceof HTMLSelectElement) {
      kind = 'select';
      values = Array.from(
        choice.querySelectorAll('option[data-freelang-choice-value]'),
        (option) => Number(option.dataset.freelangChoiceValue) | 0,
      );
    } else if (choice instanceof HTMLInputElement && choice.type === 'checkbox') {
      kind = 'checkbox';
      values = [
        Number(choice.dataset.freelangChoiceOff) | 0,
        Number(choice.dataset.freelangChoiceOn) | 0,
      ];
    } else {
      throw new Error('web presenter: choice control must be a select or checkbox');
    }
    if (control <= 0 || choices.has(control) || values.length === 0 ||
        values.length > 256 || new Set(values).size !== values.length) {
      throw new Error('web presenter: invalid choice declaration');
    }
    choices.set(control, { element: choice, kind, values: new Set(values) });
    choice.addEventListener('change', () => {
      const value = kind === 'checkbox'
        ? values[choice.checked ? 1 : 0]
        : Number(choice.value) | 0;
      port.postMessage({
        protocol: PROTOCOL,
        version: VERSION,
        kind: 'choice',
        control,
        value,
      });
      canvas.focus();
    });
    port.postMessage({
      protocol: PROTOCOL,
      version: VERSION,
      kind: 'choice_values',
      control,
      values,
    });
  }

  port.onmessage = (event) => {
    const message = event.data;
    if (!message || message.protocol !== PROTOCOL || message.version !== VERSION) {
      throw new Error('web presenter: invalid protocol envelope');
    }
    if (message.kind === 'hello') {
      if (!Number.isInteger(message.maximumFrameBytes) ||
          message.maximumFrameBytes <= 0 ||
          message.maximumFrameBytes > 2048 * 2048 * 4 ||
          message.maximumInputRecords !== MAX_RECORDS) {
        throw new Error('web presenter: invalid hello bounds');
      }
      active = true;
      if (status) status.textContent = 'running';
      requestTick();
      return;
    }
    if (message.kind === 'frame') {
      const width = message.width >>> 0;
      const height = message.height >>> 0;
      const stride = message.stride >>> 0;
      if (!Number.isInteger(message.sequence) ||
          message.sequence <= lastFrameSequence ||
          !(message.pixels instanceof ArrayBuffer) || width === 0 || height === 0 ||
          width > 2048 || height > 2048 || stride !== width * 4 ||
          message.pixels.byteLength !== stride * height) {
        throw new Error('web presenter: invalid measured frame');
      }
      lastFrameSequence = message.sequence;
      if (presentedWidth !== width || presentedHeight !== height) {
        canvas.width = width;
        canvas.height = height;
        presentedWidth = width;
        presentedHeight = height;
      }
      const paintStarted = performance.now();
      context.putImageData(
        new ImageData(new Uint8ClampedArray(message.pixels), width, height), 0, 0,
      );
      lastPaintMicros = Math.max(0, Math.round(
        (performance.now() - paintStarted) * 1000,
      ));
      return;
    }
    if (message.kind === 'tick_done') {
      if (tickInFlight === null || !Number.isInteger(message.sequence) ||
          message.sequence !== tickInFlight.sequence ||
          !Number.isInteger(message.workerMicros) || message.workerMicros < 0 ||
          message.workerMicros > 60 * 1000 * 1000 ||
          !Number.isInteger(message.copyMicros) || message.copyMicros < 0 ||
          message.copyMicros > message.workerMicros ||
          !Number.isInteger(message.frameBytes) || message.frameBytes < 0 ||
          message.frameBytes > 2048 * 2048 * 4 ||
          !Number.isInteger(message.presentations) || message.presentations < 0 ||
          message.presentations > 256) {
        throw new Error('web presenter: invalid tick acknowledgement');
      }
      const roundTripMicros = Math.max(0, Math.round(
        (performance.now() - tickInFlight.started) * 1000,
      ));
      if (inputTrace && (message.sequence % 60 === 0 ||
          roundTripMicros >= 20000 || message.workerMicros >= 20000)) {
        const wasmMicros = Math.max(0, message.workerMicros - message.copyMicros);
        const ms = (value) => (value / 1000).toFixed(2);
        appendTrace(
          `input-performance seq=${message.sequence} roundtrip_ms=${ms(roundTripMicros)} ` +
          `worker_ms=${ms(message.workerMicros)} wasm_ms=${ms(wasmMicros)} ` +
          `copy_ms=${ms(message.copyMicros)} paint_ms=${ms(lastPaintMicros)} ` +
          `frames=${message.presentations} bytes=${message.frameBytes}`,
        );
      }
      tickInFlight = null;
      requestTick();
      return;
    }
    if (message.kind === 'output') {
      if ((message.channel !== 1 && message.channel !== 2) ||
          typeof message.text !== 'string' || message.text.length > MAX_TEXT) {
        throw new Error('web presenter: invalid output message');
      }
      if (output) output.textContent += message.text;
      if (message.channel === 2) console.error(message.text);
      else console.log(message.text);
      return;
    }
    if (message.kind === 'trace') {
      if (typeof message.text !== 'string' || message.text.length === 0 ||
          message.text.length > 4096) {
        throw new Error('web presenter: invalid trace record');
      }
      appendTrace(message.text);
      return;
    }
    if (message.kind === 'status') {
      if (typeof message.text !== 'string' || message.text.length > 512) {
        throw new Error('web presenter: invalid status');
      }
      if (status) status.textContent = message.text;
      if (message.terminal) active = false;
      return;
    }
    if (message.kind === 'choice_state') {
      const entry = choices.get(message.control | 0);
      if (!entry || !Array.isArray(message.enabled) ||
          message.enabled.length > 256 ||
          message.enabled.some((value) =>
            !Number.isInteger(value) || !entry.values.has(value | 0)) ||
          !Number.isInteger(message.selected)) {
        throw new Error('web presenter: invalid choice state');
      }
      const choice = entry.element;
      const enabled = new Set(message.enabled.map((value) => value | 0));
      if (entry.kind === 'checkbox') {
        const off = Number(choice.dataset.freelangChoiceOff) | 0;
        const on = Number(choice.dataset.freelangChoiceOn) | 0;
        choice.disabled = !enabled.has(off) || !enabled.has(on);
        choice.checked = (message.selected | 0) === on;
      } else {
        for (const option of choice.querySelectorAll('option[data-freelang-choice-value]')) {
          const available = enabled.has(Number(option.dataset.freelangChoiceValue) | 0);
          option.disabled = !available;
          option.hidden = !available;
        }
        for (const group of choice.querySelectorAll('optgroup')) {
          group.hidden = !Array.from(group.querySelectorAll('option'))
            .some((option) => !option.disabled);
        }
        choice.disabled = enabled.size === 0;
        const placeholder = choice.querySelector('option[data-freelang-choice-placeholder]');
        if (placeholder) placeholder.hidden = enabled.size > 0;
        if (enabled.size > 0) choice.value = String(message.selected | 0);
      }
      return;
    }
    throw new Error(`web presenter: unsupported message ${String(message.kind)}`);
  };
  port.start();

  return {
    stop() {
      active = false;
      port.close();
    },
  };
}
