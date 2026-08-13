'use client';

interface StartCardsProps {
  onSendMessage: (text: string, countUp?: boolean) => void;
  onOpenPhotoPicker: () => void;
}

// 会話がまだ挨拶メッセージのみのとき、チャット欄の上に表示する「チャットTOP」の入り口カード群。
// 初めての利用者が最初に何をすればいいか迷わないよう、主要な入口は
// 「📷 写真からAI空間診断」「💬 DIYを相談」の2つだけに絞る（ブラウザCAD・完成イメージ・
// 木取り図等はここに並べず、サイドバーの【設計】【確認】か、AI提案後の導線から利用する）。
// 「写真から相談する」はTANE:i最大の特徴のため、単独の目立つバナーとして最上部に配置する
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
            部屋の写真から、作れる家具を相談（家具・壁・床・収納スペースを自動認識し、最適サイズ・おすすめ木材・設置イメージまで提案します）
          </span>
        </span>
      </button>

      <button
        onClick={() => onSendMessage('DIYの相談をしたいです', false)}
        className="w-full text-left bg-white hover:bg-tanei-surface-muted border border-tanei-border rounded-tanei-card p-4 shadow-sm hover:shadow-md transition-all group flex items-center gap-4"
      >
        <span className="text-3xl flex-shrink-0">💬</span>
        <span className="min-w-0">
          <span className="text-base font-bold text-tanei-ink block group-hover:text-tanei-brand">DIYを相談</span>
          <span className="text-xs text-tanei-ink-muted block mt-0.5">作りたい家具をAIに相談</span>
        </span>
      </button>
    </div>
  );
}
