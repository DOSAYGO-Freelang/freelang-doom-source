// f/derived-artifact web sidecar. It stores bounded opaque byte values under
// caller-owned printable keys. It knows no application format or semantic
// identity and cannot see the Freelang heap. Entries are disposable and
// reserve browser quota for the primary selected-file cache.

const PROTOCOL = 'freelang.derived-artifact.web';
const VERSION = 1;
const DB_NAME = 'freelang-derived-artifact-v1';
const DB_VERSION = 1;
const MAX_KEY_BYTES = 128;
const MAX_VALUE_BYTES = 16 * 1024 * 1024 + 44;
const MAX_FRAME_BYTES = 20 + MAX_KEY_BYTES + MAX_VALUE_BYTES;
const MAX_ENTRIES = 16;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const PRIMARY_CACHE_RESERVE_BYTES = 32 * 1024 * 1024;
const MAX_SCANNED_RECORDS = 256;
const decoder = new TextDecoder('utf-8', { fatal: true });

const KIND = Object.freeze({ GET: 1, PUT: 2, HIT: 0x8001, MISS: 0x8002 });

function u32(view, offset) { return view.getUint32(offset, true); }
function putU32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

async function openCache() {
  if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable');
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries');
  };
  return requestResult(request);
}

async function sha256(bytes) {
  if (!globalThis.crypto || !crypto.subtle) throw new Error('SHA-256 is unavailable');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function inspectKey(bytes) {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_KEY_BYTES) {
    throw new Error('derived-artifact key length is outside 1..128');
  }
  for (const byte of bytes) {
    if (byte < 33 || byte > 126) throw new Error('derived-artifact key is not printable ASCII');
  }
  return decoder.decode(bytes);
}

function inspectRequest(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16 ||
      buffer.byteLength > MAX_FRAME_BYTES) {
    throw new Error('derived-artifact request is outside its frame bound');
  }
  const view = new DataView(buffer);
  if (u32(view, 0) !== buffer.byteLength) {
    throw new Error('derived-artifact frame length mismatch');
  }
  const kind = u32(view, 4);
  const id = u32(view, 8);
  const keyBytes = u32(view, 12);
  if (id < 1 || id > 0x7fffffff || keyBytes < 1 || keyBytes > MAX_KEY_BYTES) {
    throw new Error('derived-artifact request header is invalid');
  }
  if (kind === KIND.GET && buffer.byteLength === 16 + keyBytes) {
    return { kind, id, key: inspectKey(new Uint8Array(buffer, 16, keyBytes)) };
  }
  if (kind === KIND.PUT && buffer.byteLength >= 20) {
    const valueBytes = u32(view, 16);
    if (valueBytes < 1 || valueBytes > MAX_VALUE_BYTES ||
        buffer.byteLength !== 20 + keyBytes + valueBytes) {
      throw new Error('derived-artifact PUT span is invalid');
    }
    return {
      kind,
      id,
      key: inspectKey(new Uint8Array(buffer, 20, keyBytes)),
      value: new Uint8Array(buffer, 20 + keyBytes, valueBytes),
    };
  }
  throw new Error('derived-artifact request kind or length is invalid');
}

function response(kind, id, bytes = null) {
  const valueBytes = bytes ? bytes.byteLength : 0;
  const buffer = new ArrayBuffer(bytes ? 16 + valueBytes : 12);
  const view = new DataView(buffer);
  putU32(view, 0, buffer.byteLength);
  putU32(view, 4, kind);
  putU32(view, 8, id);
  if (bytes) {
    putU32(view, 12, valueBytes);
    new Uint8Array(buffer, 16).set(bytes);
  }
  return buffer;
}

async function scanEntries(store) {
  const entries = [];
  await new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error || new Error('IndexedDB cursor failed'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      if (entries.length >= MAX_SCANNED_RECORDS) {
        reject(new Error('derived-artifact record scan bound exceeded'));
        return;
      }
      const record = cursor.value || {};
      entries.push({
        key: String(cursor.key),
        size: Number.isInteger(record.size) ? record.size : MAX_VALUE_BYTES + 1,
        usedAt: Number.isFinite(record.usedAt) ? record.usedAt : 0,
      });
      cursor.continue();
    };
  });
  return entries;
}

async function readCached(key) {
  const db = await openCache();
  try {
    const read = db.transaction('entries', 'readonly');
    const readDone = transactionDone(read);
    const record = await requestResult(read.objectStore('entries').get(key));
    await readDone;
    if (!record) return null;
    const bytes = record.bytes instanceof ArrayBuffer ? new Uint8Array(record.bytes) : null;
    const valid = record.formatVersion === VERSION && record.key === key && bytes &&
      bytes.byteLength >= 1 && bytes.byteLength <= MAX_VALUE_BYTES &&
      record.size === bytes.byteLength && record.digest === await sha256(bytes);
    // Never hold an IndexedDB transaction open across WebCrypto: browsers may
    // auto-commit it while digest() is pending. Mutation happens in a fresh,
    // short transaction after validation.
    const update = db.transaction('entries', 'readwrite');
    const updateDone = transactionDone(update);
    const store = update.objectStore('entries');
    if (!valid) {
      store.delete(key);
      await updateDone;
      return null;
    }
    record.usedAt = Date.now();
    store.put(record, key);
    await updateDone;
    return bytes;
  } finally { db.close(); }
}

async function storageHasPrimaryReserve(valueBytes) {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return true;
  const estimate = await navigator.storage.estimate();
  if (!Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return true;
  return estimate.quota - estimate.usage >= valueBytes + PRIMARY_CACHE_RESERVE_BYTES;
}

async function writeCached(key, value) {
  if (!await storageHasPrimaryReserve(value.byteLength)) return false;
  const digest = await sha256(value);
  const db = await openCache();
  try {
    const transaction = db.transaction('entries', 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore('entries');
    let entries;
    try {
      entries = await scanEntries(store);
    } catch (error) {
      store.clear();
      entries = [];
      console.warn('derived-artifact agent: bounded scan reset cache', error);
    }
    entries = entries.filter((entry) => entry.key !== key)
      .sort((left, right) => left.usedAt - right.usedAt);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    while (entries.length >= MAX_ENTRIES || total + value.byteLength > MAX_TOTAL_BYTES) {
      const oldest = entries.shift();
      if (!oldest) break;
      store.delete(oldest.key);
      total -= oldest.size;
    }
    if (value.byteLength > MAX_TOTAL_BYTES) { await done; return false; }
    const owned = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    store.put({
      formatVersion: VERSION,
      key,
      size: value.byteLength,
      digest,
      usedAt: Date.now(),
      bytes: owned,
    }, key);
    await done;
    return true;
  } finally { db.close(); }
}

export function startDerivedArtifactWeb({ port }) {
  if (!(port instanceof MessagePort)) {
    throw new TypeError('derived-artifact agent: MessagePort is required');
  }
  let stopped = false;
  let queue = Promise.resolve();
  const send = (buffer) => port.postMessage(buffer, [buffer]);

  const handle = async (buffer) => {
    const request = inspectRequest(buffer);
    if (request.kind === KIND.GET) {
      let value = null;
      try { value = await readCached(request.key); }
      catch (error) { console.warn('derived-artifact agent: cache read unavailable', error); }
      const reply = value
        ? response(KIND.HIT, request.id, value)
        : response(KIND.MISS, request.id);
      if (!stopped) send(reply);
      return;
    }
    try {
      const stored = await writeCached(request.key, request.value);
      if (!stored) console.warn('derived-artifact agent: skipped disposable cache write');
    } catch (error) {
      console.warn('derived-artifact agent: cache write unavailable', error);
    }
  };

  port.onmessage = (event) => {
    queue = queue.then(() => handle(event.data)).catch((error) => {
      console.error('derived-artifact agent: rejected frame', error);
    });
  };
  port.start();
  return { stop() { stopped = true; port.close(); } };
}

export { inspectRequest };
