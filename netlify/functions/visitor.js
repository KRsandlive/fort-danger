import { kv } from '@vercel/kv';

export default async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*', // 또는 'https://fortdanger.shop'만 명시적으로 허용 가능
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: 'Preflight passed',
    };
  }

  try {
    // 현재 시간 (KST, UTC+9로 조정)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const date = kst.toISOString().slice(0, 10); // YYYY-MM-DD
    const hourKey = kst.toISOString().slice(0, 13); // YYYY-MM-DDTHH

    // IP 주소 추출
    const ip =
      event.headers['x-forwarded-for']?.split(',')[0] ||
      event.headers['x-real-ip'] ||
      event.requestContext?.identity?.sourceIp ||
      'unknown';

    // 오늘 날짜 기준 방문 여부 확인
    const ipKey = `visit:${date}:${ip}`;
    const alreadyVisited = await kv.get(ipKey);

    if (!alreadyVisited) {
      await kv.set(ipKey, '1', { ex: 60 * 60 * 24 }); // 24시간 후 만료

      // 방문자 수 증가
      await kv.incr('visitor:total');
      await kv.incr(`visitor:daily:${date}`);
      await kv.incr(`visitor:hourly:${hourKey}`);
    }

    // 방문자 수 가져오기
    const total = parseInt((await kv.get('visitor:total')) || '0');
    const today = parseInt((await kv.get(`visitor:daily:${date}`)) || '0');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalVisitors: total,
        todayVisitors: today,
        ip: ip,
        date: date,
        hour: hourKey,
        kstTime: kst.toISOString(),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
