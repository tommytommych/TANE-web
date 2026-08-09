// TANE:i設計スタジオ（tanei-studio/server.py、既定ポート5002）への接続先ホストを、
// ブラウザ（端末）ごとに設定・永続化するためのヘルパー。
//
// 設計スタジオはFreeCAD/POV-Rayというローカルバイナリに依存するため、オペレーターの
// パソコン上でしか起動できない。そのパソコン自身のブラウザからは"localhost:5002"で
// 届くが、同じWi-Fi上の別端末（スマートフォン・タブレット等）の"localhost"はその端末
// 自身を指してしまい、何も起動していないため真っ白な画面になる。server.py側は既に
// host="0.0.0.0"でLAN上の他端末からのアクセスも受け付けているため、スマートフォン側で
// 接続先をパソコンのLAN IPアドレス（例: 192.168.1.23:5002）に切り替えられれば使える。

const STUDIO_HOST_STORAGE_KEY = 'tanei-studio-host-v1';
export const DEFAULT_STUDIO_HOST = 'localhost:5002';

const hostChangeListeners = new Set<(host: string) => void>();

// 「http://」「ws://」等のプレフィックスや末尾スラッシュ、前後の空白を取り除き、
// "host[:port]"の形に正規化する（ユーザーがフルURLを貼り付けても動くようにする）
export function normalizeStudioHost(input: string): string {
  return input.trim().replace(/^[a-zA-Z]+:\/\//, '').replace(/\/+$/, '');
}

export function getStudioHost(): string {
  if (typeof window === 'undefined') return DEFAULT_STUDIO_HOST;
  try {
    const stored = window.localStorage.getItem(STUDIO_HOST_STORAGE_KEY);
    return stored && stored.trim() ? stored : DEFAULT_STUDIO_HOST;
  } catch {
    return DEFAULT_STUDIO_HOST;
  }
}

// 接続先を保存し、購読中のリスナー（studioSync.tsの再接続処理など）へ通知する
export function setStudioHost(input: string): string {
  const normalized = normalizeStudioHost(input) || DEFAULT_STUDIO_HOST;
  try {
    window.localStorage.setItem(STUDIO_HOST_STORAGE_KEY, normalized);
  } catch {
    // 保存できない環境（プライベートブラウジング等）でも致命的な失敗にはしない
  }
  hostChangeListeners.forEach((listener) => listener(normalized));
  return normalized;
}

// 接続先が変わったことを購読する（戻り値の関数で購読解除）
export function onStudioHostChange(listener: (host: string) => void): () => void {
  hostChangeListeners.add(listener);
  return () => hostChangeListeners.delete(listener);
}

export function getStudioHttpUrl(): string {
  return `http://${getStudioHost()}`;
}

export function getStudioWsUrl(): string {
  return `ws://${getStudioHost()}/ws/sync`;
}
