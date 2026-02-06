#!/usr/bin/env bash
# =============================================================================
# RAG Chat UI – Beginner setup script
# =============================================================================
# This script helps you:
#   1. Check Python and Node.js (with install hints if missing)
#   2. Check OpenSearch reachability and prompt you to set OPENSEARCH_* in .env.local (use a managed cluster; Unstructured.io does not support local Docker OpenSearch)
#   3. Create frontend/.env.local and prompt you to fill it (except Langflow)
#   3b. Create the OpenSearch index (managed cluster) with knn_vector mapping
#   4. Install Langflow locally and guide you to run it
#   5. Guide you through document ingestion (Unstructured.io) and importing
#      the Langflow flow, then ask for Langflow URL and Flow ID
#   6. Install the frontend and finish
#
# Usage: ./setup.sh
# =============================================================================

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"
ENV_LOCAL="$REPO_ROOT/frontend/.env.local"
ENV_EXAMPLE="$REPO_ROOT/frontend/env-example.txt"

echo ""
echo "=============================================="
echo "  RAG Chat UI – Setup"
echo "=============================================="
echo ""

# -----------------------------------------------------------------------------
# 1. Check Python and Node.js (try to install if missing)
# -----------------------------------------------------------------------------
check_deps() {
  local missing=()
  command -v python3 &>/dev/null || missing+=(python3)
  command -v node &>/dev/null || missing+=(node)
  command -v npm &>/dev/null || missing+=(npm)
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Missing: ${missing[*]}"
    return 1
  fi
  echo "  Python:  $(python3 --version)"
  echo "  Node:    $(node --version)"
  echo "  npm:     $(npm --version)"
  return 0
}

print_install_commands() {
  echo "Install them manually, then run this script again:"
  echo ""
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "  macOS (Homebrew):"
    echo "    brew install python node"
    echo ""
  elif [[ -f /etc/debian_version ]] || command -v apt-get &>/dev/null; then
    echo "  Debian/Ubuntu:"
    echo "    sudo apt-get update"
    echo "    sudo apt-get install -y python3 python3-pip python3-venv nodejs npm"
    echo ""
  elif [[ -f /etc/redhat-release ]] || command -v dnf &>/dev/null; then
    echo "  Fedora/RHEL:"
    echo "    sudo dnf install -y python3 python3-pip nodejs npm"
    echo ""
  else
    echo "  Install Python 3 and Node.js from https://python.org and https://nodejs.org"
    echo ""
  fi
}

try_install_deps() {
  local ok=0
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if command -v brew &>/dev/null; then
      echo "  Running: brew install python node"
      if brew install python node; then
        ok=1
      else
        echo "  brew install failed."
      fi
    else
      echo "  Homebrew not found. Install from https://brew.sh or use the commands below."
    fi
  elif [[ -f /etc/debian_version ]] || command -v apt-get &>/dev/null; then
    echo "  Running: sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv nodejs npm"
    if sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv nodejs npm; then
      ok=1
    else
      echo "  apt-get install failed."
    fi
  elif [[ -f /etc/redhat-release ]] || command -v dnf &>/dev/null; then
    echo "  Running: sudo dnf install -y python3 python3-pip nodejs npm"
    if sudo dnf install -y python3 python3-pip nodejs npm; then
      ok=1
    else
      echo "  dnf install failed."
    fi
  else
    echo "  No supported package manager (brew, apt-get, dnf). Use the commands below."
  fi
  return $((1 - ok))
}

echo "Step 1: Checking Python and Node.js..."
if ! check_deps; then
  echo ""
  read -p "Try to install missing dependencies now? [Y/n] " try_install
  if [[ "$try_install" =~ ^[nN] ]]; then
    print_install_commands
    exit 1
  fi
  echo ""
  if ! try_install_deps; then
    echo ""
    print_install_commands
    exit 1
  fi
  echo ""
  echo "  Rechecking..."
  if ! check_deps; then
    echo ""
    print_install_commands
    exit 1
  fi
fi
echo ""

# -----------------------------------------------------------------------------
# 2. OpenSearch (managed cluster required; Unstructured.io does not support local Docker)
# -----------------------------------------------------------------------------
echo "Step 2: OpenSearch"
echo "  Use a managed OpenSearch cluster (e.g. watsonx.data). Set OPENSEARCH_URL and credentials in frontend/.env.local (Step 3)."
echo ""

# -----------------------------------------------------------------------------
# 3. Create frontend/.env.local from example (if missing)
# -----------------------------------------------------------------------------
echo "Step 3: Environment file (frontend/.env.local)"
if [[ ! -f "$ENV_LOCAL" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_LOCAL"
  echo "  Created frontend/.env.local from env-example.txt"
else
  echo "  frontend/.env.local already exists (left unchanged)"
fi
echo ""
echo "  Fill in your values in frontend/.env.local (required for chat to work):"
echo "  1. OpenSearch: set OPENSEARCH_URL, OPENSEARCH_USERNAME, OPENSEARCH_PASSWORD, and INDEX_NAME (the index name to create in Step 3b; use a managed cluster)."
echo "  2. If your cluster uses a self-signed or expired TLS cert, add: OPENSEARCH_SSL_VERIFY=false (dev only; avoids 'certificate has expired' in the chat UI)."
echo "  3. Optional: OPENAI_API_KEY, watsonx vars (see file for names)"
echo "  4. LANGFLOW_URL, LANGFLOW_FLOW_ID, and LANGFLOW_API_KEY will be set in Step 6 (do not add them yet)."
echo ""
if [[ -n "$EDITOR" ]]; then
  read -p "  Open frontend/.env.local in your editor now? [y/N] " open_env
  if [[ "$open_env" =~ ^[yY] ]]; then
    "$EDITOR" "$ENV_LOCAL"
  fi
else
  echo "  Edit the file manually: $ENV_LOCAL"
fi
read -p "Press Enter when you are done editing (or to skip)..."
echo ""

# -----------------------------------------------------------------------------
# 3b. OpenSearch index (created in Step 7 using same connection as the app)
# -----------------------------------------------------------------------------
echo "Step 3b: OpenSearch index"
read_env_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_LOCAL" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true
}
OS_INDEX=$(read_env_var INDEX_NAME)
if [[ -z "$OS_INDEX" ]]; then
  echo "  INDEX_NAME is not set in frontend/.env.local (use the same name your app and semantic tab will use)."
  read -p "  Enter index name (will be written to .env.local) [rag_demo]: " entered_index
  OS_INDEX="${entered_index:-rag_demo}"
  echo "" >> "$ENV_LOCAL"
  echo "# OpenSearch index (used by setup and the app)" >> "$ENV_LOCAL"
  echo "INDEX_NAME=$OS_INDEX" >> "$ENV_LOCAL"
  echo "  Added INDEX_NAME=$OS_INDEX to frontend/.env.local"
fi
echo "  Index \"$OS_INDEX\" will be created in Step 7 using the same connection as the semantic tab (no curl; avoids 503 on some managed clusters)."
echo ""

# -----------------------------------------------------------------------------
# 4. Python venv and Langflow
# -----------------------------------------------------------------------------
VENV_DIR="$REPO_ROOT/.venv"
echo "Step 4: Python virtual environment and Langflow"
if [[ ! -d "$VENV_DIR" ]]; then
  echo "  Creating virtual environment at .venv (this may take a moment)..."
  python3 -m venv "$VENV_DIR"
  echo "  Created virtual environment at .venv"
fi
# Activate venv for the rest of the script (same shell)
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
echo "  Upgrading pip..."
pip install -q --upgrade pip
echo "  Installing Python dependencies from requirements.txt..."
pip install -r "$REPO_ROOT/requirements.txt"
echo "  Installing Langflow..."
pip install langflow
echo "  Done. Dependencies and Langflow are installed."
echo ""
echo "  Start Langflow in a separate terminal (leave it running), e.g.:"
echo ""
echo "    cd $REPO_ROOT && source $VENV_DIR/bin/activate && langflow run"
echo ""
echo "  Then open http://localhost:7860 in your browser."
echo "  Create an API key: Langflow UI → Settings (gear) → API Keys. You will enter it in Step 6."
echo ""
read -p "Press Enter when Langflow is running and you have opened http://localhost:7860..."
echo ""

# -----------------------------------------------------------------------------
# 5. Document ingestion and Langflow flow import
# -----------------------------------------------------------------------------
FLOW_JSON="$REPO_ROOT/Support Hybrid Search.json"
echo "Step 5: Document ingestion and Langflow flow"
echo ""
echo "  (A) Document ingestion with Unstructured.io"
echo "      - Use the Unstructured UI to create a pipeline: source → partition → chunk → embed → OpenSearch."
echo "      - Set the OpenSearch destination to the same URL, index, and credentials as in frontend/.env.local."
echo "      - Run ingestion so your index (e.g. rag_demo) has documents with 'text' and 'embeddings'."
echo "      - See README.md for details and index mapping (dimension must match your embedding model)."
echo ""
echo "  (B) Import the hybrid search flow in Langflow"
echo "      1. In the Langflow UI (http://localhost:7860), click the menu (≡ or ⋮) and choose"
echo "         'Import' or 'Load flow from file'."
echo "      2. Select this file: $FLOW_JSON"
echo "      3. In the flow, open each OpenSearch component and set: cluster URL, index name,"
echo "         username, password (same as in frontend/.env.local)."
echo "      4. Set global API keys so the flow can use OpenAI and/or watsonx:"
echo "         Langflow UI → Settings (gear) → Global Variables (or Variables)."
echo "         Add the same keys as in frontend/.env.local, e.g.:"
echo "         - OpenAI: OPENAI_API_KEY"
echo "         - watsonx: WATSONX_API_KEY, WATSONX_PROJECT_ID, WATSONX_URL (optional)"
echo "         Each Language Model component will use these if configured to use globals."
echo "      5. Save the flow (Ctrl+S or Save button)."
echo "      6. Note the Flow ID — you will need it in the next step (see below)."
echo ""
read -p "Press Enter when ingestion is done and the flow is imported and saved..."
echo ""

# -----------------------------------------------------------------------------
# 6. Langflow URL and Flow ID → update .env.local
# -----------------------------------------------------------------------------
echo "Step 6: Langflow URL, Flow ID, and API key"
echo ""
echo "  --- How to find the Flow ID in Langflow ---"
echo "  1. Open your flow in the Langflow UI (http://localhost:7860)."
echo "  2. Click the flow name at the top, or the menu (⋮) next to it."
echo "  3. Look for 'API' or 'Flow ID' in the sidebar or in the flow settings."
echo "  4. Or check the browser URL when the flow is open: it often looks like"
echo "     .../flow/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX — that UUID is the Flow ID."
echo ""
echo "  --- API key: create in Langflow → Settings (gear) → API Keys ---"
echo ""
default_url="http://localhost:7860"
read -p "  LANGFLOW_URL [$default_url]: " langflow_url
langflow_url="${langflow_url:-$default_url}"
read -p "  LANGFLOW_FLOW_ID (paste the Flow ID from Langflow): " langflow_flow_id
if [[ -z "$langflow_flow_id" ]]; then
  echo "  Warning: LANGFLOW_FLOW_ID is empty. Add it later to frontend/.env.local or the chat will not work."
fi
read -p "  LANGFLOW_API_KEY (paste the API key from Langflow Settings → API Keys): " langflow_api_key
if [[ -z "$langflow_api_key" ]]; then
  echo "  Warning: LANGFLOW_API_KEY is empty. Add it later to frontend/.env.local or the chat will not work."
fi
# Ensure no trailing slash
langflow_url="${langflow_url%/}"

# Update or append LANGFLOW_* in .env.local
if [[ -f "$ENV_LOCAL" ]]; then
  tmp_env=$(mktemp)
  grep -v '^LANGFLOW_URL=' "$ENV_LOCAL" | grep -v '^LANGFLOW_FLOW_ID=' | grep -v '^LANGFLOW_API_KEY=' | grep -v '^# No API key needed if you start Langflow' | grep -v '^# (If you run Langflow' > "$tmp_env" || true
  echo "" >> "$tmp_env"
  echo "# Langflow (required for chat) — create API key in Langflow: Settings → API Keys" >> "$tmp_env"
  echo "LANGFLOW_URL=$langflow_url" >> "$tmp_env"
  echo "LANGFLOW_FLOW_ID=$langflow_flow_id" >> "$tmp_env"
  echo "LANGFLOW_API_KEY=$langflow_api_key" >> "$tmp_env"
  mv "$tmp_env" "$ENV_LOCAL"
  echo "  Updated frontend/.env.local with LANGFLOW_URL, LANGFLOW_FLOW_ID, and LANGFLOW_API_KEY"
fi
echo ""

# -----------------------------------------------------------------------------
# 7. Frontend install
# -----------------------------------------------------------------------------
echo "Step 7: Frontend dependencies"
cd "$REPO_ROOT/frontend"
npm install
echo "  npm install finished"
echo ""
# Create OpenSearch index using the same client and .env.local as the semantic tab (avoids 503 from curl on managed clusters)
if [[ -f "$ENV_LOCAL" ]] && grep -q "^OPENSEARCH_URL=" "$ENV_LOCAL" 2>/dev/null; then
  echo "  Creating OpenSearch index (same connection as the semantic tab)..."
  if NODE_ENV=development node scripts/create-opensearch-index.js; then
    echo "  Index ready."
  else
    echo "  Index creation failed or skipped. You can run later: cd frontend && node scripts/create-opensearch-index.js"
  fi
  echo ""
fi

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo "=============================================="
echo "  Setup complete"
echo "=============================================="
echo ""
echo "  Reminders:"
echo "  - Keep Langflow running (in the other terminal) while using the UI."
echo "  - LANGFLOW_API_KEY is required; create it in Langflow: Settings → API Keys."
echo ""
read -p "Start the frontend now? [Y/n] " start_frontend
if [[ ! "$start_frontend" =~ ^[nN] ]]; then
  echo ""
  echo "  Starting frontend at http://localhost:3000 (Ctrl+C to stop)"
  echo ""
  exec npm run dev
else
  echo ""
  echo "  To run the chat UI later:"
  echo "    cd frontend"
  echo "    npm run dev"
  echo ""
  echo "  Then open http://localhost:3000"
  echo ""
fi
