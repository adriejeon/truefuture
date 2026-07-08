// Vertex AI 공용 인증/엔드포인트 헬퍼 (Supabase Edge Functions - Deno)
//
// 기존 Google AI Studio 방식( https://generativelanguage.googleapis.com/...:generateContent?key=API_KEY )을
// Vertex AI 방식으로 대체한다. 인증은 서비스 계정(OAuth2 Bearer 토큰) 기반이다.
//
// 필요한 환경 변수(시크릿):
//   - GCP_SERVICE_ACCOUNT_JSON : 서비스 계정 키 JSON 전체(문자열). client_email / private_key / project_id 포함.
//   - VERTEX_PROJECT_ID (선택)  : 미지정 시 서비스 계정 JSON의 project_id 사용.
//   - VERTEX_LOCATION   (선택)  : 미지정 시 "global"(gemini-3.x는 global 전용). 리전 고정 시 예 "us-central1".
//
// 요청/응답 body 포맷(contents / systemInstruction / generationConfig, SSE 파싱)은
// AI Studio와 동일하므로, 호출부는 엔드포인트 URL과 Authorization 헤더만 바꾸면 된다.

// Deno 런타임의 전역 `Deno`를 그대로 사용한다. (다른 함수 파일과의 declare global 중복을 피함)

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

let cachedSA: ServiceAccount | null = null;

function getServiceAccount(): ServiceAccount {
  if (cachedSA) return cachedSA;
  const raw = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new Error(
      "Missing GCP_SERVICE_ACCOUNT_JSON environment variable (Vertex AI 서비스 계정 키).",
    );
  }
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GCP_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GCP_SERVICE_ACCOUNT_JSON missing client_email/private_key.",
    );
  }
  cachedSA = parsed;
  return parsed;
}

export function getVertexProject(): string {
  return Deno.env.get("VERTEX_PROJECT_ID") || getServiceAccount().project_id;
}

export function getVertexLocation(): string {
  // gemini-3.x(gemini-3.5-flash, gemini-3.1-pro-preview 등)는 global 리전에서만 서빙되므로
  // 기본값을 global로 둔다. 특정 리전 고정이 필요하면 VERTEX_LOCATION으로 override.
  return Deno.env.get("VERTEX_LOCATION") || "global";
}

// ---------- base64url / PEM 유틸 ----------

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // \n 이 이스케이프된 형태(\\n)로 들어오는 경우까지 방어
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ---------- OAuth2 access token (JWT bearer, 인메모리 캐시) ----------

async function signJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned =
    `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;
}

let tokenCache: { token: string; exp: number } | null = null;

export async function getVertexAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // 만료 60초 전까지는 캐시 재사용
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;

  const sa = getServiceAccount();
  const jwt = await signJwt(sa);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(
      `Vertex OAuth token 발급 실패 (${res.status}): ${t.substring(0, 200)}`,
    );
  }
  const data = await res.json();
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  tokenCache = { token: data.access_token, exp: now + expiresIn };
  return tokenCache.token;
}

// ---------- Vertex 엔드포인트 URL ----------

export function buildVertexUrl(
  model: string,
  method: "generateContent" | "streamGenerateContent",
): string {
  const project = getVertexProject();
  const location = getVertexLocation();
  const host = location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
  const base =
    `${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}`;
  return method === "streamGenerateContent"
    ? `${base}:streamGenerateContent?alt=sse`
    : `${base}:generateContent`;
}

// ---------- 요청 body 정규화 (Vertex role 규격 강제) ----------
//
// Vertex AI Gemini는 contents[].role 이 반드시 "user" | "model" 이어야 한다.
// (누락/빈 문자열/"assistant"/"system" 등 → 400 "Please use a valid role: user, model.")
// Google AI Studio(generativelanguage)는 role 누락 시 자동으로 "user"로 처리했으나,
// Vertex로 엔드포인트를 바꾸면 동일 body가 400을 낸다. → 여기서 항상 정규화한다.
//
// 변환 규칙:
//   - role 누락/빈값/기타 → "user"
//   - "assistant" | "bot" | "ai" | "model" → "model"
//   - "system" | "developer" → contents에서 제거하고 그 text를 systemInstruction으로 병합
// (OpenAI 스타일 { role, content } 가 흘러들어오더라도 parts 기반으로만 처리한다.)

interface VertexPart {
  text?: string;
  [k: string]: unknown;
}
interface VertexContent {
  role?: string;
  parts?: VertexPart[];
  [k: string]: unknown;
}
interface VertexRequestBody {
  contents?: VertexContent[];
  systemInstruction?: { parts?: VertexPart[] };
  [k: string]: unknown;
}

export function normalizeVertexRequest<T extends VertexRequestBody>(
  requestBody: T,
): T {
  if (!requestBody || !Array.isArray(requestBody.contents)) return requestBody;

  const extractedSystemTexts: string[] = [];
  const normalizedContents: VertexContent[] = [];

  for (const c of requestBody.contents) {
    if (!c || !Array.isArray(c.parts)) continue;
    const rawRole = typeof c.role === "string" ? c.role.trim().toLowerCase() : "";

    // 시스템/개발자 프롬프트는 contents에 넣지 않고 systemInstruction으로 분리
    if (rawRole === "system" || rawRole === "developer") {
      for (const p of c.parts) {
        if (p && typeof p.text === "string" && p.text) extractedSystemTexts.push(p.text);
      }
      continue;
    }

    const role: "user" | "model" =
      rawRole === "model" || rawRole === "assistant" || rawRole === "bot" || rawRole === "ai"
        ? "model"
        : "user"; // "user" 및 누락/빈값/기타 → user

    normalizedContents.push({ ...c, role });
  }

  let systemInstruction = requestBody.systemInstruction;
  if (extractedSystemTexts.length > 0) {
    const existing = Array.isArray(systemInstruction?.parts)
      ? systemInstruction!.parts!
          .map((p) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n\n")
      : "";
    const mergedText = [...extractedSystemTexts, existing].filter(Boolean).join("\n\n");
    systemInstruction = { parts: [{ text: mergedText }] };
  }

  return { ...requestBody, contents: normalizedContents, systemInstruction };
}

// ---------- 요청 payload 구조 로깅 (개인정보/프롬프트 전문 제외) ----------
//
// 개인정보/생년월일/질문 전문/API Key는 남기지 않고, role/구조만 확인 가능하게 한다.
export function logVertexRequestShape(
  requestBody: VertexRequestBody,
  meta: { model: string; method: string },
): void {
  const roles = Array.isArray(requestBody?.contents)
    ? requestBody.contents.map((c) => (typeof c?.role === "string" && c.role ? c.role : "(none)"))
    : [];
  const hasSystemInstruction = !!(
    requestBody?.systemInstruction?.parts &&
    requestBody.systemInstruction.parts.some(
      (p) => typeof p?.text === "string" && p.text.length > 0,
    )
  );
  console.log(
    JSON.stringify({
      logType: "VERTEX_REQUEST",
      provider: "vertex-ai",
      model: meta.model,
      method: meta.method,
      contentsRoles: roles,
      contentsCount: roles.length,
      hasSystemInstruction,
    }),
  );
}
