/**
 * 항성(Fixed Star) 및 타임로드(Time Lord) 관련 고급 점성학 유틸리티
 * - 주요 항성 황경(Current Epoch 근사, 0~360 절대 황경)
 * - 트랜짓 행성이 항성과 회합(Conjunction)인지 판별 (접근/분리 Orb)
 * - meaning/nature: Gemini 길흉 해석용 메타데이터
 * - 네이탈 감응점/행성과 항성 회합 분석 (세차운동 보정)
 */

import { normalizeDegrees, getSignFromLongitude, getSignRuler } from "./astrologyCalculator.ts";
import type { ChartData } from "../types.ts";

// ========== 항성 상수 (황경: 절대 0~360, 천칭 0° = 180°) ==========
// 좌표: Spica 천칭+24°=204°, Sirius 게자리 14°=104° 등 Current Epoch 근사값 반영

export type PlanetKey =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Mars"
  | "Jupiter"
  | "Saturn";

export interface FixedStar {
  name: string;
  /** 절대 황경 (0~360). 예: 천칭자리 24° = 180+24 = 204 */
  longitude: number;
  /** 고전 점성학 속성 (행성 유사성). Benefic/Malefic 구분용 */
  nature: string;
  /** 기본 해석 (Fallback). combinations에 없을 때 사용 */
  meaning: string;
  /** 행성별 구체적 해석. 어떤 행성과 만나느냐에 따라 의미가 달라짐 */
  combinations?: Partial<Record<PlanetKey, string>>;
}

export const FIXED_STARS: FixedStar[] = [
  {
    name: "Aldebaran",
    longitude: 69.93, // 쌍둥이 9도 (2026)
    nature: "Mars (성실과 용기)",
    meaning:
      "동쪽의 감시자. 강직함, 용기, 대중적 인기, 타협하지 않는 정직함. 그러나 도덕성을 잃으면 급격한 몰락이나 질병을 겪을 수 있음.",
    combinations: {
      Sun: "엄청난 에너지와 지구력. 최고의 명예와 리더십을 얻으나, 적들이 많아질 수 있음.",
      Moon: "사업적 성공, 공적인 영광, 강력한 조력자. 하지만 가정 내의 불화나 건강 문제 주의.",
      Mercury:
        "군사 전략가, 뛰어난 경영 능력, 대담한 언변. 스트레스로 인한 신경계 문제.",
      Venus:
        "열정적이고 드라마틱한 사랑. 예술적 재능. 그러나 감정 조절 실패 시 스캔들.",
      Mars: "군인, 경찰, 외과 의사로서의 대성공. 무모함으로 인한 사고나 부상(특히 열병/염증) 주의.",
      Jupiter: "사회적, 종교적, 법적인 큰 명예. 높은 지위. 권력을 쥘 수 있음.",
      Saturn:
        "큰 시련 후의 성공. 무거운 책임감. 물(Water)과 관련된 위험이나 손실 주의.",
    },
  },
  {
    name: "Regulus",
    longitude: 150.06, // 처녀 0도 (2026)
    nature: "Mars/Jupiter (권력과 추락)",
    meaning:
      "북쪽의 감시자. 사자의 심장. 가장 강력한 명예와 리더십, 독립성. 그러나 '복수심'을 품으면 반드시 추락(Fall from Grace)함.",
    combinations: {
      Sun: "왕과 같은 권위, 무한한 잠재력. 성공이 보장되지만, 오만하면 한순간에 모든 것을 잃음.",
      Moon: "여성 유력자의 도움, 대중적 인기. 투기나 투자 성공. 그러나 숨겨진 적들의 공격.",
      Mercury: "고귀한 정신, 정직함으로 얻는 명성. 고위 공직이나 대기업 임원.",
      Venus:
        "화려한 연애, 강렬한 감정적 애착. 사랑으로 인한 명예 실추나 실망(Disappointment) 주의.",
      Mars: "장군의 명예. 강력한 추진력. 그러나 폭력적인 상황이나 사고, 급성 질환 위험.",
      Jupiter: "최고의 조합. 법조계, 종교계, 학계의 정점. 부와 명예가 따름.",
      Saturn:
        "정의롭지만 고독한 지도자. 법 집행자. 폭력이나 암살(배신)의 위험이 도사림.",
    },
  },
  {
    name: "Antares",
    longitude: 249.92, // 사수 9도
    nature: "Mars/Jupiter (극단과 열정)",
    meaning:
      "서쪽의 감시자. 전갈의 심장. 치명적인 매력, 전략적 성공, 불굴의 의지. 그러나 무모함이나 고집으로 인한 자기 파괴(Self-undoing) 위험.",
    combinations: {
      Sun: "타협 없는 야망. 종교적/철학적 열정. 명예를 얻으나 끝이 좋지 않을 수 있음(건강/구설).",
      Moon: "대중을 선동하는 힘. 철학적 깊이. 그러나 정서적 불안정과 가정 불화.",
      Mercury:
        "의심이 많으나 예리한 비판가. 논쟁에서의 승리. 적으로 만들면 위험한 사람.",
      Venus:
        "이기적이지만 치명적인 사랑. 예술적 재능. 질투나 스토킹 같은 문제 주의.",
      Mars: "무모한 용기. 전장의 영웅. 기계나 무기, 불(Fire)로 인한 사고 위험.",
      Jupiter: "종교적 광신 혹은 위대한 열정. 법적인 문제나 유산 상속 분쟁.",
      Saturn: "억압된 분노. 교활함. 남을 조종하려는 성향. 심장 질환 주의.",
    },
  },
  {
    name: "Fomalhaut",
    longitude: 334.18, // 물고기 4도
    nature: "Venus/Mercury (영성과 이상)",
    meaning:
      "남쪽의 감시자. 물질보다는 정신적/영적 명예. 예술, 과학, 마법. 순수한 이상을 추구하면 대길하나, 타락하면 혼란에 빠짐.",
    combinations: {
      Sun: "불멸의 이름(명성). 문학, 과학, 예술 분야의 선구자.",
      Moon: "비밀스러운 사업 성공. 신비주의. 그러나 현실 도피 성향 주의.",
      Mercury: "작가, 시인, 점성가. 영적인 메시지를 전달하는 능력.",
      Venus: "비현실적인 사랑. 예술적 재능의 개화. 유혹에 약함.",
      Mars: "종교적/이념적 열정. 맹신. 약물이나 알코올 주의.",
      Jupiter: "종교적 지도자. 자선 사업. 영적인 스승.",
      Saturn: "현실과 이상의 괴리. 고독한 연구자. 폐나 호흡기 건강 주의.",
    },
  },
  {
    name: "Spica",
    longitude: 204.06, // 천칭 24도
    nature: "Venus/Mars (대길성)",
    meaning:
      "처녀의 보석. 보호, 세련됨, 예술, 학문. 노력 이상의 보상과 예상치 못한 행운(Unbounded good fortune).",
    combinations: {
      Sun: "지속적인 행복, 성직자나 법조계 성공, 대중적 명성.",
      Moon: "재물 획득, 편안한 삶, 신뢰할 수 있는 친구들.",
      Mercury: "깔끔한 일처리, 외교적 수완, 음악적 재능.",
      Venus: "누구나 사랑하는 매력. 사교계의 중심. 예술적 성공.",
      Mars: "인기 있는 리더. 사회적 활동의 성공. 대중을 이끄는 힘.",
      Jupiter: "사회적 존경, 부와 명예, 자손의 번창.",
      Saturn: "신중한 성공, 정의로움, 학문적 성취.",
    },
  },
  {
    name: "Algol",
    longitude: 56.31, // 황소 26도
    nature: "Saturn/Jupiter (대흉성)",
    meaning:
      "메두사의 머리. '통제 불능'의 상황. 극적인 변화, 폭력, 목/머리 부상. 그러나 이 에너지를 잘 쓰면 시대를 바꾸는 강력한 힘이 됨.",
    combinations: {
      Sun: "명예 실추 위험, 극단적인 상황에서의 지도력. (살인/폭력 관련 직업군에서 성공하기도 함)",
      Moon: "정신적 고통, 목 부위의 건강 문제. 대중의 비난이나 오해.",
      Mercury: "말실수로 인한 재앙, 신경 과민, 나쁜 소식.",
      Venus: "비극적인 사랑, 미적 집착, 스캔들. 예술적 승화 필요.",
      Mars: "수술, 사고, 목이나 머리의 부상. 분노 조절 필요.",
      Jupiter: "법적 분쟁, 과신으로 인한 실패. 예술/창작자에게는 파격적 영감.",
      Saturn: "심각한 장애물, 범죄 연루 위험, 혹은 매우 엄격한 판사/검사.",
    },
  },
  {
    name: "Sirius",
    longitude: 104.28, // 게 14도
    nature: "Jupiter/Mars (최고의 밝기)",
    meaning:
      "천랑성. 작은 행동이 큰 결과를 만듦(The Mundane becomes Sacred). 명예, 열정, 헌신. 국가나 대중을 위한 희생과 영광.",
    combinations: {
      Sun: "왕의 총애, 국가적 명예. 자신의 분야에서 1인자가 됨.",
      Moon: "여성의 후원, 건강하고 활력 넘치는 삶. 부모의 덕.",
      Mercury: "거대한 프로젝트의 성공. 공무원이나 군인으로서의 명예.",
      Venus: "화려한 인기, 사치, 예술적 후원. 편안한 죽음.",
      Mars: "용맹함, 위험을 무릅쓴 성공. 군사적/체육적 명예.",
      Jupiter: "엄청난 부와 권력. 사업 확장.",
      Saturn: "국가를 위한 봉사, 엄격한 도덕성, 고위 공직.",
    },
  },
  {
    name: "Vega",
    longitude: 285.38, // 염소 15도
    nature: "Venus/Mercury (카리스마)",
    meaning:
      "마법 같은 매력. 예술적 재능, 음악, 연기. 겉치레나 허영심을 조심하면 사회적 명성을 얻음.",
    combinations: {
      Sun: "정치적/예술적 성공. 권위 있지만 변덕스러움.",
      Moon: "대중적 인기. 신비주의적 성향. 감정 기복 주의.",
      Venus: "냉정하지만 치명적인 매력. 연예계 성공.",
      Mars: "화려한 인생. 허세나 낭비 주의.",
    },
  },
  {
    name: "Betelgeuse",
    longitude: 88.98, // 쌍둥이 29도
    nature: "Mars/Mercury (군사적 명예)",
    meaning:
      "오리온의 어깨. 방해받지 않는 성공. 군사적/체육적 전략가. 부와 명예가 따름.",
    combinations: {
      Sun: "군이나 스포츠 분야에서의 명예. 리더십.",
      Mars: "신중한 행동, 용기, 리더십. 벼락부자가 될 수 있음.",
    },
  },
  {
    name: "Deneb Kaitos",
    longitude: 2.76, // 양 2도
    nature: "Saturn",
    meaning:
      "심리적 억제, 자제력. 충동을 억누르면 성공하나, 감정적 고립이나 우울감을 주의해야 함.",
  },
  {
    name: "Algenib",
    longitude: 9.31, // 양 9도
    nature: "Mars/Mercury",
    meaning:
      "날카로운 지성, 결단력, 전투적 언변. 남의 명예를 훼손하려는 욕구를 조심해야 함.",
  },
  {
    name: "Alpheratz",
    longitude: 14.45, // 양 14도
    nature: "Venus/Jupiter",
    meaning:
      "속박을 싫어하는 자유로운 영혼. 독립적으로 일할 때 부와 명예가 따름. 대중에게 사랑받음.",
  },
  {
    name: "Mirach",
    longitude: 30.6, // 황소 0도
    nature: "Venus",
    meaning:
      "아름다움, 사랑, 용서. 예술적 영감. 행복한 결혼 생활과 다정다감한 성품.",
  },
  {
    name: "Hamal",
    longitude: 37.81, // 황소 7도
    nature: "Mars/Saturn",
    meaning:
      "강력한 추진력과 고집. 잔인함이나 충동성을 다스리지 못하면 추락 위험. 리더의 자질.",
  },
  {
    name: "Menkar",
    longitude: 44.48, // 황소 14도
    nature: "Saturn/Venus",
    meaning:
      "무의식의 바다. 집단적 영향력. 질병(특히 목/후두)이나 명예 실추 위험. 동물에게 해를 입는 것 주의.",
  },
  {
    name: "Alcyone",
    longitude: 60.18, // 쌍둥이 0도
    nature: "Moon/Mars",
    meaning:
      "플레이아데스(슬픈 자매들). 통찰력은 뛰어나나 비관적임. 시력(눈)이나 안목의 문제. 이별이나 슬픔을 예술로 승화해야 함.",
  },
  {
    name: "Prima Hyadum",
    longitude: 66.03, // 쌍둥이 6도
    nature: "Mercury/Mars",
    meaning:
      "갑작스러운 사건, 눈물, 모순된 성격. 그러나 예리한 통찰력과 글로써 성공하는 힘.",
  },
  {
    name: "Rigel",
    longitude: 77.05, // 쌍둥이 17도
    nature: "Jupiter/Mars",
    meaning:
      "교육, 지식, 기술적 재능. 기계나 과학 분야에서의 명예. 발명가적 기질. 오만함만 조심하면 대길.",
  },
  {
    name: "Bellatrix",
    longitude: 81.18, // 쌍둥이 21도
    nature: "Mars/Mercury",
    meaning:
      "여전사. 빠른 결단력, 용기, 투쟁을 통한 성취. 여성에게는 결혼 운의 굴곡을 의미하기도 함.",
  },
  {
    name: "Capella",
    longitude: 82.1, // 쌍둥이 22도
    nature: "Mars/Mercury",
    meaning:
      "호기심, 명예, 부. 이동과 여행을 좋아함. 엉뚱하고 자유로운 성격. 귀인의 도움.",
  },
  {
    name: "El Nath",
    longitude: 82.74, // 쌍둥이 23도
    nature: "Mars",
    meaning:
      "황소의 뿔. 공격성, 돌파력. 중립적임(도구로 쓰임). 적으로 돌리면 위험한 사람.",
  },
  {
    name: "Alnilam",
    longitude: 83.69, // 쌍둥이 24도
    nature: "Jupiter/Saturn",
    meaning:
      "오리온의 허리띠. 공적인 영광, 명예. 그러나 성급한 성격으로 인한 손실 주의.",
  },
  {
    name: "Al Hecka",
    longitude: 84.95, // 쌍둥이 25도
    nature: "Mars",
    meaning:
      "물리적 에너지, 고집, 강한 힘. 건강은 좋으나 사고 위험. 감정 조절 필요.",
  },
  {
    name: "Alhena",
    longitude: 109.3, // 게 9도
    nature: "Mercury/Venus",
    meaning:
      "예술적, 과학적 재능. 발(Foot)의 건강 주의. 평화 지향적이나 내면의 자부심이 강함.",
  },
  {
    name: "Canopus",
    longitude: 105.15, // 게 15도
    nature: "Saturn/Jupiter",
    meaning:
      "노인성. 장수, 지혜, 여행, 지도자. 보수적이지만 존경받는 권위. 항해와 여행의 수호.",
  },
  {
    name: "Castor",
    longitude: 110.36, // 게 20도
    nature: "Mercury",
    meaning:
      "지성, 법률, 작가, 명예. 예리한 판단력과 뛰어난 기억력. 그러나 신경쇠약 주의.",
  },
  {
    name: "Pollux",
    longitude: 113.36, // 게 23도
    nature: "Mars",
    meaning:
      "투쟁, 용기, 격투기. 다소 거칠고 잔인할 수 있음. 스포츠나 경쟁에서 유리함.",
  },
  {
    name: "Procyon",
    longitude: 116.01, // 게 26도
    nature: "Mars/Mercury",
    meaning:
      "빠른 성공, 단기적 성취. 급하게 얻은 것은 급하게 잃을 수 있음(개처럼 짖으나 물지는 않음). 지속성이 관건.",
  },
  {
    name: "Praesepe",
    longitude: 127.43, // 사자 7도
    nature: "Moon/Mars",
    meaning:
      "벌집 성단. 군중, 사업 번창, 많은 자손. 그러나 내면의 고립감이나 시력(눈) 건강 주의.",
  },
  {
    name: "Alphard",
    longitude: 147.39, // 사자 27도
    nature: "Saturn/Venus",
    meaning:
      "바다뱀의 심장. 지혜, 예술적 열정. 그러나 인간관계에서의 배신이나 부도덕한 연애 문제 주의.",
  },
  {
    name: "Denebola",
    longitude: 171.79, // 처녀 21도
    nature: "Saturn/Venus",
    meaning:
      "사자의 꼬리. 비주류적 성공. 대중과 다른 길을 감. 비판을 받지만 결국 인정받음.",
  },
  {
    name: "Vindemiatrix",
    longitude: 190.11, // 천칭 10도
    nature: "Saturn/Mercury",
    meaning:
      "이별의 별. 파트너십보다는 혼자 집중하는 일(건축, 연구)에 길함. 동업이나 결혼에서의 갈등 주의.",
  },
  {
    name: "Arcturus",
    longitude: 204.31, // 천칭 24도
    nature: "Jupiter/Mars",
    meaning:
      "새로운 길의 개척자. 번영, 여행, 큰 행운. 정의로운 행동을 할 때 큰 명예를 얻음.",
  },
  {
    name: "Acrux",
    longitude: 222.1, // 전갈 12도
    nature: "Jupiter",
    meaning:
      "남십자성. 종교적/영적 사명. 물질적 고난이 있어도 정신적 승리를 거둠. 신비주의.",
  },
  {
    name: "Zuben Elgenubi",
    longitude: 225.26, // 전갈 15도
    nature: "Saturn/Mars",
    meaning:
      "남쪽 저울. 사회적 봉사, 희생. 보상 없는 노력이나 타인을 위한 손해를 주의해야 함.",
  },
  {
    name: "Unukalhai",
    longitude: 232.23, // 전갈 22도
    nature: "Saturn/Mars",
    meaning:
      "뱀의 목. 의학, 치유, 독. 의사나 치유자에게는 길하나, 중독이나 감염, 사기 피해 주의.",
  },
  {
    name: "Zuben Eschamali",
    longitude: 239.5, // 전갈 19도
    nature: "Jupiter/Mercury",
    meaning: "북쪽 저울. 명예, 좋은 평판, 사회적 성공. 야망을 실현하는 힘.",
  },
  {
    name: "Dschubba",
    longitude: 242.76, // 사수 2도
    nature: "Mars/Saturn",
    meaning:
      "전갈의 이마. 비밀을 파헤치는 능력. 연구원, 탐정. 교활함이나 악의를 조심해야 함.",
  },
  {
    name: "Acrab",
    longitude: 243.31, // 사수 3도
    nature: "Mars/Saturn",
    meaning:
      "전갈의 머리. 깊은 통찰력, 지식 추구. 그러나 종교적 위선이나 잔인함을 경계해야 함.",
  },
  {
    name: "Ras Alhague",
    longitude: 262.66, // 사수 22도
    nature: "Saturn/Venus",
    meaning:
      "뱀주인자리 머리. 치유의 힘. 의술, 교육. 타인의 아픔을 치료하며 명예를 얻음. 독극물/감염 주의.",
  },
  {
    name: "Nunki",
    longitude: 282.58, // 염소 12도
    nature: "Jupiter/Mercury",
    meaning: "권위, 종교, 정확한 목표 달성. 보수적이지만 확실한 성공. 정치가.",
  },
  {
    name: "Ascella",
    longitude: 283.78, // 염소 13도
    nature: "Jupiter/Mercury",
    meaning:
      "행복한 인연, 좋은 친구, 동료. 긍정적인 마음가짐. 큰 어려움 없이 성취함.",
  },
  {
    name: "Altair",
    longitude: 301.94, // 물병 1도
    nature: "Mars/Jupiter",
    meaning:
      "독수리. 대담함, 용기, 갑작스러운 행운. 군인이나 모험가. 야망이 크고 행동이 빠름.",
  },
  {
    name: "Dabih",
    longitude: 304.18, // 물병 4도
    nature: "Saturn/Venus",
    meaning:
      "의심, 불신, 신중함. 타인을 쉽게 믿지 않으나, 그 덕분에 실수 없이 성공함. 대인관계의 벽.",
  },
  {
    name: "Deneb Algedi",
    longitude: 323.69, // 물병 23도
    nature: "Saturn/Jupiter",
    meaning:
      "법, 정의, 문명의 수호자. 지도자, 재판관. 세상을 돕는 지혜. 그러나 슬픔이나 우울감 주의.",
  },
  {
    name: "Deneb Adige",
    longitude: 335.48, // 물고기 5도
    nature: "Venus/Mercury",
    meaning:
      "백조자리. 명석한 두뇌, 창의성, 예술. 맑은 정신. 이상을 현실로 만드는 힘.",
  },
  {
    name: "Skat",
    longitude: 339.16, // 물고기 9도
    nature: "Saturn/Jupiter",
    meaning:
      "행운, 소원 성취. 튼튼한 기반. 오래 지속되는 행복. 친구들 사이에서의 인기.",
  },
  {
    name: "Markab",
    longitude: 353.67, // 물고기 23도
    nature: "Mars/Mercury",
    meaning:
      "페가수스의 안장. 명예, 여행, 학습. 높은 지위. 그러나 불(Fire)이나 폭발 사고 주의.",
  },
  {
    name: "Scheat",
    longitude: 359.48, // 물고기 29도
    nature: "Mars/Mercury",
    meaning:
      "페가수스의 다리. 독창성, 천재성. 그러나 '생각의 감옥'에 갇히거나 물(Water) 관련 사고 주의.",
  },
];

/** Orb: 접근(Applying) 40분 ≈ 0.67도 이내 */
export const STAR_TRANSIT_ORB_APPLYING_DEG = 0.67;
/** Orb: 분리(Separating) 30분 ≈ 0.5도 이내 */
export const STAR_TRANSIT_ORB_SEPARATING_DEG = 0.5;

/** 세차운동: (BirthYear - 2000) * PRECESSION_PER_YEAR → 항성 현재 황경 보정 */
export const PRECESSION_PER_YEAR = 0.013969;
/** 네이탈 회합 체크 시 최대 Orb (도). 접근 0.67° 기준 적용 */
export const STAR_NATAL_ORB_DEG = 0.67;

// ========== 네이탈 항성 회합 분석 ==========

export type NatalStarTheme =
  | "Identity"
  | "Career"
  | "Love"
  | "Roots"
  | "Health";

export interface NatalStarConnection {
  theme: NatalStarTheme;
  point: string;
  starName: string;
  meaning: string;
  orb: number;
  /** 해석 시 참고: 점이 행성일 때 combinations 키 (Sun/Moon/...) */
  planetKey?: PlanetKey;
}

/** 행성 표기명 → 차트 키 */
const PLANET_NAME_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
};

/**
 * 각도 차이 (0~180 범위)
 */
function angularDistance(a: number, b: number): number {
  let d = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * 네이탈 차트의 주요 감응점·행성이 항성과 회합(Conjunction)하는지 분석.
 * - 세차운동 보정: (BirthYear - 2000) * 0.013969
 * - 회합 Orb: 0.67° 이내 (strict)
 * - 테마별: Identity(Asc/Sun/Moon/Ruler Asc), Career(MC/Ruler MC/Mars/Saturn), Love(Des/Ruler 7th/Venus), Roots(IC/Ruler 4th)
 *
 * @param chartData - Natal Chart (planets, houses.angles)
 * @param birthDate - 출생일 (Date 또는 ISO 문자열)
 * @returns NatalStarConnection[]
 */
export function analyzeNatalFixedStars(
  chartData: ChartData,
  birthDate: Date | string
): NatalStarConnection[] {
  const connections: NatalStarConnection[] = [];
  const date = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  const birthYear = date.getFullYear();
  const precession = (birthYear - 2000) * PRECESSION_PER_YEAR;

  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const mc = chartData.houses?.angles?.midheaven ?? 0;
  const dsc = normalizeDegrees(asc + 180);
  const ic = normalizeDegrees(mc + 180);

  const planets = chartData.planets ?? {};
  const getLon = (key: string): number | null => {
    const p = planets[key as keyof typeof planets];
    return p?.degree ?? null;
  };

  const ascSign = getSignFromLongitude(asc).sign;
  const mcSign = getSignFromLongitude(mc).sign;
  const seventhCuspLon = dsc;
  const seventhSign = getSignFromLongitude(seventhCuspLon).sign;
  const fourthSign = getSignFromLongitude(ic).sign;

  const rulerAscName = getSignRuler(ascSign);
  const rulerMCName = getSignRuler(mcSign);
  const ruler7Name = getSignRuler(seventhSign);
  const ruler4Name = getSignRuler(fourthSign);

  const rulerAscLon = getLon(PLANET_NAME_TO_KEY[rulerAscName]);
  const rulerMCLon = getLon(PLANET_NAME_TO_KEY[rulerMCName]);
  const ruler7Lon = getLon(PLANET_NAME_TO_KEY[ruler7Name]);
  const ruler4Lon = getLon(PLANET_NAME_TO_KEY[ruler4Name]);

  /** 분석 대상: [테마, 포인트 라벨, 황경, combinations용 PlanetKey(선택)]. Ruler는 해당 행성 경도 있을 때만 포함 */
  const points: Array<{
    theme: NatalStarTheme;
    point: string;
    lon: number;
    planetKey?: PlanetKey;
  }> = [
    { theme: "Identity", point: "Ascendant", lon: asc },
    { theme: "Identity", point: "Sun", lon: getLon("sun") ?? 0, planetKey: "Sun" },
    { theme: "Identity", point: "Moon", lon: getLon("moon") ?? 0, planetKey: "Moon" },
    { theme: "Career", point: "MC", lon: mc },
    { theme: "Career", point: "Mars", lon: getLon("mars") ?? 0, planetKey: "Mars" },
    { theme: "Career", point: "Saturn", lon: getLon("saturn") ?? 0, planetKey: "Saturn" },
    { theme: "Love", point: "Descendant", lon: dsc },
    { theme: "Love", point: "Venus", lon: getLon("venus") ?? 0, planetKey: "Venus" },
    { theme: "Roots", point: "IC", lon: ic },
  ];
  if (rulerAscLon != null) {
    points.push({
      theme: "Identity",
      point: "Ruler of Asc",
      lon: rulerAscLon,
      planetKey: rulerAscName as PlanetKey,
    });
  }
  if (rulerMCLon != null) {
    points.push({
      theme: "Career",
      point: "Ruler of MC",
      lon: rulerMCLon,
      planetKey: rulerMCName as PlanetKey,
    });
  }
  if (ruler7Lon != null) {
    points.push({
      theme: "Love",
      point: "Ruler of 7th",
      lon: ruler7Lon,
      planetKey: ruler7Name as PlanetKey,
    });
  }
  if (ruler4Lon != null) {
    points.push({
      theme: "Roots",
      point: "Ruler of 4th",
      lon: ruler4Lon,
      planetKey: ruler4Name as PlanetKey,
    });
  }

  const sixthCuspLon = normalizeDegrees(asc + 150);
  const eighthCuspLon = normalizeDegrees(asc + 210);
  const twelfthCuspLon = normalizeDegrees(asc + 330);
  const ruler6Name = getSignRuler(getSignFromLongitude(sixthCuspLon).sign);
  const ruler8Name = getSignRuler(getSignFromLongitude(eighthCuspLon).sign);
  const ruler12Name = getSignRuler(getSignFromLongitude(twelfthCuspLon).sign);
  const ruler6Lon = getLon(PLANET_NAME_TO_KEY[ruler6Name]);
  const ruler8Lon = getLon(PLANET_NAME_TO_KEY[ruler8Name]);
  const ruler12Lon = getLon(PLANET_NAME_TO_KEY[ruler12Name]);
  if (ruler6Lon != null) {
    points.push({
      theme: "Health",
      point: "Ruler of 6th",
      lon: ruler6Lon,
      planetKey: ruler6Name as PlanetKey,
    });
  }
  if (ruler8Lon != null) {
    points.push({
      theme: "Health",
      point: "Ruler of 8th",
      lon: ruler8Lon,
      planetKey: ruler8Name as PlanetKey,
    });
  }
  if (ruler12Lon != null) {
    points.push({
      theme: "Health",
      point: "Ruler of 12th",
      lon: ruler12Lon,
      planetKey: ruler12Name as PlanetKey,
    });
  }

  for (const star of FIXED_STARS) {
    const starLon = normalizeDegrees(star.longitude + precession);

    for (const pt of points) {
      const dist = angularDistance(pt.lon, starLon);
      if (dist > STAR_NATAL_ORB_DEG) continue;

      const meaning =
        pt.planetKey && star.combinations?.[pt.planetKey]
          ? star.combinations[pt.planetKey]!
          : star.meaning;

      connections.push({
        theme: pt.theme,
        point: pt.point,
        starName: star.name,
        meaning,
        orb: Math.round(dist * 100) / 100,
        planetKey: pt.planetKey,
      });
    }
  }

  return connections;
}

/**
 * NatalStarConnection[]을 Gemini용 [FIXED STAR INFLUENCES] 텍스트로 포맷.
 * Identity / Career / Love / Roots / Health(6,8,12 로드) 구분.
 * @param options.themes - 지정 시 해당 테마만 출력 (미지정 시 전부)
 */
export function formatNatalFixedStarsForPrompt(
  connections: NatalStarConnection[],
  options?: { includeHealth?: boolean; themes?: NatalStarTheme[] }
): string {
  const filter = options?.themes?.length
    ? (c: NatalStarConnection) => options.themes!.includes(c.theme)
    : () => true;
  const filtered = connections.filter(filter);
  const byTheme = {
    Identity: filtered.filter((c) => c.theme === "Identity"),
    Career: filtered.filter((c) => c.theme === "Career"),
    Love: filtered.filter((c) => c.theme === "Love"),
    Roots: filtered.filter((c) => c.theme === "Roots"),
    Health: filtered.filter((c) => c.theme === "Health"),
  };

  const lines: string[] = ["[FIXED STAR INFLUENCES]"];
  if (byTheme.Identity.length > 0) {
    lines.push(
      "1. Identity (Asc/Sun/Moon): Defines the user's core soul character."
    );
    byTheme.Identity.forEach(
      (c) =>
        lines.push(
          `   - ${c.point} conjoins ${c.starName} (orb ${c.orb.toFixed(2)}°): ${c.meaning}`
        )
    );
  }
  if (byTheme.Career.length > 0) {
    lines.push("2. Career & Public Image (MC):");
    byTheme.Career.forEach(
      (c) =>
        lines.push(
          `   - ${c.point} conjoins ${c.starName} (orb ${c.orb.toFixed(2)}°): ${c.meaning}`
        )
    );
  }
  if (byTheme.Love.length > 0) {
    lines.push("3. Love & Karma (Des/Venus):");
    byTheme.Love.forEach(
      (c) =>
        lines.push(
          `   - ${c.point} conjoins ${c.starName} (orb ${c.orb.toFixed(2)}°): ${c.meaning}`
        )
    );
  }
  if (byTheme.Roots.length > 0) {
    lines.push(
      "4. Roots & Family (IC): Indicates dramatic childhood or family history."
    );
    byTheme.Roots.forEach(
      (c) =>
        lines.push(
          `   - ${c.point} conjoins ${c.starName} (orb ${c.orb.toFixed(2)}°): ${c.meaning}`
        )
    );
  }
  const showHealth =
    byTheme.Health.length > 0 &&
    (options?.themes?.includes("Health") ?? options?.includeHealth !== false);
  if (showHealth) {
    lines.push("5. Health (6/8/12 house rulers & malefic stars e.g. Algol, Antares):");
    byTheme.Health.forEach(
      (c) =>
        lines.push(
          `   - ${c.point} conjoins ${c.starName} (orb ${c.orb.toFixed(2)}°): ${c.meaning}`
        )
    );
  }
  return lines.join("\n");
}

// ========== 항성 트랜짓 판별 ==========

export interface StarTransitResult {
  matched: boolean;
  applying?: boolean;
  separating?: boolean;
  distance: number;
  starName: string;
  starLongitude: number;
  planetLongitude: number;
  planetSpeed: number;
  description?: string;
}

/**
 * 트랜짓 행성이 항성과 회합(Conjunction)인지 판별.
 * - 오직 회합(Conjunction)만 체크.
 * - 접근(Applying): 0.67도 이내 / 분리(Separating): 0.5도 이내
 * - 매칭 시 planetName에 해당하는 combinations 해석이 있으면 우선 사용, 없으면 meaning 사용.
 *
 * @param planetLongitude - 행성 황경 (도)
 * @param planetSpeed - 행성 속도 (deg/일, 역행 시 음수)
 * @param star - 항성 (name, longitude, meaning, combinations)
 * @param planetName - 회합한 행성명 (Sun | Moon | ... ). combinations 조회 및 출력 포맷용
 */
export function checkStarTransit(
  planetLongitude: number,
  planetSpeed: number,
  star: FixedStar,
  planetName: PlanetKey
): StarTransitResult {
  const pl = normalizeDegrees(planetLongitude);
  const sl = normalizeDegrees(star.longitude);

  let signedSep = sl - pl;
  if (signedSep > 180) signedSep -= 360;
  if (signedSep < -180) signedSep += 360;

  const distance = Math.abs(signedSep);
  if (distance > 180) throw new Error("Unexpected distance > 180");

  const applying =
    (planetSpeed > 0 && signedSep > 0) || (planetSpeed < 0 && signedSep < 0);
  const separating =
    (planetSpeed > 0 && signedSep < 0) || (planetSpeed < 0 && signedSep > 0);

  let matched = false;
  if (applying && distance <= STAR_TRANSIT_ORB_APPLYING_DEG) {
    matched = true;
  } else if (separating && distance <= STAR_TRANSIT_ORB_SEPARATING_DEG) {
    matched = true;
  }

  const effectText = star.combinations?.[planetName] ?? star.meaning;
  const phaseNote = applying ? "접근 중" : "분리 중";
  const description = matched
    ? `★ Event: Time Lord ${planetName} conjoins ${
        star.name
      }. Effect: ${effectText} (${phaseNote}, 거리 ${distance.toFixed(2)}°)`
    : undefined;

  return {
    matched,
    ...(applying && { applying }),
    ...(separating && { separating }),
    distance,
    starName: star.name,
    starLongitude: star.longitude,
    planetLongitude: pl,
    planetSpeed,
    description,
  };
}
