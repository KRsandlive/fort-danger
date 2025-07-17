const { Client } = require('pg');

exports.handler = async function(event, context) {
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const today = new Date().toISOString().slice(0, 10);

    // 1. 오늘 해당 IP 방문 기록 조회
    const visitCheck = await client.query(
      `SELECT count FROM visitors WHERE ip = $1 AND date = $2`,
      [ip, today]
    );

    if (visitCheck.rowCount === 0) {
      // 방문 기록 없으면 새로 삽입 (count=1)
      await client.query(
        `INSERT INTO visitors (ip, date, count) VALUES ($1, $2, 1)`,
        [ip, today]
      );
    } // 있으면 아무 업데이트 안 함 (하루 1회 방문으로 카운트 고정)

    // 전체 방문 수 (모든 count 합)
    const totalResult = await client.query(`SELECT SUM(count) FROM visitors`);
    const total = totalResult.rows[0].sum || 0;

    // 오늘 방문 수 (오늘 날짜 기준 count 합)
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
