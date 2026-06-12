'use strict';
const Minio = require('minio');
const logger = require('../utils/logger');

let minioClient;
const BUCKET = process.env.MINIO_BUCKET || 'autocaption-videos';

async function initMinio() {
  minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
  });

  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1');
    logger.info(`MinIO bucket created: ${BUCKET}`);
  }
  
  return minioClient;
}

function getMinio() {
  if (!minioClient) throw new Error('MinIO not initialized');
  return minioClient;
}

async function getPresignedUrl(objectKey, expirySeconds = 86400) {
  return minioClient.presignedGetObject(BUCKET, objectKey, expirySeconds);
}

async function putObject(objectKey, stream, size, contentType) {
  return minioClient.putObject(BUCKET, objectKey, stream, size, {
    'Content-Type': contentType,
  });
}

async function getObject(objectKey) {
  return minioClient.getObject(BUCKET, objectKey);
}

async function removeObject(objectKey) {
  return minioClient.removeObject(BUCKET, objectKey);
}

async function statObject(objectKey) {
  return minioClient.statObject(BUCKET, objectKey);
}

module.exports = { initMinio, getMinio, getPresignedUrl, putObject, getObject, removeObject, statObject, BUCKET };
