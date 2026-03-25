import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import {
  fetchConsultationHistory,
  fetchCompatibilityHistory,
} from "../services/fortuneService";

function ConversationDrawer({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profiles } = useProfiles();
  const [activeTab, setActiveTab] = useState("questions");
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

    if (diffMins < 1) return t("conversation_drawer.just_now");
    if (diffMins < 60) return t("conversation_drawer.minutes_ago", { count: diffMins });
    if (diffHours < 24) return t("conversation_drawer.hours_ago", { count: diffHours });
    if (diffDays < 7) return t("conversation_drawer.days_ago", { count: diffDays });

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const truncateText = (text, maxLength = 50) => {
    if (!text) return t("conversation_drawer.no_question");
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const getCompatibilityTitle = (historyItem) => {
    const fortuneResults = historyItem.fortune_results;
    const userInfo = fortuneResults?.user_info;

    if (!userInfo || !userInfo.user1 || !userInfo.user2) {
      const profile = Array.isArray(historyItem.profiles)
        ? historyItem.profiles[0]
        : historyItem.profiles;

      if (profile && profile.name) {
        return profile.name + " & ?";
      }
      return t("conversation_drawer.compatibility_default");
    }

    const profile1 = Array.isArray(historyItem.profiles)
      ? historyItem.profiles[0]
      : historyItem.profiles;

    if (!profile1 || !profile1.name) {
      return t("conversation_drawer.compatibility_default");
    }

    const profile1Name = profile1.name;
    const profile1BirthDate = new Date(profile1.birth_date);

    const user1BirthDate = new Date(userInfo.user1.birthDate);
    const user2BirthDate = new Date(userInfo.user2.birthDate);

    const compareDateTime = (date1, date2) => {
      const date1Str = date1.toISOString().substring(0, 10);
      const date2Str = date2.toISOString().substring(0, 10);

      if (date1Str !== date2Str) {
        return false;
      }

      const time1Str = date1.toISOString().substring(11, 16);
      const time2Str = date2.toISOString().substring(11, 16);

      if (time1Str === time2Str) {
        return true;
      }

      const [h1, m1] = time1Str.split(':').map(Number);
      const [h2, m2] = time2Str.split(':').map(Number);

      const minutes1 = h1 * 60 + m1;
      const minutes2 = h2 * 60 + m2;
      const diff = Math.abs(minutes1 - minutes2);

      return diff === 0 || diff === 540;
    };

    const isUser1Profile1 = compareDateTime(profile1BirthDate, user1BirthDate);
    const secondUserBirthDate = isUser1Profile1 ? user2BirthDate : user1BirthDate;
    let profile2Name = "?";

    if (profiles && profiles.length > 0) {
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
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 left-0 h-full w-[80%] max-w-[600px] bg-[#0F0F2B] border-r border-slate-700 z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4">
            <h2 className="text-lg font-semibold text-white">{t("conversation_drawer.title")}</h2>
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
              {t("conversation_drawer.tab_questions")}
            </button>
            <button
              onClick={() => setActiveTab("fortunes")}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === "fortunes"
                  ? "text-primary border-b-2 border-primary"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              {t("conversation_drawer.tab_fortunes")}
            </button>
          </div>

          {/* Content */}
          {activeTab === "questions" ? (
            <>
              <div className="p-4 border-b border-slate-700">
                <Link
                  to="/consultation"
                  onClick={onClose}
                  className="block w-full py-3 px-4 bg-primary hover:bg-primary/90 text-black font-medium rounded-lg transition-colors text-center"
                >
                  {t("conversation_drawer.new_question")}
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    <p>{t("conversation_drawer.empty_consultations")}</p>
                    <p className="text-sm mt-2">{t("conversation_drawer.empty_consultations_cta")}</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {conversations.map((conv) => (
                      <Link
                        key={conv.result_id}
                        to={`/consultation/${conv.result_id}`}
                        state={{ fromHistory: true }}
                        onClick={onClose}
                        className="block p-3 mb-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium line-clamp-2">
                            {truncateText(conv.questions[0]?.user_question)}
                          </p>

                          {conv.questions.length > 1 && (
                            <div className="mt-2 pl-3 border-l-2 border-slate-600/50 space-y-1">
                              {conv.questions.slice(1).map((q) => (
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
                                {t("conversation_drawer.question_count", { count: conv.questions.length })}
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
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : compatibilityHistory.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    <p>{t("conversation_drawer.empty_compatibility")}</p>
                    <p className="text-sm mt-2">{t("conversation_drawer.empty_compatibility_cta")}</p>
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
