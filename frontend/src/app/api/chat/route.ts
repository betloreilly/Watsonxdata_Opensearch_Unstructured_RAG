import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

const LANGFLOW_URL = (process.env.LANGFLOW_URL || 'http://localhost:7860').replace(/\/+$/, '')
const LANGFLOW_FLOW_ID = process.env.LANGFLOW_FLOW_ID || '6f48da32-743b-49a7-bebf-0e302d172314'
const LANGFLOW_API_KEY = process.env.LANGFLOW_API_KEY || ''
const INDEX_NAME = process.env.INDEX_NAME || 'rag_demo'
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, session_id } = body
    
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Call Langflow API
    const langflowPayload = {
      output_type: 'chat',
      input_type: 'chat',
      input_value: message,
      session_id: session_id || uuidv4(),
    }

    // Build headers - include API key if provided
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    // Note: Langflow v1.5+ requires authentication
    // Either set LANGFLOW_API_KEY or run Langflow with LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true
    if (LANGFLOW_API_KEY) {
      headers['x-api-key'] = LANGFLOW_API_KEY
    }

    const langflowResponse = await fetch(
      `${LANGFLOW_URL}/api/v1/run/${LANGFLOW_FLOW_ID}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(langflowPayload),
      }
    )

    // Get response as text first to check for HTML errors
    const responseText = await langflowResponse.text()
    const trimmed = responseText.trim()
    const isHtml = trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')

    // Check if response is HTML (e.g. login/UI page – usually means auth required or wrong URL)
    if (isHtml) {
      console.error('Langflow returned HTML (expected JSON). Status:', langflowResponse.status, trimmed.substring(0, 150))
      const authHint =
        !LANGFLOW_API_KEY
          ? ' Langflow 1.5+ requires an API key: add LANGFLOW_API_KEY to frontend/.env.local (create one in Langflow: Settings → API Keys). Or run Langflow with LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true for local dev without auth.'
          : ' Check that LANGFLOW_API_KEY is valid and LANGFLOW_FLOW_ID matches your flow in the Langflow UI.'
      return NextResponse.json(
        {
          error:
            'Langflow returned a page instead of JSON.' +
            authHint +
            ' Also ensure LANGFLOW_URL is the base URL (e.g. http://localhost:7860) and the flow is built and running.',
        },
        { status: 502 }
      )
    }

    if (!langflowResponse.ok) {
      console.error('Langflow error:', responseText)
      
      // Try to parse error message
      try {
        const errorData = JSON.parse(responseText)
        const errorMsg = errorData.detail || errorData.message || errorData.error || 'Unknown error'
        return NextResponse.json(
          { error: `Langflow error: ${errorMsg}` },
          { status: langflowResponse.status }
        )
      } catch {
        return NextResponse.json(
          { error: `Langflow API error: ${langflowResponse.status}` },
          { status: langflowResponse.status }
        )
      }
    }

    // Parse JSON response
    let langflowData
    try {
      langflowData = JSON.parse(responseText)
    } catch (e) {
      console.error('Failed to parse Langflow response:', responseText.substring(0, 500))
      return NextResponse.json(
        { error: 'Invalid JSON response from Langflow' },
        { status: 502 }
      )
    }
    // Extract answer from Langflow response
    // The response structure may vary - handle common patterns
    let answer = ''
    
    if (langflowData.outputs) {
      // Handle array of outputs
      for (const output of langflowData.outputs) {
        if (output.outputs) {
          for (const innerOutput of output.outputs) {
            if (innerOutput.results?.message?.text) {
              answer = innerOutput.results.message.text
            } else if (innerOutput.results?.text) {
              answer = innerOutput.results.text
            } else if (innerOutput.message?.text) {
              answer = innerOutput.message.text
            }
          }
        }
      }
    } else if (langflowData.result) {
      answer = typeof langflowData.result === 'string' 
        ? langflowData.result 
        : langflowData.result.text || JSON.stringify(langflowData.result)
    } else if (langflowData.text) {
      answer = langflowData.text
    }

    if (!answer) {
      answer = 'No response received from the RAG system.'
    }

    // Hybrid search query representation
    const hybridQueryExample = {
      "description": "Langflow Hybrid Search Pipeline",
      "components": {
        "1_embedding": {
          "model": OPENAI_EMBEDDING_MODEL,
          "input": message
        },
        "2_vector_search": {
          "type": "knn",
          "field": "vector_field",
          "k": 10
        },
        "3_bm25_search": {
          "type": "keyword",
          "fields": ["text", "keywords"],
          "query": "extracted from question"
        },
        "4_hybrid_fusion": {
          "method": "reciprocal_rank_fusion",
          "weights": { "vector": 0.5, "bm25": 0.5 }
        }
      }
    }

    // Search info for hybrid mode (informational; retrieval happens inside Langflow)
    const searchInfo = {
      type: 'Hybrid Search (BM25 + Vector)',
      orchestrator: 'Langflow',
      index: INDEX_NAME,
      note: 'Retrieved documents handled by Langflow internally',
      query: JSON.stringify(hybridQueryExample, null, 2),
    }

    // Return response
    return NextResponse.json({
      answer,
      session_id: session_id || langflowPayload.session_id,
      search_type: 'hybrid',
      search_info: searchInfo,
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

