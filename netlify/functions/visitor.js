const { Client } = require('pg');

exports.handler = async function(event, context) {
  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // x-forwarded-for 헤더에서 첫 번째 IP 추출
  const ipRaw = event.headers['x-forwarded-for'] || 'unknown';
  const ip = ipRaw.split(',')[0].trim();

  // 방문 기록 추가
  await client.query(
    `INSERT INTO visit_logs(ip_address) VALUES($1)`,
    [ip]
  );

  // 전체 고유 IP 수
  const uniqueIpsRes = await client.query(
    `SELECT COUNT(DISTINCT ip_address) AS unique_count FROM visit_logs`
  );

  // 오늘 고유 IP 수
  const uniqueTodayRes = await client.query(
    `SELECT COUNT(DISTINCT ip_address) AS unique_today_count FROM visit_logs WHERE visit_time >= CURRENT_DATE`
  );

  // IP별 방문 횟수 집계 (최대 100개)
  const ipCountsRes = await client.query(
    `SELECT ip_address, COUNT(*) AS visit_count
     FROM visit_logs
     GROUP BY ip_address
     ORDER BY visit_count DESC
     LIMIT 100`
  );

  await client.end();

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      totalUniqueIPs: parseInt(uniqueIpsRes.rows[0].unique_count, 10),
      todayUniqueIPs: parseInt(uniqueTodayRes.rows[0].unique_today_count, 10),
      ipVisits: ipCountsRes.rows.map(row => ({
        ip: row.ip_address,
        count: parseInt(row.visit_count, 10)
      })),
    }),
  };
};
