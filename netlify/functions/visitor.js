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
    const currentTime = now.toISOString(); // full timestamp

    // 1. IP + 오늘 날짜 조합이 이미 존재하는지 확인
    const existingRes = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date = $2`,
      [ip, today]
    );

    if (existingRes.rows.length === 0) {
      // 2-1. 없으면 새로 삽입
      await client.query(
        `INSERT INTO visitors (ip, date, count, time) VALUES ($1, $2, 1, $3)`,
        [ip, today, currentTime]
      );
    } else {
      // 2-2. 있으면 count += 1
      await client.query(
        `UPDATE visitors SET count = count + 1, time = $3 WHERE ip = $1 AND date = $2`,
        [ip, today, currentTime]
      );
    }

    // 3. 오늘 고유 방문자 수
    const todayUniqueRes = await client.query(
      `SELECT COUNT(*) AS unique_visitors FROM visitors WHERE date = $1`,
      [today]
    );
    const todayVisitors = parseInt(todayUniqueRes.rows[0]?.unique_visitors) || 0;

    // 4. 전체 누적 방문 횟수
    const totalVisitsRes = await client.query(
      `SELECT SUM(count) AS total_count FROM visitors`
    );
    const totalVisits = parseInt(totalVisitsRes.rows[0]?.total_count) || 0;

    // 5. 이 IP의 오늘 방문 횟수
    const ipTodayRes = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date = $2`,
      [ip, today]
    );
    const ipTodayCount = parseInt(ipTodayRes.rows[0]?.count) || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ip,
        count: ipTodayCount,     // 오늘 해당 IP의 방문 횟수
        today: todayVisitors,    // 오늘의 고유 방문자 수
        total: totalVisits       // 전체 누적 방문 횟수
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
