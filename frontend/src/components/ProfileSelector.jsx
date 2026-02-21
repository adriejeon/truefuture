import { useState, useRef, useEffect } from "react";
import { colors } from "../constants/colors";

/**
 * 프로필 선택 드롭다운 컴포넌트
 */
function ProfileSelector({
  profiles,
  selectedProfile,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  loading = false,
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

  const handleDeleteClick = async (e, profile) => {
    e.stopPropagation();
    if (!onDeleteProfile) return;
    if (
      !window.confirm(
        `"${profile.name}" 프로필을 삭제할까요? 삭제된 프로필의 운세 이력도 함께 삭제됩니다.`
      )
    ) {
      return;
    }
    try {
      await onDeleteProfile(profile.id);
      setIsOpen(false);
    } catch (err) {
      console.error("프로필 삭제 실패:", err);
      alert("프로필 삭제에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const formatBirthInfo = (profile) => {
    if (!profile) return "";
    // ISO 문자열의 날짜 부분(YYYY-MM-DD)만 사용해 타임존 변환으로 인한 하루 밀림 방지
    const iso = profile.birth_date && String(profile.birth_date);
    const datePart =
      iso && iso.length >= 10 ? iso.substring(0, 10).replace(/-/g, ".") : "";
    const timePart = profile.birth_time || "";
    return [datePart, timePart].filter(Boolean).join(" ");
  };

  // 프로필별 색상 팔레트 (그라데이션 조합)
  const colorPalettes = [
    { from: "from-purple-500", to: "to-pink-500" },
    { from: "from-blue-500", to: "to-cyan-500" },
    { from: "from-green-500", to: "to-emerald-500" },
    { from: "from-yellow-500", to: "to-orange-500" },
    { from: "from-red-500", to: "to-rose-500" },
    { from: "from-indigo-500", to: "to-purple-500" },
    { from: "from-pink-500", to: "to-rose-500" },
    { from: "from-teal-500", to: "to-cyan-500" },
    { from: "from-amber-500", to: "to-yellow-500" },
    { from: "from-violet-500", to: "to-purple-500" },
    { from: "from-sky-500", to: "to-blue-500" },
    { from: "from-emerald-500", to: "to-teal-500" },
  ];

  // 프로필 ID를 기반으로 색상 인덱스 생성
  const getProfileColor = (profileId) => {
    if (!profileId) return colorPalettes[0];
    // 프로필 ID를 숫자로 변환하여 색상 인덱스 결정
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
      hash = profileId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colorPalettes.length;
    return colorPalettes[index];
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* 선택된 프로필 표시 버튼 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="w-full px-4 py-3 bg-[#0F0F2B] border border-slate-600 rounded-lg text-white flex items-center justify-between transition-colors disabled:opacity-60 disabled:cursor-wait"
        style={{
          borderColor: isOpen ? colors.primary : undefined,
        }}
        onMouseEnter={(e) => {
          if (!loading) e.currentTarget.style.borderColor = colors.primary;
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = undefined;
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {loading ? (
            <>
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#253D87] flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium truncate text-slate-400">
                  프로필 불러오는 중...
                </p>
              </div>
            </>
          ) : (
            <>
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold ${
                  selectedProfile
                    ? `bg-gradient-to-br ${
                        getProfileColor(selectedProfile.id).from
                      } ${getProfileColor(selectedProfile.id).to}`
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
                    {formatBirthInfo(selectedProfile)} ·{" "}
                    {selectedProfile.city_name}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        {!loading && (
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 ease-out flex-shrink-0 ml-2 ${
              isOpen ? "rotate-180" : ""
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
        )}
      </button>

      {/* 드롭다운 메뉴 */}
      <div
        className={`absolute top-full left-0 right-0 mt-2 bg-[#0F0F2B] border border-slate-600 rounded-lg shadow-xl z-[10001] max-h-80 overflow-y-auto transition-all duration-200 ease-out ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-2 pointer-events-none invisible"
        }`}
      >
        {/* 프로필 목록 */}
        {profiles.length > 0 && (
          <div className="py-1">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800/50 transition-colors group ${
                  selectedProfile?.id === profile.id ? "" : ""
                }`}
                style={
                  selectedProfile?.id === profile.id
                    ? { backgroundColor: `${colors.primary}20` }
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => handleSelectProfile(profile)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${
                      getProfileColor(profile.id).from
                    } ${
                      getProfileColor(profile.id).to
                    } flex items-center justify-center text-white font-semibold`}
                  >
                    {profile.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">
                      {profile.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {formatBirthInfo(profile)} · {profile.city_name}
                    </p>
                  </div>
                  {selectedProfile?.id === profile.id && (
                    <svg
                      className="w-5 h-5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      style={{ color: colors.primary }}
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
                {onDeleteProfile && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteClick(e, profile)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="프로필 삭제"
                    aria-label={`${profile.name} 프로필 삭제`}
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
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
    </div>
  );
}

export default ProfileSelector;
