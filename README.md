# RAG with Unstructured.io + Langflow + Watsonx.data OpenSearch

## Why this demo

This repo shows how to build a **RAG assistant** that answers from your own documents, with a clear split between **ingestion**, **retrieval**, and **generation**. You get a ready-to-use chat UI so you can try hybrid search and see why combining keyword (BM25) and semantic (vector) search improves answer quality and reduces hallucinations.

**What we use**

- **Unstructured.io** — Parse PDFs, HTML, and other docs; chunk and embed; write to OpenSearch. Keeps ingestion consistent and traceable.
- **OpenSearch (e.g. watsonx.data)** — Single store for chunk text, metadata, and embeddings; supports both BM25 and kNN so Langflow can run hybrid search.
- **Langflow** — Orchestrates retrieval (BM25 + vector) and optional LLM-generated keyword queries, then calls the LLM for the final answer.
- **Chat UI (this repo)** — Simple interface to ask questions and inspect answers; configurable for OpenAI or watsonx.ai.

**Business value**

- **Better answers** — Hybrid search surfaces the right chunks (exact terms + semantic meaning), so the LLM is grounded in relevant context.
- **Easier to run** — Managed OpenSearch and a visual Langflow flow mean less custom code and easier changes (e.g. swap LLM or embedding model).
- **One place to demo** — One UI to validate pipelines, compare models, and show stakeholders before you scale.

## Why Unstructured.io

Unstructured.io is used for ingestion because it makes your RAG system **more accurate and easier to maintain**:

- **Better text extraction**: reliably turns PDFs/HTML/documents into clean text (including tricky layouts).
- **Consistent chunking**: produces predictable chunks that improve retrieval quality and reduce hallucinations.
- **Rich metadata**: preserves source info (filename, page number, S3 URI, etc.) for traceability and debugging.
- **Embeddings included**: can generate and store embeddings during ingestion, so retrieval is ready immediately.

## Why hybrid search

Hybrid search generally beats "BM25 only" or "vector only" because it captures both:

- **Exact matching** (BM25): product IDs, account names, country names, fees, limits, acronyms.
- **Semantic matching** (vectors): paraphrases, synonyms, and "same intent, different wording".

For support/chatbots, this typically means:

- **Higher answer accuracy** (fewer irrelevant chunks)
- **Lower hallucinations** (better grounding)
- **Better recall** for user phrasing variance

![Hybrid Semantic Search Demo](data/semantic_hybrid.gif)

The GIF shows how hybrid search (BM25 + semantic vectors) outperforms pure similarity search in OpenSearch. When asked "What is the current APR for personal loan?", similarity search only finds chunks about business loan and car loan APRs, missing the correct answer. Hybrid search uses keywords like "APR personal loan," so the relevant "personal loan" APR chunk is ranked at the top. This means your business delivers faster, more accurate answers on the first try which is critical for customer trust.

## Why Langflow (for retrieval)

Langflow is used for retrieval orchestration so you can **combine OpenSearch vector and BM25 in one visual flow**, optionally with an LLM to generate the BM25 query from the user question, without writing all the glue code. OpenSearch remains the source of truth for the index and the search.

## Recency boosting with OpenSearch

OpenSearch supports **boosting** so you can favor recent documents. For questions like "What is the **current** APR?" or "What is the **latest** policy?", you can boost by a date field (e.g. `metadata.last_updated`) so the most up-to-date records rank higher. This is a reason to use OpenSearch for RAG when "current" and "latest" matter.

## Architecture (high level)

1. **Unstructured ingestion (outside repo)**  
   - Parses PDFs/HTML/etc
   - Produces clean chunk text + rich metadata
   - Creates embeddings and stores documents into OpenSearch (example fields: `text`, `metadata`, `embeddings`)

2. **Langflow retrieval (hybrid)**  
   - Vector retrieval: similarity over your embeddings (semantic)
   - BM25 retrieval: keyword match over the chunk `text` field (lexical)
   - Optional dynamic BM25 query generation via an LLM prompt (described below)

3. **Chat UI (this repo)**  
   - Sends user questions to Langflow (`/api/chat`)
   - Displays answers + optional search debug info
   - Includes an optional `/api/semantic` route that does direct OpenSearch kNN + OpenAI (useful for comparing against Hybrid Search)

---

## Getting Started

This section is for people who are new to the project. You will clone the repo, run a setup script, then start the chat UI.

**Prerequisites**

- A **terminal** (command line)
- **Python 3** and **Node.js** (the setup script can check and suggest installs)
- A **managed OpenSearch** cluster (e.g. watsonx.data) that the Unstructured.io pipeline can reach—local Docker OpenSearch is not supported
- Access to **Unstructured.io** (for ingestion) and **Langflow** (run locally or elsewhere)

> **▶ Setup steps (follow in order)**  
> 1. **Clone** the repo (below).  
> 2. **Choose your path**: **Quick setup** (run `./setup.sh`) or **Manual setup** (configure env and index yourself).  
> 3. **Common steps**: Unstructured ingestion → Langflow flow import → run the chat UI.  
>  
> Full details for each step are in the sections below. Start with **1. Clone**, then **2. Choose your path**.  
> **Tip:** The config file is `frontend/.env.local` (name starts with a dot). In file browsers it may be hidden—enable **Show hidden files** to find it.

### 1. Clone or Download the Repository

**Option A: Clone with Git**

If you have Git installed, open a terminal and run (replace with your repo URL if different):

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

**Option B: Download ZIP**

If you do not use Git:

1. On GitHub, click the green **Code** button at the top of this repository.
2. Choose **Download ZIP**.
3. Save and extract the ZIP to a folder on your computer.
4. Open a terminal, go to that folder, for example:
   ```bash
   cd path/to/extracted/folder
   ```

### 2. Choose your path

Pick one: **Quick setup** (script does env, index, Langflow install) or **Manual setup** (you configure env and create the index yourself). Both paths then share the same **Common steps** (Unstructured.io flow, Langflow flow import, run the UI).

> **Quick setup (recommended)** — Run the script; it sets up env, index, and Langflow. Then do the Common steps below.

---

#### Path A: Quick setup (recommended)

From the repository root (the folder that contains `setup.sh`), run:

```bash
chmod +x setup.sh
./setup.sh
```

**What the script does:** Checks Python and Node.js (and can try to install them), creates `frontend/.env.local` and prompts for your OpenSearch URL and credentials, creates the OpenSearch index (with embedding dimension you choose), installs a Python venv and Langflow, then prompts you to complete Unstructured ingestion and Langflow flow import and asks for Langflow URL, Flow ID, and **API key** (create one in Langflow: Settings → API Keys). Finally it runs `npm install` in the frontend. Use a **managed OpenSearch** cluster (e.g. watsonx.data); the Unstructured.io pipeline does not support local Docker OpenSearch.

When the script finishes, go to **[Common steps (both paths)](#3-common-steps-both-paths)** below to complete Unstructured.io flow preparation, Langflow flow import, and run the UI.

> **Manual setup** — Configure `frontend/.env.local` and create the OpenSearch index yourself. Then do the Common steps below.

---

#### Path B: Manual setup

If you prefer to set up without the script:

1. **Configuration (one env file)**  
   This project uses a single env file: **`frontend/.env.local`**. (The name starts with a dot, so it may be hidden in file browsers—enable **Show hidden files** to see it.) Copy `frontend/env-example.txt` to `frontend/.env.local` and set:

   - **OPENSEARCH_URL**, **OPENSEARCH_USERNAME**, **OPENSEARCH_PASSWORD**, **INDEX_NAME** (example: `rag_demo`)
   - **OPENAI_API_KEY** — if your Langflow flow uses OpenAI
   - **WATSONX_API_KEY**, **WATSONX_PROJECT_ID**, **WATSONX_URL** (optional) — if your flow uses watsonx.ai
   - **LANGFLOW_URL**, **LANGFLOW_FLOW_ID**, **LANGFLOW_API_KEY** — set these after you have Langflow and the flow (or use the script later). Create the API key in Langflow: **Settings → API Keys**.

2. **Step 0: Create the OpenSearch index**  
   Before ingesting with Unstructured, pre-create the index with a `knn_vector` field whose **dimension** matches the embedding model you will use in the Unstructured UI:

   - **OpenAI** `text-embedding-3-small`: dimension **1536**
   - **watsonx.ai**: **384**, **768**, or **1024** depending on model (e.g. Slate 125m English Rtrvr V2: 768)

   In OpenSearch Dev Tools (or API), run (replace `rag_demo` with your `INDEX_NAME` if different):

   ```json
   DELETE rag_demo

   PUT rag_demo
   {
     "settings": {
       "index": {
         "knn": true,
         "knn.algo_param.ef_search": 100
       }
     },
     "mappings": {
       "dynamic": true,
       "properties": {
         "element_id": { "type": "keyword" },
         "record_id": { "type": "keyword" },
         "text": { "type": "text" },
         "type": {
           "type": "text",
           "fields": { "keyword": { "type": "keyword", "ignore_above": 256 } }
         },
         "embeddings": {
           "type": "knn_vector",
           "dimension": 1536,
           "method": {
             "name": "hnsw",
             "space_type": "cosinesimil",
             "engine": "lucene"
           }
         },
         "metadata": {
           "type": "object",
           "dynamic": true,
           "enabled": true
         }
       }
     }
   }
   ```

   Change `dimension` to 384, 768, or 1024 if you use watsonx embeddings.

Then go to **[Common steps (both paths)](#3-common-steps-both-paths)** below.

> **Common steps (everyone)** — Unstructured ingestion → Langflow flow import → set LANGFLOW_URL/Flow ID → run the chat UI. Required whether you used Quick or Manual setup.

---

### 3. Common steps (both paths)

Everyone must do these steps whether you used **Path A (Quick)** or **Path B (Manual)**.

1. **Unstructured.io flow preparation**  
   Create a pipeline in the Unstructured UI: source → partition → chunk → embed → **OpenSearch destination**. Use the same **OPENSEARCH_URL**, index name, and credentials as in `frontend/.env.local`. Choose an embedding model whose **dimension** matches the index you created (1536 for OpenAI, or 384/768/1024 for watsonx). Run ingestion so documents with `text` and `embeddings` are in the index.  
   Details: [Step 1: Ingest with Unstructured UI](#step-1-ingest-with-unstructured-ui-required).

2. **Langflow flow import and configuration**  
   Start Langflow (if you used Path A, the script already asked you to run it in another terminal). In the Langflow UI (http://localhost:7860), import the flow from **`Support Hybrid Search.json`**. In the flow, set the **OpenSearch** component to your cluster URL, index name, and credentials (same as in `.env.local`). In Langflow **Settings → Global Variables**, add **OPENAI_API_KEY** and/or **WATSONX_API_KEY**, **WATSONX_PROJECT_ID** (and optionally **WATSONX_URL**). Create an **API key** in **Settings → API Keys**; you will add it to `.env.local` as **LANGFLOW_API_KEY**. Save the flow and note the **Flow ID**.  
   Details: [Langflow: hybrid retrieval setup](#langflow-hybrid-retrieval-setup).

3. **Langflow URL, Flow ID, and API key in .env.local**  
   Set **LANGFLOW_URL** (e.g. `http://localhost:7860`), **LANGFLOW_FLOW_ID** (the Flow ID from the Langflow UI), and **LANGFLOW_API_KEY** (from Langflow Settings → API Keys) in `frontend/.env.local`. If you used **Path A**, the script prompts for these in Step 6 and writes them when you enter them; if you skipped that or used **Path B**, add them manually.

4. **Run the chat UI**  
   From the repo root:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:3000. Keep Langflow running in the other terminal.

## Step 1: Ingest with Unstructured UI (required)

Use Unstructured’s UI pipeline to parse, chunk, embed, and write documents into OpenSearch.

![Unstructured.io Ingestion](data/unstructured_ingestion.gif)

1. **Create a new pipeline**
2. **Source**
   - Choose your source (S3, local upload, etc.)
   - Add a test document to validate the pipeline
3. **Partitioner**
   - Start with `fast` (or use a higher-quality strategy if needed)
4. **Chunker**
   - Chunk by character (or your preferred strategy)
   - Keep chunk sizes consistent with your retrieval needs (typical: ~500–1500 chars)
5. **Embedder**
   - Select your embedding provider/model (e.g., OpenAI `text-embedding-3-small`)
   - **Important**: make sure the model’s embedding dimension matches the OpenSearch mapping (`embeddings.dimension`)
6. **Destination (OpenSearch)**
   - Set the managed `OPENSEARCH_URL`
   - Set credentials (`OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD`)
   - Set index: `rag_demo`
7. **Run ingestion**
   - Run the pipeline and confirm documents appear in OpenSearch

After ingestion, verify you have both `text` and `embeddings` populated:

```json
GET rag_demo/_search
{"size": 1, "_source": ["text", "embeddings", "metadata"], "query": {"match_all": {}}}
```

## Optional: Using S3 as your Unstructured source

If you want ingestion to pull documents from S3 (recommended for repeatable ingestion and team workflows), you can upload the sample PDFs under `data/bank_docs/` into an S3 bucket and point the Unstructured **Source** connector at that bucket/folder.

### Recommended S3 layout (extensible)

Use a simple folder structure so you can expand later:

- `s3://<my-bucket>/bank_docs/` (sample PDFs from `data/bank_docs/`)

### Create an S3 bucket (AWS Console)

1. Log in to the AWS Management Console.
2. Open the S3 console.
3. Click **Create bucket**.
4. Pick a **globally unique** bucket name and region.
5. Keep defaults unless your org requires specific policies (encryption, public access block, etc.).
6. Click **Create bucket**.

### Upload files (AWS Console)

1. Open your bucket.
2. (Optional) Click **Create folder** → `bank_docs`.
3. Open the `bank_docs/` folder.
4. Click **Upload** → add the PDFs from `data/bank_docs/` → **Upload**.

### Find the bucket URI (S3 URI)

To start from the bucket root:
- `s3://<my-bucket>/`

To start from a folder inside the bucket:
1. In the S3 console, open your bucket.
2. Check the box next to the folder you want (e.g., `bank_docs/`).
3. Click **Copy S3 URI**.
4. Paste that value into the Unstructured Source connector’s **Bucket URI** field.

### Create an AWS access key + secret key (IAM)

If the Unstructured connector needs credentials, create an IAM access key:

1. Log in to the AWS Management Console.
2. Open the IAM console.
3. In the sidebar, click **Users**.
4. Click your user’s name.
5. Click the **Security credentials** tab.
6. Click **Create access key**.  
   - If you already have two access keys, delete one first (AWS limit).
7. Select **Other** → **Next** → **Create access key**.
8. Copy:
   - **Access key ID** → Unstructured Source connector **AWS Key**
   - **Secret access key** → Unstructured Source connector **AWS Secret Key**

Important: Save the secret in a secure location. You can’t retrieve it again after leaving the screen.

## Running the UI (manual)

```bash
cd frontend
npm install
cp env-example.txt .env.local
# Edit .env.local with your LANGFLOW_URL, LANGFLOW_FLOW_ID, etc. (do not commit .env or .env.local)
npm run dev
```

Open `http://localhost:3000`. All config is read from `frontend/.env.local` only.

## Langflow: hybrid retrieval setup

Your Langflow flow should be configured as follows.

### OpenSearch component

- **Cluster**: `OPENSEARCH_URL`
- **Index**: `INDEX_NAME` (example: `rag_demo`)
- **Vector field**: `embeddings` (or your ingestion’s actual embedding field)

### Global API keys (OpenAI and watsonx)

The flow uses **OpenAI** and/or **watsonx.ai** for the Language Model (and optionally embeddings). Define these in Langflow so the flow can use them:

1. In the Langflow UI, open **Settings** (gear icon in the left sidebar).
2. Go to **Global Variables** (or **Variables**).
3. Add the same keys you use in `frontend/.env.local`:
   - **OpenAI**: `OPENAI_API_KEY`
   - **watsonx**: `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, and optionally `WATSONX_URL`

Each Language Model (and Embeddings) component in the flow will use these when configured to use global variables. You do not need to paste API keys into every component.

### Dynamic BM25 query (LLM‑generated)

In hybrid mode, Langflow can combine vector search with an LLM‑generated BM25 query. Use a small/fast LLM to generate the **BM25 portion** on each question.

Paste this prompt into your “keyword extractor” Prompt component:

```
You are a keyword extractor for OpenSearch BM25 search on the LEXORA support knowledge base.

Documents are chunked by Unstructured and stored in OpenSearch index `rag_demo`. The searchable text is in the `text` field.

Task:
- Extract 2–5 important keywords/phrases from the question (no stop words).
- Return ONLY a simple BM25 JSON query that searches ONLY the `text` field.
- Langflow will combine this with vector search for hybrid retrieval.

QUESTION: {question}

OUTPUT (JSON ONLY):
{{
  "query": {{
    "match": {{
      "text": {{
        "query": "<keywords here>",
        "operator": "or"
      }}
    }}
  }},
  "size": 10
}}
```

## Dev Tools snippets (optional)

Replace `rag_demo` if your index differs:

```
GET rag_demo/_search
{"size": 3, "_source": ["text", "metadata.filename"], "query": {"match_all": {}}}

GET rag_demo/_search
{"query": {"match": {"text": "ATM limit Japan"}}}

GET rag_demo/_search
{"size": 1, "_source": ["embeddings"], "query": {"exists": {"field": "embeddings"}}}
```

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Chat shows "Langflow unreachable" or connection error | Langflow must be running. Set **LANGFLOW_API_KEY** in `frontend/.env.local` (create in Langflow: Settings → API Keys). Ensure **LANGFLOW_URL** matches where Langflow is (e.g. `http://localhost:7860`). |
| Chat shows "Langflow returned a page instead of JSON" or "LANGFLOW_API_KEY is not set" | Set **LANGFLOW_API_KEY** in `frontend/.env.local`. Create the key in Langflow: **Settings → API Keys**. Restart the frontend after changing `.env.local`. |
| Wrong or empty answers | Verify **LANGFLOW_FLOW_ID** in `.env.local` is the Flow ID from the Langflow UI (flow name menu or URL). Ensure the flow’s OpenSearch component uses the same index and credentials as your ingestion. |
| OpenSearch errors in Unstructured or Langflow | Check **OPENSEARCH_URL**, **OPENSEARCH_USERNAME**, **OPENSEARCH_PASSWORD**, and **INDEX_NAME** in `.env.local`. Use a managed cluster; ensure the index exists and the embedding dimension matches your model. |
| "OPENSEARCH_URL not configured" in UI | Edit `frontend/.env.local` (enable **Show hidden files** if you don’t see it). Restart the frontend (`npm run dev`) after changing env. |

---

## Solution stack

Summary of the technologies used in this demo.

| Layer | Technology | Role in this demo |
|-------|-------------|-------------------|
| **Chat UI** | **Next.js 14** (React, TypeScript) | App router, API routes (`/api/chat`, `/api/semantic`), server-side env. |
| **Chat UI** | **Tailwind CSS** | Styling and layout. |
| **Chat UI** | **OpenSearch JS client** (`@opensearch-project/opensearch`) | Used by `/api/semantic` for direct kNN search; chat route calls Langflow only. |
| **Chat UI** | **OpenAI SDK** | Optional: used by `/api/semantic` for embeddings when comparing to hybrid search. |
| **Retrieval & generation** | **Langflow** (Python) | Visual flow: hybrid search (BM25 + vector) on OpenSearch, then LLM (OpenAI or watsonx.ai) to generate the answer. |
| **Retrieval & generation** | **OpenSearch** (e.g. watsonx.data) | Single store for chunks, metadata, and embeddings; BM25 and kNN in one index. |
| **Ingestion** | **Unstructured.io** (outside this repo) | Parse documents, chunk, embed, and write to OpenSearch. |
| **LLMs & embeddings** | **OpenAI** and/or **watsonx.ai** | Configured in Langflow (and in `.env.local` for the UI); used for generation and optionally for embeddings in Unstructured. |

**In short:** The UI is a **Next.js** app that talks to **Langflow** for RAG; Langflow uses **OpenSearch** for hybrid search and an **LLM** for answers. Documents are prepared and loaded into OpenSearch via **Unstructured.io** (run separately).

