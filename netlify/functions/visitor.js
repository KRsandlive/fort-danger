const { Client } = require('pg');

exports.handler = async function(event, context) {
  // 방문자의 IP 주소 추출 (프록시 사용 시 고려)
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);  // YYYY-MM-DD
    const currentTime = now.toISOString();         // ISO timestamp

    // 방문 기록 저장 또는 count 누적, 최신 방문 시간 갱신
    await client.query(
      `INSERT INTO visitors (ip, date, count, time)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (ip, date) DO UPDATE
       SET count = visitors.count + 1,
           time = EXCLUDED.time`,
      [ip, today, currentTime]
    );

    // 오늘 방문한 고유 IP 수 (고유 방문자 수)
    const todayVisitorRes = await client.query(
      `SELECT COUNT(DISTINCT ip) AS count FROM visitors WHERE date = $1`,
      [today]
    );
    const todayVisitors = parseInt(todayVisitorRes.rows[0].count) || 0;

    // 오늘 전체 방문 횟수 합산
    const totalVisitsRes = await client.query(
      `SELECT SUM(count) AS total_count FROM visitors WHERE date = $1`,
      [today]
    );
    const totalVisits = parseInt(totalVisitsRes.rows[0].total_count) || 0;

    // 이 IP의 오늘 방문 횟수
    const ipCountRes = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date = $2`,
      [ip, today]
    );
    const ipVisitCount = ipCountRes.rows[0]?.count || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ip,
        ipVisitCount,
        todayVisitors,
        totalVisits,
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
