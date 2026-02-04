import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { saveFortuneHistory } from "../services/fortuneService";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import BottomNavigation from "../components/BottomNavigation";
import FortuneProcess from "../components/FortuneProcess";
import ReactMarkdown from "react-markdown";
import { colors } from "../constants/colors";

// 카테고리 옵션 (백엔드 consultationTopic과 일치)
const TOPIC_OPTIONS = [
  { id: "LOVE", label: "💘 연애/결혼", emoji: "💘" },
  { id: "MONEY", label: "💰 재물/사업", emoji: "💰" },
  { id: "WORK", label: "💼 직업/이직", emoji: "💼" },
  { id: "EXAM", label: "📝 시험/합격", emoji: "📝" },
  { id: "MOVE", label: "🏡 이사/이동", emoji: "🏡" },
  { id: "OTHER", label: "🔮 기타", emoji: "🔮" },
];

// 프리셋 질문 (카테고리별 자주 묻는 질문)
const PRESET_QUESTIONS = {
  LOVE: [
    "짝사랑 중인데 이 사람과 연인이 될 수 있을까요?",
    "지금 만나는 사람과 언제쯤 결혼할 수 있을까요?",
    "헤어진 연인과 재회할 가능성이 있을까요?",
    "저랑 이 사람의 속궁합이나 성격 합이 잘 맞나요?",
  ],
  MONEY: [
    "지금 준비 중인 사업을 시작해도 될까요?",
    "올해 금전운의 흐름이 언제 가장 좋나요?",
    "지금 투자를 시작하기에 적절한 시기인가요?",
    "묶여있는 돈이 언제쯤 풀릴까요?",
  ],
  WORK: [
    "지금 회사를 그만두고 이직하는 게 좋을까요?",
    "이 직무가 저의 적성에 맞는지 궁금해요.",
    "언제쯤 승진하거나 인정받을 수 있을까요?",
    "프리랜서로 전향해도 성공할 수 있을까요?",
  ],
  EXAM: [
    "이번 시험에 합격할 가능성이 몇 % 정도 될까요?",
    "면접 결과가 긍정적으로 나올까요?",
    "자격증 시험 합격운이 가장 좋은 시기는 언제인가요?",
  ],
  MOVE: [
    "지금 사는 곳에서 이사하는 게 좋을까요, 머무는 게 좋을까요?",
    "해외로 이동하거나 유학을 가도 될까요?",
    "문서운(부동산 계약)이 들어오는 시기가 언제인가요?",
  ],
};

/**
 * Gemini 응답 텍스트를 JSON으로 파싱.
 * 마크다운 코드블록(```json ... ```), "json" 접두어 제거 후 파싱 시도.
 * @param {string} text - interpretation 원문
 * @returns {object|null} 파싱 성공 시 객체, 실패 시 null (텍스트 모드 Fallback)
 */
const parseFortuneResult = (text) => {
  if (!text || typeof text !== "string") return null;
  let cleanText = text
    .replace(/```json|```/g, "")
    .replace(/^json\s*/i, "")
    .trim();
  // API는 대부분 평문(마크다운)을 반환함. JSON일 때만 파싱 시도 (앞이 { 또는 [ 인 경우)
  if (!/^[\s]*[{\[]/.test(cleanText)) return null;
  try {
    return JSON.parse(cleanText);
  } catch {
    return null;
  }
};

function Consultation() {
  const { user, loadingAuth } = useAuth();
  const {
    profiles,
    selectedProfile,
    loading: profilesLoading,
    createProfile,
    deleteProfile,
    selectProfile,
  } = useProfiles();

  // UI 상태
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState("LOVE");
  const [userQuestion, setUserQuestion] = useState("");
  const [error, setError] = useState("");

  // 공유 링크로 들어온 경우
  const [searchParams, setSearchParams] = useSearchParams();
  const [sharedConsultation, setSharedConsultation] = useState(null);
  const [loadingShared, setLoadingShared] = useState(false);

  // 히스토리 뷰 (대화 목록에서 클릭한 경우)
  const { resultId } = useParams();
  const navigate = useNavigate();
  const [historyView, setHistoryView] = useState(null); // { question, interpretation }

  // 프로필 데이터를 API 형식으로 변환 (성별: 백엔드/제미나이용 M/F)
  const convertProfileToApiFormat = (profile) => {
    if (!profile) return null;
    const gender =
      profile.gender === "여자" ? "F" : profile.gender === "남자" ? "M" : "M";
    return {
      birthDate: profile.birth_date.substring(0, 19),
      lat: profile.lat,
      lng: profile.lng,
      gender,
    };
  };

  // 히스토리 뷰 로드 (대화 목록에서 클릭한 경우 /consultation/:resultId)
  useEffect(() => {
    if (!resultId) {
      setHistoryView(null);
      return;
    }

    const loadHistoryItem = async () => {
      setLoadingShared(true);
      try {
        // result_id로 fortune_history 조회 (동일 result_id가 여러 행일 수 있으므로 limit(1), 최신 1건만 사용)
        const { data: historyRows, error: historyError } = await supabase
          .from("fortune_history")
          .select("user_question, result_id")
          .eq("result_id", resultId)
          .eq("fortune_type", "consultation")
          .order("created_at", { ascending: false })
          .limit(1);

        if (historyError || !historyRows?.length) {
          console.error("히스토리 조회 실패:", historyError);
          setHistoryView(null);
          return;
        }

        const historyData = historyRows[0];

        const { data: resultData, error: resultError } = await supabase
          .from("fortune_results")
          .select("fortune_text")
          .eq("id", resultId)
          .single();

        if (resultError || !resultData) {
          console.error("결과 조회 실패:", resultError);
          setHistoryView(null);
          return;
        }

        const parsedData = parseFortuneResult(resultData.fortune_text);
        setHistoryView({
          question: historyData.user_question || "(질문 없음)",
          interpretation: resultData.fortune_text,
          parsedData,
          shareId: resultId,
        });
      } catch (err) {
        console.error("히스토리 로드 실패:", err);
        setHistoryView(null);
      } finally {
        setLoadingShared(false);
      }
    };

    loadHistoryItem();
  }, [resultId]);

  // URL ?id= 로 공유된 상담 로드
  useEffect(() => {
    const sharedId = searchParams.get("id");
    if (!sharedId) return;

    setLoadingShared(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/functions/v1/get-fortune?id=${sharedId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error || data.fortuneType !== "consultation") {
          setSharedConsultation(null);
          return;
        }
        const userInfo = data.userInfo || {};
        const meta = data.chart_data?.metadata || {};

        const parsedData = parseFortuneResult(data.interpretation);

        setSharedConsultation({
          question: meta.userQuestion || userInfo.userQuestion || "(질문 없음)",
          topic:
            meta.consultationTopic || userInfo.consultationTopic || "OTHER",
          interpretation: data.interpretation,
          parsedData, // 구조화된 JSON 데이터
          shareId: sharedId,
        });
      })
      .catch(() => setSharedConsultation(null))
      .finally(() => setLoadingShared(false));
  }, [searchParams]);

  const getShareUrl = (shareId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("id", shareId);
    url.hash = "";
    return url.toString();
  };

  const handleCopyLink = (shareId) => {
    const shareUrl = getShareUrl(shareId);
    navigator.clipboard.writeText(shareUrl).then(
      () => alert("링크가 복사되었어요. 친구에게 보내보세요!"),
      () => alert("복사에 실패했어요. 주소창의 링크를 복사해 주세요.")
    );
  };

  const handleKakaoShare = (shareId) => {
    if (!window.Kakao?.isInitialized()) {
      alert("카카오톡 공유 기능을 사용할 수 없습니다.");
      return;
    }
    const shareUrl = getShareUrl(shareId);
    const isLocalhost = window.location.hostname === "localhost";
    const imageUrl = isLocalhost
      ? "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
      : `${window.location.origin}/assets/truefuture.png`;
    try {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title: "진짜미래 - 자유 질문 상담 결과를 공유했어요",
          description: "AI 점성술로 분석한 맞춤 상담 결과를 확인해보세요.",
          imageUrl,
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
        },
        buttons: [
          {
            title: "결과 보기",
            link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
          },
        ],
      });
    } catch (err) {
      alert("카카오톡 공유 중 오류가 발생했습니다: " + err.message);
    }
  };

  // FortuneProcess용: API 호출 후 결과 객체 반환 (상태 2 → 3 전환용)
  const requestConsultation = useCallback(async () => {
    if (!user) throw new Error("로그인이 필요합니다.");
    if (!selectedProfile) {
      setShowProfileModal(true);
      throw new Error("프로필을 선택해주세요.");
    }
    if (!userQuestion.trim()) throw new Error("질문을 입력해주세요.");
    if (userQuestion.trim().length > 1000) throw new Error("질문은 1000자 이내로 입력해주세요.");

    const formData = convertProfileToApiFormat(selectedProfile);
    if (!formData) throw new Error("프로필 정보가 올바르지 않습니다.");

    const requestBody = {
      ...formData,
      fortuneType: "consultation",
      userQuestion: userQuestion.trim(),
      consultationTopic: selectedTopic,
      profileId: selectedProfile.id,
    };

    const { data, error: functionError } = await supabase.functions.invoke(
      "get-fortune",
      { body: requestBody }
    );

    if (functionError) throw new Error(functionError.message || "서버 오류가 발생했습니다.");
    if (!data || data.error) throw new Error(data?.error || "서버 오류가 발생했습니다.");

    const parsedData = parseFortuneResult(data.interpretation);
    const answer = {
      question: userQuestion.trim(),
      topic: selectedTopic,
      interpretation: data.interpretation,
      parsedData,
      debugInfo: data.debugInfo || {},
      shareId: data.share_id || null,
    };

    if (data.share_id) {
      await saveFortuneHistory(
        user.id,
        selectedProfile.id,
        "consultation",
        data.share_id,
        null,
        userQuestion.trim()
      );
    }
    setUserQuestion("");
    return answer;
  }, [user, selectedProfile, selectedTopic, userQuestion]);

  // 인증 로딩 중
  if (loadingAuth) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm sm:text-base">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 로그인 필요
  if (!user) {
    return (
      <div className="w-full max-w-[600px] mx-auto px-6 py-12">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            로그인이 필요합니다
          </h2>
          <p className="text-slate-300 mb-6">
            진짜미래는 로그인 후 이용하실 수 있습니다.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            로그인하기
          </a>
        </div>
      </div>
    );
  }

  // 공유 링크로 들어온 경우: 공유된 상담만 표시
  if (loadingShared) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4"></div>
          <p className="text-slate-400">공유된 상담을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 히스토리 뷰 (대화 목록에서 클릭한 경우)
  if (historyView) {
    return (
      <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
        <div className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24">
          <div className="py-8 sm:py-12">
            {/* 상단: 새로운 질문 버튼 */}
            <div className="mb-6">
              <button
                onClick={() => navigate("/consultation")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                새로운 질문
              </button>
            </div>

            {/* 질문 표시 */}
            <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-2xl">💬</div>
                <div className="flex-1">
                  <p className="text-slate-300 text-sm mb-1">내 질문</p>
                  <p className="text-white font-medium">{historyView.question}</p>
                </div>
              </div>
            </div>

            {/* 답변 표시: parsedData면 구조화된 UI, 아니면 마크다운(평문) */}
            {historyView.parsedData ? (
              <div className="space-y-5 mb-8">
                {/* 요약 카드 */}
                <div className="p-6 bg-gradient-to-br from-purple-900/50 to-indigo-900/50 border border-purple-500/50 rounded-xl shadow-xl">
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 leading-tight">
                    {historyView.parsedData.summary?.title || "결론"}
                  </h2>
                  {historyView.parsedData.summary?.score != null && (
                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm text-slate-300">실현 가능성</span>
                        <span className="text-2xl font-bold text-purple-300">
                          {historyView.parsedData.summary.score}%
                        </span>
                        <span className="flex gap-0.5" aria-hidden>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span
                              key={i}
                              className={
                                i <= Math.round((historyView.parsedData.summary?.score || 0) / 20)
                                  ? "text-amber-400"
                                  : "text-slate-600"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700/50 rounded-full h-2.5">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${historyView.parsedData.summary?.score || 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(historyView.parsedData.summary?.keywords || []).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-purple-600/40 border border-purple-400/50 rounded-full text-xs font-medium text-purple-100"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 타임라인 */}
                {historyView.parsedData.timeline && historyView.parsedData.timeline.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      📅 타임라인
                    </h3>
                    <div className="space-y-3">
                      {historyView.parsedData.timeline.map((item, idx) => {
                        const isGood = item.type === "good";
                        const isBad = item.type === "bad";
                        const bgColor = isGood
                          ? "bg-emerald-900/30 border-emerald-500/50"
                          : isBad
                          ? "bg-rose-900/30 border-rose-500/50"
                          : "bg-slate-700/30 border-slate-500/50";
                        const iconColor = isGood ? "text-emerald-400" : isBad ? "text-rose-400" : "text-slate-400";
                        return (
                          <div
                            key={idx}
                            className={`flex items-start gap-3 p-4 border rounded-lg ${bgColor}`}
                          >
                            <div className={`text-xl flex-shrink-0 ${iconColor}`}>
                              {isGood ? "✨" : isBad ? "⚠️" : "⏳"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white mb-1">{item.date}</p>
                              <p className="text-sm text-slate-300 leading-relaxed">{item.note}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 종합 분석 + 시기 분석 + Action Tip */}
                <div className="space-y-5">
                  {historyView.parsedData.analysis?.general && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3">🔮 종합 분석</h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {historyView.parsedData.analysis.general}
                      </p>
                    </div>
                  )}
                  {historyView.parsedData.analysis?.timing && (
                    <div className="border-t border-slate-600/40 pt-5">
                      <h3 className="text-lg font-semibold text-white mb-3">⏰ 시기 분석</h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {historyView.parsedData.analysis.timing}
                      </p>
                    </div>
                  )}
                  {historyView.parsedData.analysis?.advice && (
                    <div className="border-t border-slate-600/40 pt-5">
                      <div className="p-4 bg-amber-900/25 border-2 border-amber-500/50 rounded-xl">
                        <h3 className="text-lg font-semibold text-amber-200 mb-3 flex items-center gap-2">
                          💡 Action Tip
                        </h3>
                        <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">
                          {historyView.parsedData.analysis.advice}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-3">🔮 답변</h3>
                <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200">
                  <ReactMarkdown>{historyView.interpretation}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* 친구에게 공유 */}
            {historyView.shareId && (
              <div className="mt-6 pt-6 border-t border-slate-600/50">
                <p className="text-sm text-slate-300 mb-3">친구에게 공유하기</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyLink(historyView.shareId)}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                    title="주소 복사"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKakaoShare(historyView.shareId)}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                    title="카카오톡 공유하기"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {user && <BottomNavigation />}
      </div>
    );
  }

  if (sharedConsultation) {
    const topicOption = TOPIC_OPTIONS.find(
      (t) => t.id === sharedConsultation.topic
    );
    return (
      <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
        <div className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24">
          <div className="py-8 sm:py-12">
            <div className="mb-6 p-4 bg-purple-900/30 border border-purple-600/50 rounded-lg">
              <p className="text-purple-200 text-sm">
                친구가 공유한 상담이에요
              </p>
            </div>
            <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-2xl">{topicOption?.emoji || "🔮"}</div>
                <div className="flex-1">
                  <p className="text-slate-300 text-sm mb-1">
                    {topicOption?.label || "상담"}
                  </p>
                  <p className="text-white font-medium">
                    {sharedConsultation.question}
                  </p>
                </div>
              </div>
            </div>

            {/* 구조화된 결과 (parseFortuneResult 성공 시) */}
            {sharedConsultation.parsedData ? (
              <div className="space-y-5 mb-8">
                {/* Header Card */}
                <div className="p-6 bg-gradient-to-br from-purple-900/50 to-indigo-900/50 border border-purple-500/50 rounded-xl shadow-xl">
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 leading-tight">
                    {sharedConsultation.parsedData.summary?.title || "결론"}
                  </h2>
                  {sharedConsultation.parsedData.summary?.score != null && (
                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm text-slate-300">실현 가능성</span>
                        <span className="text-2xl font-bold text-purple-300">
                          {sharedConsultation.parsedData.summary.score}%
                        </span>
                        <span className="flex gap-0.5" aria-hidden>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span
                              key={i}
                              className={
                                i <=
                                Math.round(
                                  (sharedConsultation.parsedData.summary
                                    ?.score || 0) / 20
                                )
                                  ? "text-amber-400"
                                  : "text-slate-600"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700/50 rounded-full h-2.5">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${
                              sharedConsultation.parsedData.summary?.score || 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(
                      sharedConsultation.parsedData.summary?.keywords || []
                    ).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-purple-600/40 border border-purple-400/50 rounded-full text-xs font-medium text-purple-100"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Timeline Section */}
                {sharedConsultation.parsedData.timeline &&
                  sharedConsultation.parsedData.timeline.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        📅 타임라인
                      </h3>
                      <div className="space-y-3">
                        {sharedConsultation.parsedData.timeline.map(
                          (item, idx) => {
                            const isGood = item.type === "good";
                            const isBad = item.type === "bad";
                            const bgColor = isGood
                              ? "bg-emerald-900/30 border-emerald-500/50"
                              : isBad
                              ? "bg-rose-900/30 border-rose-500/50"
                              : "bg-slate-700/30 border-slate-500/50";
                            const iconColor = isGood
                              ? "text-emerald-400"
                              : isBad
                              ? "text-rose-400"
                              : "text-slate-400";

                            return (
                              <div
                                key={idx}
                                className={`flex items-start gap-3 p-4 border rounded-lg ${bgColor}`}
                              >
                                <div
                                  className={`text-xl flex-shrink-0 ${iconColor}`}
                                >
                                  {isGood ? "✨" : isBad ? "⚠️" : "⏳"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white mb-1">
                                    {item.date}
                                  </p>
                                  <p className="text-sm text-slate-300 leading-relaxed">
                                    {item.note}
                                  </p>
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}

                {/* Analysis Section */}
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                      🔮 종합 분석
                    </h3>
                    <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                      {sharedConsultation.parsedData.analysis?.general || ""}
                    </p>
                  </div>

                  <div className="border-t border-slate-600/40 pt-5">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      ⏰ 시기 분석
                    </h3>
                    <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                      {sharedConsultation.parsedData.analysis?.timing || ""}
                    </p>
                  </div>

                  <div className="border-t border-slate-600/40 pt-5">
                    <div className="p-4 bg-amber-900/25 border-2 border-amber-500/50 rounded-xl">
                      <h3 className="text-lg font-semibold text-amber-200 mb-3 flex items-center gap-2">
                        💡 Action Tip
                      </h3>
                      <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {sharedConsultation.parsedData.analysis?.advice || ""}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Fallback: Raw Text */
              <div className="p-6 bg-slate-800/30 border border-slate-600/50 rounded-lg mb-8">
                <h3 className="text-lg font-semibold text-white mb-4">
                  🔮 답변
                </h3>
                <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed break-words">
                  <ReactMarkdown>
                    {sharedConsultation.interpretation}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {!user && (
              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <p className="text-slate-300 mb-3">
                  나도 궁금한 걸 물어보고 싶다면?
                </p>
                <a
                  href="/login"
                  className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                >
                  로그인하고 상담받기
                </a>
              </div>
            )}
            {user && (
              <a
                href="/consultation"
                className="block text-center py-3 text-purple-300 hover:text-purple-200 text-sm"
              >
                진짜미래로 이동 →
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
      <div
        className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        <div className="py-8 sm:py-12">
          {/* 페이지 소개 */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              ✨ 진짜미래
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              궁금한 것을 구체적으로 물어보세요. 점성술사 AI가 내담자님의 점성학 차트와 현재 우주의 흐름을 분석하여 진짜 미래를 알려드립니다.
            </p>
          </div>

          {/* 프로필 선택 */}
          <div className="mb-6 sm:mb-8">
            <ProfileSelector
              profiles={profiles}
              selectedProfile={selectedProfile}
              onSelectProfile={selectProfile}
              onCreateProfile={() => setShowProfileModal(true)}
              onDeleteProfile={deleteProfile}
            />
          </div>

          {/* 토픽 선택 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-3">
              카테고리 선택
            </label>
            <div className="flex flex-wrap gap-2">
              {TOPIC_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedTopic(option.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedTopic === option.id
                      ? "bg-purple-600 text-white shadow-lg"
                      : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 질문 도우미 칩 (프리셋 질문) */}
          {PRESET_QUESTIONS[selectedTopic] && (
            <div className="mb-6">
              <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                💡 이런 질문은 어떠세요?
              </p>
              <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                {PRESET_QUESTIONS[selectedTopic].map((question, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setUserQuestion(question)}
                    className="flex-shrink-0 px-4 py-2 bg-slate-700/40 hover:bg-purple-600/60 border border-slate-600/50 hover:border-purple-500/50 rounded-full text-xs sm:text-sm text-slate-200 hover:text-white transition-all duration-200 whitespace-nowrap shadow-sm hover:shadow-md"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 질문 입력 */}
          <form onSubmit={(e) => e.preventDefault()} className="mb-6 sm:mb-8">
            <label className="block text-sm font-medium text-slate-300 mb-3">
              질문 입력
            </label>
            <textarea
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              placeholder="구체적으로 질문할수록 더 정확한 답변을 받을 수 있어요. (예: 지금 만나는 사람과 내년에 결혼할 수 있을까요?)"
              maxLength={1000}
              rows={5}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-400">
                {userQuestion.length}/1000
              </span>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            <FortuneProcess
              onRequest={requestConsultation}
              renderResult={(answer) => (
            <div className="mb-8">
              {answer.shareId && (
                <div className="flex items-center justify-end gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => handleCopyLink(answer.shareId)}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                    title="주소 복사"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKakaoShare(answer.shareId)}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                    title="카카오톡 공유하기"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="mb-4 p-4 bg-purple-900/30 border border-purple-600/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0" aria-hidden>
                    {TOPIC_OPTIONS.find((t) => t.id === answer.topic)?.emoji}
                  </span>
                  <p className="text-white font-medium flex-1 min-w-0">{answer.question}</p>
                </div>
              </div>

              {/* 구조화된 결과 (parseFortuneResult 성공 시) */}
              {answer.parsedData ? (
                <div className="space-y-5">
                  {/* Header Card */}
                  <div className="p-6 bg-gradient-to-br from-purple-900/50 to-indigo-900/50 border border-purple-500/50 rounded-xl shadow-xl">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 leading-tight">
                      {answer.parsedData.summary?.title || "결론"}
                    </h2>
                    {answer.parsedData.summary?.score != null && (
                      <div className="mb-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm text-slate-300">실현 가능성</span>
                          <span className="text-2xl font-bold text-purple-300">
                            {answer.parsedData.summary.score}%
                          </span>
                          <span className="flex gap-0.5" aria-hidden>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <span
                                key={i}
                                className={
                                  i <=
                                  Math.round(
                                    (answer.parsedData.summary.score ||
                                      0) / 20
                                  )
                                    ? "text-amber-400"
                                    : "text-slate-600"
                                }
                              >
                                ★
                              </span>
                            ))}
                          </span>
                        </div>
                        <div className="w-full bg-slate-700/50 rounded-full h-2.5">
                          <div
                            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${answer.parsedData.summary.score}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(answer.parsedData.summary?.keywords || []).map(
                        (keyword, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 bg-purple-600/40 border border-purple-400/50 rounded-full text-xs font-medium text-purple-100"
                          >
                            {keyword}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Timeline Section */}
                  {answer.parsedData.timeline &&
                    answer.parsedData.timeline.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          📅 타임라인
                        </h3>
                        <div className="space-y-3">
                          {answer.parsedData.timeline.map(
                            (item, idx) => {
                              const isGood = item.type === "good";
                              const isBad = item.type === "bad";
                              const isNeutral = item.type === "neutral";
                              const bgColor = isGood
                                ? "bg-emerald-900/30 border-emerald-500/50"
                                : isBad
                                ? "bg-rose-900/30 border-rose-500/50"
                                : "bg-slate-700/30 border-slate-500/50";
                              const iconColor = isGood
                                ? "text-emerald-400"
                                : isBad
                                ? "text-rose-400"
                                : "text-slate-400";

                              return (
                                <div
                                  key={idx}
                                  className={`flex items-start gap-3 p-4 border rounded-lg ${bgColor}`}
                                >
                                  <div
                                    className={`text-xl flex-shrink-0 ${iconColor}`}
                                  >
                                    {isGood ? "✨" : isBad ? "⚠️" : "⏳"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white mb-1">
                                      {item.date}
                                    </p>
                                    <p className="text-sm text-slate-300 leading-relaxed">
                                      {item.note}
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}

                  {/* Analysis Section */}
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3">
                        🔮 종합 분석
                      </h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {answer.parsedData.analysis?.general || ""}
                      </p>
                    </div>

                    <div className="border-t border-slate-600/40 pt-5">
                      <h3 className="text-lg font-semibold text-white mb-3">
                        ⏰ 시기 분석
                      </h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {answer.parsedData.analysis?.timing || ""}
                      </p>
                    </div>

                    <div className="border-t border-slate-600/40 pt-5">
                      <div className="p-4 bg-amber-900/25 border-2 border-amber-500/50 rounded-xl">
                        <h3 className="text-lg font-semibold text-amber-200 mb-3 flex items-center gap-2">
                          💡 Action Tip
                        </h3>
                        <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">
                          {answer.parsedData.analysis?.advice || ""}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Fallback: Raw Text (JSON 파싱 실패 시) */
                <div className="p-6 bg-slate-800/30 border border-slate-600/50 rounded-lg">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    🔮 답변
                  </h3>
                  <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed text-base break-words">
                    <ReactMarkdown>
                      {answer.interpretation}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
              )}
            >
              <button
                type="button"
                disabled={!selectedProfile || !userQuestion.trim()}
                className="w-full mt-4 py-3 px-4 text-lg text-white font-semibold rounded-lg shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background:
                    "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
                }}
              >
                답변 받기
              </button>
            </FortuneProcess>
          </form>

        </div>
      </div>

      {user && <BottomNavigation />}

      {/* 프로필 등록 모달 */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSubmit={createProfile}
      />
    </div>
  );
}

export default Consultation;
