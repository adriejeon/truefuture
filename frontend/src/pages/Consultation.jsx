import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { saveFortuneHistory } from "../services/fortuneService";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import BottomNavigation from "../components/BottomNavigation";
import TypewriterLoader from "../components/TypewriterLoader";
import PrimaryButton from "../components/PrimaryButton";
import StarModal from "../components/StarModal";
import ReactMarkdown from "react-markdown";
import { colors } from "../constants/colors";
import { logFortuneInput } from "../utils/debugFortune";
import { invokeGetFortuneStream } from "../utils/getFortuneStream";
import {
  FORTUNE_STAR_COSTS,
  FORTUNE_TYPE_NAMES,
  fetchUserStars,
  consumeStars,
  checkStarBalance,
} from "../utils/starConsumption";
import AstrologyPageHelmet from "../components/AstrologyPageHelmet";
import LoginRequiredModal from "../components/LoginRequiredModal";

// 카테고리 옵션 (백엔드 consultationTopic과 일치)
const TOPIC_OPTIONS = [
  { id: "LOVE", label: "💘 연애/결혼", emoji: "💘" },
  { id: "MONEY", label: "💰 재물/사업", emoji: "💰" },
  { id: "WORK", label: "💼 직업/이직", emoji: "💼" },
  { id: "HEALTH", label: "🏥 건강/체력", emoji: "🏥" },
  { id: "EXAM", label: "📝 시험/합격", emoji: "📝" },
  { id: "MOVE", label: "🏡 이사/이동", emoji: "🏡" },
  { id: "WEEKLY", label: "📅 주간 운세", emoji: "📅" },
  { id: "MONTHLY", label: "🗓️ 월간 운세", emoji: "🗓️" },
  { id: "YEARLY", label: "📆 연간 운세", emoji: "📆" },
  { id: "OTHER", label: "🔮 기타", emoji: "🔮" },
];

// 프리셋 질문 (카테고리별 자주 묻는 질문)
const PRESET_QUESTIONS = {
  LOVE: [
    "짝사랑 중인데 연인이 될 수 있을까요?",
    "저는 언제 결혼할까요?",
    "헤어진 연인과 재회할 가능성이 있을까요?",
    "자녀는 언제 낳을 수 있을까요?",
  ],
  MONEY: [
    "지금 준비 중인 사업을 시작해도 될까요?",
    "올해 금전운의 흐름이 언제 가장 좋나요?",
    "지금 투자를 시작하기에 적절한 시기인가요?",
    "묶여있는 돈이 언제쯤 풀릴까요?",
  ],
  WORK: [
    "지금 회사를 그만두고 이직하는 게 좋을까요?",
    "사업을 시작할까요?",
    "언제쯤 승진하거나 인정받을 수 있을까요?",
    "프리랜서로 전향해도 좋을까요?",
  ],
  EXAM: [
    "이번 시험에 합격할 가능성이 몇 % 정도 될까요?",
    "이번에 공부가 잘 될까요?",
    "자격증 시험 합격운이 가장 좋은 시기는 언제인가요?",
  ],
  MOVE: [
    "지금 사는 곳에서 이사하는 게 좋을까요, 머무는 게 좋을까요?",
    "해외로 이동하거나 유학을 가도 될까요?",
    "문서운(부동산 계약)이 들어오는 시기가 언제인가요?",
  ],
  WEEKLY: [
    "이번 주 면접 발표가 긍정적일까요?",
    "이번 주 데이트가 성공적일까요?",
    "이번 주 있을 중요한 미팅이 성공적일까요?",
  ],
  MONTHLY: [
    "이번 달에 진행되는 프로젝트가 긍정적일까요?",
    "이번 달에 있을 소개팅이 괜찮을까요?",
    "이번 달에 있을 중요한 미팅이 성공적일까요?",
  ],
  YEARLY: [
    "1년 간 전체 운세 흐름이 어떻게 될까요?",
    "1년 간 결혼·이직 같은 큰 일이 있을까요?",
    "1년 간 금전운·사업운이 언제 가장 좋을까요?",
  ],
  HEALTH: [
    "요즘 건강 상태가 좋지 않은데 언제쯤 회복될까요?",
    "지금 겪고 있는 만성 질환의 원인이 뭔가요?",
    "정신 건강(우울/불안)이 언제쯤 안정될까요?",
    "수술이나 치료를 받기 좋은 시기는 언제인가요?",
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

/** 후속 질문 응답 여부: answer 객체가 있으면 후속 질문용 스키마(header/answer/action_tip/critical_date) */
const isFollowUpData = (data) => data && typeof data.answer === "object";

/** 후속 질문용 심플 컨설팅 카드 (header, answer, action_tip, critical_date) */
function FollowUpConsultationCard({ parsedData }) {
  if (!parsedData?.answer) return null;
  const { header, answer, action_tip, critical_date } = parsedData;
  return (
    <div className="space-y-5">
      {header?.title != null && (
        <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 leading-tight">
            {header.title}
          </h2>
          {header.keyword && (
            <span className="inline-block px-3 py-1.5 bg-[#2B2953] border border-[#253D87]/50 rounded-full text-xs font-medium text-blue-100 mt-2">
              {header.keyword}
            </span>
          )}
        </div>
      )}
      {answer?.conclusion != null && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">결론</h3>
          <p className="text-slate-200 leading-relaxed text-[15px] whitespace-pre-wrap">
            {answer.conclusion}
          </p>
        </div>
      )}
      {answer?.detail != null && (
        <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed text-[15px]">
          <ReactMarkdown>{answer.detail}</ReactMarkdown>
        </div>
      )}
      {action_tip && (action_tip.what || action_tip.why) && (
        <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl">
          <h3 className="text-lg font-semibold text-[#F9A302] mb-3 flex items-center gap-2">
            💡 Action Tip
          </h3>
          {action_tip.what && (
            <p className="text-slate-100 font-medium mb-2">{action_tip.what}</p>
          )}
          {action_tip.why && (
            <p className="text-slate-300 text-sm leading-relaxed">
              {action_tip.why}
            </p>
          )}
        </div>
      )}
      {critical_date &&
        (critical_date.date || critical_date.meaning) && (
          <div className="p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
            <h3 className="text-sm font-semibold text-slate-400 mb-1">
              📅 결정적 시기
            </h3>
            {critical_date.date && (
              <p className="text-white font-medium">{critical_date.date}</p>
            )}
            {critical_date.meaning && (
              <p className="text-slate-300 text-sm mt-1">
                {critical_date.meaning}
              </p>
            )}
          </div>
        )}
    </div>
  );
}

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

  // 임시 저장(드래프트) 읽기 헬퍼 — temp_consultation_state JSON 파싱
  const getTempConsultationState = () => {
    try {
      const raw = localStorage.getItem("temp_consultation_state");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  // UI 상태 (질문·토픽은 마운트 시 드래프트에서 복원)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(() =>
    getTempConsultationState()?.topic ?? null
  );
  const [userQuestion, setUserQuestion] = useState(() =>
    getTempConsultationState()?.question ?? ""
  );
  const [error, setError] = useState("");
  const [loadingConsultation, setLoadingConsultation] = useState(false);
  /** idle | waiting(API 호출~첫 청크 전) | streaming(첫 청크~스트림 중) | done(완료) */
  const [processStatus, setProcessStatus] = useState("idle");
  const [consultationAnswer, setConsultationAnswer] = useState(null);
  const [streamingInterpretation, setStreamingInterpretation] = useState("");
  const [streamingFollowUpInterpretation, setStreamingFollowUpInterpretation] = useState("");
  const [selectedChipIndex, setSelectedChipIndex] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const chipScrollRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const resultSectionRef = useRef(null);
  const firstChunkReceivedRef = useRef(false);
  
  // 후속 질문 관련 상태 (currentFollowUpInput은 드래프트에서 복원)
  const [showFollowUpButton, setShowFollowUpButton] = useState(false);
  const [resultSectionInView, setResultSectionInView] = useState(false); // 결과 영역이 뷰포트에 들어왔는지
  const [showFollowUpInput, setShowFollowUpInput] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState(() =>
    getTempConsultationState()?.currentFollowUpInput ?? ""
  );
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [followUpAnswers, setFollowUpAnswers] = useState([]); // 이전 대화 맥락용 (후속 질문 답변들)
  const consultationStateRestoredRef = useRef(false);

  // 히스토리 뷰에서의 후속 질문 (이전 대화 페이지에서 추가 질문 시)
  const [historyShowFollowUpInput, setHistoryShowFollowUpInput] = useState(false);
  const [historyFollowUpQuestion, setHistoryFollowUpQuestion] = useState(() =>
    localStorage.getItem("temp_consultation_history_followup") ?? ""
  );
  const [historyLoadingFollowUp, setHistoryLoadingFollowUp] = useState(false);
  const [starModalMode, setStarModalMode] = useState("first"); // 'first' | 'followUp' | 'historyFollowUp' | 'sharedFollowUp'
  const [showLoginRequiredModal, setShowLoginRequiredModal] = useState(false);

  // 공유 페이지에서의 후속 질문 (친구가 공유 링크로 들어왔을 때)
  const [sharedShowFollowUpInput, setSharedShowFollowUpInput] = useState(false);
  const [sharedFollowUpQuestion, setSharedFollowUpQuestion] = useState(() =>
    localStorage.getItem("temp_consultation_shared_followup") ?? ""
  );
  const [sharedLoadingFollowUp, setSharedLoadingFollowUp] = useState(false);

  // 별 차감 모달 상태 (모달 열 때 한 번에 설정해 항상 최신 잔액 표시)
  const [showStarModal, setShowStarModal] = useState(false);
  const [starModalData, setStarModalData] = useState({
    type: "confirm",
    required: FORTUNE_STAR_COSTS.consultation,
    current: 0,
  });
  const requiredStars = FORTUNE_STAR_COSTS.consultation;

  // 공유 링크로 들어온 경우
  const [searchParams, setSearchParams] = useSearchParams();
  const [sharedConsultation, setSharedConsultation] = useState(null);
  const [loadingShared, setLoadingShared] = useState(false);

  // 히스토리 뷰 (대화 목록에서 클릭한 경우)
  const { resultId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [historyView, setHistoryView] = useState(null); // { question, interpretation }
  const profileRestoredRef = useRef(false);

  // 질문·토픽·프로필·답변·후속 맥락 임시 저장(Draft): 하나의 키에 JSON으로 저장
  useEffect(() => {
    const state = {
      question: userQuestion,
      topic: selectedTopic,
      profileId: selectedProfile?.id ?? null,
      answer: consultationAnswer ?? null,
      followUpHistory: followUpAnswers ?? [],
      currentFollowUpInput: followUpQuestion ?? "",
    };
    localStorage.setItem("temp_consultation_state", JSON.stringify(state));
  }, [userQuestion, selectedTopic, selectedProfile, consultationAnswer, followUpAnswers, followUpQuestion]);

  // 마운트 시 저장된 상담 맥락 복원 (메인 상담소 뷰일 때만: 히스토리/공유 뷰가 아님)
  useEffect(() => {
    if (consultationStateRestoredRef.current) return;
    const isHistoryOrSharedView = resultId || searchParams.get("id");
    if (isHistoryOrSharedView) return;
    const saved = getTempConsultationState();
    if (!saved) return;
    consultationStateRestoredRef.current = true;
    if (saved.answer != null) {
      setConsultationAnswer(saved.answer);
    }
    if (Array.isArray(saved.followUpHistory) && saved.followUpHistory.length > 0) {
      setFollowUpAnswers(saved.followUpHistory);
    }
    if (saved.currentFollowUpInput != null && saved.currentFollowUpInput !== "") {
      setFollowUpQuestion(saved.currentFollowUpInput);
    }
    const hasAnswer = saved.answer != null;
    const followUpCount = Array.isArray(saved.followUpHistory) ? saved.followUpHistory.length : 0;
    const hasCurrentInput = !!String(saved.currentFollowUpInput ?? "").trim();
    setShowFollowUpButton(hasAnswer && followUpCount < 2 && !hasCurrentInput);
    setShowFollowUpInput(hasCurrentInput);
  }, [resultId, searchParams]);

  // 마운트 후 프로필 목록 로드 시 저장된 profileId로 프로필 복원 (1회만)
  useEffect(() => {
    if (profileRestoredRef.current || !profiles?.length) return;
    const saved = getTempConsultationState();
    if (!saved?.profileId) return;
    const profile = profiles.find((p) => p.id === saved.profileId);
    if (profile) {
      selectProfile(profile);
      profileRestoredRef.current = true;
    }
  }, [profiles, selectProfile]);

  // 후속 질문 임시 저장(Draft): 히스토리/공유 뷰용 별도 키 (메인 플로우는 temp_consultation_state에 포함)
  useEffect(() => {
    localStorage.setItem("temp_consultation_history_followup", historyFollowUpQuestion);
  }, [historyFollowUpQuestion]);
  useEffect(() => {
    localStorage.setItem("temp_consultation_shared_followup", sharedFollowUpQuestion);
  }, [sharedFollowUpQuestion]);

  // 칩 스크롤 감지
  useEffect(() => {
    const scrollContainer = chipScrollRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollLeft = scrollContainer.scrollLeft;
      setIsScrolled(scrollLeft > 0);

      // 스크롤 중 상태로 설정
      setIsScrolling(true);

      // 기존 타이머 클리어
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // 스크롤이 멈춘 후 500ms 후에 스크롤바 숨김
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 500);
    };

    // 초기 상태 설정
    setIsScrolled(false);
    setIsScrolling(false);

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [selectedTopic]);

  // 운세 결과 영역이 뷰포트에 들어오면 플로팅 버튼 표시 (Intersection Observer)
  useEffect(() => {
    if (!consultationAnswer || !resultSectionRef.current) return;
    const el = resultSectionRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setResultSectionInView(entry.isIntersecting);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -20% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [consultationAnswer]);

  // 운세 결과가 나왔을 때 화면을 결과 영역으로 스크롤 (타이핑 애니메이션 후 결과 표시 시)
  useEffect(() => {
    if (!consultationAnswer || !resultSectionRef.current) return;
    const el = resultSectionRef.current;
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [consultationAnswer]);

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

  // 히스토리 뷰 로드 (대화 목록에서 클릭한 경우 /consultation/:resultId) — 후속 질문 추가 후 재호출로 갱신
  // 공유 링크(/consultation/:id) 진입 시에는 loadingShared를 건드리지 않음 → 공유 데이터 로드가 로딩을 제어해 '새 질문' 플래시 방지
  const loadHistoryItem = useCallback(async () => {
    if (!resultId) {
      setHistoryView(null);
      return;
    }
    if (!resultId) setLoadingShared(true);
    try {
      const { data: historyRows, error: historyError } = await supabase
        .from("fortune_history")
        .select("user_question, result_id, created_at")
        .eq("result_id", resultId)
        .eq("fortune_type", "consultation")
        .order("created_at", { ascending: true });

      if (historyError || !historyRows?.length) {
        console.error("히스토리 조회 실패:", historyError);
        setHistoryView(null);
        return;
      }

      const { data: resultData, error: resultError } = await supabase
        .from("fortune_results")
        .select("fortune_text, user_info, chart_data")
        .eq("id", resultId)
        .single();

      if (resultError || !resultData) {
        console.error("결과 조회 실패:", resultError);
        setHistoryView(null);
        return;
      }

      const parsedData = parseFortuneResult(resultData.fortune_text);
      const mainQuestion = historyRows[0];
      const followUpQuestions = historyRows.slice(1);
      const meta = resultData.chart_data?.metadata || {};
      const userInfo = resultData.user_info || {};
      const firstQuestionText =
        mainQuestion?.user_question?.trim() ||
        meta.userQuestion ||
        userInfo.userQuestion ||
        "(질문 없음)";
      const consultationTopic =
        userInfo.consultationTopic ||
        meta.consultationTopic ||
        "OTHER";

      const { data: childResults } = await supabase
        .from("fortune_results")
        .select("id, fortune_text, created_at, user_info")
        .eq("parent_result_id", resultId)
        .order("created_at", { ascending: true });

      const childList = childResults || [];
      const childInterpretations = childList.map((r) => r.fortune_text);
      const followUpAnswers = childList.map((r, i) => {
        const childQuestion =
          r.user_info?.userQuestion?.trim() ||
          followUpQuestions[i]?.user_question?.trim() ||
          "(질문 없음)";
        return {
          question: childQuestion,
          interpretation: childInterpretations[i] || "",
          parsedData: parseFortuneResult(childInterpretations[i]),
        };
      });

      setHistoryView({
        question: firstQuestionText,
        followUpQuestions: followUpQuestions.map((q) => ({
          question: q.user_question,
          created_at: q.created_at,
        })),
        interpretation: resultData.fortune_text,
        parsedData,
        shareId: resultId,
        followUpAnswers,
        consultationTopic,
      });
    } catch (err) {
      console.error("히스토리 로드 실패:", err);
      setHistoryView(null);
    } finally {
      if (!resultId) setLoadingShared(false);
    }
  }, [resultId]);

  useEffect(() => {
    if (!resultId) {
      setHistoryView(null);
      setHistoryShowFollowUpInput(false);
      setHistoryFollowUpQuestion("");
      return;
    }
    setHistoryShowFollowUpInput(false);
    setHistoryFollowUpQuestion("");
    loadHistoryItem();
  }, [resultId, loadHistoryItem]);

  // 공유된 상담 데이터 로드 (공유 페이지 진입 시 + 공유 페이지에서 후속 질문 추가 후 갱신)
  const loadSharedConsultation = useCallback(async (sharedId) => {
    if (!sharedId) return;
    setLoadingShared(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/get-fortune?id=${sharedId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.error || data.fortuneType !== "consultation") {
        setSharedConsultation(null);
        return;
      }
      const userInfo = data.userInfo || {};
      const meta = data.chart_data?.metadata || {};
      const parsedData = parseFortuneResult(data.interpretation);
      setSharedConsultation({
        question: meta.userQuestion || userInfo.userQuestion || "(질문 없음)",
        topic: meta.consultationTopic || userInfo.consultationTopic || "OTHER",
        interpretation: data.interpretation,
        parsedData,
        shareId: sharedId,
        profileName: userInfo.profileName || null,
        followUps: (data.followUps || []).map((fu) => ({
          question: fu.question,
          interpretation: fu.interpretation,
          parsedData: parseFortuneResult(fu.interpretation),
        })),
      });
    } catch {
      setSharedConsultation(null);
    } finally {
      setLoadingShared(false);
    }
  }, []);

  // 공유 데이터 로드: ?id= 쿼리 또는 경로 /consultation/:resultId 둘 다 지원
  useEffect(() => {
    const sharedId = searchParams.get("id") || resultId;
    if (!sharedId) return;
    loadSharedConsultation(sharedId);
  }, [searchParams, resultId, loadSharedConsultation]);

  // URL은 ?id= 쿼리 형태를 유지 (path로 리다이렉트하지 않음)
  // const idFromQuery = searchParams.get("id");
  // useEffect(() => {
  //   if (!idFromQuery || !sharedConsultation?.shareId) return;
  //   if (idFromQuery !== sharedConsultation.shareId) return;
  //   navigate(`/consultation/${idFromQuery}`, { replace: true });
  // }, [idFromQuery, sharedConsultation?.shareId, navigate]);

  /** 공유 링크: /consultation?id=uuid 쿼리 파라미터 방식 */
  const getShareUrl = (shareId) => {
    const origin = window.location.origin;
    return `${origin}/consultation?id=${shareId}`;
  };

  const handleCopyLink = (shareId) => {
    const shareUrl = getShareUrl(shareId);
    navigator.clipboard.writeText(shareUrl).then(
      () => alert("링크가 복사되었어요. 친구에게 보내보세요!"),
      () => alert("복사에 실패했어요. 주소창의 링크를 복사해 주세요.")
    );
  };

  /** 상담 결과 한 줄 요약 생성 (parsedData.summary 기반) */
  const buildConsultationShareSummary = (parsedData) => {
    if (!parsedData?.summary) return null;
    const title = parsedData.summary.title?.trim();
    const score = parsedData.summary.score;
    if (!title && score == null) return null;
    const parts = [];
    if (title) parts.push(title);
    if (score != null) parts.push(`실현 가능성 ${score}%`);
    return parts.join(" · ") || null;
  };

  const handleKakaoShare = (shareId, shareSummary = null) => {
    if (!window.Kakao?.isInitialized()) {
      alert("카카오톡 공유 기능을 사용할 수 없습니다.");
      return;
    }
    const shareUrl = getShareUrl(shareId);
    const isLocalhost = window.location.hostname === "localhost";
    const imageUrl = isLocalhost
      ? "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
      : `${window.location.origin}/assets/800x800.png`;
    const description =
      shareSummary?.trim() ||
      "AI 점성술로 분석한 맞춤 상담 결과를 확인해보세요.";
    const title = shareSummary
      ? "진짜미래 - 상담 결과 공유"
      : "진짜미래 - 자유 질문 상담 결과를 공유했어요";
    try {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title,
          description,
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

  // FortuneProcess용: 스트리밍 API 호출 (onChunk/onDone은 handleConfirmStarUsage에서 처리)
  const buildFirstQuestionRequestBody = useCallback(() => {
    const formData = convertProfileToApiFormat(selectedProfile);
    if (!formData) throw new Error("프로필 정보가 올바르지 않습니다.");
    return {
      ...formData,
      fortuneType: "consultation",
      userQuestion: userQuestion.trim(),
      consultationTopic: selectedTopic,
      profileId: selectedProfile.id,
      profileName: selectedProfile.name || null,
    };
  }, [selectedProfile, selectedTopic, userQuestion]);

  // 폼 제출: 별 잔액 확인 → 모달 표시 → 차감 → API 호출
  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!selectedProfile || !userQuestion.trim()) return;
      if (!user?.id) {
        setShowLoginRequiredModal(true);
        return;
      }

      setError("");
      setConsultationAnswer(null);
      setFollowUpAnswers([]);
      setShowFollowUpButton(false);
      setShowFollowUpInput(false);
      setFollowUpQuestion("");

      try {
        // 1. 별 잔액 조회 (망원경 개수만 사용)
        const stars = await fetchUserStars(user.id);
        const paidStars = stars.paid; // 망원경 개수만 사용

        // 2. 잔액 확인 후 모달 데이터와 함께 한 번에 설정 (이전 값이 남지 않도록)
        const balanceStatus = checkStarBalance(paidStars, requiredStars);

        if (balanceStatus === "insufficient") {
          const nextData = {
            type: "alert",
            required: requiredStars,
            current: paidStars,
          };
          console.log("[별 모달] 잔액 부족 알림", {
            필요한별: nextData.required,
            보유별: nextData.current,
          });
          setStarModalData(nextData);
          setStarModalMode("first");
          setShowStarModal(true);
        } else {
          const nextData = {
            type: "confirm",
            required: requiredStars,
            current: paidStars,
          };
          setStarModalData(nextData);
          setStarModalMode("first");
          setShowStarModal(true);
        }
      } catch (err) {
        setError(err?.message || "별 잔액 조회 중 오류가 발생했습니다.");
      }
    },
    [selectedProfile, userQuestion, user, requiredStars]
  );

  // 별 차감 후 운세 조회 (SSE 스트리밍)
  const handleConfirmStarUsage = useCallback(async () => {
    if (!user?.id) {
      setShowLoginRequiredModal(true);
      return;
    }

    setLoadingConsultation(true);
    setError("");
    setProcessStatus("waiting");
    setConsultationAnswer(null);
    setStreamingInterpretation("");
    setFollowUpAnswers([]);
    setShowFollowUpInput(false);
    setFollowUpQuestion("");
    firstChunkReceivedRef.current = false;

    try {
      await consumeStars(
        user.id,
        requiredStars,
        `자유 질문: ${userQuestion.trim().slice(0, 50)}...`
      );

      const requestBody = buildFirstQuestionRequestBody();
      console.groupCollapsed(
        "🔍 [자유 상담소] get-fortune 요청 — 제미나이 인풋 기반 정보"
      );
      console.log("요청 본문 (requestBody):", requestBody);
      console.groupEnd();

      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: (text) => {
          if (!firstChunkReceivedRef.current) {
            firstChunkReceivedRef.current = true;
            setProcessStatus("streaming");
            requestAnimationFrame(() => {
              resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
          setStreamingInterpretation((prev) => prev + text);
        },
        onDone: ({ shareId, fullText, fullData, debug }) => {
          setLoadingConsultation(false);
          setProcessStatus("done");
          const dataForLog = fullData ?? debug;
          if (dataForLog) logFortuneInput(dataForLog, { fortuneType: "consultation" });
          const interpretation = fullText ?? fullData?.interpretation ?? "";
          setConsultationAnswer({
            question: userQuestion.trim(),
            topic: selectedTopic,
            interpretation,
            parsedData: parseFortuneResult(interpretation),
            debugInfo: fullData?.debugInfo ?? debug?.debugInfo ?? {},
            shareId: shareId ?? null,
          });
          setStreamingInterpretation("");
          if (shareId) {
            saveFortuneHistory(
              user.id,
              selectedProfile.id,
              "consultation",
              shareId,
              null,
              userQuestion.trim()
            );
          }
          setUserQuestion("");
          setSelectedChipIndex(null);
          setTimeout(() => setShowFollowUpButton(true), 500);
        },
        onError: (err) => {
          setError(err?.message || "요청 중 오류가 발생했습니다.");
          setLoadingConsultation(false);
          setProcessStatus("idle");
        },
      });
    } catch (err) {
      setError(err?.message || "요청 중 오류가 발생했습니다.");
      setLoadingConsultation(false);
      setProcessStatus("idle");
    }
  }, [
    user,
    requiredStars,
    userQuestion,
    selectedTopic,
    selectedProfile,
    buildFirstQuestionRequestBody,
    saveFortuneHistory,
  ]);

  // 새 상담 하기: 임시 저장 삭제 + 결과/후속 상태 초기화
  const clearConsultationDraft = useCallback(() => {
    localStorage.removeItem("temp_consultation_state");
    setProcessStatus("idle");
    setConsultationAnswer(null);
    setStreamingInterpretation("");
    setFollowUpAnswers([]);
    setFollowUpQuestion("");
    setShowFollowUpButton(false);
    setShowFollowUpInput(false);
    firstChunkReceivedRef.current = false;
  }, []);

  // 후속 질문 버튼 클릭
  const handleFollowUpButtonClick = () => {
    setShowFollowUpInput(true);
    setShowFollowUpButton(false);
  };

  // 후속 질문 제출
  const handleFollowUpSubmit = async (e) => {
    e?.preventDefault?.();
    if (!followUpQuestion.trim() || !consultationAnswer?.shareId) return;
    if (!user?.id) {
      setShowLoginRequiredModal(true);
      return;
    }

    setError("");

    try {
      // 1. 별 잔액 조회
      const stars = await fetchUserStars(user.id);
      const paidStars = stars.paid;

      // 2. 잔액 확인 후 모달 표시
      const balanceStatus = checkStarBalance(paidStars, requiredStars);

      if (balanceStatus === "insufficient") {
        const nextData = {
          type: "alert",
          required: requiredStars,
          current: paidStars,
        };
        setStarModalData(nextData);
        setStarModalMode("followUp");
        setShowStarModal(true);
      } else {
        const nextData = {
          type: "confirm",
          required: requiredStars,
          current: paidStars,
        };
        setStarModalData(nextData);
        setStarModalMode("followUp");
        setShowStarModal(true);
      }
    } catch (err) {
      setError(err?.message || "별 잔액 조회 중 오류가 발생했습니다.");
    }
  };

  // 히스토리 뷰에서 후속 질문 제출 (별 확인 후 API 호출)
  const handleHistoryFollowUpSubmit = async (e) => {
    e?.preventDefault?.();
    if (!historyFollowUpQuestion.trim() || !historyView?.shareId || !resultId) return;
    if (!user?.id) {
      setShowLoginRequiredModal(true);
      return;
    }
    if (!selectedProfile) {
      setError("프로필을 선택해 주세요.");
      return;
    }
    setError("");
    try {
      const stars = await fetchUserStars(user.id);
      const paidStars = stars.paid;
      const balanceStatus = checkStarBalance(paidStars, requiredStars);
      if (balanceStatus === "insufficient") {
        setStarModalData({
          type: "alert",
          required: requiredStars,
          current: paidStars,
        });
      } else {
        setStarModalData({
          type: "confirm",
          required: requiredStars,
          current: paidStars,
        });
      }
      setStarModalMode("historyFollowUp");
      setShowStarModal(true);
    } catch (err) {
      setError(err?.message || "별 잔액 조회 중 오류가 발생했습니다.");
    }
  };

  // 후속 질문 별 차감 후 API 호출 (SSE 스트리밍)
  const handleConfirmFollowUpStarUsage = useCallback(async () => {
    if (!user?.id || !consultationAnswer?.shareId) return;

    setLoadingFollowUp(true);
    setError("");
    setStreamingFollowUpInterpretation("");

    try {
      await consumeStars(
        user.id,
        requiredStars,
        `후속 질문: ${followUpQuestion.trim().slice(0, 50)}...`
      );

      const previousConversation = [
        { question: consultationAnswer.question, interpretation: consultationAnswer.interpretation },
        ...followUpAnswers.map((a) => ({ question: a.question, interpretation: a.interpretation })),
      ];
      const formData = convertProfileToApiFormat(selectedProfile);
      if (!formData) throw new Error("프로필 정보가 올바르지 않습니다.");
      const requestBody = {
        ...formData,
        fortuneType: "consultation",
        userQuestion: followUpQuestion.trim(),
        consultationTopic: selectedTopic,
        profileId: selectedProfile.id,
        profileName: selectedProfile.name || null,
        previousConversation,
        parentResultId: consultationAnswer.shareId,
      };

      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: (text) => setStreamingFollowUpInterpretation((prev) => prev + text),
        onDone: ({ fullText }) => {
          setLoadingFollowUp(false);
          const interpretation = fullText ?? "";
          const parsedData = parseFortuneResult(interpretation);
          const answer = {
            question: followUpQuestion.trim(),
            topic: selectedTopic,
            interpretation,
            parsedData,
            debugInfo: {},
            shareId: consultationAnswer.shareId,
            isFollowUp: true,
          };
          saveFortuneHistory(
            user.id,
            selectedProfile.id,
            "consultation",
            consultationAnswer.shareId,
            null,
            followUpQuestion.trim()
          );
          setFollowUpAnswers((prev) => {
            const next = [...prev, answer];
            setShowFollowUpButton(next.length < 2);
            return next;
          });
          setFollowUpQuestion("");
          setShowFollowUpInput(false);
          setStreamingFollowUpInterpretation("");
        },
        onError: (err) => {
          setError(err?.message || "후속 질문 요청 중 오류가 발생했습니다.");
          setLoadingFollowUp(false);
        },
      });
    } catch (err) {
      setError(err?.message || "후속 질문 요청 중 오류가 발생했습니다.");
      setLoadingFollowUp(false);
    }
  }, [
    user,
    requiredStars,
    followUpQuestion,
    consultationAnswer,
    followUpAnswers,
    selectedProfile,
    selectedTopic,
    saveFortuneHistory,
  ]);

  // 히스토리 뷰에서 별 확정 후 후속 질문 API 호출
  const handleConfirmHistoryFollowUpStarUsage = useCallback(async () => {
    if (!user?.id || !historyView?.shareId || !resultId || !historyFollowUpQuestion.trim() || !selectedProfile) return;

    setHistoryLoadingFollowUp(true);
    setError("");

    try {
      await consumeStars(
        user.id,
        requiredStars,
        `후속 질문: ${historyFollowUpQuestion.trim().slice(0, 50)}...`
      );

      const previousConversation = [
        {
          question: historyView.question,
          interpretation: historyView.interpretation,
        },
        ...(historyView.followUpAnswers || []).map((a) => ({
          question: a.question,
          interpretation: a.interpretation,
        })),
      ];

      const formData = convertProfileToApiFormat(selectedProfile);
      if (!formData) throw new Error("프로필 정보가 올바르지 않습니다.");

      const requestBody = {
        ...formData,
        fortuneType: "consultation",
        userQuestion: historyFollowUpQuestion.trim(),
        consultationTopic: historyView.consultationTopic || "OTHER",
        profileId: selectedProfile.id,
        profileName: selectedProfile.name || null,
        previousConversation,
        parentResultId: historyView.shareId,
      };

      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: () => {},
        onDone: async () => {
          await saveFortuneHistory(
            user.id,
            selectedProfile.id,
            "consultation",
            historyView.shareId,
            null,
            historyFollowUpQuestion.trim()
          );
          setShowStarModal(false);
          localStorage.removeItem("temp_consultation_history_followup");
          setHistoryFollowUpQuestion("");
          setHistoryShowFollowUpInput(false);
          await loadHistoryItem();
        },
        onError: (err) => setError(err?.message || "후속 질문 요청 중 오류가 발생했습니다."),
      });
    } catch (err) {
      setError(err?.message || "후속 질문 요청 중 오류가 발생했습니다.");
    } finally {
      setHistoryLoadingFollowUp(false);
    }
  }, [
    user,
    requiredStars,
    historyView,
    resultId,
    historyFollowUpQuestion,
    selectedProfile,
    loadHistoryItem,
  ]);

  // 공유 페이지에서 후속 질문 제출 (별 확인 후 API 호출)
  const handleSharedFollowUpSubmit = async (e) => {
    e?.preventDefault?.();
    if (!sharedFollowUpQuestion.trim() || !sharedConsultation?.shareId) return;
    if (!user?.id) {
      setShowLoginRequiredModal(true);
      return;
    }
    if (!selectedProfile) {
      setError("프로필을 선택해 주세요.");
      return;
    }
    setError("");
    try {
      const stars = await fetchUserStars(user.id);
      const paidStars = stars.paid;
      const balanceStatus = checkStarBalance(paidStars, requiredStars);
      setStarModalData(
        balanceStatus === "insufficient"
          ? { type: "alert", required: requiredStars, current: paidStars }
          : { type: "confirm", required: requiredStars, current: paidStars }
      );
      setStarModalMode("sharedFollowUp");
      setShowStarModal(true);
    } catch (err) {
      setError(err?.message || "별 잔액 조회 중 오류가 발생했습니다.");
    }
  };

  const handleConfirmSharedFollowUpStarUsage = useCallback(async () => {
    if (!user?.id) {
      setShowLoginRequiredModal(true);
      return;
    }
    if (!sharedConsultation?.shareId || !sharedFollowUpQuestion.trim() || !selectedProfile) return;

    setSharedLoadingFollowUp(true);
    setError("");

    try {
      await consumeStars(
        user.id,
        requiredStars,
        `후속 질문: ${sharedFollowUpQuestion.trim().slice(0, 50)}...`
      );

      const previousConversation = [
        {
          question: sharedConsultation.question,
          interpretation: sharedConsultation.interpretation,
        },
        ...(sharedConsultation.followUps || []).map((a) => ({
          question: a.question,
          interpretation: a.interpretation,
        })),
      ];

      const formData = convertProfileToApiFormat(selectedProfile);
      if (!formData) throw new Error("프로필 정보가 올바르지 않습니다.");

      const requestBody = {
        ...formData,
        fortuneType: "consultation",
        userQuestion: sharedFollowUpQuestion.trim(),
        consultationTopic: sharedConsultation.topic || "OTHER",
        profileId: selectedProfile.id,
        profileName: selectedProfile.name || null,
        previousConversation,
        parentResultId: sharedConsultation.shareId,
      };

      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: () => {},
        onDone: async () => {
          await saveFortuneHistory(
            user.id,
            selectedProfile.id,
            "consultation",
            sharedConsultation.shareId,
            null,
            sharedFollowUpQuestion.trim()
          );
          setShowStarModal(false);
          localStorage.removeItem("temp_consultation_shared_followup");
          setSharedFollowUpQuestion("");
          setSharedShowFollowUpInput(false);
          await loadSharedConsultation(sharedConsultation.shareId);
        },
        onError: (err) => setError(err?.message || "후속 질문 요청 중 오류가 발생했습니다."),
      });
    } catch (err) {
      setError(err?.message || "후속 질문 요청 중 오류가 발생했습니다.");
    } finally {
      setSharedLoadingFollowUp(false);
    }
  }, [
    user,
    requiredStars,
    sharedConsultation,
    sharedFollowUpQuestion,
    selectedProfile,
    loadSharedConsultation,
  ]);

  // 인증 로딩 중에는 스피너만 보이고, 화면/SEO를 가리지 않도록 블록하지 않음 (아래 공유 로딩/공유 뷰/메인으로 진행)
  // SEO 및 비로그인 노출을 위해 진입 차단 제거

  // 앱 내 대화 목록에서 연 경우 vs 공유 링크로 연 경우 구분
  const fromHistoryDrawer = Boolean(location.state?.fromHistory);

  // 공유 링크로 들어온 경우에만 로딩 스피너 (URL에 id가 있을 때). 과거 이력 전용 로딩과 분리해 플래시 방지.
  const hasSharedIdInUrl = Boolean(searchParams.get("id") || resultId);
  if (hasSharedIdInUrl && loadingShared) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-400">
            {fromHistoryDrawer ? "이전 상담 내용을 불러오는 중..." : "공유된 상담을 불러오는 중..."}
          </p>
        </div>
      </div>
    );
  }

  // 공유 뷰: 링크로 들어온 경우(친구 공유 페이지). 앱 내 대화 목록(fromHistory)에서 연 경우에만 히스토리 뷰 표시.
  const isSharedView =
    sharedConsultation &&
    (searchParams.get("id") || (resultId && !(historyView && fromHistoryDrawer)));
  if (isSharedView) {
    const profileName = sharedConsultation.profileName?.trim() || "";
    const sharedTitle = profileName ? `${profileName}님의 진짜 미래예요` : "진짜 미래예요";
    return (
      <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
        <div className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24">
          <div className="py-8 sm:py-12">
            <h2 className="text-xl sm:text-2xl font-bold text-primary mb-6">
              {sharedTitle}
            </h2>
            <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
              <p className="text-white font-medium">
                {sharedConsultation.question}
              </p>
            </div>
            {sharedConsultation.parsedData ? (
              isFollowUpData(sharedConsultation.parsedData) ? (
                <div className="mb-8">
                  <FollowUpConsultationCard
                    parsedData={sharedConsultation.parsedData}
                  />
                </div>
              ) : (
              <div className="space-y-5 mb-8">
                <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl">
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 leading-tight">
                    {sharedConsultation.parsedData.summary?.title || "결론"}
                  </h2>
                  {sharedConsultation.parsedData.summary?.score != null && (
                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl font-bold text-white">
                          {sharedConsultation.parsedData.summary.score}%
                        </span>
                        <span className="flex gap-0.5" aria-hidden>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span
                              key={i}
                              className={
                                i <= Math.round((sharedConsultation.parsedData.summary?.score || 0) / 20)
                                  ? "text-amber-400"
                                  : "text-[#121230]"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </span>
                      </div>
                      <div className="w-full bg-[#121230] rounded-full h-2.5">
                        <div
                          className="h-2.5 rounded-full transition-all duration-500"
                          style={{
                            backgroundColor: colors.primary,
                            width: `${sharedConsultation.parsedData.summary?.score || 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {(sharedConsultation.parsedData.summary?.keywords || []).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-[#2B2953] border border-[#253D87]/50 rounded-full text-xs font-medium text-blue-100"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
                {sharedConsultation.parsedData.timeline && sharedConsultation.parsedData.timeline.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">📅 타임라인</h3>
                    <div className="space-y-3">
                      {sharedConsultation.parsedData.timeline.map((item, idx) => {
                        const isGood = item.type === "good";
                        const isBad = item.type === "bad";
                        const bgColor = isGood ? "bg-[rgba(242,172,172,0.1)] border-[#F2ACAC]" : isBad ? "bg-rose-900/30 border-rose-500/50" : "bg-slate-700/30 border-slate-500/50";
                        const iconColor = isGood ? "text-[#F2ACAC]" : isBad ? "text-rose-400" : "text-slate-400";
                        return (
                          <div key={idx} className={`flex items-start gap-3 p-4 border rounded-lg ${bgColor}`}>
                            <div className={`text-xl flex-shrink-0 ${iconColor}`}>{isGood ? "✨" : isBad ? "⚠️" : "⏳"}</div>
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
                <div className="space-y-5">
                  {sharedConsultation.parsedData.analysis?.general && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3">🔮 종합 분석</h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {sharedConsultation.parsedData.analysis.general}
                      </p>
                    </div>
                  )}
                  {sharedConsultation.parsedData.analysis?.timing && (
                    <div className="pt-5">
                      <h3 className="text-lg font-semibold text-white mb-3">⏰ 시기 분석</h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {sharedConsultation.parsedData.analysis.timing}
                      </p>
                    </div>
                  )}
                  {sharedConsultation.parsedData.analysis?.advice && (
                    <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl">
                      <h3 className="text-lg font-semibold text-[#F9A302] mb-3">💡 Action Tip</h3>
                      <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {sharedConsultation.parsedData.analysis.advice}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              )
            ) : (
              <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl mb-8">
                <h3 className="text-lg font-semibold text-white mb-3">🔮 답변</h3>
                <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed break-words">
                  <ReactMarkdown>{sharedConsultation.interpretation}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* 후속 질문·답변 (있을 때만 표시, 공유 페이지에서는 버튼/입력 없음) */}
            {sharedConsultation.followUps?.length > 0 && (
              <div className="mt-8 pt-8 border-t border-slate-600/50">
                {sharedConsultation.followUps.map((fu, fuIdx) => (
                  <div key={fuIdx} className={fuIdx > 0 ? "mt-8 pt-8 border-t border-slate-600/50" : ""}>
                    <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
                      <div className="flex items-start gap-2">
                        <div className="text-2xl">💬</div>
                        <p className="text-white font-medium">{fu.question}</p>
                      </div>
                    </div>
                    {fu.parsedData ? (
                      isFollowUpData(fu.parsedData) ? (
                        <FollowUpConsultationCard parsedData={fu.parsedData} />
                      ) : (
                      <div className="space-y-5">
                        <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl">
                          <h2 className="text-xl font-bold text-white mb-4 leading-tight">{fu.parsedData.summary?.title || "결론"}</h2>
                          {fu.parsedData.summary?.score != null && (
                            <div className="mb-4">
                              <span className="text-2xl font-bold text-white">{fu.parsedData.summary.score}%</span>
                              <div className="w-full bg-[#121230] rounded-full h-2.5">
                                <div className="h-2.5 rounded-full transition-all duration-500" style={{ backgroundColor: colors.primary, width: `${fu.parsedData.summary.score}%` }} />
                              </div>
                            </div>
                          )}
                          {(fu.parsedData.summary?.keywords || []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {fu.parsedData.summary.keywords.map((kw, i) => (
                                <span key={i} className="px-3 py-1.5 bg-[#2B2953] border border-[#253D87]/50 rounded-full text-xs font-medium text-blue-100">{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {fu.parsedData.timeline?.length > 0 && (
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-4">📅 타임라인</h3>
                            <div className="space-y-3">
                              {fu.parsedData.timeline.map((item, idx) => {
                                const isGood = item.type === "good";
                                const isBad = item.type === "bad";
                                const bgColor = isGood ? "bg-[rgba(242,172,172,0.1)] border-[#F2ACAC]" : isBad ? "bg-rose-900/30 border-rose-500/50" : "bg-slate-700/30 border-slate-500/50";
                                const iconColor = isGood ? "text-[#F2ACAC]" : isBad ? "text-rose-400" : "text-slate-400";
                                return (
                                  <div key={idx} className={`flex items-start gap-3 p-4 border rounded-lg ${bgColor}`}>
                                    <div className={`text-xl flex-shrink-0 ${iconColor}`}>{isGood ? "✨" : isBad ? "⚠️" : "⏳"}</div>
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
                        {fu.parsedData.analysis?.general && (
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-3">🔮 종합 분석</h3>
                            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">{fu.parsedData.analysis.general}</p>
                          </div>
                        )}
                        {fu.parsedData.analysis?.timing && (
                          <div className="pt-5">
                            <h3 className="text-lg font-semibold text-white mb-3">⏰ 시기 분석</h3>
                            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">{fu.parsedData.analysis.timing}</p>
                          </div>
                        )}
                        {fu.parsedData.analysis?.advice && (
                          <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl">
                            <h3 className="text-lg font-semibold text-[#F9A302] mb-3">💡 Action Tip</h3>
                            <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">{fu.parsedData.analysis.advice}</p>
                          </div>
                        )}
                      </div>
                      )
                    ) : (
                      <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl">
                        <h3 className="text-lg font-semibold text-white mb-3">🔮 답변</h3>
                        <div className="prose prose-invert max-w-none text-slate-200">
                          <ReactMarkdown>{fu.interpretation}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 방문자 유입 CTA: 홈과 동일 스타일 */}
            <div className="mt-10 flex justify-center">
              <PrimaryButton
                type="button"
                variant="gold"
                fullWidth
                onClick={() => navigate("/")}
              >
                내 미래도 확인하기
              </PrimaryButton>
            </div>
          </div>
        </div>
        {sharedLoadingFollowUp && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4" role="dialog" aria-modal="true" aria-label="후속 질문 분석 중">
            <div className="w-full max-w-md min-h-[300px] flex items-center justify-center">
              <TypewriterLoader />
            </div>
          </div>
        )}
        <BottomNavigation />
      </div>
    );
  }

  // 히스토리 뷰 (대화 목록에서 클릭한 경우, 또는 /consultation/:resultId 로만 들어온 경우)
  // 비로그인 시 진입 차단하지 않음: 메인 UI는 항상 렌더링, 프로필/제출 액션 시에만 로그인 모달
  if (historyView) {
    return (
      <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
        <div className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24">
          <div className="py-8 sm:py-12">
            {/* 상단: 새로운 질문 버튼 */}
            <div className="mb-6">
              <button
                onClick={() => navigate("/consultation")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-black rounded-lg transition-colors"
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
                  <p className="text-white font-medium">
                    {historyView.question}
                  </p>
                </div>
              </div>
            </div>

            {/* 첫 질문에 대한 답변 (위: 첫 질문 → 첫 운세 결과) */}
            {!(historyView.interpretation?.trim()) ? (
              <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl mb-8">
                <h3 className="text-lg font-semibold text-white mb-3">🔮 답변</h3>
                <p className="text-slate-400 text-sm">답변을 불러올 수 없습니다.</p>
              </div>
            ) : historyView.parsedData ? (
              isFollowUpData(historyView.parsedData) ? (
                <div className="mb-8">
                  <FollowUpConsultationCard
                    parsedData={historyView.parsedData}
                  />
                </div>
              ) : (
              <div className="space-y-5 mb-8">
                {/* 요약 카드 */}
                <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl">
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 leading-tight">
                    {historyView.parsedData.summary?.title || "결론"}
                  </h2>
                  {historyView.parsedData.summary?.score != null && (
                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl font-bold text-white">
                          {historyView.parsedData.summary.score}%
                        </span>
                        <span className="flex gap-0.5" aria-hidden>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span
                              key={i}
                              className={
                                i <=
                                Math.round(
                                  (historyView.parsedData.summary?.score || 0) /
                                    20
                                )
                                  ? "text-amber-400"
                                  : "text-[#121230]"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </span>
                      </div>
                      <div className="w-full bg-[#121230] rounded-full h-2.5">
                        <div
                          className="h-2.5 rounded-full transition-all duration-500"
                          style={{
                            backgroundColor: colors.primary,
                            width: `${
                              historyView.parsedData.summary?.score || 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {(historyView.parsedData.summary?.keywords || []).map(
                      (keyword, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-[#2B2953] border border-[#253D87]/50 rounded-full text-xs font-medium text-blue-100"
                        >
                          {keyword}
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* 타임라인 */}
                {historyView.parsedData.timeline &&
                  historyView.parsedData.timeline.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        📅 타임라인
                      </h3>
                      <div className="space-y-3">
                        {historyView.parsedData.timeline.map((item, idx) => {
                          const isGood = item.type === "good";
                          const isBad = item.type === "bad";
                          const bgColor = isGood
                            ? "bg-[rgba(242,172,172,0.1)] border-[#F2ACAC]"
                            : isBad
                            ? "bg-rose-900/30 border-rose-500/50"
                            : "bg-slate-700/30 border-slate-500/50";
                          const iconColor = isGood
                            ? "text-[#F2ACAC]"
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
                        })}
                      </div>
                    </div>
                  )}

                {/* 종합 분석 + 시기 분석 + Action Tip */}
                <div className="space-y-5">
                  {historyView.parsedData.analysis?.general && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3">
                        🔮 종합 분석
                      </h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {historyView.parsedData.analysis.general}
                      </p>
                    </div>
                  )}
                  {historyView.parsedData.analysis?.timing && (
                    <div className="pt-5">
                      <h3 className="text-lg font-semibold text-white mb-3">
                        ⏰ 시기 분석
                      </h3>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {historyView.parsedData.analysis.timing}
                      </p>
                    </div>
                  )}
                  {historyView.parsedData.analysis?.advice && (
                    <div className="pt-5">
                      <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl">
                        <h3 className="text-lg font-semibold text-[#F9A302] mb-3 flex items-center gap-2">
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
              )
            ) : (
              <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl mb-8">
                <h3 className="text-lg font-semibold text-white mb-3">
                  🔮 답변
                </h3>
                <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200">
                  <ReactMarkdown>{historyView.interpretation}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* 후속 질문·답변 (아래: 후속 질문 → 후속 운세 결과) */}
            {historyView.followUpAnswers?.length > 0 &&
              historyView.followUpAnswers.map((fu, fuIdx) => (
                <div
                  key={fuIdx}
                  className="mt-8 pt-8 border-t border-slate-600/50"
                >
                  <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="text-2xl">💬</div>
                      <p className="text-white font-medium">{fu.question}</p>
                    </div>
                  </div>
                  {!(fu.interpretation?.trim()) ? (
                    <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl">
                      <h3 className="text-lg font-semibold text-white mb-3">🔮 답변</h3>
                      <p className="text-slate-400 text-sm">
                        답변을 불러올 수 없습니다. (이전에 저장된 후속 질문은 DB에서 연결해 주어야 표시됩니다.)
                      </p>
                    </div>
                  ) : fu.parsedData ? (
                    isFollowUpData(fu.parsedData) ? (
                      <FollowUpConsultationCard parsedData={fu.parsedData} />
                    ) : (fu.parsedData.summary || fu.parsedData.analysis) ? (
                    <div className="space-y-5">
                      <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl">
                        <h2 className="text-xl font-bold text-white mb-4 leading-tight">
                          {fu.parsedData.summary?.title || "결론"}
                        </h2>
                        {fu.parsedData.summary?.score != null && (
                          <div className="mb-4">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-2xl font-bold text-white">
                                {fu.parsedData.summary.score}%
                              </span>
                            </div>
                            <div className="w-full bg-[#121230] rounded-full h-2.5">
                              <div
                                className="h-2.5 rounded-full transition-all duration-500"
                                style={{
                                  backgroundColor: colors.primary,
                                  width: `${fu.parsedData.summary.score}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                        {(fu.parsedData.summary?.keywords || []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {fu.parsedData.summary.keywords.map((kw, i) => (
                              <span
                                key={i}
                                className="px-3 py-1.5 bg-[#2B2953] border border-[#253D87]/50 rounded-full text-xs font-medium text-blue-100"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {fu.parsedData.timeline && fu.parsedData.timeline.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            📅 타임라인
                          </h3>
                          <div className="space-y-3">
                            {fu.parsedData.timeline.map((item, idx) => {
                              const isGood = item.type === "good";
                              const isBad = item.type === "bad";
                              const bgColor = isGood
                                ? "bg-[rgba(242,172,172,0.1)] border-[#F2ACAC]"
                                : isBad
                                ? "bg-rose-900/30 border-rose-500/50"
                                : "bg-slate-700/30 border-slate-500/50";
                              const iconColor = isGood
                                ? "text-[#F2ACAC]"
                                : isBad
                                ? "text-rose-400"
                                : "text-slate-400";
                              return (
                                <div
                                  key={idx}
                                  className={`flex items-start gap-3 p-4 border rounded-lg ${bgColor}`}
                                >
                                  <div className={`text-xl flex-shrink-0 ${iconColor}`}>
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
                            })}
                          </div>
                        </div>
                      )}
                      {fu.parsedData.analysis?.general && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-3">
                            🔮 종합 분석
                          </h3>
                          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                            {fu.parsedData.analysis.general}
                          </p>
                        </div>
                      )}
                      {fu.parsedData.analysis?.timing && (
                        <div className="pt-5">
                          <h3 className="text-lg font-semibold text-white mb-3">
                            ⏰ 시기 분석
                          </h3>
                          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                            {fu.parsedData.analysis.timing}
                          </p>
                        </div>
                      )}
                      {fu.parsedData.analysis?.advice && (
                        <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl">
                          <h3 className="text-lg font-semibold text-[#F9A302] mb-3">
                            💡 Action Tip
                          </h3>
                          <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">
                            {fu.parsedData.analysis.advice}
                          </p>
                        </div>
                      )}
                    </div>
                    ) : (
                    <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl">
                      <h3 className="text-lg font-semibold text-white mb-3">
                        🔮 답변
                      </h3>
                      <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200">
                        <ReactMarkdown>{fu.interpretation}</ReactMarkdown>
                      </div>
                    </div>
                    )
                  ) : (
                    <div className="p-6 bg-slate-800/40 border border-slate-600/50 rounded-xl">
                      <h3 className="text-lg font-semibold text-white mb-3">
                        🔮 답변
                      </h3>
                      <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200">
                        <ReactMarkdown>{fu.interpretation}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}

            {/* 이전 대화에서 후속 질문 가능 (질문 1개당 2회까지: 2개 있으면 버튼 숨김) */}
            {historyView.followUpAnswers?.length < 2 && (
              <div className="mt-8 pt-8 border-t border-slate-600/50">
                {!historyShowFollowUpInput ? (
                  <button
                    type="button"
                    onClick={() => setHistoryShowFollowUpInput(true)}
                    className="w-full py-3 px-4 bg-gradient-to-r from-primary/90 to-primary text-black font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-5 h-5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                    이 답변에 대해 질문해 볼까요?
                  </button>
                ) : (
                  <div className="animate-fade-in">
                    <form onSubmit={handleHistoryFollowUpSubmit}>
                      <label className="block text-sm font-medium text-slate-300 mb-3">
                        후속 질문
                      </label>
                      <textarea
                        value={historyFollowUpQuestion}
                        onChange={(e) => setHistoryFollowUpQuestion(e.target.value)}
                        placeholder="답변에 대해 더 궁금한 점을 물어보세요."
                        maxLength={1000}
                        rows={4}
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                      />
                      <div className="flex justify-end mt-2">
                        <span className="text-xs text-slate-400">
                          {historyFollowUpQuestion.length}/1000
                        </span>
                      </div>
                      <PrimaryButton
                        type="submit"
                        disabled={!historyFollowUpQuestion.trim() || historyLoadingFollowUp}
                        fullWidth
                        className="mt-4"
                      >
                        질문하기
                      </PrimaryButton>
                    </form>
                  </div>
                )}
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
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleKakaoShare(
                        historyView.shareId,
                        buildConsultationShareSummary(historyView.parsedData)
                      )
                    }
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                    title="카카오톡 공유하기"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {historyLoadingFollowUp && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4"
            role="dialog"
            aria-modal="true"
            aria-label="후속 질문 분석 중"
          >
            <div className="w-full max-w-md min-h-[300px] flex items-center justify-center">
              <TypewriterLoader />
            </div>
          </div>
        )}
        <BottomNavigation />

        {/* 히스토리 뷰에서도 별 차감 모달 노출 필요 (후속 질문 시 확인 모달) */}
        <StarModal
          key={`star-modal-${starModalData.current}-${starModalData.required}-${starModalData.type}`}
          isOpen={showStarModal}
          onClose={() => setShowStarModal(false)}
          type={starModalData.type}
          requiredAmount={starModalData.required}
          currentBalance={starModalData.current}
          onConfirm={
            starModalMode === "historyFollowUp"
              ? handleConfirmHistoryFollowUpStarUsage
              : handleConfirmStarUsage
          }
          fortuneType={FORTUNE_TYPE_NAMES.consultation}
        />
      </div>
    );
  }

  // sharedConsultation은 위에서 searchParams.get("id") && sharedConsultation 일 때만 렌더 (공유 전용 뷰, 후속 질문 버튼 없음)

  return (
    <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
      <AstrologyPageHelmet />
      <LoginRequiredModal
        isOpen={showLoginRequiredModal}
        onClose={() => setShowLoginRequiredModal(false)}
        description="진짜미래는 로그인 후 이용하실 수 있습니다."
      />
      <div
        className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        <div className="py-8 sm:py-12">
          {/* 페이지 소개 (SEO/GEO 본문 텍스트 동기화용 section id 유지) */}
          <section id="ai-comment-astrology" className="mb-6 sm:mb-8">
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              정통 고전 점성술로 내 운명의 진짜 흐름을 찾고 계신가요? 단순한
              별자리 풀이를 넘어 서양 점성술의 깊이 있는 원리로 삶의 방향을
              명확히 알고 싶을 때, 진짜미래는 수천 년간 검증된 천체 운행 데이터를
              바탕으로 당신만의 정확한 인생 지도를 그려드립니다. 이미 수백 명의
              내담자가 실제 상담을 통해 소름 돋는 정확도를 증명했으며, 태어난
              시간과 장소에 맞춘 고전 점성술의 정교한 연산 알고리즘을 통해 가장
              확실한 해답을 제공합니다.
            </p>
          </section>

          {/* 프로필 선택 */}
          <div className="mb-6 sm:mb-8">
            <ProfileSelector
              profiles={profiles}
              selectedProfile={selectedProfile}
              onSelectProfile={selectProfile}
              onCreateProfile={() => {
                if (!user) {
                  setShowLoginRequiredModal(true);
                  return;
                }
                setShowProfileModal(true);
              }}
              onDeleteProfile={deleteProfile}
              loading={profilesLoading}
            />
          </div>

          {/* 토픽 선택 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-3">
              먼저 카테고리를 선택해주세요
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TOPIC_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedTopic(option.id);
                    setUserQuestion("");
                    setSelectedChipIndex(null);
                    setIsScrolled(false);
                    setIsScrolling(false);
                  }}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedTopic === option.id
                      ? "bg-primary text-black shadow-lg"
                      : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 카테고리가 선택된 경우에만 질문 입력 영역 표시 */}
          {selectedTopic && (
            <>
              {/* 질문 도우미 칩 (프리셋 질문) */}
              {PRESET_QUESTIONS[selectedTopic] && (
                <div className="mb-6 -mx-4">
                  <p className="text-xs text-slate-400 mb-3 px-4">
                    이런 질문은 어떠세요?
                  </p>
                  <div
                    ref={chipScrollRef}
                    className={`flex flex-nowrap gap-2 overflow-x-auto pb-2 ${
                      isScrolling
                        ? "chip-scrollbar-show scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
                        : "chip-scrollbar-hide"
                    } ${isScrolled ? "" : "pl-4"}`}
                  >
                    {PRESET_QUESTIONS[selectedTopic].map((question, idx) => {
                      const isSelected =
                        selectedChipIndex === idx && userQuestion === question;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setUserQuestion(question);
                            setSelectedChipIndex(idx);
                          }}
                          className={`flex-shrink-0 px-4 py-2 border rounded-full text-xs sm:text-sm transition-all duration-200 whitespace-nowrap shadow-sm hover:shadow-md ${
                            isSelected
                              ? "bg-primary border-primary text-black"
                              : "bg-slate-700/40 hover:bg-primary border-slate-600/50 hover:border-primary text-slate-200 hover:text-black"
                          }`}
                        >
                          {question}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 질문 입력 */}
              <form
                onSubmit={handleSubmit}
                className="mb-6 sm:mb-8"
              >
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  질문 입력
                </label>
                <textarea
                  value={userQuestion}
                  onChange={(e) => {
                    setUserQuestion(e.target.value);
                    // 사용자가 직접 입력하면 선택 상태 해제
                    setSelectedChipIndex(null);
                  }}
                  placeholder="구체적으로 질문할수록 더 정확한 답변을 받을 수 있어요. (예: 지금 만나는 사람과 내년에 결혼할 수 있을까요?)"
                  maxLength={1000}
                  rows={5}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
                <div className="flex justify-end mt-2">
                  <span className="text-xs text-slate-400">
                    {userQuestion.length}/1000
                  </span>
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                    {error}
                  </div>
                )}

                <PrimaryButton
                  type="submit"
                  disabled={
                    !selectedProfile ||
                    !userQuestion.trim() ||
                    loadingConsultation
                  }
                  fullWidth
                  className="mt-4"
                >
                  진짜미래 확인
                </PrimaryButton>
              </form>

              {/* 로딩 모달: waiting 또는 streaming 상태에서 중앙 애니메이션 */}
              {(processStatus === "waiting" || processStatus === "streaming") && (
                <div
                  className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-label="운세 분석 중"
                >
                  <div className="w-full max-w-md min-h-[300px] flex items-center justify-center">
                    <TypewriterLoader />
                  </div>
                </div>
              )}

              {/* 상담 결과: done 상태에서만 표시 */}
              {consultationAnswer && (
                <div
                  ref={resultSectionRef}
                  className="mb-8 transition-colors duration-300 rounded-xl"
                >
                  <div className="contents">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <button
                      type="button"
                      onClick={clearConsultationDraft}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      새 상담 하기
                    </button>
                    {consultationAnswer.shareId && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyLink(consultationAnswer.shareId)
                        }
                        className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        title="주소 복사"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleKakaoShare(
                            consultationAnswer.shareId,
                            buildConsultationShareSummary(
                              consultationAnswer.parsedData
                            )
                          )
                        }
                        className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        title="카카오톡 공유하기"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </button>
                    </div>
                    )}
                  </div>
                  <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">💬</div>
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {consultationAnswer.question}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 구조화된 결과 (parseFortuneResult 성공 시) */}
                  {consultationAnswer.parsedData ? (
                    isFollowUpData(consultationAnswer.parsedData) ? (
                      <FollowUpConsultationCard
                        parsedData={consultationAnswer.parsedData}
                      />
                    ) : (
                    <div className="space-y-5">
                      {/* Header Card */}
                      <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl">
                        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 leading-tight">
                          {consultationAnswer.parsedData.summary?.title ||
                            "결론"}
                        </h2>
                        {consultationAnswer.parsedData.summary?.score !=
                          null && (
                          <div className="mb-4">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-2xl font-bold text-white">
                                {
                                  consultationAnswer.parsedData.summary
                                    .score
                                }
                                %
                              </span>
                              <span className="flex gap-0.5" aria-hidden>
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <span
                                    key={i}
                                    className={
                                      i <=
                                      Math.round(
                                        (consultationAnswer.parsedData
                                          .summary?.score || 0) / 20
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
                            <div className="w-full bg-[#121230] rounded-full h-2.5">
                              <div
                                className="h-2.5 rounded-full transition-all duration-500"
                                style={{
                                  backgroundColor: colors.primary,
                                  width: `${consultationAnswer.parsedData.summary.score}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {(
                            consultationAnswer.parsedData.summary
                              ?.keywords || []
                          ).map((keyword, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1.5 bg-[#2B2953] border border-[#253D87]/50 rounded-full text-xs font-medium text-blue-100"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Timeline Section */}
                      {consultationAnswer.parsedData.timeline &&
                        consultationAnswer.parsedData.timeline.length > 0 && (
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                              📅 타임라인
                            </h3>
                            <div className="space-y-3">
                              {consultationAnswer.parsedData.timeline.map(
                                (item, idx) => {
                                  const isGood = item.type === "good";
                                  const isBad = item.type === "bad";
                                  const bgColor = isGood
                                    ? "bg-[rgba(242,172,172,0.1)] border-[#F2ACAC]"
                                    : isBad
                                    ? "bg-rose-900/30 border-rose-500/50"
                                    : "bg-slate-700/30 border-slate-500/50";
                                  const iconColor = isGood
                                    ? "text-[#F2ACAC]"
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
                                        {isGood
                                          ? "✨"
                                          : isBad
                                          ? "⚠️"
                                          : "⏳"}
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
                            {consultationAnswer.parsedData.analysis
                              ?.general || ""}
                          </p>
                        </div>

                        <div className="pt-5">
                          <h3 className="text-lg font-semibold text-white mb-3">
                            ⏰ 시기 분석
                          </h3>
                          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                            {consultationAnswer.parsedData.analysis?.timing ||
                              ""}
                          </p>
                        </div>

                        <div className="pt-5">
                          <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl">
                            <h3 className="text-lg font-semibold text-[#F9A302] mb-3 flex items-center gap-2">
                              💡 Action Tip
                            </h3>
                            <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">
                              {consultationAnswer.parsedData.analysis
                                ?.advice || ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    )
                  ) : (
                    /* Fallback: Raw Text (JSON 파싱 실패 시) */
                    <div className="p-6 bg-slate-800/30 border border-slate-600/50 rounded-lg">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        🔮 답변
                      </h3>
                      <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed text-base break-words">
                        <ReactMarkdown>
                          {consultationAnswer.interpretation}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* 후속 질문 입력창 (결과 영역 안에 유지) */}
                  {showFollowUpInput && (
                    <div className="mt-6 animate-fade-in">
                      <form onSubmit={handleFollowUpSubmit}>
                        <label className="block text-sm font-medium text-slate-300 mb-3">
                          후속 질문
                        </label>
                        <textarea
                          value={followUpQuestion}
                          onChange={(e) => setFollowUpQuestion(e.target.value)}
                          placeholder="답변에 대해 더 궁금한 점을 물어보세요."
                          maxLength={1000}
                          rows={4}
                          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                        />
                        <div className="flex justify-end mt-2">
                          <span className="text-xs text-slate-400">
                            {followUpQuestion.length}/1000
                          </span>
                        </div>
                        <PrimaryButton
                          type="submit"
                          disabled={!followUpQuestion.trim() || loadingFollowUp}
                          fullWidth
                          className="mt-4"
                        >
                          질문하기
                        </PrimaryButton>
                      </form>
                    </div>
                  )}

                  {/* 후속 질문 스트리밍 중 표시 */}
                  {loadingFollowUp && (
                    <div className="mt-6 border-t border-slate-600/50 pt-6">
                      <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
                        <div className="flex items-start gap-3">
                          <div className="text-2xl">💬</div>
                          <div className="flex-1">
                            <p className="text-white font-medium">{followUpQuestion}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-6 bg-[rgba(37,61,135,0.15)] border border-slate-600/50 rounded-xl min-h-[120px]">
                        <ReactMarkdown>{streamingFollowUpInterpretation || "..."}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* 후속 질문 답변들 (여러 개일 수 있음) */}
                  {followUpAnswers.length > 0 && (
                    <div className="contents">
                    {followUpAnswers.map((followUpAnswer, answerIdx) => (
                      <div
                        key={answerIdx}
                        className="mt-6 border-t border-slate-600/50 pt-6"
                      >
                        <div className="mb-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="text-2xl">💬</div>
                            <div className="flex-1">
                              <p className="text-white font-medium">
                                {followUpAnswer.question}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* 후속 질문 답변 내용 */}
                        {followUpAnswer.parsedData ? (
                          isFollowUpData(followUpAnswer.parsedData) ? (
                            <FollowUpConsultationCard
                              parsedData={followUpAnswer.parsedData}
                            />
                          ) : (
                          <div className="space-y-5">
                            <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl">
                              <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 leading-tight">
                                {followUpAnswer.parsedData.summary?.title ||
                                  "결론"}
                              </h2>
                              {followUpAnswer.parsedData.summary?.score !=
                                null && (
                                <div className="mb-4">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl font-bold text-white">
                                      {followUpAnswer.parsedData.summary
                                        .score}
                                      %
                                    </span>
                                    <span className="flex gap-0.5" aria-hidden>
                                      {[1, 2, 3, 4, 5].map((i) => (
                                        <span
                                          key={i}
                                          className={
                                            i <=
                                            Math.round(
                                              (followUpAnswer.parsedData
                                                .summary?.score || 0) / 20
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
                                  <div className="w-full bg-[#121230] rounded-full h-2.5">
                                    <div
                                      className="h-2.5 rounded-full transition-all duration-500"
                                      style={{
                                        backgroundColor: colors.primary,
                                        width: `${followUpAnswer.parsedData.summary.score}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1">
                                {(
                                  followUpAnswer.parsedData.summary
                                    ?.keywords || []
                                ).map((keyword, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1.5 bg-[#2B2953] border border-[#253D87]/50 rounded-full text-xs font-medium text-blue-100"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {followUpAnswer.parsedData.timeline &&
                              followUpAnswer.parsedData.timeline.length > 0 && (
                                <div>
                                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    📅 타임라인
                                  </h3>
                                  <div className="space-y-3">
                                    {followUpAnswer.parsedData.timeline.map(
                                      (item, idx) => {
                                        const isGood = item.type === "good";
                                        const isBad = item.type === "bad";
                                        const bgColor = isGood
                                          ? "bg-[rgba(242,172,172,0.1)] border-[#F2ACAC]"
                                          : isBad
                                          ? "bg-rose-900/30 border-rose-500/50"
                                          : "bg-slate-700/30 border-slate-500/50";
                                        const iconColor = isGood
                                          ? "text-[#F2ACAC]"
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
                                              {isGood
                                                ? "✨"
                                                : isBad
                                                ? "⚠️"
                                                : "⏳"}
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

                            <div className="space-y-5">
                              <div>
                                <h3 className="text-lg font-semibold text-white mb-3">
                                  🔮 종합 분석
                                </h3>
                                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                                  {followUpAnswer.parsedData.analysis?.general ||
                                    ""}
                                </p>
                              </div>

                              <div className="pt-5">
                                <h3 className="text-lg font-semibold text-white mb-3">
                                  ⏰ 시기 분석
                                </h3>
                                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                                  {followUpAnswer.parsedData.analysis?.timing ||
                                    ""}
                                </p>
                              </div>

                              <div className="pt-5">
                                <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl">
                                  <h3 className="text-lg font-semibold text-[#F9A302] mb-3 flex items-center gap-2">
                                    💡 Action Tip
                                  </h3>
                                  <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-[15px]">
                                    {followUpAnswer.parsedData.analysis
                                      ?.advice || ""}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                          )
                        ) : (
                          <div className="p-6 bg-slate-800/30 border border-slate-600/50 rounded-lg">
                            <h3 className="text-lg font-semibold text-white mb-4">
                              🔮 답변
                            </h3>
                            <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed text-base break-words">
                              <ReactMarkdown>
                                {followUpAnswer.interpretation}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 후속 질문 플로팅 버튼 - 운세 결과 영역을 스크롤해서 보면 화면 하단에 고정 표시 (공유 페이지에서는 미노출) */}
      {(consultationAnswer &&
        resultSectionInView &&
        showFollowUpButton &&
        !showFollowUpInput &&
        followUpAnswers.length < 2 &&
        !(sharedConsultation && (searchParams.get("id") || (resultId && !(historyView && fromHistoryDrawer))))) && (
          <div className="fixed bottom-20 left-0 right-0 z-40 px-4 flex justify-center">
            <div className="w-full max-w-[600px] animate-slide-up-float">
              <button
                type="button"
                onClick={handleFollowUpButtonClick}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary/90 to-primary text-black font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
              >
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                이 답변에 대해 질문해 볼까요?
              </button>
            </div>
          </div>
        )}

      <BottomNavigation />

      {/* 프로필 등록 모달 */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSubmit={createProfile}
      />

      {/* 별 차감/부족 모달 - requiredAmount/currentBalance로 명시 전달해 혼동 방지 */}
      <StarModal
        key={`star-modal-${starModalData.current}-${starModalData.required}-${starModalData.type}`}
        isOpen={showStarModal}
        onClose={() => setShowStarModal(false)}
        type={starModalData.type}
        requiredAmount={starModalData.required}
        currentBalance={starModalData.current}
        onConfirm={
          starModalMode === "sharedFollowUp"
            ? handleConfirmSharedFollowUpStarUsage
            : starModalMode === "historyFollowUp"
              ? handleConfirmHistoryFollowUpStarUsage
              : showFollowUpInput || followUpQuestion.trim()
                ? handleConfirmFollowUpStarUsage
                : handleConfirmStarUsage
        }
        fortuneType={FORTUNE_TYPE_NAMES.consultation}
      />
    </div>
  );
}

export default Consultation;
