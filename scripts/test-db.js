#!/usr/bin/env node

const { Client } = require('pg');

async function testDB() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    console.log('Connecting to DB...');
    await client.connect();
    console.log('✅ Connected');

    console.log('Creating table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        name TEXT
      );
    `);

    console.log('Inserting data...');
    await client.query(`INSERT INTO test_table (name) VALUES ('hello CI');`);

    console.log('Reading data...');
    const res = await client.query('SELECT * FROM test_table;');
    console.log('✅ Rows:', res.rows);

    console.log('🎉 DB TEST PASSED');
    await client.end();
  } catch (err) {
    console.error('❌ DB TEST FAILED');
    console.error(err);
    process.exit(1);
  }
}

testDB();
