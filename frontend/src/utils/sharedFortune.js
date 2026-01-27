/**
 * 공유 운세 관련 유틸리티 함수
 */

/**
 * 공유된 운세를 조회합니다
 * @param {string} shareId - 공유 ID
 * @returns {Promise<Object>} - 운세 데이터
 */
export async function loadSharedFortune(shareId) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  
  const response = await fetch(`${supabaseUrl}/functions/v1/get-fortune?id=${shareId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    },
  })

  if (!response.ok) {
    throw new Error('운세를 불러올 수 없습니다.')
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error)
  }

  return data
}

/**
 * 생년월일시를 한국어로 포맷팅합니다
 * @param {string} birthDate - ISO 형식 생년월일시 (YYYY-MM-DDTHH:mm:ss)
 * @returns {string} - 포맷된 문자열 (예: "1990년 1월 1일 12:00")
 */
export function formatBirthDate(birthDate) {
  if (!birthDate) return ''
  
  const date = new Date(birthDate)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  
  return `${year}년 ${month}월 ${day}일 ${hour}:${minute}`
}

/**
 * 위도/경도를 간단한 형식으로 포맷팅합니다
 * @param {number} lat - 위도
 * @param {number} lng - 경도
 * @returns {string} - 포맷된 문자열 (예: "북위 37.5°, 동경 127.0°")
 */
export function formatLocation(lat, lng) {
  if (lat === undefined || lng === undefined) return ''
  
  const latDir = lat >= 0 ? '북위' : '남위'
  const lngDir = lng >= 0 ? '동경' : '서경'
  
  return `${latDir} ${Math.abs(lat).toFixed(2)}°, ${lngDir} ${Math.abs(lng).toFixed(2)}°`
}
