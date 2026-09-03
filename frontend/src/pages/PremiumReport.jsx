import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as PortOne from "@portone/browser-sdk/v2";
import { FileDown, Telescope, CircleAlert, Check, ShieldCheck, ChevronRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import PrimaryButton from "../components/PrimaryButton";
import BottomNavigation from "../components/BottomNavigation";
import LoginRequiredModal from "../components/LoginRequiredModal";
import FortuneMarkdown from "../components/FortuneMarkdown";
import ReviewPrompt from "../components/ReviewPrompt";
import PageSeo from "../components/PageSeo";
import { usePublishedReviews } from "../hooks/usePublishedReviews";
import {
  ReportHero,
  ReportQuestions,
  ReportOutcomes,
  ReportContents,
  ReportSamplePreview,
  ReportMethod,
  ReportComparison,
  ReportPricing,
  ReportTestimonials,
  ReportFaq,
  ReportStickyCta,
} from "../components/ReportLanding";
import { prepareBuyerEmail } from "../utils/paymentUtils";
import { parseFnError, describeFnError, toUserFacingError } from "../utils/fnError";
import { deliverPdfFile } from "../utils/pdfDelivery";
import { detectInAppBrowser, redirectToExternalBrowser } from "../utils/inAppBrowserDetector";
import { trackPurchase } from "../utils/analytics";
import { colors } from "../constants/colors";
import { getBrandImageAlt } from "../constants/seoMeta";
import { PAGE_SEO } from "../constants/siteSeo";
import { REPORT_PRICE } from "../constants/pricing";
import { REPORT_FAQ_KEYS } from "../constants/faqItems";
import { buildReportGraph, REPORT_REVIEW_PAGE_SIZE } from "../utils/pageJsonLd";

const QUESTION_MAX = 300;
const CHECKOUT_STORAGE_KEY = "premium_report_checkout";

/** 생성 루프 전체 시간 예산 (섹션 3개 + 락 대기/재검증 여유) */
const GENERATION_BUDGET_MS = 25 * 60 * 1000;
/** 서버가 lockedForSeconds 를 안 줄 때의 락 대기 기본값 */
const DEFAULT_LOCK_WAIT_SECONDS = 8;

/** signal 로 중단 가능한 sleep. 중단되면 false 를 돌려준다. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve(true);
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve(false);
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

/**
 * 서버가 남긴 내부 오류 문자열(error_message / code)을 사용자 문구로 분류.
 * 원문은 노출하지 않고 console 에만 남긴다.
 *
 * @returns {{text: string, retryable: boolean}}
 */
function classifyReportFailure(rawMessage, code, t) {
  const raw = String(rawMessage || "");
  if (code === "VALIDATION" || /^VALIDATION:/i.test(raw)) {
    return { text: t("premium_report.error_failed_validation"), retryable: true };
  }
  if (code === "SAFETY" || /^FATAL:/i.test(raw) || /SAFETY/i.test(raw)) {
    return { text: t("premium_report.error_failed_safety"), retryable: false };
  }
  if (code === "CAPPED" || raw.includes("상한") || raw.includes("반복 실패")) {
    return { text: t("premium_report.error_failed_capped"), retryable: false };
  }
  return { text: t("premium_report.error_failed_generic"), retryable: true };
}

/**
 * 구버전 서버가 최종 실패를 500 으로 내려주던 경우인지 판별.
 * (신버전은 200 + {failed:true} 로 내려준다)
 */
function isLegacyFinalFailure(status, message) {
  if (status !== 500) return false;
  const msg = String(message || "");
  return (
    msg.includes("리포트 생성이 반복 실패했습니다") ||
    msg.includes("일시적인 오류가 발생했습니다. 결제는 안전하게")
  );
}

function PremiumReport() {
  const { t, i18n } = useTranslation();
  const isEnglish = i18n.language?.startsWith("en");
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loadingAuth } = useAuth();
  const {
    profiles,
    selectedProfile,
    loading: profilesLoading,
    createProfile,
    deleteProfile,
    selectProfile,
  } = useProfiles();
  const [searchParams, setSearchParams] = useSearchParams();

  // view: "intro" | "paying" | "generating" | "done" | "failed"
  const [view, setView] = useState("intro");

  // 리포트 구매 후기 (랜딩 후기 섹션 + Product JSON-LD 가 같은 데이터를 쓴다)
  const {
    reviews: reportReviews,
    summary: reportReviewSummary,
    loading: reportReviewsLoading,
    hasMore: reportReviewsHasMore,
    loadingMore: reportReviewsLoadingMore,
    loadMore: loadMoreReportReviews,
  } = usePublishedReviews({
    service: "report",
    language: i18n.language,
    pageSize: REPORT_REVIEW_PAGE_SIZE,
  });

  // 랜딩 FAQ(펼침형)와 FAQPage 구조화 데이터가 같은 i18n 키를 쓴다 — 화면에 없는 답변이 마크업에 들어가지 않도록
  const reportFaqItems = useMemo(
    () =>
      REPORT_FAQ_KEYS.map((key) => ({
        title: t(`premium_report.landing.${key}_q`),
        content: t(`premium_report.landing.${key}_a`),
      })),
    [t]
  );

  // Product JSON-LD: 후기·FAQ 섹션이 보이는 intro 뷰에서만 평점·리뷰·FAQ 를 얹는다(마크업↔화면 일치)
  const reportNodes = useMemo(
    () =>
      buildReportGraph(
        view === "intro"
          ? { reviews: reportReviews, summary: reportReviewSummary, faqItems: reportFaqItems }
          : {}
      ),
    [view, reportReviews, reportReviewSummary, reportFaqItems]
  );
  const [question, setQuestion] = useState("");
  const [report, setReport] = useState(null); // premium_reports row
  const [myReports, setMyReports] = useState([]);
  const [error, setError] = useState("");
  const [genError, setGenError] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pdfSaving, setPdfSaving] = useState(false);
  /** PDF 는 만들어졌지만 공유 시트를 열 사용자 제스처가 만료돼 재탭이 필요한 상태 (모바일) */
  const [pdfReady, setPdfReady] = useState(false);
  /** 실패 화면에서 '이어서 생성하기'를 보여줄지 (CAPPED/SAFETY 는 숨김) */
  const [genRetryable, setGenRetryable] = useState(true);
  /** 실패 원인이 세션 만료라 다시 로그인해야 하는 경우 */
  const [genNeedsLogin, setGenNeedsLogin] = useState(false);
  /** 로그인하지 않은 채 결제 리다이렉트로 돌아온 경우 */
  const [needsLoginToResume, setNeedsLoginToResume] = useState(false);
  const genLoopRef = useRef(false);
  const genAbortRef = useRef(null);
  const reportIdRef = useRef(null);
  const consecutiveErrorsRef = useRef(0);
  const isMountedRef = useRef(true);
  const redirectHandledRef = useRef(false);
  const recoveryTriedRef = useRef(false);
  /** 생성한 PDF Blob 캐시 { reportId, blob, filename } — 재탭 시 즉시 공유하기 위해 보관 */
  const pdfCacheRef = useRef(null);

  const reportIdParam = searchParams.get("id");

  // ===== 랜딩(intro) 전용: 하단 고정 CTA 노출 판단 + 섹션 이동 =====

  /** 히어로 CTA·신청 박스가 둘 다 화면 밖일 때만 하단 고정 CTA 를 띄운다 */
  const heroCtaRef = useRef(null);
  const purchaseBoxRef = useRef(null);
  const questionInputRef = useRef(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const [purchaseBoxVisible, setPurchaseBoxVisible] = useState(false);
  const showStickyCta = view === "intro" && !heroCtaVisible && !purchaseBoxVisible;

  useEffect(() => {
    if (view !== "intro") return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;
    const heroEl = heroCtaRef.current;
    const boxEl = purchaseBoxRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === heroEl) setHeroCtaVisible(entry.isIntersecting);
          if (entry.target === boxEl) setPurchaseBoxVisible(entry.isIntersecting);
        }
      },
      { threshold: 0.05 }
    );
    if (heroEl) observer.observe(heroEl);
    if (boxEl) observer.observe(boxEl);
    return () => observer.disconnect();
  }, [view]);

  const scrollToPurchase = useCallback(() => {
    purchaseBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToSample = useCallback(() => {
    document.getElementById("report-sample")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /** 질문 예시 칩 → 신청서 질문란에 담고 신청 박스로 이동 */
  const handlePickQuestion = useCallback(
    (text) => {
      setQuestion(String(text || "").slice(0, QUESTION_MAX));
      scrollToPurchase();
      // 스크롤이 끝난 뒤 포커스 (모바일 키보드가 스크롤을 끊지 않도록 지연)
      setTimeout(() => questionInputRef.current?.focus({ preventScroll: true }), 450);
    },
    [scrollToPurchase]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // 언마운트 시 대기·재호출만 중단한다 (진행 중인 서버 요청은 그대로 완료된다)
      try {
        genAbortRef.current?.abort();
      } catch (_) {}
    };
  }, []);

  // 탭이 다시 보이면 백그라운드에서 누적된 일시 오류 카운트를 초기화해 이어서 시도한다
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") consecutiveErrorsRef.current = 0;
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ===== 데이터 조회 =====

  const fetchReportRow = useCallback(async (reportId) => {
    const { data, error: fetchErr } = await supabase
      .from("premium_reports")
      .select(
        "id, status, sections_done, sections_total, content, question, profile_snapshot, created_at, error_message"
      )
      .eq("id", reportId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    return data;
  }, []);

  const fetchMyReports = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from("premium_reports")
        .select("id, status, sections_done, sections_total, profile_snapshot, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setMyReports(data || []);
    } catch (_) {
      // 목록 조회 실패는 치명적이지 않음
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMyReports();
  }, [fetchMyReports]);

  // ===== 리포트 생성 루프 (섹션 순차 생성, 재진입/재시도 안전) =====

  /** 실패 화면 전환 (언마운트/중단 후에는 아무것도 하지 않는다) */
  const showFailed = useCallback((text, options = {}) => {
    if (!isMountedRef.current) return;
    setGenError(text);
    setGenRetryable(options.retryable !== false);
    setGenNeedsLogin(!!options.needsLogin);
    setView("failed");
  }, []);

  const runGenerationLoop = useCallback(
    async (reportId, controller) => {
      const signal = controller.signal;
      const alive = () => isMountedRef.current && !signal.aborted;

      genLoopRef.current = true;
      consecutiveErrorsRef.current = 0;
      setGenError("");
      setGenRetryable(true);
      setGenNeedsLogin(false);
      setView("generating");

      let refreshedSession = false;
      let iteration = 0;
      const deadline = Date.now() + GENERATION_BUDGET_MS;

      try {
        // 반복 횟수가 아니라 시간 예산으로 종료를 판단한다 (락 대기·재검증이 횟수를 잡아먹지 않도록)
        while (Date.now() < deadline) {
          if (!alive()) return;
          iteration += 1;

          let row = null;
          try {
            row = await fetchReportRow(reportId);
          } catch (_) {}
          if (!alive()) return;
          if (row) {
            setReport(row);
            if (row.status === "DONE") {
              setView("done");
              fetchMyReports();
              return;
            }
            // 첫 번째 순회에서는 FAILED 를 종료 조건으로 보지 않는다
            // (재시도 버튼으로 들어오면 행이 아직 FAILED 인 상태라 generate 를 한 번도 못 부르게 된다)
            if (row.status === "FAILED" && iteration > 1) {
              console.error("❌ 리포트 생성 실패(행 상태):", row.error_message);
              const failure = classifyReportFailure(row.error_message, null, t);
              showFailed(failure.text, { retryable: failure.retryable });
              return;
            }
          }

          const { data, error: fnError } = await supabase.functions.invoke(
            "premium-report",
            { body: { action: "generate", report_id: reportId } }
          );
          if (!alive()) return;

          if (fnError) {
            const parsed = await parseFnError(fnError);

            // 다른 요청이 생성 중 → 안내된 시간만큼 대기하고 재확인 (오류로 카운트하지 않음)
            if (parsed.locked || parsed.status === 409) {
              const waitSeconds =
                Number(parsed.details?.lockedForSeconds) || DEFAULT_LOCK_WAIT_SECONDS;
              await sleep(waitSeconds * 1000, signal);
              continue;
            }

            // 세션 만료 → 1회 갱신 후 재시도
            if (parsed.status === 401 || parsed.code === "UNAUTHORIZED") {
              if (!refreshedSession) {
                refreshedSession = true;
                try {
                  await supabase.auth.refreshSession();
                } catch (_) {}
                continue;
              }
              showFailed(t("premium_report.error_login_again"), {
                retryable: false,
                needsLogin: true,
              });
              return;
            }

            // 구버전 서버: 최종 실패를 500 으로 내려주던 경우 → 재시도하지 않는다
            if (isLegacyFinalFailure(parsed.status, parsed.message)) {
              console.error("❌ 리포트 생성 최종 실패(구버전 500):", parsed.message);
              const failure = classifyReportFailure(parsed.message, null, t);
              showFailed(failure.text, { retryable: failure.retryable });
              return;
            }

            // 서버/워커 일시 장애(5xx·네트워크)는 잠시 후 이어서 재시도
            const isTransientHttp =
              parsed.status == null || parsed.status >= 500 || parsed.status === 429;
            if (isTransientHttp && consecutiveErrorsRef.current < 5) {
              consecutiveErrorsRef.current += 1;
              await sleep(15000, signal);
              continue;
            }
            console.error("❌ 리포트 생성 호출 실패:", parsed);
            showFailed(describeFnError(parsed, t));
            return;
          }

          // 서버가 200 으로 알려주는 최종 실패
          if (data?.success === false && data?.failed) {
            console.error("❌ 리포트 생성 최종 실패:", data.code, data.error);
            const failure = classifyReportFailure(data.error, data.code, t);
            const retryable = data.retryable === false ? false : failure.retryable;
            showFailed(failure.text, { retryable });
            return;
          }
          if (!data?.success) {
            console.error("❌ 리포트 생성 응답 오류:", data);
            showFailed(t("premium_report.error_failed_generic"));
            return;
          }
          consecutiveErrorsRef.current = 0;

          // 서버가 일시 오류(쿼터 등)로 이번 호출을 건너뜀 → 잠시 후 재호출
          if (data.transient) {
            await sleep((Number(data.waitSeconds) || 20) * 1000, signal);
            continue;
          }
          // 원고 검증 실패 → 교정 지시가 저장됐으니 곧바로 재호출해 재생성 (핫루프 방지용 최소 간격)
          if (data.revalidate) {
            await sleep(1000, signal);
            continue;
          }

          try {
            const updated = await fetchReportRow(reportId);
            if (updated && alive()) setReport(updated);
          } catch (_) {}
          if (!alive()) return;

          if (data.done) {
            setView("done");
            fetchMyReports();
            return;
          }
        }
        if (alive()) showFailed(t("premium_report.error_timeout"));
      } catch (err) {
        console.error("❌ 리포트 생성 실패:", err);
        showFailed(toUserFacingError(err, t, "premium_report.error_generate"));
      } finally {
        // 이미 다른 루프로 교체됐다면 그 루프의 플래그를 건드리지 않는다
        if (genAbortRef.current === controller) genLoopRef.current = false;
      }
    },
    [fetchReportRow, fetchMyReports, showFailed, t]
  );

  /** 같은 리포트면 중복 루프를 막고, 다른 리포트면 이전 루프를 중단하고 새로 시작한다 */
  const startGenerationLoop = useCallback(
    (reportId) => {
      if (!reportId) return;
      if (genLoopRef.current && reportIdRef.current === reportId) return;
      try {
        genAbortRef.current?.abort();
      } catch (_) {}
      const controller = new AbortController();
      genAbortRef.current = controller;
      reportIdRef.current = reportId;
      runGenerationLoop(reportId, controller);
    },
    [runGenerationLoop]
  );

  // ===== URL ?id= 로 기존 리포트 열람/재개 =====

  useEffect(() => {
    if (!reportIdParam || loadingAuth) return;
    if (!user) return; // RLS 로 어차피 본인 것만 조회됨
    // 다른 리포트로 이동하면 이전 생성 루프의 대기·재호출을 중단한다
    if (reportIdRef.current && reportIdRef.current !== reportIdParam) {
      try {
        genAbortRef.current?.abort();
      } catch (_) {}
      genLoopRef.current = false;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchReportRow(reportIdParam);
        if (cancelled) return;
        if (!row) {
          setError(t("premium_report.error_not_found"));
          setView("intro");
          return;
        }
        setReport(row);
        if (row.status === "DONE") {
          setView("done");
        } else if (row.status === "FAILED") {
          // 내부 오류 원문은 콘솔에만 남기고, 화면에는 분류된 안내 문구를 보여준다
          console.error("❌ 리포트 실패 원문:", row.error_message);
          const failure = classifyReportFailure(row.error_message, null, t);
          setGenError(failure.text);
          setGenRetryable(failure.retryable);
          setGenNeedsLogin(false);
          setView("failed");
        } else {
          // PAID / GENERATING → 이어서 생성
          startGenerationLoop(row.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toUserFacingError(err, t, "premium_report.error_load"));
          setView("intro");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportIdParam, user, loadingAuth]);

  // ===== 결제 완료 처리 (구매 검증 → 리포트 행 생성 → 생성 시작) =====

  const completePurchase = useCallback(
    async ({ merchantUid, paymentId, profileId, questionText }) => {
      setView("paying");
      setError("");
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "premium-report",
          {
            body: {
              action: "purchase",
              merchant_uid: merchantUid,
              imp_uid: paymentId || merchantUid,
              profile_id: profileId,
              question: questionText || "",
            },
          }
        );
        if (fnError) {
          const parsed = await parseFnError(fnError);
          throw new Error(describeFnError(parsed, t));
        }
        if (!data?.success || !data?.reportId) {
          throw new Error(data?.error || t("premium_report.error_purchase"));
        }

        try {
          sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
        } catch (_) {}

        if (!data.alreadyProcessed) {
          setTimeout(() => {
            try {
              trackPurchase({
                transaction_id: merchantUid,
                value: REPORT_PRICE,
                currency: "KRW",
                items: [
                  {
                    item_id: "premium_report",
                    item_name: "프리미엄 상세 리포트",
                    price: REPORT_PRICE,
                    quantity: 1,
                    item_category: "리포트",
                  },
                ],
              });
            } catch (_) {}
          }, 0);
        }

        // URL에 리포트 ID 반영 (새로고침해도 이어서 생성/열람 가능)
        setSearchParams({ id: data.reportId }, { replace: true });
        startGenerationLoop(data.reportId);
      } catch (err) {
        console.error("❌ 리포트 구매 처리 실패:", err);
        if (!isMountedRef.current) return;
        setError(toUserFacingError(err, t, "premium_report.error_purchase"));
        setView("intro");
      }
    },
    [startGenerationLoop, setSearchParams, t]
  );

  // ===== 모바일 결제 리다이렉트 복귀 처리 =====

  useEffect(() => {
    if (redirectHandledRef.current) return;
    if (loadingAuth) return;
    const isPayRedirect = searchParams.get("pay_redirect") === "1";
    if (!isPayRedirect) return;
    // 로그인 세션이 유실된 채 복귀한 경우: 결제 쿼리를 버리지 않고 로그인 후 이 URL 로 되돌아오게 한다
    if (!user) {
      setNeedsLoginToResume(true);
      setView("intro");
      return;
    }
    setNeedsLoginToResume(false);
    redirectHandledRef.current = true;

    const code = searchParams.get("code");
    const failMessage = searchParams.get("message");
    const paymentId = searchParams.get("paymentId");
    // 주의: 쿼리의 txId 는 PortOne 거래번호로, 결제 조회 API 의 결제 ID 가 아니다 (조회 시 404).

    let stored = null;
    try {
      const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (_) {}

    // 결제 실패/취소 → 결제 컨텍스트 정리 (남겨두면 다음 방문 때 무의미한 복구 조회가 발생)
    if (code) {
      try {
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
      } catch (_) {}
      setError(failMessage || t("premium_report.error_pay_cancelled"));
      setSearchParams({}, { replace: true });
      setView("intro");
      return;
    }

    const merchantUid = paymentId || stored?.merchantUid;
    // sessionStorage 가 유실돼도 redirectUrl 에 실어 보낸 profile_id 로 복원한다
    const profileId = stored?.profileId || searchParams.get("profile_id");
    if (!merchantUid) {
      setError(t("premium_report.error_redirect_context"));
      setSearchParams({}, { replace: true });
      setView("intro");
      return;
    }

    setSearchParams({}, { replace: true });
    completePurchase({
      merchantUid,
      paymentId: merchantUid, // PortOne V2 결제 ID = 우리가 생성한 merchantUid
      profileId: profileId || null,
      questionText: stored?.question || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, loadingAuth, completePurchase]);

  // ===== 미완료 결제 자동 복구 =====
  // 결제는 승인됐는데 리포트 생성 확인 단계에서 오류가 났던 경우(예: 서버 거절·네트워크 중단),
  // 결제 컨텍스트가 sessionStorage에 남아 있으므로 페이지 재방문 시 자동으로 이어서 처리한다.
  useEffect(() => {
    if (loadingAuth || !user) return;
    if (reportIdParam || searchParams.get("pay_redirect")) return;
    if (recoveryTriedRef.current) return;
    recoveryTriedRef.current = true;

    let stored = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY) || "null");
    } catch (_) {}
    if (!stored?.merchantUid) return;

    (async () => {
      setView("paying");
      try {
        const { data, error: fnError } = await supabase.functions.invoke("premium-report", {
          body: {
            action: "purchase",
            merchant_uid: stored.merchantUid,
            imp_uid: stored.merchantUid,
            profile_id: stored.profileId || null,
            question: stored.question || "",
          },
        });
        if (!fnError && data?.success && data?.reportId) {
          try {
            sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
          } catch (_) {}
          setSearchParams({ id: data.reportId }, { replace: true });
          startGenerationLoop(data.reportId);
          return;
        }
        const parsed = fnError
          ? await parseFnError(fnError)
          : { status: null, code: data?.code ?? null, message: data?.error || "" };
        const msg = parsed.message || "";
        // "조회 실패"(503 등)·"찾을 수 없"(프로필 404)은 결제 없음이 아니므로 컨텍스트를 지우지 않는다
        const isLookupFailure = /조회 실패|찾을 수 없/.test(msg);
        let shouldClearContext;
        if (parsed.code) {
          shouldClearContext =
            parsed.code === "PAYMENT_NOT_FOUND" || parsed.code === "NOT_PAID";
        } else {
          shouldClearContext =
            !isLookupFailure && (parsed.status === 404 || msg.includes("완료되지 않았습니다"));
        }

        if (shouldClearContext) {
          // 결제 자체가 없거나 미완료였던 컨텍스트 → 조용히 정리하고 일반 화면으로
          try {
            sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
          } catch (_) {}
        } else if (msg || parsed.code) {
          // 결제가 잡혀 있을 수 있는 실패 → 컨텍스트 유지 + 안내
          setError(describeFnError(parsed, t));
        }
      } catch (_) {
        // 네트워크 등 일시 오류 — 다음 방문 때 다시 시도할 수 있게 컨텍스트 유지
      } finally {
        if (isMountedRef.current) setView((v) => (v === "paying" ? "intro" : v));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingAuth, reportIdParam]);

  // ===== 결제 시작 =====

  const handlePurchaseClick = async () => {
    setError("");
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    if (!selectedProfile) {
      setShowProfileModal(true);
      return;
    }

    const merchantUid = `report_${Date.now()}_${user.id.slice(0, 8)}`;
    const checkoutContext = {
      merchantUid,
      profileId: selectedProfile.id,
      question: question.trim(),
    };
    try {
      sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(checkoutContext));
    } catch (_) {}

    setView("paying");
    try {
      // sessionStorage 가 유실돼도 복귀 처리에서 프로필을 알 수 있도록 쿼리에 실어 보낸다
      const redirectUrl = `${window.location.origin}/report?pay_redirect=1&profile_id=${encodeURIComponent(
        selectedProfile.id
      )}`;
      const response = await PortOne.requestPayment({
        storeId: import.meta.env.VITE_PORTONE_STORE_ID,
        channelKey: import.meta.env.VITE_PORTONE_CHANNEL_KEY,
        paymentId: merchantUid,
        orderName: "프리미엄 상세 리포트",
        totalAmount: REPORT_PRICE,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          customerId: user.id,
          fullName: "우주탐험가",
          phoneNumber: "010-0000-0000",
          email: prepareBuyerEmail(user),
        },
        // 서버가 sessionStorage 없이도 결제 맥락(프로필·질문)을 복원할 수 있게 결제에 실어 보낸다
        customData: {
          k: "report",
          u: user.id,
          p: selectedProfile.id,
          q: question.trim().slice(0, 500),
        },
        redirectUrl,
      });

      if (response?.code != null) {
        // PG 단계 실패/취소: 승인된 결제가 없으므로 결제 컨텍스트를 정리
        try {
          sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
        } catch (_) {}
        throw new Error(response.message || t("premium_report.error_pay_failed"));
      }

      await completePurchase({
        merchantUid,
        paymentId: response?.paymentId || merchantUid,
        profileId: selectedProfile.id,
        questionText: question.trim(),
      });
    } catch (err) {
      console.error("❌ 결제 오류:", err);
      if (!isMountedRef.current) return;
      setError(toUserFacingError(err, t, "premium_report.error_pay_failed"));
      setView("intro");
    }
  };

  const handleRetryGenerate = () => {
    // 루프에 넘겼던 id 를 우선 사용 (report 상태가 아직 갱신되지 않았을 수 있음)
    const targetId = reportIdRef.current || reportIdParam || report?.id;
    if (targetId) startGenerationLoop(targetId);
  };

  const handleGoLogin = () => {
    navigate("/login", {
      state: {
        from: {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
      },
    });
  };

  const handleCreateProfile = async (profileData) => {
    await createProfile(profileData);
  };

  // ===== PDF 저장 =====

  // 리포트가 바뀌면 PDF 캐시·재탭 상태 초기화
  useEffect(() => {
    pdfCacheRef.current = null;
    setPdfReady(false);
  }, [report?.id]);

  /**
   * 생성된 PDF 를 기기에 전달하고 결과에 따라 UI 를 갱신한다.
   * 모바일은 공유 시트(파일에 저장), 데스크톱은 다운로드. 인앱 브라우저 등 저장 불가 환경은 외부 브라우저 안내.
   */
  const finishPdfDelivery = async (blob, filename) => {
    const outcome = await deliverPdfFile(blob, filename);
    if (outcome === "retap") {
      // 사용자 제스처가 만료돼 공유 시트를 열지 못함 → 버튼을 "눌러서 저장" 상태로 바꿔 재탭 유도
      setPdfReady(true);
      return;
    }
    setPdfReady(false);
    if (outcome === "unsupported") {
      const { isInApp, appKey } = detectInAppBrowser();
      if (isInApp) {
        if (window.confirm(t("premium_report.pdf_inapp_confirm"))) {
          const attempted = redirectToExternalBrowser(appKey, window.location.href);
          if (!attempted) alert(t("premium_report.pdf_inapp_manual"));
        }
      } else {
        alert(t("premium_report.pdf_unsupported"));
      }
    }
  };

  // 텍스트 레이어를 가진 실제 PDF 생성 (@react-pdf/renderer + 한글 서브셋 폰트)
  const handleSavePdf = async () => {
    if (!report?.content || pdfSaving) return;

    // 이미 만들어 둔 PDF 가 있으면(재탭) 비동기 작업 없이 곧바로 전달 — 공유 시트는 클릭 제스처 안에서만 열린다
    const cached = pdfCacheRef.current;
    if (cached && cached.reportId === report.id) {
      try {
        await finishPdfDelivery(cached.blob, cached.filename);
      } catch (err) {
        console.error("❌ PDF 저장 실패:", err);
        alert(t("premium_report.pdf_error"));
      }
      return;
    }

    setPdfSaving(true);
    try {
      const [{ pdf }, { registerReportFonts, buildReportPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../pdf/reportPdf"),
      ]);
      registerReportFonts("/fonts");

      const doc = buildReportPdfDocument({
        snapshot: report.profile_snapshot || {},
        question: report.question || null,
        content: report.content,
        createdAt: report.created_at,
      });
      const blob = await pdf(doc).toBlob();

      const name = report.profile_snapshot?.name || "내담자";
      const dateStr = (report.created_at || "").substring(0, 10).replace(/-/g, "");
      const filename = `진짜미래_상세리포트_${name}_${dateStr}.pdf`;

      pdfCacheRef.current = { reportId: report.id, blob, filename };
      await finishPdfDelivery(blob, filename);
    } catch (err) {
      console.error("❌ PDF 저장 실패:", err);
      alert(t("premium_report.pdf_error"));
    } finally {
      setPdfSaving(false);
    }
  };

  // ===== 렌더 헬퍼 =====

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    const locale = isEnglish ? "en-US" : "ko-KR";
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };

  const statusChip = (row) => {
    if (row.status === "DONE")
      return { text: t("premium_report.status_done"), cls: "bg-green-500/20 text-green-400" };
    if (row.status === "FAILED")
      return { text: t("premium_report.status_failed"), cls: "bg-red-500/20 text-red-400" };
    return {
      text: t("premium_report.status_generating", {
        done: row.sections_done,
        total: row.sections_total,
      }),
      cls: "bg-amber-500/20 text-amber-400",
    };
  };

  const snapshotLabel = (snapshot) => {
    if (!snapshot) return "";
    const birth = String(snapshot.birth_date || "").substring(0, 10).replace(/-/g, ".");
    return [snapshot.name, birth].filter(Boolean).join(" · ");
  };

  const generatingSteps = [
    t("premium_report.step_1"),
    t("premium_report.step_2"),
    t("premium_report.step_3"),
  ];

  /** 랜딩 전용 문구 단축 헬퍼 */
  const L = (key, opts) => t(`premium_report.landing.${key}`, opts);

  // ===== 뷰 =====

  /**
   * 인트로(랜딩) 뷰 — 구매 흐름 순서:
   * 히어로 → (복귀 안내·에러) → (내 리포트 바로가기) → 사용자의 질문 → 알 수 있는 것 → 실제 구성
   * → 샘플 미리보기 → 분석 방식 → 무료/AI 비교 → 가격 가치 → 후기 → 신청 박스(CTA) → FAQ → 내 리포트
   */
  const renderIntro = () => (
    // break-keep: 한국어 문장이 어절 단위로 줄바꿈되도록 (제목 끝 글자 한 자만 떨어지는 현상 방지)
    <div className="break-keep">
      <ReportHero
        price={REPORT_PRICE}
        onBuy={scrollToPurchase}
        onSample={scrollToSample}
        ctaRef={heroCtaRef}
      />

      {/* 결제 후 로그인 세션이 유실된 채 복귀한 경우 */}
      {needsLoginToResume && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-lg p-4 mb-6">
          <p className="text-amber-100 text-sm mb-3 whitespace-pre-line">
            {t("errors.login_required")}
          </p>
          <PrimaryButton type="button" variant="gold" fullWidth onClick={handleGoLogin}>
            {t("premium_report.login_continue")}
          </PrimaryButton>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
          <p className="text-red-200 text-sm whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* 이미 받은 리포트가 있는 분은 랜딩을 다 읽지 않고 바로 열람할 수 있게 */}
      {user && myReports.length > 0 && (
        <button
          type="button"
          onClick={() =>
            document.getElementById("my-reports")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/40 hover:border-slate-500 transition-colors text-left"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <FileDown className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} style={{ color: colors.primary }} aria-hidden="true" />
            <span className="text-sm text-slate-200 truncate">
              {L("my_reports_strip", { count: myReports.length })}
            </span>
          </span>
          <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: colors.primary }}>
            {L("my_reports_open")}
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
          </span>
        </button>
      )}

      <ReportQuestions onPick={handlePickQuestion} />
      <ReportOutcomes />
      <ReportContents />
      <ReportSamplePreview onBuy={scrollToPurchase} />
      <ReportMethod />
      <ReportComparison />
      <ReportPricing price={REPORT_PRICE} onBuy={scrollToPurchase} />
      <ReportTestimonials
        reviews={reportReviews}
        summary={reportReviewSummary}
        loading={reportReviewsLoading}
        hasMore={reportReviewsHasMore}
        loadingMore={reportReviewsLoadingMore}
        onLoadMore={loadMoreReportReviews}
      />

      {/* 신청 박스 — 결제 CTA */}
      <section ref={purchaseBoxRef} id="report-purchase" className="py-8 scroll-mt-20">
        <div
          className="rounded-2xl border p-5 sm:p-6"
          style={{ borderColor: "rgba(225, 172, 63, 0.5)", backgroundColor: "rgba(37, 61, 135, 0.2)" }}
        >
          <div className="mb-5">
            <h2 className="text-xl font-bold text-white mb-1">{L("purchase_title")}</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{L("purchase_sub")}</p>
          </div>

          {/* 프로필 선택 */}
          <div className="mb-5">
            <p className="text-white font-medium mb-2">{t("premium_report.profile_label")}</p>
            <ProfileSelector
              profiles={profiles}
              selectedProfile={selectedProfile}
              onSelectProfile={selectProfile}
              onCreateProfile={() => {
                if (!user) {
                  setShowLoginModal(true);
                  return;
                }
                setShowProfileModal(true);
              }}
              onDeleteProfile={deleteProfile}
              loading={!!user && profilesLoading}
            />
            <p className="text-xs text-slate-400 mt-2">{t("premium_report.profile_hint")}</p>
          </div>

          {/* 질문 입력 */}
          <div className="mb-5">
            <p className="text-white font-medium mb-2">
              {t("premium_report.question_label")}{" "}
              <span className="text-slate-400 text-sm font-normal">
                ({t("premium_report.optional")})
              </span>
            </p>
            <textarea
              ref={questionInputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, QUESTION_MAX))}
              placeholder={t("premium_report.question_placeholder")}
              rows={4}
              className="w-full px-4 py-3 bg-[#0F0F2B] border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none resize-none text-sm leading-relaxed"
              style={{ caretColor: colors.primary }}
              onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "")}
            />
            <div className="flex items-start justify-between gap-3 mt-1">
              <p className="text-xs text-slate-400 leading-relaxed">{L("question_hint")}</p>
              <p className="text-xs text-slate-400 shrink-0">
                {question.length}/{QUESTION_MAX}
              </p>
            </div>
          </div>

          {/* 가격 요약 */}
          <div className="flex items-baseline justify-between pt-4 mb-4 border-t border-slate-700">
            <span className="text-sm text-slate-300">{L("purchase_price_label")}</span>
            <span className="text-2xl font-bold" style={{ color: colors.primary }}>
              {REPORT_PRICE.toLocaleString()}
              {t("common.unit_won")}
            </span>
          </div>

          {/* 결제 버튼 */}
          <PrimaryButton type="button" variant="gold" fullWidth onClick={handlePurchaseClick}>
            {t("premium_report.buy_button", { price: REPORT_PRICE.toLocaleString() })}
          </PrimaryButton>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center leading-relaxed">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" strokeWidth={2} style={{ color: colors.primary }} aria-hidden="true" />
            {L("purchase_trust")}
          </p>
        </div>

        {/* 유의사항 */}
        <div className="mt-4 p-4 rounded-lg bg-slate-800/40 border border-slate-700">
          <ul className="text-xs text-slate-400 space-y-1.5 leading-relaxed list-disc list-inside">
            <li>{t("premium_report.notice_time")}</li>
            <li>{t("premium_report.notice_revisit")}</li>
            <li>{t("premium_report.notice_birthtime")}</li>
            <li>{t("premium_report.notice_refund")}</li>
          </ul>
        </div>
      </section>

      <ReportFaq />

      {/* 내 리포트 목록 */}
      {user && myReports.length > 0 && (
        <div id="my-reports" className="mt-6 scroll-mt-20">
          <h2 className="text-lg font-semibold text-white mb-4">
            {t("premium_report.my_reports_title")}
          </h2>
          <div className="space-y-3">
            {myReports.map((row) => {
              const chip = statusChip(row);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setError("");
                    setSearchParams({ id: row.id });
                  }}
                  className="w-full text-left bg-slate-800/50 rounded-xl p-4 border border-slate-700 hover:border-slate-500 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-white font-medium truncate">
                      {snapshotLabel(row.profile_snapshot) ||
                        t("premium_report.report_fallback_name")}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${chip.cls}`}>
                      {chip.text}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {t("premium_report.purchased_at")} {formatDate(row.created_at)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderPaying = () => (
    <div className="text-center py-20">
      <div className="animate-spin rounded-full h-14 w-14 border-4 border-t-transparent mx-auto mb-6" style={{ borderColor: `${colors.primary} transparent ${colors.primary} ${colors.primary}` }}></div>
      <h2 className="text-xl font-bold text-white mb-2">
        {t("premium_report.paying_title")}
      </h2>
      <p className="text-slate-400 text-sm">{t("premium_report.paying_desc")}</p>
    </div>
  );

  const renderGenerating = () => {
    const done = report?.sections_done ?? 0;
    const total = report?.sections_total ?? 3;
    const pct = Math.min(95, Math.round((done / total) * 100) + 8);
    return (
      <div className="py-8">
        <div className="text-center mb-8">
          <Telescope
            className="w-12 h-12 mx-auto mb-4"
            strokeWidth={1.5}
            style={{ color: colors.primary }}
            aria-hidden="true"
          />
          <h2 className="text-xl font-bold text-white mb-2">
            {t("premium_report.generating_title")}
          </h2>
          <p className="text-slate-400 text-sm whitespace-pre-line">
            {t("premium_report.generating_desc")}
          </p>
        </div>

        {/* 진행 바 */}
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-6">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: colors.primary }}
          ></div>
        </div>

        {/* 단계 표시 */}
        <div className="space-y-3 mb-8">
          {generatingSteps.map((label, idx) => {
            const isDoneStep = idx < done;
            const isCurrent = idx === done;
            return (
              <div
                key={label}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  isCurrent
                    ? "border-slate-500 bg-slate-800/60"
                    : "border-slate-700 bg-slate-800/30"
                }`}
              >
                {isDoneStep ? (
                  <Check className="w-4 h-4 text-green-400" strokeWidth={2.5} aria-hidden="true" />
                ) : isCurrent ? (
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${colors.primary} transparent ${colors.primary} ${colors.primary}` }}></span>
                ) : (
                  <span className="inline-block w-4 h-4 rounded-full border border-slate-600"></span>
                )}
                <span className={`text-sm ${isDoneStep || isCurrent ? "text-white" : "text-slate-500"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* 완료된 파트 미리보기 */}
        {report?.content && (
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 sm:p-6">
            <p className="text-xs text-slate-400 mb-4">
              {t("premium_report.preview_label")}
            </p>
            <div className="premium-report-md">
              <FortuneMarkdown>{report.content}</FortuneMarkdown>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFailed = () => (
    <div className="py-16 text-center">
      <CircleAlert
        className="w-12 h-12 mx-auto mb-4 text-amber-400"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="text-xl font-bold text-white mb-3">
        {t("premium_report.failed_title")}
      </h2>
      <p className="text-slate-300 text-sm mb-2 whitespace-pre-line">
        {genRetryable ? t("premium_report.failed_desc") : genError}
      </p>
      {genRetryable && genError && (
        <p className="text-sm text-slate-400 mb-6 whitespace-pre-line">{genError}</p>
      )}
      {genRetryable ? (
        <PrimaryButton type="button" variant="gold" fullWidth onClick={handleRetryGenerate}>
          {t("premium_report.retry_button")}
        </PrimaryButton>
      ) : genNeedsLogin ? (
        <PrimaryButton type="button" variant="gold" fullWidth onClick={handleGoLogin}>
          {t("premium_report.login_continue")}
        </PrimaryButton>
      ) : (
        <PrimaryButton
          type="button"
          variant="gold"
          fullWidth
          onClick={() => navigate("/refund-inquiry")}
        >
          {t("premium_report.contact_support")}
        </PrimaryButton>
      )}
      <button
        type="button"
        onClick={() => {
          setSearchParams({});
          setView("intro");
        }}
        className="mt-4 text-sm text-slate-400 hover:text-white underline"
      >
        {t("premium_report.back_to_intro")}
      </button>
    </div>
  );

  const renderDone = () => {
    const snapshot = report?.profile_snapshot || {};
    return (
      <div className="py-4">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {t("premium_report.done_title", {
                name: snapshot.name || t("premium_report.report_fallback_name"),
              })}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {t("premium_report.done_meta", { date: formatDate(report?.created_at) })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={pdfSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-black transition-opacity disabled:opacity-60"
              style={{ backgroundColor: colors.primary }}
            >
              <FileDown className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
              {pdfSaving
                ? t("premium_report.pdf_saving")
                : pdfReady
                  ? t("premium_report.pdf_retap")
                  : t("premium_report.pdf_button")}
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchParams({});
                setReport(null);
                setView("intro");
                fetchMyReports();
              }}
              className="px-4 py-2.5 rounded-lg text-sm text-slate-300 border border-slate-600 hover:border-slate-400 transition-colors"
            >
              {t("premium_report.back_to_intro")}
            </button>
          </div>
        </div>

        {report?.question && (
          <div className="mb-6 p-4 rounded-lg bg-[rgba(37,61,135,0.2)] border border-[#253D87]">
            <p className="text-xs mb-1" style={{ color: colors.primary }}>
              {t("premium_report.question_display_label")}
            </p>
            <p className="text-sm text-slate-200 leading-relaxed">{report.question}</p>
          </div>
        )}

        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 sm:p-7">
          <div className="premium-report-md">
            <FortuneMarkdown>{report?.content || ""}</FortuneMarkdown>
          </div>
        </div>

        {/* 후기 유도: 완료(DONE)된 본인 리포트 하단. 구매 인증은 서버가 premium_reports 로 대조 */}
        {report?.id && <ReviewPrompt service="report" reportId={report.id} className="mt-8" />}
      </div>
    );
  };

  return (
    <div className={`min-h-screen py-8 px-4 ${showStickyCta ? "pb-48" : "pb-28"}`}>
      <PageSeo
        path={PAGE_SEO.report.path}
        title={PAGE_SEO.report.title}
        description={PAGE_SEO.report.description}
        ogType={PAGE_SEO.report.ogType}
        imageAlt={getBrandImageAlt(i18n.language)}
        nodes={reportNodes}
      />

      <div className="max-w-[600px] mx-auto">
        {view === "intro" && renderIntro()}
        {view === "paying" && renderPaying()}
        {view === "generating" && renderGenerating()}
        {view === "failed" && renderFailed()}
        {view === "done" && renderDone()}
      </div>

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSubmit={handleCreateProfile}
      />
      <LoginRequiredModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
      {/* 모바일 하단 고정 CTA — 히어로 CTA·신청 박스가 화면 밖일 때만 (하단 네비 위에 붙음) */}
      <ReportStickyCta visible={showStickyCta} price={REPORT_PRICE} onBuy={scrollToPurchase} />
      <BottomNavigation />
    </div>
  );
}

export default PremiumReport;
