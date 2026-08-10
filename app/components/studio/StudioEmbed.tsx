'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { connectStudioSync } from '../../lib/studioSync';
import { studioSpecToSheetLayout, type StudioSpec } from '../../lib/studioSpec';
import { buildUniversalCutSheetPdf } from '../../lib/cutSheetPdf';
import { downloadPdfBytes } from '../../lib/download';
import { consumeLocalUsage, getLocalRemainingCount, DAILY_IMAGE_LIMIT, IMAGE_USAGE_STORAGE_KEY } from '../../lib/localUsage';
import { DEFAULT_STUDIO_BASE_URL, getStudioBaseUrl, setStudioBaseUrl } from '../../lib/studioBaseUrl';
import { getOrCreateStudioSessionId } from '../../lib/studioSession';

export default function StudioEmbed() {
  // SSRとの整合性のため初期値は既定URL（http://localhost:5002）にしておき、
  // マウント後にlocalStorageの保存値（手動で接続先を変更していた場合）へ差し替える
  const [studioBaseUrl, setStudioBaseUrlState] = useState(DEFAULT_STUDIO_BASE_URL);
  // 入力欄は例のプレースホルダーだけを見せ、現在の接続先を初期値として差し込まない
  // （既定値が薄く入って見えて紛らわしいため）
  const [urlInput, setUrlInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // 不特定多数が同時にアクセスしても設計内容が混ざらないよう、タブ単位のセッションIDを
  // iframeのURLとチャット側のWebSocket接続の両方に使う（studioSession.ts参照）。
  // SSRとの整合性のため初期値は空文字にしておき、マウント後に発行・差し替える
  const [sessionId, setSessionId] = useState('');
  const [latestSpec, setLatestSpec] = useState<StudioSpec | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const current = getStudioBaseUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudioBaseUrlState(current);
    setSessionId(getOrCreateStudioSessionId());

    // 設計スタジオはPC専用機能。接続先が未設定（既定のlocalhost:5002のまま）で、かつ
    // 狭い画面幅（おおよそスマートフォン・タブレット）でアクセスされた場合は、
    // 原因と対処（⚙️からPCのIPアドレスを入力する）が分かるよう接続設定パネルを
    // 最初から開いておく
    if (current === DEFAULT_STUDIO_BASE_URL && window.innerWidth < 1024) {
      setIsSettingsOpen(true);
    }
  }, []);

  // 設計スタジオ（iframe内）でレンダリングするたびに、tanei-studio/server.pyが
  // source: 'studio'のspec-updateをWebSocket経由でブロードキャストしてくる（双方向同期の
  // 「Studio→チャット」方向、page.tsxのconnectStudioSyncと同じ仕組み）。ここでも受け取っておくことで、
  // 「カット依頼用紙へ」ボタンから、このページで最後に確定した設計内容を使えるようにする
  useEffect(() => {
    const disconnect = connectStudioSync((spec) => setLatestSpec(spec));
    return disconnect;
  }, []);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  }, []);

  const handleApplyUrl = useCallback(() => {
    const normalized = setStudioBaseUrl(urlInput);
    setStudioBaseUrlState(normalized);
    setUrlInput('');
    setIsSettingsOpen(false);
    showStatus(`接続先を ${normalized} に変更しました。`);
  }, [urlInput, showStatus]);

  const handleResetUrl = useCallback(() => {
    const normalized = setStudioBaseUrl(DEFAULT_STUDIO_BASE_URL);
    setStudioBaseUrlState(normalized);
    setUrlInput('');
  }, []);

  const handleDownloadCutSheet = useCallback(async () => {
    if (!latestSpec) {
      showStatus('先に設計スタジオでレンダリングしてから、もう一度お試しください。');
      return;
    }

    // カット申込書PDF・完成イメージ・写真AI空間診断と同じ「本日のAI機能利用」の対象とする
    // （チャット側と同じlocalStorageキーを直接読み書きすることで、上限をアプリ全体で共有する）
    if (getLocalRemainingCount(IMAGE_USAGE_STORAGE_KEY, DAILY_IMAGE_LIMIT) <= 0) {
      showStatus('本日のAI機能のご利用回数が上限（5回）に達しました🙏 また明日ご利用ください。');
      return;
    }

    setIsGeneratingPdf(true);
    showStatus('この設計内容をもとにカット申込書PDFを生成しています…');
    try {
      const sheetLayout = studioSpecToSheetLayout(latestSpec);
      const pdfBytes = await buildUniversalCutSheetPdf([], [sheetLayout]);
      downloadPdfBytes(new Uint8Array(pdfBytes), 'TANEi_Universal_Cut_Sheet.pdf');
      consumeLocalUsage(IMAGE_USAGE_STORAGE_KEY, DAILY_IMAGE_LIMIT);
      showStatus('カット申込書PDFのダウンロードが完了しました！');
    } catch (error) {
      console.error(error);
      showStatus('PDFの生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [latestSpec, showStatus]);

  return (
    <div className="flex flex-col h-dvh bg-tanei-bg">
      {statusMessage && (
        <div
          role="status"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-tanei-brand-dark text-white px-5 py-3 rounded-2xl shadow-xl text-sm flex items-center gap-3 max-w-[90vw] text-center"
        >
          <span>🌱</span>
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-3 border-b border-tanei-border bg-white flex-shrink-0">
        <Link
          href="/app"
          className="text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand flex-shrink-0"
        >
          ← チャットに戻る
        </Link>
        <span className="text-sm font-black text-tanei-brand truncate">🌱 TANE:i 設計スタジオ</span>

        <button
          type="button"
          onClick={() => setIsSettingsOpen((prev) => !prev)}
          className="ml-auto flex-shrink-0 text-sm text-tanei-ink-muted hover:text-tanei-brand px-2 py-2 rounded-tanei-control transition-colors"
          title="設計スタジオの接続先を設定"
          aria-label="設計スタジオの接続先を設定"
        >
          ⚙️
        </button>

        <button
          type="button"
          onClick={handleDownloadCutSheet}
          disabled={isGeneratingPdf}
          className="flex-shrink-0 flex items-center gap-1.5 bg-tanei-accent hover:bg-tanei-accent-dark text-white text-sm font-bold px-3 sm:px-4 py-2 rounded-tanei-control shadow-sm transition-all disabled:opacity-50"
        >
          <span>📄</span>
          <span className="hidden sm:inline">{isGeneratingPdf ? '生成中…' : 'カット依頼用紙へ'}</span>
        </button>
      </div>

      <p className="px-4 py-1.5 border-b border-tanei-border bg-amber-50 text-amber-800 text-[11px] text-center flex-shrink-0">
        ⚠️ 設計スタジオはパソコン専用機能です。スマートフォンでご利用の場合は⚙️から接続先の設定が必要です。
      </p>

      {isSettingsOpen && (
        <div className="px-4 py-3 border-b border-tanei-border bg-tanei-brand-soft flex-shrink-0 text-sm">
          <p className="font-bold text-tanei-ink mb-1">設計スタジオの接続先</p>
          <p className="text-tanei-ink-muted text-xs leading-relaxed mb-2">
            設計スタジオはオペレーターのパソコン上でしか起動できません。そのパソコンのブラウザからは
            そのまま使えますが、スマートフォン等の別端末から開く場合は、設計スタジオを起動している
            パソコンと同じWi-Fiに接続したうえで、そのパソコンのIPアドレス（例: 192.168.1.23:5002）を
            下に入力してください。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="例: 192.168.1.23:5002"
              className="flex-1 min-w-[180px] border-2 border-tanei-ink-muted rounded-tanei-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand"
            />
            <button
              type="button"
              onClick={handleApplyUrl}
              className="bg-tanei-brand text-white px-4 py-2 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors flex-shrink-0"
            >
              接続する
            </button>
            {studioBaseUrl !== DEFAULT_STUDIO_BASE_URL && (
              <button
                type="button"
                onClick={handleResetUrl}
                className="text-xs text-tanei-ink-muted hover:text-tanei-brand underline flex-shrink-0"
              >
                既定に戻す
              </button>
            )}
          </div>
        </div>
      )}

      <iframe
        src={sessionId ? `${studioBaseUrl}?sessionId=${encodeURIComponent(sessionId)}` : studioBaseUrl}
        title="TANE:i 設計スタジオ"
        className="flex-1 w-full border-0"
      />
    </div>
  );
}
