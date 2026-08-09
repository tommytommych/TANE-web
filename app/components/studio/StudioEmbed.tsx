'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { connectStudioSync } from '../../lib/studioSync';
import { studioSpecToSheetLayout, type StudioSpec } from '../../lib/studioSpec';
import { buildUniversalCutSheetPdf } from '../../lib/cutSheetPdf';
import { downloadPdfBytes } from '../../lib/download';
import { consumeLocalUsage, getLocalRemainingCount, DAILY_IMAGE_LIMIT, IMAGE_USAGE_STORAGE_KEY } from '../../lib/localUsage';
import { DEFAULT_STUDIO_HOST, getStudioHost, setStudioHost } from '../../lib/studioHost';

export default function StudioEmbed() {
  // SSRとの整合性のため初期値はデフォルトホストにしておき、マウント後にlocalStorageの
  // 保存値（スマートフォン等で設定済みの場合）へ差し替える
  const [studioHost, setStudioHostState] = useState(DEFAULT_STUDIO_HOST);
  // 入力欄は「例: 192.168.1.23:5002」というプレースホルダーだけを見せ、現在の接続先を
  // 初期値として差し込まない（既定のlocalhost:5002が薄く入って見えて紛らわしいため）
  const [hostInput, setHostInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [latestSpec, setLatestSpec] = useState<StudioSpec | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const current = getStudioHost();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudioHostState(current);

    // 設計スタジオはオペレーターのパソコンでしか起動できないため、"localhost"のままだと
    // スマートフォン等の別端末では真っ白な画面になってしまう。狭い画面幅（おおよそスマートフォン・
    // タブレット）で、かつ接続先が未設定（デフォルトのまま）の場合は、原因と対処が分かるよう
    // 接続設定パネルを最初から開いておく
    if (current === DEFAULT_STUDIO_HOST && window.innerWidth < 1024) {
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

  const handleApplyHost = useCallback(() => {
    const normalized = setStudioHost(hostInput);
    setStudioHostState(normalized);
    setHostInput(normalized);
    setIsSettingsOpen(false);
    showStatus(`接続先を ${normalized} に変更しました。`);
  }, [hostInput, showStatus]);

  const handleResetHost = useCallback(() => {
    const normalized = setStudioHost(DEFAULT_STUDIO_HOST);
    setStudioHostState(normalized);
    setHostInput(normalized);
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
            パソコンと同じWi-Fiに接続したうえで、そのパソコンのIPアドレス（例: 192.168.1.23）を
            下に入力してください。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={hostInput}
              onChange={(e) => setHostInput(e.target.value)}
              placeholder="例: 192.168.1.23:5002"
              className="flex-1 min-w-[180px] border-2 border-tanei-ink-muted rounded-tanei-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand"
            />
            <button
              type="button"
              onClick={handleApplyHost}
              className="bg-tanei-brand text-white px-4 py-2 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors flex-shrink-0"
            >
              接続する
            </button>
            {studioHost !== DEFAULT_STUDIO_HOST && (
              <button
                type="button"
                onClick={handleResetHost}
                className="text-xs text-tanei-ink-muted hover:text-tanei-brand underline flex-shrink-0"
              >
                既定（同じパソコン）に戻す
              </button>
            )}
          </div>
        </div>
      )}

      <iframe src={`http://${studioHost}`} title="TANE:i 設計スタジオ" className="flex-1 w-full border-0" />
    </div>
  );
}
