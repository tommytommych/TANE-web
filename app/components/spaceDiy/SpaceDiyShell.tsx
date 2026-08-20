'use client';

// 「AI空間DIY」画面本体（/app/space-diy）。既存の「📷 写真からAI空間診断」の入口を使い、
// 部屋を撮影→AI空間認識→家具提案→3Dプレビュー→ブラウザCADへ引き継ぐ、独立した新しいフロー。
// 既存のチャット・CAD・保存処理のコードは一切変更せず、既存の型・コンポーネント
// （StudioSpec・CadViewport・buildFurnitureModel等）を再利用するだけにとどめる。

import { useCallback, useId, useState } from 'react';
import Link from 'next/link';
import { resizeImageFileToDataUrl } from '../../lib/spaceDiy/imageResize';
import type { SpaceAnalysis } from '../../lib/spaceAnalysis';
import { buildFurnitureProposals, type FurnitureProposal } from '../../lib/spaceDiy/recommend';
import { getLocalRemainingCount, consumeLocalUsage, DAILY_IMAGE_LIMIT, IMAGE_USAGE_STORAGE_KEY } from '../../lib/localUsage';
import SpaceDiyPreviewStep from './SpaceDiyPreviewStep';

type Slot = 'front' | 'left' | 'right' | 'oblique';
type Screen = 'capture' | 'analyzing' | 'results' | 'preview';

const SLOTS: { id: Slot; label: string }[] = [
  { id: 'front', label: '① 正面' },
  { id: 'left', label: '② 左側' },
  { id: 'right', label: '③ 右側' },
  { id: 'oblique', label: '④ 斜め' },
];

type SlotStatus = 'idle' | 'loading' | 'error';

function PhotoSlot({
  label,
  photo,
  status,
  errorText,
  onSelect,
  onClear,
}: {
  label: string;
  photo?: string;
  status: SlotStatus;
  errorText?: string;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-tanei-ink-muted">{label}</span>
      {/* capture="environment"は意図的に付けない。付けるとiOS Safari等でカメラ起動のみに
          限定され「写真ライブラリから選ぶ」ができなくなる機種があり、HTTP経由（localhost以外）
          の開発環境ではカメラ起動自体がブロックされることもある（実機検証で発覚）。
          既存のチャット添付input（ChatInput.tsx）と同じ属性無しの形にし、OS標準の
          「カメラで撮影／ライブラリから選択」の両方を選べる状態にする */}
      {/* 開くトリガーは、別ボタンのonClickからref.click()を呼ぶ間接的な方式ではなく、
          <label htmlFor>とinputを直接紐づける標準的な方式にする。前者はブラウザによっては
          （実機検証でiOS Safari等）ユーザー操作由来のクリックとして認識されず、ファイル
          選択画面が開かないことがある。<label>はHTML標準でinputへのユーザー操作を
          そのまま転送するため、JSに頼らずどのブラウザでも確実に開く */}
      {/* display:none（Tailwindのhiddenクラス）は使わない。iOS Safari等では、display:noneの
          input要素がレイアウトツリーから外れるため、カメラアプリからページに戻ってきた際に
          changeイベントが配信されないことがある（実機検証で発覚：「写真は撮れるが変化がない」）。
          sr-onlyは見た目には表示されないがレイアウトツリーには残るため、この不具合を避けられる */}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = '';
        }}
      />
      {photo ? (
        <div className="relative">
          {/* base64のdata URL（一時プレビュー）のためnext/imageの最適化対象外。意図的にimgタグを使用 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt={label} className="w-full h-24 object-cover rounded-tanei-control border border-tanei-border" />
          <button
            onClick={onClear}
            className="absolute top-1 right-1 bg-white/90 text-red-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-red-200"
          >
            取り消し
          </button>
        </div>
      ) : status === 'loading' ? (
        // 実機検証で「写真は撮れたが枠に反映されない」という報告があったため、処理中であることが
        // 必ず目に見えるようにする（読み込み・変換に数秒かかっても「何も起きていない」ように
        // 見えないようにするための状態表示。エラー時も同様に枠内へ直接表示する）
        <div className="h-24 flex items-center justify-center rounded-tanei-control border-2 border-dashed border-tanei-border text-tanei-ink-muted text-xs font-bold">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`h-24 flex flex-col items-center justify-center gap-1 rounded-tanei-control border-2 border-dashed text-xs font-bold transition-colors cursor-pointer px-1 text-center ${
            status === 'error'
              ? 'border-red-300 bg-red-50 text-red-600'
              : 'border-tanei-border text-tanei-ink-muted hover:border-tanei-brand hover:text-tanei-brand'
          }`}
        >
          <span>{status === 'error' ? '読み込み失敗・タップして再試行' : '+ 写真を追加'}</span>
          {status === 'error' && errorText && <span className="text-[9px] font-normal leading-tight">{errorText}</span>}
        </label>
      )}
    </div>
  );
}

export default function SpaceDiyShell() {
  const [photos, setPhotos] = useState<Partial<Record<Slot, string>>>({});
  const [slotStatus, setSlotStatus] = useState<Partial<Record<Slot, SlotStatus>>>({});
  const [slotErrors, setSlotErrors] = useState<Partial<Record<Slot, string>>>({});
  const [screen, setScreen] = useState<Screen>('capture');
  const [analysis, setAnalysis] = useState<SpaceAnalysis | null>(null);
  const [proposals, setProposals] = useState<FurnitureProposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<FurnitureProposal | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => getLocalRemainingCount(IMAGE_USAGE_STORAGE_KEY, DAILY_IMAGE_LIMIT));

  const handleSelectSlot = useCallback(async (slot: Slot, file: File) => {
    setSlotStatus((prev) => ({ ...prev, [slot]: 'loading' }));
    setSlotErrors((prev) => ({ ...prev, [slot]: undefined }));
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setPhotos((prev) => ({ ...prev, [slot]: dataUrl }));
      setSlotStatus((prev) => ({ ...prev, [slot]: 'idle' }));
      setErrorMessage(null);
    } catch (e) {
      console.error('[AI空間DIY] 写真の読み込みに失敗:', e);
      setSlotStatus((prev) => ({ ...prev, [slot]: 'error' }));
      setSlotErrors((prev) => ({ ...prev, [slot]: e instanceof Error ? e.message : String(e) }));
      setErrorMessage('写真を読み込めませんでした。別の写真でもう一度お試しください。');
    }
  }, []);

  const handleClearSlot = (slot: Slot) => {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    setSlotStatus((prev) => ({ ...prev, [slot]: 'idle' }));
    setSlotErrors((prev) => ({ ...prev, [slot]: undefined }));
  };

  const photoList = Object.values(photos).filter((p): p is string => !!p);

  const handleAnalyze = async () => {
    if (photoList.length === 0) return;
    if (remaining <= 0) {
      setErrorMessage('本日のAI機能のご利用回数が上限（5回）に達しました🙏 また明日ご利用ください。');
      return;
    }
    setErrorMessage(null);
    setScreen('analyzing');
    setRemaining(consumeLocalUsage(IMAGE_USAGE_STORAGE_KEY, DAILY_IMAGE_LIMIT));

    try {
      const res = await fetch('/api/space-diy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photoList }),
      });
      const data: { analysis?: SpaceAnalysis; error?: string } = await res.json();
      if (!res.ok || !data.analysis) {
        setErrorMessage(data.error ?? '写真の解析に失敗しました。もう一度お試しください。');
        setScreen('capture');
        return;
      }
      setAnalysis(data.analysis);
      setProposals(buildFurnitureProposals(data.analysis));
      setScreen('results');
    } catch {
      setErrorMessage('通信エラーが発生しました。少し時間をおいてから、もう一度お試しください。');
      setScreen('capture');
    }
  };

  const handleRetake = () => {
    setPhotos({});
    setAnalysis(null);
    setProposals([]);
    setErrorMessage(null);
    setScreen('capture');
  };

  return (
    <div className="flex h-dvh flex-col bg-tanei-bg">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tanei-border bg-white flex-shrink-0">
        <Link href="/app" className="text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand flex-shrink-0">
          ← チャットに戻る
        </Link>
        <span className="flex flex-col leading-tight min-w-0">
          <span className="text-sm font-black text-tanei-brand truncate">📷 AI空間DIY</span>
          <span className="text-[10px] text-tanei-ink-muted truncate">部屋を撮るだけ。AIが作れる家具を提案します</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {screen === 'capture' && (
          <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
            <div>
              <h1 className="text-base font-bold text-tanei-ink mb-1">部屋を撮影してください</h1>
              <p className="text-xs text-tanei-ink-muted">
                部屋の写真から、AIがDIYに使えそうなスペースを探します。最低1枚でも解析できます。複数枚あると精度が上がります。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SLOTS.map((slot) => (
                <PhotoSlot
                  key={slot.id}
                  label={slot.label}
                  photo={photos[slot.id]}
                  status={slotStatus[slot.id] ?? 'idle'}
                  errorText={slotErrors[slot.id]}
                  onSelect={(file) => handleSelectSlot(slot.id, file)}
                  onClear={() => handleClearSlot(slot.id)}
                />
              ))}
            </div>

            {errorMessage && (
              <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-tanei-control px-3 py-2">
                {errorMessage}
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={photoList.length === 0}
              className="bg-tanei-brand text-white text-sm font-bold py-3 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              この写真でAIに分析してもらう
            </button>
          </div>
        )}

        {screen === 'analyzing' && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center h-full">
            <span className="text-3xl animate-pulse">🔎</span>
            <span className="text-sm font-bold text-tanei-ink">部屋を分析しています…</span>
            <span className="text-xs text-tanei-ink-muted">壁・窓・家具・空いているスペースを確認して、DIY家具を検討しています</span>
          </div>
        )}

        {screen === 'results' && analysis && (
          <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
            {(analysis.insufficientData || proposals.length === 0) ? (
              <div className="flex flex-col gap-3 items-center text-center p-6">
                <span className="text-3xl">🤔</span>
                <span className="text-sm font-bold text-tanei-ink">写真からは十分に判断できませんでした</span>
                {analysis.notes.length > 0 && (
                  <ul className="text-xs text-tanei-ink-muted list-disc list-inside text-left">
                    {analysis.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                )}
                <span className="text-xs text-tanei-ink-muted">もう少し別の角度から撮影してください</span>
                <button
                  onClick={handleRetake}
                  className="mt-2 bg-tanei-brand text-white text-sm font-bold px-4 py-2 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
                >
                  撮り直す
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-tanei-ink">AIおすすめ</span>
                  <button onClick={handleRetake} className="text-[11px] text-tanei-ink-muted hover:text-tanei-brand underline">
                    撮り直す
                  </button>
                </div>
                {analysis.notes.length > 0 && (
                  <div className="text-[11px] text-tanei-ink-muted bg-tanei-surface-muted border border-tanei-border rounded-tanei-control px-3 py-2">
                    {analysis.notes.join(' / ')}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {proposals.map((proposal) => (
                    <button
                      key={proposal.id}
                      onClick={() => {
                        setSelectedProposal(proposal);
                        setScreen('preview');
                      }}
                      className="text-left flex flex-col gap-1 p-3 rounded-tanei-card border border-tanei-border bg-white hover:border-tanei-brand shadow-sm hover:shadow-md transition-all"
                    >
                      <span className="text-sm font-bold text-tanei-ink">{proposal.furniture.name}</span>
                      <span className="text-[11px] font-bold text-tanei-ink">
                        約{proposal.initialWidth} × {proposal.initialHeight} × {proposal.initialDepth}mm
                      </span>
                      <span className="text-[11px] text-tanei-ink-muted">{proposal.space.description}</span>
                      <span className="text-[10px] font-bold text-tanei-brand-dark bg-tanei-brand-soft border border-tanei-brand w-fit px-1.5 py-0.5 rounded-full">
                        AI推定寸法
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {screen === 'preview' && selectedProposal && (
          <SpaceDiyPreviewStep proposal={selectedProposal} onBack={() => setScreen('results')} />
        )}
      </div>
    </div>
  );
}
