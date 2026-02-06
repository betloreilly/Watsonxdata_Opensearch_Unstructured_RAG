import { Client } from '@opensearch-project/opensearch'

// OpenSearch client singleton
let client: Client | null = null

function normalizeOpenSearchUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function getRejectUnauthorized(): boolean {
  // Default to verifying certificates (recommended for managed OpenSearch).
  const raw = (process.env.OPENSEARCH_SSL_REJECT_UNAUTHORIZED ?? 'true').toLowerCase()
  return raw !== 'false' && raw !== '0' && raw !== 'no'
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
