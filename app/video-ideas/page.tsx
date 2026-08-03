import Link from "next/link";

export default function VideoIdeasPage() {
  return (
    <div className="flex h-screen bg-[#FDFBF7] text-[#2C5E3B]">
      {/* 左側：サイドバー */}
      <aside className="w-64 border-r border-[#E5E0D8] bg-[#F5F2EB] p-4 flex flex-col">
        <div className="text-xl font-bold mb-6 flex items-center gap-2">
          🌱 TANE:i
        </div>
        <nav className="space-y-2 flex-1">
          <Link href="/" className="block px-3 py-2 rounded-lg hover:bg-[#E5E0D8] text-gray-700">
            ホーム / チャット
          </Link>
          <Link href="/wood-guide" className="block px-3 py-2 rounded-lg hover:bg-[#E5E0D8] text-gray-700">
            木材サイズ比較表
          </Link>
          <Link href="/video-ideas" className="block px-3 py-2 rounded-lg bg-[#2C5E3B] text-white font-medium">
            動画ネタ・アイデア
          </Link>
        </nav>
        <div className="text-xs text-gray-500 pt-4 border-t border-[#E5E0D8]">
          Tomishin Channel DIY
        </div>
      </aside>

      {/* 右側：メインコンテンツ */}
      <main className="flex-1 p-8 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-6">💡 動画ネタ・アイデア</h1>
        <p className="text-gray-600 mb-6">
          YouTubeなどの発信に向けたDIYの企画や、動画の構成案を管理するスペースです。
        </p>

        {/* アイデアカードのサンプル */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-xl border border-[#E5E0D8] shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-[#2C5E3B]">初心者でも失敗しない！木製ラックの作り方</h3>
            <p className="text-gray-600 text-sm">SPF材のカットから組み立てまでをノーカットに近い形で解説する企画。</p>
            <span className="inline-block mt-4 text-xs bg-[#F5F2EB] text-[#2C5E3B] px-2.5 py-1 rounded-full font-medium">企画中</span>
          </div>
          <div className="bg-white p-6 rounded-xl border border-[#E5E0D8] shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-[#2C5E3B]">100均アイテムで作るおしゃれ収納</h3>
            <p className="text-gray-600 text-sm">コストを抑えて部屋の雰囲気をガラリと変えるアイデア検証動画。</p>
            <span className="inline-block mt-4 text-xs bg-[#F5F2EB] text-[#2C5E3B] px-2.5 py-1 rounded-full font-medium">撮影準備</span>
          </div>
        </div>
      </main>
    </div>
  );
}
