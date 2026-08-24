// f/speaker WebAudio sidecar — browser implementation of the existing
// freelang speaker protocol v2. MessagePort preserves frame boundaries, but
// every ArrayBuffer is the exact byte-level HELLO/PLAY/STOP/BYE frame accepted
// by the native AudioQueue sidecar. No archive identity or game policy enters here.

const MAX_WAV_BYTES = 16 * 1024 * 1024 + 44;
const MAX_BANK_PCM_BYTES = 32 * 1024 * 1024;
const MAX_BANK_FRAME_BYTES = 33557536;
const MAX_CLIPS = 64;
const MAX_VOICES = 16;
const MAX_PENDING = 256;
const encoder = new TextEncoder();

const KIND = Object.freeze({
  HELLO: 1,
  PLAY: 2,
  BYE: 3,
  STOP: 4,
  HELLO_ACK: 0x8001,
  ERROR: 0x80ff,
});

function u32(view, offset) {
  return view.getUint32(offset, true);
}

function putU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function exactMagic(bytes, offset, text) {
  for (let index = 0; index < text.length; index++) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function inspectWav(bytes) {
  if (bytes.byteLength <= 44 || bytes.byteLength > MAX_WAV_BYTES) {
    throw new Error('WAV length is outside the protocol bound');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!exactMagic(bytes, 0, 'RIFF') || !exactMagic(bytes, 8, 'WAVE') ||
      !exactMagic(bytes, 12, 'fmt ') || !exactMagic(bytes, 36, 'data') ||
      u32(view, 4) !== bytes.byteLength - 8 || u32(view, 16) !== 16 ||
      view.getUint16(20, true) !== 1) {
    throw new Error('WAV canonical header is invalid');
  }
  const channels = view.getUint16(22, true);
  const rate = u32(view, 24);
  const pcmBytes = u32(view, 40);
  if ((channels !== 1 && channels !== 2) || rate < 8000 || rate > 48000 ||
      view.getUint16(34, true) !== 8 ||
      view.getUint16(32, true) !== channels ||
      u32(view, 28) !== rate * channels || pcmBytes !== bytes.byteLength - 44 ||
      pcmBytes % channels !== 0) {
    throw new Error('WAV PCM contract is invalid');
  }
  return {
    channels,
    rate,
    frames: pcmBytes / channels,
    pcm: bytes.subarray(44),
  };
}

function inspectHello(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 32 ||
      buffer.byteLength > MAX_BANK_FRAME_BYTES) {
    throw new Error('speaker HELLO length is outside the protocol bound');
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const clipCount = u32(view, 28);
  if (u32(view, 0) !== buffer.byteLength || u32(view, 4) !== KIND.HELLO ||
      u32(view, 8) !== 2 || u32(view, 12) !== 48000 ||
      u32(view, 16) !== 2 || u32(view, 20) !== 8 || u32(view, 24) !== 0 ||
      clipCount < 1 || clipCount > MAX_CLIPS) {
    throw new Error('speaker protocol-v2 HELLO is invalid');
  }
  const clips = [];
  let cursor = 32;
  let pcmTotal = 0;
  for (let index = 0; index < clipCount; index++) {
    if (cursor + 4 > bytes.byteLength) throw new Error('speaker clip length is truncated');
    const wavBytes = u32(view, cursor);
    cursor += 4;
    if (wavBytes <= 44 || wavBytes > MAX_WAV_BYTES ||
        cursor + wavBytes < cursor || cursor + wavBytes > bytes.byteLength) {
      throw new Error('speaker clip span is invalid');
    }
    const clip = inspectWav(bytes.subarray(cursor, cursor + wavBytes));
    pcmTotal += clip.pcm.byteLength;
    if (pcmTotal > MAX_BANK_PCM_BYTES) {
      throw new Error('speaker clip bank PCM exceeds 32 MiB');
    }
    clips.push(clip);
    cursor += wavBytes;
  }
  if (cursor !== bytes.byteLength) throw new Error('speaker HELLO has trailing bytes');
  return clips;
}

function responseFrame(kind, fields) {
  const buffer = new ArrayBuffer(8 + fields.length * 4);
  const view = new DataView(buffer);
  putU32(view, 0, buffer.byteLength);
  putU32(view, 4, kind);
  fields.forEach((value, index) => putU32(view, 8 + index * 4, value));
  return buffer;
}

function errorFrame(code, detail) {
  let text = encoder.encode(String(detail));
  if (text.byteLength > 256) text = text.slice(0, 256);
  const buffer = new ArrayBuffer(16 + text.byteLength);
  const view = new DataView(buffer);
  putU32(view, 0, buffer.byteLength);
  putU32(view, 4, KIND.ERROR);
  putU32(view, 8, code);
  putU32(view, 12, text.byteLength);
  new Uint8Array(buffer, 16).set(text);
  return buffer;
}

function assertPort(port) {
  if (!(port instanceof MessagePort)) {
    throw new TypeError('web speaker: MessagePort is required');
  }
}

export function startSpeakerWeb({ port }) {
  assertPort(port);
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  let context = null;
  let clips = [];
  let buffers = [];
  let acknowledged = false;
  let stopped = false;
  const voices = Array(MAX_VOICES).fill(null);
  const pending = [];

  const send = (buffer) => port.postMessage(buffer, [buffer]);

  const stopVoice = (voice) => {
    const entry = voices[voice];
    if (!entry) return;
    voices[voice] = null;
    try { entry.source.stop(); } catch (_) { /* already ended */ }
    for (const node of entry.nodes) {
      try { node.disconnect(); } catch (_) { /* already disconnected */ }
    }
  };

  const play = (voice, clip, loop, leftGain, rightGain) => {
    stopVoice(voice);
    const source = context.createBufferSource();
    source.buffer = buffers[clip];
    source.loop = loop === 1;
    const left = context.createGain();
    const right = context.createGain();
    const merger = context.createChannelMerger(2);
    left.gain.value = leftGain / 256;
    right.gain.value = rightGain / 256;
    const nodes = [source, left, right, merger];
    if (clips[clip].channels === 1) {
      source.connect(left);
      source.connect(right);
    } else {
      const splitter = context.createChannelSplitter(2);
      nodes.push(splitter);
      source.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
    }
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    merger.connect(context.destination);
    const entry = { source, nodes };
    voices[voice] = entry;
    source.onended = () => {
      if (voices[voice] === entry) voices[voice] = null;
      for (const node of nodes) {
        try { node.disconnect(); } catch (_) { /* already disconnected */ }
      }
    };
    source.start();
  };

  const dispatch = (frame) => {
    const view = new DataView(frame);
    const kind = u32(view, 4);
    if (kind === KIND.PLAY) {
      if (frame.byteLength !== 28) throw new Error('speaker PLAY length is invalid');
      const voice = u32(view, 8);
      const clip = u32(view, 12);
      const loop = u32(view, 16);
      const leftGain = u32(view, 20);
      const rightGain = u32(view, 24);
      if (voice >= MAX_VOICES || clip >= clips.length || loop > 1 ||
          leftGain > 256 || rightGain > 256) {
        throw new Error('speaker PLAY fields are invalid');
      }
      play(voice, clip, loop, leftGain, rightGain);
      return;
    }
    if (kind === KIND.STOP) {
      if (frame.byteLength !== 12 || u32(view, 8) >= MAX_VOICES) {
        throw new Error('speaker STOP is invalid');
      }
      stopVoice(u32(view, 8));
      return;
    }
    throw new Error('speaker received an unexpected command');
  };

  const removeActivation = () => {
    window.removeEventListener('pointerdown', resume, true);
    window.removeEventListener('keydown', resume, true);
    window.removeEventListener('touchstart', resume, true);
  };

  const becomeReady = () => {
    if (acknowledged || stopped || !context || context.state !== 'running') return;
    acknowledged = true;
    removeActivation();
    send(responseFrame(KIND.HELLO_ACK, [2, 0]));
    while (pending.length > 0) dispatch(pending.shift());
  };

  async function resume() {
    if (stopped || !context || acknowledged) return;
    const activeContext = context;
    try {
      await activeContext.resume();
      if (context === activeContext) becomeReady();
    } catch (_) {
      // Browser activation policy is an external world state. Keep the finite
      // listeners installed and retry only on the next real user gesture.
    }
  }

  // A native BYE terminates one process/connection. The browser host keeps the
  // private routing MessagePort and may supervise a fresh protocol session on
  // the next HELLO, which is equivalent to birthing a new native sidecar.
  const closeSession = () => {
    removeActivation();
    for (let voice = 0; voice < MAX_VOICES; voice++) stopVoice(voice);
    pending.length = 0;
    const closing = context;
    context = null;
    clips = [];
    buffers = [];
    acknowledged = false;
    if (closing) closing.close().catch(() => {});
  };

  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    closeSession();
    port.close();
  };

  const fail = (code, error) => {
    if (stopped) return;
    send(errorFrame(code, error instanceof Error ? error.message : error));
    shutdown();
  };

  port.onmessage = (event) => {
    try {
      const frame = event.data;
      if (!(frame instanceof ArrayBuffer) || frame.byteLength < 8 ||
          frame.byteLength > MAX_BANK_FRAME_BYTES) {
        throw new Error('speaker frame is not a bounded ArrayBuffer');
      }
      const view = new DataView(frame);
      if (u32(view, 0) !== frame.byteLength) {
        throw new Error('speaker frame length disagrees with its capsule');
      }
      const kind = u32(view, 4);
      if (kind === KIND.HELLO) {
        if (context || clips.length !== 0) throw new Error('duplicate speaker HELLO');
        clips = inspectHello(frame);
        if (typeof AudioContextClass !== 'function') {
          fail(4, 'WebAudio AudioContext is unavailable');
          return;
        }
        context = new AudioContextClass({ sampleRate: 48000 });
        buffers = clips.map((clip) => {
          const buffer = context.createBuffer(clip.channels, clip.frames, clip.rate);
          for (let channel = 0; channel < clip.channels; channel++) {
            const samples = buffer.getChannelData(channel);
            for (let index = 0; index < clip.frames; index++) {
              samples[index] = (clip.pcm[index * clip.channels + channel] - 128) / 128;
            }
          }
          return buffer;
        });
        window.addEventListener('pointerdown', resume, true);
        window.addEventListener('keydown', resume, true);
        window.addEventListener('touchstart', resume, true);
        resume();
        return;
      }
      if (kind === KIND.BYE) {
        if (frame.byteLength !== 8) throw new Error('speaker BYE length is invalid');
        if (!context) throw new Error('speaker BYE arrived before HELLO');
        closeSession();
        return;
      }
      if (!context) throw new Error('speaker command arrived before HELLO');
      if (!acknowledged) {
        if (pending.length >= MAX_PENDING) throw new Error('speaker pending command bound exceeded');
        pending.push(frame);
        return;
      }
      dispatch(frame);
    } catch (error) {
      fail(5, error);
    }
  };
  port.start();

  return { stop: shutdown };
}

export { inspectHello };
