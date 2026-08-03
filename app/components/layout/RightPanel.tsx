'use client';

import { useState } from 'react';
import Image from 'next/image';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';
import Tabs from '../ui/Tabs';
import type { KOHNAN_WOOD_LIST, AMAZON_TOOLS } from '../../lib/constants';

type WoodItem = (typeof KOHNAN_WOOD_LIST)[number];
type ToolItem = (typeof AMAZON_TOOLS)[number];

interface RightPanelProps {
  woodList: WoodItem[];
  tools: ToolItem[];
}

const TABS = [
  { id: 'wood', label: '木材価格', icon: '🪵' },
  { id: 'tools', label: '工具', icon: '🛒' },
  { id: 'sponsor', label: 'スポンサー', icon: '📢' },
];

function PanelContent({ activeTab, woodList, tools }: { activeTab: string; woodList: WoodItem[]; tools: ToolItem[] }) {
  if (activeTab === 'wood') {
    return (
      <Card padding="sm" className="text-xs space-y-2.5 text-tanei-ink">
        {woodList.map((wood, idx) => (
          <div key={idx} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <span className="font-bold block text-tanei-brand">{wood.name}</span>
            <span className="text-xs text-gray-600 block">
              寸法: {wood.size} / 長さ: {wood.length}
            </span>
            <span className="text-xs text-gray-500">
              目安: {wood.price}（{wood.feature}）
            </span>
          </div>
        ))}
      </Card>
    );
  }

  if (activeTab === 'tools') {
    return (
      <div className="space-y-2">
        {tools.map((tool, idx) => (
          <a
            key={idx}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-tanei-surface p-2.5 rounded-tanei-card border border-tanei-border hover:border-[#FF9900] transition-all shadow-sm group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-tanei-ink group-hover:text-[#FF9900] truncate mr-2">
                {tool.name}
              </span>
              <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded flex-shrink-0 font-bold">
                Amazon ＞
              </span>
            </div>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <a
        href="https://www.kohnan-eshop.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-tanei-surface hover:bg-gray-50 border border-tanei-border rounded-tanei-card p-3 text-center shadow-sm transition-all group"
      >
        <div className="flex items-center justify-center mb-1.5">
          <Image src="/images/kohnan-logo.png" alt="コーナンeショップ" width={140} height={26} />
        </div>
        <div className="text-xs font-bold text-black group-hover:underline">ホームセンター コーナン公式</div>
        <div className="text-xs text-black mt-1">DIY・木材・工具の調達に！</div>
      </a>
      {[1, 2].map((slot) => (
        <div key={slot} className="rounded-tanei-card p-3 text-center border-2 border-dashed border-tanei-border bg-tanei-bg">
          <div className="text-xs font-bold text-[#B5A793]">広告募集中</div>
          <div className="text-xs text-[#C4B8A5] mt-1">この枠にあなたの広告を掲載しませんか？</div>
        </div>
      ))}
    </div>
  );
}

// おすすめYouTube情報とお問い合わせリンク：パネル内の残ったスペースを埋めるように下部へ寄せる
function PanelFooter() {
  return (
    <div className="mt-auto pt-4 border-t border-tanei-border">
      <SectionTitle icon="📺" className="mb-2">
        オススメYouTube情報
      </SectionTitle>
      <Card padding="lg" className="overflow-hidden">
        <a
          href="https://www.youtube.com/@tomishin_channel_DIY"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 group"
        >
          <div className="w-24 h-24 relative overflow-hidden bg-tanei-bg rounded-tanei-control border border-tanei-border flex-shrink-0">
            <div className="absolute inset-2">
              <Image
                src="/images/tomishin-channel-avatar.jpg"
                alt="とみしんチャンネルDIY"
                fill
                className="object-contain object-center"
                sizes="96px"
              />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-red-600 group-hover:underline mb-1">チェック！</div>
            <div className="text-xs font-bold text-tanei-ink truncate">とみしんチャンネルDIY</div>
            <p className="text-xs text-tanei-ink-muted leading-relaxed mt-1">
              初心者向けの分かりやすいDIY動画や木工アイデアを配信中！
            </p>
          </div>
        </a>

        <a
          href="https://www.youtube.com/@tomishin_channel_DIY?sub_confirmation=1"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 bg-[#FF0000] hover:bg-[#CC0000] text-white text-xs font-bold px-3 py-2 rounded-tanei-control transition-all shadow-sm w-full"
        >
          <span>▶</span> チャンネル登録
        </a>
      </Card>

      <a
        href="https://line.me/R/ti/p/@your_line_id"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-tanei-ink-muted hover:text-tanei-ink hover:underline transition-colors px-1 py-1"
      >
        <span>💬</span> ご意見、リクエストはこちらから
      </a>
    </div>
  );
}

export default function RightPanel({ woodList, tools }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState('wood');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      {/* デスクトップ用サイドバー */}
      <div className="hidden xl:flex xl:flex-col w-80 bg-tanei-surface-muted border-l border-tanei-border p-5 gap-4 overflow-y-auto flex-shrink-0">
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />
        <PanelContent activeTab={activeTab} woodList={woodList} tools={tools} />
        <PanelFooter />
      </div>

      {/* モバイル用フローティングトリガー */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="xl:hidden fixed bottom-32 right-4 z-30 w-12 h-12 rounded-full bg-tanei-brand text-white shadow-lg flex items-center justify-center text-xl"
        aria-label="木材価格・工具・スポンサー情報を開く"
      >
        🪵
      </button>

      {/* モバイル用ボトムシート */}
      {isMobileOpen && (
        <div className="xl:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsMobileOpen(false)} aria-hidden="true" />
          <div className="absolute bottom-0 left-0 right-0 max-h-[75vh] bg-tanei-surface-muted rounded-t-tanei-card p-5 flex flex-col gap-4 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-tanei-ink">お役立ち情報</span>
              <button onClick={() => setIsMobileOpen(false)} className="text-tanei-ink-muted hover:text-tanei-ink text-sm font-bold">
                ✕ 閉じる
              </button>
            </div>
            <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />
            <PanelContent activeTab={activeTab} woodList={woodList} tools={tools} />
            <PanelFooter />
          </div>
        </div>
      )}
    </>
  );
}
