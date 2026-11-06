/**
 * architect — Mock OpenAI API Implementation
 * 
 * Complete OpenAI-compatible API specification implementation for the architect model.
 * Includes: Repository, Resilience Patterns, HTTP Handler, UI Helpers
 * 
 * Specification: ../openapi-spec.yaml
 * Endpoints: GET /v1/models, POST /v1/chat/endpoints, DELETE /v1/models/{model}
 * Patterns: Rate Limiter, Bulkhead, Circuit Breaker
 */

// ─── Configuration ─────────────────────────────────────────────
const STORAGE_KEY = "mock_models_architect";
const MODEL_ID = "architect";
const IS_SYSTEM = true;
const MODEL_NAME = "architect";
const MODEL_DESCRIPTION = "System architect persona — designs scalable architectures, evaluates trade-offs, produces ADRs. Specializes in distributed systems, API design, and operational excellence.";
const MODEL_CAPABILITIES = ["architecture", "system-design", "adrs", "trade-offs", "distributed-systems", "api-design"];

// Generation metadata
const GENERATED_BY = {
  model: "nvidia/nemotron-3-ultra-550b-a55b",
  provider: "nvidia",
  date: "2026-11-05",
  profile: "architect"
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

    // Generate architect-style response
    const lastUserMessage = [...payload.messages].reverse().find(m => m.role === "user");
    const prompt = lastUserMessage?.content || "";

    const responseContent = this.generateArchitectResponse(prompt);

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

  generateArchitectResponse(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    
    // Architecture-specific responses
    if (lowerPrompt.includes("api gateway") || lowerPrompt.includes("gateway")) {
      return "[architect] For a scalable API gateway, I'd recommend: 1) Rate limiting per tenant with token buckets, 2) Circuit breakers for all upstream services, 3) Request/response validation against OpenAPI schemas, 4) Full observability (metrics, logs, distributed traces), 5) Graceful degradation with fallback responses. Consider Kong, Envoy, or AWS API Gateway for managed solutions.";
    }
    if (lowerPrompt.includes("microservice") || lowerPrompt.includes("service mesh")) {
      return "[architect] Service mesh (Istio/Linkerd) adds value when you have: 10+ services, need mTLS, traffic splitting for canaries, or complex retry/timeout policies. For simpler cases, sidecar-less approaches (Envoy proxy per host) or library-level resilience (Resilience4j, Polly) reduce operational burden. Always measure before adopting.";
    }
    if (lowerPrompt.includes("database") || lowerPrompt.includes("data")) {
      return "[architect] Database choice depends on access patterns: OLTP → PostgreSQL (ACID, JSON support), OLAP → ClickHouse/DuckDB, Key-value → Redis/Dragonfly, Time-series → TimescaleDB, Graph → Neo4j. Polyglot persistence is real but adds complexity — justify each additional engine. Always design for migration from day one.";
    }
    if (lowerPrompt.includes("cache") || lowerPrompt.includes("caching")) {
      return "[architect] Caching layers: 1) CDN for static assets, 2) HTTP cache headers (ETag, Cache-Control), 3) Application-level (Redis) for computed results, 4) Database query cache. Key invalidation strategy: write-through for strong consistency, write-behind for performance, TTL-based for eventual consistency. Cache stampede protection with probabilistic early expiration.";
    }
    if (lowerPrompt.includes("event") || lowerPrompt.includes("kafka") || lowerPrompt.includes("message")) {
      return "[architect] Event-driven architecture: Use Kafka/Redpanda for high-throughput logs, RabbitMQ for traditional queuing, NATS for lightweight pub/sub. Schema registry (Avro/Protobuf) is non-negotiable. Design events as facts (OrderPlaced), not commands (PlaceOrder). Idempotent consumers + exactly-once semantics via transactional outbox pattern.";
    }
    if (lowerPrompt.includes("monitor") || lowerPrompt.includes("observab") || lowerPrompt.includes("logging")) {
      return "[architect] Three pillars: Metrics (Prometheus + Grafana), Logs (Loki/ELK), Traces (Tempo/Jaeger). Standardize on OpenTelemetry. RED metrics (Rate, Errors, Duration) for services, USE metrics (Utilization, Saturation, Errors) for resources. Structured JSON logs with correlation IDs. Sample traces at 10-20% in production.";
    }
    if (lowerPrompt.includes("deploy") || lowerPrompt.includes("kubernetes") || lowerPrompt.includes("k8s")) {
      return "[architect] Kubernetes: Use Helm/Kustomize for config management. GitOps (ArgoCD/Flux) for deployments. Resource limits/requests on every container. PodDisruptionBudgets for HA. NetworkPolicies for zero-trust. Consider managed EKS/GKE/AKS unless you need control plane customization. Cluster API for multi-cluster.";
    }
    if (lowerPrompt.includes("security") || lowerPrompt.includes("auth") || lowerPrompt.includes("authorization")) {
      return "[architect] Zero-trust: mTLS everywhere (service mesh or sidecars), JWT/OIDC for auth, RBAC/ABAC for authorization. Rotate secrets automatically (Vault, Sealed Secrets). Scan containers (Trivy), dependencies (Dependabot), IaC (Checkov). Assume breach — encrypt data at rest and in transit. Audit logs immutable.";
    }
    if (lowerPrompt.includes("trade") || lowerPrompt.includes("decision") || lowerPrompt.includes("adr")) {
      return "[architect] ADR template: Title, Status (Proposed/Accepted/Deprecated), Context, Decision, Consequences. Write when: irreversible choice, significant cost, team disagreement. Store in repo (docs/adr/). Review quarterly. Example: 'ADR-007: Use PostgreSQL over MongoDB for transactional data — ACID compliance required for billing.'";
    }
    if (lowerPrompt.includes("scale") || lowerPrompt.includes("performance") || lowerPrompt.includes("latency")) {
      return "[architect] Scaling hierarchy: 1) Optimize queries (indexes, query plans), 2) Cache (Redis, CDN), 3) Read replicas, 4) Vertical scale (bigger instance), 5) Horizontal scale (sharding, partitioning). Measure first — 80% of 'scale problems' are actually query/index issues. Profile with p99 latency, not averages.";
    }

    // Default architect response
    return `[architect] ${prompt} — Let me think about this architecturally. Key considerations: 1) What are the functional and non-functional requirements? 2) What are the failure domains and blast radius? 3) How will this evolve over 6-12 months? 4) What are the operational implications? 5) Can we validate with a spike or POC first? Happy to dive deeper into any specific aspect.`;
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
  key: "architect",

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
  preEl.innerHTML = `<code>curl -X POST https://enondev.github.io/client-side-mock-api/v1/chat/endpoints \\
  -H "Content-Type: application/json" \\
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