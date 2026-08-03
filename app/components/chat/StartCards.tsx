'use client';

interface StartCardsProps {
  onSendMessage: (text: string, countUp?: boolean) => void;
  onOpenPhotoPicker: () => void;
}

const OTHER_ITEMS = [
  {
    icon: '💬',
    label: 'DIYを相談する',
    desc: '作りたいものを気軽に話してみる',
    message: 'DIYの相談をしたいです',
  },
  {
    icon: '📐',
    label: '設計してもらう',
    desc: 'イメージから設計案を作る',
    message: '作品の設計を手伝ってほしいです。大まかなイメージから具体的な設計案を提案してください。',
  },
  {
    icon: '🪵',
    label: '木材について知る',
    desc: '種類や価格の目安をチェック',
    message: 'コーナンの木材の種類と価格リストを教えて',
  },
];

// 会話がまだ挨拶メッセージのみのとき、チャット欄の上に表示する「はじめの一歩」カード群
// 「DIY版ChatGPT」ではなく「DIYを始めたくなるアプリ」にするための入り口。
// 「写真から相談する」はTANE:i最大の特徴のため、単独の目立つカードとして最上部に配置する
export default function StartCards({ onSendMessage, onOpenPhotoPicker }: StartCardsProps) {
  return (
    <div className="w-full max-w-3xl mx-auto mt-2 mb-6 space-y-3">
      <button
        onClick={onOpenPhotoPicker}
        className="w-full text-left bg-gradient-to-r from-tanei-brand to-tanei-accent text-white rounded-tanei-card p-5 shadow-md hover:shadow-lg hover:brightness-105 transition-all flex items-center gap-4"
      >
        <span className="text-4xl flex-shrink-0">📷</span>
        <span className="min-w-0">
          <span className="inline-block text-[10px] font-bold bg-white/25 px-2 py-0.5 rounded-full mb-1">
            ✨ TANE:iいちおしの機能
          </span>
          <span className="text-base font-bold block">写真からAI空間診断</span>
          <span className="text-xs text-white/90 block mt-0.5">
            お部屋の写真を送るだけで、家具・壁・床・収納スペースを自動認識し、最適サイズ・おすすめ木材・設置イメージまで提案します
          </span>
        </span>
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OTHER_ITEMS.map((item) => (
          <button
            key={item.label}
            onClick={() => onSendMessage(item.message, false)}
            className="text-left bg-white hover:bg-tanei-surface-muted border border-tanei-border rounded-tanei-card p-4 shadow-sm hover:shadow-md transition-all group flex items-start gap-3"
          >
            <span className="text-2xl">{item.icon}</span>
            <span>
              <span className="text-sm font-bold text-tanei-ink block group-hover:text-tanei-brand">
                {item.label}
              </span>
              <span className="text-xs text-tanei-ink-muted block mt-0.5">{item.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
