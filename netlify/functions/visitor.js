const { Client } = require('pg');

exports.handler = async function(event, context) {
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = now.toISOString();

    // 1. 방문 기록 - 오늘 처음 방문이면 insert, 중복이면 업데이트 안함 (중복 방문은 count에 반영 안함)
    await client.query(
      `INSERT INTO visitors (ip, date, time, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (ip, date) DO NOTHING`,
      [ip, today, currentTime]
    );

    // 2. ip별 방문 누적 횟수: ip의 총 count 합 (하루 1회만 카운트하니 방문일수=횟수)
    const ipCountRes = await client.query(
      `SELECT SUM(count) FROM visitors WHERE ip = $1`,
      [ip]
    );
    const ipCount = parseInt(ipCountRes.rows[0].sum) || 0;

    // 3. 오늘 방문자 수 (IP 기준 중복 불가)
    const todayCountRes = await client.query(
      `SELECT COUNT(*) FROM visitors WHERE date = $1`,
      [today]
    );
    const todayCount = parseInt(todayCountRes.rows[0].count) || 0;

    // 4. 전체 방문자 수 (IP 기준 중복 불가)
    const totalCountRes = await client.query(
      `SELECT COUNT(*) FROM visitors`
    );
    const totalCount = parseInt(totalCountRes.rows[0].count) || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ip,
        count: ipCount,   // ip별 총 방문 누적 횟수(하루 1회 중복불가)
        today: todayCount,
        total: totalCount,
        lastVisitTime: currentTime
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
