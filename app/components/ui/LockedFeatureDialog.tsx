'use client';

import { useEffect } from 'react';

interface LockedFeatureDialogProps {
  featureName: string;
  missing: string[];
  onClose: () => void;
}

// ゲート未達の機能がクリックされたときに表示するダイアログ
// 「この機能を使うには先に○○を完了してください」を伝える
export default function LockedFeatureDialog({ featureName, missing, onClose }: LockedFeatureDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="locked-feature-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-sm rounded-tanei-card shadow-xl p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🔒</span>
          <h3 id="locked-feature-dialog-title" className="font-bold text-tanei-ink text-base">
            {featureName}はまだ使えません
          </h3>
        </div>
        <p className="text-sm text-tanei-ink-muted mb-3">この機能を使うには先に、以下を完了してください。</p>
        <ul className="space-y-1.5 mb-5">
          {missing.map((item) => (
            <li key={item} className="text-sm text-tanei-ink flex items-start gap-2">
              <span className="text-tanei-accent font-bold">・</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="w-full bg-tanei-accent text-white font-bold text-sm py-2.5 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
        >
          わかりました
        </button>
      </div>
    </div>
  );
}
