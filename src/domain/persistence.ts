import { validateWorld } from './world';
import type { WorldProject } from './world';

const DB_NAME = 'elsemesh-worlds';
const DB_VERSION = 1;
const STORE = 'projects';
const ACTIVE_KEY = 'active-project';
let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local project storage.'));
  });
  database.catch(() => {
    database = null;
  });
  return database;
}

export async function loadSavedProject(): Promise<WorldProject | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const store = transaction.objectStore(STORE);
    const active = store.get(ACTIVE_KEY);
    active.onsuccess = () => {
      if (typeof active.result !== 'string') {
        resolve(null);
        return;
      }
      const request = store.get(active.result);
      request.onsuccess = () =>
        {
        const saved = (request.result as { project?: unknown } | undefined)?.project;
        if (!saved) { resolve(null); return; }
        const result = validateWorld(saved);
        if (!result.valid || !result.project) { reject(new Error(result.errors.join(' '))); return; }
        resolve(result.project);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read the saved project.'));
    };
    active.onerror = () => reject(active.error ?? new Error('Could not locate the active project.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Project read was aborted.'));
  });
}

export async function saveProject(project: WorldProject, revision: number): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const key = project.metadata.worldId;
    const get = store.get(key);
    get.onsuccess = () => {
      const previous = get.result as { revision?: number } | undefined;
      if ((previous?.revision ?? -1) <= revision) {
        store.put({ revision, project }, key);
        store.put(key, ACTIVE_KEY);
      }
    };
    get.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the project.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Project save was aborted.'));
  });
}
