'use client';

interface InfoTipProps {
  label: string;
  explanation: string;
  onShow: (msg: string) => void;
}

// DIY初心者向けの用語説明バッジ。タップ/クリックでトースト表示するため、
// ホバーできないスマホでも同じ操作で説明を確認できる
export default function InfoTip({ label, explanation, onShow }: InfoTipProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onShow(`💡 ${label}：${explanation}`);
      }}
      title={explanation}
      aria-label={`${label}の説明: ${explanation}`}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-tanei-ink-muted/20 text-tanei-ink-muted text-[10px] font-bold hover:bg-tanei-brand hover:text-white transition-colors align-middle ml-1 flex-shrink-0"
    >
      ?
    </button>
  );
}
