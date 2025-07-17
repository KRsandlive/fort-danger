const { Client } = require('pg');

exports.handler = async function(event, context) {
  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';

  // 방문 로그 저장
  await client.query(`INSERT INTO visit_logs(ip_address) VALUES($1)`, [ip]);

  // 전체 방문자 수 (중복 IP 포함)
  const totalRes = await client.query(`SELECT COUNT(*) FROM visit_logs`);
  // 오늘 방문자 수 (중복 IP 포함)
  const todayRes = await client.query(`SELECT COUNT(*) FROM visit_logs WHERE visit_time >= CURRENT_DATE`);

  // 고유 IP별 방문 횟수 집계
  const uniqueIpRes = await client.query(`
    SELECT ip_address, COUNT(*) AS visit_count
    FROM visit_logs
    GROUP BY ip_address
    ORDER BY visit_count DESC
    LIMIT 100
  `);

  await client.end();

  return {
    statusCode: 200,
    body: JSON.stringify({
      total: parseInt(totalRes.rows[0].count),
      today: parseInt(todayRes.rows[0].count),
      uniqueIps: uniqueIpRes.rows.map(row => ({
        ip: row.ip_address,
        count: parseInt(row.visit_count)
      })),
    }),
  };
};
