'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { connectStudioSync } from '../../lib/studioSync';
import { studioSpecToSheetLayout, type StudioSpec } from '../../lib/studioSpec';
import { buildUniversalCutSheetPdf } from '../../lib/cutSheetPdf';
import { downloadPdfBytes } from '../../lib/download';
import { consumeLocalUsage, getLocalRemainingCount, DAILY_IMAGE_LIMIT, IMAGE_USAGE_STORAGE_KEY } from '../../lib/localUsage';

// TANE:i設計スタジオ（tanei-studio/）はFreeCAD/POV-Rayというローカルバイナリに依存するため、
// TANE:i本体のサーバーレス環境（Vercel等）上では動かせず、オペレーターの手元PCで
// 別プロセス（Flask、既定ポート5002）として起動しておく必要がある。このページはその
// ローカルサーバーをiframeで埋め込んでいるだけ（サーバー未起動時は下部が空白になる）
const STUDIO_URL = 'http://localhost:5002';

export default function StudioEmbed() {
  const [latestSpec, setLatestSpec] = useState<StudioSpec | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
          onClick={handleDownloadCutSheet}
          disabled={isGeneratingPdf}
          className="ml-auto flex-shrink-0 flex items-center gap-1.5 bg-tanei-accent hover:bg-tanei-accent-dark text-white text-sm font-bold px-3 sm:px-4 py-2 rounded-tanei-control shadow-sm transition-all disabled:opacity-50"
        >
          <span>📄</span>
          <span className="hidden sm:inline">{isGeneratingPdf ? '生成中…' : 'カット依頼用紙へ'}</span>
        </button>
      </div>

      <iframe src={STUDIO_URL} title="TANE:i 設計スタジオ" className="flex-1 w-full border-0" />
    </div>
  );
}
