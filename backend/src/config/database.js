'use strict';
const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL error:', err);
});

async function connectDB() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
}

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn(`Slow query (${duration}ms): ${text}`);
  }
  return res;
}

async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, connectDB, getClient };
