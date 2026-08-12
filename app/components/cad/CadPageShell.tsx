'use client';

// /app/cad のページ本体。既存の設計スタジオ（app/components/studio/StudioEmbed.tsx）と
// 同じヘッダーの見た目（← チャットに戻るリンク＋タイトル）にして、TANE:iの中の別画面だと
// 分かるようにしている（設計スタジオだけ別アプリのような見た目にしない）。
// FreeCAD版の設計スタジオ（/app/studio、PC専用）とは別の独立実装で、
// こちらはPCを起動しておく必要がなく、ブラウザだけで完結する。

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CadStudio from './CadStudio';
import type { FurnitureDesign } from '../../lib/cad/types';
import {
  CAD_INITIAL_DESIGN_SESSION_KEY,
  isSafeStudioSpecDimensions,
  isValidStudioSpec,
  studioSpecToFurnitureDesign,
} from '../../lib/studioSpec';

export default function CadPageShell() {
  // AIチャットの「🌿 ブラウザCADで設計する」（CompletionCards.tsx）からの遷移時のみ、
  // sessionStorageに一時保存されたStudioSpecを読み込み、FurnitureDesignへ変換して
  // CadStudio.tsxに既存のinitialDesignプロパティへ渡す（Phase 4-07。新しいpropsは
  // 追加していない）。サーバー・クライアントで初回の描画結果が一致しないと
  // hydrationエラーになるため、初回は必ずundefined（＝既存のデフォルト設計）で
  // 描画し、クライアント側のuseEffect（ブラウザでのみ実行される）で確定した場合だけ
  // keyを変えてCadStudioを作り直す。initialDesignはCadStudio.tsx側のuseStateの
  // 初期値としてマウント時に一度だけ使われる値のため、後からprops経由で値を
  // 差し替えても反映されない、CadStudio.tsx自体を変更せずに確実に反映させるための
  // 最小限の対応
  const [initialDesign, setInitialDesign] = useState<FurnitureDesign | undefined>(undefined);
  const [cadInstanceKey, setCadInstanceKey] = useState(0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CAD_INITIAL_DESIGN_SESSION_KEY);
      if (!raw) return;
      // JSON.parseやバリデーションの成否によらず、見つかった時点で必ず1回だけ削除する
      // （不正なJSONでパースが例外を投げても、キーが残り続けて無限に再利用されることを防ぐ）
      sessionStorage.removeItem(CAD_INITIAL_DESIGN_SESSION_KEY);
      const parsed: unknown = JSON.parse(raw);
      // isValidStudioSpecは型（number/string）だけの検証のため、0以下・NaN・
      // heightが板厚の2倍以下といった値も通過してしまう。そのような値は既存の
      // パネル生成（app/lib/cad/geometry.ts、変更していない）が例外を投げ、
      // CadStudio.tsx側の保護されていない初期化処理でページ全体がクラッシュする
      // （Phase 4-08監査で発見）ため、isSafeStudioSpecDimensionsで追加確認する
      if (isValidStudioSpec(parsed) && isSafeStudioSpecDimensions(parsed)) {
        // sessionStorage（外部システム）から読み取った値をReact stateへ同期するだけの
        // 呼び出しのため、既存のapp/app/page.tsxと同様に明示的に抑制する
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInitialDesign(studioSpecToFurnitureDesign(parsed));
        setCadInstanceKey((prev) => prev + 1);
      }
    } catch (e) {
      console.error(e);
      // JSON.parse失敗・sessionStorageが使えない環境などは、既存のデフォルト設計
      // （initialDesign未指定）にそのままフォールバックする
    }
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-tanei-bg">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tanei-border bg-white flex-shrink-0">
        <Link
          href="/app"
          className="text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand flex-shrink-0"
        >
          ← チャットに戻る
        </Link>
        <span className="text-sm font-black text-tanei-brand truncate">🌱 TANE:i ブラウザCAD</span>
        <span className="text-[10px] font-bold text-tanei-accent bg-tanei-accent/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
          試験提供中
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <CadStudio key={cadInstanceKey} initialDesign={initialDesign} />
      </div>
    </div>
  );
}
