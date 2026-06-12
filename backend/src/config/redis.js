'use strict';
const { createClient } = require('redis');
const logger = require('../utils/logger');

let client;

async function connectRedis() {
  client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => logger.error('Redis error:', err));
  await client.connect();
  return client;
}

function getRedis() {
  if (!client) throw new Error('Redis not connected');
  return client;
}

module.exports = { connectRedis, getRedis };
