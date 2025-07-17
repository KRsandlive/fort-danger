const { Client } = require('pg');

exports.handler = async function(event, context) {
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const now = new Date().toISOString();            // 현재 시간 (ex: 2025-07-17T14:23:00.123Z)
    const dayStart = now.slice(0, 10) + 'T00:00:00Z'; // 오늘 00:00:00 UTC
    const dayEnd = now.slice(0, 10) + 'T23:59:59Z';   // 오늘 23:59:59 UTC

    // 1. 오늘 이미 방문한 기록이 있는지 확인 (ip + 오늘 날짜 범위)
    const visitCheck = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date >= $2 AND date <= $3`,
      [ip, dayStart, dayEnd]
    );

    if (visitCheck.rowCount === 0) {
      // 오늘 첫 방문: 새 기록 삽입
      await client.query(
        `INSERT INTO visitors (ip, date, count) VALUES ($1, $2, 1)`,
        [ip, now]
      );
    } else {
      // 이미 방문 기록 있음: count 업데이트 (옵션)
      await client.query(
        `UPDATE visitors SET count = count + 1 WHERE ip = $1 AND date >= $2 AND date <= $3`,
        [ip, dayStart, dayEnd]
      );
    }

    // 2. 전체 방문 수 합산
    const totalResult = await client.query(`SELECT SUM(count) FROM visitors`);
    const total = totalResult.rows[0].sum || 0;

    // 3. 오늘 방문 수 합산
    const todayResult = await client.query(
      `SELECT SUM(count) FROM visitors WHERE date >= $1 AND date <= $2`,
      [dayStart, dayEnd]
    );
    const todayCount = todayResult.rows[0].sum || 0;

    // 4. 해당 IP의 누적 방문 수 합산
    const ipResult = await client.query(
      `SELECT SUM(count) FROM visitors WHERE ip = $1`,
      [ip]
    );
    const ipCount = ipResult.rows[0].sum || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ip,
        count: ipCount,
        today: todayCount,
        total: total,
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
