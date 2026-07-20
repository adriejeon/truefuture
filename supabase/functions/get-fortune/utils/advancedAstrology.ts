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
// 출처: constellationsofwords.com — longitude=표준 황경(2000/J2000), latitude=황위,
// magnitude=겉보기 등급, meaning/combinations=Robson 기반 해석(한국어 의역).
// PED(적경 투영)는 고위도 항성에서 표준황경과 6~35°까지 어긋나 실사용 부적합 → 표준황경 채택.
// 등재 정책: 3등성까지(mag<4.0)만 수록, 4등성 이하(mag≥4.0)는 리스트에서 제외.

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
  /** 사이트 표준 황경 (constellationsofwords Longitude 2000, J2000). 절대 0~360 */
  longitude: number;
  /** 황위(ecliptic latitude, 도). PED 유효성 참고·회합 강도 가중용 */
  latitude: number;
  /** 겉보기 등급(magnitude). 회합 orb 등급 tier 결정. mag<4.0만 등재(4등성 이하 제외) */
  magnitude: number;
  /** 고전 점성학 속성 (행성 유사성). Benefic/Malefic 구분용 */
  nature: string;
  /** 기본 해석 (Fallback). combinations에 없을 때 사용 */
  meaning: string;
  /** 행성별 구체적 해석. 어떤 행성과 만나느냐에 따라 의미가 달라짐 */
  combinations?: Partial<Record<PlanetKey, string>>;
}

export const FIXED_STARS: FixedStar[] = [
  {
    name: "Deneb Kaitos",
    longitude: 2.58,
    latitude: -20.78,
    magnitude: 2.2,
    nature: "Saturn (억제·시련)",
    meaning:
      "고래자리 꼬리. 힘으로 밀어붙이다 자멸하는 기운, 질병·불명예·강제된 변화. 충동을 억누르고 자제하면 시련을 넘기지만, 심리적·신체적 위축과 고립을 주의해야 함.",
    combinations: {
      Sun: "정신적 동요와 뼈아픈 상실. 화상·베임 등 사고 주의.",
      Moon: "개척적이나 무모하고 고집스러움. 격한 성미와 잦은 다툼.",
      Mercury: "활동적인 지성. 공익을 다루는 글·연설, 입법을 지향함.",
      Venus: "내성적이나 정열적. 은밀한 연애가 많음.",
      Mars: "정열적이고 폭력적. 사고·머리 부상·열병·불명예 주의.",
      Jupiter: "법조·종교계 고위직에 오르나 반전(추락) 위험. 적의 배신.",
      Saturn: "불순한 마음, 근심과 은밀한 잘못. 부조화한 환경.",
    },
  },
  {
    name: "Algenib",
    longitude: 9.15,
    latitude: 12.6,
    magnitude: 2.9,
    nature: "Mars/Mercury (야망·기민한 지성)",
    meaning:
      "페가수스 날개 끝. 강한 야망과 예리한 직관, 뛰어난 기억력을 지녔으나 허영과 급한 성미, 폭력적 기질이 악명과 구설을 부름. 재물운은 좋으나 괴짜 같은 사고로 스캔들에 휘말리기 쉬움.",
    combinations: {
      Sun: "정신적 동요와 열병·병약. 사고 위험.",
      Moon: "스캔들로 인한 불명예와 손실, 추방, 병약. 글로 인한 곤란.",
      Mercury: "급한 성미와 정신적 동요가 있으나 논쟁과 분쟁에서는 승리함.",
      Venus: "관대하나 자존심이 강하고 성미가 급하며 방종한 편. 재물운은 좋음.",
      Mars: "심신이 기민하나 거짓말·도벽 성향과 사고 위험.",
      Jupiter: "위선과 종교적 열광, 그러나 재정적 성공.",
      Saturn: "적이 많으나 유력한 벗의 은밀한 도움을 받음. 도덕성은 낮음.",
    },
  },
  {
    name: "Alpheratz",
    longitude: 14.3,
    latitude: 25.67,
    magnitude: 2.2,
    nature: "Jupiter/Venus (독립·인망·명예)",
    meaning:
      "안드로메다의 머리. 독립심과 자유, 예리한 지성으로 사랑과 부, 명예를 끌어들이는 길성. 대중적 인기와 공적 인정을 누리며 스스로의 노력으로 번영함.",
    combinations: {
      Sun: "명예와 승진, 타인의 호의를 받음.",
      Moon: "활력 있고 끈기 있어 명예·재물·좋은 벗·사업 성공을 이룸.",
      Mercury: "활동적인 지성. 법관·변호사·성직자의 도움을 받으며, 개척적 일로 두각을 나타냄.",
      Venus: "단정하고 조용한 삶, 좋은 건강. 즐거움과 사교를 좋아함.",
      Mars: "예리하고 활력 있는 지성. 스스로의 노력으로 사업 성공.",
      Jupiter: "철학적·종교적 성향. 전문가들의 도움과 교회에서의 명예를 얻음.",
      Saturn: "개방적이고 붙임성 있으나 인색함. 인기를 추구하며 부와 가정의 화목을 누릴 가능성이 큼.",
    },
  },
  {
    name: "Mirach",
    longitude: 30.4,
    latitude: 25.93,
    magnitude: 2.4,
    nature: "Venus (미모·예술·헌신)",
    meaning:
      "안드로메다의 허리띠. 아름다움과 빛나는 지성, 가정에 대한 사랑과 헌신을 주는 길성. 예술적 창조력과 영감, 이타심으로 명성과 좋은 결혼운을 누리나, 이성 문제로 흔들릴 수 있음.",
    combinations: {
      Sun: "이성으로 인한 곤란과 어긋난 기대. 그 외에는 대체로 길함.",
      Moon: "경솔함으로 인한 이성 문제, 가정사에는 불리. 그러나 혼인을 통해 명예를 얻음.",
      Mercury: "우유부단하고 불안정하며 기이한 사건과 잦은 여행·변화가 따름.",
      Venus: "관능적이나 도덕성이 낮고 스캔들, 말년의 음주·약물 문제를 주의해야 함.",
      Mars: "무례하고 소란스러우며 나쁜 무리와 어울림. 방랑자로 전락할 수 있음.",
      Jupiter: "여성의 도움을 받으나 스캔들 위험, 잦은 여행, 법적·종교적 어려움.",
      Saturn: "강한 정욕과 방탕. 기계적 천재성이 있으나 재능을 잘못 씀.",
    },
  },
  {
    name: "Hamal",
    longitude: 37.67,
    latitude: 9.95,
    magnitude: 2.2,
    nature: "Mars/Saturn (완강·공격성·지도력)",
    meaning:
      "양자리의 뿔. 완강하고 공격적인 지도자의 기운으로 보호자적 강인함을 지님. 그러나 폭력성과 잔혹함, 계획된 범죄로 흐르면 파멸을 부름.",
    combinations: {
      Sun: "방탕과 나쁜 교우, 손실과 불명예.",
      Moon: "인내심 있고 노력으로 서서히 성공함. 연애로 인한 곤란이 있으나 결혼운은 좋음.",
      Mercury: "둔한 지성이나 벗이 많고 강한 결단력과 재치를 지님. 배우자의 영향을 크게 받음.",
      Venus: "준수하고 조용하나 시기와 질투가 강함. 가정 불화와 본인·가족의 병약.",
      Mars: "폭력성과 범죄 성향. 영향력 있는 지위에 오르나 불명예와 파멸로 끝남.",
      Jupiter: "방탕하고 위선적이나 법조·종교계에서 출세함. 투기로 손실을 봄.",
      Saturn: "신중하고 사려 깊으며 비판적이고 냉소적임. 물질주의적이며 지질학이나 농업에 관심.",
    },
  },
  {
    name: "Menkar",
    longitude: 44.32,
    latitude: -12.58,
    magnitude: 2.8,
    nature: "Saturn (질병·불명예·상실)",
    meaning:
      "고래자리의 턱. 질병과 불명예, 재산의 상실을 부르는 흉성. 짐승으로 인한 부상과 목·인후 질환, 토성적 장애를 주의해야 함.",
    combinations: {
      Sun: "큰 곤란과 질병, 인후 질환, 화가 따르는 유산, 금전 손실과 수확 실패.",
      Moon: "정신적 불안, 여성의 악의, 도둑의 위험, 질병, 친족의 상실, 다툼과 법적 손실.",
      Mercury: "글로 인한 어려움과 빚(저당) 상환의 곤란.",
      Venus: "강하고 통제되지 않는 정욕, 질투와 가정 불화.",
      Mars: "나쁜 교우, 부도덕하고 폭력적이며 살기를 띰. 비명횡사의 위험.",
      Jupiter: "기만적이고 부정직하며 방랑하는 삶. 투옥이나 추방.",
      Saturn: "이기적이고 자기중심적이어서 남을 불행하게 하며 잦은 병치레.",
    },
  },
  {
    name: "Algol",
    longitude: 56.17,
    latitude: 22.42,
    magnitude: 2.1,
    nature: "Saturn/Jupiter (대흉성·참수)",
    meaning:
      "메두사의 머리. 점성술 최악의 흉성으로 폭력과 참수, 급작스러운 죽음을 상징함. 완강한 기질과 사악한 영향력, 군중 폭력에 휘말릴 위험을 경계해야 함.",
    combinations: {
      Sun: "비명횡사나 극심한 질병, 참수의 위험. 태양이 남중(중천)에 있으면 산 채로 불구가 되거나 찢기는 참사를 겪을 수 있음.",
      Moon: "비명횡사 또는 극심한 질병.",
      Mars: "살인자가 되어 비명에 최후를 맞음.",
      Saturn: "화성과 함께라면 왕명에 의한 교수형이나 참수. 함께하는 별에 따라 사형 선고, 익사, 독살로 죽을 수 있음.",
    },
  },
  {
    name: "Alcyone",
    longitude: 60,
    latitude: 4.05,
    magnitude: 3,
    nature: "Moon/Mars (명예·비탄·실명 위험)",
    meaning:
      "플레이아데스의 중심별. 사랑과 명성, 높은 지위를 주지만 슬픔과 애도, 비극이 뒤따르는 별. 야망과 노력으로 영예에 오르나 실명이나 얼굴 부상, 사별의 아픔을 경계해야 함.",
    combinations: {
      Sun: "인후 질환, 실명과 눈·얼굴 부상, 질병, 불명예, 투옥과 비명횡사.",
      Moon: "얼굴 부상, 질병과 불운, 불명예, 투옥과 실명 또는 시력 결함.",
      Mercury: "숱한 실망과 재산 손실, 법적 문제로 인한 큰 손실, 사업 실패와 자녀로 인한 곤란.",
      Venus: "강한 정욕으로 부도덕하며 여성으로 인한 불명예, 질병과 재산 상실.",
      Mars: "머리 부상 사고가 잦고 화재로 인한 손실과 고통.",
      Jupiter: "기만과 위선, 법적·종교적 곤란, 친족으로 인한 손실, 추방이나 투옥.",
      Saturn: "신중하나 잦은 질병(종양, 가족의 만성 질환)과 많은 손실.",
    },
  },
  {
    name: "Prima Hyadum",
    longitude: 65.8,
    latitude: -5.72,
    magnitude: 3.9,
    nature: "Saturn/Mercury (눈물·급변·명민함)",
    meaning:
      "히아데스 성단의 으뜸별. 눈물과 급작스러운 사건, 격렬함을 부르는 별. 흉하게 놓이면 폭력·독·실명·머리 부상과 운명의 반전을 겪으나, 조화로우면 명석한 사고와 뛰어난 언변을 발휘함.",
    combinations: {
      Sun: "사악한 기질과 흐트러진 정신, 학업 실패, 불운. 살인자가 되거나 살해당하는 비명횡사.",
      Moon: "재치 있고 웬만한 능력을 지녔으나 글로 인한 곤란(이름을 위조하고도 처벌을 면할 수 있음). 질병·불명예·눈병에 취약함.",
      Mercury: "명민하나 원한을 품고 성미가 급하며 근심을 곱씹음. 재물운은 좋음.",
      Venus: "여러 재주와 예술적 능력(글·그림)을 지니며, 강한 정열이 그 작품에 배어남.",
      Mars: "퉁명스럽고 용감하며 공격적이고 대담하나 집중력이 부족함.",
      Jupiter: "야망이 있으나 부정직하며 법적 어려움, 가족 간 다툼과 재판에 의한 처벌.",
      Saturn: "신중하고 사려 깊으며 과학적 성향의 다독가. 성공하나 두각은 크지 않고 친족으로 인한 근심이 따름.",
    },
  },
  {
    name: "Aldebaran",
    longitude: 69.78,
    latitude: -5.47,
    magnitude: 0.85,
    nature: "Mars (명예·용기·강직)",
    meaning:
      "동쪽의 감시자. 강직함과 용기, 뛰어난 언변과 대중적 인기로 명예와 권력, 부를 거머쥐는 왕의 별. 그러나 도덕성을 잃으면 급격한 몰락이나 질병, 폭력에 휘말릴 수 있음.",
    combinations: {
      Sun: "대단한 활력과 끈기. 큰 물질적 명예를 얻으나 다툼과 소송으로 잃을 위험. 명예와 부가 불명예와 파멸로 끝나며 질병·열병·비명횡사에 취약함.",
      Moon: "사업과 명예, 신망에 길함(특히 1하우스나 10하우스). 그러나 재앙의 위험이 있음.",
      Mercury: "건강과 가정사에 영향을 줌. 지적·상업적 일로 두각과 물질적 이득을 얻으며 학식 있는 벗이 많음.",
      Venus: "문학·음악·예술로 명예를 얻음. 창조적 재능이 있으며 건강과 결혼에 길함.",
      Mars: "군에서 크게 출세하나 큰 위험이 따름. 사고·열병·비명횡사에 취약함.",
      Jupiter: "교회에서의 큰 명예와 군에서의 높은 승진.",
      Saturn: "큰 고난과 기이한 정신, 사악함과 냉소를 지니나, 뛰어난 언변과 기억력, 학구적이고 은둔적인 성향, 법적 재능을 겸비함.",
    },
  },
{
    name: "Rigel",
    longitude: 76.83,
    latitude: -31.12,
    magnitude: 0.12,
    nature: "Jupiter/Saturn (부·명예)",
    meaning:
      "오리온의 왼발. 자애로움과 명예, 부와 영광, 드높은 명성. 발명과 기계적 재능으로 크게 성공하는 대길성이다.",
    combinations: {
      Sun: "대담하고 용감하나 성급하고 다혈질. 유혈사태와 많은 적을 부르지만, 그럼에도 큰 행운이 따름.",
      Moon: "많은 근심과 실망. 생명·재산의 손상과 질병.",
      Mercury: "과학적 재능. 수성적 분야에서 두각을 나타내는 자리에 오름.",
      Venus: "중년에 명예나 총애를 얻고, 유력하고 좋은 배우자와 결혼함.",
      Mars: "다루기 힘들지만 독창적. 기계 분야에 종사하며 크게 군사적으로 출세함.",
      Jupiter: "법조·종교계에서 크게 출세. 많은 여행과 외국과 관련된 이익.",
      Saturn: "노인·성직자·법조인의 덕을 봄. 공정하고 분별력 있으며 유산 운이 좋음.",
    },
  },
  {
    name: "Bellatrix",
    longitude: 80.95,
    latitude: -16.8,
    magnitude: 1.7,
    nature: "Mars/Mercury (용맹·전략)",
    meaning:
      "오리온의 왼쪽 어깨, '여전사'. 문무의 명예와 부, 빠른 결단력과 전략적 재능, 용기를 안겨줌. 그러나 무모함과 공격성이 지나치면 급작스러운 불명예, 사고로 인한 실명을 부를 수 있음.",
    combinations: {
      Sun: "변덕스럽지만 기계적 재능이 있음. 부를 얻었다가 파멸하고, 사고로 실명할 위험.",
      Moon: "사치와 야심. 군사·의료 분야에서 명예를 얻고 용기로 두각을 나타냄.",
      Mercury: "군사적 명예. 교우 관계에 길함.",
      Venus: "억제되지 않은 연정 때문에 고통받음.",
      Mars: "군인이나 외과의로서의 강인함과 성공. 그러나 사고를 당하기 쉬움.",
      Jupiter: "종교적 성향과 법조계에서의 두각. 그러나 중상모략의 위험.",
      Saturn: "빈곤과 은둔. 미혼으로 남을 가능성이 높음.",
    },
  },
  {
    name: "Capella",
    longitude: 81.85,
    latitude: 22.85,
    magnitude: 0.08,
    nature: "Mars/Mercury (탐구·명예)",
    meaning:
      "마차부자리의 으뜸별, '작은 암염소'. 명예와 부, 높은 지위와 명성, 대중의 신망을 안겨줌. 지식과 새로움을 좇는 탐구심과 학구열이 강하나, 소심하고 지나치게 캐묻는 기질을 지님.",
    combinations: {
      Sun: "우유부단하고 말이 지나치게 많고 성급함. 오해와 비난을 받지만 군사적 명예와 부를 얻음.",
      Moon: "호기심 많고 수다스러우며 빈정대고 다투기 쉬움. 잦은 여행, 가정 불화, 시력 손상과 사고 위험.",
      Mercury: "글로 인한 불쾌한 경험과 소송. 많은 어려움 끝에야 성공함.",
      Venus: "문학적·시적 재능.",
      Mars: "지적이고 학식이 있으나 재능을 저급한 일에 낭비함.",
      Jupiter: "법조·종교계와 연이 있으나 중상과 비난을 받음. 지나친 열정, 잦은 항해와 친척 문제.",
      Saturn: "영리하고 단정하며 사치를 즐기나 해로운 습관이 있음. 큰돈을 벌지만 지키지 못하고, 이성 문제와 말년의 건강 악화·고난.",
    },
  },
  {
    name: "El Nath",
    longitude: 82.58,
    latitude: 5.38,
    magnitude: 1.8,
    nature: "Mars (성취·중립)",
    meaning:
      "황소자리의 뿔 끝. 행운과 높은 지위, 성공을 안겨줌. 과학·종교·철학과 성직을 통한 명예를 얻으며, 중립적이고 균형 잡힌 기운을 지님.",
    combinations: {
      Sun: "성직 등용. 과학·종교·철학을 통한 명예.",
      Moon: "사업 성공. 그러나 미심쩍은 동료와의 다툼, 배우자·동업자·친척으로 인한 가정의 손실.",
      Mercury: "윗사람의 총애를 받으나 동료의 미움을 삼. 높이 오르거나 직업을 바꿈. 잦은 소소한 손실과 큰 가계 지출을 동반한 이익.",
      Venus: "이익에 길함. 적이 있으나 해를 끼치지 못함.",
      Mars: "훌륭한 법조인·연설가·토론가. 재치가 빠름.",
      Jupiter: "법조·종교 분야에서의 성공. 이익과 상속에 길함.",
      Saturn: "신중하고 사려 깊으나 성미가 나쁨. 재물을 모으며, 친척을 통한 이익과 이른 시기의 유산 가능성.",
    },
  },
  {
    name: "Alnilam",
    longitude: 83.47,
    latitude: -24.5,
    magnitude: 1.8,
    nature: "Jupiter/Saturn (추진력·조직력)",
    meaning:
      "오리온의 허리띠 가운데 별. 힘과 활력, 근면함과 조직력, 예리한 지성과 좋은 기억력을 안겨줌. 대중적 명예를 얻지만 그 영광은 덧없이 스쳐 지나감.",
    combinations: {
      Sun: "경솔하고 고집스러우며 무뚝뚝함. 남중까지 겹치면 군사적 출세와 이익.",
      Moon: "갑작스럽고 예상치 못한 손실과 반전이 많음. 친구의 큰 도움, 가족의 병약함.",
      Mercury: "성급하고 다혈질. 동료와의 다툼, 자신의 행동으로 인한 가정 불화.",
      Venus: "연애 문제와 추문, 여성으로 인한 적.",
      Mars: "다툼, 소송으로 인한 손실, 가정 불화, 나쁜 건강, 비명횡사.",
      Jupiter: "법조·교회에서 출세하나 불명예의 위험. 투기로 인한 손실.",
      Saturn: "용감하나 가정 불화. 일찍 집을 떠나며, 성공하지만 예상치 못한 손실이 많음.",
    },
  },
  {
    name: "Al Hecka",
    longitude: 84.78,
    latitude: -2.18,
    magnitude: 3,
    nature: "Mars (폭력·공격성)",
    meaning:
      "황소자리의 남쪽 뿔. 폭력, 특히 남성적 공격성과 완력을 상징함. 사고의 위험이 크며, 힘이 파괴적으로 흐를 수 있는 흉한 기운.",
    combinations: {
      Sun: "의심 많고 내성적이며 학구적. 건강, 특히 폐에 불리함. 군사적 계략·책략에 능하나 기만과 매복의 위험.",
      Moon: "다툼, 나쁜 습관과 나쁜 무리, 타락.",
      Mercury: "성급하고 이기적이며 탐욕스럽고 방탕함. 법적·사업적 곤란, 나쁜 건강, 가정 파탄, 저급한 동료, 빈곤.",
      Venus: "불운함. 저급한 동료와 나쁜 환경.",
      Mars: "나쁜 동료와 나쁜 습관. 성 문제와 화성-금성형 고난.",
      Saturn: "억제되지 않은 정욕, 술, 방탕. 뒤틀린 천재성으로 저속한 글을 쓰는 재주. 호화로운 환경이나 재물은 적고, 말년의 고립·감금과 가정의 불행.",
    },
  },
  {
    name: "Betelgeuse",
    longitude: 88.75,
    latitude: -16.02,
    magnitude: 0.5,
    nature: "Mars/Mercury (무공·통솔)",
    meaning:
      "오리온의 오른쪽 어깨. 군사적 명예와 부, 왕과 같은 기품, 뛰어난 운동 능력과 민첩함을 안겨줌. 통솔력과 발명의 재능을 지니나, 변덕스러운 기분과 불안한 마음이 그림자로 따름.",
    combinations: {
      Sun: "신비주의·오컬트에 대한 관심과 재능. 급성 질환과 열병. 명예와 출세를 누리나 끝내 파멸함.",
      Moon: "활동적인 지성과 강한 의지. 구속당하면 거칠게 반항함. 군사적 성공을 거두나 윗사람과의 다툼으로 고통받음.",
      Mercury: "진지하고 학구적이며 과학·문학적. 저술이나 금속 조각으로 명성을 얻음.",
      Venus: "정교한 장신구를 만드는 뛰어난 재능. 이익에 길하나 가족·결혼과 관련된 슬픔.",
      Mars: "훌륭한 지도자이자 조직자. 군사 분야에서의 명예와 출세.",
      Jupiter: "진지하고 학구적인 정신. 빈틈없고 이문 남는 사업 수완. 교회나 법조계에서의 큰 명예.",
      Saturn: "빈틈없고 교활하며 교묘하게 부정직하고 친구를 배신함. 부침이 심한 파란만장한 삶.",
    },
  },
  {
    name: "Alhena",
    longitude: 99.1,
    latitude: -6.73,
    magnitude: 1.9,
    nature: "Mercury/Venus (예술·화술)",
    meaning:
      "쌍둥이자리의 별, '표식'. 예술적 재능과 글·말솜씨, 평화로운 협상력을 안겨줌. 영적 지향과 과학적 관심을 지니나, 발을 다치는 사고를 조심해야 함.",
    combinations: {
      Sun: "자존심이 강하고 안락과 사치·쾌락을 사랑함. 군사적 명예를 얻을 수 있으나 잃을 위험.",
      Moon: "좋은 건강, 명예, 부, 쾌락과 사교, 가정의 이익.",
      Mercury: "인기와 이성의 덕. 음악·예술적 재능이 있으나 명성은 적음. 쾌락과 사교가 사업을 해침.",
      Venus: "물질적 관심, 화려한 옷과 쾌락·아첨을 좋아함. 예술적·음악적 재능.",
      Mars: "피상적인 기질. 쾌락, 안락, 사치, 장식과 과시를 좋아함.",
      Jupiter: "사회적 성공과 출세. 철학적 정신, 과시욕.",
      Saturn: "신중하고 내성적이며 학구적. 과학이나 예술에서 두각을 나타냄. 가정 불화, 자녀의 병, 예상치 못한 손실이 있으나 부를 이룰 가능성. 말년의 건강 악화.",
    },
  },
  {
    name: "Sirius",
    longitude: 104.08,
    latitude: -39.6,
    magnitude: -1.46,
    nature: "Jupiter/Mars (명예·수호)",
    meaning:
      "큰개자리의 으뜸별이자 밤하늘에서 가장 밝은 별. 명예와 명성, 부, 열정과 충실함을 안겨줌. 수호자의 역할과 야망, 관·군·법조에서의 성공, 유력한 이의 비호가 따르나, 열정이 원한으로 뒤틀리지 않도록 주의해야 함.",
    combinations: {
      Sun: "사업에서의 성공, 흔히 금속이나 군사적 일과 연관됨. 가정의 화목. 뜨거나 남중하면 왕에 버금가는 출세.",
      Moon: "사업 성공. 유력한 이성 친구, 아버지에게 길함, 좋은 건강, 집이나 사업의 이로운 변화.",
      Mercury: "큰 사업적 성공과 유력자의 도움. 쓸데없이 근심함. 교회와 연관되며, 사고로 인한 신체 결함.",
      Venus: "안락, 편안함과 사치. 낭비벽. 상속으로 인한 이익.",
      Mars: "용감하고 관대함. 군사적 출세. 금속과 관련된 일.",
      Jupiter: "사업 성공과 여행. 친척의 도움. 성직에서의 출세.",
      Saturn: "꾸준하고 내성적이며 외교적이고 공정하며 끈기 있음. 친구를 통해 높은 지위에 오름. 가정에 길함.",
    },
  },
  {
    name: "Canopus",
    longitude: 104.97,
    latitude: -75.82,
    magnitude: -0.72,
    nature: "Saturn/Jupiter (경건·권위)",
    meaning:
      "용골자리의 으뜸별, 남쪽 하늘의 뱃길잡이. 경건함과 보수성, 넓은 지식과 교육 사업을 상징함. 여행과 항해에 대한 사랑, 영광과 명성, 부와 위엄, 권위를 안겨줌.",
    combinations: {
      Sun: "가정의 고난, 아버지나 부모와의 갈등, 재정 손실. 사고·화상·열병의 위험, 불행한 말년.",
      Moon: "군인·금속 세공인 등 군사적 분야에서의 성공.",
      Mercury: "경솔하고 고집 세며 완고하나 인정 많음. 인기 없는 주제로 말하거나 글을 써 비난을 삼. 가정·동업자·법으로 인한 손실.",
      Venus: "감정적이고 예민하며 고집스럽고 정열이 강함. 부정한 관계로 인한 추문과 명예 실추, 공개적 망신, 이익에 불리함.",
      Mars: "잔인하고 성미가 나쁘며 시기와 질투가 심함.",
      Jupiter: "큰 자존심, 사업 목적에 이용되는 신앙. 항해, 명예와 출세를 누리나 대중의 불만으로 몰락함.",
      Saturn: "불만이 많고 오컬트에 관심. 명예와 가정에 불리하며 두각은 적으나 선행을 베풀 수 있음.",
    },
  },
{
    name: "Castor",
    longitude: 110.23,
    latitude: 10.08,
    magnitude: 1.57,
    nature: "Mercury (예리한 지성)",
    meaning:
      "쌍둥이자리의 머리별. 예리한 지성과 학문·법률·여행에 대한 재능, 갑작스러운 명성을 줌. 그러나 명예 뒤에 상실과 불명예가 따르기 쉽고, 교활함·이중성, 정신적 붕괴, 사지의 부상이나 투옥의 위험도 함께 안고 있음.",
    combinations: {
      Sun: "신비학이나 정부의 외교 분야에서 두각을 나타냄. 그러나 심각한 사고·구타·자상·부상·실명·질병·급성 열병, 악한 기질, 투옥이나 추방의 위험이 따름.",
      Moon: "소심하고 예민하며 자신감이 부족함. 신비학에 관심이 있고 영적 능력을 지님. 실명·안면 부상·불명예·상처·투옥을 주의.",
      Mercury: "뛰어난 영적 능력을 지녀 비판과 조롱을 받지만 끝내 두각을 나타냄.",
      Venus: "극단적인 부침이 많은 기이한 삶. 결혼에는 불리함.",
      Mars: "악한 기질, 잦은 여행, 목적 없는 삶과 심한 부침.",
      Jupiter: "철학과 신비학에 관심을 둠. 법률·투기·여행으로 인한 손실과 사법적 처벌의 위험.",
      Saturn: "소심하고 의심 많으며 별난 성격. 독창적이나 표현이 서툴러 연설보다 글에 능함. 결혼에는 불리하나 노년에 노력으로 이득을 얻음.",
    },
  },
  {
    name: "Pollux",
    longitude: 113.22,
    latitude: 6.68,
    magnitude: 1.14,
    nature: "Mars (대담·잔혹)",
    meaning:
      "쌍둥이자리의 또 다른 머리별. 대담하고 용맹하되 교활하고 잔혹한 기운, 격투와 신비학·신지학에 대한 관심을 줌. 명예를 얻을 수 있으나 무모함과 악의로 인해 불명예·파멸·투옥, 심하면 폭력적 죽음에 이를 수 있음.",
    combinations: {
      Sun: "신비학과 신지학에 관심을 둠. 그러나 구타·자상·중대한 사고·총격·난파, 살인하거나 살해당함, 극심한 질병·열병·위장병, 폭력적 죽음이나 참수의 위험.",
      Moon: "여성의 악의와 도둑의 위협, 폭력적 죽음. 오만·질병·상처·투옥, 시력 저하나 실명, 질식·익사·암살에 의한 죽음의 위험.",
      Mercury: "불안정한 정신과 인기 없는 기이한 직업. 아버지와의 불화와 가정불화, 토지·부동산·광산으로 인한 손실.",
      Venus: "강하고 절제되지 않은 정욕. 여성이라면 유혹의 위험, 여성으로 인한 손실, 독의 위험.",
      Mars: "난폭함, 살인하거나 살해당함. 높은 지위에 오르나 끝내 파멸, 질식·익사·암살에 의한 폭력적 죽음.",
      Jupiter: "법적 손실. 높은 지위에 오르나 불명예의 위험, 친척으로 인한 문제, 추방이나 투옥.",
      Saturn: "고약한 성미, 신랄하고 냉소적임. 팔이나 다리를 잃거나 부모를 여읨, 말이나 큰 짐승을 다루다 급사할 위험.",
    },
  },
  {
    name: "Procyon",
    longitude: 115.78,
    latitude: -16.02,
    magnitude: 0.38,
    nature: "Mercury/Mars (활동·급변)",
    meaning:
      "작은개자리의 별. 활동력과 날카로운 지성, 갑작스러운 출세와 부·명성을 줌. 그러나 성급함과 질투·격한 성미로 출세가 재앙으로 끝나기 쉽고, 개에게 물리거나 광견병의 위험도 따름.",
    combinations: {
      Sun: "흉성의 방해가 없다면 친구의 큰 도움과 선물·유산을 받음. 큰 고생과 비용 끝에 군사적 출세를 이루며, 상승하거나 중천에 있으면 왕에 버금가는 영달을 누림.",
      Moon: "신비학에 관심이 있으나 안절부절 한곳에 오래 머물지 못함. 친구·동업자·고용주와 다툼, 특정 배치에서는 미친개에게 물려 죽을 위험.",
      Mercury: "신비학에 관심을 두고 정부의 하급 관리직에 오름. 이성으로 인한 문제와 추문이 있으나 건강과 이득에는 유리함.",
      Venus: "영향력 있는 친구들의 도움과 교회와의 인연으로 여러 이득을 얻음.",
      Mars: "잔혹함과 폭력, 추문과 비방, 불명예와 파멸, 개에게 물릴 위험.",
      Jupiter: "잦은 여행. 친척과 교회·법률로 인한 문제가 있으나 친구의 도움을 받음.",
      Saturn: "판단력이 뛰어나 흔히 토지와 관련된 신뢰받는 높은 지위에 오름. 노부부에게 입양되어 좋은 유산을 받기도 함. 나이 든 벗의 도움, 좋은 건강과 가정의 화목, 신분 상승 결혼을 누림.",
    },
  },
  {
    name: "Praesepe",
    longitude: 127.33,
    latitude: 1.28,
    magnitude: 3.7,
    nature: "Mars/Moon (질병·불명예)",
    meaning:
      "게자리의 성단(벌집). 근면과 질서·다산의 기운이 있으나, 질병·불명예·잔혹함과 무모한 모험을 부르는 흉한 별. 특히 실명과 눈의 손상, 상처와 투옥의 위험이 두드러짐.",
    combinations: {
      Sun: "악한 기질, 살인하거나 살해당함. 구타·자상·중대한 사고·총격·난파·처형·추방·투옥, 급성 질환·열병·출혈·소송, 불·쇠붙이·돌에 의한 죽음의 위험, 안면 부상과 눈병, 앵글에 위치하면 실명.",
      Moon: "상처·자상·투옥, 안면 부상과 질병, 실명이나 눈의 손상(특히 Saturn이나 Mars가 Regulus와 함께 있을 때).",
    },
  },
  {
    name: "Alphard",
    longitude: 147.28,
    latitude: -22.37,
    magnitude: 2.2,
    nature: "Saturn/Venus (통제 안 되는 정욕)",
    meaning:
      "바다뱀자리의 심장. 지혜와 음악·예술적 감성을 지니나, 절제되지 않은 강한 정욕과 자제력 부족을 부름. 부도덕과 추문·중독, 익사·독·질식에 의한 급사, 독물의 위협을 경계해야 함.",
    combinations: {
      Sun: "권력과 권위를 얻으나 자신의 행동과 적으로 인해 고통받음. 지위와 명예를 잃고 적에게 제압당함.",
      Moon: "정욕과 방탕, 낭비. 하는 일은 실패하나 흔히 친척의 재정적 도움을 받음. 아내나 어머니의 불운, 끝내 불명예와 파멸, 질식사의 위험(Mars나 Saturn의 방해가 있으면 익사나 독사).",
      Mercury: "글로 인한 문제, 결혼에 불리함. 삶의 방향을 완전히 바꿔 놓는 격정적 애착으로 고통받음.",
      Venus: "친척이 반대하는 격정적 애착. 용모가 뛰어나 이성에게 사랑받고 이득에 유리하나, 여성이라면 연애로 슬픔을 겪음.",
      Mars: "연애로 인한 문제와 추문, 기혼자와의 애착. 출산에 나쁘고(유산·사망 위험) 중대한 사고의 위험, 광명성(해·달)을 해치면 익사나 독에 의한 죽음의 위험.",
      Jupiter: "강한 정욕, 이득에는 유리함. 홀아비나 과부와의 애착으로 불명예를 겪기 쉽고, 법적 문제와 사법적 처벌.",
      Saturn: "강한 정욕을 지녔으나 냉정하고 신중하며 좀처럼 화내지 않음. 짧고 은밀한 슬픈 연애, 가정불화, 독에 의한 죽음의 위험.",
    },
  },
  {
    name: "Regulus",
    longitude: 149.83,
    latitude: 0.45,
    magnitude: 1.35,
    nature: "Mars/Jupiter (왕의 위엄)",
    meaning:
      "사자자리의 심장, 왕의 별. 고결한 이상과 관대함, 용기와 군사적 명예, 독립적 기상을 줌. 그러나 파괴적 폭력성이 잠재해 있어 결국 몰락과 불명예로 끝날 위험을 안고 있음.",
    combinations: {
      Sun: "권력과 권위, 친구들에 대한 큰 영향력, 명예와 부를 얻음. 그러나 폭력과 분란, 끝내 불명예를 겪음.",
      Moon: "큰 권력과 명예·부, 대중적 명성을 누림. 신비학에 관심을 두나 적으로 인한 위험이 있음.",
      Mercury: "명예롭고 공정하며 인기가 있음. 높은 지위를 통해 명성과 이득을 얻음.",
      Venus: "숱한 실망. 격정적 애착과 연애로 인한 문제.",
      Mars: "명예와 명성, 강인한 성품. 대중적 명성과 높은 군 지휘권.",
      Jupiter: "군사적 명성과 높은 출세. 종교계에서의 성공.",
      Saturn: "공정함. 종교나 법조계에서 성공하고 부와 높은 지위를 얻으나 말년에 심장병을 앓음.",
    },
  },
  {
    name: "Denebola",
    longitude: 171.62,
    latitude: 12.25,
    magnitude: 2.2,
    nature: "Saturn/Venus (성급한 판단·후회)",
    meaning:
      "사자자리의 꼬리. 빠른 판단력을 주지만 그만큼 후회와 절망이 따르기 쉬움. 자연재해로 인한 불운, 대중 앞에서의 불명예, 행복이 분노로 뒤바뀌는 급변을 경계해야 함.",
    combinations: {
      Sun: "명예와 출세를 얻으나 위험이 따르며 끝내 대중적 불명예와 파멸로 끝남. 질병·열병·급성 질환.",
      Moon: "서민들 사이에서 명예를 얻으나 끝내 불명예와 파멸. 주요 장기의 격심한 질병, 실명이나 눈의 손상, 사고, 하인으로 인한 손실, 가정불화와 일시적 별거.",
      Mercury: "대리인이나 하인, 그리고 글로 인한 잦은 손실. 악성이나 전염성 질병으로 가족을 잃음.",
      Venus: "강한 정욕, 이른 나이에 그릇된 길로 빠지고 연애로 파멸함.",
      Mars: "신랄하고 복수심이 강하며 잔혹하고 인기가 없음. 지위를 잃고 대중 앞에서 불명예를 겪음.",
      Jupiter: "오만과 위선, 실망스러운 삶. 해외나 친척으로 인한 문제, 숨은 적, 투옥이나 사형선고의 위험.",
      Saturn: "비판적이고 늘 불평하며 적이 많음. 하인과 도둑으로 인한 손실, 가정의 슬픔, 아내의 병약함이나 정신적·신체적으로 온전치 못한 자녀.",
    },
  },
  {
    name: "Vindemiatrix",
    longitude: 189.93,
    latitude: 16.2,
    magnitude: 3,
    nature: "Saturn/Mercury (허위·불명예)",
    meaning:
      "처녀자리의 별(포도 따는 여인). 허위와 불명예, 도둑질과 어리석은 방종을 부르는 별. 특히 배우자를 잃고 홀로 되게 하는 기운이 있다고 전해짐.",
    combinations: {
      Sun: "근심과 우울, 인기 없음, 사업 실패, 채권자에게 시달림.",
      Moon: "근심과 숱한 실망. 법률이나 글, 도둑으로 인한 손실, 나쁜 건강, 사업 실패.",
      Mercury: "충동적이고 지나치게 성급함. 글과 사업으로 인한 손실.",
      Venus: "연애로 인한 문제, 친구를 잃음, 추문의 위험.",
      Mars: "무모하고 고집스러우며 경솔하나 활력이 넘침. 법률·사업·친구로 인한 문제.",
      Jupiter: "법률이나 교회로 인한 문제, 많은 비판, 잦은 여행.",
      Saturn: "신중하고 사려 깊으며 과묵하나 물질적이고 신앙에 위선적임. 투기로 손실을 보나 사업에서는 성공, 배우자와의 은밀한 갈등.",
    },
  },
  {
    name: "Spica",
    longitude: 203.83,
    latitude: -2.05,
    magnitude: 0.98,
    nature: "Venus/Mars (성공·명성)",
    meaning:
      "처녀자리의 밀 이삭, 대표적 길성. 성공과 명성·부, 온화한 기질과 예술·학문에 대한 사랑을 줌. 다만 목적을 위해 수단을 가리지 않는 비양심, 결실 없음, 무고한 이를 향한 불의의 그늘도 함께 지님.",
    combinations: {
      Sun: "크고 오래 지속되는 출세, 높은 위엄과 막대한 부.",
      Moon: "발명을 통한 이득. Mercury·Venus·Jupiter 성향의 사람들로부터 성공과 부·명예를 얻음.",
      Mercury: "단정하고 영리하며 재간이 있음. 성직자와 권력자의 호의를 얻음.",
      Venus: "친구의 도움과 사교적 성공. 그러나 동성의 거짓된 벗이 있음.",
      Mars: "대중적이고 사교적인 성공. 뛰어난 판단력과 신속한 결단.",
      Jupiter: "인기가 있음. 사교적 성공과 부, 종교계의 명예와 출세.",
      Saturn: "언변이 뛰어나고 친구가 많아 인기가 있음. 유산을 통한 이득.",
    },
  },
  {
    name: "Arcturus",
    longitude: 204.23,
    latitude: 30.73,
    magnitude: -0.04,
    nature: "Mars/Jupiter (번영·개척)",
    meaning:
      "목동자리의 으뜸별. 번영과 부·명예, 드높은 명성과 자기 주도의 힘을 줌. 항해와 여행을 통한 성공, 힘으로 정의를 세우는 진취적 기상을 지니나 호전성도 함께 안고 있음.",
    combinations: {
      Sun: "느리지만 참을성 있는 노력으로 성공함. 성직자 중에 벗이 있고, 이득과 대중·법조인을 상대하는 일에 유리함.",
      Moon: "새로운 벗과 사업적 성공, 뛰어난 판단력, 가정의 화목. Mars가 함께하면 질식사의 위험.",
      Mercury: "진중하고 근면하며 인기가 있음. 다소 신앙심이 있고 낭비벽이 있으나 살림은 넉넉함, 친구의 도움을 받음.",
      Venus: "인기가 있음. 친구들로부터 선물과 호의를 받으나 동성의 거짓된 벗이 더러 있음.",
      Mars: "친구가 많아 인기가 있고 상당한 이득을 얻으나 낭비벽 탓에 모으지 못함.",
      Jupiter: "법률과 교회 일에서 이득을 얻고 영향력 있는 지위에 오름. 위선의 위험, 해외 사업이나 해운을 통한 이득.",
      Saturn: "정직하나 이기적이고 인색한 편임. 사업에 밝고 물질적이며, 이득과 투기에 유리함.",
    },
  },
{
    name: "Acrux",
    longitude: 221.87,
    latitude: -52.87,
    magnitude: 0.76,
    nature: "Jupiter (영성·정의·신비)",
    meaning:
      "남십자자리의 별. 종교적 자비와 의례, 정의, 그리고 마법과 신비에 대한 이끌림을 준다. 발명가적 직관과 지혜로 타인의 내면을 꿰뚫어 보는 통찰을 지님.",
    combinations: {},
  },
  {
    name: "Zuben Elgenubi",
    longitude: 225.08,
    latitude: 0.32,
    magnitude: 2.9,
    nature: "Saturn/Mars (악의·독)",
    meaning:
      "천칭자리 남쪽 저울. 악의와 방해, 용서를 모르는 완고함의 기운. 폭력·질병·거짓·범죄로 명예를 잃거나 독의 위험을 겪을 수 있음.",
    combinations: {
      Sun: "질병과 사업 손실, 화재·투기로 인한 손해. 불명예와 몰락, 윗사람의 미움, 억울한 누명, 가족의 병.",
      Moon: "이성 문제와 억울한 누명. 불명예와 몰락, 심리적 불안, 친족을 잃고 많은 실망과 잦은 병.",
      Mercury: "교활하고 복수심 강하며 배신을 일삼는 명민함. 나쁜 건강, 불명예, 말년의 빈곤.",
      Venus: "결혼에 불리함. 갑작스럽고 은밀한 죽음, 동성의 질투로 독살당할 위험.",
      Mars: "유혈이나 죽음으로 이어지는 격렬한 다툼.",
      Jupiter: "위선과 기만, 부정직. 이익을 위한 거짓 신앙심, 투옥의 위험.",
      Saturn: "명예롭지 못하고 처벌을 피해가나 끝내 대가를 치름. 질투와 급한 성미, 가정 불화, 결혼·이득·유산에 불리함.",
    },
  },
  {
    name: "Zuben Eschamali",
    longitude: 229.37,
    latitude: 8.48,
    magnitude: 2.7,
    nature: "Jupiter/Mercury (행운·번영)",
    meaning:
      "천칭자리 북쪽 저울. 행운과 높은 야망, 관대함. 명예와 부, 오래 지속되는 행복을 부르는 길성.",
    combinations: {
      Sun: "큰 행운과 높은 지위. 일시적 어려움도 결국 이롭게 작용함.",
      Moon: "활동적인 지성과 조직력. 새롭고 영향력 있는 벗과 값진 선물로 덕을 봄. 친구 이름을 빌려 돈을 구하나 원만히 해결되며, 높은 지위와 품위 있는 여성의 사랑을 받음.",
      Mercury: "민첩하고 기민하며 유력자의 호의를 받음. 좋은 지위와 큰 지출, 글로 얻는 이익.",
      Venus: "사교적 성공과 여성의 도움. 연애와 결혼에 유리함.",
      Mars: "높은 야망과 정력으로 이룬 성공. 영향력 있는 지위, 힘 있는 필력과 언변.",
      Jupiter: "철학적 정신과 종교·법조계의 승진. 유능한 필자·연설가, 영향력 있는 벗.",
      Saturn: "신중하고 과묵하며 학구적이고 분석적임. 화학자·탐정에 어울리고 사람을 잘 판별함. 초년의 손실은 끝내 회복하지 못하나 이득과 가정사에 유리하며, 유아기 자녀의 병을 주의.",
    },
  },
  {
    name: "Unukalhai",
    longitude: 232.08,
    latitude: 25.5,
    magnitude: 2.8,
    nature: "Saturn/Mars (독·폭력)",
    meaning:
      "뱀자리의 심장. 부도덕과 사고, 폭력의 기운. 독으로 인한 위험이 따름.",
    combinations: {
      Sun: "잦은 다툼과 실망, 불운한 삶. 가족이나 벗의 죽음에 크게 흔들림.",
      Moon: "영리하나 악한 환경에 놓이고 권위를 증오함. 음모와 책략에 얽혀 추방·투옥되거나 범죄로 교수형에 처해질 수 있으며, 독살의 위험.",
      Mercury: "명예롭지 못하고 문서 위조나 절도로 고발당함. 나쁜 건강과 아슬아슬한 위기, 독을 지닌 동물에게 물릴 위험.",
      Venus: "동성의 원한과 질투. 가정사에 나쁘나 이득에는 유리하며, 아마도 독에 의한 은밀한 죽음.",
      Mars: "폭력과 다툼, 거짓, 범죄. 아마도 독에 의한 비명횡사.",
      Jupiter: "위선과 기만. 추방·투옥 또는 유배.",
      Saturn: "은밀한 광기와 약물 중독, 이유 없는 은밀한 범죄와 독살. 빈틈없고 교활하며 학구적이어서 의사·간호사가 되기도 함. 대개 미혼이며 자살하거나 감금될 수 있음.",
    },
  },
  {
    name: "Bungula (Toliman)",
    longitude: 239.48,
    latitude: -42.58,
    magnitude: -0.27,
    nature: "Venus/Jupiter (우정·품격)",
    meaning:
      "켄타우루스자리의 앞발. 자비로움과 우정, 세련됨. 명예로운 지위로 이끄는 길성.",
    combinations: {
      Sun: "시기심 많고 자기중심적임. 더디지만 제법 성공하는 행보, 많은 적, 유산의 상실.",
      Moon: "인기 있고 벗이 많으며 외교적이나, 은밀한 악습과 과음이 있음. 분쟁에 휘말려도 결국 잘 헤쳐 나감.",
      Mercury: "변덕스럽고 우유부단하며 흠잡기 좋아하고 까다로우나 좋은 지성과 사업적 성공을 지님. 적으로 인한 가정 문제, 가족의 병, 좌절된 야망.",
      Venus: "인기 있고 예술·음악적 재능을 지님. 벗의 덕을 보나 연애로 인한 위험.",
      Mars: "강한 체력과 상당한 정신력. 연설가나 필자이나 크게 두드러지지는 못함.",
      Jupiter: "종교·법조계의 큰 명예와 승진, 의례를 중시하는 성향. 외국에서의 성공, 이득에 유리함.",
      Saturn: "학구적이고 박식하나 물질적이고 이기적임. 이득·재산·유산에 유리하지만 다툼이 따르고, 결혼에 유리하나 약간의 가정 불화가 있으며, 맏이가 일찍 화를 겪을 수 있음.",
    },
  },
  {
    name: "Dschubba",
    longitude: 242.57,
    latitude: -1.98,
    magnitude: 2.5,
    nature: "Mars/Saturn (탐구·집요)",
    meaning:
      "전갈자리의 이마. 인내와 경계심, 숙련된 결단력. 외과적 정밀함과 숨은 것을 파헤치는 탐구·연구의 재능을 지님.",
    combinations: {
      Sun: "부도덕하고 방탕하며 저급한 무리와 어울림. 많은 슬픔.",
      Moon: "과묵하고 의심 많음. 사업 성공에 나쁘고 불명예, 말과 소로 인한 손실.",
      Mercury: "위선적이고 악한 마음에 저급한 무리와 어울림. 투옥과 회복 가능한 악성 질병, 범죄, 출생·혈통에 얽힌 비밀, 가정 불화.",
      Venus: "조용하고 과묵하며 질투심 강하고 이기적임. 이득에는 유리함.",
      Mars: "부도덕하고 범죄적이며 폭력적임. 악한 환경, 급작스럽거나 폭력적인 죽음.",
      Jupiter: "기만적이고 부정직하며 방탕함. 저급한 동료, 투옥의 위험.",
      Saturn: "우유부단하며 강한 정욕과 악습을 지니고 저급한 무리와 어울림. 가족에게 의절당할 수 있고 여러 번의 불행한 결혼, 아끼는 자녀의 이른 죽음, 폐병으로 인한 사망.",
    },
  },
  {
    name: "Acrab",
    longitude: 243.18,
    latitude: 1,
    magnitude: 2.9,
    nature: "Mars/Saturn (극단적 악의·전염병)",
    meaning:
      "전갈자리 머리의 별. 극단적인 악의와 무자비함, 잔혹함. 절도·범죄와 전염병의 기운이 있으나, 숨겨진 것을 파고드는 연구의 재능도 지님.",
    combinations: {
      Sun: "물질적이고 지나치게 분주한 정신. 종교적 어려움과 나쁜 건강, 그 밖에는 별이 떠오를 때와 비슷한 영향.",
      Moon: "큰 권력과 명예, 부와 선물을 얻으나 유산을 받기는 어려움. 물질적이고 비주류 사상에 끌려 비판받으며, 숱한 난관 끝에 성공함.",
      Mercury: "둔한 정신과 표현의 어려움 또는 언어 장애. 선물을 받으나 유산은 어렵고, 끝내 성공함.",
      Venus: "부정직하고 이기적이나 정력적이고 유능함. 이득에 유리함.",
      Mars: "운동에 능하나 과로하고 극단으로 치달으며 활동적인 정신을 지님. 금전에는 유리하나 낭비가 심해 빚이 많음.",
      Jupiter: "진짜든 가짜든 신앙심으로 위선적임. 유산에 법적 분쟁이 따름.",
      Saturn: "신중하고 교활하며 이기적이고 기만적이나 진보적 사상을 지니고, 신앙심 있으나 위선적임. 가정에 자부심을 갖고, 불이나 물로 인한 손실, 결혼·동업으로 얻는 이득, 적은 자녀, 긴 수명.",
    },
  },
  {
    name: "Antares",
    longitude: 249.77,
    latitude: -4.57,
    magnitude: 0.98,
    nature: "Mars/Jupiter (용맹·격정)",
    meaning:
      "전갈자리의 심장. 악의와 파괴성에 관대함과 넓은 도량이 뒤섞임. 무인의 기질과 용기, 전략적 재능을 주나, 무모함과 폭력, 눈의 문제를 주의해야 함.",
    combinations: {
      Sun: "명예와 부가 끝내 불명예와 몰락으로 귀결됨. 군에서의 승진, 배신의 위험, 폭력을 행하거나 당함.",
      Moon: "숱한 위험과 재난 속의 명예와 승진. 폭력·질병·익사 또는 암살의 위험.",
      Mercury: "의심 많아 벗을 억울하게 몰아붙임. 인망이 없고, 돈은 더디고 어렵게 벌림.",
      Venus: "진실하지 못하고 부정직함. 정력적이고 유능하나 이기적임.",
      Mars: "해로운 습관과 벗·친족과의 다툼. 이득에는 제법 유리함.",
      Jupiter: "깊은 신앙심과 종교계의 승진, 다만 위선으로 흐르는 경향.",
      Saturn: "물질적이고 부정직하며 종교적 위선을 보임. 많은 실망, 가정사에 불리함.",
    },
  },
  {
    name: "Ras Alhague",
    longitude: 262.45,
    latitude: 35.83,
    magnitude: 2.1,
    nature: "Saturn/Venus (왜곡된 욕망·정신불안)",
    meaning:
      "뱀주인자리의 머리. 토성적 기질에 왜곡된 금성의 성향과 해왕성적 경향이 뒤섞임. 여성으로 인한 불운, 비뚤어진 취향, 정신적 이상을 주의해야 함.",
    combinations: {
      Sun: "과묵하고 사려 깊으며 학구적이고 의심 많고 고독함. 운동으로 이름을 얻으나 재물은 적고, 세평에 무관심함.",
      Moon: "종교 분야에서 대중적으로 두각을 나타내며 이득에 유리함.",
      Mercury: "종교·철학·과학으로 인한 인기 하락과 비판. 결혼에서의 어려움.",
      Venus: "명민하고 교육을 잘 받았으며 신중하고 비밀스럽고 의심 많음.",
      Mars: "글로 인한 문제와 종교·과학·철학에 얽힌 대중의 질책.",
      Jupiter: "외교적이며 종교·법조계의 승진에 약간의 비판이 따름. 이득에 유리함.",
      Saturn: "이기적이고 인망이 없으며 고집스러운 확신을 지님. 성공하나 다소 부정직하고, 가정 불화.",
    },
  },
  {
    name: "Nunki",
    longitude: 282.38,
    latitude: -3.43,
    magnitude: 2.1,
    nature: "Jupiter/Mercury (진실·웅변)",
    meaning:
      "궁수자리의 별. 진실함과 낙천성, 종교적 심성. 권위 있는 웅변가의 기질과 먼 여행·배·비행기에 대한 관심을 준다.",
    combinations: {
      Sun: "영향력 있는 공적 지위. 가정사와 가족 문제에 유리함.",
      Moon: "과학·철학·교육·농업 분야의 성공한 필자. 종교에서는 비정통적이며, 적을 물리치고 벗이 많음. 토성적 질병이 있음.",
      Mercury: "높은 관직과 부, 다만 대중의 비판. 아내나 어머니의 병으로 인한 근심.",
      Venus: "머리보다 마음이 앞섬. 이성의 호의와 많은 벗.",
      Mars: "과묵하고 외교적이며 심지가 굳고 용감하고 정력적이며 솔직함. 거짓된 벗이 있으나 이득에는 유리함.",
      Jupiter: "외교적이고 철학적인 정신. 필자이며 종교·법조계의 승진.",
      Saturn: "사려 깊고 과묵하며 자기중심적임. 성공이 50세 넘어 늦어지고 적에게 야망을 저지당하며 불명예의 위험이 있으나 말년에는 부를 이룸. 부모의 우환, 늦은 결혼에 유리함.",
    },
  },
{
    name: "Ascella",
    longitude: 283.63,
    latitude: -7.17,
    magnitude: 2.7,
    nature: "Jupiter/Mercury (행운·기쁨)",
    meaning:
      "궁수자리 겨드랑이의 별. 행운과 오래 지속되는 행복을 상징함. 큰 굴곡 없이 순조로운 기쁨과 안온한 복을 가져다주는 온화한 기운.",
    combinations: {
      Sun: "행운과 오래 지속되는 행복.",
      Moon: "새롭고 영향력 있는 친구, 값진 선물, 존경받는 여성의 사랑.",
    },
  },
  {
    name: "Vega",
    longitude: 285.32,
    latitude: 61.73,
    magnitude: 0.03,
    nature: "Venus/Mercury (예술·이상)",
    meaning:
      "거문고자리의 밝은 별. 예술·음악·연기의 재능과 이상주의, 세련됨과 부를 상징함. 그러나 변덕과 겉치레, 방종한 기질이 이면에 있어 진중함을 잃으면 신망이 무너질 수 있음.",
    combinations: {
      Sun: "비판적이고 무뚝뚝하며 내성적이라 인기를 얻기 어려움. 명예는 덧없으나 영향력 있는 지위에 오르며, 진실하지 못한 친구를 조심.",
      Moon: "위조 등으로 인한 공개적 불명예 위험, 글로 인한 손실과 다소의 건강 문제. 다만 사업에서는 성공.",
      Mercury: "의심 많고 내성적이며 신랄함. 야망이 좌절되고 이중 거래와 은밀한 적을 겪음.",
      Venus: "냉정하고 인색한 마음. 건강 문제와 외모의 결함·기형 위험.",
      Mars: "과학적 관심과 대중과 다른 견해, 도덕적 용기. 이득에는 유리함.",
      Jupiter: "법적 문제로 인한 손실. 이득에는 유리하나 투옥의 위험.",
      Saturn: "강한 열정, 고집스럽고 독창적임. 억울한 비난으로 평판이 손상됨.",
    },
  },
  {
    name: "Altair",
    longitude: 301.78,
    latitude: 29.3,
    magnitude: 0.77,
    nature: "Mars/Jupiter (담대·야망)",
    meaning:
      "독수리자리의 별. 대담함과 자신감, 불굴의 의지와 큰 야망을 상징함. 갑작스러운 부를 얻으나 오래 지키지 못하며, 지나친 야망과 파충류·독물의 위험을 조심해야 함.",
    combinations: {
      Sun: "대중적 명예와 악명, 윗사람의 총애. 글로 인한 곤란과 독을 지닌 동물의 위험.",
      Moon: "고대의 발견·유물에 대한 관심. 재산 손실과 자녀 문제.",
      Mercury: "불운과 기이한 경험, 실망스러운 여행, 동업 문제.",
      Venus: "연애에 불리하고 친구로 인한 손실, 자녀에게 나쁨.",
      Mars: "예리한 지성. 친구로 인한 곤란이 있으나 결국 이득을 얻음.",
      Jupiter: "종교적 위선, 법조·교회의 문제, 상속에 대한 실망.",
      Saturn: "슬픔과 정신적 동요, 요양원·병원에 갇힐 위험, 평생 이어지는 질환의 위험.",
    },
  },
  {
    name: "Dabih",
    longitude: 304.05,
    latitude: 4.58,
    magnitude: 3.2,
    nature: "Saturn/Venus (과묵·우울)",
    meaning:
      "염소자리의 별. 과묵함, 의심과 불신, 우울한 기질을 상징함. 신중하고 사려 깊으나 마음을 닫으면 고립과 침울에 빠지기 쉬움.",
    combinations: {
      Sun: "내성적이고 의심 많고 불신함. 친구로 인한 손실이 있으나, 신뢰와 권위를 지닌 책임 있는 공직에 오름.",
      Moon: "사업에서 성공하나 오명 속에 물러남. 재물에는 유리하나 이성으로 인한 곤란과 마땅한 비난을 받음.",
      Mercury: "내성적이고 의심 많으며 시기심이 있음. 두드러진 공직에 오르고 이득에 유리하나 가정사에는 나쁨.",
      Venus: "슬픔과 실망을 안기는 은밀한 연애, 쉽게 유혹에 빠짐, 여성의 반감.",
      Mars: "큰 야망과 높은 지위에 오르나 반전(추락)의 위험, 가정불화.",
      Jupiter: "위선과 부정직. 법조·종교계 고위직에 오르나 반전의 위험, 가정불화.",
      Saturn: "우울하고 은둔하는 학구파. 인색하게 부를 쌓음. 별거·이혼의 위험, 장수.",
    },
  },
  {
    name: "Deneb Algedi",
    longitude: 323.55,
    latitude: -2.6,
    magnitude: 3,
    nature: "Saturn/Jupiter (심판·양면)",
    meaning:
      "염소자리 꼬리의 별, '염소의 심판점'. 은혜와 파괴, 슬픔과 기쁨, 삶과 죽음이 함께 깃든 양면적 기운. 정의롭게 처신하면 심판이 순조롭지만 그르치면 몰락으로 이어짐.",
    combinations: {
      Sun: "거짓 친구로 인한 손실. 높은 지위에 오르나 끝내 불명예와 파멸.",
      Moon: "모든 일에 큰 어려움. 끈기 있게 밀어붙여 성공하나 결국 잃음.",
      Mercury: "우울하고 조용하며 고독하고 단정치 못함. 자연과 과학을 탐구하는 학도.",
      Venus: "결코 이뤄지지 않는 은밀한 욕망, 가정·가족 문제.",
      Mars: "적과 사고의 위험, 명예와 승진을 얻으나 잦은 다툼.",
      Jupiter: "은밀한 소망에 대한 실망, 거짓 친구, 법으로 인한 손실.",
      Saturn: "동물과 독을 지닌 파충류를 다루는 큰 힘, 학문에는 무관심.",
    },
  },
  {
    name: "Fomalhaut",
    longitude: 333.87,
    latitude: -21.13,
    magnitude: 1.16,
    nature: "Venus/Mercury (명예·영적변모)",
    meaning:
      "남쪽물고기자리의 별. 행운과 권력, 명성, 그리고 영적 변모의 기운. 다만 은밀한 일과 악의, 바다와 얽힌 위험이 함께 있어 마음이 타락하면 재앙으로 기울 수 있음.",
    combinations: {
      Sun: "방탕. 상속을 통한 이득. 독을 지닌 생물의 위험.",
      Moon: "많은 곤란과 반목을 부르는 은밀한 사업.",
      Mercury: "많은 손실과 실망, 사업에서의 불운.",
      Venus: "은밀하고 격정적인 연애와 실망.",
      Mars: "악의적이고 격정적이며 복수심이 강함, 많은 은밀한 적.",
      Jupiter: "동정심 많고 자애로움, 교회나 프리메이슨에서의 명예.",
      Saturn: "사고, 폐·목·발을 침범하는 질환.",
    },
  },
  {
    name: "Deneb Adige",
    longitude: 335.33,
    latitude: 59.9,
    magnitude: 1.25,
    nature: "Venus/Mercury (재기·명민)",
    meaning:
      "백조자리의 별. 재기 넘치고 명민한 지성, 예술과 과학의 재능을 상징함. 예술·과학·저술을 통해 이득을 얻는 기운.",
    combinations: {
      Sun: "태양·화성이 함께하고 달이 프로키온과 함께하는 배치에서는 격렬한 죽음, 예컨대 광견에 물려 죽을 위험.",
    },
  },
  {
    name: "Skat",
    longitude: 338.87,
    latitude: -8.18,
    magnitude: 3.5,
    nature: "Saturn/Jupiter (행운·안전)",
    meaning:
      "물병자리의 별. 행운과 오래가는 행복, 큰 물난리 속에서도 지켜지는 안전의 기운. 위기 속에서 보호받는 안정감을 상징함.",
    combinations: {
      Sun: "예민하고 감성적이며 영적임. 영매 능력으로 비판을 받으나 친구의 지지를 얻음.",
      Moon: "영향력 있는 친구와 단체와의 인연, 공적 지위, 값진 선물.",
      Mercury: "기이한 사건, 신비주의에 대한 관심, 영적 기질, 많은 친구.",
      Venus: "심령·신비주의에 대한 관심, 이성과의 우정, 이득에 유리함.",
      Mars: "정력적인 출세, 기계 분야의 발견과 재능.",
      Jupiter: "철학·신비·종교적 성향, 사교적 성공, 프리메이슨에서의 두각.",
      Saturn: "이성으로 인한 곤란, 여행과 모험, 이른 결혼의 문제, 쇠약해지는 건강.",
    },
  },
  {
    name: "Markab",
    longitude: 353.48,
    latitude: 19.4,
    magnitude: 2.6,
    nature: "Mars/Mercury (명예·격정)",
    meaning:
      "페가수스자리의 별. 명예와 부, 행운을 주는 기운. 그러나 열병·베임·구타·찔림·화재와 격렬한 죽음의 위험이 도사림.",
    combinations: {
      Sun: "정력적이나 불운함. 오래가지 못하는 무공, 좌절된 야망, 사고와 질병.",
      Moon: "적과 가정사로 인한 상해, 건강은 그런대로 좋으나 사고가 잦음.",
      Mercury: "좋은 지성, 다혈질에 고집스럽고 말이 빠름, 능란함, 유능한 필자이나 비판받음.",
      Venus: "나쁜 무리와 어울림, 음주와 그 밖의 방종.",
      Mars: "다투기 좋아하고 폭력적, 언변·저술 관련 일에서 많은 곤란과 손실.",
      Jupiter: "법적 문제로 인한 곤란과 손실, 판결이나 추방의 위험.",
      Saturn: "가난·감옥·요양원에서 태어남, 고단한 삶, 범죄로 인한 투옥, 적은 친구.",
    },
  },
  {
    name: "Scheat",
    longitude: 359.37,
    latitude: 31.13,
    magnitude: 2.6,
    nature: "Mars/Mercury (익사·불운)",
    meaning:
      "페가수스자리의 별. 극심한 불운, 익사와 자살, 살해와 사고의 위험이 서린 기운. 특히 물과 얽힌 재난을 경계해야 함.",
    combinations: {
      Sun: "물과 기계로 인한 위험, 사고나 익사의 우려.",
      Moon: "근심, 비판으로 친구를 얻고 잃음, 사고와 물로 인한 위험.",
      Mercury: "특히 물로 인한 사고와 아슬아슬한 위기가 잦음, 많은 적, 글로 인한 곤란.",
      Venus: "나쁜 환경, 스스로의 행위로 인한 고통, 투옥·구속의 위험.",
      Mars: "잦은 사고, 본인과 친척의 질병.",
      Jupiter: "잦은 항해, 법·친구·친척으로 인한 손실, 투옥의 위험.",
      Saturn: "유아기 사망의 위험, 가정 문제, 감기와 폐병, 익사나 사고로 인한 죽음.",
    },
  },
];

/**
 * 등급별 트랜짓 회합 orb (책 기준):
 * - 1~2등성: 접근 40분(40/60°) / 분리 30분(30/60°)
 * - 3등성 이하(mag>2): 접근 30분(30/60°) / 분리 20분(20/60°)
 */
export function getStarTransitOrbs(magnitude: number): {
  applyingDeg: number;
  separatingDeg: number;
} {
  return magnitude <= 2
    ? { applyingDeg: 40 / 60, separatingDeg: 30 / 60 }
    : { applyingDeg: 30 / 60, separatingDeg: 20 / 60 };
}
/** 네이탈 회합 orb(방향 구분 없음): 1~2등성 40분, 3등성 이하 30분 */
export function getStarNatalOrbDeg(magnitude: number): number {
  return magnitude <= 2 ? 40 / 60 : 30 / 60;
}

/** 하위 호환용 기본 상수 (등급 미상 시 폴백) */
export const STAR_TRANSIT_ORB_APPLYING_DEG = 40 / 60;
export const STAR_TRANSIT_ORB_SEPARATING_DEG = 30 / 60;
export const STAR_NATAL_ORB_DEG = 40 / 60;

/** 세차운동: (BirthYear - 2000) * PRECESSION_PER_YEAR → 항성 현재 황경 보정 */
export const PRECESSION_PER_YEAR = 0.013969;

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
 * - 회합 Orb: 접근 40분(40/60°) 이내
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
      if (dist > getStarNatalOrbDeg(star.magnitude)) continue;

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
 * - 접근(Applying): 0.67도 이내 / 분리(Separating): 0.33도 이내
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

  const { applyingDeg, separatingDeg } = getStarTransitOrbs(star.magnitude);
  let matched = false;
  if (applying && distance <= applyingDeg) {
    matched = true;
  } else if (separating && distance <= separatingDeg) {
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

// ========== 연주(Lord of the Year) – 항성 회합 (현재 시점, 세차 적용) ==========

export interface LordStarConjunctionItem {
  starName: string;
  meaning: string;
  distance: number;
  phase: "접근 중" | "분리 중";
}

/**
 * 현재 시점에서 연주 행성(Profection Lord)이 트랜짓 상으로 어떤 항성과 회합하는지 계산.
 * 항성 황경에 세차를 적용한 뒤(현재 연도 기준) 회합 여부를 판별합니다.
 *
 * @param lordLongitude - 연주 행성의 현재 황경 (도)
 * @param lordSpeed - 연주 행성의 속도 (deg/일, 역행 시 음수)
 * @param lordName - 연주 행성 표기명 (Sun | Moon | ... )
 * @param currentYear - 현재 연도 (세차 보정용)
 * @returns 회합하는 항성 목록 (없으면 빈 배열)
 */
export function getLordOfYearFixedStarConjunctions(
  lordLongitude: number,
  lordSpeed: number,
  lordName: string,
  currentYear: number
): LordStarConjunctionItem[] {
  const precession = (currentYear - 2000) * PRECESSION_PER_YEAR;
  const results: LordStarConjunctionItem[] = [];

  for (const star of FIXED_STARS) {
    const adjustedLongitude = normalizeDegrees(star.longitude + precession);
    const starAdjusted: FixedStar = { ...star, longitude: adjustedLongitude };

    const result = checkStarTransit(
      lordLongitude,
      lordSpeed,
      starAdjusted,
      lordName as PlanetKey
    );

    if (result.matched && result.description) {
      const effectText =
        star.combinations?.[lordName as PlanetKey] ?? star.meaning;
      results.push({
        starName: star.name,
        meaning: effectText,
        distance: result.distance,
        phase: result.applying ? "접근 중" : "분리 중",
      });
    }
  }

  return results;
}

/**
 * 연주–항성 회합 목록을 Gemini 프롬프트용 문자열로 포맷.
 */
export function formatLordStarConjunctionsForPrompt(
  lordName: string,
  conjunctions: LordStarConjunctionItem[]
): string {
  if (conjunctions.length === 0) {
    return `[연주 행성–항성 회합 (현재)]
현재 연주 행성(${lordName})은 유의미한 항성 회합 범위(등급별 접근 40'/30' · 분리 30'/20' 이내)에 없습니다.`;
  }

  const lines = [
    "[연주 행성–항성 회합 (현재)]",
    "세차 적용한 현재 시점 기준, 연주의 주인(Lord of the Year)이 트랜짓 상으로 다음 항성과 회합하고 있습니다. 해석 시 반드시 반영하세요.",
    "",
    ...conjunctions.map(
      (c, i) =>
        `${i + 1}. ${c.starName} (${c.phase}, 거리 ${c.distance.toFixed(2)}°)\n   효과: ${c.meaning}`
    ),
  ];
  return lines.join("\n");
}
