// 운세 타입 정의
export enum FortuneType {
  DAILY = "daily", // 오늘의 운세 (Home.jsx)
  LIFETIME = "lifetime", // 인생 종합운/사주 (LifetimeFortune.jsx)
  COMPATIBILITY = "compatibility", // 궁합 (Compatibility.jsx)
  YEARLY = "yearly", // 1년 운세 (YearlyFortune.jsx)
  CONSULTATION = "consultation", // 싱글턴 자유 질문 (고급 예측 기법 활용)
}

// 사용자 데이터 타입
export interface UserData {
  birthDate: string; // ISO format: YYYY-MM-DDTHH:mm:ss
  lat: number;
  lng: number;
}

// 궁합을 위한 2명의 사용자 데이터
export interface CompatibilityData {
  user1: UserData;
  user2: UserData;
}

// 운세 요청 데이터 타입
export interface FortuneRequest {
  fortuneType: FortuneType;
  userData?: UserData;
  compatibilityData?: CompatibilityData;
}

// 위치 정보 타입
export interface Location {
  lat: number;
  lng: number;
}

// 행성 위치 정보 타입
export interface PlanetPosition {
  sign: string;
  degree: number;
  degreeInSign: number;
  house: number;
  /** 역행 여부 (태양·달은 항상 false) */
  isRetrograde: boolean;
  /** 황경 속도 (deg/일, 정지/Station 구간 판별용, 선택) */
  speed?: number;
}

// 차트 데이터 타입
export interface ChartData {
  date: string;
  location: Location;
  houses: {
    system: string;
    angles: {
      ascendant: number;
      midheaven: number;
    };
  };
  planets: {
    sun: PlanetPosition;
    moon: PlanetPosition;
    mercury: PlanetPosition;
    venus: PlanetPosition;
    mars: PlanetPosition;
    jupiter: PlanetPosition;
    saturn: PlanetPosition;
    uranus: PlanetPosition;
    neptune: PlanetPosition;
    pluto: PlanetPosition;
  };
  fortuna: PlanetPosition;
}

// Aspect 정보 타입
export interface Aspect {
  type: string; // 'Conjunction', 'Opposition', 'Square', 'Trine'
  orb: number;
  transitPlanet: string;
  natalPlanet: string;
  description: string;
}

// Profection 정보 타입
export interface ProfectionData {
  age: number; // 만 나이
  profectionHouse: number; // 활성화된 하우스 (1-12)
  profectionSign: string; // 프로펙션 별자리
  lordOfTheYear: string; // 올해의 지배 행성
}

// Solar Return Overlay 정보 타입
export interface SolarReturnOverlay {
  solarReturnAscendantInNatalHouse: number; // SR Asc가 Natal 차트의 몇 번째 하우스에 있는지
  planetsInNatalHouses: {
    // SR 행성들이 Natal 차트의 어느 하우스에 있는지
    sun: number;
    moon: number;
    mercury: number;
    venus: number;
    mars: number;
    jupiter: number;
    saturn: number;
    uranus: number;
    neptune: number;
    pluto: number;
  };
}

// Firdaria(피르다리) 결과 타입
export interface FirdariaResult {
  isDayChart: boolean;
  age: number;
  majorLord: string; // 예: "Sun", "Venus"
  subLord: string | null; // 예: "Mercury" (노드 기간이면 null)
  majorPeriodStart: Date; // 해당 메이저 기간 시작일
  majorPeriodEnd: Date; // 해당 메이저 기간 종료일
  subPeriodStart?: Date; // 서브 기간 시작일
  subPeriodEnd?: Date; // 서브 기간 종료일
}

// 메이저/서브 로드 상호작용 분석 결과 (Gemini 프롬프트용)
export interface InteractionResult {
  majorPlanet: string;
  subPlanet: string;
  reception: string | null; // 예: "Jupiter hosts Saturn (Helpful)"
  aspect: string | null; // 예: "Trine (Cooperative)"
  houseContext: string; // 예: "Major(10H) - Sub(2H)"
  summaryScore: number; // 긍정 +1, 부정 -1, 중립 0 (참고용)
}

// Secondary Progression 진행 달(Progressed Moon) 결과
export interface ProgressionResult {
  progMoonSign: string; // 예: "Taurus"
  progMoonHouse: number; // Natal 차트 기준 하우스 (1-12)
  natalAspects: string[]; // Progressed Moon vs Natal 행성. 예: "Conjunct Natal Saturn (Exact)"
  progressedAspects: string[]; // Progressed Moon vs Progressed 행성. 예: "Trine Progressed Mars (Exact)"
}

// Solar Arc Direction 히트 (이벤트 트리거)
export interface DirectionHit {
  movingPlanet: string; // 예: "Directed Saturn"
  targetPoint: string; // 예: "Natal Ascendant"
  aspect: string; // "Conjunction" | "Opposition"
  isExact: boolean; // orb < 0.1° 이면 true (임박한 이벤트)
}

// DB: fortune_results 테이블 (복구/공유용)
export interface FortuneResultRow {
  id: string;
  user_info: Record<string, unknown>;
  fortune_text: string;
  fortune_type: string;
  chart_data?: FortuneResultChartData | null;
  created_at: string;
}

// DAILY 복구용 chart_data 구조
export interface FortuneResultChartData {
  chart?: unknown;
  transitChart?: unknown;
  aspects?: unknown[] | null;
  transitMoonHouse?: number | null;
  solarReturnChart?: unknown;
  profectionData?: unknown;
  solarReturnOverlay?: unknown;
}

// DB: fortune_history 테이블 (조회 이력 + result_id로 복구)
export interface FortuneHistoryRow {
  id: string;
  user_id: string;
  profile_id: string;
  fortune_type: string;
  fortune_date: string;
  year_period_start?: string | null;
  year_period_end?: string | null;
  result_id?: string | null;
  created_at: string;
}
