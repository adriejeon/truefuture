import { Link } from "react-router-dom";

function PrivacyPolicy() {
  return (
    <div className="w-full py-8 sm:py-12">
      <div className="max-w-[600px] mx-auto px-4 pb-20">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors duration-200 mb-6"
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
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          홈으로 돌아가기
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 text-primary">
          개인정보처리방침
        </h1>
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 sm:p-8 shadow-xl border border-slate-700">
          {/* 내용은 나중에 추가할 예정 */}
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;
