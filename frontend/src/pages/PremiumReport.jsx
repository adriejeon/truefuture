import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import * as PortOne from "@portone/browser-sdk/v2";
import {
  Fingerprint,
  Briefcase,
  CalendarRange,
  MessageCircleQuestion,
  FileDown,
  Telescope,
  CircleAlert,
  Check,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import PrimaryButton from "../components/PrimaryButton";
import BottomNavigation from "../components/BottomNavigation";
import LoginRequiredModal from "../components/LoginRequiredModal";
import FortuneMarkdown from "../components/FortuneMarkdown";
import { prepareBuyerEmail } from "../utils/paymentUtils";
import { trackPurchase } from "../utils/analytics";
import { colors } from "../constants/colors";
import { SITE_ORIGIN } from "../constants/seoMeta";

const REPORT_PRICE = 18000;
const QUESTION_MAX = 300;
const CHECKOUT_STORAGE_KEY = "premium_report_checkout";

const PAGE_TITLE = "프리미엄 상세 리포트 | 진짜미래 - 질문 상담과 10년 시기 리포트";
const PAGE_DESCRIPTION =
  "궁금한 질문에 먼저 답하고, 출생 시각 기반으로 앞으로 10년의 흐름을 연도별로 풀어드리는 서면 상담 리포트. 완성본은 텍스트 PDF로 기기에 저장해 소장할 수 있습니다.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** supabase.functions.invoke 에러에서 서버 메시지/상태코드 추출 */
async function parseFnError(error) {
  let status = null;
  let message = "";
  try {
    status = error?.context?.status ?? null;
  } catch (_) {}
  try {
    const detail = await error?.context?.json?.();
    message = detail?.error || "";
    if (detail?.locked) return { status: 409, message, locked: true };
  } catch (_) {}
  return { status, message: message || error?.message || "", locked: status === 409 };
}

function PremiumReport() {
  const { t, i18n } = useTranslation();
  const isEnglish = i18n.language?.startsWith("en");
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
  const [question, setQuestion] = useState("");
  const [report, setReport] = useState(null); // premium_reports row
  const [myReports, setMyReports] = useState([]);
  const [error, setError] = useState("");
  const [genError, setGenError] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pdfSaving, setPdfSaving] = useState(false);
  const genLoopRef = useRef(false);
  const redirectHandledRef = useRef(false);
  const recoveryTriedRef = useRef(false);

  const reportIdParam = searchParams.get("id");

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

  const runGenerationLoop = useCallback(
    async (reportId) => {
      if (genLoopRef.current) return;
      genLoopRef.current = true;
      setGenError("");
      setView("generating");
      try {
        // 최대 45회 반복 (섹션 3개 + 일시 오류·검증 재생성·락 대기 여유분)
        let consecutiveErrors = 0;
        for (let attempt = 0; attempt < 45; attempt++) {
          let row = null;
          try {
            row = await fetchReportRow(reportId);
          } catch (_) {}
          if (row) {
            setReport(row);
            if (row.status === "DONE") {
              setView("done");
              fetchMyReports();
              return;
            }
          }

          const { data, error: fnError } = await supabase.functions.invoke(
            "premium-report",
            { body: { action: "generate", report_id: reportId } }
          );

          if (fnError) {
            const parsed = await parseFnError(fnError);
            if (parsed.locked) {
              // 다른 요청이 생성 중 → 대기 후 상태 재확인
              await sleep(8000);
              continue;
            }
            // 서버/워커 일시 장애(5xx·네트워크)는 잠시 후 이어서 재시도
            const isTransientHttp =
              parsed.status == null || parsed.status >= 500 || parsed.status === 429;
            if (isTransientHttp && consecutiveErrors < 5) {
              consecutiveErrors += 1;
              await sleep(15000);
              continue;
            }
            throw new Error(parsed.message || t("premium_report.error_generate"));
          }
          if (!data?.success) {
            throw new Error(data?.error || t("premium_report.error_generate"));
          }
          consecutiveErrors = 0;

          // 서버가 일시 오류(쿼터 등)로 이번 호출을 건너뜀 → 잠시 후 재호출
          if (data.transient) {
            await sleep((Number(data.waitSeconds) || 20) * 1000);
            continue;
          }
          // 원고 검증 실패 → 교정 지시가 저장됐으니 즉시 재호출해 재생성
          if (data.revalidate) {
            continue;
          }

          try {
            const updated = await fetchReportRow(reportId);
            if (updated) setReport(updated);
          } catch (_) {}

          if (data.done) {
            setView("done");
            fetchMyReports();
            return;
          }
        }
        throw new Error(t("premium_report.error_timeout"));
      } catch (err) {
        console.error("❌ 리포트 생성 실패:", err);
        setGenError(err.message || t("premium_report.error_generate"));
        setView("failed");
      } finally {
        genLoopRef.current = false;
      }
    },
    [fetchReportRow, fetchMyReports, t]
  );

  // ===== URL ?id= 로 기존 리포트 열람/재개 =====

  useEffect(() => {
    if (!reportIdParam || loadingAuth) return;
    if (!user) return; // RLS 로 어차피 본인 것만 조회됨
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
          setGenError(row.error_message || "");
          setView("failed");
        } else {
          // PAID / GENERATING → 이어서 생성
          runGenerationLoop(row.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || t("premium_report.error_load"));
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
          throw new Error(parsed.message || t("premium_report.error_purchase"));
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
        runGenerationLoop(data.reportId);
      } catch (err) {
        console.error("❌ 리포트 구매 처리 실패:", err);
        setError(err.message || t("premium_report.error_purchase"));
        setView("intro");
      }
    },
    [runGenerationLoop, setSearchParams, t]
  );

  // ===== 모바일 결제 리다이렉트 복귀 처리 =====

  useEffect(() => {
    if (redirectHandledRef.current) return;
    if (loadingAuth || !user) return;
    const isPayRedirect = searchParams.get("pay_redirect") === "1";
    if (!isPayRedirect) return;
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
    const profileId = stored?.profileId;
    if (!merchantUid || !profileId) {
      setError(t("premium_report.error_redirect_context"));
      setSearchParams({}, { replace: true });
      setView("intro");
      return;
    }

    setSearchParams({}, { replace: true });
    completePurchase({
      merchantUid,
      paymentId: merchantUid, // PortOne V2 결제 ID = 우리가 생성한 merchantUid
      profileId,
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
    if (!stored?.merchantUid || !stored?.profileId) return;

    (async () => {
      setView("paying");
      try {
        const { data, error: fnError } = await supabase.functions.invoke("premium-report", {
          body: {
            action: "purchase",
            merchant_uid: stored.merchantUid,
            imp_uid: stored.merchantUid,
            profile_id: stored.profileId,
            question: stored.question || "",
          },
        });
        if (!fnError && data?.success && data?.reportId) {
          try {
            sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
          } catch (_) {}
          setSearchParams({ id: data.reportId }, { replace: true });
          runGenerationLoop(data.reportId);
          return;
        }
        const parsed = fnError ? await parseFnError(fnError) : { message: data?.error || "" };
        const msg = parsed.message || "";
        // 결제 자체가 없거나 미완료였던 컨텍스트 → 조용히 정리하고 일반 화면으로
        const notPaid =
          /완료되지 않았습니다|찾을 수 없|조회 실패|PgProviderError|PAY_PROCESS/i.test(msg);
        if (notPaid || !msg) {
          try {
            sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
          } catch (_) {}
        } else {
          // 결제가 잡혀 있을 수 있는 실패 → 컨텍스트 유지 + 안내
          setError(msg);
        }
      } catch (_) {
        // 네트워크 등 일시 오류 — 다음 방문 때 다시 시도할 수 있게 컨텍스트 유지
      } finally {
        setView((v) => (v === "paying" ? "intro" : v));
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
      const redirectUrl = `${window.location.origin}/report?pay_redirect=1`;
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
      setError(err.message || t("premium_report.error_pay_failed"));
      setView("intro");
    }
  };

  const handleRetryGenerate = () => {
    if (report?.id) {
      runGenerationLoop(report.id);
    }
  };

  const handleCreateProfile = async (profileData) => {
    await createProfile(profileData);
  };

  // ===== PDF 저장 =====

  // 텍스트 레이어를 가진 실제 PDF 생성 (@react-pdf/renderer + 한글 서브셋 폰트)
  const handleSavePdf = async () => {
    if (!report?.content || pdfSaving) return;
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

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
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

  const features = [
    { Icon: MessageCircleQuestion, key: "feature_question" },
    { Icon: CalendarRange, key: "feature_timing" },
    { Icon: Briefcase, key: "feature_life" },
    { Icon: Fingerprint, key: "feature_nature" },
    { Icon: FileDown, key: "feature_pdf" },
  ];

  const generatingSteps = [
    t("premium_report.step_1"),
    t("premium_report.step_2"),
    t("premium_report.step_3"),
  ];

  // ===== 뷰 =====

  const renderIntro = () => (
    <>
      {/* 히어로 */}
      <div className="text-center mb-8">
        <p className="text-sm font-semibold tracking-widest mb-2" style={{ color: colors.primary }}>
          PREMIUM REPORT
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          {t("premium_report.title")}
        </h1>
        <p className="text-slate-300 text-sm sm:text-base leading-relaxed whitespace-pre-line">
          {t("premium_report.subtitle")}
        </p>
      </div>

      {/* 구성 안내 */}
      <div className="p-5 sm:p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl mb-6">
        <p className="text-white font-semibold mb-4">{t("premium_report.features_title")}</p>
        <ul className="space-y-3">
          {features.map((f) => (
            <li key={f.key} className="flex items-start gap-3">
              <span
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "rgba(225, 172, 63, 0.12)" }}
              >
                <f.Icon
                  className="w-[18px] h-[18px]"
                  strokeWidth={1.75}
                  style={{ color: colors.primary }}
                  aria-hidden="true"
                />
              </span>
              <span className="text-slate-200 text-sm leading-6 pt-1.5">
                {t(`premium_report.${f.key}`)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 pt-4 border-t border-slate-700 flex items-baseline justify-between">
          <span className="text-slate-300 text-sm">{t("premium_report.price_label")}</span>
          <span className="text-2xl font-bold" style={{ color: colors.primary }}>
            {REPORT_PRICE.toLocaleString()}
            {t("common.unit_won")}
          </span>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
          <p className="text-red-200 text-sm whitespace-pre-line">{error}</p>
        </div>
      )}

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
      <div className="mb-6">
        <p className="text-white font-medium mb-2">
          {t("premium_report.question_label")}{" "}
          <span className="text-slate-400 text-sm font-normal">
            ({t("premium_report.optional")})
          </span>
        </p>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, QUESTION_MAX))}
          placeholder={t("premium_report.question_placeholder")}
          rows={4}
          className="w-full px-4 py-3 bg-[#0F0F2B] border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none resize-none text-sm leading-relaxed"
          style={{ caretColor: colors.primary }}
          onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = "")}
        />
        <p className="text-xs text-slate-400 text-right">
          {question.length}/{QUESTION_MAX}
        </p>
      </div>

      {/* 결제 버튼 */}
      <PrimaryButton type="button" variant="gold" fullWidth onClick={handlePurchaseClick}>
        {t("premium_report.buy_button", { price: REPORT_PRICE.toLocaleString() })}
      </PrimaryButton>

      {/* 유의사항 */}
      <div className="mt-5 p-4 rounded-lg bg-slate-800/40 border border-slate-700">
        <ul className="text-xs text-slate-400 space-y-1.5 leading-relaxed list-disc list-inside">
          <li>{t("premium_report.notice_time")}</li>
          <li>{t("premium_report.notice_revisit")}</li>
          <li>{t("premium_report.notice_birthtime")}</li>
          <li>{t("premium_report.notice_refund")}</li>
        </ul>
      </div>

      {/* 내 리포트 목록 */}
      {user && myReports.length > 0 && (
        <div className="mt-10">
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
    </>
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
        {t("premium_report.failed_desc")}
      </p>
      {genError && <p className="text-xs text-slate-500 mb-6 break-all">{genError}</p>}
      <PrimaryButton type="button" variant="gold" fullWidth onClick={handleRetryGenerate}>
        {t("premium_report.retry_button")}
      </PrimaryButton>
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

      </div>
    );
  };

  return (
    <div className="min-h-screen py-8 px-4 pb-28">
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <link rel="canonical" href={`${SITE_ORIGIN}/report`} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="진짜미래" />
        <meta property="og:url" content={`${SITE_ORIGIN}/report`} />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "프리미엄 상세 리포트",
            description: PAGE_DESCRIPTION,
            brand: { "@type": "Brand", name: "진짜미래" },
            offers: {
              "@type": "Offer",
              url: `${SITE_ORIGIN}/report`,
              priceCurrency: "KRW",
              price: REPORT_PRICE,
              availability: "https://schema.org/InStock",
            },
          })}
        </script>
      </Helmet>

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
      <BottomNavigation />
    </div>
  );
}

export default PremiumReport;
