import { useState, useEffect } from "react";
import { IMaskInput } from "react-imask";
import CityAutocompleteComponent from "./CityAutocomplete";

/**
 * 프로필 생성/편집 모달
 */
function ProfileModal({ isOpen, onClose, onSubmit, initialData = null }) {
  const [formData, setFormData] = useState({
    name: "",
    birthDate: "",
    birthTime: "",
    gender: "남자",
    cityName: "",
    lat: null,
    lng: null,
    timezone: "",
  });

  const [errors, setErrors] = useState({});

  // 초기 데이터 설정
  useEffect(() => {
    if (initialData) {
      // 편집 모드
      const birthDate = new Date(initialData.birth_date);
      setFormData({
        name: initialData.name,
        birthDate: `${birthDate.getFullYear()}.${String(birthDate.getMonth() + 1).padStart(2, "0")}.${String(birthDate.getDate()).padStart(2, "0")}`,
        birthTime: initialData.birth_time,
        gender: initialData.gender,
        cityName: initialData.city_name,
        lat: initialData.lat,
        lng: initialData.lng,
        timezone: initialData.timezone,
      });
    } else {
      // 생성 모드
      setFormData({
        name: "",
        birthDate: "",
        birthTime: "",
        gender: "남자",
        cityName: "",
        lat: null,
        lng: null,
        timezone: "",
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "이름을 입력해주세요";
    }

    if (!formData.birthDate || formData.birthDate.length < 10) {
      newErrors.birthDate = "올바른 생년월일을 입력해주세요";
    }

    if (!formData.birthTime || formData.birthTime.length < 5) {
      newErrors.birthTime = "올바른 시간을 입력해주세요";
    }

    if (!formData.cityName) {
      newErrors.city = "태어난 도시를 선택해주세요";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      console.error("프로필 저장 실패:", err);
      alert("프로필 저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleCitySelect = (selectedCity) => {
    setFormData({
      ...formData,
      cityName: selectedCity.name,
      lat: selectedCity.lat,
      lng: selectedCity.lng,
      timezone: selectedCity.timezone,
    });
    setErrors({ ...errors, city: "" });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10001] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0F0F2B] rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-[#0F0F2B] border-b border-slate-700 z-10">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              {initialData ? "프로필 수정" : "새로운 프로필 등록"}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg
                className="w-6 h-6"
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
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* 이름 */}
          <div>
            <label className="block text-base font-medium text-slate-300 mb-2">
              이름
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="원하는 이름을 입력해 주세요."
              className="w-full px-4 py-2.5 text-base border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ backgroundColor: "#0F0F2B" }}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-400">{errors.name}</p>
            )}
          </div>

          {/* 생년월일 */}
          <div>
            <label className="block text-base font-medium text-slate-300 mb-2">
              생년월일
            </label>
            <IMaskInput
              mask="0000.00.00"
              value={formData.birthDate}
              onAccept={(value) =>
                setFormData({ ...formData, birthDate: value })
              }
              placeholder="YYYY.MM.DD"
              inputMode="numeric"
              className="w-full px-4 py-2.5 text-base border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ backgroundColor: "#0F0F2B" }}
            />
            {errors.birthDate && (
              <p className="mt-1 text-sm text-red-400">{errors.birthDate}</p>
            )}
          </div>

          {/* 태어난 시간 */}
          <div>
            <label className="block text-base font-medium text-slate-300 mb-2">
              태어난 시간
            </label>
            <IMaskInput
              mask="00:00"
              value={formData.birthTime}
              onAccept={(value) =>
                setFormData({ ...formData, birthTime: value })
              }
              placeholder="HH:mm (24시간제)"
              inputMode="numeric"
              className="w-full px-4 py-2.5 text-base border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ backgroundColor: "#0F0F2B" }}
            />
            {errors.birthTime && (
              <p className="mt-1 text-sm text-red-400">{errors.birthTime}</p>
            )}
          </div>

          {/* 성별 */}
          <div>
            <label className="block text-base font-medium text-slate-300 mb-2">
              성별
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value="남자"
                  checked={formData.gender === "남자"}
                  onChange={(e) =>
                    setFormData({ ...formData, gender: e.target.value })
                  }
                  className="w-4 h-4 text-blue-500 border-slate-600 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-base text-slate-300">남자</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value="여자"
                  checked={formData.gender === "여자"}
                  onChange={(e) =>
                    setFormData({ ...formData, gender: e.target.value })
                  }
                  className="w-4 h-4 text-blue-500 border-slate-600 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-base text-slate-300">여자</span>
              </label>
            </div>
          </div>

          {/* 태어난 도시 */}
          <div style={{ position: "relative", zIndex: 10002 }}>
            <label className="block text-base font-medium text-slate-300 mb-2">
              태어난 도시
            </label>
            <CityAutocompleteComponent
              onCitySelect={handleCitySelect}
              initialValue={formData.cityName}
            />
            {formData.cityName && (
              <p className="mt-2 text-xs text-slate-400">
                선택된 도시: {formData.cityName}
                {formData.timezone && ` (${formData.timezone})`}
              </p>
            )}
            {errors.city && (
              <p className="mt-1 text-sm text-red-400">{errors.city}</p>
            )}
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 py-3 px-4 text-black font-medium rounded-lg transition-all"
              style={{
                backgroundColor: "#E1AC3F",
              }}
            >
              {initialData ? "수정" : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfileModal;
