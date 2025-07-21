const { Client } = require('pg');

exports.handler = async function(event, context) {
  // CORS 관련 헤더 설정: 클라이언트 https://fortdanger.shop에서 요청 허용
  const headers = {
    'Access-Control-Allow-Origin': 'https://fortdanger.shop', // 요청 허용 도메인
    'Access-Control-Allow-Headers': 'Content-Type',          // 허용 헤더
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',    // 허용 메서드
  };

  // 프리플라이트 요청(OPTIONS)에 대해 204 상태로 응답, 헤더 포함 필수
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,  // No Content
      headers,
      body: '',
    };
  }

  // 클라이언트 IP 추출: x-forwarded-for 헤더 우선, 없으면 'unknown'
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  // PostgreSQL 클라이언트 생성 (네온 DB 접속용)
  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,  // 환경변수로 DB URL 관리
    ssl: { rejectUnauthorized: false },                  // SSL 설정 (네온 DB 권장)
  });

  try {
    await client.connect();  // DB 연결

    // 현재 시간 가져오기 (UTC 기준)
    const now = new Date();

    // UTC 시간에 9시간 더해 KST(한국 표준시, UTC+9)로 변환
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    // KST 기준 오늘 날짜 (YYYY-MM-DD)
    const today = kst.toISOString().slice(0, 10);

    // KST 기준 현재 시간 ISO 문자열
    const currentTime = kst.toISOString();

    // 오늘 날짜와 IP를 기준으로 방문 기록 조회
    const existingRes = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date = $2`,
      [ip, today]
    );

    if (existingRes.rows.length === 0) {
      // 오늘 첫 방문인 경우: 방문자 기록 새로 추가 (count=1)
      await client.query(
        `INSERT INTO visitors (ip, date, count, time) VALUES ($1, $2, 1, $3)`,
        [ip, today, currentTime]
      );
    } else {
      // 이미 방문한 경우: 방문 횟수(count) 1 증가, 최신 방문 시간 갱신
      await client.query(
        `UPDATE visitors SET count = count + 1, time = $3 WHERE ip = $1 AND date = $2`,
        [ip, today, currentTime]
      );
    }

    // 오늘 날짜 기준 고유 방문자 수 계산 (distinct IP count)
    const todayUniqueRes = await client.query(
      `SELECT COUNT(*) AS unique_visitors FROM visitors WHERE date = $1`,
      [today]
    );
    const todayVisitors = parseInt(todayUniqueRes.rows[0]?.unique_visitors) || 0;

    // 전체 방문 기록 수 집계 (전체 방문 행 개수)
    const totalRes = await client.query(
      `SELECT COUNT(*) AS total FROM visitors`
    );
    const totalVisits = parseInt(totalRes.rows[0]?.total) || 0;

    // 해당 IP의 오늘 방문 횟수 계산 (기존 count + 1 또는 1)
    const ipTodayCount = existingRes.rows.length === 0 ? 1 : parseInt(existingRes.rows[0].count) + 1;

    // 정상 응답: 방문자 정보와 통계 반환, CORS 헤더 포함
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ip,
        count: ipTodayCount,
        today: todayVisitors,
        total: totalVisits,
      }),
    };
  } catch (err) {
    // DB 오류 발생 시 로그 출력 및 500 응답 반환
    console.error('DB error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  } finally {
    // DB 연결 종료
    await client.end();
  }
};
