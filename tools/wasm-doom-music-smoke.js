#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeFixtureWad, speakerBankOracle } = require('./wasm-doom-smoke');

function name8(value) {
  const buffer = Buffer.alloc(8);
  buffer.write(value, 0, 8, 'ascii');
  return buffer;
}

function shortMus() {
  const mus = Buffer.alloc(24);
  mus.write('MUS\x1a', 0, 'binary');
  mus.writeUInt16LE(8, 4);
  mus.writeUInt16LE(16, 6);
  mus.writeUInt16LE(1, 8);
  Buffer.from([144, 197, 127, 1, 128, 69, 1, 96]).copy(mus, 16);
  return mus;
}

function genmidi() {
  const bank = Buffer.alloc(6308);
  Buffer.from([35, 79, 80, 76, 95, 73, 73, 35]).copy(bank, 0);
  bank[10] = 128;
  bank[12] = 1;
  bank[13] = 242;
  bank[14] = 68;
  bank[17] = 8;
  bank[18] = 0;
  bank[19] = 1;
  bank[20] = 242;
  bank[21] = 68;
  return bank;
}

function appendLumps(wad, additions) {
  const count = wad.readUInt32LE(4);
  const directoryOffset = wad.readUInt32LE(8);
  const lumps = [];
  for (let index = 0; index < count; index++) {
    const at = directoryOffset + index * 16;
    const offset = wad.readUInt32LE(at);
    const size = wad.readUInt32LE(at + 4);
    const zero = wad.indexOf(0, at + 8);
    const end = zero >= at + 8 && zero < at + 16 ? zero : at + 16;
    lumps.push([
      wad.toString('ascii', at + 8, end),
      Buffer.from(wad.subarray(offset, offset + size)),
    ]);
  }
  lumps.push(...additions);
  let cursor = 12;
  const entries = [];
  for (const [name, data] of lumps) {
    entries.push({ name, offset: cursor, size: data.length });
    cursor += data.length;
  }
  const header = Buffer.alloc(12);
  header.write('PWAD', 0, 'ascii');
  header.writeUInt32LE(lumps.length, 4);
  header.writeUInt32LE(cursor, 8);
  const directory = Buffer.alloc(lumps.length * 16);
  entries.forEach((entry, index) => {
    directory.writeUInt32LE(entry.offset, index * 16);
    directory.writeUInt32LE(entry.size, index * 16 + 4);
    name8(entry.name).copy(directory, index * 16 + 8);
  });
  return Buffer.concat([header, ...lumps.map(([, data]) => data), directory]);
}

function checksum(bytes) {
  let value = 2166136261 >>> 0;
  for (const byte of bytes) {
    value ^= byte;
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value;
}

function response(kind, id, value = null) {
  const buffer = Buffer.alloc(value ? 16 + value.length : 12);
  buffer.writeUInt32LE(buffer.length, 0);
  buffer.writeUInt32LE(kind, 4);
  buffer.writeUInt32LE(id, 8);
  if (value) {
    buffer.writeUInt32LE(value.length, 12);
    value.copy(buffer, 16);
  }
  return buffer;
}

async function main() {
  const speakerOracle = speakerBankOracle();
  const bundle = path.resolve(process.argv[2] || '/tmp/wasm-doom');
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'freelang-target.json')));
  assert(manifest.browserLifecycle.derivedCache,
    'bundle does not declare the derived-artifact lifecycle');
  const mus = shortMus();
  const wad = appendLumps(makeFixtureWad(), [
    ['D_E1M1', mus], ['D_E1M2', mus], ['GENMIDI', genmidi()],
  ]);
  let memory = null;
  let output = '';
  let frameChecksum = 0;
  const speakerFrames = [];
  const cacheFrames = [];
  const host = {
    panic(ptr, len, code) {
      throw new Error(`panic ${code}: ${Buffer.from(memory.buffer, ptr, len).toString('utf8')}`);
    },
    write(ptr, len) { output += Buffer.from(memory.buffer, ptr, len).toString('utf8'); },
    present_rgba(ptr, len) {
      frameChecksum = checksum(new Uint8Array(memory.buffer, ptr, len));
    },
    speaker_frame(ptr, len) {
      speakerFrames.push(Buffer.from(memory.buffer, ptr, len));
    },
    derived_cache_frame(ptr, len) {
      cacheFrames.push(Buffer.from(memory.buffer, ptr, len));
    },
  };
  const module = await WebAssembly.compile(fs.readFileSync(path.join(bundle, 'app.wasm')));
  const instance = await WebAssembly.instantiate(module, { freelang_host_v1: host });
  memory = instance.exports.memory;
  instance.exports.freelang_main();

  const deliver = (frame) => {
    const ptr = instance.exports.freelang_derived_cache_bytes_begin(frame.length);
    new Uint8Array(memory.buffer, ptr, frame.length).set(frame);
    return instance.exports.freelang_derived_cache_bytes_commit(frame.length);
  };
  const nextGet = () => {
    const frame = cacheFrames.find((item) => item.readUInt32LE(4) === 1 && !item.consumed);
    assert(frame, 'expected a derived-cache GET request');
    frame.consumed = true;
    assert.strictEqual(frame.length, 80, 'derived-cache GET measurement drifted');
    return { frame, id: frame.readUInt32LE(8), key: frame.subarray(16).toString('ascii') };
  };

  const ptr = instance.exports.freelang_host_bytes_begin(wad.length);
  new Uint8Array(memory.buffer, ptr, wad.length).set(wad);
  assert.strictEqual(instance.exports.freelang_host_bytes_commit(wad.length), 0);
  assert(instance.exports.freelang_wasm_input(0, 22, 0, 0) > 0,
    'initial level did not wait on the derived music cache');
  const firstGet = nextGet();
  deliver(response(0x8002, firstGet.id));
  assert.strictEqual(frameChecksum, 1825139128,
    'music startup changed the retained E1M1 frame');
  const put = cacheFrames.find((frame) => frame.readUInt32LE(4) === 2);
  assert(put, 'cache miss did not publish a derived WAV');
  const keyBytes = put.readUInt32LE(12);
  const valueBytes = put.readUInt32LE(16);
  const cachedKey = put.subarray(20, 20 + keyBytes).toString('ascii');
  const cachedWav = put.subarray(20 + keyBytes);
  assert.deepStrictEqual([keyBytes, valueBytes, cachedKey, cachedWav.length],
    [64, 359, firstGet.key, 359]);
  assert.strictEqual(cachedWav.toString('ascii', 0, 4), 'RIFF');
  const firstHello = speakerFrames.find((frame) => frame.readUInt32LE(4) === 1);
  assert(firstHello, 'generated score did not install a speaker bank');
  assert.deepStrictEqual(
    [firstHello.length, firstHello.readUInt32LE(28)],
    [speakerOracle.musicBytes, speakerOracle.clipCount],
  );
  assert(speakerFrames.some((frame) => frame.length === 28 &&
    frame.readUInt32LE(4) === 2 && frame.readUInt32LE(8) === 0 &&
    frame.readUInt32LE(12) === 0 && frame.readUInt32LE(16) === 1 &&
    frame.readUInt32LE(20) === 176 && frame.readUInt32LE(24) === 176),
  'generated score did not start looping on music voice zero');
  assert(output.includes('GENERATING MUSIC') === false,
    'presentation text should not leak into stdout');
  assert(output.includes('music generated in Freelang WASM'));

  assert.strictEqual(instance.exports.freelang_wasm_choice_select(1, 112), 112);
  const secondGet = nextGet();
  assert.strictEqual(secondGet.key, cachedKey,
    'identical effective MUS/GENMIDI inputs did not share their semantic key');
  deliver(response(0x8001, secondGet.id, cachedWav));
  assert.strictEqual(instance.exports.freelang_wasm_choice_current(1), 112);
  assert.strictEqual(frameChecksum, 4013906238,
    'cached music startup changed the retained E1M2 frame');
  assert(output.includes('music loaded from browser cache'));

  const mapChecksum = frameChecksum;
  assert.strictEqual(instance.exports.freelang_wasm_choice_select(3, 1), 1);
  assert.strictEqual(instance.exports.freelang_wasm_choice_current(3), 1);
  assert.strictEqual(frameChecksum, mapChecksum,
    'Skip music reloaded or redrew application state');
  const lastHello = [...speakerFrames].reverse()
    .find((frame) => frame.readUInt32LE(4) === 1);
  assert.strictEqual(lastHello.length, speakerOracle.silentBytes,
    'Skip music did not preserve the effect bank with a silent score slot');

  assert.strictEqual(instance.exports.freelang_wasm_choice_select(3, 0), 0);
  const resumeGet = nextGet();
  deliver(response(0x8001, resumeGet.id, cachedWav));
  assert.strictEqual(frameChecksum, mapChecksum,
    'resuming cached music reloaded or redrew application state');

  console.log(JSON.stringify({
    wadBytes: wad.length,
    cacheKeyBytes: keyBytes,
    cachedWavBytes: cachedWav.length,
    speakerHelloBytes: firstHello.length,
    speakerSessions: speakerFrames.filter((frame) => frame.readUInt32LE(4) === 1).length,
    cacheGets: cacheFrames.filter((frame) => frame.readUInt32LE(4) === 1).length,
    cachePuts: cacheFrames.filter((frame) => frame.readUInt32LE(4) === 2).length,
    initialChecksum: 1825139128,
    secondMapChecksum: frameChecksum,
    musicInWasm: true,
  }));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
