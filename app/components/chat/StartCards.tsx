'use client';

interface StartCardsProps {
  onSendMessage: (text: string, countUp?: boolean) => void;
  onOpenPhotoPicker: () => void;
}

// 会話がまだ挨拶メッセージのみのとき、チャット欄の上に表示する「チャットTOP」の入り口カード群。
// 初めての利用者が最初に何をすればいいか迷わないよう、主要な入口は
// 「💬 DIYを相談」「📷 写真からAI空間診断」の2つだけに絞り、左右に横並びで表示する
// （ブラウザCAD・完成イメージ・木取り図等はここに並べず、サイドバーの【設計】【確認】か、
// AI提案後の導線から利用する）
export default function StartCards({ onSendMessage, onOpenPhotoPicker }: StartCardsProps) {
  return (
    <div className="w-full max-w-3xl mx-auto mt-2 mb-6 grid grid-cols-2 gap-3">
      <button
        onClick={() => onSendMessage('DIYの相談をしたいです', false)}
        className="text-left bg-white hover:bg-tanei-surface-muted border border-tanei-border rounded-tanei-card p-4 shadow-sm hover:shadow-md transition-all group flex flex-col items-start"
      >
        <span className="text-3xl mb-1.5">💬</span>
        <span className="text-sm sm:text-base font-bold text-tanei-ink group-hover:text-tanei-brand">DIYを相談</span>
        <span className="text-[11px] sm:text-xs text-tanei-ink-muted mt-0.5">作りたい家具をAIに相談</span>
      </button>

      <button
        onClick={onOpenPhotoPicker}
        className="text-left bg-gradient-to-r from-tanei-brand to-tanei-accent text-white rounded-tanei-card p-4 shadow-md hover:shadow-lg hover:brightness-105 transition-all flex flex-col items-start"
      >
        <span className="text-3xl mb-1.5">📷</span>
        <span className="text-sm sm:text-base font-bold">写真からAI空間診断</span>
        <span className="text-[11px] sm:text-xs text-white/90 mt-0.5">部屋の写真から、作れる家具を相談</span>
      </button>
    </div>
  );
}
