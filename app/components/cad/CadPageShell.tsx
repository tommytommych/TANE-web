'use client';

// /app/cad のページ本体。TANE:iの唯一の家具設計・3D確認画面（「TANE:i 3D家具設計」）。
// FreeCAD+POV-Ray依存だった旧設計スタジオ（Phase Eで廃止済み）と異なり、PCを起動して
// おく必要がなく、ブラウザだけで完結する。

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CadStudio, { CAD_SESSION_STORAGE_KEY } from './CadStudio';
import type { FurnitureDesign, PanelFinish } from '../../lib/cad/types';
import { FURNITURE_MATERIALS, PART_MATERIAL_LABELS, type PartMaterialLabel } from '../../lib/cad/model';

const PANEL_FINISH_VALUES: readonly PanelFinish[] = ['clear', 'walnut', 'white', 'black'];
import {
  CAD_INITIAL_DESIGN_SESSION_KEY,
  isSafeStudioSpecDimensions,
  isValidStudioSpec,
  studioSpecToFurnitureDesign,
} from '../../lib/studioSpec';

// チャット欄の「🌿 TANE:i 3D家具設計」を一度使ってCADで編集した後、同じチャット
// メッセージから同じボタンをもう一度押すと、これまでは毎回AIの元の提案（studioSpec）で
// 上書きしてしまい、CAD側で行った変更（色・パーツ追加など）が消えていた。直前に
// 反映したAI提案のJSON（正規化前の生データ）をここに控えておき、次回以降は「同じ提案か」
// を比較する。同じであれば新規提案として扱わず、initialDesignを渡さない（CadStudio.tsx
// 自身が持つセッション下書き（未保存編集）の復元に任せる）ことで、変更点を保持する
const CAD_LAST_HANDOFF_SPEC_SESSION_KEY = 'tanei-cad-last-handoff-spec-v1';

// AI提案から反映された寸法を、ユーザーへの確認表示にそのまま使うための最小限の型
// （Phase 4-10）。FurnitureDesign変換後の値ではなく、StudioSpecの生の値（変換前）を
// 保持するだけで、CadStudio側から逆算しない。
// projectName・materialはPhase 5-02で追加。CadStudioへ実際に渡す値（フォールバック後）と
// 同じものを表示するため、undefinedの場合はバナーにも出さない（フォールバックしたことを
// 積極的に説明はしない＝既存の「邪魔しすぎない」バナーの方針を踏襲）
interface AiSpecSummary {
  width: number;
  depth: number;
  height: number;
  thickness: number;
  projectName?: string;
  material?: string;
}

// StudioSpec.thicknessが省略された場合の既定値。studioSpec.ts側のDEFAULT_THICKNESS_MMと
// 同じ値（18mm）。studioSpec.tsは今回の変更対象外のためexportを追加せず、既存仕様として
// 表示専用にここでも同じ値を使うだけにとどめる
const DEFAULT_THICKNESS_MM = 18;

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
  // Phase 5-02：AI提案のitem（作品名）・material（材料）を、initialDesignと同じ仕組みで
  // CadStudio.tsxの新規prop（initialProjectName・initialMaterial）へ渡すための状態。
  // どちらも「安全と確認できた値のみ」を保持し、不正・空の場合はundefinedのまま
  // （CadStudio.tsx側の既存デフォルト値へ自然にフォールバックする）
  const [initialProjectName, setInitialProjectName] = useState<string | undefined>(undefined);
  const [initialMaterial, setInitialMaterial] = useState<string | undefined>(undefined);
  // AI提案のpartMaterials（「天板だけパイン集成材、脚・幕板はSPF材」等のパーツ単位の指定）を、
  // initialMaterialと同じ考え方でCadStudio.tsxへ渡すための状態。安全と確認できたキーだけを
  // 保持し、不正な値は個別に取り除く（他のキー・寸法・material・itemの反映は妨げない）
  const [initialPartMaterials, setInitialPartMaterials] = useState<Partial<Record<PartMaterialLabel, string>> | undefined>(
    undefined
  );
  // AI提案のpanelFinishes（「天板だけウォルナット調」等のパーツ単位の色・仕上げ指定、
  // Phase B「色・仕上げ」）を、initialPartMaterialsと同じ考え方でCadStudio.tsxへ渡すための状態
  const [initialPartFinishes, setInitialPartFinishes] = useState<
    Partial<Record<PartMaterialLabel, PanelFinish>> | undefined
  >(undefined);
  const [cadInstanceKey, setCadInstanceKey] = useState(0);
  // Phase 4-09監査で判明：AI提案の寸法がCADへ反映されたことが画面上どこにも
  // 示されておらず、ユーザーが「自分で入力し直さなくてよい」と気づけなかった。
  // Phase 4-10で、AI提案から到達した場合だけ軽量な確認表示を出すための状態を追加する
  const [aiSpecSummary, setAiSpecSummary] = useState<AiSpecSummary | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CAD_INITIAL_DESIGN_SESSION_KEY);
      if (!raw) return;
      // JSON.parseやバリデーションの成否によらず、見つかった時点で必ず1回だけ削除する
      // （不正なJSONでパースが例外を投げても、キーが残り続けて無限に再利用されることを防ぐ）。
      // Phase 4-08で確立したこの安全な削除順序はPhase 4-10でも変更しない
      sessionStorage.removeItem(CAD_INITIAL_DESIGN_SESSION_KEY);
      const parsed: unknown = JSON.parse(raw);
      // isValidStudioSpecは型（number/string）だけの検証のため、0以下・NaN・
      // heightが板厚の2倍以下といった値も通過してしまう。そのような値は既存の
      // パネル生成（app/lib/cad/geometry.ts、変更していない）が例外を投げ、
      // CadStudio.tsx側の保護されていない初期化処理でページ全体がクラッシュする
      // （Phase 4-08監査で発見）ため、isSafeStudioSpecDimensionsで追加確認する
      if (isValidStudioSpec(parsed) && isSafeStudioSpecDimensions(parsed)) {
        // 直前に反映したAI提案と完全に同じ内容であり、かつCadStudio.tsx側にまだ保存して
        // いない編集内容（セッション下書き、projectIdが無いもの＝今回と同じ「チャット発の
        // 未保存設計」）が残っている場合だけ、「同じ家具をもう一度チャット欄のボタンから
        // 開いた」＝続きを編集したいだけとみなし、AI提案での上書きをスキップする。
        // CadStudioへinitialDesignを渡さないことで、CadStudio.tsx自身のセッション下書き
        // 復元がそのまま働く。下書きが無い（一度もCADを触っていない、または既に「保存する」
        // 済みで別のprojectIdを持つ）場合は、これまで通りAI提案をそのまま適用する
        // （そうしないと、下書きが無いのにAI提案も適用されず、真っ白なデフォルト設計に
        // なってしまう）
        let isSameAsLastHandoff = false;
        try {
          let hasRestorableDraft = false;
          const draftRaw = sessionStorage.getItem(CAD_SESSION_STORAGE_KEY);
          if (draftRaw) {
            const draft = JSON.parse(draftRaw) as { projectId?: string | null };
            hasRestorableDraft = draft.projectId == null;
          }
          isSameAsLastHandoff =
            hasRestorableDraft && sessionStorage.getItem(CAD_LAST_HANDOFF_SPEC_SESSION_KEY) === raw;
          sessionStorage.setItem(CAD_LAST_HANDOFF_SPEC_SESSION_KEY, raw);
        } catch (e) {
          console.error(e);
        }
        if (isSameAsLastHandoff) {
          return;
        }

        // itemはisValidStudioSpecで型（string）までは保証済みだが、空文字・空白のみの
        // 場合は「作品名なし」とみなし、CadStudio.tsx側の既存デフォルト（「新しい設計」）へ
        // フォールバックする（Phase 5-02。寸法とは独立して判定するため、itemだけが不正でも
        // 寸法・materialの反映は妨げない）
        const trimmedItem = parsed.item.trim();
        const safeProjectName = trimmedItem.length > 0 ? trimmedItem : undefined;
        // materialはisValidStudioSpecで型（string）までは保証済みだが、値の中身までは
        // 保証しないため、CAD側の既知の候補（FURNITURE_MATERIALS）と照合する。一致しない
        // 場合はCadStudio.tsx側の既存デフォルト（FURNITURE_MATERIALS[0]）へフォールバックする
        // （Phase 5-02。materialだけが不正でも寸法・itemの反映は妨げない）
        const safeMaterial = (FURNITURE_MATERIALS as readonly string[]).includes(parsed.material)
          ? parsed.material
          : undefined;

        // partMaterialsも同じ考え方：キー（PART_MATERIAL_LABELS）・値（FURNITURE_MATERIALS）の
        // どちらも既知の語彙と一致するエントリだけを残す。不正なキー・値は個別に取り除くだけで、
        // 他の正しいエントリや寸法・item・materialの反映は妨げない
        const rawPartMaterials = parsed.partMaterials;
        let safePartMaterials: Partial<Record<PartMaterialLabel, string>> | undefined;
        if (typeof rawPartMaterials === 'object' && rawPartMaterials !== null) {
          const entries = Object.entries(rawPartMaterials as Record<string, unknown>).filter(
            ([label, material]) =>
              PART_MATERIAL_LABELS.includes(label as PartMaterialLabel) &&
              typeof material === 'string' &&
              (FURNITURE_MATERIALS as readonly string[]).includes(material)
          );
          if (entries.length > 0) {
            safePartMaterials = Object.fromEntries(entries) as Partial<Record<PartMaterialLabel, string>>;
          }
        }

        // panelFinishesも同じ考え方：キー（PART_MATERIAL_LABELS）・値（PanelFinishの4種類）の
        // どちらも既知の語彙と一致するエントリだけを残す
        const rawPartFinishes = parsed.panelFinishes;
        let safePartFinishes: Partial<Record<PartMaterialLabel, PanelFinish>> | undefined;
        if (typeof rawPartFinishes === 'object' && rawPartFinishes !== null) {
          const entries = Object.entries(rawPartFinishes as Record<string, unknown>).filter(
            ([label, finish]) =>
              PART_MATERIAL_LABELS.includes(label as PartMaterialLabel) &&
              PANEL_FINISH_VALUES.includes(finish as PanelFinish)
          );
          if (entries.length > 0) {
            safePartFinishes = Object.fromEntries(entries) as Partial<Record<PartMaterialLabel, PanelFinish>>;
          }
        }

        // sessionStorage（外部システム）から読み取った値をReact stateへ同期するだけの
        // 呼び出しのため、既存のapp/app/page.tsxと同様に明示的に抑制する
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAiSpecSummary({
          width: parsed.width,
          depth: parsed.depth,
          height: parsed.height,
          thickness: parsed.thickness ?? DEFAULT_THICKNESS_MM,
          projectName: safeProjectName,
          material: safeMaterial,
        });
        setInitialDesign(studioSpecToFurnitureDesign(parsed));
        setInitialProjectName(safeProjectName);
        setInitialMaterial(safeMaterial);
        setInitialPartMaterials(safePartMaterials);
        setInitialPartFinishes(safePartFinishes);
        setCadInstanceKey((prev) => prev + 1);
      }
      // 不正な値だった場合はaiSpecSummaryを設定しないため、確認表示も出ないまま
      // 既存どおり通常のデフォルト設計にフォールバックする
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
        {/* TANE:iの唯一の設計画面であることが一目で分かるよう、タイトルの下に短い説明文を
            添える（「ここで設計する」ことを明示する。STEP5対応）。ヘッダーの高さを大きく
            変えないよう、既存のitems-center・truncateの考え方を維持したまま2行構成にする */}
        <span className="flex flex-col leading-tight min-w-0">
          <span className="text-sm font-black text-tanei-brand truncate">🌱 TANE:i 3D家具設計</span>
          <span className="text-[10px] text-tanei-ink-muted truncate">
            ここで家具を設計し、3Dで完成形を確認できます／幅・奥行・高さ・材料・パーツを自由に調整できます
          </span>
        </span>
      </div>

      {/* Phase 4-10：AI提案から到達した場合だけ表示する軽量な確認表示。通常の新規CAD・
          ?projectId=での保存済み設計読み込みでは表示しない（aiSpecSummaryはAI提案が
          有効だった場合にしかセットされないため）。CAD操作を邪魔しないよう、ヘッダー
          直下の細い1本の帯にとどめ、押せるボタンや新しいrole="button"は追加しない */}
      {aiSpecSummary && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 bg-tanei-brand-soft border-b border-tanei-brand/30 flex-shrink-0">
          <span className="text-xs font-bold text-tanei-brand flex-shrink-0">🌿 AIの提案を反映しました</span>
          <span className="text-[11px] text-tanei-ink break-words">
            幅 {aiSpecSummary.width} mm　×　奥行 {aiSpecSummary.depth} mm　×　高さ {aiSpecSummary.height} mm　／　板厚 {aiSpecSummary.thickness} mm
            {/* Phase 5-02：設計名・材料もAI提案から反映された場合のみ、既存の1本の帯に
                追記する（優先順位は寸法→作品名→材料。フォールバックした場合は表示しない） */}
            {aiSpecSummary.projectName && <>　／　設計名 {aiSpecSummary.projectName}</>}
            {aiSpecSummary.material && <>　／　材料 {aiSpecSummary.material}</>}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <CadStudio
          key={cadInstanceKey}
          initialDesign={initialDesign}
          initialProjectName={initialProjectName}
          initialMaterial={initialMaterial}
          initialPartMaterials={initialPartMaterials}
          initialPartFinishes={initialPartFinishes}
        />
      </div>
    </div>
  );
}
