/**
 * English Chart Formatter
 * Same public API as chartFormatter.ts — all section headers and labels are in English.
 * Pure math/logic is shared via import from astrologyCalculator / advancedAstrology.
 */

import type {
  ChartData,
  Aspect,
  ProfectionData,
  SolarReturnOverlay,
  FirdariaResult,
  InteractionResult,
  ProgressionResult,
  DailyFlowSummary,
  DailyAngleStrike,
  LordProfectionAngleEntry,
  TransitNatalPlacement,
} from "../types.ts";
import {
  getSignFromLongitude,
  getSignRuler,
  normalizeDegrees,
  calculateAngleDifference,
  type CareerAnalysisResult,
  type WealthAnalysisResult,
  type PrimaryDirectionHit,
  type ProgressedEventItem,
  type ProfectionTimelineItem,
  analyzeHealthPotential,
  OUTER_PLANET_KEYWORDS,
} from "./astrologyCalculator.ts";
import { SIGNS } from "./astrologyCalculator.ts";
import {
  analyzeNatalFixedStars,
  formatNatalFixedStarsForPrompt,
} from "./advancedAstrology.ts";
import {
  getSignDisplay,
  formatPlanetHouseWsQs,
  buildSynastryMoonDispositorSection,
} from "./chartFormatter.ts";

// ─── Re-export language-neutral types & shared formatters ────────────────────

export type { LoveAnalysisData } from "./chartFormatter.ts";
export type {
  TimeLordRetrogradeAlert,
  LordOfYearTransitStatus,
  CategorySignificatorsResult,
} from "./chartFormatter.ts";
export { getSignDisplay, formatPlanetHouseWsQs, buildSynastryMoonDispositorSection };

// ─── Private helpers (English labels) ───────────────────────────────────────

const SIGN_KEYWORDS: Record<string, string> = {
  Aries: "direct, driven, impulsive, leadership energy",
  Taurus: "stability-seeking, sensory, stubborn, deliberate",
  Gemini: "versatile, curious, communicative, inconsistent",
  Cancer: "emotional, protective, defensive, home-oriented",
  Leo: "dramatic, confident, center-stage, generous",
  Virgo: "analytical, dedicated, perfectionist, critical",
  Libra: "sociable, harmonious, indecisive, refined",
  Scorpio: "intense, perceptive, obsessive, secretive",
  Sagittarius: "free-spirited, philosophical, optimistic, blunt",
  Capricorn: "ambitious, responsible, conservative, realistic, hierarchical",
  Aquarius: "original, independent, rational, rebellious, idealistic",
  Pisces: "dreamy, artistic, self-sacrificing, boundary-fluid",
};

function getSignCharacter(signName: string): string {
  const key = Object.keys(SIGN_KEYWORDS).find((k) => signName.includes(k));
  return key ? SIGN_KEYWORDS[key] : "";
}

function getSignDisplayLocal(longitude: number): string {
  const SIGNS_LOCAL = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
  ];
  const normalized = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  const degreeInSign = normalized % 30;
  return `${SIGNS_LOCAL[signIndex]} ${degreeInSign.toFixed(1)}°`;
}

function ordinalHouse(house: number): string {
  const ordinals = [
    "1st", "2nd", "3rd", "4th", "5th", "6th",
    "7th", "8th", "9th", "10th", "11th", "12th",
  ];
  return ordinals[house - 1] ?? `${house}th`;
}

function formatBirthDate(birthDate: string): string {
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return birthDate;
  const [, y, m, d, h, min] = match;
  return `${y}-${m}-${d} ${parseInt(h!, 10)}:${String(parseInt(min!, 10)).padStart(2, "0")}`;
}

function formatCurrentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTargetDateToEn(targetDateYmd: string): string {
  const match = String(targetDateYmd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(targetDateYmd || "").trim() || "(date not specified)";
  const [, y, m, d] = match;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function getSeventhHouseRuler(ascendantLongitude: number): string {
  const seventhCuspLong = (ascendantLongitude + 180) % 360;
  return getSignRuler(getSignFromLongitude(seventhCuspLong).sign);
}

function getHouseRuler(ascendantLongitude: number, houseNum: number): string {
  const cuspLong = (ascendantLongitude + (houseNum - 1) * 30 + 360) % 360;
  return getSignRuler(getSignFromLongitude(cuspLong).sign);
}

function getRulerOf11thFromPof(chartData: ChartData): string {
  const pofSign = chartData.fortuna?.sign ?? getSignFromLongitude(chartData.fortuna?.degree ?? 0).sign;
  const idx = SIGNS.indexOf(pofSign);
  if (idx < 0) return "Jupiter";
  return getSignRuler(SIGNS[(idx + 10) % 12]);
}

function getRulerOfPof(chartData: ChartData): string {
  const pofSign =
    chartData.fortuna?.sign ??
    getSignFromLongitude(chartData.fortuna?.degree ?? 0).sign;
  return getSignRuler(pofSign);
}

function formatNatalPlanets(
  chartData: ChartData,
  options?: { getSignCharacter?: (sign: string) => string },
): string {
  const order = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
  const planets = chartData.planets ?? {};
  const getSignChar = options?.getSignCharacter;
  const lines: string[] = [];
  for (const key of order) {
    const p = planets[key];
    if (!p) continue;
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    const charSuffix =
      getSignChar && (key === "sun" || key === "moon")
        ? ` (Character: ${getSignChar(p.sign)})`
        : "";
    lines.push(`- ${name}: ${p.sign} (${formatPlanetHouseWsQs(p)})${charSuffix}`);
  }
  return lines.join("\n");
}

function formatScoreBreakdown(breakdown: {
  sect: number;
  essentialDignity: number;
  bonification: number;
  maltreatment: number;
}): string[] {
  const parts: string[] = [];
  if (breakdown.sect > 0) parts.push("Gained Sect");
  if (breakdown.essentialDignity > 0) parts.push("Essential Dignity (Domicile/Exaltation)");
  if (breakdown.bonification > 0) parts.push("Bonified by Ruler");
  if (breakdown.maltreatment < 0)
    parts.push(
      breakdown.maltreatment === -2
        ? "Maltreated by Malefic (mitigated by Sect)"
        : "Maltreated by Malefic",
    );
  return parts;
}

function analyzeOuterPlanetAspectsEn(
  natalData: ChartData,
  transitData: ChartData,
  lordOfTheYear?: string,
): string {
  const outerPlanets = ["uranus", "neptune", "pluto"];
  const sections: string[] = [];

  for (const outerKey of outerPlanets) {
    const outerPlanetData = natalData.planets[outerKey as keyof typeof natalData.planets];
    if (!outerPlanetData) continue;

    const outerName = outerKey.charAt(0).toUpperCase() + outerKey.slice(1);
    const keyword = OUTER_PLANET_KEYWORDS[outerName] || "";

    const natalAspects: string[] = [];
    const transitAspects: string[] = [];

    const innerPlanets = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];
    for (const innerKey of innerPlanets) {
      const innerPlanet = natalData.planets[innerKey as keyof typeof natalData.planets];
      if (!innerPlanet) continue;

      const angleDiff = calculateAngleDifference(outerPlanetData.degree, innerPlanet.degree);

      if (angleDiff <= 6)
        natalAspects.push(`Natal ${outerName} Conjunction Natal ${innerKey.toUpperCase()} (orb ${angleDiff.toFixed(1)}°)`);
      else if (Math.abs(angleDiff - 180) <= 6)
        natalAspects.push(`Natal ${outerName} Opposition Natal ${innerKey.toUpperCase()} (orb ${Math.abs(angleDiff - 180).toFixed(1)}°)`);
      else if (Math.abs(angleDiff - 90) <= 6)
        natalAspects.push(`Natal ${outerName} Square Natal ${innerKey.toUpperCase()} (orb ${Math.abs(angleDiff - 90).toFixed(1)}°)`);
      else if (Math.abs(angleDiff - 120) <= 4)
        natalAspects.push(`Natal ${outerName} Trine Natal ${innerKey.toUpperCase()} (orb ${Math.abs(angleDiff - 120).toFixed(1)}°)`);
      else if (Math.abs(angleDiff - 60) <= 4)
        natalAspects.push(`Natal ${outerName} Sextile Natal ${innerKey.toUpperCase()} (orb ${Math.abs(angleDiff - 60).toFixed(1)}°)`);
    }

    const transitOuter = transitData.planets[outerKey as keyof typeof transitData.planets];
    if (transitOuter && lordOfTheYear) {
      const lordKey = lordOfTheYear.toLowerCase();
      const lordPlanet = transitData.planets[lordKey as keyof typeof transitData.planets];
      if (lordPlanet) {
        const angleDiff = calculateAngleDifference(transitOuter.degree, lordPlanet.degree);
        if (angleDiff <= 6)
          transitAspects.push(`Transit ${outerName} Conjunction Transit ${lordOfTheYear} (Lord of the Year) (orb ${angleDiff.toFixed(1)}°)`);
        else if (Math.abs(angleDiff - 180) <= 6)
          transitAspects.push(`Transit ${outerName} Opposition Transit ${lordOfTheYear} (Lord of the Year) (orb ${Math.abs(angleDiff - 180).toFixed(1)}°)`);
        else if (Math.abs(angleDiff - 90) <= 6)
          transitAspects.push(`Transit ${outerName} Square Transit ${lordOfTheYear} (Lord of the Year) (orb ${Math.abs(angleDiff - 90).toFixed(1)}°)`);
        else if (Math.abs(angleDiff - 120) <= 4)
          transitAspects.push(`Transit ${outerName} Trine Transit ${lordOfTheYear} (Lord of the Year) (orb ${Math.abs(angleDiff - 120).toFixed(1)}°)`);
        else if (Math.abs(angleDiff - 60) <= 4)
          transitAspects.push(`Transit ${outerName} Sextile Transit ${lordOfTheYear} (Lord of the Year) (orb ${Math.abs(angleDiff - 60).toFixed(1)}°)`);
      }
    }

    if (natalAspects.length > 0 || transitAspects.length > 0) {
      let section = `\n${outerName} (${keyword}):\n`;
      section += `  Position: ${outerPlanetData.sign} ${outerPlanetData.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(outerPlanetData)})\n`;
      if (natalAspects.length > 0) {
        section += `  Natal Aspects:\n`;
        natalAspects.forEach((a) => (section += `    - ${a}\n`));
      }
      if (transitAspects.length > 0) {
        section += `  Transit Aspects (Today):\n`;
        transitAspects.forEach((a) => (section += `    - ${a}\n`));
      }
      sections.push(section);
    }
  }

  if (sections.length === 0) return "";

  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Outer Planet Analysis — Uranus, Neptune, Pluto]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Outer planets generally carry challenging energy: sudden disruption, clouded judgment, and macro-scale upheaval.
${sections.join("\n")}
💡 Interpretation Hint: When outer planets aspect natal planets or transit the time-lord planet, their keyword energy intensifies. Square and Opposition amplify the malefic influence.`;
}

function formatNatalQsReferenceBlockEn(natalData: ChartData): string {
  const sun = natalData.planets?.sun;
  const moon = natalData.planets?.moon;
  const fo = natalData.fortuna;
  const lines: string[] = [];
  if (sun) {
    lines.push(
      `  - SUN: ${sun.sign} ${sun.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(sun)})`,
    );
  }
  if (moon) {
    lines.push(
      `  - MOON: ${moon.sign} ${moon.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(moon)})`,
    );
  }
  if (fo) {
    lines.push(
      `  - Part of Fortune: ${fo.sign} ${fo.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(fo)})`,
    );
  }
  if (lines.length === 0) return "";
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Natal reference — Luminaries & Part of Fortune (WS / Alcabitius QS)]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${lines.join("\n")}
Weight interpretations using the Quadrant Strength (QS) rules in the system prompt.
`.trim();
}

function formatDailyTransitNatalOverlayEn(
  moonPl: TransitNatalPlacement | null | undefined,
  lordName: string | null | undefined,
  lordPl: TransitNatalPlacement | null | undefined,
  fallbackWsMoon: number | undefined,
): string {
  const lines: string[] = [];
  if (moonPl) {
    lines.push(
      `Transit Moon is passing through your natal WS ${moonPl.wsHouse}H / QS ${moonPl.qsHouse}H (${moonPl.qsStrength}).`,
    );
  } else if (fallbackWsMoon != null) {
    lines.push(
      `Transit Moon: use Natal Whole Sign ${ordinalHouse(fallbackWsMoon)} House as reference (QS detail unavailable without full placement).`,
    );
  }
  if (lordName && lordPl) {
    lines.push(
      `Transit ${lordName} (Lord of the Year) in your natal chart: WS ${lordPl.wsHouse}H / QS ${lordPl.qsHouse}H (${lordPl.qsStrength}).`,
    );
  }
  return lines.join("\n");
}

// ─── Public API (English output) ─────────────────────────────────────────────

export type LordOfYearTransitStatusLocal = {
  isRetrograde: boolean;
  isDayChart: boolean;
  sectStatus: "day_sect" | "night_sect" | "neutral";
  isInSect: boolean;
};

export function formatLordOfYearTransitSectionForPrompt(
  lordTransitStatus?: LordOfYearTransitStatusLocal | null,
  lordTransitAspects?: Array<{ description: string }> | null,
): string {
  const hasStatus = lordTransitStatus != null;
  const hasAspects = lordTransitAspects != null && lordTransitAspects.length > 0;
  if (!hasStatus && !hasAspects) return "";

  const lines: string[] = [
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "[Time Lord Transit Status & Aspects]",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "Current transit status of the Time Lord (Lord of the Year):",
  ];
  if (lordTransitStatus) {
    lines.push(`- Retrograde: ${lordTransitStatus.isRetrograde ? "Retrograde" : "Direct"}`);
  }
  if (hasAspects && lordTransitAspects) {
    lines.push("");
    lines.push("Aspects the Time Lord makes in the current transit chart (incorporate into interpretation):");
    lordTransitAspects.forEach((a, i) => {
      lines.push(`  ${i + 1}. ${a.description}`);
    });
  }
  return lines.join("\n");
}

export function formatSolarReturnBlockForPrompt(
  srChartData: ChartData,
  overlay: SolarReturnOverlay | null | undefined,
  aspects: Array<{ description: string }> | null | undefined,
  label?: string,
): string {
  const lines: string[] = [];
  const title = label ? `[${label} Solar Return Chart]` : "[Solar Return Chart]";
  lines.push(title);
  lines.push(`Solar Return Time: ${srChartData.date}`);
  lines.push(`Location: Lat ${srChartData.location.lat}, Lon ${srChartData.location.lng}`);
  const srAscDisplay = getSignDisplayLocal(srChartData.houses.angles.ascendant);
  lines.push(`Solar Return Ascendant: ${srAscDisplay}`);
  lines.push("");
  lines.push("Planets:");
  const srPlanets = Object.entries(srChartData.planets)
    .map(([name, planet]) =>
      `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet, { sr: true })})`,
    )
    .join("\n");
  lines.push(srPlanets);

  if (overlay) {
    lines.push("");
    lines.push("[Solar Return Overlay — SR Planets in Natal Houses]");
    lines.push(`Solar Return Ascendant falls in Natal House ${overlay.solarReturnAscendantInNatalHouse}.`);
    lines.push("SR planet placements in Natal chart houses:");
    lines.push(`  - SR Sun is in Natal House ${overlay.planetsInNatalHouses.sun}`);
    lines.push(`  - SR Moon is in Natal House ${overlay.planetsInNatalHouses.moon}`);
    lines.push(`  - SR Mercury is in Natal House ${overlay.planetsInNatalHouses.mercury}`);
    lines.push(`  - SR Venus is in Natal House ${overlay.planetsInNatalHouses.venus}`);
    lines.push(`  - SR Mars is in Natal House ${overlay.planetsInNatalHouses.mars}`);
    lines.push(`  - SR Jupiter is in Natal House ${overlay.planetsInNatalHouses.jupiter}`);
    lines.push(`  - SR Saturn is in Natal House ${overlay.planetsInNatalHouses.saturn}`);
    lines.push("");
    lines.push("💡 Hint: Whichever Natal house an SR planet falls in, that life domain is amplified for the year.");
  }

  if (aspects && aspects.length > 0) {
    lines.push("");
    lines.push("[Solar Return Chart Aspects — Key SR Planet Aspects]");
    aspects.forEach((a) => lines.push(`  - ${a.description}`));
  }

  return lines.join("\n");
}

export function generateDailyUserPrompt(
  natalData: ChartData,
  targetDateYmdKst: string,
  profectionData: ProfectionData | null,
  flowAM: DailyFlowSummary,
  flowPM: DailyFlowSummary,
  angleStrikes: DailyAngleStrike[],
  neo4jContext: string | null,
  lordProfectionAngleEntry: LordProfectionAngleEntry | null,
  timeLordRetrogradeAlert: { planet: string; isRetrograde: boolean } | null,
  lordTransitStatus: LordOfYearTransitStatusLocal | null,
  lordStarConjunctionsText: string | null,
  transitMoonHouse: number | undefined,
  transitMoonNatalPlacement?: TransitNatalPlacement | null,
  transitLordNatalPlacement?: TransitNatalPlacement | null,
): string {
  const targetDateEn = formatTargetDateToEn(targetDateYmdKst);
  const natalAscSign = getSignDisplayLocal(natalData.houses.angles.ascendant);

  const section1 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1. Client Info & Profection Summary]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target Date: ${targetDateEn}
Birth Time: ${natalData.date}
Birth Location: Lat ${natalData.location.lat}, Lon ${natalData.location.lng}
Ascendant: ${natalAscSign}
${profectionData ? `Age: ${profectionData.age} | Profection House: ${profectionData.profectionHouse} | Profection Sign: ${profectionData.profectionSign} | Lord of the Year: ${profectionData.lordOfTheYear}` : ""}
${formatDailyTransitNatalOverlayEn(
    transitMoonNatalPlacement,
    profectionData?.lordOfTheYear,
    transitLordNatalPlacement,
    transitMoonHouse,
  )}
${lordProfectionAngleEntry ? `⚠️ ${lordProfectionAngleEntry.message} (Time Lord entering Profection Angle House ${lordProfectionAngleEntry.house})` : ""}
${timeLordRetrogradeAlert?.isRetrograde ? `[CRITICAL WARNING] Time Lord ${timeLordRetrogradeAlert.planet} is Retrograde — Critical Inflection Point` : ""}
${lordTransitStatus ? `Time Lord Transit Status: ${lordTransitStatus.isRetrograde ? "Retrograde" : "Direct"} | Sect: ${lordTransitStatus.sectStatus} | In Sect: ${lordTransitStatus.isInSect}` : ""}
${lordStarConjunctionsText ? "\n" + lordStarConjunctionsText : ""}
`.trim();

  const formatLordAspects = (items: DailyFlowSummary["lordAspects"]) =>
    items.length === 0
      ? "  (None)"
      : items.map((a, i) => `  ${i + 1}. ${a.description}`).join("\n");

  const section2 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2. Morning Astrological Flow]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(${targetDateEn} at 06:00 Local Time)
Time Lord Retrograde: ${flowAM.lordRetrograde ? "Retrograde" : "Direct"}
Time Lord Transit Aspects (Transit-to-Transit, applying/separating orb filter passed):
${formatLordAspects(flowAM.lordAspects)}
`.trim();

  const section3 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3. Afternoon Astrological Flow]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(${targetDateEn} at 18:00 Local Time)
Time Lord Retrograde: ${flowPM.lordRetrograde ? "Retrograde" : "Direct"}
Time Lord Transit Aspects (Transit-to-Transit, applying/separating orb filter passed):
${formatLordAspects(flowPM.lordAspects)}
`.trim();

  const section4 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4. Key Sensitive Point Strikes]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Targets: Natal Sun, Moon, Ascendant, Part of Fortune. Orb within 2°, Conjunction/Sextile/Square/Opposition only.
${angleStrikes.length === 0 ? `  (No strikes on ${targetDateEn})` : angleStrikes.map((s, i) => `${i + 1}. ${s.description}${s.neo4jMetaTag ? "\n   " + s.neo4jMetaTag : ""}`).join("\n")}
`.trim();

  const hasReceptionRejection = angleStrikes.some((s) => s.neo4jMetaTag);
  const section5 = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5. Reception / Rejection Analysis]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hasReceptionRejection ? angleStrikes.filter((s) => s.neo4jMetaTag).map((s) => `${s.striker} → Natal ${s.target} (${s.targetSign}): ${s.neo4jMetaTag}`).join("\n") : "No qualifying sensitive point strikes, or no dignity lookup results available."}
${neo4jContext ? "\n\n[Natal Chart Dignity / Sect / Hayz Context]\n" + neo4jContext : ""}
`.trim();

  const natalQsRef = formatNatalQsReferenceBlockEn(natalData);

  return [
    `Data for Selected-Date Fortune Analysis. (Classical Astrology: AM/PM split, applying/separating orbs, sensitive point strikes, reception/rejection.)\nTarget Date: ${targetDateEn}`,
    section1,
    ...(natalQsRef ? [natalQsRef] : []),
    section2,
    section3,
    section4,
    section5,
    "",
    "Please analyze the fortune for the target date based on the data above.",
  ].join("\n\n");
}

export function generateYearlyUserPrompt(
  natalData: ChartData,
  solarReturnData: ChartData,
  profectionData: ProfectionData,
  solarReturnOverlay: SolarReturnOverlay,
): string {
  const natalPlanets = Object.entries(natalData.planets)
    .map(([name, planet]) =>
      `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet)})`,
    )
    .join("\n");

  const natalAscendant = natalData.houses.angles.ascendant;
  const natalMC = natalData.houses.angles.midheaven;
  const natalIC = normalizeDegrees(natalMC + 180);
  const natalDsc = normalizeDegrees(natalAscendant + 180);

  const solarReturnPlanets = Object.entries(solarReturnData.planets)
    .map(([name, planet]) =>
      `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet, { sr: true })})`,
    )
    .join("\n");

  const profectionInfo = `
Age: ${profectionData.age} (current age)
Activated House (Profection House): ${profectionData.profectionHouse}
Profection Sign: ${profectionData.profectionSign}
Lord of the Year: ${profectionData.lordOfTheYear}

💡 Hint: This year's central theme is the ${ordinalHouse(profectionData.profectionHouse)} house domain, governed by ${profectionData.lordOfTheYear}.
  `.trim();

  const overlayInfo = `
Solar Return Ascendant falls in Natal House ${solarReturnOverlay.solarReturnAscendantInNatalHouse}.

SR Planet Placements in Natal Houses:
  - SR Sun is in Natal House ${solarReturnOverlay.planetsInNatalHouses.sun}
  - SR Moon is in Natal House ${solarReturnOverlay.planetsInNatalHouses.moon}
  - SR Mercury is in Natal House ${solarReturnOverlay.planetsInNatalHouses.mercury}
  - SR Venus is in Natal House ${solarReturnOverlay.planetsInNatalHouses.venus}
  - SR Mars is in Natal House ${solarReturnOverlay.planetsInNatalHouses.mars}
  - SR Jupiter is in Natal House ${solarReturnOverlay.planetsInNatalHouses.jupiter}
  - SR Saturn is in Natal House ${solarReturnOverlay.planetsInNatalHouses.saturn}

💡 Hint: Whichever Natal house an SR planet lands in, that life domain is highlighted for the year.
  `.trim();

  return `
Annual Fortune — Analysis Data

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Natal Chart]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Birth Time: ${natalData.date}
Birth Location: Lat ${natalData.location.lat}, Lon ${natalData.location.lng}

Angles:
  Ascendant: ${getSignDisplayLocal(natalAscendant)}
  MC (Midheaven): ${getSignDisplayLocal(natalMC)}
  IC (Imum Coeli): ${getSignDisplayLocal(natalIC)}
  Descendant: ${getSignDisplayLocal(natalDsc)}

Planets:
${natalPlanets}

Part of Fortune: ${natalData.fortuna.sign} ${natalData.fortuna.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(natalData.fortuna)})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Solar Return Chart]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Solar Return Time: ${solarReturnData.date}
Location: Lat ${solarReturnData.location.lat}, Lon ${solarReturnData.location.lng}

Solar Return Ascendant: ${getSignDisplayLocal(solarReturnData.houses.angles.ascendant)}

Planets:
${solarReturnPlanets}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Annual Profection]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${profectionInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Solar Return Overlay — SR Planets in Natal Houses]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${overlayInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please analyze the annual fortune based on the data above.

Key Analysis Points:
1. Profection House & Lord of the Year: Analyze the year's central theme and the governing planet's condition holistically.
2. Solar Return Ascendant: Which Natal house does the SR Asc fall in? Use this to read the year's psychological atmosphere.
3. Solar Return Sun: Which Natal house? → Core focus and goal area for the year.
4. Solar Return Overlay: How SR planets distribute across Natal houses → Changes and opportunities per life domain.
5. Lord of the Year condition: Check in both Natal and SR charts to gauge the overall fortune quality.
`.trim();
}

export function generateLifetimeUserPrompt(natalData: ChartData): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const birthDate = new Date(natalData.date);
  const birthYear = birthDate.getFullYear();
  const birthMonth = birthDate.getMonth() + 1;
  const birthDay = birthDate.getDate();

  const natalPlanets = Object.entries(natalData.planets)
    .map(([name, planet]) =>
      `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet)})`,
    )
    .join("\n");

  const natalAscendant = natalData.houses.angles.ascendant;
  const natalMC = natalData.houses.angles.midheaven;
  const natalIC = normalizeDegrees(natalMC + 180);
  const natalDsc = normalizeDegrees(natalAscendant + 180);

  return `
Life Overview — Analysis Data

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 Client Info]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date of Birth: ${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}
Birth Time: ${natalData.date}
Birth Location: Lat ${natalData.location.lat}, Lon ${natalData.location.lng}
Current Date: ${currentYear}-${String(currentMonth).padStart(2, "0")}

⚠️ Important: Use birth year (${birthYear}) to calculate exact current age. Convert all age references to real calendar years.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🌌 Natal Chart]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Angles:
  Ascendant: ${getSignDisplayLocal(natalAscendant)}
  MC (Midheaven): ${getSignDisplayLocal(natalMC)}
  IC (Imum Coeli): ${getSignDisplayLocal(natalIC)}
  Descendant: ${getSignDisplayLocal(natalDsc)}

Planets:
${natalPlanets}

Part of Fortune: ${natalData.fortuna.sign} ${natalData.fortuna.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(natalData.fortuna)})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please analyze the life overview based on the data above.
`.trim();
}

export function generateCompatibilityUserPrompt(
  natalData1: ChartData,
  natalData2: ChartData,
): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const birthDate1 = new Date(natalData1.date);
  const birthDate2 = new Date(natalData2.date);

  const natalPlanets1 = Object.entries(natalData1.planets)
    .map(([name, planet]) =>
      `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet)})`,
    )
    .join("\n");
  const natalPlanets2 = Object.entries(natalData2.planets)
    .map(([name, planet]) =>
      `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet)})`,
    )
    .join("\n");

  const asc1 = natalData1.houses.angles.ascendant;
  const mc1 = natalData1.houses.angles.midheaven;
  const asc2 = natalData2.houses.angles.ascendant;
  const mc2 = natalData2.houses.angles.midheaven;

  const stars1 = analyzeNatalFixedStars(natalData1, natalData1.date);
  const stars2 = analyzeNatalFixedStars(natalData2, natalData2.date);
  const block1 = formatNatalFixedStarsForPrompt(stars1);
  const block2 = formatNatalFixedStarsForPrompt(stars2);

  const deepSoulSection =
    stars1.length > 0 || stars2.length > 0
      ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DEEP SOUL CHARACTER ANALYSIS — Fixed Star Influences]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User 1 (You) — Fixed Star Temperament:
${block1}

User 2 (Them) — Fixed Star Temperament:
${block2}

Interpretation Guide: Do their stellar temperaments harmonize, or do both carry Royal Star (Regulus, etc.) energy that might clash head-to-head? Include this in the Synastry interpretation. Format: "User 1 is influenced by [Star], making them [Character]; User 2, shaped by [Star], tends toward [Character]..."
`
      : "";

  const moonDispositorSection = buildSynastryMoonDispositorSection(
    natalData1,
    natalData2,
    "en",
  );

  return `
Compatibility Analysis Data

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 User 1 (You) Info]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date of Birth: ${birthDate1.getFullYear()}-${String(birthDate1.getMonth() + 1).padStart(2, "0")}-${String(birthDate1.getDate()).padStart(2, "0")}
Birth Time: ${natalData1.date}
Birth Location: Lat ${natalData1.location.lat}, Lon ${natalData1.location.lng}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🌌 User 1 Natal Chart]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Angles: ASC ${getSignDisplayLocal(asc1)} | MC ${getSignDisplayLocal(mc1)} | IC ${getSignDisplayLocal(normalizeDegrees(mc1 + 180))} | DSC ${getSignDisplayLocal(normalizeDegrees(asc1 + 180))}

Planets:
${natalPlanets1}

Part of Fortune: ${natalData1.fortuna.sign} ${natalData1.fortuna.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(natalData1.fortuna)})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 User 2 (Them) Info]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date of Birth: ${birthDate2.getFullYear()}-${String(birthDate2.getMonth() + 1).padStart(2, "0")}-${String(birthDate2.getDate()).padStart(2, "0")}
Birth Time: ${natalData2.date}
Birth Location: Lat ${natalData2.location.lat}, Lon ${natalData2.location.lng}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🌌 User 2 Natal Chart]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Angles: ASC ${getSignDisplayLocal(asc2)} | MC ${getSignDisplayLocal(mc2)} | IC ${getSignDisplayLocal(normalizeDegrees(mc2 + 180))} | DSC ${getSignDisplayLocal(normalizeDegrees(asc2 + 180))}

Planets:
${natalPlanets2}

Part of Fortune: ${natalData2.fortuna.sign} ${natalData2.fortuna.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(natalData2.fortuna)})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📅 Analysis Date]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current Date: ${currentYear}-${String(currentMonth).padStart(2, "0")}
${moonDispositorSection}

${deepSoulSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please analyze the compatibility of these two people based on their chart data.
`.trim();
}

export interface CategorySignificatorsResult {
  primary: string[];
  secondary?: string[];
  houseLordsBlock?: string;
  timingFilterInstruction: string;
}

export function getCategorySignificators(
  chartData: ChartData,
  category: string,
  options?: {
    loveAnalysis?: import("./chartFormatter.ts").LoveAnalysisData | null;
    wealthAnalysis?: WealthAnalysisResult | null;
    careerAnalysis?: CareerAnalysisResult | null;
  },
): CategorySignificatorsResult {
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const cat = (category || "OTHER").trim().toUpperCase();
  const primarySet = new Set<string>();
  const secondarySet = new Set<string>();
  let houseLordsBlock: string | undefined;

  const addPrimary = (...names: string[]) => names.forEach((n) => n && primarySet.add(n));
  const addSecondary = (...names: string[]) => names.forEach((n) => n && secondarySet.add(n));

  if (cat === "LOVE" && options?.loveAnalysis) {
    const lord7 = getHouseRuler(asc, 7);
    const lotRuler = getSignRuler(options.loveAnalysis.lotOfMarriage.sign);
    addPrimary("Venus", lord7, "Moon", lotRuler);
    return {
      primary: [...primarySet],
      timingFilterInstruction: buildTimingFilterInstruction("LOVE", { primary: [...primarySet], secondary: undefined }),
    };
  }

  if (cat === "MONEY") {
    const lord2 = getHouseRuler(asc, 2);
    const lord8 = getHouseRuler(asc, 8);
    const pofRuler = getRulerOfPof(chartData);
    addPrimary("Jupiter", lord2, pofRuler, lord8);
    return {
      primary: [...primarySet],
      timingFilterInstruction: buildTimingFilterInstruction("MONEY", { primary: [...primarySet], secondary: undefined }),
    };
  }

  if (cat === "WORK") {
    const lord10 = getHouseRuler(asc, 10);
    const lord6 = getHouseRuler(asc, 6);
    addPrimary("Sun", "Mars", "MC", lord10, lord6);
    return {
      primary: [...primarySet],
      timingFilterInstruction: buildTimingFilterInstruction("WORK", { primary: [...primarySet], secondary: undefined }),
    };
  }

  if (cat === "EXAM") {
    const lord3 = getHouseRuler(asc, 3);
    const lord9 = getHouseRuler(asc, 9);
    const lord10 = getHouseRuler(asc, 10);
    addPrimary("Mercury", lord3, lord9, lord10, "Sun");
    addSecondary(lord10, "Sun");
    houseLordsBlock = [
      `Ruler of 3rd House (foundational learning): ${lord3}`,
      `Ruler of 9th House (higher education/university): ${lord9}`,
      `Ruler of 10th House (career/professional exam): ${lord10}`,
      "Mercury (academic/certification), Sun (career-oriented exams, weighted).",
    ].join("\n");
    return {
      primary: [...primarySet],
      secondary: [...secondarySet],
      houseLordsBlock,
      timingFilterInstruction: buildTimingFilterInstruction("EXAM", {
        primary: ["Mercury", lord3, lord9],
        secondary: [lord10, "Sun"],
      }),
    };
  }

  if (cat === "MOVE") {
    const lord4 = getHouseRuler(asc, 4);
    const lord7 = getHouseRuler(asc, 7);
    addPrimary("Moon", lord4, lord7);
    houseLordsBlock = [
      `Ruler of 4th House (home/real estate): ${lord4}`,
      `Ruler of 7th House (relocation/contracts/partnerships): ${lord7}`,
      "Key angle for relocation: IC (Imum Coeli).",
    ].join("\n");
    return {
      primary: [...primarySet],
      houseLordsBlock,
      timingFilterInstruction: buildTimingFilterInstruction("MOVE", { primary: [lord4, lord7], secondary: undefined }),
    };
  }

  if (cat === "HEALTH") {
    const lord6 = getHouseRuler(asc, 6);
    const lord12 = getHouseRuler(asc, 12);
    addPrimary("Moon", "Ascendant", lord6, lord12, "Saturn", "Mars");
    houseLordsBlock = [
      `Ruler of 6th House (illness/treatment): ${lord6}`,
      `Ruler of 12th House (mental health/isolation): ${lord12}`,
      "Moon (overall vitality), Ascendant (constitution), Saturn (chronic conditions), Mars (acute/sudden illness).",
    ].join("\n");
    return {
      primary: [...primarySet],
      houseLordsBlock,
      timingFilterInstruction: buildTimingFilterInstruction("HEALTH", {
        primary: ["Moon", lord6, lord12],
        secondary: ["Saturn", "Mars"],
      }),
    };
  }

  const lord1 = getHouseRuler(asc, 1);
  addPrimary(lord1, "Moon", "Sun");
  return {
    primary: [...primarySet],
    timingFilterInstruction: buildTimingFilterInstruction("OTHER", { primary: [...primarySet], secondary: undefined }),
  };
}

function buildTimelineAnalysisSection(
  significators: string[],
  directionResult: PrimaryDirectionHit[],
  progressionTimeline: ProgressedEventItem[],
  profectionTimeline: ProfectionTimelineItem[],
  category: string,
): string {
  const sigSet = new Set(significators.map((s) => s.toLowerCase()));
  const yearsToLines: Record<number, string[]> = {};

  const addYear = (year: number) => {
    if (!yearsToLines[year]) yearsToLines[year] = [];
  };

  for (const hit of directionResult) {
    const [prom, target] = hit.pair.split(" -> ");
    if (!prom || !target) continue;
    if (!sigSet.has(prom.toLowerCase()) && !sigSet.has(target.toLowerCase())) continue;
    const year = hit.year ?? parseInt(String(hit.eventDate ?? "").split(".")[0], 10);
    if (!year || isNaN(year)) continue;
    addYear(year);
    yearsToLines[year].push(`Primary Direction(${hit.pair}) **(STRONG)**`);
  }

  for (const item of progressionTimeline) {
    const matched = item.events.filter((ev) =>
      significators.some((sig) => ev.includes(sig) || ev.toLowerCase().includes(`natal ${sig.toLowerCase()}`)),
    );
    if (matched.length === 0) continue;
    addYear(item.year);
    yearsToLines[item.year].push(...matched);
  }

  for (const item of profectionTimeline) {
    if (!sigSet.has(item.lord.toLowerCase())) continue;
    addYear(item.year);
    yearsToLines[item.year].push(`Profection Lord(${item.lord})`);
  }

  const years = Object.keys(yearsToLines).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return "";
  return years.map((y) => `${y}: ${yearsToLines[y].join(", ")}`).join("\n");
}

function buildTimingFilterInstruction(
  category: string,
  sig: { primary: string[]; secondary?: string[] },
): string {
  const primaryList = sig.primary.join(", ");
  const secondaryList = sig.secondary && sig.secondary.length > 0 ? ` (Secondary: ${sig.secondary.join(", ")})` : "";

  const base = `[CRITICAL INSTRUCTION FOR TIMING ANALYSIS]
Current Category: **${category.toUpperCase()}**

**Significators for this question:**
- ${primaryList}${secondaryList}

**Your Task: Synthesize timing from ALL 4 techniques**

Analyze timing by integrating all 4 predictive techniques from [Analysis Data]:

1. **Firdaria (Main Period):** Is the Major or Sub Lord one of the significators? If yes, this period is favorable.
2. **Secondary Progression (Progressed Moon):** Does the Progressed Moon aspect any significators? Favorable aspects = positive timing; challenging aspects = active but difficult timing.
3. **Primary Directions:** Do any significators direct to key angles or luminaries? Each hit provides a specific date. Prioritize for precise timing.
4. **Annual Profection:** Is the Profection Sign or Lord of the Year a significator? Or does the Profection House match relevant houses?

**Scoring & Synthesis:**
- Best timing: Multiple techniques activating the same significators simultaneously.
- Good timing: 2+ techniques, or 1 strong activation (e.g., exact Primary Direction).
- Moderate: 1 weak activation.
- Poor: No activations, or significators in very difficult condition.

**Output Requirements:**
1. Identify the most favorable period(s) by synthesizing all 4 techniques.
2. Provide specific dates/ages from Primary Directions; contextualize with Firdaria/Profection.
3. Score each period (0–100) based on technique overlap and quality.
4. Explain your reasoning.`;

  if (category === "EXAM") return base + `\n\nAdditional Guidance for EXAM:\n- Career exams: emphasize 10th House Ruler and Sun.\n- Academic exams: emphasize Mercury, 3rd, and 9th House Rulers.`;
  if (category === "MOVE") return base + `\n\nAdditional Guidance for MOVE:\n- Prioritize Primary Direction hits to IC — strongest relocation indicator.\n- 4th House Ruler (home) and 7th House Ruler (contracts/relocation) are key.`;
  if (category === "HEALTH") return base + `\n\nAdditional Guidance for HEALTH:\n- Moon = primary vitality indicator.\n- Saturn aspects = chronic; Mars = acute/inflammatory.\n- 6th (illness) and 12th (mental/hospitalization) House Rulers are key.\n- Hard transits to Ascendant = physical vulnerability windows.`;
  if (category === "LOVE") return base + `\n\nAdditional Guidance for LOVE:\n- Venus and 7th House Ruler = primary.\n- Lot of Marriage Ruler = marriage potential specifically.\n- Moon Progression = emotional readiness and relationship timing.`;
  if (category === "MONEY" || category === "WORK")
    return base + `\n\nAdditional Guidance for ${category}:\n- Jupiter and benefic aspects generally indicate favorable ${category === "MONEY" ? "wealth acquisition" : "career advancement"} periods.\n- Check Lord of the Year (Profection) and Firdaria Lord for dignity and house placement.`;

  return base;
}

export function generatePredictionPrompt(
  chartData: ChartData,
  birthDate: string,
  location: { lat: number; lng: number },
  firdariaResult: FirdariaResult,
  interactionResult: InteractionResult | null,
  progressionResult: ProgressionResult,
  directionResult: PrimaryDirectionHit[],
  graphKnowledge: string = "",
  careerAnalysis: CareerAnalysisResult | null = null,
  wealthAnalysis: WealthAnalysisResult | null = null,
  loveAnalysis: import("./chartFormatter.ts").LoveAnalysisData | null = null,
  consultationTopic: string = "OTHER",
  profectionData?: ProfectionData,
  progressionTimeline?: ProgressedEventItem[],
  profectionTimeline?: ProfectionTimelineItem[],
  solarReturnChartData?: ChartData,
  solarReturnOverlay?: SolarReturnOverlay,
  consultationTransitChart?: ChartData,
): string {
  const sections: string[] = [];

  // [📋 Client Info]
  sections.push(`[📋 Client Info]
- Date of Birth: ${formatBirthDate(birthDate)}
- Birth Location (Lat/Lon): ${location.lat}, ${location.lng}
- Current Date: ${formatCurrentDate()}`);

  // [🌌 Natal Chart]
  const ascLong = chartData.houses?.angles?.ascendant ?? 0;
  const mcLong = chartData.houses?.angles?.midheaven ?? 0;
  const icLong = normalizeDegrees(mcLong + 180);
  const dscLong = normalizeDegrees(ascLong + 180);
  const ascParts = getSignDisplayLocal(ascLong).split(" ");
  const ascDisplay = ascParts.length >= 2 ? `${ascParts[0]} (${ascParts[1]})` : getSignDisplayLocal(ascLong);
  const ascCharacter = getSignCharacter(ascParts[0] ?? getSignDisplayLocal(ascLong));
  const planetLines = formatNatalPlanets(chartData, { getSignCharacter });
  const seventhRuler = getSeventhHouseRuler(ascLong);
  const fortunaLine = chartData.fortuna
    ? `- Part of Fortune: ${chartData.fortuna.sign} ${chartData.fortuna.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(chartData.fortuna)})`
    : "";
  sections.push(`[🌌 Natal Chart]
- Angles: Ascendant: ${ascDisplay} | MC: ${getSignDisplayLocal(mcLong)} | IC: ${getSignDisplayLocal(icLong)} | Descendant: ${getSignDisplayLocal(dscLong)}${ascCharacter ? ` (Asc Character: ${ascCharacter})` : ""}
${planetLines}
${fortunaLine ? `\n${fortunaLine}` : ""}
- 7th House Ruler: ${seventhRuler}`);

  if (consultationTransitChart?.planets) {
    const transitPlanetLines = Object.entries(consultationTransitChart.planets)
      .map(
        ([name, planet]) =>
          `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet)})`,
      )
      .join("\n");
    sections.push(`[🌍 Transit Chart — sky at consultation time (WS / Alcabitius QS)]
${transitPlanetLines}
Weight each planet's QS using the Quadrant Strength rules in the system prompt.`);

  }

  // [NATAL CHART HIGHLIGHTS]
  const natalStars = analyzeNatalFixedStars(chartData, birthDate);
  if (natalStars.length > 0) {
    const natalStarBlock = formatNatalFixedStarsForPrompt(natalStars);
    sections.push(`[NATAL CHART HIGHLIGHTS — Innate Potential (Fixed Star Influences)]
${natalStarBlock}

**Interpretation Guide:** Whatever the consultation topic, connect the client's "natal star gift" with the "current transiting star energy" (if provided). Example: "You were born with [star] energy (Natal), and right now [star] is transiting through your chart — this means..."`);
  }

  // [Outer Planet Analysis]
  if (consultationTransitChart && profectionData) {
    const outerPlanetSection = analyzeOuterPlanetAspectsEn(
      chartData,
      consultationTransitChart,
      profectionData.lordOfTheYear,
    );
    if (outerPlanetSection) sections.push(outerPlanetSection);
  }

  // [Analysis Data]
  const analysisParts: string[] = [];
  analysisParts.push("[Timing Analysis]");
  analysisParts.push(`1. Main Period (Firdaria): ${firdariaResult.majorLord} Major / ${firdariaResult.subLord ?? "—"} Sub`);

  if (interactionResult) {
    const relationship: string[] = [];
    if (interactionResult.aspect) relationship.push(interactionResult.aspect);
    const houseMatch = interactionResult.houseContext.match(/Major\((\d+H)\)/);
    if (houseMatch) {
      const h = houseMatch[1].replace("H", "");
      const ord = ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th","12th"][parseInt(h, 10) - 1] ?? `${h}th`;
      relationship.push(`in ${ord} House`);
    }
    if (relationship.length > 0) analysisParts.push(`   - Relationship: ${relationship.join(" ")}.`);
    if (interactionResult.reception) analysisParts.push(`   - Note: Reception exists (Helpful).`);
  } else {
    analysisParts.push(`   - (No Major/Sub interaction; node period or N/A.)`);
  }

  analysisParts.push("");
  analysisParts.push("2. Psychological Trend (Progression):");
  analysisParts.push(`   - Current Progressed Moon: ${progressionResult.progMoonSign} (${ordinalHouse(progressionResult.progMoonHouse)} House)`);
  analysisParts.push("   - Interaction with Natal (Internal/Fate):");
  if (progressionResult.natalAspects.length > 0) {
    progressionResult.natalAspects.forEach((a) => analysisParts.push(`     * ${a}`));
  } else {
    analysisParts.push("     * None");
  }
  analysisParts.push("   - Interaction with Progressed Planets (Current Environment):");
  if (progressionResult.progressedAspects.length > 0) {
    progressionResult.progressedAspects.forEach((a) => analysisParts.push(`     * ${a}`));
  } else {
    analysisParts.push("     * None");
  }

  analysisParts.push("");
  analysisParts.push("3. Major Events (Primary Directions - Placidus/Naibod):");
  analysisParts.push("   * Note: Direct and Converse hits to Angles/Luminaries within next 10 years.");
  if (directionResult.length > 0) {
    directionResult.forEach((hit) => {
      const typeLabel = hit.type === "Converse" ? " (Converse)" : "";
      analysisParts.push(`   - ${hit.eventDate} (Age ${hit.age}): ${hit.name}${typeLabel}`);
      const match = hit.name.match(/^(.+?) -> (.+)$/);
      const promName = match ? match[1] : hit.name;
      const significator = match ? match[2] : "—";
      analysisParts.push(`     * Interpretation: "${significator} domain (career/home/self) receives ${promName}'s event energy."`);
    });
  } else {
    analysisParts.push("   - No major direction events in the next 10 years.");
  }

  if (profectionData) {
    analysisParts.push("");
    analysisParts.push("4. Annual Profection:");
    analysisParts.push(`   - Current Age: ${profectionData.age} (Profection House: ${ordinalHouse(profectionData.profectionHouse)})`);
    analysisParts.push(`   - Profection Sign: ${profectionData.profectionSign}`);
    analysisParts.push(`   - Lord of the Year: ${profectionData.lordOfTheYear ?? "—"}`);
    analysisParts.push(`   * Note: This year's focus is the ${ordinalHouse(profectionData.profectionHouse)} house, ruled by ${profectionData.lordOfTheYear ?? "the sign ruler"}.`);
  }

  const catUpper = (consultationTopic || "").trim().toUpperCase();
  if (catUpper === "EXAM" || catUpper === "MOVE") {
    const asc = chartData.houses?.angles?.ascendant ?? 0;
    const nextNum = profectionData ? "5" : "4";
    analysisParts.push("");
    analysisParts.push(`${nextNum}. Category-Specific House Rulers (for timing focus):`);
    if (catUpper === "EXAM") {
      analysisParts.push(`   - Ruler of 3rd House (foundational learning): ${getHouseRuler(asc, 3)}`);
      analysisParts.push(`   - Ruler of 9th House (higher education/university): ${getHouseRuler(asc, 9)}`);
      analysisParts.push(`   - Ruler of 10th House (career/professional exam): ${getHouseRuler(asc, 10)}`);
      analysisParts.push("   - Mercury (academic/certification), Sun (career-oriented exams, weighted).");
    } else {
      analysisParts.push(`   - Ruler of 4th House (home/real estate): ${getHouseRuler(asc, 4)}`);
      analysisParts.push(`   - Ruler of 7th House (relocation/contracts): ${getHouseRuler(asc, 7)}`);
      analysisParts.push("   - Key angle: IC (Imum Coeli, relocation).");
    }
  }

  sections.push(`[Analysis Data]\n${analysisParts.join("\n")}`);

  // [Solar Return]
  if (solarReturnChartData && solarReturnOverlay) {
    const srAscDisplay = getSignDisplayLocal(solarReturnChartData.houses.angles.ascendant);
    const srPlanets = Object.entries(solarReturnChartData.planets)
      .map(([name, planet]) =>
        `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (${formatPlanetHouseWsQs(planet, { sr: true })})`,
      )
      .join("\n");

    sections.push(`[☀️ Solar Return Chart — This Year]
Solar Return Time: ${solarReturnChartData.date}
Location: Lat ${solarReturnChartData.location.lat}, Lon ${solarReturnChartData.location.lng}

Solar Return Ascendant: ${srAscDisplay}

Planets:
${srPlanets}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Solar Return Overlay — SR Planets in Natal Houses]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Solar Return Ascendant falls in Natal House ${solarReturnOverlay.solarReturnAscendantInNatalHouse}.

SR Planet Placements in Natal Houses:
  - SR Sun is in Natal House ${solarReturnOverlay.planetsInNatalHouses.sun}
  - SR Moon is in Natal House ${solarReturnOverlay.planetsInNatalHouses.moon}
  - SR Mercury is in Natal House ${solarReturnOverlay.planetsInNatalHouses.mercury}
  - SR Venus is in Natal House ${solarReturnOverlay.planetsInNatalHouses.venus}
  - SR Mars is in Natal House ${solarReturnOverlay.planetsInNatalHouses.mars}
  - SR Jupiter is in Natal House ${solarReturnOverlay.planetsInNatalHouses.jupiter}
  - SR Saturn is in Natal House ${solarReturnOverlay.planetsInNatalHouses.saturn}

💡 Hint: Whichever Natal house an SR planet falls in, that life domain is amplified this year. Check which SR planets are in houses relevant to the question.`);
  }

  // [TIMING FILTER]
  const significators = getCategorySignificators(chartData, consultationTopic, {
    loveAnalysis,
    wealthAnalysis,
    careerAnalysis,
  });
  sections.push(`[CRITICAL INSTRUCTION FOR TIMING ANALYSIS]\n${significators.timingFilterInstruction}`);
  if (significators.houseLordsBlock) {
    sections.push(`[Category-Specific Significators (House Lords)]\n${significators.houseLordsBlock}`);
  }

  // [TIMELINE ANALYSIS]
  const timelineSection = buildTimelineAnalysisSection(
    significators.primary,
    directionResult,
    progressionTimeline ?? [],
    profectionTimeline ?? [],
    consultationTopic,
  );
  if (timelineSection) {
    sections.push(`[TIMELINE ANALYSIS (Next 10 Years)]\n${timelineSection}`);
    sections.push(`[INSTRUCTION FOR 10-YEAR TIMING]\nYou are analyzing a **10-year timeline**. DO NOT limit your answer to the current year. Scan the timeline. If the strongest indicator appears in a later year (e.g. 2029), explicitly state "The most important timing is that year." Explain WHY based on the combination of Primary Directions, Secondary Progressions, and Annual Profections. Mark **(STRONG)** entries as especially significant when multiple techniques align.`);
  }

  // [Career Analysis]
  if (careerAnalysis && careerAnalysis.candidates.length > 0) {
    const best = careerAnalysis.candidates.reduce((a, b) => (a.score >= b.score ? a : b));
    const reasonParts = formatScoreBreakdown(best.breakdown);
    const meaningReason = reasonParts.length > 0 ? reasonParts.join(", ") + " — therefore" : "by score structure";
    sections.push(`[🏛️ Career Potential Analysis (Method: POF & MC)]
- Best Career Planet: ${best.planetName} (Score: ${best.score})${getSignCharacter(best.sign) ? `\n- Sign Character (Best Planet): "${getSignCharacter(best.sign)}"` : ""}
- Key Candidates:
${careerAnalysis.candidates
  .map((c) => {
    const ord = ordinalHouse(c.house);
    const reason = formatScoreBreakdown(c.breakdown);
    return `  * ${c.planetName}: ${c.score} pts (${ord} House, ${c.sign})\n  * Reason: ${reason.length > 0 ? reason.join(", ") : "—"}\n  * Recommended Fields: ${c.keywords}`;
  })
  .join("\n")}
- Meaning: "The strongest career planet is ${best.planetName}. ${meaningReason}, structural advantage exists in ${best.keywords}."`);
  }

  // [Wealth Analysis]
  if (wealthAnalysis) {
    const occList = wealthAnalysis.occupants.length > 0
      ? wealthAnalysis.occupants.map((o) => `${o.planetName} (${o.type}; ${o.type === "Benefic" ? "easy wealth / favorable" : "challenges or delayed gain"})`).join(", ")
      : "(no planets in Acquisition House)";
    const rulerStatus = formatScoreBreakdown(wealthAnalysis.ruler.breakdown);
    sections.push(`[💰 Wealth Potential Analysis (Method: 11th from POF)]
- Acquisition House: ${wealthAnalysis.acquisitionSign}
- Planets in House: ${occList}
- Ruler Condition: ${wealthAnalysis.ruler.planetName} (Score: ${wealthAnalysis.ruler.score})
  * Status: ${rulerStatus.length > 0 ? rulerStatus.join(", ") : "—"}
- Meaning: "The Acquisition House (11th from POF) has ${wealthAnalysis.occupants.length > 0 ? wealthAnalysis.occupants.map((o) => o.planetName).join(", ") + " present" : "no planets"}. Its ruler ${wealthAnalysis.ruler.planetName} scores ${wealthAnalysis.ruler.score} — ${wealthAnalysis.ruler.score >= 0 ? "strong" : "weak"}. Reflect this structure in your interpretation."`);
  }

  // [Love & Marriage Analysis]
  if (loveAnalysis) {
    const venus = chartData.planets?.venus;
    const house = venus?.house ?? 0;
    const sign = venus?.sign ?? "—";
    const ord = ordinalHouse(house);
    const combust = loveAnalysis.loveQualities.statusDescription.includes("Combust");
    const dignity = loveAnalysis.loveQualities.statusDescription.includes("Stable") ? "Stable/Happy"
      : loveAnalysis.loveQualities.statusDescription.includes("Challenging") ? "Challenging" : "Moderate";
    const interpText = loveAnalysis.loveQualities.score >= 5 ? "strong romantic opportunities, generally stable"
      : loveAnalysis.loveQualities.score <= 0 ? "watch for secret affairs or delays"
      : "some romance but variable";
    const best = loveAnalysis.spouseCandidate.bestSpouseCandidate;
    const totalScore = loveAnalysis.spouseCandidate.scores[best] ?? 0;
    const connectedParts: string[] = [];
    if (totalScore >= 30) connectedParts.push("first application of Luminary (Moon/Sun)");
    if (totalScore >= 10) connectedParts.push("Aspects Venus and/or 7th Ruler");
    if (totalScore >= 5) connectedParts.push("Aspects Lot of Marriage Ruler");
    const logicText = connectedParts.length > 0 ? `This planet is connected to ${connectedParts.join("; ")}.` : "This planet scored highest among significator connections.";
    const SPOUSE_KEYWORDS: Record<string, string> = {
      Sun: "Leadership, authority, possibly public figure or senior role",
      Moon: "Nurturing, emotional, domestic or care-related work",
      Mercury: "Communicative, intellectual, trade or media",
      Venus: "Artistic, diplomatic, beauty or luxury-related",
      Mars: "Active, direct, perhaps uniformed or athletic job",
      Jupiter: "Expansive, legal/educational, religious or high status",
      Saturn: "Structured, responsible, government or long-term commitment",
    };
    const dirFactors = loveAnalysis.loveTiming.activatedFactors.filter((s) => s.startsWith("Direction:"));
    const progFactors = loveAnalysis.loveTiming.activatedFactors.filter((s) => s.startsWith("Progression:"));
    sections.push(`[💘 Love & Marriage Analysis (Deep Scan)]

1. Venus Condition (Love Style):
   - Score: ${loveAnalysis.loveQualities.score} / Placement: ${ord} House (${sign})
   - Sign Character: "${getSignCharacter(sign)}"
   - Status: ${combust ? "Combust" : "Not combust"}, ${dignity}
   - Interpretation: "Venus in the ${ord} with a score of ${loveAnalysis.loveQualities.score} → ${interpText}."

2. Spouse Candidate (Who is it?):
   - 💍 Most Likely Planet: ${best} (Score: ${totalScore})
   - Logic: ${logicText}
   - Character: ${SPOUSE_KEYWORDS[best] ?? "—"}

3. Timing Triggers (When?):
   - Profection: ${loveAnalysis.profectionSign} (Matches Lot/Venus/7th? ${
     loveAnalysis.profectionSign === (venus?.sign ?? "") ||
     loveAnalysis.profectionSign === loveAnalysis.lotOfMarriage.sign ||
     loveAnalysis.profectionSign === getSignFromLongitude(normalizeDegrees(ascLong + 180)).sign
       ? "Yes" : "No"
   })
   - Firdaria: ${firdariaResult.majorLord} Major / ${firdariaResult.subLord ?? "—"} Sub
   - Direction Events: ${dirFactors.length > 0 ? dirFactors.map((s) => s.replace("Direction: ", "")).join("; ") : "None"}
   - Progression Events: ${progFactors.length > 0 ? progFactors.map((s) => s.replace("Progression: ", "")).join("; ") : "None"}
   - Conclusion: "${loveAnalysis.loveTiming.activatedFactors.length >= 2 ? "Multiple triggers are active — marriage probability is VERY HIGH." : "Review single triggers for timing emphasis."}"

Instruction: Based on this data, describe the client's love style, their future partner's character/career, and when marriage is most likely — in vivid, concrete detail.`);
  }

  // [Health Analysis]
  if (consultationTopic.toUpperCase() === "HEALTH") {
    const healthAnalysis = analyzeHealthPotential(chartData);
    const moonIssueList = healthAnalysis.moonHealth.issues.length > 0
      ? healthAnalysis.moonHealth.issues.map((i) => `${i.issue} (${i.severity})`).join("; ")
      : "None";
    sections.push(`[🏥 Health Analysis (Deep Scan)]

1. Moon Health:
   - Afflicted: ${healthAnalysis.moonHealth.isAfflicted ? "Yes" : "No"}
   - Issues: ${moonIssueList}
   - Interpretation: "${healthAnalysis.moonHealth.description}"

2. Mental Health:
   - Risk Level: ${healthAnalysis.mentalHealth.riskLevel}
   - Factors: ${healthAnalysis.mentalHealth.factors.length > 0 ? healthAnalysis.mentalHealth.factors.join("; ") : "None"}
   - Interpretation: "${healthAnalysis.mentalHealth.description}"

3. Physical Health:
   - Risk Level: ${healthAnalysis.physicalHealth.riskLevel}
   - Malefics in 6th House: ${healthAnalysis.physicalHealth.maleficsIn6th.length > 0 ? healthAnalysis.physicalHealth.maleficsIn6th.join(", ") : "None"}
   - Factors: ${healthAnalysis.physicalHealth.factors.length > 0 ? healthAnalysis.physicalHealth.factors.join("; ") : "None"}
   - Interpretation: "${healthAnalysis.physicalHealth.description}"

4. Congenital Issues:
   - Risk Present: ${healthAnalysis.congenitalIssues.hasRisk ? "Yes" : "No"}
   - Factors: ${healthAnalysis.congenitalIssues.factors.length > 0 ? healthAnalysis.congenitalIssues.factors.join("; ") : "None"}
   - Affected Body Parts: ${healthAnalysis.congenitalIssues.bodyParts.length > 0 ? healthAnalysis.congenitalIssues.bodyParts.join(", ") : "—"}
   - Interpretation: "${healthAnalysis.congenitalIssues.description}"

5. Overall Score: ${healthAnalysis.overallScore} / 10
   - Summary: "${healthAnalysis.summary}"

**Interpretation Instruction:**
- Afflicted Moon → weakened overall vitality and recovery.
- 12th house connections (Moon/Saturn) → mental health risk (depression/anxiety).
- 6th house malefics (Mars/Saturn) → physical illness or surgery risk.
- Ascendant under malefic attack with rejection → possible congenital issues.
- Body parts corresponding to malefic sign placement are vulnerable (Aries → head/face, Scorpio → reproductive organs, etc.).
- Advise on current health status, recovery window, treatment approach, and mental wellness.`);
  }

  sections.push(`[📚 Knowledge Base (Chart Dignity/Sect/Hayz)]
${(graphKnowledge ?? "").trim() || "(none)"}`);

  sections.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🛑 IMPORTANT INSTRUCTION FOR AI - READ CAREFULLY]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are "TrueFuture", a wise, intuitive, and empathetic astrologer.
Your mission is to answer the user's inquiry based on the astrological data provided above (\`[Analysis Data]\`, \`[Deep Scan]\`, etc.), acting as your **hidden reasoning engine**.

**🚫 Negative Constraints:**
1. **NO Data Recitation:** Don't say "Because Jupiter is in the 11th house..." The user doesn't know astrology.
2. **NO Technical Jargon:** Avoid "Firdaria," "Profection," "Sect," "Acquisition House" in output unless absolutely necessary. Translate to life context.
3. **NO Robotic Templates:** Don't start every sentence with "Based on the chart..."

**✅ Positive Guidelines:**
1. **Invisible Reasoning:** High score → encourage action; low score or Saturn/Mars block → advise patience.
2. **Focus on Intent:** LOVE → When + Who + How. WORK → Talent + Timing. MONEY → Source + Volume.
3. **Structure:** Conclusion → Insight → Action Tip.

**Tone:**
- Language: STRICTLY match the language of the user's input.
  - English input → English response (warm, professional, empathetic).
  - Korean input → Korean response (natural conversational, 해요체).
- Vibe: Professional counselor, warm, insightful.

**Input Query:** "{User's Specific Question will be here}"
**Now, provide your counseling session.**`);

  return sections.join("\n\n");
}
