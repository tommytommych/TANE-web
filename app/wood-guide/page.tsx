import Link from "next/link";

export default function WoodGuidePage() {
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
          <Link href="/wood-guide" className="block px-3 py-2 rounded-lg bg-[#2C5E3B] text-white font-medium">
            木材サイズ比較表
          </Link>
          <Link href="/video-ideas" className="block px-3 py-2 rounded-lg hover:bg-[#E5E0D8] text-gray-700">
            動画ネタ・アイデア
          </Link>
        </nav>
        <div className="text-xs text-gray-500 pt-4 border-t border-[#E5E0D8]">
          Tomishin Channel DIY
        </div>
      </aside>

      {/* 右側：メインコンテンツ */}
      <main className="flex-1 p-8 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-6">🪵 木材サイズ比較表</h1>
        <p className="text-gray-600 mb-6">
          DIYでよく使われるSPF材やパイン集成材などの規格サイズを素早く確認できます。
        </p>

        {/* サンプルテーブル */}
        <div className="bg-white rounded-xl border border-[#E5E0D8] overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F2EB] border-b border-[#E5E0D8]">
                <th className="p-4 font-semibold text-gray-700">木材の種類</th>
                <th className="p-4 font-semibold text-gray-700">主な厚み・幅</th>
                <th className="p-4 font-semibold text-gray-700">特徴・用途</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E0D8]">
              <tr>
                <td className="p-4 font-medium">SPF材 (1x4)</td>
                <td className="p-4 text-gray-600">厚19mm × 幅89mm</td>
                <td className="p-4 text-gray-600">初心者向けで安価。棚や家具の基本に最適。</td>
              </tr>
              <tr>
                <td className="p-4 font-medium">パイン集成材</td>
                <td className="p-4 text-gray-600">厚18mm / 25mm 各種</td>
                <td className="p-4 text-gray-600">反りが少なく、天板やしっかりした家具に向く。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
