const { Client } = require('pg');

exports.handler = async function(event, context) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const ip =
    event.headers['x-forwarded-for']?.split(',')[0] ||
    event.headers['client-ip'] ||
    'unknown';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1. 방문 기록 삽입
  await client.query(
    'INSERT INTO visit_log (ip_address) VALUES ($1)',
    [ip]
  );

  // 2. 해당 IP의 누적 접속 횟수
  const { rows: countRows } = await client.query(
    'SELECT COUNT(*) FROM visit_log WHERE ip_address = $1',
    [ip]
  );
  const count = parseInt(countRows[0].count);

  // 3. 오늘 전체 방문자 수
  const { rows: todayRows } = await client.query(
    'SELECT COUNT(*) FROM visit_log WHERE visit_time >= $1',
    [todayStart]
  );
  const today = parseInt(todayRows[0].count);

  // 4. 전체 방문자 수
  const { rows: totalRows } = await client.query('SELECT COUNT(*) FROM visit_log');
  const total = parseInt(totalRows[0].count);

  await client.end();

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ip,
      count,
      today,
      total,
    }),
  };
};
