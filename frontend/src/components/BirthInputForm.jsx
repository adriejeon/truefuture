import { useCallback } from "react";
import { IMaskInput } from "react-imask";
import CityAutocompleteComponent from "./CityAutocomplete";
import { useBirthData } from "../hooks/useBirthData";

/**
 * 재사용 가능한 생년월일 입력 폼 컴포넌트
 * @param {Object} props
 * @param {string} props.title - 폼 제목 (예: "나의 정보", "상대방 정보")
 * @param {string} props.storageKey - localStorage 저장 키 (예: "birth_info_me", "birth_info_partner")
 * @param {Function} props.onDataChange - 데이터 변경 시 호출될 콜백 함수 (선택)
 */
function BirthInputForm({ title, storageKey, onDataChange }) {
  const { birthData, updateBirthData } = useBirthData(storageKey);

  const handleBirthDateChange = useCallback(
    (value) => {
      updateBirthData({ birthDate: value });
      onDataChange?.({ ...birthData, birthDate: value });
    },
    [birthData, updateBirthData, onDataChange],
  );

  const handleBirthTimeChange = useCallback(
    (value) => {
      updateBirthData({ birthTime: value });
      onDataChange?.({ ...birthData, birthTime: value });
    },
    [birthData, updateBirthData, onDataChange],
  );

  const handleGenderChange = useCallback(
    (e) => {
      const value = e.target.value;
      updateBirthData({ gender: value });
      onDataChange?.({ ...birthData, gender: value });
    },
    [birthData, updateBirthData, onDataChange],
  );

  const handleCitySelect = useCallback(
    (selectedCity) => {
      const newCityData = {
        name: selectedCity.name,
        lat: selectedCity.lat,
        lng: selectedCity.lng,
        timezone: selectedCity.timezone,
      };
      updateBirthData({ cityData: newCityData });
      onDataChange?.({ ...birthData, cityData: newCityData });
    },
    [birthData, updateBirthData, onDataChange],
  );

  return (
    <div
      className="backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700"
      style={{
        overflow: "visible",
        position: "relative",
        zIndex: 50,
        backgroundColor: "rgba(15, 15, 43, 0.3)",
      }}
    >
      {/* 제목 */}
      {title && (
        <h3
          className="font-semibold text-white mb-4"
          style={{ fontSize: "20px" }}
        >
          {title}
        </h3>
      )}

      <div
        className="space-y-3 sm:space-y-4"
        style={{ overflow: "visible", position: "relative", zIndex: 1 }}
      >
        {/* 생년월일 */}
        <div>
          <label
            htmlFor={`birthDate-${storageKey}`}
            className="block text-base font-medium text-slate-300 mb-1.5 sm:mb-2"
          >
            생년월일
          </label>
          <IMaskInput
            mask="0000.00.00"
            value={birthData.birthDate}
            onAccept={handleBirthDateChange}
            placeholder="YYYY.MM.DD"
            inputMode="numeric"
            id={`birthDate-${storageKey}`}
            className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
            style={{ backgroundColor: "#0F0F2B" }}
          />
        </div>

        {/* 태어난 시간 */}
        <div>
          <label
            htmlFor={`birthTime-${storageKey}`}
            className="block text-base font-medium text-slate-300 mb-1.5 sm:mb-2"
          >
            태어난 시간
          </label>
          <IMaskInput
            mask="00:00"
            value={birthData.birthTime}
            onAccept={handleBirthTimeChange}
            placeholder="HH:mm (24시간제)"
            inputMode="numeric"
            id={`birthTime-${storageKey}`}
            className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
            style={{ backgroundColor: "#0F0F2B" }}
          />
        </div>

        {/* 성별 */}
        <div>
          <label className="block text-base font-medium text-slate-300 mb-1.5 sm:mb-2">
            성별
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`gender-${storageKey}`}
                value="남자"
                checked={birthData.gender === "남자"}
                onChange={handleGenderChange}
                className="w-4 h-4 text-blue-500 border-slate-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-slate-800"
                style={{ backgroundColor: "#0F0F2B" }}
              />
              <span className="text-base text-slate-300">남자</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`gender-${storageKey}`}
                value="여자"
                checked={birthData.gender === "여자"}
                onChange={handleGenderChange}
                className="w-4 h-4 text-blue-500 border-slate-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-slate-800"
                style={{ backgroundColor: "#0F0F2B" }}
              />
              <span className="text-base text-slate-300">여자</span>
            </label>
          </div>
        </div>

        {/* 태어난 도시 */}
        <div style={{ position: "relative", zIndex: 10002 }}>
          <label
            htmlFor={`cityInput-${storageKey}`}
            className="block text-base font-medium text-slate-300 mb-1.5 sm:mb-2"
          >
            태어난 도시
          </label>
          <CityAutocompleteComponent
            onCitySelect={handleCitySelect}
            initialValue={birthData.cityData.name}
          />
          {birthData.cityData.name && (
            <p className="mt-2 text-xs text-slate-400 break-words">
              선택된 도시: {birthData.cityData.name}
              {birthData.cityData.timezone &&
                ` (${birthData.cityData.timezone})`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default BirthInputForm;
