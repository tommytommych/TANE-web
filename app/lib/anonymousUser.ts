import { cookies } from 'next/headers';

// ログイン機能がないため、匿名ユーザーを識別するためのCookieを発行する。
// ブラウザのstateと違いページ更新やタブを閉じても保持されるため、利用回数の
// 永続化キーとして使える
const USER_ID_COOKIE = 'tanei_uid';
const USER_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function getOrCreateAnonymousUserId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(USER_ID_COOKIE)?.value;
  if (existing) {
    return existing;
  }

  const userId = crypto.randomUUID();
  cookieStore.set(USER_ID_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: USER_ID_MAX_AGE_SECONDS,
    path: '/',
  });
  return userId;
}
