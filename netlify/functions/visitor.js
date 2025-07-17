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
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const currentTime = now.toISOString();

    // 오늘 날짜 + IP 조합 확인
    const existingRes = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date = $2`,
      [ip, today]
    );

    let isNewTodayVisitor = false;

    if (existingRes.rows.length === 0) {
      // 오늘 첫 방문 → insert + 이 방문은 total에도 반영
      await client.query(
        `INSERT INTO visitors (ip, date, count, time) VALUES ($1, $2, 1, $3)`,
        [ip, today, currentTime]
      );
      isNewTodayVisitor = true;
    } else {
      // 이미 방문 → count만 증가
      await client.query(
        `UPDATE visitors SET count = count + 1, time = $3 WHERE ip = $1 AND date = $2`,
        [ip, today, currentTime]
      );
    }

    // 오늘 고유 방문자 수
    const todayUniqueRes = await client.query(
      `SELECT COUNT(*) AS unique_visitors FROM visitors WHERE date = $1`,
      [today]
    );
    const todayVisitors = parseInt(todayUniqueRes.rows[0]?.unique_visitors) || 0;

    // 전체 누적 방문 수: 오늘 방문자 수만 합산
    const totalRes = await client.query(
      `SELECT SUM(1) AS total FROM visitors`
    );
    const totalVisits = parseInt(totalRes.rows[0]?.total) || 0;

    // 이 IP의 오늘 방문 횟수
    const ipTodayRes = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date = $2`,
      [ip, today]
    );
    const ipTodayCount = parseInt(ipTodayRes.rows[0]?.count) || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ip,
        count: ipTodayCount,
        today: todayVisitors,
        total: totalVisits
      })
    };
  } catch (err) {
    console.error('DB error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  } finally {
    await client.end();
  }
};
