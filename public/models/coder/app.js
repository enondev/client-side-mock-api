/**
 * coder — Mock OpenAI API Implementation
 *
 * Complete OpenAI-compatible API specification implementation for the coder model.
 * Includes: Repository, Resilience Patterns, HTTP Handler, UI Helpers
 *
 * Specification: ../openapi-spec.yaml
 * Endpoints: GET /v1/models, POST /v1/chat/endpoints, DELETE /v1/models/{model}
 * Patterns: Rate Limiter, Bulkhead, Circuit Breaker
 */

// ─── Configuration ─────────────────────────────────────────────
const STORAGE_KEY = "mock_models_coder";
const MODEL_ID = "coder";
const IS_SYSTEM = true;
const MODEL_NAME = "coder";
const MODEL_DESCRIPTION = "Senior full-stack engineer — writes, reviews, and refactors code. Implements features, fixes bugs, maintains code quality. Specializes in asynchronous web architectures, LLM integration, API design, and developer tooling.";
const MODEL_CAPABILITIES = ["full-stack", "async-arch", "llm-integration", "api-design", "devops", "testing", "refactoring", "code-review", "debugging", "performance-optimization"];

// Generation metadata
const GENERATED_BY = {
  model: "nvidia/nemotron-3-ultra-550b-a55b",
  provider: "nvidia",
  date: "2026-11-06",
  profile: "coder"
};

// ─── OpenAPI Schemas (inline for validation) ───────────────────
const SCHEMAS = {
  Model: {
    type: "object",
    required: ["id", "object", "created", "owned_by"],
    properties: {
      id: { type: "string" },
      object: { type: "string", enum: ["model"] },
      created: { type: "integer", format: "int64" },
      owned_by: { type: "string" },
      is_system: { type: "boolean" },
      capabilities: { type: "array", items: { type: "string" } }
    }
  },
  ChatCompletionPayload: {
    type: "object",
    required: ["model", "messages"],
    properties: {
      id: { type: "string" },
      object: { type: "string", enum: ["chat.completion"] },
      created: { type: "integer", format: "int64" },
      model: { type: "string" },
      system_fingerprint: { type: "string" },
      choices: {
        type: "array",
        items: {
          type: "object",
          required: ["index", "message", "finish_reason"],
          properties: {
            index: { type: "integer" },
            message: {
              type: "object",
              required: ["role", "content"],
              properties: {
                role: { type: "string", enum: ["assistant"] },
                content: { type: "string" },
                refusal: { type: ["string", "null"] },
                annotations: { type: "array", items: {} }
              }
            },
            logprobs: { type: ["object", "null"] },
            finish_reason: { type: "string", enum: ["stop", "length", "tool_calls", "content_filter"] }
          }
        }
      },
      usage: {
        type: "object",
        required: ["prompt_tokens", "completion_tokens", "total_tokens"],
        properties: {
          prompt_tokens: { type: "integer" },
          completion_tokens: { type: "integer" },
          total_tokens: { type: "integer" },
          prompt_tokens_details: {
            type: "object",
            properties: { cached_tokens: { type: "integer" }, audio_tokens: { type: "integer" } }
          },
          completion_token_details: {
            type: "object",
            properties: {
              reasoning_tokens: { type: "integer" },
              audio_tokens: { type: "integer" },
              accepted_prediction_tokens: { type: "integer" },
              rejected_prediction_tokens: { type: "integer" }
            }
          }
        }
      },
      service_tier: { type: "string", enum: ["default"] }
    }
  }
};

// ─── Utility Functions ─────────────────────────────────────────
function generateId(prefix = "") {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function generateFingerprint() {
  return `fp_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function validateSchema(data, schema) {
  // Simplified validation - in production use a proper validator like Ajv
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
  }
  return { valid: true };
}

function createErrorResponse(status, error) {
  return { status, error };
}

function createSuccessResponse(status, body) {
  return { status, body };
}

// ─── ModelRepository ───────────────────────────────────────────
const ModelRepository = {
  _read() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  _write(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },

  // GET /v1/models
  findAll() {
    return this._read();
  },

  // GET /v1/models/{model}
  findById(id) {
    return this._read().find(m => m.id === id) || null;
  },

  // DELETE /v1/models/{model}
  deleteById(id) {
    const data = this._read();
    const model = data.find(m => m.id === id);
    if (!model) return createErrorResponse(404, "Not found");
    if (model.is_system) return createErrorResponse(403, "Forbidden: system model");
    this._write(data.filter(m => m.id !== id));
    return createSuccessResponse(200, { deleted: true });
  },

  // POST /v1/chat/endpoints
  createChatCompletion(payload) {
    // Validate required fields
    if (!payload || !payload.messages || !Array.isArray(payload.messages) || payload.messages.length === 0) {
      return createErrorResponse(400, "messages array is required and must not be empty");
    }
    if (!payload.model) {
      return createErrorResponse(400, "model is required");
    }

    // Validate model exists
    const model = this.findById(payload.model);
    if (!model) {
      return createErrorResponse(400, "The model does not exist");
    }

    // Validate messages structure
    for (const msg of payload.messages) {
      if (!msg.role || !msg.content) {
        return createErrorResponse(400, "Each message must have role and content");
      }
    }

    // Generate coder-style response
    const lastUserMessage = [...payload.messages].reverse().find(m => m.role === "user");
    const prompt = lastUserMessage?.content || "";

    const responseContent = this.generateCoderResponse(prompt);

    const response = {
      id: generateId("chatcmpl-"),
      object: "chat.completion",
      created: now(),
      model: payload.model,
      system_fingerprint: generateFingerprint(),
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: responseContent,
          refusal: null,
          annotations: []
        },
        logprobs: null,
        finish_reason: "stop"
      }],
      usage: {
        prompt_tokens: this.estimateTokens(JSON.stringify(payload.messages)),
        completion_tokens: this.estimateTokens(responseContent),
        total_tokens: 0,
        prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
        completion_token_details: {
          reasoning_tokens: 0,
          audio_tokens: 0,
          accepted_prediction_tokens: 0,
          rejected_prediction_tokens: 0
        }
      },
      service_tier: "default"
    };
    response.usage.total_tokens = response.usage.prompt_tokens + response.usage.completion_tokens;

    return createSuccessResponse(200, response);
  },

  estimateTokens(text) {
    // Rough approximation: ~4 chars per token
    return Math.ceil(text.length / 4);
  },

  generateCoderResponse(prompt) {
    const lowerPrompt = prompt.toLowerCase();

    // Async patterns & concurrency
    if (lowerPrompt.includes("async") || lowerPrompt.includes("await") || lowerPrompt.includes("promise")) {
      return `[coder] For async patterns: prefer \`async/await\` over raw promises for readability. Use \`Promise.all()\` for parallel, \`Promise.allSettled()\` when you need all results regardless of failure. For sequential with error handling, wrap in try/catch. Avoid the "async in loop" anti-pattern — collect promises then \`await Promise.all()\`. For retries with backoff, build a small utility or use \`async-retry\`.`;
    }
    if (lowerPrompt.includes("concurr") || lowerPrompt.includes("parallel") || lowerPrompt.includes("worker")) {
      return `[coder] Concurrency options in JS/TS: Web Workers for CPU-heavy tasks (off main thread), \`worker_threads\` in Node, or \`Promise.all\` for I/O-bound parallelism. For rate-limited parallel work, use a semaphore/pool pattern. In Python: \`asyncio\` + \`asyncio.Semaphore\`, \`concurrent.futures\`, or \`anyio\`. Always bound concurrency — unbounded parallelism causes OOM or rate-limit bans.`;
    }

    // LLM integration
    if (lowerPrompt.includes("llm") || lowerPrompt.includes("openai") || lowerPrompt.includes("ollama") || lowerPrompt.includes("inference")) {
      return `[coder] LLM integration patterns: 1) Always use async clients (httpx, aiohttp) for non-blocking calls. 2) Implement retry with exponential backoff + jitter for 429/5xx. 3) Stream responses for UX (SSE or ReadableStream). 4) Token counting before send — truncate context if needed. 5) Structured output via JSON mode or function calling. 6) Cache embeddings/completions with Redis. 7) Observability: log prompts, tokens, latency, errors. 8) Circuit breaker for provider failures.`;
    }
    if (lowerPrompt.includes("callback") || lowerPrompt.includes("webhook") || lowerPrompt.includes("async inference")) {
      return `[coder] For async LLM inference with callbacks: submit job to queue (Redis/RabbitMQ), return job_id immediately. Worker picks up job, calls Ollama with \`callback_url\`. Webhook handler verifies signature, stores result, notifies frontend via SSE/polling. Handle webhook failures: dead-letter queue + retry with backoff. Idempotency key on each job prevents duplicate processing.`;
    }

    // API design
    if (lowerPrompt.includes("api") || lowerPrompt.includes("rest") || lowerPrompt.includes("endpoint") || lowerPrompt.includes("openapi")) {
      return `[coder] API design checklist: 1) Version in URL (/v1/) or header. 2) Consistent naming: kebab-case for paths, camelCase for JSON. 3) Proper status codes (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503). 4) Error envelope: { error: { code, message, details[] } }. 5) Pagination: cursor-based for large sets. 6) Idempotency keys for mutations. 7) OpenAPI spec as source of truth — generate clients/docs from it. 8) Rate limit headers (X-RateLimit-*).`;
    }

    // Testing
    if (lowerPrompt.includes("test") || lowerPrompt.includes("pytest") || lowerPrompt.includes("playwright") || lowerPrompt.includes("unit test")) {
      return `[coder] Testing strategy: Unit (fast, isolated, 70%), Integration (real deps, 20%), E2E (critical paths, 10%). Use fixtures for test data. Property-based testing for complex logic (hypothesis/fast-check). Contract tests for API boundaries. Mock external services, not your own code. CI: run unit on every PR, integration nightly, E2E on merge. Coverage target: 80%+ but favor meaningful assertions over lines.`;
    }

    // Refactoring & code quality
    if (lowerPrompt.includes("refactor") || lowerPrompt.includes("clean code") || lowerPrompt.includes("technical debt") || lowerPrompt.includes("code quality")) {
      return `[coder] Refactoring safely: 1) Tests first — characterize current behavior. 2) Small, atomic commits. 3) Extract method/class/function incrementally. 4) Use IDE refactorings (rename, extract, move). 5) Static analysis: ESLint/TypeScript strict, ruff/mypy, golangci-lint. 6) Complexity metrics: cyclomatic < 10, cognitive < 15. 7) DRY vs WET — prefer duplication over wrong abstraction. 8) Boy Scout Rule: leave code better than you found it.`;
    }

    // DevOps / CI/CD
    if (lowerPrompt.includes("ci") || lowerPrompt.includes("cd") || lowerPrompt.includes("deploy") || lowerPrompt.includes("pipeline") || lowerPrompt.includes("github actions")) {
      return `[coder] CI/CD essentials: 1) Fast feedback — PR checks < 5 min. 2) Cache dependencies aggressively. 3) Parallel jobs (lint, typecheck, test). 4) Artifact promotion (build once, deploy same artifact). 5) Environments: dev → staging → prod with progressive rollout. 6) Feature flags over long-lived branches. 7) Rollback in < 1 min. 8) Security: SAST/DAST, dependency scanning, container scanning. 9) Observability baked in (traces, metrics, logs).`;
    }

    // Debugging
    if (lowerPrompt.includes("debug") || lowerPrompt.includes("bug") || lowerPrompt.includes("error") || lowerPrompt.includes("crash")) {
      return `[coder] Debugging workflow: 1) Reproduce — write a failing test. 2) Isolate — binary search (git bisect, comment out half). 3) Hypothesize — read stack trace, check recent changes. 4) Verify — add logging/breakpoints at decision points. 5) Fix — minimal change, add regression test. 6) Reflect — how did this slip? Improve guards (types, tests, lint). Tools: debugger, structured logs, distributed tracing, profile-guided optimization.`;
    }

    // Performance
    if (lowerPrompt.includes("performance") || lowerPrompt.includes("optimize") || lowerPrompt.includes("latency") || lowerPrompt.includes("throughput") || lowerPrompt.includes("bundle")) {
      return `[coder] Performance optimization: 1) Measure first (profilers: 0x, clinic.js, py-spy, pprof). 2) Fix algorithmic complexity before micro-optimizations. 3) Caching layers: HTTP (Cache-Control), app (Redis), DB (query cache). 4) DB: indexes, query plans, connection pooling, read replicas. 5) Frontend: code-split, lazy load, tree-shake, compress (Brotli), prefetch. 6) Network: keep-alive, HTTP/2, CDN, reduce round-trips. 7) Set budgets (bundle size, p95 latency) and gate in CI.`;
    }

    // Default coder response
    return `[coder] ${prompt} — Let me approach this like a code review. First: what's the actual problem? Constraints? Existing patterns in the codebase? I'd start by: 1) Writing a failing test that captures the desired behavior. 2) Implementing the minimal change. 3) Running the full suite. 4) Checking types/lint. 5) Considering edge cases (empty input, null, timeout, rate limit). 6) Adding observability (logs, metrics). Happy to pair on implementation details — show me the code.`;
  },

  // Seed with this model as default
  seed() {
    const existing = this._read();
    if (existing.length > 0) return existing;

    const model = {
      id: MODEL_ID,
      object: "model",
      created: now(),
      owned_by: "mock-openai-api",
      is_system: IS_SYSTEM,
      capabilities: MODEL_CAPABILITIES,
      description: MODEL_DESCRIPTION,
      generated_by: GENERATED_BY
    };
    this._write([model]);
    return [model];
  }
};

// ─── Resilience Patterns ──────────────────────────────────────
const RateLimiter = {
  windowMs: 60000,
  limit: 60,
  requests: [],
  key: "coder",

  check() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    if (this.requests.length >= this.limit) {
      throw createErrorResponse(429, "Rate limit exceeded: 60 requests/minute");
    }
    this.requests.push(now);
  },

  getRemaining() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    return Math.max(0, this.limit - this.requests.length);
  },

  reset() {
    this.requests = [];
  }
};

const Bulkhead = {
  maxConcurrent: 10,
  active: 0,
  queue: [],

  execute(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.active++;
        try {
          const result = fn();
          Promise.resolve(result).then(resolve, reject);
        } catch (e) {
          reject(e);
        } finally {
          this.active--;
          this.processQueue();
        }
      };

      if (this.active >= this.maxConcurrent) {
        this.queue.push({ run, resolve, reject });
        throw createErrorResponse(503, "Server unavailable: bulkhead saturated");
      } else {
        run();
      }
    });
  },

  processQueue() {
    if (this.queue.length > 0 && this.active < this.maxConcurrent) {
      const next = this.queue.shift();
      next.run();
    }
  },

  getAvailable() {
    return Math.max(0, this.maxConcurrent - this.active);
  }
};

const CircuitBreaker = {
  failures: 0,
  threshold: 5,
  open: false,
  lastFailure: 0,
  resetTimeout: 30000,

  check() {
    if (this.open) {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.open = false;
        this.failures = 0;
      } else {
        throw createErrorResponse(503, "Circuit breaker open: too many failures");
      }
    }
  },

  recordSuccess() {
    this.failures = 0;
  },

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.open = true;
    }
  },

  getState() {
    return {
      open: this.open,
      failures: this.failures,
      threshold: this.threshold,
      timeUntilReset: this.open ? Math.max(0, this.resetTimeout - (Date.now() - this.lastFailure)) : 0
    };
  },

  reset() {
    this.failures = 0;
    this.open = false;
    this.lastFailure = 0;
  }
};

// ─── ModelAPI (HTTP-style handler) ───────────────────────────
export const ModelAPI = {
  async handleRequest(method, path, body = null) {
    RateLimiter.check();
    CircuitBreaker.check();

    return Bulkhead.execute(() => {
      try {
        let result;

        if (method === "GET" && path === "/v1/models") {
          result = ModelRepository.findAll();
          result = createSuccessResponse(200, result);
        } else if (method === "GET" && path.startsWith("/v1/models/")) {
          const id = path.split("/v1/models/")[1];
          const model = ModelRepository.findById(id);
          result = model ? createSuccessResponse(200, model) : createErrorResponse(404, "Model not found");
        } else if (method === "DELETE" && path.startsWith("/v1/models/")) {
          const id = path.split("/v1/models/")[1];
          result = ModelRepository.deleteById(id);
        } else if (method === "POST" && path === "/v1/chat/endpoints") {
          result = ModelRepository.createChatCompletion(body);
        } else {
          result = createErrorResponse(404, "Not found");
        }

        if (result.status >= 400) {
          CircuitBreaker.recordFailure();
        } else {
          CircuitBreaker.recordSuccess();
        }

        return result;
      } catch (e) {
        CircuitBreaker.recordFailure();
        throw e;
      }
    });
  },

  // Expose patterns for testing/debugging
  RateLimiter,
  Bulkhead,
  CircuitBreaker
};

// ─── UI Helpers ────────────────────────────────────────────────
export function renderChat(modelId, messagesEl, formEl) {
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = formEl.querySelector('input[name="prompt"]') || formEl.querySelector('#prompt');
    const prompt = input.value.trim();
    if (!prompt) return;

    // Add user message
    appendMessage(messagesEl, "user", prompt);

    // Loading indicator
    const loadingEl = appendMessage(messagesEl, "assistant", "...", true);
    loadingEl.classList.add("loading");

    // Call API
    try {
      const result = await ModelAPI.handleRequest("POST", "/v1/chat/endpoints", {
        model: modelId,
        messages: [{ role: "user", content: prompt }]
      });

      loadingEl.remove();
      if (result.status === 200) {
        const content = result.body.choices[0]?.message?.content || "No response";
        appendMessage(messagesEl, "assistant", content);
      } else {
        appendMessage(messagesEl, "assistant", `Error ${result.status}: ${result.error}`, false, true);
      }
    } catch (e) {
      loadingEl.remove();
      appendMessage(messagesEl, "assistant", `Error: ${e.error || e.message}`, false, true);
    }

    input.value = "";
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function appendMessage(container, role, content, isLoading = false, isError = false) {
  const el = document.createElement("div");
  el.className = `message ${role}${isLoading ? ' loading' : ''}${isError ? ' error' : ''}`;
  el.textContent = content;
  container.appendChild(el);
  return el;
}

export function renderCurlExample(modelId, preEl) {
  preEl.innerHTML = `<code>curl -X POST https://enondev.github.io/client-side-mock-api/v1/chat/endpoints \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"model": "${modelId}", "messages": [{"role": "user", "content": "Your prompt here"}]}'</code>`;
}

export function renderModelResponse(preEl) {
  const models = ModelRepository.findAll();
  if (models.length > 0) {
    preEl.textContent = JSON.stringify(models, null, 2);
  } else {
    preEl.textContent = '[]';
  }
}

// Auto-seed on load
if (!localStorage.getItem(STORAGE_KEY)) {
  ModelRepository.seed();
}

// Export for testing
export { ModelRepository, RateLimiter, Bulkhead, CircuitBreaker, SCHEMAS };