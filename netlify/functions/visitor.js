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
    const currentTime = now.toISOString();        // full timestamp

    // 방문 기록 저장 혹은 count 누적 + 최신 방문시간 갱신
    await client.query(
      `INSERT INTO visitors (ip, date, time, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (ip, date) DO UPDATE
       SET count = visitors.count + 1,
           time = EXCLUDED.time`,  // 최신 방문시간으로 갱신
      [ip, today, currentTime]
    );

    const totalRes = await client.query(`SELECT SUM(count) FROM visitors`);
    const total = totalRes.rows[0].sum || 0;

    const todayRes = await client.query(`SELECT SUM(count) FROM visitors WHERE date = $1`, [today]);
    const todayCount = todayRes.rows[0].sum || 0;

    const ipRes = await client.query(`SELECT SUM(count) FROM visitors WHERE ip = $1`, [ip]);
    const ipCount = ipRes.rows[0].sum || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ip,
        count: ipCount,
        today: todayCount,
        total: total,
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
