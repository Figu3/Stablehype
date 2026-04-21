import { requireApiKey } from "../lib/auth";

const MAX_SQL_LENGTH = 5000;
const MAX_ROWS = 10_000;
const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|TRUNCATE)\b/i;

function stripLeadingNoise(sql: string): string {
  let s = sql;
  for (;;) {
    const t = s.trimStart();
    if (t.startsWith("--")) {
      const nl = t.indexOf("\n");
      s = nl === -1 ? "" : t.slice(nl + 1);
      continue;
    }
    if (t.startsWith("/*")) {
      const end = t.indexOf("*/");
      s = end === -1 ? "" : t.slice(end + 2);
      continue;
    }
    return t;
  }
}

function validate(sql: unknown): string | null {
  if (typeof sql !== "string" || sql.trim().length === 0) return "sql is required";
  if (sql.length > MAX_SQL_LENGTH) return `sql exceeds max length ${MAX_SQL_LENGTH}`;
  const head = stripLeadingNoise(sql).toUpperCase();
  if (!head.startsWith("SELECT") && !head.startsWith("WITH")) {
    return "only SELECT / WITH queries are allowed";
  }
  if (FORBIDDEN_KEYWORDS.test(sql)) return "forbidden keyword detected";
  const withoutTrailingSemi = sql.trim().replace(/;+$/, "");
  if (withoutTrailingSemi.includes(";")) return "multiple statements are not allowed";
  return null;
}

export async function handleAdminQuery(
  db: D1Database,
  request: Request | undefined,
  readKey: string | undefined
): Promise<Response> {
  if (request?.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const denied = requireApiKey(request, readKey, "X-Read-Key");
  if (denied) return denied;

  let body: { sql?: unknown; params?: unknown };
  try {
    body = (await request.json()) as { sql?: unknown; params?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const err = validate(body.sql);
  if (err) {
    return new Response(JSON.stringify({ error: err }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawParams = Array.isArray(body.params) ? body.params : [];
  const params: (string | number | boolean | null)[] = [];
  for (const p of rawParams) {
    if (p === null || typeof p === "string" || typeof p === "number" || typeof p === "boolean") {
      params.push(p);
    } else {
      return new Response(
        JSON.stringify({ error: "params must be string | number | boolean | null" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const sql = body.sql as string;
  const start = Date.now();
  try {
    const result = await db.prepare(sql).bind(...params).all();
    const rows = (result.results ?? []) as unknown[];
    const truncated = rows.length > MAX_ROWS;
    return new Response(
      JSON.stringify({
        rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
        count: truncated ? MAX_ROWS : rows.length,
        truncated,
        duration_ms: Date.now() - start,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "Query failed", detail }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
