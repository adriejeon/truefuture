import { supabase } from "../lib/supabaseClient";

/**
 * 사용자 후기 데이터 접근 계층.
 *  - 공개 조회: public_reviews 뷰 (published 만, 개인 식별 컬럼 없음) → 비로그인도 조회 가능
 *  - 작성:      reviews INSERT (RLS: 본인 명의 / 트리거: pending 강제·이용 검증)
 *  - 관리:      reviews SELECT/UPDATE (RLS: is_admin())
 */

const PUBLIC_FIELDS =
  "id,service,rating,content,display_name,is_verified,source,language,published_at,created_at";

const ADMIN_FIELDS =
  "id,user_id,service,rating,content,display_name,result_id,report_id,is_verified,source,language,status,admin_note,reviewed_at,published_at,created_at";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase 클라이언트가 초기화되지 않았습니다. 환경 변수를 확인하세요.");
  }
  return supabase;
}

/** 'ko-KR' → 'ko', 'en-US' → 'en'. 지원 언어 외는 'ko' */
export function toReviewLanguage(lng) {
  const base = String(lng || "").split("-")[0];
  return base === "en" ? "en" : "ko";
}

/* ───────────────────────── 공개 조회 ───────────────────────── */

export async function fetchPublishedReviews({ service = null, language = null, limit = 6 } = {}) {
  const client = requireSupabase();
  let query = client
    .from("public_reviews")
    .select(PUBLIC_FIELDS)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (service) query = query.eq("service", service);
  if (language) query = query.eq("language", language);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchReviewSummary({ service = null, language = null } = {}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_review_summary", {
    p_service: service,
    p_language: language,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    count: Number(row?.review_count ?? 0),
    avg: Number(row?.avg_rating ?? 0),
  };
}

/* ───────────────────────── 작성 ───────────────────────── */

/**
 * 이 결과(result_id) 또는 리포트(report_id)에 대해 내가 이미 남긴 후기.
 * RLS 로 본인 행만 내려오므로 별도 user 필터 불필요.
 */
export async function fetchMyReviewForTarget({ resultId = null, reportId = null } = {}) {
  const client = requireSupabase();
  let query = client.from("reviews").select("id,status,rating,created_at").limit(1);
  if (reportId) query = query.eq("report_id", reportId);
  else if (resultId) query = query.eq("result_id", resultId);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * 후기 등록. status 는 서버 트리거가 항상 pending 으로 강제한다.
 * @returns {{id: string, status: string}}
 */
export async function submitReview({
  userId,
  service,
  rating,
  content,
  displayName,
  resultId = null,
  reportId = null,
  language = "ko",
}) {
  const client = requireSupabase();
  const isReport = service === "report";
  const payload = {
    user_id: userId,
    service,
    rating,
    content: String(content ?? "").trim(),
    display_name: String(displayName ?? "").trim(),
    result_id: isReport ? null : resultId,
    report_id: isReport ? reportId : null,
    language: toReviewLanguage(language),
  };
  const { data, error } = await client
    .from("reviews")
    .insert(payload)
    .select("id,status")
    .single();
  if (error) throw normalizeReviewError(error);
  return data;
}

/** Postgres/트리거 에러를 UI 분기용 code 로 정규화 */
export function normalizeReviewError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  let reviewCode = "generic";
  if (msg.includes("REVIEW_RATE_LIMIT")) reviewCode = "rate_limit";
  else if (code === "23505" || /duplicate key/i.test(msg)) reviewCode = "duplicate";
  else if (msg.includes("REVIEW_AUTH_REQUIRED") || code === "42501") reviewCode = "auth";
  else if (code === "23514") reviewCode = "invalid";
  const err = new Error(msg || "review submit failed");
  err.reviewCode = reviewCode;
  err.cause = error;
  return err;
}

/* ───────────────────────── 관리자 ───────────────────────── */

export async function checkIsAdmin() {
  const client = requireSupabase();
  const { data, error } = await client.rpc("is_admin");
  if (error) throw error;
  return data === true;
}

export async function fetchReviewsForAdmin({ limit = 500 } = {}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("reviews")
    .select(ADMIN_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * 검수 상태 변경 (published / hidden / rejected / pending).
 * reviewed_by·reviewed_at·published_at 은 서버 트리거가 기록한다.
 */
export async function updateReviewStatus(id, status, adminNote) {
  const client = requireSupabase();
  const patch = { status };
  if (adminNote !== undefined) patch.admin_note = adminNote ? String(adminNote).trim() : null;
  const { data, error } = await client
    .from("reviews")
    .update(patch)
    .eq("id", id)
    .select(ADMIN_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/** 후기 영구 삭제 (스팸·테스트 데이터 정리용, 관리자 RLS) */
export async function deleteReview(id) {
  const client = requireSupabase();
  const { error } = await client.from("reviews").delete().eq("id", id);
  if (error) throw error;
}
