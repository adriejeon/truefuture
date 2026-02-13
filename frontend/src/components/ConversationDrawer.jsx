import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import {
  fetchConsultationHistory,
  fetchCompatibilityHistory,
} from "../services/fortuneService";

function ConversationDrawer({ isOpen, onClose }) {
  const { user } = useAuth();
  const { profiles } = useProfiles();
  const [activeTab, setActiveTab] = useState("questions"); // "questions" | "fortunes"
  const [conversations, setConversations] = useState([]);
  const [compatibilityHistory, setCompatibilityHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      if (activeTab === "questions") {
        loadConsultationHistory();
      } else {
        loadCompatibilityHistory();
      }
    }
  }, [isOpen, user, activeTab]);

  const loadConsultationHistory = async () => {
    setLoading(true);
    try {
      const history = await fetchConsultationHistory(user.id);
      setConversations(history);
    } catch (err) {
      console.error("대화 내역 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadCompatibilityHistory = async () => {
    setLoading(true);
    try {
      const history = await fetchCompatibilityHistory(user.id);
      setCompatibilityHistory(history);
    } catch (err) {
      console.error("궁합 내역 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "방금 전";
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;

    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const truncateText = (text, maxLength = 50) => {
    if (!text) return "질문 없음";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const getCompatibilityTitle = (historyItem) => {
    // fortune_results의 user_info에서 두 프로필의 생년월일 정보 가져오기
    const fortuneResults = historyItem.fortune_results;
    const userInfo = fortuneResults?.user_info;
    
    if (!userInfo || !userInfo.user1 || !userInfo.user2) {
      // user_info가 없거나 형식이 맞지 않으면 기본값 반환
      const profile = Array.isArray(historyItem.profiles) 
        ? historyItem.profiles[0] 
        : historyItem.profiles;
      
      if (profile && profile.name) {
        return profile.name + " & ?";
      }
      return "궁합";
    }

    // 첫 번째 프로필: fortune_history에 저장된 profile_id 사용
    const profile1 = Array.isArray(historyItem.profiles) 
      ? historyItem.profiles[0] 
      : historyItem.profiles;
    
    if (!profile1 || !profile1.name) {
      return "궁합";
    }

    const profile1Name = profile1.name;
    const profile1BirthDate = new Date(profile1.birth_date);

    // user_info의 user1과 user2 중 어느 것이 profile1인지 확인
    const user1BirthDate = new Date(userInfo.user1.birthDate);
    const user2BirthDate = new Date(userInfo.user2.birthDate);

    // 날짜와 시간을 비교하는 함수 (시간대 차이 허용)
    const compareDateTime = (date1, date2) => {
      // 먼저 날짜가 같은지 확인 (YYYY-MM-DD)
      const date1Str = date1.toISOString().substring(0, 10);
      const date2Str = date2.toISOString().substring(0, 10);
      
      if (date1Str !== date2Str) {
        return false; // 날짜가 다르면 매칭 실패
      }
      
      // 날짜가 같으면 시간 비교 (HH:mm)
      const time1Str = date1.toISOString().substring(11, 16);
      const time2Str = date2.toISOString().substring(11, 16);
      
      // 시간이 정확히 일치하면 매칭
      if (time1Str === time2Str) {
        return true;
      }
      
      // 시간이 다르면 9시간(540분) 차이를 허용 (한국 시간대 UTC+9)
      const [h1, m1] = time1Str.split(':').map(Number);
      const [h2, m2] = time2Str.split(':').map(Number);
      
      const minutes1 = h1 * 60 + m1;
      const minutes2 = h2 * 60 + m2;
      const diff = Math.abs(minutes1 - minutes2);
      
      // 정확히 일치하거나 9시간(540분) 차이
      return diff === 0 || diff === 540;
    };

    // profile1의 생년월일과 비교하여 user1인지 user2인지 확인
    const isUser1Profile1 = compareDateTime(profile1BirthDate, user1BirthDate);
    const isUser2Profile1 = compareDateTime(profile1BirthDate, user2BirthDate);

    // 두 번째 프로필: user1이 profile1이면 user2를, user2가 profile1이면 user1을 사용
    const secondUserBirthDate = isUser1Profile1 ? user2BirthDate : user1BirthDate;
    let profile2Name = "?";

    if (profiles && profiles.length > 0) {
      // 생년월일을 비교하여 프로필 찾기
      const matchedProfile = profiles.find((p) => {
        const profileDate = new Date(p.birth_date);
        return compareDateTime(profileDate, secondUserBirthDate);
      });

      if (matchedProfile) {
        profile2Name = matchedProfile.name;
      }
    }

    return `${profile1Name} & ${profile2Name}`;
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer: 모바일 80%, 최대 600px */}
      <div
        className={`fixed top-0 left-0 h-full w-[80%] max-w-[600px] bg-[#0F0F2B] border-r border-slate-700 z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4">
            <h2 className="text-lg font-semibold text-white">대화 목록</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab("questions")}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === "questions"
                  ? "text-primary border-b-2 border-primary"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              질문 내역
            </button>
            <button
              onClick={() => setActiveTab("fortunes")}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === "fortunes"
                  ? "text-primary border-b-2 border-primary"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              운세 내역
            </button>
          </div>

          {/* Content */}
          {activeTab === "questions" ? (
            <>
              {/* New Question Button */}
              <div className="p-4 border-b border-slate-700">
                <Link
                  to="/consultation"
                  onClick={onClose}
                  className="block w-full py-3 px-4 bg-primary hover:bg-primary/90 text-black font-medium rounded-lg transition-colors text-center"
                >
                  + 새로운 질문
                </Link>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    <p>아직 상담 내역이 없습니다.</p>
                    <p className="text-sm mt-2">첫 질문을 해보세요!</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {conversations.map((conv) => (
                      <Link
                        key={conv.result_id}
                        to={`/consultation/${conv.result_id}`}
                        onClick={onClose}
                        className="block p-3 mb-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
                      >
                        <div className="min-w-0">
                          {/* 첫 번째 질문 (메인 질문) */}
                          <p className="text-sm text-white font-medium line-clamp-2">
                            {truncateText(conv.questions[0]?.user_question)}
                          </p>
                          
                          {/* 후속 질문들 */}
                          {conv.questions.length > 1 && (
                            <div className="mt-2 pl-3 border-l-2 border-slate-600/50 space-y-1">
                              {conv.questions.slice(1).map((q, idx) => (
                                <p 
                                  key={q.id}
                                  className="text-xs text-slate-400 line-clamp-1"
                                >
                                  ↳ {truncateText(q.user_question, 40)}
                                </p>
                              ))}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-slate-400">
                              {formatDate(conv.latest_created_at)}
                            </p>
                            {conv.questions.length > 1 && (
                              <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                {conv.questions.length}개 질문
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Compatibility History List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : compatibilityHistory.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    <p>아직 궁합 내역이 없습니다.</p>
                    <p className="text-sm mt-2">첫 궁합을 확인해보세요!</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {compatibilityHistory.map((item) => (
                      <Link
                        key={item.id}
                        to={`/compatibility?id=${item.result_id}&from=history`}
                        onClick={onClose}
                        className="block p-3 mb-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium line-clamp-2">
                            {getCompatibilityTitle(item)}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDate(item.created_at)}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ConversationDrawer;
