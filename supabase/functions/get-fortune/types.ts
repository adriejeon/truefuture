// 운세 타입 정의
export enum FortuneType {
  DAILY = 'daily',           // 오늘의 운세 (Home.jsx)
  LIFETIME = 'lifetime',     // 인생 종합운/사주 (LifetimeFortune.jsx)
  COMPATIBILITY = 'compatibility', // 궁합 (Compatibility.jsx)
  YEARLY = 'yearly',         // 1년 운세 (YearlyFortune.jsx)
}

// 사용자 데이터 타입
export interface UserData {
  birthDate: string  // ISO format: YYYY-MM-DDTHH:mm:ss
  lat: number
  lng: number
}

// 궁합을 위한 2명의 사용자 데이터
export interface CompatibilityData {
  user1: UserData
  user2: UserData
}

// 운세 요청 데이터 타입
export interface FortuneRequest {
  fortuneType: FortuneType
  userData?: UserData
  compatibilityData?: CompatibilityData
}
