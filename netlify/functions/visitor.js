const { Client } = require('pg');

exports.handler = async function(event, context) {
  // ✅ IP 추출 (여기!)
  const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  // ✅ PostgreSQL 연결 설정
  const client = new Client({
    connectionString: process.env.PG_CONNECTION_STRING, // .env에 설정한 DB 주소
    ssl: { rejectUnauthorized: false }, // Netlify에서 sslmode=require 대응
  });

  try {
    await client.connect();

    // 오늘 날짜 추출
    const today = new Date().toISOString().slice(0, 10);

    // 1. 접속 기록 저장 또는 누적
    await client.query(
      `INSERT INTO visitors (ip, date, count) 
       VALUES ($1, $2, 1)
       ON CONFLICT (ip, date) DO UPDATE 
       SET count = visitors.count + 1`,
      [ip, today]
    );

    // 2. 전체 방문 수
    const totalResult = await client.query(`SELECT SUM(count) FROM visitors`);
    const total = totalResult.rows[0].sum || 0;

    // 3. 오늘 방문 수
    const todayResult = await client.query(
      `SELECT SUM(count) FROM visitors WHERE date = $1`,
      [today]
    );
    const todayCount = todayResult.rows[0].sum || 0;

    // 4. 해당 IP의 누적 방문 수
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
