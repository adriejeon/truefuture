import { useState, useRef, useEffect } from "react";

/**
 * 프로필 선택 드롭다운 컴포넌트
 */
function ProfileSelector({
  profiles,
  selectedProfile,
  onSelectProfile,
  onCreateProfile,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleSelectProfile = (profile) => {
    onSelectProfile(profile);
    setIsOpen(false);
  };

  const handleCreateClick = () => {
    setIsOpen(false);
    onCreateProfile();
  };

  const formatBirthInfo = (profile) => {
    if (!profile) return "";
    const birthDate = new Date(profile.birth_date);
    return `${birthDate.getFullYear()}.${String(birthDate.getMonth() + 1).padStart(2, "0")}.${String(birthDate.getDate()).padStart(2, "0")} ${profile.birth_time}`;
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* 선택된 프로필 표시 버튼 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-[#0F0F2B] border border-slate-600 rounded-lg text-white flex items-center justify-between hover:border-blue-500 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold ${
              selectedProfile
                ? "bg-gradient-to-br from-purple-500 to-pink-500"
                : ""
            }`}
            style={
              !selectedProfile ? { backgroundColor: "#253D87" } : undefined
            }
          >
            {selectedProfile?.name?.[0] || "?"}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="font-medium truncate">
              {selectedProfile?.name || "프로필을 선택하세요"}
            </p>
            {selectedProfile && (
              <p className="text-xs text-slate-400 truncate">
                {formatBirthInfo(selectedProfile)} · {selectedProfile.city_name}
              </p>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`}
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

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0F0F2B] border border-slate-600 rounded-lg shadow-xl z-[10001] max-h-80 overflow-y-auto">
          {/* 프로필 목록 */}
          {profiles.length > 0 && (
            <div className="py-1">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleSelectProfile(profile)}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800/50 transition-colors ${
                    selectedProfile?.id === profile.id
                      ? "bg-blue-900/30 border-l-4 border-blue-500"
                      : ""
                  }`}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                    {profile.name[0]}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-white truncate">
                      {profile.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {formatBirthInfo(profile)} · {profile.city_name}
                    </p>
                  </div>
                  {selectedProfile?.id === profile.id && (
                    <svg
                      className="w-5 h-5 text-blue-400 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 구분선 */}
          {profiles.length > 0 && (
            <div className="border-t border-slate-700"></div>
          )}

          {/* 새 프로필 등록 버튼 */}
          <button
            type="button"
            onClick={handleCreateClick}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800/50 transition-colors text-white font-medium"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <span>새로운 프로필 등록하기</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfileSelector;
