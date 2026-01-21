import { useState } from 'react'
import CityAutocompleteComponent from './components/CityAutocomplete'

function App() {
  const [birthDate, setBirthDate] = useState('')
  const [birthTime, setBirthTime] = useState('')
  const [cityData, setCityData] = useState({
    name: '',
    lat: null,
    lng: null,
    timezone: ''
  })
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 도시 선택 시 호출되는 콜백
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
    setLoading(true)
    setError('')
    setInterpretation('')

    try {
      // 도시 정보 확인
      if (!cityData.lat || !cityData.lng) {
        throw new Error('도시를 선택해주세요.')
      }
      
      // 생년월일과 시간을 합쳐서 ISO 형식으로 변환
      const birthDateTime = birthTime 
        ? `${birthDate}T${birthTime}:00`
        : `${birthDate}T00:00:00`

      const response = await fetch('http://localhost:8787/api/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          birthDate: birthDateTime,
          lat: cityData.lat,
          lng: cityData.lng,
          reportType: 'daily'
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || '서버 오류가 발생했습니다.')
      }

      const data = await response.json()
      
      // 축약된 JSON 키를 읽기 쉬운 형식으로 변환
      // 백엔드 응답 형식: {s: "요약", a: ["행동1", "행동2", "행동3"], k: ["키워드1", "키워드2"]}
      if (data.interpretation) {
        const interp = data.interpretation;
        let formatted = '';
        
        if (interp.s) {
          formatted += `📝 ${interp.s}\n\n`;
        }
        
        if (interp.a && Array.isArray(interp.a) && interp.a.length > 0) {
          formatted += '💡 행동 지침:\n';
          interp.a.forEach((item, idx) => {
            formatted += `${idx + 1}. ${item}\n`;
          });
          formatted += '\n';
        }
        
        if (interp.k && Array.isArray(interp.k) && interp.k.length > 0) {
          formatted += `🏷️ 키워드: ${interp.k.join(', ')}`;
        }
        
        setInterpretation(formatted || JSON.stringify(interp, null, 2))
      } else {
        setInterpretation('결과를 불러올 수 없습니다.')
      }
    } catch (err) {
      setError(err.message || '요청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4" style={{ position: 'relative', zIndex: 1 }}>
      <div className="w-full max-w-2xl" style={{ position: 'relative', zIndex: 1 }}>
        <h1 className="text-4xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          내 진짜 미래 확인하기
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6 mb-8" style={{ overflow: 'visible', position: 'relative', zIndex: 1 }}>
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 shadow-xl border border-slate-700" style={{ overflow: 'visible', position: 'relative', zIndex: 50 }}>
            <div className="space-y-4" style={{ overflow: 'visible', position: 'relative', zIndex: 1 }}>
              <div>
                <label htmlFor="birthDate" className="block text-sm font-medium text-slate-300 mb-2">
                  생년월일
                </label>
                <input
                  type="date"
                  id="birthDate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="birthTime" className="block text-sm font-medium text-slate-300 mb-2">
                  태어난 시간
                </label>
                <input
                  type="time"
                  id="birthTime"
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div style={{ position: 'relative', zIndex: 10002 }}>
                <label htmlFor="cityInput" className="block text-sm font-medium text-slate-300 mb-2">
                  태어난 도시
                </label>
                <CityAutocompleteComponent 
                  onCitySelect={handleCitySelect}
                />
                {cityData.name && (
                  <p className="mt-2 text-xs text-slate-400">
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
            className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative"
            style={{ zIndex: 1, position: 'relative' }}
          >
            {loading ? '미래를 계산하는 중...' : '내 진짜 미래 확인하기'}
          </button>
        </form>

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {interpretation && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 shadow-xl border border-slate-700" style={{ overflow: 'visible', position: 'relative', zIndex: 50 }}>
            <h2 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              당신의 미래
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                {interpretation}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
