// 組立説明書（STEP・ネジ位置・注意点・工具）のデータ型と検証ロジック

export interface ScrewPosition {
  xPct: number; // パネル図内でのネジ位置（横方向、0〜100%）
  yPct: number; // パネル図内でのネジ位置（縦方向、0〜100%）
  note?: string; // 例: "皿ネジ 35mm"
}

export interface AssemblyStep {
  stepNumber: number;
  title: string;
  description: string;
  panelLabel?: string; // 図解に表示するパネル名（例: "側板 × 底板"）
  screwPositions?: ScrewPosition[];
  cautions?: string[];
}

export interface AssemblyManual {
  title: string;
  tools: string[];
  overallCautions?: string[];
  steps: AssemblyStep[];
}

// チャットに該当データが見つからない場合のフォールバック用デモデータ
export const DEMO_ASSEMBLY_MANUAL: AssemblyManual = {
  title: 'シンプル収納棚',
  tools: ['電動ドライバー', 'さしがね', 'メジャー', '木工用ボンド', '鉛筆'],
  overallCautions: [
    '作業前に全てのパーツと金具が揃っているか確認してください。',
    '屋内の換気の良い平らな場所で作業してください。',
  ],
  steps: [
    {
      stepNumber: 1,
      title: '側板と底板を固定する',
      description: '側板2枚の内側に底板を挟み込み、木工用ボンドを塗ってからネジで仮止めします。直角になっているか、さしがねで確認してください。',
      panelLabel: '側板 × 底板',
      screwPositions: [
        { xPct: 15, yPct: 20, note: '上' },
        { xPct: 15, yPct: 80, note: '下' },
        { xPct: 85, yPct: 20, note: '上' },
        { xPct: 85, yPct: 80, note: '下' },
      ],
      cautions: ['ボンドが乾く前にネジ位置がずれていないか必ず確認してください。'],
    },
    {
      stepNumber: 2,
      title: '棚板を取り付ける',
      description: '側板の内側に印をつけた高さに棚板を合わせ、左右均等になるようにネジで固定します。',
      panelLabel: '棚板',
      screwPositions: [
        { xPct: 20, yPct: 50 },
        { xPct: 80, yPct: 50 },
      ],
      cautions: ['棚板が水平になっているか水平器や目視で確認してから本締めしてください。'],
    },
    {
      stepNumber: 3,
      title: '背板を取り付ける',
      description: '本体を裏返し、背板を合わせて全体の歪みを直しながら四隅と中央にネジを打ちます。',
      panelLabel: '背板',
      screwPositions: [
        { xPct: 10, yPct: 10 },
        { xPct: 90, yPct: 10 },
        { xPct: 10, yPct: 90 },
        { xPct: 90, yPct: 90 },
        { xPct: 50, yPct: 50 },
      ],
    },
    {
      stepNumber: 4,
      title: '仕上げ・設置',
      description: 'ネジの締め忘れがないか全体を確認し、サンドペーパーで角を軽く整えたら設置場所に運びます。',
      cautions: ['本棚を壁際に設置する場合は、転倒防止金具の取り付けをおすすめします。'],
    },
  ],
};

export const isValidAssemblyManual = (value: unknown): value is AssemblyManual => {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.title !== 'string' || !Array.isArray(m.tools) || !Array.isArray(m.steps)) return false;
  if (!m.tools.every((t) => typeof t === 'string')) return false;
  if (m.overallCautions !== undefined && !(Array.isArray(m.overallCautions) && m.overallCautions.every((c) => typeof c === 'string'))) {
    return false;
  }
  if (m.steps.length === 0) return false;

  return m.steps.every((s) => {
    if (typeof s !== 'object' || s === null) return false;
    const step = s as Record<string, unknown>;
    if (typeof step.stepNumber !== 'number' || typeof step.title !== 'string' || typeof step.description !== 'string') {
      return false;
    }
    if (step.panelLabel !== undefined && typeof step.panelLabel !== 'string') return false;
    if (
      step.cautions !== undefined &&
      !(Array.isArray(step.cautions) && step.cautions.every((c) => typeof c === 'string'))
    ) {
      return false;
    }
    if (step.screwPositions !== undefined) {
      if (!Array.isArray(step.screwPositions)) return false;
      const validScrews = step.screwPositions.every((sp) => {
        if (typeof sp !== 'object' || sp === null) return false;
        const screw = sp as Record<string, unknown>;
        return (
          typeof screw.xPct === 'number' &&
          typeof screw.yPct === 'number' &&
          (screw.note === undefined || typeof screw.note === 'string')
        );
      });
      if (!validScrews) return false;
    }
    return true;
  });
};
