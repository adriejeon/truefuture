import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import BottomNavigation from "../components/BottomNavigation";
import ReactMarkdown from "react-markdown";
import { colors } from "../constants/colors";

// 카테고리 옵션
const TOPIC_OPTIONS = [
  { id: "LOVE", label: "💘 연애/결혼", emoji: "💘" },
  { id: "MONEY", label: "💰 재물/사업", emoji: "💰" },
  { id: "CAREER", label: "💼 직업/이직", emoji: "💼" },
  { id: "FAMILY", label: "🏠 가족/건강", emoji: "🏠" },
  { id: "OTHER", label: "🔮 기타", emoji: "🔮" },
];

// 로딩 메시지 순서 (3~4초 간격)
const LOADING_MESSAGES = [
  "🌌 별들의 위치를 계산하고 있습니다...",
  "🪐 행성 간의 유기적 관계를 분석 중입니다...",
  "⏳ 운의 흐름과 결정적 시기(Timing)를 추적합니다...",
  "📜 별들의 메시지를 해석하고 있습니다...",
];

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
  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [error, setError] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState(null); // { question, topic, interpretation, debugInfo }

  // 상담 내역
  const [consultationHistory, setConsultationHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  // 공유 링크로 들어온 경우
  const [searchParams, setSearchParams] = useSearchParams();
  const [sharedConsultation, setSharedConsultation] = useState(null);
  const [loadingShared, setLoadingShared] = useState(false);

  const loadingIntervalRef = useRef(null);

  // 프로필 데이터를 API 형식으로 변환
  const convertProfileToApiFormat = (profile) => {
    if (!profile) return null;
    return {
      birthDate: profile.birth_date.substring(0, 19),
      lat: profile.lat,
      lng: profile.lng,
    };
  };

  // 로딩 메시지 순환
  useEffect(() => {
    if (loading) {
      setLoadingMessageIndex(0);
      loadingIntervalRef.current = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 3500); // 3.5초마다 변경

      return () => {
        if (loadingIntervalRef.current) {
          clearInterval(loadingIntervalRef.current);
        }
      };
    }
  }, [loading]);

  // 상담 내역 로드
  useEffect(() => {
    if (user?.id && selectedProfile?.id) {
      loadConsultationHistory();
    }
  }, [user?.id, selectedProfile?.id]);

  // currentAnswer가 설정되면 자동으로 내역 새로고침
  useEffect(() => {
    if (currentAnswer && user?.id && selectedProfile?.id) {
      // 약간의 딜레이 후 내역 새로고침 (DB 저장 완료 대기)
      const timer = setTimeout(() => {
        loadConsultationHistory();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentAnswer, user?.id, selectedProfile?.id]);

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
        setSharedConsultation({
          question: meta.userQuestion || userInfo.userQuestion || "(질문 없음)",
          topic: meta.consultationTopic || userInfo.consultationTopic || "OTHER",
          interpretation: data.interpretation,
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
          { title: "결과 보기", link: { mobileWebUrl: shareUrl, webUrl: shareUrl } },
        ],
      });
    } catch (err) {
      alert("카카오톡 공유 중 오류가 발생했습니다: " + err.message);
    }
  };

  const loadConsultationHistory = async () => {
    if (!selectedProfile?.id || !user?.id) return;

    setLoadingHistory(true);
    try {
      // JOIN을 사용하여 fortune_history와 fortune_results를 한 번에 조회
      const { data, error: historyError } = await supabase
        .from("fortune_history")
        .select(
          `
          id,
          result_id,
          created_at,
          fortune_results (
            id,
            fortune_text,
            chart_data,
            created_at
          )
        `,
        )
        .eq("user_id", user.id) // Security: 내 것만 조회
        .eq("profile_id", selectedProfile.id) // 선택된 프로필만
        .eq("fortune_type", "consultation") // 싱글턴 질문만
        .order("created_at", { ascending: false })
        .limit(10);

      if (historyError) throw historyError;

      if (!data || data.length === 0) {
        setConsultationHistory([]);
        return;
      }

      // JOIN 결과 매핑 (fortune_results가 null인 경우 예외 처리)
      const historyWithDetails = data
        .map((h) => {
          const result = h.fortune_results;
          if (!result) {
            console.warn(
              `⚠️ [CONSULTATION] result_id ${h.result_id}에 해당하는 fortune_results가 없음 (무결성 깨짐)`,
            );
            return null;
          }

          // chart_data.metadata에서 질문/카테고리 추출 (신규 구조)
          const metadata = result.chart_data?.metadata || {};
          const question = metadata.userQuestion || "(질문 없음)";
          const topic = metadata.consultationTopic || "OTHER";

          return {
            id: result.id,
            question,
            topic,
            interpretation: result.fortune_text,
            debugInfo: {
              firdaria: result.chart_data?.firdaria,
              interaction: result.chart_data?.interaction,
              progression: result.chart_data?.progression,
              direction: result.chart_data?.direction,
            },
            createdAt: h.created_at, // fortune_history의 created_at 사용
          };
        })
        .filter(Boolean);

      setConsultationHistory(historyWithDetails);
    } catch (err) {
      console.error("❌ 상담 내역 로드 실패:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 질문 제출
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }

    if (!selectedProfile) {
      setError("프로필을 선택해주세요.");
      setShowProfileModal(true);
      return;
    }

    if (!userQuestion.trim()) {
      setError("질문을 입력해주세요.");
      return;
    }

    if (userQuestion.trim().length > 1000) {
      setError("질문은 1000자 이내로 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setCurrentAnswer(null);
    setLoadingMessageIndex(0);

    try {
      const formData = convertProfileToApiFormat(selectedProfile);
      if (!formData) {
        throw new Error("프로필 정보가 올바르지 않습니다.");
      }

      const requestBody = {
        ...formData,
        fortuneType: "consultation",
        userQuestion: userQuestion.trim(),
        consultationTopic: selectedTopic,
        profileId: selectedProfile.id, // profile_id 전송
      };

      const { data, error: functionError } = await supabase.functions.invoke(
        "get-fortune",
        {
          body: requestBody,
        },
      );

      if (functionError) {
        throw new Error(
          functionError.message || "서버 오류가 발생했습니다.",
        );
      }

      if (!data || data.error) {
        throw new Error(data?.error || "서버 오류가 발생했습니다.");
      }

      // 제미나이 인풋/아웃풋 프론트엔드 콘솔 출력
      if (data.geminiInput) {
        console.log("\n" + "=".repeat(60));
        console.log("📥 [자유 질문 상담소] 제미나이 인풋 (Input to Gemini)");
        console.log("=".repeat(60));
        console.log("[System Instruction]\n", data.geminiInput.systemInstruction);
        console.log("\n[User Prompt]\n", data.geminiInput.userPrompt);
        console.log("=".repeat(60) + "\n");
      }
      console.log("\n" + "=".repeat(60));
      console.log("📤 [자유 질문 상담소] 제미나이 아웃풋 (Gemini Response)");
      console.log("=".repeat(60));
      console.log(data.interpretation);
      console.log("=".repeat(60) + "\n");

      setCurrentAnswer({
        question: userQuestion.trim(),
        topic: selectedTopic,
        interpretation: data.interpretation,
        debugInfo: data.debugInfo || {},
        shareId: data.share_id || null,
      });

      // 입력 초기화
      setUserQuestion("");
    } catch (err) {
      console.error("❌ [CONSULTATION] 요청 실패:", err);
      setError(err.message || "요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 내역 클릭 (펼치기/접기)
  const toggleHistoryItem = (id) => {
    setExpandedHistoryId((prev) => (prev === id ? null : id));
  };

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
            자유 질문 상담소는 로그인 후 이용하실 수 있습니다.
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

  if (sharedConsultation) {
    const topicOption = TOPIC_OPTIONS.find((t) => t.id === sharedConsultation.topic);
    return (
      <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
        <div className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24">
          <div className="py-8 sm:py-12">
            <div className="mb-6 p-4 bg-purple-900/30 border border-purple-600/50 rounded-lg">
              <p className="text-purple-200 text-sm">친구가 공유한 상담이에요</p>
            </div>
            <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-2xl">{topicOption?.emoji || "🔮"}</div>
                <div className="flex-1">
                  <p className="text-slate-300 text-sm mb-1">{topicOption?.label || "상담"}</p>
                  <p className="text-white font-medium">{sharedConsultation.question}</p>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-800/30 border border-slate-600/50 rounded-lg mb-8">
              <h3 className="text-lg font-semibold text-white mb-4">🔮 답변</h3>
              <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed break-words">
                <ReactMarkdown>{sharedConsultation.interpretation}</ReactMarkdown>
              </div>
            </div>
            {!user && (
              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <p className="text-slate-300 mb-3">나도 궁금한 걸 물어보고 싶다면?</p>
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
                자유 질문 상담소로 이동 →
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
              ✨ 자유 질문 상담소
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              궁금한 것을 구체적으로 물어보세요. AI가 당신의 출생 차트와 현재
              행성 흐름(피르다리, 프로그레스, 솔라 아크)을 분석하여 맞춤형 답변을
              제공합니다.
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

          {/* 질문 입력 */}
          <form onSubmit={handleSubmit} className="mb-6 sm:mb-8">
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

            <button
              type="submit"
              disabled={loading || !selectedProfile || !userQuestion.trim()}
              className="w-full mt-4 py-3 px-4 text-lg text-white font-semibold rounded-lg shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background:
                  "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
              }}
            >
              {loading ? "답변 생성 중..." : "답변 받기"}
            </button>
          </form>

          {/* 로딩 애니메이션 (Storytelling) */}
          {loading && (
            <div className="mb-8 p-6 bg-slate-800/30 border border-slate-600/50 rounded-lg">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
                <p
                  className="text-slate-200 text-base text-center animate-fade-in-out"
                  key={loadingMessageIndex}
                >
                  {LOADING_MESSAGES[loadingMessageIndex]}
                </p>
              </div>
            </div>
          )}

          {/* 답변 결과 */}
          {!loading && currentAnswer && (
            <div className="mb-8">
              <div className="mb-4 p-4 bg-purple-900/30 border border-purple-600/50 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="text-2xl">
                      {
                        TOPIC_OPTIONS.find((t) => t.id === currentAnswer.topic)
                          ?.emoji
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-purple-200 text-sm mb-1">
                        {
                          TOPIC_OPTIONS.find((t) => t.id === currentAnswer.topic)
                            ?.label
                        }
                      </p>
                      <p className="text-white font-medium">
                        {currentAnswer.question}
                      </p>
                    </div>
                  </div>
                  {currentAnswer.shareId && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(currentAnswer.shareId)}
                        className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        title="링크 복사"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKakaoShare(currentAnswer.shareId)}
                        className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        title="카카오톡 공유"
                      >
                        <span className="text-sm font-medium">카카오톡</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-800/30 border border-slate-600/50 rounded-lg">
                <h3 className="text-lg font-semibold text-white mb-4">
                  🔮 답변
                </h3>
                <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed text-base break-words">
                  <ReactMarkdown>{currentAnswer.interpretation}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* 상담 내역 */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">
              📜 상담 내역
            </h3>

            {loadingHistory && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3"></div>
                <p className="text-slate-400 text-sm">내역 불러오는 중...</p>
              </div>
            )}

            {!loadingHistory && consultationHistory.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">
                  아직 상담 내역이 없습니다.
                </p>
              </div>
            )}

            {!loadingHistory && consultationHistory.length > 0 && (
              <div className="space-y-3">
                {consultationHistory.map((item) => {
                  const isExpanded = expandedHistoryId === item.id;
                  const topicOption = TOPIC_OPTIONS.find(
                    (t) => t.id === item.topic,
                  );

                  return (
                    <div
                      key={item.id}
                      className="border border-slate-600/50 rounded-lg overflow-hidden transition-all hover:border-slate-500"
                      style={{ backgroundColor: "rgba(15, 15, 43, 0.3)" }}
                    >
                      <button
                        onClick={() => toggleHistoryItem(item.id)}
                        className="w-full flex items-center justify-between p-4 text-left focus:outline-none"
                      >
                        <div className="flex-1 pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">
                              {topicOption?.emoji || "🔮"}
                            </span>
                            <span className="text-xs text-slate-400">
                              {new Date(item.createdAt).toLocaleDateString(
                                "ko-KR",
                                {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                },
                              )}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 line-clamp-2">
                            {item.question}
                          </p>
                        </div>
                        <svg
                          className={`w-5 h-5 text-slate-300 flex-shrink-0 transition-transform duration-300 ${
                            isExpanded ? "transform rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4">
                          <div className="pt-3 border-t border-slate-600/30 flex flex-col gap-3">
                            <div className="prose prose-invert max-w-none prose-sm text-slate-200 leading-relaxed break-words">
                              <ReactMarkdown>
                                {item.interpretation}
                              </ReactMarkdown>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyLink(item.id);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white text-sm transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                링크 복사
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleKakaoShare(item.id);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white text-sm transition-colors"
                              >
                                카카오톡 공유
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
