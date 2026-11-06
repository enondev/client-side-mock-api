# Client-Side Mock OpenAI-Compatible API

OpenAI-compatible API simulation backed by LocalStorage that functions entirely within a static website environment.

---

## Endpoints

* **POST**: `/v1/chat/endpoints`
* **GET**: `/v1/models`
* **DELETE**: `/v1/models/{model}`

---

## Design Patterns

**Repository**

An interface for getting domain specific entities from the data access layer.

```JavaScript
export const ModelRepository = {
  _STORAGE_KEY: "mock_models",

  // Core Internal Engine (Easily swappable)
  _read() {
    const data = localStorage.getItem(this._STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  _write(data) {
    localStorage.setItem(this._STORAGE_KEY, JSON.stringify(data));
  },

  // Pure, Browser-Agnostic Public Methods (save is intentionally omitted)
  findAll() {
    return this._read();
  },

  findById(id) {
    return this._read().find(model => model.id === id);
  },

  deleteById(id) {
    const data = this._read();
    const updated = data.filter(model => model.id !== id);
    this._write(updated);
    return true;
  },

  // QA Hook: Easily seed data from automation test scripts
  seed(initialDataArray) {
    this._write(initialDataArray);
  }
};
```

**Rate Limiter / Throttling**

Explicitly limiting the number of actions allowed within a specific time window to prevent resource starvation.

```JavaScript
const rate_limit = 60;
const tpm_limit = 20000;
let current_timestamp = GetCurrentTime();

clean_timestamp_window(current_timestamp - rate_limit);
if (rate_limit_window_tokens.length >= tpm_limit) {
  return {"status": 429, "type": "rate_limit_exceeded"}
}
record_timestamp(current_timestamp)
```

**Bulkhead**

Partitioning resources such as thread pools, connection pools, or service instances, so that problems such as latency, resource exhaustion or crashes in one partition don't impact the whole system.

```JavaScript
const max_allowed_connections = 10;
```

**Circuit Breaker**

If a downstream system fails or gets overloaded, the Circuit Breaker "trips" and immediately returns an error without wasting time trying to connect to the broken service.

```JavaScript
if (active_connections >= max_allowed_connections) {
  return {"status": 503, "message": "server_unavailable"}
}
```

---

## QA Tests

#### 1. Happy Path Testing (Functional Verification)

* `TC-001: List available models`: Verify GET /v1/models populates a UI dropdown with active objects, matching the exact number of nodes found in localStorage.
* `TC-002: POST request to /v1/chat/completions`: Send a properly structured chat payload to POST /v1/chat/completions and assert that the text block returns a 200 OK along with a valid message string.
* `TC-003: DELETE request to /v1/models/{model}`: Trigger a DELETE request on a user-owned model (ft:gpt-4o...), assert a 200 response object containing deleted: true, and check that it is instantly removed from the UI dropdown list.

#### 2. Negative & Edge-Case Testing (Input Validation)

* `TC-004: Empty Prompt Block`: Send an empty messages: [] array to the chat endpoint and assert that the system correctly catches a 400 Bad Request state.
* `TC-005: The Ghost Model Request`: Submit a chat request targeting a model ID that doesn't exist (or was just deleted) and assert that the API throws a 400 error reading "The model does not exist."
* `TC-006: The Security Block`: Attempt to DELETE a baseline system model like gpt-4o. Assert that the backend throws a 403 Forbidden status code, and that the UI securely displays an access error message.

#### 3. Error Injection & Frontend Resiliency Testing

* `TC-007 The Crash Recovery Test`: Set your mock flag injectServerError = true. Fire a request from the chat UI and verify that the application doesn't crash to a white screen, but instead cleanly displays a standard crash module or error banner.
* `TC-008 The Rate-Limit Graceful Backoff`: Set injectRateLimitError = true. Click the submit button and check if your frontend captures the 429 status code, displays a helpful warning, and temporarily disables the send button.

#### 4. State & Boundary Condition Testing

* `TC-009 Durable State Persistence`: Create a custom model, refresh the browser entirely (simulating an app restart), and use GET /v1/models to verify that your data engine persists the entry inside localStorage.
* `TC-010 The Race Condition / Network Latency Test`: Crank your simulated networkDelay up to 3000ms (3 seconds). Click "Submit" multiple times in rapid succession. Verify that the UI automatically blocks secondary submissions using an internal loading spinner mechanism, preventing duplicate network dispatches.

---

## Adding a New Model

Each model is a self-contained static site implementing the full OpenAI-compatible specification. Use the Python generator to scaffold a new model:

### Prerequisites
- Python 3.8+
- Project cloned locally

### Quick Start

```bash
# From project root
python scripts/generate_model.py \
  --id coder \
  --name coder \
  --profile coder \
  --model openai/gpt-4o \
  --provider openai \
  --color "#6366f1" \
  --description "Senior coder persona — writes clean, tested, maintainable code." \
  --capabilities coding testing refactoring debugging \
  --is-system
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | ✅ | Model ID (kebab-case, used for directory & URLs) |
| `--name` | ✅ | Display name |
| `--profile` | ✅ | Persona type: `architect`, `coder`, `researcher`, etc. |
| `--model` | ✅ | Generating LLM identifier (e.g., `nvidia/nemotron-3-ultra`) |
| `--provider` | ❌ | Provider name (default: `nvidia`) |
| `--color` | ✅ | Hex accent color (e.g., `#6366f1`) |
| `--description` | ✅ | One-line persona description |
| `--capabilities` | ❌ | Space-separated capability tags |
| `--is-system` | ❌ | Flag: system models cannot be deleted via API |

### What Gets Generated

```
public/models/<id>/
├── index.html    # Demo page (chat, API ref, resilience tests)
├── app.js        # Full spec implementation (Repository, patterns, persona logic)
└── style.css     # Themed styling (matches design system)
```

Also updates `public/index.html` → `MODEL_REGISTRY` array.

### Customize Persona Logic

Edit `public/models/<id>/app.js`:

```javascript
// Find generatePersonaResponse() and add your keyword handlers
generatePersonaResponse(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("your-keyword")) {
    return `[${MODEL_ID}] Your specialized response...`;
  }

  return `[${MODEL_ID}] ${prompt} — Default response.`;
}
```

### Verify Locally

```bash
cd public && python -m http.server 8765
# Open http://localhost:8765/models/<id>/
```

Checklist:
- [ ] Page loads without console errors
- [ ] Chat sends/receives messages with persona responses
- [ ] API tabs switch correctly (GET /v1/models, POST /v1/chat/endpoints, DELETE /v1/models/{model})
- [ ] Resilience test buttons work:
  - Rate Limit → 429 after 60 requests
  - Bulkhead → 503 after 10 concurrent
  - Circuit Breaker → 503 after 5 failures
- [ ] localStorage key is `mock_models_<id>` (isolated per model)
- [ ] Root dashboard links to `/models/<id>/`

### Deploy

Push to `master` branch → GitHub Actions deploys `public/` to GitHub Pages automatically.

### File Structure Reference

```
client-side-mock-api/
├── public/
│   ├── index.html              # Root dashboard (auto-updated)
│   ├── openapi-spec.yaml       # Master OpenAPI 3.0.3 spec
│   └── models/
│       ├── architect/          # Reference implementation
│       │   ├── index.html
│       │   ├── app.js
│       │   └── style.css
│       └── <your-model>/       # Your new model
│           ├── index.html
│           ├── app.js
│           └── style.css
├── scripts/
│   ├── generate_model.py       # Scaffold generator
│   └── templates/              # Jinja2-style templates
│       ├── app.js.tmpl
│       ├── style.css.tmpl
│       └── index.html.tmpl
├── AGENTS.md                   # Full generation guide & architecture
└── README.md                   # This file
```

### Design System

All models share the same design system (CSS variables in `style.css`):

| Variable | Purpose | Example |
|----------|---------|---------|
| `--accent` | Primary brand color | `#00d4aa` (architect) |
| `--accent-dim` | 13% opacity backgrounds | Auto-generated |
| `--accent-glow` | 27% opacity glows/borders | Auto-generated |
| `--accent-strong` | 90% opacity hover states | Auto-generated |
| `--font-ui` | UI font | `Space Grotesk` |
| `--font-mono` | Code/data font | `JetBrains Mono` |

Override `--accent` via `--color` flag; variants computed automatically.

### Testing (Python-Only)

```bash
pip install pytest pytest-playwright pyyaml
playwright install --with-deps chromium

pytest tests/ -v --base-url=http://localhost:8765
```

Tests are parameterized by model ID in `MODEL_REGISTRY`.

---

*Generated with [AGENTS.md](AGENTS.md) reproducible process*
