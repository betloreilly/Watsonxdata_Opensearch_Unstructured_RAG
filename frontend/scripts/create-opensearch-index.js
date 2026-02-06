#!/usr/bin/env node
/**
 * Create the OpenSearch index using the same .env.local and SSL/auth as the app.
 * Run from frontend dir: node scripts/create-opensearch-index.js
 */

const fs = require('fs')
const path = require('path')

// Log immediately so user sees the script is running
console.log('OpenSearch index creation: loading frontend/.env.local...')

const frontendDir = path.join(__dirname, '..')
const envPath = path.join(frontendDir, '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('ERROR: Missing frontend/.env.local')
  process.exit(1)
}

// Load .env.local (skip comments and empty lines; last value wins for duplicate keys)
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  const eq = trimmed.indexOf('=')
  if (eq <= 0) return
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  process.env[key] = value
})

const node = (process.env.OPENSEARCH_URL || '').trim().replace(/\/+$/, '')
const indexName = (process.env.INDEX_NAME || 'rag_demo').trim()
const dimension = parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10)

if (!node) {
  console.error('ERROR: OPENSEARCH_URL is not set in frontend/.env.local')
  process.exit(1)
}

// Mask URL for logs (show host only)
const urlForLog = node.replace(/:[^:@]+@/, ':****@')
console.log(`Connecting to ${urlForLog} | index: ${indexName} | dimension: ${dimension}`)

function getRejectUnauthorized() {
  const sslVerify = (process.env.OPENSEARCH_SSL_VERIFY || '').toLowerCase()
  if (sslVerify === 'false' || sslVerify === '0' || sslVerify === 'no') return false
  const raw = (process.env.OPENSEARCH_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  if (process.env.NODE_ENV !== 'production') {
    const url = (process.env.OPENSEARCH_URL || '').trim().toLowerCase()
    if (url.startsWith('https://')) return false
  }
  return true
}

const { Client } = require('@opensearch-project/opensearch')
const client = new Client({
  node,
  requestTimeout: 30000,
  ...(process.env.OPENSEARCH_USERNAME
    ? {
        auth: {
          username: process.env.OPENSEARCH_USERNAME,
          password: process.env.OPENSEARCH_PASSWORD || '',
        },
      }
    : {}),
  ssl: { rejectUnauthorized: getRejectUnauthorized() },
})

const body = {
  settings: {
    index: {
      knn: true,
      'knn.algo_param.ef_search': 100,
    },
  },
  mappings: {
    dynamic: true,
    properties: {
      element_id: { type: 'keyword' },
      record_id: { type: 'keyword' },
      text: { type: 'text' },
      type: {
        type: 'text',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      embeddings: {
        type: 'knn_vector',
        dimension,
        method: {
          name: 'hnsw',
          space_type: 'cosinesimil',
          engine: 'lucene',
        },
      },
      metadata: {
        type: 'object',
        dynamic: true,
        enabled: true,
      },
    },
  },
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const maxTries = 3
  for (let tryNum = 1; tryNum <= maxTries; tryNum++) {
    try {
      if (tryNum > 1) {
        console.log(`Retry ${tryNum}/${maxTries} in 10s...`)
        await sleep(10000)
      }
      console.log(`Creating index "${indexName}"...`)
      await client.indices.create({ index: indexName, body })
      console.log(`Index "${indexName}" created (dimension=${dimension}).`)
      return
    } catch (err) {
      const status = err.meta?.statusCode
      const errorType = err.body?.error?.type
      const is503 = status === 503 || errorType === 'cluster_manager_not_discovered_exception'
      const isAlreadyExists =
        errorType === 'resource_already_exists_exception' ||
        (status === 400 && (err.body?.error?.reason || '').includes('already exists'))

      if (isAlreadyExists) {
        console.log(`Index "${indexName}" already exists.`)
        return
      }
      if (is503 && tryNum < maxTries) {
        console.error(`Attempt ${tryNum} failed (503).`)
        continue
      }
      console.error('Index creation failed:', err.message)
      if (err.body && err.body.error) {
        console.error('Response:', JSON.stringify(err.body, null, 2))
      }
      if (is503) {
        console.error('Cluster returned 503. Wait a few minutes and run this script again.')
      }
      process.exit(1)
    }
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
