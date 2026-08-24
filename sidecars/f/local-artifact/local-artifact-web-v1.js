// One measured local-artifact web agent. It owns the user-selected File and a
// single IndexedDB cache record. It has no filesystem facade, application
// format knowledge or access to Freelang memory.

const PROTOCOL = 'freelang.local-artifact.web';
const VERSION = 1;
const DB_NAME = 'freelang-local-artifact-v1';
const DB_VERSION = 1;
const MAX_NAME = 255;
const MAX_PENDING = 1;

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
    if (!db.objectStoreNames.contains('artifact')) db.createObjectStore('artifact');
  };
  return requestResult(request);
}

async function sha256Key(bytes) {
  if (!globalThis.crypto || !crypto.subtle) throw new Error('SHA-256 is unavailable');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${bytes.byteLength}:${hex}`;
}

async function readCached() {
  const db = await openCache();
  try {
    const transaction = db.transaction('artifact', 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore('artifact').get('selected'));
    await done;
    return record || null;
  } finally { db.close(); }
}

async function writeCached(name, bytes) {
  const key = await sha256Key(bytes);
  const db = await openCache();
  try {
    const transaction = db.transaction('artifact', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('artifact').put({
      formatVersion: VERSION,
      key,
      name,
      size: bytes.byteLength,
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }, 'selected');
    await done;
  } finally { db.close(); }
}

async function clearCached() {
  const db = await openCache();
  try {
    const transaction = db.transaction('artifact', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('artifact').clear();
    await done;
  } finally { db.close(); }
}

export function startLocalArtifactWeb({ port, panel, input, status, forget }) {
  if (!(port instanceof MessagePort)) {
    throw new TypeError('local-artifact agent: MessagePort is required');
  }
  let maximumBytes = 0;
  let nextId = 1;
  const pending = new Map();

  const setStatus = (text) => { if (status) status.textContent = text; };
  const send = (name, bytes, fromCache) => {
    if (pending.size >= MAX_PENDING) {
      throw new Error('one local artifact transaction is already pending');
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > maximumBytes) {
      throw new Error(`local artifact exceeds the ${maximumBytes}-byte bound`);
    }
    if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME) {
      throw new Error('local artifact name is outside the 1..255 bound');
    }
    const id = nextId++;
    const retained = bytes.slice();
    pending.set(id, { name, bytes: retained, fromCache });
    const transferred = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    port.postMessage({
      protocol: PROTOCOL,
      version: VERSION,
      kind: 'artifact',
      id,
      name,
      size: bytes.byteLength,
      bytes: transferred,
    }, [transferred]);
  };

  if (input) input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      setStatus(`reading ${file.name} locally…`);
      send(file.name, new Uint8Array(await file.arrayBuffer()), false);
    } catch (error) {
      setStatus(error.message);
      console.error(error);
    } finally { input.value = ''; }
  });

  if (forget) forget.addEventListener('click', async () => {
    try {
      await clearCached();
      setStatus('local cache cleared');
    } catch (error) {
      setStatus(error.message);
      console.error(error);
    }
  });

  port.onmessage = async (event) => {
    const message = event.data;
    if (!message || message.protocol !== PROTOCOL || message.version !== VERSION) {
      throw new Error('local-artifact agent: invalid protocol envelope');
    }
    if (message.kind === 'hello') {
      maximumBytes = message.maximumBytes >>> 0;
      if (maximumBytes === 0) return;
      if (panel) panel.hidden = false;
      try {
        const cached = await readCached();
        if (!cached) { setStatus('no cached local file'); return; }
        const bytes = new Uint8Array(cached.bytes);
        const key = await sha256Key(bytes);
        if (cached.formatVersion !== VERSION || cached.size !== bytes.byteLength ||
            cached.key !== key || cached.name.length > MAX_NAME) {
          await clearCached();
          throw new Error('cached artifact failed SHA-256/length validation and was forgotten');
        }
        setStatus(`restoring ${cached.name} locally…`);
        send(cached.name, bytes, true);
      } catch (error) {
        setStatus(error.message);
        console.warn('local-artifact agent: restore unavailable', error);
      }
      return;
    }
    if (message.kind === 'result') {
      const entry = pending.get(message.id | 0);
      if (!entry) throw new Error('local-artifact agent: unknown result id');
      pending.delete(message.id | 0);
      if ((message.status | 0) !== 0) {
        setStatus(`Freelang rejected ${entry.name} with status ${message.status | 0}`);
        return;
      }
      if (entry.fromCache) {
        setStatus(`restored ${entry.name} (${entry.bytes.byteLength} bytes)`);
        return;
      }
      setStatus(`rendered; caching ${entry.name} locally…`);
      try {
        await writeCached(entry.name, entry.bytes);
        setStatus(`cached ${entry.name} (${entry.bytes.byteLength} bytes)`);
      } catch (error) {
        setStatus(`loaded ${entry.name}; browser cache unavailable`);
        console.warn('local-artifact agent: cache unavailable', error);
      }
      return;
    }
    throw new Error(`local-artifact agent: unsupported message ${String(message.kind)}`);
  };
  port.start();

  return { stop() { port.close(); pending.clear(); } };
}
