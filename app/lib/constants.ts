export const KOHNAN_WOOD_LIST = [
  { name: 'SPF材（1×4）', feature: 'DIYの定番。安価で加工しやすい。', size: '厚19×幅89mm', length: '910 / 1820mm', price: '約300〜500円' },
  { name: 'SPF材（2×4）', feature: '柱や棚などの構造材に最適。強度がある。', size: '厚38×幅89mm', length: '910 / 1820 / 2440mm', price: '約600〜900円' },
  { name: 'パイン集成材', feature: '家具や棚板に最適。木目が美しい。', size: '厚さ15 / 18 / 25mm、幅200〜600mm', length: '910 / 1820mm', price: '約1,200円〜' },
  { name: 'ラワン合板 / ベニヤ', feature: '背板や下地、箱物家具に。', size: '厚さ2.5 / 4 / 5.5 / 9 / 12mm', length: 'サブロク板（910×1820mm）', price: '約1,000円〜' },
  { name: 'OSB合板', feature: '無骨でおしゃれな内装やDIYに。', size: '厚さ9 / 11 / 12mm', length: 'サブロク板（910×1820mm）', price: '約1,500円〜' },
  { name: 'MDFボード', feature: '塗装やカッティングシートに最適。', size: '厚さ2.5 / 5.5 / 9 / 12mm', length: 'サブロク板（910×1820mm）', price: '約1,000円〜' },
];

export const AMAZON_TOOLS = [
  { name: 'ゼットソー 9寸目 (ゼット販売)', url: 'https://amzn.to/4ufzAf9' },
  { name: 'Temple Tool 両刃鋸 240mm 替刃式', url: 'https://amzn.to/47JBBYY' },
  { name: 'Temple Tool ダボ切り鋸 150mm', url: 'https://amzn.to/4fW3FKS' },
  { name: '角利 ネールハンマー パイプ柄 275mm', url: 'https://amzn.to/4fW428e' },
  { name: 'シンワ測定 サンデーカーペンター 15×30', url: 'https://amzn.to/463bbAa' },
  { name: 'シンワ測定 止型スコヤ 金属製', url: 'https://amzn.to/4mUq3GD' },
  { name: 'シンワ測定 完全スコヤ 15cm', url: 'https://amzn.to/4n1spnm' },
  { name: 'ベッセル ボールグリップドライバー', url: 'https://amzn.to/464nV9H' },
  { name: 'シンワ測定 ブルーレベル Basic 300mm', url: 'https://amzn.to/41hPCt1' },
  { name: 'シンワ測定 直尺 シルバー ストッパー付', url: 'https://amzn.to/41WQP9g' },
  { name: 'シンワ測定 15×30 差金 定規', url: 'https://amzn.to/475FBCZ' },
  { name: 'ハンドサンダー サンドペーパーセット', url: 'https://amzn.to/45GFjjy' },
  { name: 'SK11 マイターボックス (のこぎりガイド)', url: 'https://amzn.to/4mqhvHH' },
  { name: 'コニシ ボンド 木工用速乾 500g', url: 'https://amzn.to/3HOMaPZ' },
  { name: 'マキタ ドライバドリル MDF001', url: 'https://amzn.to/41k057d' },
];

// Fisher-Yatesシャッフル：表示のたびに「おすすめDIY工具・アイテム」の順番をランダムにする
export const shuffleArray = <T,>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
