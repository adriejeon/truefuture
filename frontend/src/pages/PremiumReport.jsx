import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import * as PortOne from "@portone/browser-sdk/v2";
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

const REPORT_PRICE = 15000;
const QUESTION_MAX = 300;
const CHECKOUT_STORAGE_KEY = "premium_report_checkout";

const PAGE_TITLE = "프리미엄 상세 리포트 | 진짜미래 - 전문가 서면 감정 리포트";
const PAGE_DESCRIPTION =
  "출생 차트 전체를 정밀 감정하는 프리미엄 상세 리포트. 타고난 기질·재능·직업·재물·연애·건강에 생시 기반 시기 분석과 나만의 질문 풀이까지, PDF로 소장하는 전문가 수준의 서면 감정서입니다.";

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
  const pdfContainerRef = useRef(null);

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
        // 최대 30회 반복 (섹션 3개 + 락 대기 재시도 여유분)
        for (let attempt = 0; attempt < 30; attempt++) {
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
            throw new Error(parsed.message || t("premium_report.error_generate"));
          }
          if (!data?.success) {
            throw new Error(data?.error || t("premium_report.error_generate"));
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
    const txId = searchParams.get("txId");

    let stored = null;
    try {
      const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (_) {}

    // 결제 실패/취소
    if (code) {
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
      paymentId: txId || merchantUid,
      profileId,
      questionText: stored?.question || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, loadingAuth, completePurchase]);

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

  const handleSavePdf = async () => {
    if (!report?.content || pdfSaving) return;
    setPdfSaving(true);
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      const element = pdfContainerRef.current;
      if (!element) throw new Error("PDF 영역을 찾을 수 없습니다.");

      const name = report.profile_snapshot?.name || "내담자";
      const dateStr = (report.created_at || "").substring(0, 10).replace(/-/g, "");
      const filename = `진짜미래_상세리포트_${name}_${dateStr}.pdf`;

      // 캔버스 최대 크기 제한(브라우저 한계) 안에서 최대 해상도 선택
      const scrollHeight = element.scrollHeight || 1;
      const scale = Math.max(1, Math.min(2, 30000 / scrollHeight));

      await html2pdf()
        .set({
          margin: [12, 12, 14, 12],
          filename,
          image: { type: "jpeg", quality: 0.92 },
          html2canvas: {
            scale,
            useCORS: true,
            backgroundColor: "#ffffff",
            windowWidth: 794,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: ["h1", "h2", "h3", "blockquote"] },
        })
        .from(element)
        .save();
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
    { icon: "🧬", key: "feature_nature" },
    { icon: "💼", key: "feature_life" },
    { icon: "🗓", key: "feature_timing" },
    { icon: "💬", key: "feature_question" },
    { icon: "📄", key: "feature_pdf" },
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
              <span className="text-lg leading-6">{f.icon}</span>
              <span className="text-slate-200 text-sm leading-6">
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
          <div className="text-5xl mb-4">🔭</div>
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
                  <span className="text-green-400">✓</span>
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
      <div className="text-5xl mb-4">🛠</div>
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
    const birthLabel = String(snapshot.birth_date || "").substring(0, 16).replace("T", " ");
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
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-black transition-opacity disabled:opacity-60"
              style={{ backgroundColor: colors.primary }}
            >
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

        {/* PDF 렌더링용 오프스크린 컨테이너 (라이트 테마 A4) */}
        <div
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "794px",
            zIndex: -1,
          }}
          aria-hidden="true"
        >
          <div
            ref={pdfContainerRef}
            style={{
              width: "794px",
              backgroundColor: "#ffffff",
              color: "#1f2333",
              fontFamily:
                "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
              padding: "8px 6px",
              lineHeight: 1.75,
              fontSize: "13px",
            }}
            className="premium-pdf-root"
          >
            <style>{`
              .premium-pdf-root h1 { font-size: 21px; margin: 0 0 6px; color: #14162b; }
              .premium-pdf-root h2 { font-size: 17px; margin: 26px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #E1AC3F; color: #14162b; page-break-after: avoid; }
              .premium-pdf-root h3 { font-size: 14.5px; margin: 18px 0 6px; color: #2a2d45; page-break-after: avoid; }
              .premium-pdf-root p { margin: 0 0 10px; }
              .premium-pdf-root blockquote { margin: 6px 0 12px; padding: 8px 14px; background: #faf5e9; border-left: 3px solid #E1AC3F; color: #5a4a22; font-weight: 500; }
              .premium-pdf-root ul, .premium-pdf-root ol { margin: 0 0 10px; padding-left: 20px; }
              .premium-pdf-root li { margin-bottom: 4px; }
              .premium-pdf-root strong { color: #14162b; }
            `}</style>
            <div
              style={{
                textAlign: "center",
                padding: "26px 0 20px",
                borderBottom: "3px solid #E1AC3F",
                marginBottom: "10px",
              }}
            >
              <p style={{ margin: 0, fontSize: "11px", letterSpacing: "4px", color: "#a08428" }}>
                TRUE FUTURE PREMIUM REPORT
              </p>
              <h1 style={{ margin: "10px 0 4px", fontSize: "24px" }}>프리미엄 상세 리포트</h1>
              <p style={{ margin: "2px 0", fontSize: "12.5px", color: "#555a75" }}>
                {snapshot.name || ""}
                {snapshot.gender ? ` · ${snapshot.gender}` : ""}
              </p>
              <p style={{ margin: "2px 0", fontSize: "12px", color: "#555a75" }}>
                {birthLabel}
                {snapshot.city_name ? ` · ${snapshot.city_name}` : ""}
              </p>
              <p style={{ margin: "2px 0", fontSize: "11px", color: "#8a8fa8" }}>
                발행일 {formatDate(report?.created_at)} · truefuture.kr
              </p>
            </div>
            {report?.question && (
              <div
                style={{
                  margin: "0 0 14px",
                  padding: "10px 14px",
                  background: "#f4f5fb",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                }}
              >
                <strong style={{ color: "#a08428" }}>내담자님의 질문</strong>
                <p style={{ margin: "4px 0 0" }}>{report.question}</p>
              </div>
            )}
            <FortuneMarkdown>{report?.content || ""}</FortuneMarkdown>
            <div
              style={{
                marginTop: "24px",
                paddingTop: "12px",
                borderTop: "1px solid #d8dbe8",
                fontSize: "10.5px",
                color: "#8a8fa8",
                textAlign: "center",
              }}
            >
              본 리포트는 서양 고전 점성술 이론에 기반한 해석 콘텐츠로, 의료·법률·투자 판단의
              근거가 될 수 없습니다. © 진짜미래 truefuture.kr
            </div>
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
