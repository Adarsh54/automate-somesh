// Keep original audio files on this device, scoped to the current account's draft.
export function createLocalAudio(scope) {
  async function access(mode, operation) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cuestamp-audio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('files', mode);
        const request = operation(transaction.objectStore('files'));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Audio storage interrupted'));
      });
    } finally { db.close(); }
  }
  const key = id => `${scope}:${id}`;
  return {
    put: (id, file) => access('readwrite', store => store.put(file, key(id))),
    get: id => access('readonly', store => store.get(key(id))),
    remove: id => access('readwrite', store => store.delete(key(id))),
  };
}
