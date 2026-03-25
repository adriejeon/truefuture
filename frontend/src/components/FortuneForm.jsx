import { useState, useCallback } from "react";
import CityAutocompleteComponent from "./CityAutocomplete";
import PrimaryButton from "./PrimaryButton";
import DatePicker from "react-datepicker";
import { ko as localeKo } from "date-fns/locale/ko";
import { enUS } from "date-fns/locale/en-US";
import "react-datepicker/dist/react-datepicker.css";

function formatYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function FortuneForm({ onSubmit, loading, reportType = "daily" }) {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeError, setTimeError] = useState("");
  const [cityData, setCityData] = useState({
    name: "",
    lat: null,
    lng: null,
    timezone: "",
  });

  // useCallback으로 핸들러 함수 메모이제이션 (컴포넌트 재렌더링 시 함수 재생성 방지)
  const handleCitySelect = useCallback((selectedCity) => {
    setCityData({
      name: selectedCity.name,
      lat: selectedCity.lat,
      lng: selectedCity.lng,
      timezone: selectedCity.timezone,
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!cityData.lat || !cityData.lng) {
      return;
    }

    // 시간 미입력 시 00:00으로 서버에 보내지 않음 (RAMC 등 새벽 시간으로 잘못 계산되는 것 방지)
    const timeToSend = birthTime.trim() || null;
    if (!timeToSend) {
      setTimeError("태어난 시간을 입력해주세요.");
      return;
    }
    setTimeError("");

    const birthDateTime = `${birthDate}T${timeToSend}:00`;

    onSubmit({
      birthDate: birthDateTime,
      lat: cityData.lat,
      lng: cityData.lng,
      reportType: reportType,
    });
  };

  const dateFnsLocale = (typeof navigator !== "undefined" && navigator.language?.startsWith("ko"))
    ? localeKo
    : enUS;

  const selectedBirthDate =
    birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
      ? new Date(`${birthDate}T00:00:00`)
      : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 sm:space-y-6 mb-6 sm:mb-8"
      style={{ overflow: "visible", position: "relative", zIndex: 1 }}
    >
      <div
        className="backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700"
        style={{
          overflow: "visible",
          position: "relative",
          zIndex: 50,
          backgroundColor: "rgba(15, 15, 43, 0.3)",
        }}
      >
        <div
          className="space-y-3 sm:space-y-4"
          style={{ overflow: "visible", position: "relative", zIndex: 1 }}
        >
          {/* 생년월일과 태어난 시간을 반응형으로 배치: 모바일은 세로, 데스크탑은 가로 */}
          <div className="flex flex-col md:flex-row md:gap-4 space-y-3 md:space-y-0">
            <div className="flex-1 w-full min-w-0">
              <label
                htmlFor="birthDate"
                className="block text-base font-medium text-slate-300 mb-1.5 sm:mb-2"
              >
                생년월일
              </label>
              <DatePicker
                id="birthDate"
                selected={selectedBirthDate}
                onChange={(date) => {
                  if (!date || Number.isNaN(date.getTime())) {
                    setBirthDate("");
                    return;
                  }
                  setBirthDate(formatYYYYMMDD(date));
                }}
                dateFormat="P"
                locale={dateFnsLocale}
                placeholderText="YYYY-MM-DD"
                autoComplete="off"
                wrapperClassName="w-full block"
                popperClassName="tf-datepicker-popper z-[200]"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
                calendarClassName="tf-datepicker-calendar"
                showPopperArrow={false}
              />
            </div>

            <div className="flex-1 w-full min-w-0">
              <label
                htmlFor="birthTime"
                className="block text-base font-medium text-slate-300 mb-1.5 sm:mb-2"
              >
                태어난 시간
              </label>
              <input
                type="time"
                id="birthTime"
                value={birthTime}
                onChange={(e) => {
                  setBirthTime(e.target.value);
                  if (timeError) setTimeError("");
                }}
                required
                className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
                style={{ backgroundColor: "#0F0F2B" }}
              />
              {timeError && (
                <p className="mt-1.5 text-sm text-red-400">{timeError}</p>
              )}
            </div>
          </div>

          <div style={{ position: "relative", zIndex: 10002 }}>
            <label
              htmlFor="cityInput"
              className="block text-base font-medium text-slate-300 mb-1.5 sm:mb-2"
            >
              태어난 도시
            </label>
            <CityAutocompleteComponent onCitySelect={handleCitySelect} />
            {cityData.name && (
              <p className="mt-2 text-xs text-slate-400 break-words">
                선택된 도시: {cityData.name}
                {cityData.timezone && ` (${cityData.timezone})`}
              </p>
            )}
          </div>
        </div>
      </div>

      <PrimaryButton
        type="submit"
        loading={loading}
        fullWidth
      >
        진짜미래 확인
      </PrimaryButton>
    </form>
  );
}

export default FortuneForm;
