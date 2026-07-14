// 기질(Temperament / 한열조습 humor) 산출.
// 고전 기질 판별은 유파마다 가중이 다르나(달 위상·계절·상승궁·행성 분포 합산이 공통),
// 여기서는 그 네 요소를 동일 가중으로 합산하는 방어적 휴리스틱을 사용한다.
// 결과는 LLM 해석의 근거(한열조습 우세)로만 쓰이며, 절대적 진단이 아니다.

import { SIGN_ELEMENT } from "./dignityCalculator.ts";

type Quality = { hot?: number; cold?: number; wet?: number; dry?: number };

const ELEMENT_QUALITY: Record<string, Quality> = {
  Fire: { hot: 1, dry: 1 },
  Earth: { cold: 1, dry: 1 },
  Air: { hot: 1, wet: 1 },
  Water: { cold: 1, wet: 1 },
};

export interface TemperamentResult {
  hot: number;
  cold: number;
  wet: number;
  dry: number;
  label: string;
  summary: string;
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;

/**
 * @param planets 차트 planets (각 행성의 sign 필요)
 * @param ascendantSign 상승궁 사인명
 * @param moonLon 달 황경
 * @param sunLon 태양 황경
 */
export function computeTemperament(
  planets: Record<string, { sign?: string } | undefined>,
  ascendantSign: string,
  moonLon: number,
  sunLon: number,
): TemperamentResult {
  let hot = 0,
    cold = 0,
    wet = 0,
    dry = 0;
  const addQ = (q?: Quality) => {
    if (!q) return;
    hot += q.hot ?? 0;
    cold += q.cold ?? 0;
    wet += q.wet ?? 0;
    dry += q.dry ?? 0;
  };

  // 1. 달 위상 (태양 대비 이각): 신월~상현=냉습, 상현~만월=열습, 만월~하현=열건, 하현~신월=냉건
  const elong = norm360(moonLon - sunLon);
  if (elong < 90) addQ({ cold: 1, wet: 1 });
  else if (elong < 180) addQ({ hot: 1, wet: 1 });
  else if (elong < 270) addQ({ hot: 1, dry: 1 });
  else addQ({ cold: 1, dry: 1 });

  // 2. 계절 (태양 열대 위치): 봄=열습, 여름=열건, 가을=냉건, 겨울=냉습
  const sunPos = norm360(sunLon);
  if (sunPos < 90) addQ({ hot: 1, wet: 1 });
  else if (sunPos < 180) addQ({ hot: 1, dry: 1 });
  else if (sunPos < 270) addQ({ cold: 1, dry: 1 });
  else addQ({ cold: 1, wet: 1 });

  // 3. 상승궁 원소
  addQ(ELEMENT_QUALITY[SIGN_ELEMENT[ascendantSign?.trim()]]);

  // 4. 7행성 사인 원소 분포
  for (const key of [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
  ]) {
    const sign = planets[key]?.sign;
    if (sign) addQ(ELEMENT_QUALITY[SIGN_ELEMENT[sign]]);
  }

  const thermal = hot >= cold ? "hot" : "cold";
  const moisture = wet >= dry ? "wet" : "dry";
  const label =
    thermal === "hot" && moisture === "dry"
      ? "담즙질(황담즙·뜨겁고 건조)"
      : thermal === "hot" && moisture === "wet"
        ? "다혈질(뜨겁고 습함)"
        : thermal === "cold" && moisture === "wet"
          ? "점액질(차갑고 습함)"
          : "우울질(흑담즙·차갑고 건조)";
  const summary = `열 ${hot} / 한 ${cold}, 습 ${wet} / 건 ${dry} → 우세 기질: ${label}`;
  return { hot, cold, wet, dry, label, summary };
}
