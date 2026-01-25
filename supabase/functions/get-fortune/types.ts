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

// 위치 정보 타입
export interface Location {
  lat: number
  lng: number
}

// 행성 위치 정보 타입
export interface PlanetPosition {
  sign: string
  degree: number
  degreeInSign: number
  house: number
}

// 차트 데이터 타입
export interface ChartData {
  date: string
  location: Location
  houses: {
    system: string
    angles: {
      ascendant: number
      midheaven: number
    }
  }
  planets: {
    sun: PlanetPosition
    moon: PlanetPosition
    mercury: PlanetPosition
    venus: PlanetPosition
    mars: PlanetPosition
    jupiter: PlanetPosition
    saturn: PlanetPosition
  }
  fortuna: PlanetPosition
}

// Aspect 정보 타입
export interface Aspect {
  type: string // 'Conjunction', 'Opposition', 'Square', 'Trine'
  orb: number
  transitPlanet: string
  natalPlanet: string
  description: string
}

// Profection 정보 타입
export interface ProfectionData {
  age: number              // 만 나이
  profectionHouse: number  // 활성화된 하우스 (1-12)
  profectionSign: string   // 프로펙션 별자리
  lordOfTheYear: string    // 올해의 지배 행성
}

// Solar Return Overlay 정보 타입
export interface SolarReturnOverlay {
  solarReturnAscendantInNatalHouse: number  // SR Asc가 Natal 차트의 몇 번째 하우스에 있는지
  planetsInNatalHouses: {                   // SR 행성들이 Natal 차트의 어느 하우스에 있는지
    sun: number
    moon: number
    mercury: number
    venus: number
    mars: number
    jupiter: number
    saturn: number
  }
}
