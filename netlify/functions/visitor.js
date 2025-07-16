const { Client } = require('pg');

exports.handler = async function(event, context) {
  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  await client.query(`INSERT INTO visit_logs(ip_address) VALUES($1)`, [ip]);

  const totalRes = await client.query(`SELECT COUNT(*) FROM visit_logs`);
  const todayRes = await client.query(`SELECT COUNT(*) FROM visit_logs WHERE visit_time >= CURRENT_DATE`);

  await client.end();

  return {
    statusCode: 200,
    body: JSON.stringify({
      total: parseInt(totalRes.rows[0].count),
      today: parseInt(todayRes.rows[0].count)
    })
  };
};
