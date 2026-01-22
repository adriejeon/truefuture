function UserInfo({ user, onLogout }) {
  return (
    <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 bg-slate-800/50 backdrop-blur-sm rounded-lg p-3 sm:p-4 shadow-xl border border-slate-700">
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        {user.user_metadata?.avatar_url && (
          <img
            src={user.user_metadata.avatar_url}
            alt="프로필"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-slate-400">안녕하세요!</p>
          <p className="font-semibold text-white text-sm sm:text-base truncate">
            {user.user_metadata?.full_name || user.user_metadata?.name || user.email}
          </p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors duration-200 whitespace-nowrap"
      >
        로그아웃
      </button>
    </div>
  )
}

export default UserInfo
