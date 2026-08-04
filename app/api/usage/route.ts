import { NextResponse } from 'next/server';
import { getOrCreateAnonymousUserId } from '../../lib/anonymousUser';
import { getRemainingCount, DAILY_MESSAGE_LIMIT } from '../../lib/rateLimit';

// TANE:i本体がページ読み込み時に「本日の残り相談回数」をサーバーの実データから
// 取得するためのエンドポイント。ブラウザのstateだけに頼らず、更新しても正しい
// 残り回数を表示できるようにする
export async function GET() {
  const userId = await getOrCreateAnonymousUserId();
  const remaining = await getRemainingCount(userId);

  return NextResponse.json({ remaining, limit: DAILY_MESSAGE_LIMIT });
}
