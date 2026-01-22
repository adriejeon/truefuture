import { useState } from 'react'
import CityAutocompleteComponent from './CityAutocomplete'

function FortuneForm({ onSubmit, loading, reportType = 'daily' }) {
  const [birthDate, setBirthDate] = useState('')
  const [birthTime, setBirthTime] = useState('')
  const [cityData, setCityData] = useState({
    name: '',
    lat: null,
    lng: null,
    timezone: ''
  })

  const handleCitySelect = (selectedCity) => {
    setCityData({
      name: selectedCity.name,
      lat: selectedCity.lat,
      lng: selectedCity.lng,
      timezone: selectedCity.timezone
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!cityData.lat || !cityData.lng) {
      return
    }

    const birthDateTime = birthTime 
      ? `${birthDate}T${birthTime}:00`
      : `${birthDate}T00:00:00`

    onSubmit({
      birthDate: birthDateTime,
      lat: cityData.lat,
      lng: cityData.lng,
      reportType: reportType
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 mb-6 sm:mb-8" style={{ overflow: 'visible', position: 'relative', zIndex: 1 }}>
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700" style={{ overflow: 'visible', position: 'relative', zIndex: 50 }}>
        <div className="space-y-3 sm:space-y-4" style={{ overflow: 'visible', position: 'relative', zIndex: 1 }}>
          <div>
            <label htmlFor="birthDate" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 sm:mb-2">
              생년월일
            </label>
            <input
              type="date"
              id="birthDate"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
            />
          </div>

          <div>
            <label htmlFor="birthTime" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 sm:mb-2">
              태어난 시간
            </label>
            <input
              type="time"
              id="birthTime"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
              required
              className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
            />
          </div>

          <div style={{ position: 'relative', zIndex: 10002 }}>
            <label htmlFor="cityInput" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 sm:mb-2">
              태어난 도시
            </label>
            <CityAutocompleteComponent 
              onCitySelect={handleCitySelect}
            />
            {cityData.name && (
              <p className="mt-2 text-xs text-slate-400 break-words">
                선택된 도시: {cityData.name} 
                {cityData.timezone && ` (${cityData.timezone})`}
              </p>
            )}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 sm:py-3.5 px-4 sm:px-6 text-sm sm:text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative touch-manipulation flex items-center justify-center gap-2 sm:gap-3"
        style={{ zIndex: 1, position: 'relative' }}
      >
        {loading ? (
          <>
            {/* 로딩 스피너 */}
            <svg
              className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>미래를 계산하는 중...</span>
          </>
        ) : (
          <span>진짜미래 확인하기</span>
        )}
      </button>
    </form>
  )
}

export default FortuneForm
