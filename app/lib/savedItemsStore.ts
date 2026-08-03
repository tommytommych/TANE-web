import type { SavedItem } from './types';

const isSavedItemShape = (value: unknown): value is SavedItem => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.type === 'string' && typeof v.title === 'string' && typeof v.date === 'string';
};

// 保存機能（設計・PDF・木取り図・画像・相談履歴・お気に入り・完成作品）のデータ保存先。
// PDFや画像はbase64で数MBになり得るため、容量に制限のあるlocalStorageではなくIndexedDBを使う。

const DB_NAME = 'tanei-saved-items';
const STORE_NAME = 'items';
const DB_VERSION = 1;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const loadAllSavedItems = async (): Promise<SavedItem[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as SavedItem[]);
    request.onerror = () => reject(request.error);
  });
};

export const putSavedItem = async (item: SavedItem): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const deleteSavedItem = async (id: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// バイナリデータ（PDF・画像）をIndexedDBに保存できるdata URL文字列に変換する。
// 数MB規模でも呼び出しスタックが溢れないよう、32KBずつchunkしてbase64化する
export const bytesToDataUrl = (bytes: Uint8Array, mimeType: string): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const LEGACY_LOCAL_STORAGE_KEY = 'tanei_saved_items';

// 旧バージョン（localStorage保存）からの移行。1度だけ実行し、移行後は旧キーを削除する
export const migrateLegacyLocalStorageItems = async (): Promise<void> => {
  const raw = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed.filter(isSavedItemShape)) {
        await putSavedItem(item);
      }
    }
  } catch (e) {
    console.error('保存データの移行に失敗しました', e);
  } finally {
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  }
};
