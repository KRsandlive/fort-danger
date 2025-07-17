const { Client } = require('pg');

exports.handler = async function(event, context) {
  // 방문자 IP 추출 (x-forwarded-for 헤더에서 첫 번째 IP)
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  // PostgreSQL 클라이언트 설정 (NETLIFY_DATABASE_URL 사용)
  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // SSL 검증 우회
  });

  try {
    await client.connect();

    // 오늘 날짜 (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);

    // 방문 기록 삽입 또는 누적 (ip + date 기준)
    await client.query(
      `INSERT INTO visitors (ip, date, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (ip, date) DO UPDATE
       SET count = visitors.count + 1`,
      [ip, today]
    );

    // 전체 방문 수 (모든 카운트 합)
    const totalResult = await client.query(`SELECT SUM(count) FROM visitors`);
    const total = totalResult.rows[0].sum || 0;

    // 오늘 방문 수 (오늘 날짜 카운트 합)
    const todayResult = await client.query(
      `SELECT SUM(count) FROM visitors WHERE date = $1`,
      [today]
    );
    const todayCount = todayResult.rows[0].sum || 0;

    // 해당 IP의 누적 방문 수
    const ipResult = await client.query(
      `SELECT SUM(count) FROM visitors WHERE ip = $1`,
      [ip]
    );
    const ipCount = ipResult.rows[0].sum || 0;

    // 결과 반환
    return {
      statusCode: 200,
      body: JSON.stringify({
        ip,
        count: ipCount,
        today: todayCount,
        total,
      }),
    };
  } catch (error) {
    console.error('DB error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  } finally {
    await client.end();
  }
};
