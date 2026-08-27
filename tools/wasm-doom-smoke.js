#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BLASTER_SOUND_COUNT = 3;

function put16(buffer, offset, value) {
  buffer.writeUInt16LE(value & 0xffff, offset);
}

function name8(value) {
  const buffer = Buffer.alloc(8);
  buffer.write(value, 0, 8, 'ascii');
  return buffer;
}

function makePatch(width, height, pixelAt, leftOffset = 0, topOffset = 0) {
  const headerBytes = 8 + width * 4;
  const columnBytes = height + 5;
  const patch = Buffer.alloc(headerBytes + width * columnBytes);
  put16(patch, 0, width);
  put16(patch, 2, height);
  put16(patch, 4, leftOffset);
  put16(patch, 6, topOffset);
  for (let x = 0; x < width; x++) {
    const cursor = headerBytes + x * columnBytes;
    patch.writeUInt32LE(cursor, 8 + x * 4);
    patch[cursor] = 0;
    patch[cursor + 1] = height;
    for (let y = 0; y < height; y++) patch[cursor + 3 + y] = pixelAt(x, y) & 255;
    patch[cursor + height + 4] = 255;
  }
  return patch;
}

function uiPatchNames() {
  const names = ['STBAR', 'STFST00'];
  for (let digit = 0; digit <= 9; digit++) names.push(`STTNUM${digit}`);
  names.push('STTPRCNT', 'STARMS');
  for (let digit = 0; digit <= 9; digit++) names.push(`STGNUM${digit}`);
  for (let digit = 0; digit <= 9; digit++) names.push(`STYSNUM${digit}`);
  for (let code = 33; code <= 95; code++) names.push(`STCFN0${code}`);
  names.push('M_DOOM', 'M_SKULL1', 'M_SKULL2');
  for (let flat = 1; flat <= 14; flat++) {
    names.push(`STFST${Math.floor(flat / 3)}${flat % 3}`);
  }
  for (let tier = 0; tier <= 4; tier++) names.push(`STFOUCH${tier}`);
  names.push('STFDEAD0');
  for (let key = 0; key <= 5; key++) names.push(`STKEYS${key}`);
  assert.strictEqual(names.length, 126, 'UI fixture slot catalog drifted');
  return names;
}

function presentationLumps() {
  const weaponNames = [
    'SAWGA0', 'SAWGB0', 'SAWGC0', 'SAWGD0',
    'PISGA0', 'PISGB0', 'PISGC0', 'PISGD0', 'PISGE0',
    'SHTGA0', 'SHTGB0', 'SHTGC0', 'SHTGD0',
    'CHGGA0', 'CHGGB0', 'MISGA0', 'MISGB0',
    'PLSGA0', 'PLSGB0', 'BFGGA0', 'BFGGB0', 'BFGGC0',
  ];
  const effectNames = [
    'PISFA0', 'SHTFA0', 'SHTFB0', 'CHGFA0', 'CHGFB0',
    'MISFA0', 'MISFB0', 'MISFC0', 'MISFD0',
    'PLSFA0', 'PLSFB0', 'BFGFA0', 'BFGFB0',
    'MISLA1', 'MISLA8A2', 'MISLA7A3', 'MISLA6A4', 'MISLA5',
    'MISLB0', 'MISLC0', 'MISLD0',
    'PLSSA0', 'PLSSB0', 'PLSEA0', 'PLSEB0', 'PLSEC0', 'PLSED0', 'PLSEE0',
    'BFS1A0', 'BFS1B0', 'BFE1A0', 'BFE1B0', 'BFE1C0', 'BFE1D0',
    'BFE1E0', 'BFE1F0',
  ];
  const actorNames = [];
  for (const frame of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    actorNames.push(
      `POSS${frame}1`, `POSS${frame}2${frame}8`,
      `POSS${frame}3${frame}7`, `POSS${frame}4${frame}6`,
      `POSS${frame}5`,
    );
  }
  for (const frame of ['H', 'I', 'J', 'K', 'L']) actorNames.push(`POSS${frame}0`);
  const worldNames = [
    'CLIPA0', 'PLASA0', 'BON2A0', 'BAR1A0', 'BAR1B0',
    'BEXPA0', 'BEXPB0', 'BEXPC0', 'BEXPD0', 'BEXPE0',
  ];
  const spriteNames = [...weaponNames, ...effectNames, ...actorNames, ...worldNames];
  const sprites = [['S_START', Buffer.alloc(0)]];
  spriteNames.forEach((name, index) => {
    const weapon = index < weaponNames.length;
    // World sprites need Doom-scale top offsets to project from the floor
    // plane through the same player-eye transform as a real IWAD patch.
    const width = 24;
    const height = weapon ? 20 : 56;
    const seed = 32 + (index * 17) % 192;
    sprites.push([name, makePatch(
      width, height,
      (x, y) => seed + ((x * 3 + y * 5) % 24),
      weapon ? -120 : Math.floor(width / 2),
      weapon ? -100 : height,
    )]);
  });
  sprites.push(['S_END', Buffer.alloc(0)]);

  const ui = uiPatchNames().map((name, index) => {
    const status = name === 'STBAR';
    const width = status ? 320 : (name.startsWith('STF') ? 24 : 8);
    const height = status ? 32 : (name.startsWith('STF') ? 24 : 8);
    const seed = 16 + (index * 11) % 208;
    return [name, makePatch(width, height,
      (x, y) => seed + ((x * 5 + y * 7) % 24))];
  });
  return [...sprites, ...ui];
}

function audioLumps() {
  const names = [
    'DSSAWFUL', 'DSPISTOL', 'DSSHOTGN', 'DSRLAUNC',
    'DSITEMUP', 'DSWPNUP', 'DSDOROPN', 'DSDORCLS',
    'DSSWTCHN', 'DSSWTCHX', 'DSTELEPT', 'DSBAREXP',
    'DSPLPAIN', 'DSPOSIT1', 'DSSGTSIT', 'DSBGSIT1',
    'DSSGTATK', 'DSCLAW', 'DSPOPAIN', 'DSDMPAIN',
    'DSPODTH1', 'DSSGTDTH', 'DSBGDTH1', 'DSRXPLOD',
    'DSFIRSHT', 'DSFIRXPL', 'DSCACSIT', 'DSBRSSIT',
    'DSCYBSIT', 'DSSPISIT', 'DSSKLATK', 'DSCACDTH',
    'DSBRSDTH', 'DSSKLDTH', 'DSCYBDTH', 'DSSPIDTH',
    'DSPLASMA', 'DSBFG', 'DSGETPOW',
  ];
  return names.map((name, index) => {
    const samples = 64;
    const sound = Buffer.alloc(8 + samples);
    sound.writeUInt16LE(3, 0);
    sound.writeUInt16LE(11025, 2);
    sound.writeUInt32LE(samples, 4);
    for (let sample = 0; sample < samples; sample++) {
      sound[8 + sample] = 64 + ((sample * (index + 3) * 7) % 128);
    }
    return [name, sound];
  });
}

// One silent/music voice precedes the WAD-derived effects and the bounded
// original blaster family. Keep the cross-smoke protocol measurements in one
// place so a deliberate bank change cannot leave three unrelated oracles.
function speakerBankOracle() {
  return {
    clipCount: 1 + audioLumps().length + BLASTER_SOUND_COUNT,
    silentBytes: 14514,
    musicBytes: 14828,
  };
}

function makeTextureCatalog() {
  const pnames = Buffer.alloc(12);
  pnames.writeUInt32LE(1, 0);
  name8('PATCHA').copy(pnames, 4);

  const texture1 = Buffer.alloc(40);
  texture1.writeUInt32LE(1, 0);
  texture1.writeUInt32LE(8, 4);
  name8('WALL').copy(texture1, 8);
  put16(texture1, 20, 64);
  put16(texture1, 22, 64);
  put16(texture1, 28, 1);
  put16(texture1, 34, 0);

  const playpal = Buffer.alloc(768);
  for (let colour = 0; colour < 256; colour++) {
    playpal[colour * 3] = colour;
    playpal[colour * 3 + 1] = (colour * 3) & 255;
    playpal[colour * 3 + 2] = 255 - colour;
  }
  const colormap = Buffer.alloc(8192);
  for (let shade = 0; shade < 32; shade++) {
    for (let colour = 0; colour < 256; colour++) {
      colormap[shade * 256 + colour] = Math.floor(colour * (31 - shade) / 31);
    }
  }
  return {
    pnames,
    texture1,
    patch: makePatch(64, 64, (x, y) => 32 + ((x * 5 + y * 3) % 192)),
    playpal,
    colormap,
  };
}

// Two closed-square maps plus a real PNAMES/TEXTURE1/patch graph, colour tables
// and two 64x64 flats. It is deliberately tiny, but it crosses the same WAD
// directory, map-catalog, checked texture composition, geometry proof and
// textured BSP draw boundaries as an external IWAD.
function makeFixtureWad() {
  const catalog = makeTextureCatalog();
  const things = Buffer.alloc(40);
  const putThing = (buffer, index, x, y, angle, kind) => {
    const at = index * 10;
    put16(buffer, at, x); put16(buffer, at + 2, y);
    put16(buffer, at + 4, angle); put16(buffer, at + 6, kind);
    put16(buffer, at + 8, 7);
  };
  putThing(things, 0, 40, 30, 0, 1);
  putThing(things, 1, 100, 30, 180, 3004);
  putThing(things, 2, 84, 54, 0, 2007);
  putThing(things, 3, 124, 58, 0, 2035);
  const things2 = Buffer.from(things);
  putThing(things2, 0, 80, 45, 90, 1);

  const vertices = Buffer.alloc(16);
  [[0, 0], [160, 0], [160, 90], [0, 90]].forEach(([x, y], index) => {
    put16(vertices, index * 4, x); put16(vertices, index * 4 + 2, y);
  });

  const linedefs = Buffer.alloc(56);
  for (let index = 0; index < 4; index++) {
    const at = index * 14;
    put16(linedefs, at, index); put16(linedefs, at + 2, (index + 1) % 4);
    put16(linedefs, at + 10, index); put16(linedefs, at + 12, 65535);
  }

  const sidedefs = Buffer.alloc(120);
  for (let index = 0; index < 4; index++) {
    const at = index * 30;
    name8('-').copy(sidedefs, at + 4);
    name8('-').copy(sidedefs, at + 12);
    name8('WALL').copy(sidedefs, at + 20);
    put16(sidedefs, at + 28, 0);
  }

  const segs = Buffer.alloc(48);
  for (let index = 0; index < 4; index++) {
    const at = index * 12;
    put16(segs, at, index); put16(segs, at + 2, (index + 1) % 4);
    put16(segs, at + 6, index); put16(segs, at + 8, 0);
  }

  const subsectors = Buffer.alloc(4);
  put16(subsectors, 0, 4); put16(subsectors, 2, 0);
  const sectors = Buffer.alloc(26);
  put16(sectors, 0, 0); put16(sectors, 2, 128);
  name8('FLOOR0_1').copy(sectors, 4);
  name8('CEIL1_1').copy(sectors, 12);
  put16(sectors, 20, 160);

  const floor = Buffer.alloc(4096);
  const ceiling = Buffer.alloc(4096);
  for (let index = 0; index < 4096; index++) {
    floor[index] = 48 + ((index + Math.floor(index / 64) * 7) % 48);
    ceiling[index] = 112 + ((index * 3) % 32);
  }

  const lumps = [
    ['E1M1', Buffer.alloc(0)], ['THINGS', things], ['LINEDEFS', linedefs],
    ['SIDEDEFS', sidedefs], ['VERTEXES', vertices], ['SEGS', segs],
    ['SSECTORS', subsectors], ['NODES', Buffer.alloc(0)], ['SECTORS', sectors],
    ['REJECT', Buffer.alloc(0)], ['BLOCKMAP', Buffer.alloc(0)],
    ['E1M2', Buffer.alloc(0)], ['THINGS', things2], ['LINEDEFS', linedefs],
    ['SIDEDEFS', sidedefs], ['VERTEXES', vertices], ['SEGS', segs],
    ['SSECTORS', subsectors], ['NODES', Buffer.alloc(0)], ['SECTORS', sectors],
    ['REJECT', Buffer.alloc(0)], ['BLOCKMAP', Buffer.alloc(0)],
    ['PLAYPAL', catalog.playpal], ['COLORMAP', catalog.colormap],
    ['PNAMES', catalog.pnames], ['TEXTURE1', catalog.texture1],
    ['PATCHA', catalog.patch],
    ['F_START', Buffer.alloc(0)], ['FLOOR0_1', floor], ['CEIL1_1', ceiling],
    ['F_END', Buffer.alloc(0)],
    ...audioLumps(),
    ...presentationLumps(),
  ];
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

function checksumRegion(bytes, frameWidth, x, y, width, height) {
  let value = 2166136261 >>> 0;
  for (let row = y; row < y + height; row++) {
    const first = (row * frameWidth + x) * 4;
    const last = first + width * 4;
    for (let offset = first; offset < last; offset++) {
      value ^= bytes[offset];
      value = Math.imul(value, 16777619) >>> 0;
    }
  }
  return value;
}

async function main() {
  const bundle = path.resolve(process.argv[2] || '/tmp/wasm-doom');
  const benchmarkArg = process.argv.find((arg) => arg.startsWith('--benchmark-frames='));
  const benchmarkFrames = benchmarkArg
    ? Number.parseInt(benchmarkArg.slice('--benchmark-frames='.length), 10)
    : 0;
  assert(Number.isSafeInteger(benchmarkFrames) && benchmarkFrames >= 0 && benchmarkFrames <= 1000,
    'benchmark frame count must be an integer in [0, 1000]');
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'freelang-target.json'), 'utf8'));
  const wad = makeFixtureWad();
  const speakerOracle = speakerBankOracle();
  assert.strictEqual(wad.length, 225460,
    'complete presentation fixture measurement drifted');
  let memory = null;
  let presentations = 0;
  let frameChecksum = 0;
  let frameWidth = 0;
  let frameHeight = 0;
  let frameStatusChecksum = 0;
  let frameWeaponChecksum = 0;
  const speakerFrames = [];
  const presentationChecksums = [];
  let output = '';
  const host = {
    panic(ptr, len, code) {
      const message = Buffer.from(memory.buffer, ptr, len).toString('utf8');
      throw new Error(`panic ${code}: ${message}`);
    },
    write(ptr, len) { output += Buffer.from(memory.buffer, ptr, len).toString('utf8'); },
    present_rgba(ptr, len, width, height, stride) {
      if (![320, 640, 960, 1280].includes(width) || height !== width * 5 / 8 ||
          stride !== width * 4 || len !== stride * height) {
        throw new Error(
          `unexpected Doom presentation measurement ${ptr}/${len}/${width}/${height}/${stride}`);
      }
      presentations++;
      frameWidth = width;
      frameHeight = height;
      const pixels = new Uint8Array(memory.buffer, ptr, len);
      frameChecksum = checksum(pixels);
      const statusHeight = 32 * height / 200;
      frameStatusChecksum = checksumRegion(
        pixels, width, 0, height - statusHeight, width, statusHeight,
      );
      frameWeaponChecksum = checksumRegion(
        pixels, width, Math.floor(width / 4),
        Math.max(0, height - statusHeight - Math.floor(height / 3)),
        Math.floor(width / 2), Math.floor(height / 3),
      );
      presentationChecksums.push(frameChecksum);
    },
    speaker_frame(ptr, len) {
      const frame = Buffer.from(memory.buffer, ptr, len);
      assert.strictEqual(frame.readUInt32LE(0), len,
        'speaker frame length disagrees with measured import');
      speakerFrames.push(Buffer.from(frame));
    },
    derived_cache_frame(ptr, len) {
      const frame = Buffer.from(memory.buffer, ptr, len);
      assert.strictEqual(frame.readUInt32LE(0), len,
        'derived-cache frame length disagrees with measured import');
      throw new Error('fixture without MUS/GENMIDI unexpectedly requested derived cache');
    },
  };
  const module = await WebAssembly.compile(fs.readFileSync(path.join(bundle, 'app.wasm')));
  const actualImports = WebAssembly.Module.imports(module).map((item) => item.name);
  if (actualImports.join(',') !== manifest.imports.join(',')) {
    throw new Error('module imports disagree with target manifest');
  }
  const instance = await WebAssembly.instantiate(module, { freelang_host_v1: host });
  memory = instance.exports.memory;
  instance.exports.freelang_main();
  const ptr = instance.exports.freelang_host_bytes_begin(wad.length);
  new Uint8Array(memory.buffer, ptr, wad.length).set(wad);
  const result = instance.exports.freelang_host_bytes_commit(wad.length);
  if (result !== 0) throw new Error(`fixture WAD rejected with ${result}`);
  if (presentations !== 3 || frameChecksum === 0) {
    throw new Error(`expected startup, audio-loading, and Doom frames, got ${presentations}`);
  }
  const initialFrameChecksum = frameChecksum;
  const initialStatusChecksum = frameStatusChecksum;
  const initialWeaponChecksum = frameWeaponChecksum;
  assert.strictEqual(speakerFrames.length, 1,
    'WAD load did not publish exactly one speaker-v2 bank');
  const speakerHello = speakerFrames[0];
  assert.deepStrictEqual([
    speakerHello.readUInt32LE(0), speakerHello.readUInt32LE(4),
    speakerHello.readUInt32LE(8), speakerHello.readUInt32LE(12),
    speakerHello.readUInt32LE(16), speakerHello.readUInt32LE(20),
    speakerHello.readUInt32LE(24), speakerHello.readUInt32LE(28),
  ], [speakerHello.length, 1, 2, 48000, 2, 8, 0, speakerOracle.clipCount],
  'speaker bank is not the canonical protocol-v2 HELLO');
  assert.strictEqual(speakerHello.length, speakerOracle.silentBytes,
    'canonical synthetic speaker bank measurement drifted');
  assert.strictEqual(initialFrameChecksum, 1825139128,
    'initial status/weapon frame differs from the retained oracle');
  assert.strictEqual(initialStatusChecksum, 3697125945,
    'WAD-native status region differs from the retained oracle');
  assert.strictEqual(initialWeaponChecksum, 2214266249,
    'first-person weapon region differs from the retained oracle');
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 6, 0, 0), 1,
    'complete sprite bank is not ready');
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 7, 0, 0), 1,
    'complete UI bank is not ready');
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 8, 0, 0), 131,
    'required player/effect/world sprite slots drifted');
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 9, 0, 0), 126,
    'complete UI slot count drifted');
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 10, 0, 0),
    instance.exports.freelang_wasm_input(0, 11, 0, 0),
    instance.exports.freelang_wasm_input(0, 12, 0, 0),
  ], [100, 50, 1],
  'status and monster layers are not reading canonical combat state');
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 14, 0, 0),
    instance.exports.freelang_wasm_input(0, 15, 0, 0),
    instance.exports.freelang_wasm_input(0, 16, 0, 0),
    instance.exports.freelang_wasm_input(0, 17, 0, 0),
  ], [1, 1, 0, 1],
  'enemy, pickup and barrel did not survive the world-sprite projection');
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 18, 0, 0), 1,
    'canonical effect bank did not become audio-ready');
  assert.strictEqual(instance.exports.freelang_wasm_choice_available(1, 111), 1,
    'Freelang catalog omitted complete E1M1');
  assert.strictEqual(instance.exports.freelang_wasm_choice_available(1, 112), 1,
    'Freelang catalog omitted complete E1M2');
  assert.strictEqual(instance.exports.freelang_wasm_choice_available(1, 113), 0,
    'Freelang catalog admitted absent E1M3');
  assert.strictEqual(instance.exports.freelang_wasm_choice_available(1, 1001), 0,
    'Freelang catalog admitted absent MAP01');
  assert.strictEqual(instance.exports.freelang_wasm_choice_current(1), 111,
    'first complete map was not selected');
  for (const width of [320, 640, 960, 1280]) {
    assert.strictEqual(instance.exports.freelang_wasm_choice_available(2, width), 1,
      `Freelang omitted admitted logical width ${width}`);
  }
  assert.strictEqual(instance.exports.freelang_wasm_choice_available(2, 800), 0,
    'Freelang admitted an undeclared logical width');

  // Held input is consumed by frame time, not one browser key-repeat impulse.
  instance.exports.freelang_wasm_input(1, 119, 0, 0);
  instance.exports.freelang_wasm_frame(16);
  instance.exports.freelang_wasm_input(2, 119, 0, 0);
  const movedFrameChecksum = frameChecksum;
  const movedX = instance.exports.freelang_wasm_input(0, 1, 0, 0);
  const movedY = instance.exports.freelang_wasm_input(0, 2, 0, 0);
  assert.notStrictEqual(movedFrameChecksum, initialFrameChecksum,
    'held W input did not move the Freelang-owned camera');
  assert.deepStrictEqual([movedX, movedY], [48, 30],
    'shared native-session W step differs from the retained position oracle');

  instance.exports.freelang_wasm_input(1, 114, 0, 0);
  instance.exports.freelang_wasm_input(2, 114, 0, 0);
  instance.exports.freelang_wasm_frame(32);
  instance.exports.freelang_wasm_input(1, 119, 0, 0);
  instance.exports.freelang_wasm_input(1, 97, 0, 0);
  instance.exports.freelang_wasm_frame(82);
  instance.exports.freelang_wasm_input(2, 119, 0, 0);
  instance.exports.freelang_wasm_input(2, 97, 0, 0);
  const diagonalFrameChecksum = frameChecksum;
  const diagonalX = instance.exports.freelang_wasm_input(0, 1, 0, 0);
  const diagonalY = instance.exports.freelang_wasm_input(0, 2, 0, 0);
  const groundedWorldTick = instance.exports.freelang_wasm_input(0, 5, 0, 0);
  assert.deepStrictEqual([diagonalX, diagonalY], [48, 36],
    'shared native-session W+A step differs from the retained position oracle');
  assert.strictEqual(groundedWorldTick, 2,
    'grounded browser frames did not advance stair/support world state');

  const angleBeforeMouse = instance.exports.freelang_wasm_input(0, 0, 0, 0);
  instance.exports.freelang_wasm_input(12, 1, 3, 0);
  instance.exports.freelang_wasm_input(10, 12, -6, 0);
  instance.exports.freelang_wasm_frame(98);
  const angleAfterMouse = instance.exports.freelang_wasm_input(0, 0, 0, 0);
  const mouseFrameChecksum = frameChecksum;
  assert.notStrictEqual(angleAfterMouse, angleBeforeMouse,
    'relative pointer motion did not change Freelang yaw');
  assert.notStrictEqual(mouseFrameChecksum, diagonalFrameChecksum,
    'relative pointer motion did not redraw the Freelang view');

  instance.exports.freelang_wasm_input(1, 32, 0, 0);
  instance.exports.freelang_wasm_input(2, 32, 0, 0);
  instance.exports.freelang_wasm_frame(126);
  instance.exports.freelang_wasm_frame(154);
  instance.exports.freelang_wasm_frame(182);
  instance.exports.freelang_wasm_frame(210);
  const jumpFrameChecksum = frameChecksum;
  const jumpZ = instance.exports.freelang_wasm_input(0, 3, 0, 0);
  const jumpGrounded = instance.exports.freelang_wasm_input(0, 4, 0, 0);
  // This deliberately cramped fixture keeps a one-sided wall over the full
  // viewport throughout the short ascent, so state is the independent oracle:
  // the compiled world must advance four real vertical ticks and stay airborne.
  assert.deepStrictEqual([jumpZ, jumpGrounded], [26, 0],
    'jump integration differs from the retained airborne world-state oracle');

  assert.strictEqual(instance.exports.freelang_wasm_choice_select(1, 112), 112,
    'available E1M2 could not be selected');
  const secondMapFrameChecksum = frameChecksum;
  assert.strictEqual(instance.exports.freelang_wasm_choice_current(1), 112,
    'Freelang did not retain the selected map code');
  assert.notStrictEqual(secondMapFrameChecksum, jumpFrameChecksum,
    'E1M2 selection did not present its distinct start view');
  assert.strictEqual(instance.exports.freelang_wasm_choice_select(1, 113), 112,
    'absent E1M3 changed the live map');

  instance.exports.freelang_wasm_diagnostic(1, 1);
  const angleBeforeArrow = instance.exports.freelang_wasm_input(1, 4101, 0, 0);
  instance.exports.freelang_wasm_frame(226);
  const angleAfterArrow = instance.exports.freelang_wasm_input(2, 4101, 0, 0);
  assert.notStrictEqual(angleAfterArrow, angleBeforeArrow,
    'held arrow input did not rotate Freelang angle state');
  assert.strictEqual(instance.exports.freelang_wasm_choice_select(2, 640), 640,
    '640x400 logical resolution could not be selected');
  const resolutionFrameChecksum = frameChecksum;
  assert.deepStrictEqual([frameWidth, frameHeight], [640, 400],
    'Freelang did not present the selected logical dimensions');
  assert.strictEqual(instance.exports.freelang_wasm_choice_current(2), 640,
    'Freelang did not retain the selected logical width');
  assert.strictEqual(instance.exports.freelang_wasm_choice_select(2, 800), 640,
    'undeclared logical width changed the live renderer');
  let maximumResolutionFrameChecksum = 0;
  if (process.argv.includes('--maximum-resolution')) {
    assert.strictEqual(instance.exports.freelang_wasm_choice_select(2, 1280), 1280,
      '1280x800 logical resolution could not be selected');
    maximumResolutionFrameChecksum = frameChecksum;
    assert.deepStrictEqual([frameWidth, frameHeight], [1280, 800],
      'Freelang did not present the maximum logical dimensions');
    assert.strictEqual(maximumResolutionFrameChecksum, 3254004551,
      'maximum-resolution frame differs from the retained oracle');
  }
  instance.exports.freelang_wasm_input(1, 4104, 0, 0);
  instance.exports.freelang_wasm_frame(238);
  const scanFrameChecksum = frameChecksum;
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 20, 0, 0), 0,
    'held Tab did not select the direct tactical scan renderer');
  assert.notStrictEqual(scanFrameChecksum, maximumResolutionFrameChecksum || resolutionFrameChecksum,
    'tactical scan reused the ordinary textured frame');
  instance.exports.freelang_wasm_input(2, 4104, 0, 0);
  instance.exports.freelang_wasm_frame(246);
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 20, 0, 0), 1,
    'Tab release did not restore the ordinary textured renderer');
  const shotsBeforeFire = instance.exports.freelang_wasm_input(0, 13, 0, 0);
  const ammoBeforeFire = instance.exports.freelang_wasm_input(0, 11, 0, 0);
  instance.exports.freelang_wasm_input(4, 0, 0, 0);
  instance.exports.freelang_wasm_frame(254);
  instance.exports.freelang_wasm_input(5, 0, 0, 0);
  const fireFrameChecksum = frameChecksum;
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 13, 0, 0),
    instance.exports.freelang_wasm_input(0, 11, 0, 0),
  ], [shotsBeforeFire + 1, ammoBeforeFire - 1],
  'held primary mouse input did not execute the existing pistol action');
  let benchmarkMilliseconds = 0;
  if (benchmarkFrames > 0) {
    const started = process.hrtime.bigint();
    for (let frame = 0; frame < benchmarkFrames; frame++) {
      instance.exports.freelang_wasm_frame(270 + frame * 16);
    }
    benchmarkMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  }
  const carriedAmmo = instance.exports.freelang_wasm_input(0, 11, 0, 0);
  assert.strictEqual(instance.exports.freelang_wasm_choice_select(1, 111), 111,
    'available E1M1 could not be selected after firing in E1M2');
  const carriedMapFrameChecksum = frameChecksum;
  assert.strictEqual(instance.exports.freelang_wasm_choice_current(1), 111,
    'Freelang did not publish the return map selection');
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 11, 0, 0),
    instance.exports.freelang_wasm_input(0, 13, 0, 0),
  ], [carriedAmmo, 0],
  'durable ammunition did not cross the map load or map-local shots survived');

  // Exercise the exact live failure boundary: walk right to the modular
  // entrance pickup, select it, and fire once. This must complete one frame,
  // preserve ordinary ammo and publish the appended clip-40 command.
  instance.exports.freelang_wasm_input(1, 100, 0, 0);
  for (let frame = 0; frame < 8; frame++) {
    instance.exports.freelang_wasm_frame(400 + frame * 16);
  }
  instance.exports.freelang_wasm_input(2, 100, 0, 0);
  if (instance.exports.freelang_wasm_input(0, 25, 0, 0) === 0) {
    instance.exports.freelang_wasm_input(1, 114, 0, 0);
    instance.exports.freelang_wasm_input(2, 114, 0, 0);
    instance.exports.freelang_wasm_frame(528);
    instance.exports.freelang_wasm_input(1, 97, 0, 0);
    for (let frame = 0; frame < 8; frame++) {
      instance.exports.freelang_wasm_frame(544 + frame * 16);
    }
    instance.exports.freelang_wasm_input(2, 97, 0, 0);
  }
  if (instance.exports.freelang_wasm_input(0, 25, 0, 0) === 0) {
    instance.exports.freelang_wasm_input(1, 114, 0, 0);
    instance.exports.freelang_wasm_input(2, 114, 0, 0);
    instance.exports.freelang_wasm_frame(672);
    instance.exports.freelang_wasm_input(1, 119, 0, 0);
    for (let frame = 0; frame < 8; frame++) {
      instance.exports.freelang_wasm_frame(688 + frame * 16);
    }
    instance.exports.freelang_wasm_input(2, 119, 0, 0);
  }
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 25, 0, 0), 1,
    'bounded entrance paths did not collect the laser blaster');
  instance.exports.freelang_wasm_input(1, 45, 0, 0);
  instance.exports.freelang_wasm_input(2, 45, 0, 0);
  instance.exports.freelang_wasm_frame(832);
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 24, 0, 0), 8,
    'minus did not select the collected laser blaster');
  const laserShotsBefore = instance.exports.freelang_wasm_input(0, 13, 0, 0);
  const laserAmmoBefore = instance.exports.freelang_wasm_input(0, 11, 0, 0);
  instance.exports.freelang_wasm_input(4, 0, 0, 0);
  instance.exports.freelang_wasm_frame(848);
  instance.exports.freelang_wasm_input(5, 0, 0, 0);
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 13, 0, 0),
    instance.exports.freelang_wasm_input(0, 11, 0, 0),
  ], [laserShotsBefore + 1, laserAmmoBefore],
  'first laser fire did not complete with unlimited ammunition');
  const sampledLaserShots = 16;
  for (let sample = 1; sample < sampledLaserShots; sample++) {
    for (let frame = 0; frame < 6; frame++) {
      instance.exports.freelang_wasm_frame(864 + (sample * 7 + frame) * 16);
    }
    instance.exports.freelang_wasm_input(4, 0, 0, 0);
    instance.exports.freelang_wasm_frame(864 + (sample * 7 + 6) * 16);
    instance.exports.freelang_wasm_input(5, 0, 0, 0);
  }
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 13, 0, 0),
    instance.exports.freelang_wasm_input(0, 11, 0, 0),
  ], [laserShotsBefore + sampledLaserShots, laserAmmoBefore],
  'sampled repeated laser fire changed ammo or failed a cooldown cycle');
  const playFrames = speakerFrames.filter((frame) => frame.readUInt32LE(4) === 2);
  assert.strictEqual(
    playFrames.length,
    instance.exports.freelang_wasm_input(0, 19, 0, 0),
    'Freelang sound-command count disagrees with speaker PLAY capsules',
  );
  assert(playFrames.some((frame) =>
    frame.length === 28 && frame.readUInt32LE(8) === 1 &&
    frame.readUInt32LE(12) === 2 && frame.readUInt32LE(16) === 0 &&
    frame.readUInt32LE(20) === 256 && frame.readUInt32LE(24) === 256),
  'pistol action did not emit the canonical speaker-v2 PLAY frame');
  const laserPlayFrames = playFrames.filter((frame) =>
    frame.length === 28 && frame.readUInt32LE(8) === 1 &&
    frame.readUInt32LE(12) >= 40 && frame.readUInt32LE(12) <= 42 &&
    frame.readUInt32LE(16) === 0 && frame.readUInt32LE(20) === 256 &&
    frame.readUInt32LE(24) === 256);
  assert.strictEqual(laserPlayFrames.length, sampledLaserShots,
    'sampled laser shots did not each publish one bounded blaster PLAY frame');
  assert.deepStrictEqual(
    [...new Set(laserPlayFrames.map((frame) => frame.readUInt32LE(12)))].sort(),
    [40, 41, 42],
    'sampled laser shots did not exercise all three deterministic sound variants',
  );

  // The browser target uses the same explicit drone state and packed bank
  // operation as native. Select/launch safely, release the launch click, then
  // arm and turn in one frame so the wide FPV renderer exercises nonzero roll.
  instance.exports.freelang_wasm_input(1, 57, 0, 0);
  instance.exports.freelang_wasm_input(2, 57, 0, 0);
  instance.exports.freelang_wasm_frame(2800);
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 24, 0, 0), 9,
    'number 9 did not select the baked-in drone');
  instance.exports.freelang_wasm_input(4, 0, 0, 0);
  instance.exports.freelang_wasm_frame(2816);
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 27, 0, 0),
    instance.exports.freelang_wasm_input(0, 28, 0, 0),
  ], [1, 0], 'new browser drone was not launched in safe mode');
  instance.exports.freelang_wasm_input(5, 0, 0, 0);
  instance.exports.freelang_wasm_frame(2832);
  instance.exports.freelang_wasm_input(12, 2, 3, 0);
  instance.exports.freelang_wasm_input(1, 120, 0, 0);
  instance.exports.freelang_wasm_input(10, 12, 0, 0);
  instance.exports.freelang_wasm_frame(2848);
  instance.exports.freelang_wasm_input(2, 120, 0, 0);
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 27, 0, 0),
    instance.exports.freelang_wasm_input(0, 28, 0, 0),
  ], [1, 1], 'X did not arm the active browser drone');
  const firstDroneArmed = instance.exports.freelang_wasm_input(0, 28, 0, 0);
  const firstDroneRoll = instance.exports.freelang_wasm_input(0, 29, 0, 0);
  assert.notStrictEqual(firstDroneRoll, 0,
    'relative mouse turn did not bank the browser drone');
  assert.strictEqual(
    instance.exports.freelang_wasm_input(0, 30, 0, 0), frameWidth / 2,
    'browser FPV view did not retain its wider focal length',
  );

  // A manual detonation press belongs only to the active craft. Keeping that
  // same button down across later frames must neither deploy nor consume the
  // next inventory unit; a release followed by a fresh press may do so.
  instance.exports.freelang_wasm_input(4, 0, 0, 0);
  instance.exports.freelang_wasm_frame(2864);
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 27, 0, 0),
    instance.exports.freelang_wasm_input(0, 31, 0, 0),
    instance.exports.freelang_wasm_input(0, 32, 0, 0),
  ], [0, 0, 1], 'manual detonation did not close the deployment release gate');
  instance.exports.freelang_wasm_frame(2880);
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 27, 0, 0),
    instance.exports.freelang_wasm_input(0, 31, 0, 0),
    instance.exports.freelang_wasm_input(0, 32, 0, 0),
  ], [0, 0, 1], 'held detonation click consumed the next browser drone');
  instance.exports.freelang_wasm_input(5, 0, 0, 0);
  instance.exports.freelang_wasm_frame(2896);
  assert.strictEqual(instance.exports.freelang_wasm_input(0, 31, 0, 0), 1,
    'mouse release did not rearm browser drone deployment');
  instance.exports.freelang_wasm_input(4, 0, 0, 0);
  instance.exports.freelang_wasm_frame(2912);
  assert.deepStrictEqual([
    instance.exports.freelang_wasm_input(0, 27, 0, 0),
    instance.exports.freelang_wasm_input(0, 32, 0, 0),
  ], [1, 2], 'fresh click did not deliberately deploy the next browser drone');

  // TAB retains the active drone as camera origin while selecting the shared
  // phosphor tactical renderer. Its returned view is intentionally untextured.
  instance.exports.freelang_wasm_input(5, 0, 0, 0);
  instance.exports.freelang_wasm_input(1, 4104, 0, 0);
  instance.exports.freelang_wasm_frame(2928);
  const droneScanTextured = instance.exports.freelang_wasm_input(0, 20, 0, 0);
  assert.strictEqual(droneScanTextured, 0,
    'TAB did not select tactical scan from the active drone camera');
  if (!output.includes('parsed E1M1 and rendered its textured BSP')) {
    throw new Error(`missing Freelang render evidence in output: ${JSON.stringify(output)}`);
  }
  if (!output.includes('parsed E1M2 and rendered its textured BSP')) {
    throw new Error(`missing Freelang map-selection evidence in output: ${JSON.stringify(output)}`);
  }
  if (!output.includes('input-freelang ') ||
      !output.includes('logical resolution 640x400')) {
    throw new Error(`missing diagnostic/resolution evidence in output: ${JSON.stringify(output)}`);
  }
  const expectedPresentations =
    (process.argv.includes('--maximum-resolution') ? 152 : 151) + benchmarkFrames;
  assert.strictEqual(presentations, expectedPresentations,
    `expected ${expectedPresentations} application presentations`);
  const gcCollections = instance.exports.__freelang_gc_count.value;
  console.log(JSON.stringify({
    wadBytes: wad.length,
    presentations,
    frameChecksum: initialFrameChecksum,
    statusChecksum: initialStatusChecksum,
    weaponChecksum: initialWeaponChecksum,
    movedFrameChecksum,
    movedX,
    movedY,
    diagonalFrameChecksum,
    diagonalX,
    diagonalY,
    groundedWorldTick,
    mouseFrameChecksum,
    jumpFrameChecksum,
    jumpZ,
    jumpGrounded,
    secondMapFrameChecksum,
    resolutionFrameChecksum,
    maximumResolutionFrameChecksum,
    scanFrameChecksum,
    fireFrameChecksum,
    carriedMapFrameChecksum,
    carriedAmmo,
    shots: instance.exports.freelang_wasm_input(0, 13, 0, 0),
    ammo: instance.exports.freelang_wasm_input(0, 11, 0, 0),
    speakerHelloBytes: speakerHello.length,
    speakerPlayFrames: playFrames.length,
    droneActive: instance.exports.freelang_wasm_input(0, 27, 0, 0),
    firstDroneArmed,
    firstDroneRoll,
    droneFocal: instance.exports.freelang_wasm_input(0, 30, 0, 0),
    droneLaunches: instance.exports.freelang_wasm_input(0, 32, 0, 0),
    droneScanTextured,
    resolutionWidth: frameWidth,
    resolutionHeight: frameHeight,
    angleBeforeMouse,
    angleAfterMouse,
    angleBeforeArrow,
    angleAfterArrow,
    benchmarkFrames,
    benchmarkMilliseconds,
    benchmarkFps: benchmarkFrames > 0
      ? benchmarkFrames * 1000 / benchmarkMilliseconds
      : 0,
    gcCollections,
    imports: actualImports,
  }));
}

if (require.main === module) {
  const fixtureOutput = process.argv.find((arg) => arg.startsWith('--write-fixture='));
  if (fixtureOutput) {
    const output = path.resolve(fixtureOutput.slice('--write-fixture='.length));
    const wad = makeFixtureWad();
    fs.writeFileSync(output, wad);
    console.log(JSON.stringify({ fixture: output, wadBytes: wad.length }));
  } else {
    main().catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { makeFixtureWad, speakerBankOracle };
