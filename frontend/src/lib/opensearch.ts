import { Client } from '@opensearch-project/opensearch'

// OpenSearch client singleton
let client: Client | null = null

function normalizeOpenSearchUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function getRejectUnauthorized(): boolean {
  // Explicitly skip TLS verification when OPENSEARCH_SSL_VERIFY=false or OPENSEARCH_SSL_REJECT_UNAUTHORIZED=false.
  const sslVerify = (process.env.OPENSEARCH_SSL_VERIFY ?? '').toLowerCase()
  if (sslVerify === 'false' || sslVerify === '0' || sslVerify === 'no') return false
  const raw = (process.env.OPENSEARCH_SSL_REJECT_UNAUTHORIZED ?? '').toLowerCase()
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  // In development, default to skipping TLS verification for HTTPS (avoids "certificate has expired" on internal/test clusters).
  if (process.env.NODE_ENV !== 'production') {
    const url = (process.env.OPENSEARCH_URL ?? '').trim().toLowerCase()
    if (url.startsWith('https://')) return false
  }
  return true
}

export function getOpenSearchClient(): Client {
  if (!client) {
    const node = normalizeOpenSearchUrl(process.env.OPENSEARCH_URL || '')
    const username = process.env.OPENSEARCH_USERNAME
    const password = process.env.OPENSEARCH_PASSWORD

    if (!node) {
      throw new Error('OPENSEARCH_URL is not set')
    }

    client = new Client({
      node,
      ...(username
        ? {
            auth: {
              username,
              password: password || '',
            },
          }
        : {}),
      ssl: {
        rejectUnauthorized: getRejectUnauthorized(),
      },
    })
  }
  return client
}
