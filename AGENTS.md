# AGENTS.md — Mock OpenAI API Model Generation Guide

## Overview

This document defines the reproducible process for creating new self-contained model implementations in the Mock OpenAI API registry. Each model is a **complete, deployable static site** implementing the full OpenAI-compatible specification.

```
public/
├── index.html                 # Root dashboard (auto-generated from registry)
├── openapi-spec.yaml          # Master OpenAPI 3.0.3 specification
├── models/
│   ├── architect/             # Example model (this guide's reference implementation)
│   │   ├── index.html         # Model demo page
│   │   ├── app.js             # Full spec implementation
│   │   └── style.css          # Model-specific styling
│   └── <new-model>/           # New models follow identical structure
└── scripts/
    └── generate_model.py        # Build-time generation script
```

---

## Model Requirements Checklist

Every model **MUST** implement:

### 1. OpenAPI Specification Compliance
- [ ] `GET /v1/models` — Returns array of model objects
- [ ] `POST /v1/chat/endpoints` — Chat completion with full `ChatCompletionPayload` schema
- [ ] `DELETE /v1/models/{model}` — Model deletion with 403 for system models

### 2. Resilience Patterns (all three, enforced on every API call)
- [ ] **Rate Limiter** — Token bucket, 60 req/min, returns 429
- [ ] **Bulkhead** — Max 10 concurrent, returns 503 when saturated
- [ ] **Circuit Breaker** — 5 failures → open 30s, returns 503 while open

### 3. Data Model
- [ ] Model object with: `id`, `object`, `created`, `owned_by`, `is_system`, `capabilities[]`
- [ ] Isolated `localStorage` key: `mock_models_<model-id>`
- [ ] Seed data on first load

### 4. Self-Contained Files
- [ ] `index.html` — Complete demo page (no external dependencies except Google Fonts)
- [ ] `app.js` — ES Module, exports `ModelAPI`, `ModelRepository`, UI helpers
- [ ] `style.css` — Complete styling, matches design system

### 5. Testing
- [ ] Chat demo functional
- [ ] API reference tabs show correct curl/response examples
- [ ] Resilience test buttons trigger expected status codes
- [ ] localStorage isolation verified

---

## Step-by-Step: Creating a New Model

### 1. Define Model Metadata

Add to `public/index.html` → `MODEL_REGISTRY` array:

```javascript
{
  id: "my-model",                    // lowercase, kebab-case, unique
  name: "my-model",                  // display name (lowercase per convention)
  description: "One-line description of model's persona/specialty",
  type: "custom",                    // "system" | "custom" | "architect" | ...
  is_system: false,                  // true = cannot be deleted via API
  endpoints: [
    "/v1/models",
    "/v1/chat/endpoints",
    "/v1/models/{model}"
  ],
  patterns: ["Rate Limiter", "Bulkhead", "Circuit Breaker"],
  tags: ["tag1", "tag2"],            // for filtering/discovery
  created: "2026-11-05"              // ISO date
}
```

### 2. Create Model Directory

```bash
mkdir -p public/models/my-model
```

### 3. Generate Three Files

Use the **architect** model as reference. Copy and modify:

| File | Key Customization Points |
|------|--------------------------|
| `index.html` | Model name, avatar initials, badge type, chat responses, curl examples |
| `app.js` | `STORAGE_KEY`, `MODEL_ID`, `IS_SYSTEM`, `generateArchitectResponse()` logic |
| `style.css` | Color theme (modify `--accent` and related variables) |

#### 3a. `app.js` — Required Constants

```javascript
const STORAGE_KEY = "mock_models_my-model";
const MODEL_ID = "my-model";
const IS_SYSTEM = false;  // or true
const MODEL_CAPABILITIES = ["capability1", "capability2"];
```

#### 3b. `app.js` — Response Generation

Replace `generateArchitectResponse()` with your model's persona:

```javascript
generateMyModelResponse(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("keyword")) return "[my-model] Specialized response...";
  return `[my-model] Default response for: ${prompt}`;
}
```

#### 3c. `style.css` — Theme Customization

Modify the `:root` color variables:

```css
:root {
  --accent: #your-brand-color;        // Primary accent
  --accent-strong: #darker-variant;   // Hover states
  --accent-dim: #your-color-22;       // 13% opacity
  --accent-glow: #your-color-44;      // 27% opacity
  /* ... rest unchanged ... */
}
```

Update `.model-avatar` gradient:

```css
.model-avatar {
  background: linear-gradient(135deg, var(--accent), #secondary-color);
}
```

### 4. Verify Locally

```bash
cd public && python -m http.server 8765
# Open http://localhost:8765/models/my-model/
```

Checklist:
- [ ] Page loads without console errors
- [ ] Chat sends/receives messages
- [ ] API tabs switch correctly
- [ ] Rate limit test → 429 after 60 requests
- [ ] Bulkhead test → 503 after 10 concurrent
- [ ] Circuit breaker test → 503 after 5 failures
- [ ] localStorage key is `mock_models_my-model`
- [ ] Root dashboard links to `/models/my-model/`

### 5. Run Test Suite

```bash
# From project root
pytest tests/ -v -k "my-model"
```

Expected tests (in `tests/e2e/test_model_sites.py`):
- `test_page_loads`
- `test_chat_completion_works`
- `test_rate_limit_enforced`
- `test_isolation_between_models`

---

## Design System Reference

### Colors (CSS Variables)

| Variable | Purpose | Architect Value |
|----------|---------|-----------------|
| `--bg` | Page background | `#0a0f1a` |
| `--bg-elevated` | Cards/panels (darker) | `#111827` |
| `--bg-card` | Cards/panels (lighter) | `#1a2234` |
| `--bg-input` | Input backgrounds | `#0f172a` |
| `--fg` | Primary text | `#e8ecf4` |
| `--fg-muted` | Secondary text | `#8b95a6` |
| `--fg-subtle` | Placeholders | `#5a6578` |
| `--accent` | **Primary brand color** | `#00d4aa` |
| `--accent-dim` | Backgrounds (13%) | `#00d4aa22` |
| `--accent-glow` | Glows/borders (27%) | `#00d4aa44` |
| `--accent-strong` | Hover states | `#00b894` |
| `--border` | Default borders | `#2a3548` |
| `--border-light` | Scrollbar, subtle | `#3a4558` |

### Typography

```css
--font-ui: 'Space Grotesk', system-ui, sans-serif;   /* Headings, UI */
--font-mono: 'JetBrains Mono', ui-monospace, monospace; /* Code, data */
```

### Spacing & Radius

```css
--radius: 16px;        /* Default */
--radius-sm: 8px;      /* Badges, tabs */
--radius-lg: 20px;     /* Panels */
--radius-xl: 24px;     /* Hero elements */
--transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

### Component Patterns

#### Panel
```html
<section class="panel">
  <div class="panel-header">
    <h2>Title</h2>
    <span class="endpoint-badge">POST /v1/...</span>
  </div>
  <p class="panel-description">Optional description</p>
  <!-- content -->
</section>
```

#### Button
```html
<button class="btn btn-primary">Primary</button>
<button class="btn btn-test" data-test="rate-limit">Test</button>
```

#### Badge
```html
<span class="badge badge-system">System</span>
<span class="badge badge-custom">Custom</span>
```

#### Code/Pre
```html
<pre><code>curl ...</code></pre>
<pre><code id="json-output"></code></pre>
```

---

## OpenAPI Specification (Reference)

The master spec at `public/openapi-spec.yaml` defines:

```yaml
paths:
  /v1/models:
    get:
      responses:
        '200': { description: "Array of Model objects" }
  /v1/chat/endpoints:
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ChatCompletionPayload' }
      responses:
        '200': { description: "ChatCompletionPayload" }
  /v1/models/{model}:
    delete:
      parameters:
        - name: x-organization-id
          in: header
          required: true
          schema: { type: string }
      responses:
        '200': { description: "Deleted" }
        '403': { description: "Forbidden (system model)" }
        '404': { description: "Not found" }

components:
  schemas:
    Model:
      type: object
      required: [id, object, created, owned_by]
      properties:
        id: { type: string }
        object: { type: string, enum: [model] }
        created: { type: integer, format: int64 }
        owned_by: { type: string }
        is_system: { type: boolean }
        capabilities: { type: array, items: { type: string } }

    ChatCompletionPayload:  # Full schema in openapi-spec.yaml
      # ... (see file for complete definition)
```

---

## Testing Architecture

### Test Structure

```
tests/
├── conftest.py              # Fixtures: base_url, page, context
├── unit/
│   └── test_repository.py   # JS logic via page.evaluate()
├── e2e/
│   └── test_model_sites.py  # Playwright tests per model
└── contract/
    └── test_openapi.py      # Spec validation
```

### Key Fixtures (`conftest.py`)

```python
@pytest.fixture(scope="session")
def base_url():
    return "http://localhost:8765"

@pytest.fixture(scope="session")
def http_server():
    # Starts python -m http.server 8765 in public/
    proc = subprocess.Popen(["python", "-m", "http.server", "8765"], cwd="public")
    yield
    proc.terminate()
```

### Model Test Template (`test_model_sites.py`)

```python
MODELS = ["architect", "engineer"]

@pytest.mark.parametrize("model_id", MODELS)
class TestModelSite:
    def test_page_loads(self, page, base_url, model_id):
        page.goto(f"{base_url}/models/{model_id}/")
        expect(page.locator("h1")).to_have_text(model_id)

    def test_chat_completion_works(self, page, base_url, model_id):
        page.goto(f"{base_url}/models/{model_id}/")
        page.fill('#chat-form input[name="prompt"]', "Test")
        page.click('#chat-form button[type="submit"]')
        expect(page.locator(".message.assistant")).to_contain_text(f"[{model_id}]")

    def test_rate_limit_enforced(self, page, base_url, model_id):
        page.goto(f"{base_url}/models/{model_id}/")
        page.click("#test-rate-limit")
        expect(page.locator("#test-results")).to_contain_text("Rate limited")

    def test_isolation_between_models(self, page, base_url, model_id):
        page.goto(f"{base_url}/models/{model_id}/")
        page.evaluate("""() => {
            window.ModelRepository.seed([{ id: 'test-iso', object: 'model', is_system: false }]);
        }""")
        models = page.evaluate("() => window.ModelRepository.findAll()")
        assert any(m['id'] == 'test-iso' for m in models)
```

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: python:3.12-slim
    steps:
      - uses: actions/checkout@v4
      - name: Install deps
        run: |
          apt-get update && apt-get install -y libnss3 libnspr4 libatk1.0-0 ...
          pip install pytest pytest-playwright pyyaml
          playwright install --with-deps chromium
      - name: Start server
        run: cd public && python -m http.server 8765 & sleep 2
      - name: Run tests
        run: pytest tests/ -v --base-url=http://localhost:8765
      - name: Deploy to Pages
        if: github.ref == 'refs/heads/main'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

---

## Adding a Model: Quick Checklist

```bash
# 1. Add to MODEL_REGISTRY in public/index.html
# 2. Create directory
mkdir -p public/models/my-model

# 3. Create three files (copy from architect, customize)
cp public/models/architect/index.html public/models/my-model/
cp public/models/architect/app.js public/models/my-model/
cp public/models/architect/style.css public/models/my-model/

# 4. Edit each file - key changes:
#    - STORAGE_KEY, MODEL_ID, IS_SYSTEM in app.js
#    - generateMyModelResponse() in app.js
#    - --accent color in style.css
#    - Model name, avatar, responses in index.html

# 5. Test locally
cd public && python -m http.server 8765

# 6. Run tests
pytest tests/ -v -k "my-model"

# 7. Commit and push
git add public/models/my-model/ public/index.html
git commit -m "Add my-model: <description>"
git push
```

---

## Architecture Decision Record (ADR)

### ADR-001: Self-Contained Model Sites
**Status**: Accepted
**Context**: Need reproducible, isolated model implementations deployable to static hosts.
**Decision**: Each model = complete static site (`index.html`, `app.js`, `style.css`) with isolated `localStorage`.
**Consequences**: 
- ✅ Zero shared runtime dependencies
- ✅ Independent deployment/updates
- ✅ True isolation for testing
- ❌ Code duplication (mitigated by generation script)
- ❌ Cross-model changes require regeneration

### ADR-002: Directory-Based Routing
**Status**: Accepted
**Context**: GitHub Pages/Netlify static hosting.
**Decision**: `/models/{id}/` → `public/models/{id}/index.html`
**Consequences**: Clean URLs, no SPA router, no `_redirects`, works offline.

### ADR-003: Python-Only Testing (pytest + Playwright)
**Status**: Accepted
**Context**: User constraint: no npm/Node in test environment.
**Decision**: Playwright Python drives browser; `page.evaluate()` tests JS logic.
**Consequences**: Single venv/Docker image for all testing; no Node toolchain.

### ADR-004: Resilience Patterns as Learning Artifacts
**Status**: Accepted
**Context**: Educational goals include cybersecurity, reliability engineering.
**Decision**: Implement Rate Limiter, Bulkhead, Circuit Breaker in every model's `app.js`.
**Consequences**: Students can inspect, trigger, and modify real resilience patterns.

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `Module not found` in browser | ES Module import path wrong | Check `<script type="module" src="app.js">` (relative) |
| localStorage not isolated | Same `STORAGE_KEY` | Ensure unique `mock_models_<id>` per model |
| Rate limit not triggering | `RateLimiter.limit` too high | Verify 60 req/min in `app.js` |
| Circuit breaker never opens | `threshold` not reached | Force 5 failures via invalid endpoint |
| Styles not loading | `style.css` path | Check `<link rel="stylesheet" href="style.css">` |
| Tests fail in CI | Playwright deps missing | Install `libnss3 libnspr4 libatk1.0-0 ...` |
| Fonts not loading offline | Google Fonts CDN | Fonts are optional enhancement; UI works with system fonts |

---

## Extending the System

### New Endpoints
1. Add to `openapi-spec.yaml`
2. Implement in `ModelRepository` (each model's `app.js`)
3. Add handler in `ModelAPI.handleRequest()`
4. Update `endpoints` in `MODEL_REGISTRY`
5. Add API tab in `index.html`
6. Add tests

### New Resilience Patterns
1. Implement pattern class in `app.js`
2. Compose in `ModelAPI.handleRequest()` chain
3. Add test button in `index.html` resilience section
4. Add pattern to `patterns` array in registry

### Shared Utilities (Future)
If duplication becomes painful, create `public/shared/`:
- `core.js` — Base patterns, utilities
- `types.js` — TypeScript definitions (if migrating)
- Import via `<script type="module" src="../shared/core.js">`

---

## License & Attribution

This architecture is designed for **educational purposes** — learning API design, testing, CI/CD, and resilience patterns. The OpenAI-compatible specification structure follows public API documentation conventions.

**Generated with**: This AGENTS.md process
**Reference implementation**: `public/models/architect/`
**Specification**: `public/openapi-spec.yaml`