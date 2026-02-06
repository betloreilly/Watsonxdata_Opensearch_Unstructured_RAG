import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

function normalizeOpenSearchUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

const OPENSEARCH_URL = normalizeOpenSearchUrl(process.env.OPENSEARCH_URL || '')
const INDEX_NAME = process.env.INDEX_NAME || 'rag_demo'
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
const OPENAI_LLM_MODEL = process.env.OPENAI_LLM_MODEL || 'gpt-4o-mini'
const OPENSEARCH_VECTOR_FIELD = process.env.OPENSEARCH_VECTOR_FIELD || 'embeddings'
const OPENSEARCH_K = Number(process.env.OPENSEARCH_K || '2')

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

interface OpenSearchHit {
  _source: {
    text: string
    file_path?: string
  }
  _score: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message } = body

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      )
    }

    if (!OPENSEARCH_URL) {
      return NextResponse.json(
        {
          error:
            'OPENSEARCH_URL not configured. Set it in frontend/.env.local.',
        },
        { status: 500 }
      )
    }

    // Step 1: Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: message,
    })

    const queryVector = embeddingResponse.data[0].embedding

    // Step 2: Semantic-only search (k-NN vector search, no BM25)
    const searchQuery = {
      size: OPENSEARCH_K,
      _source: ['text', 'file_path'],
      query: {
        knn: {
          [OPENSEARCH_VECTOR_FIELD]: {
            vector: queryVector,
            k: OPENSEARCH_K,
          },
        },
      },
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (OPENSEARCH_USERNAME) {
      const token = Buffer.from(`${OPENSEARCH_USERNAME}:${OPENSEARCH_PASSWORD || ''}`).toString('base64')
      headers.Authorization = `Basic ${token}`
    }

    let searchResponse: Response
    try {
      searchResponse = await fetch(`${OPENSEARCH_URL}/${INDEX_NAME}/_search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchQuery),
      })
    } catch (err) {
      console.error('OpenSearch fetch failed:', err)
      return NextResponse.json(
        {
          error:
            `Failed to reach OpenSearch at ${OPENSEARCH_URL} (index: ${INDEX_NAME}). ` +
            'Check OPENSEARCH_URL and whether the cluster is reachable from this machine.',
        },
        { status: 502 }
      )
    }

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error('OpenSearch error:', errorText)
      return NextResponse.json(
        { error: 'Failed to search OpenSearch' },
        { status: 502 }
      )
    }

    const searchData = await searchResponse.json()
    const hits: OpenSearchHit[] = searchData.hits?.hits || []

    if (hits.length === 0) {
      return NextResponse.json({
        answer: 'No relevant documents found for your question.',
        search_type: 'semantic',
        docs_retrieved: 0,
      })
    }

    // Step 3: Build context from retrieved documents
    const context = hits
      .map((hit, i) => `Document ${i + 1}:\n${hit._source.text}`)
      .join('\n\n---\n\n')

    // Step 4: Generate answer using OpenAI
    const completion = await openai.chat.completions.create({
      model: OPENAI_LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a helpful BeeHive Bank support assistant. Answer the user's question using ONLY the information provided in the context below.

INSTRUCTIONS:
1. Read ALL the context documents carefully
2. Find the specific section that answers the question
3. Provide exact numbers, rates, and details from the context
4. If asked about APR or rates, include the specific rate ranges and any conditions

FORMATTING RULES:
- When comparing multiple products (cards, loans, accounts), use a MARKDOWN TABLE
- Use bullet points for: features, benefits, requirements, step-by-step processes
- Bold important numbers and key terms
- Keep responses concise but complete

If the information is not in the context, say "I don't have that specific information in my knowledge base."`,
        },
        {
          role: 'user',
          content: `CONTEXT:\n${context}\n\nQUESTION: ${message}\n\nANSWER (use specific numbers from the context):`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    })

    const answer = completion.choices[0]?.message?.content || 'No response generated.'

    // Prepare retrieved documents for UI display
    const retrievedDocs = hits.map((hit, i) => ({
      rank: i + 1,
      score: hit._score,
      text: hit._source.text.substring(0, 500) + (hit._source.text.length > 500 ? '...' : ''),
      file_path: hit._source.file_path || 'unknown',
    }))

    // Full search query for display (truncate vector for readability)
    const displayQuery = {
      size: OPENSEARCH_K,
      _source: ['text', 'file_path'],
      query: {
        knn: {
          [OPENSEARCH_VECTOR_FIELD]: {
            vector: `[${queryVector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}... (${queryVector.length} dimensions)]`,
            k: OPENSEARCH_K,
          },
        },
      },
    }

    // Search query info
    const searchInfo = {
      type: 'k-NN Vector Search',
      index: INDEX_NAME,
      embedding_model: OPENAI_EMBEDDING_MODEL,
      k: OPENSEARCH_K,
      query: JSON.stringify(displayQuery, null, 2),
    }

    return NextResponse.json({
      answer,
      search_type: 'semantic',
      docs_retrieved: hits.length,
      retrieved_docs: retrievedDocs,
      search_info: searchInfo,
    })

  } catch (error) {
    console.error('Semantic search API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
