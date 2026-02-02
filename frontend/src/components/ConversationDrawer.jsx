import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { fetchConsultationHistory } from "../services/fortuneService";

function ConversationDrawer({ isOpen, onClose }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadHistory();
    }
  }, [isOpen, user]);

  const loadHistory = async () => {
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
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
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

          {/* New Question Button */}
          <div className="p-4 border-b border-slate-700">
            <Link
              to="/consultation"
              onClick={onClose}
              className="block w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors text-center"
            >
              + 새로운 질문
            </Link>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
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
                    key={conv.id}
                    to={`/consultation/${conv.result_id}`}
                    onClick={onClose}
                    className="block p-3 mb-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium line-clamp-2 group-hover:text-purple-300">
                        {truncateText(conv.user_question)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDate(conv.created_at)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default ConversationDrawer;
