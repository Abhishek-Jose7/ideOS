var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// cloud/worker.js
var jsonHeaders = { "Content-Type": "application/json" };
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    await ensureSchema(env.DB);
    if (url.pathname === "/health") return json({ ok: true, backend: "cloud" });
    if (url.pathname === "/state") return json(await state(env.DB));
    if (url.pathname === "/events") return events();
    if (url.pathname === "/tool/current-work") return json(await currentWork(request, env));
    if (url.pathname === "/tool/handoff") return json(await handoff(request, env));
    if (url.pathname === "/tool/claim") return json(await claim(request, env));
    if (url.pathname === "/tool/remember") return json(await remember(request, env));
    if (url.pathname === "/tool/checkpoint") return json(await checkpoint(request, env));
    if (url.pathname === "/tool/file-activity") return json(await fileActivity(request, env));
    if (url.pathname === "/tool/done") return json(await done(request, env));
    if (url.pathname === "/tool/heartbeat") return json(await heartbeat(request, env));
    return json({ error: "Not found" }, 404);
  }
};
async function ensureSchema(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS features (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT "planning", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    db.prepare("CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, feature_id TEXT NOT NULL, worker_id TEXT, summary TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, files_touched TEXT, blockers TEXT, next_steps TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, feature_id TEXT, key TEXT NOT NULL, value TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, worker_id TEXT, ide TEXT NOT NULL, feature_id TEXT, started_at TEXT NOT NULL, ended_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, name TEXT NOT NULL, ide TEXT NOT NULL, last_heartbeat TEXT, last_file_activity TEXT, last_git_activity TEXT, current_feature TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, worker_id TEXT, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)")
  ]);
}
__name(ensureSchema, "ensureSchema");
async function state(db) {
  const [features, decisions, checkpoints, sessions, workers, recent_activity] = await Promise.all([
    db.prepare("SELECT * FROM features ORDER BY updated_at DESC").all(),
    db.prepare("SELECT * FROM decisions ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM checkpoints ORDER BY created_at DESC LIMIT 50").all(),
    db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 50").all(),
    db.prepare("SELECT * FROM workers ORDER BY COALESCE(last_heartbeat,last_file_activity,last_git_activity) DESC").all(),
    db.prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50").all()
  ]);
  return {
    features: features.results,
    decisions: decisions.results,
    checkpoints: checkpoints.results,
    sessions: sessions.results,
    active_workers: workers.results,
    recent_activity: recent_activity.results
  };
}
__name(state, "state");
async function currentWork(request, env) {
  const input = await request.json().catch(() => ({}));
  const features = (await env.DB.prepare("SELECT * FROM features ORDER BY updated_at DESC").all()).results;
  const fallback = localClassify({ features, branch: input.branch || "", files: input.files || [] });
  return groq(env, {
    system: 'Classify work into a feature. Return JSON only: {"likely_feature":"feature-id-or-null","confidence":0.0,"signals":["..."],"suggestion":"..."}',
    user: JSON.stringify({ ...input, features }),
    fallback
  });
}
__name(currentWork, "currentWork");
async function handoff(request, env) {
  const { feature } = await request.json();
  const featureRow = await env.DB.prepare("SELECT * FROM features WHERE id = ?").bind(feature).first();
  if (!featureRow) return { error: "feature not found" };
  const checkpoints = (await env.DB.prepare("SELECT * FROM checkpoints WHERE feature_id = ? ORDER BY created_at DESC").bind(feature).all()).results;
  const decisions = (await env.DB.prepare("SELECT * FROM decisions WHERE feature_id = ? OR feature_id IS NULL ORDER BY created_at DESC").bind(feature).all()).results;
  return groq(env, {
    system: 'Write a concise feature handoff. Return JSON only: {"brief":"markdown text","progress":0,"completed":["..."],"remaining":["..."],"blockers":["..."],"next_action":"..."}',
    user: JSON.stringify({ feature: featureRow, checkpoints, decisions }),
    fallback: { brief: `${featureRow.name}

${checkpoints.map((row) => `- ${row.summary}`).join("\n")}` }
  });
}
__name(handoff, "handoff");
async function remember(request, env) {
  const input = await request.json();
  const features = (await env.DB.prepare("SELECT * FROM features ORDER BY updated_at DESC").all()).results;
  const normalized = await groq(env, {
    system: 'Normalize an engineering decision. Return JSON only: {"key":"short-key","value":"decision","feature":"feature-id-or-null"}',
    user: JSON.stringify({ ...input, features }),
    fallback: { key: input.key, value: input.value, feature: input.feature || null }
  });
  if (!normalized.key || !normalized.value) return { error: "Prompt-only remember requires GROQ_API_KEY. Or pass explicit key/value." };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare("INSERT INTO decisions (id, feature_id, key, value, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), normalized.feature || null, normalized.key, normalized.value, input.created_by || "cloud", now).run();
  return { remembered: normalized.key, value: normalized.value, feature_id: normalized.feature || null };
}
__name(remember, "remember");
async function claim(request, env) {
  const input = await request.json();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await ensureFeature(env.DB, input.feature, now);
  const ide = input.ide || "cloud";
  const name = input.name || "developer";
  const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, "-");
  const conflicts = (await env.DB.prepare("SELECT * FROM workers WHERE current_feature = ? AND id <> ?").bind(input.feature, workerId).all()).results;
  await env.DB.prepare("INSERT INTO workers (id, name, ide, last_heartbeat, current_feature) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, current_feature = excluded.current_feature").bind(workerId, name, ide, now, input.feature).run();
  await env.DB.prepare("INSERT INTO sessions (id, worker_id, ide, feature_id, started_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), workerId, ide, input.feature, now).run();
  return { claimed: input.feature, conflicts };
}
__name(claim, "claim");
async function checkpoint(request, env) {
  const input = await request.json();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await ensureFeature(env.DB, input.feature, now);
  await env.DB.prepare("INSERT INTO checkpoints (id, feature_id, worker_id, summary, progress, files_touched, blockers, next_steps, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), input.feature, input.worker_id || null, input.summary, input.progress || 0, JSON.stringify(input.files_touched || []), JSON.stringify(input.blockers || []), JSON.stringify(input.next_steps || []), input.source || "manual", now).run();
  if (input.source === "git_hook") {
    const workerId = "git:post-commit";
    const name = "git hook";
    const ide = "git";
    await env.DB.prepare(`
      INSERT INTO workers (id, name, ide, last_git_activity, current_feature)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_git_activity = excluded.last_git_activity, current_feature = COALESCE(excluded.current_feature, workers.current_feature)
    `).bind(workerId, name, ide, now, input.feature || null).run();
  }
  return { saved: true, feature_id: input.feature };
}
__name(checkpoint, "checkpoint");
async function heartbeat(request, env) {
  const input = await request.json().catch(() => ({}));
  const ide = input.ide || "cloud";
  const name = input.name || "developer";
  const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, "-");
  await env.DB.prepare("INSERT INTO workers (id, name, ide, last_heartbeat, current_feature) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, current_feature = COALESCE(excluded.current_feature, workers.current_feature)").bind(workerId, name, ide, (/* @__PURE__ */ new Date()).toISOString(), input.feature || null).run();
  return { heartbeat: true, worker_id: workerId };
}
__name(heartbeat, "heartbeat");
async function fileActivity(request, env) {
  const input = await request.json().catch(() => ({}));
  const ide = input.ide || "cloud";
  const name = input.name || "developer";
  const workerId = `${ide}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]/g, "-");
  await env.DB.prepare("INSERT INTO workers (id, name, ide, last_file_activity, current_feature) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_file_activity = excluded.last_file_activity, current_feature = COALESCE(excluded.current_feature, workers.current_feature)").bind(workerId, name, ide, (/* @__PURE__ */ new Date()).toISOString(), input.feature || null).run();
  return { file_activity: true, worker_id: workerId };
}
__name(fileActivity, "fileActivity");
async function done(request, env) {
  const input = await request.json();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await ensureFeature(env.DB, input.feature, now);
  await env.DB.prepare("UPDATE features SET status = ?, updated_at = ? WHERE id = ?").bind("done", now, input.feature).run();
  await env.DB.prepare("INSERT INTO checkpoints (id, feature_id, worker_id, summary, progress, files_touched, blockers, next_steps, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), input.feature, null, input.summary || "Feature complete", 100, "[]", "[]", "[]", "manual", now).run();
  return { done: input.feature };
}
__name(done, "done");
async function ensureFeature(db, id, now) {
  const name = id.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  await db.prepare("INSERT INTO features (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at").bind(id, name, "", "active", now, now).run();
}
__name(ensureFeature, "ensureFeature");
async function groq(env, { system, user, fallback }) {
  if (!env.GROQ_API_KEY) return fallback;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.SCAR_GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }]
    })
  });
  if (!response.ok) return fallback;
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
__name(groq, "groq");
function localClassify({ features, branch, files }) {
  const haystack = `${branch} ${files.join(" ")}`.toLowerCase();
  const found = features.find((feature) => haystack.includes(feature.id));
  return {
    likely_feature: found?.id || null,
    confidence: found ? 0.75 : 0,
    signals: [`branch: ${branch || "unknown"}`, `files: ${files.join(", ") || "none"}`],
    suggestion: found ? `Should I claim ${found.name} for you?` : "No strong feature signal yet."
  };
}
__name(localClassify, "localClassify");
function events() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`event: ready
data: ${JSON.stringify({ ok: true })}

`));
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
__name(events, "events");
function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: jsonHeaders });
}
__name(json, "json");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-c3WM1i/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-c3WM1i/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
