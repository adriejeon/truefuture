/**
 * 프리미엄 상세 리포트 랜딩 섹션 모음
 *
 * PremiumReport 페이지의 intro 뷰가 아래 섹션들을 순서대로 조합한다.
 * 결제·생성 로직은 페이지가 갖고, 이 파일은 표현(마케팅 섹션)만 담당한다.
 *
 * 디자인 원칙: 기존 진짜미래 토큰 재사용
 *  - 강조 카드: bg-[rgba(37,61,135,0.2)] border-[#253D87]
 *  - 일반 카드: bg-slate-800/40 border-slate-700
 *  - 후기 카드: bg-[#1E1E3A]/90 border-[#2A2A4A]/80 (Home 과 동일)
 *  - 섹션 제목: ✦ ✦ ✦ + font-noto + 골드 액센트 (Home 과 동일)
 *  - 리포트 본문 미리보기: .premium-report-md (실제 결과 화면과 동일 스타일)
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageCircleQuestion,
  CalendarRange,
  Briefcase,
  Scale,
  Route,
  Milestone,
  Lock,
  ShieldCheck,
  Sparkles,
  BadgeCheck,
  ChevronDown,
  Heart,
  Coins,
  Building2,
  Plane,
  UserRound,
  Check,
} from "lucide-react";
import PrimaryButton from "./PrimaryButton";
import FortuneMarkdown from "./FortuneMarkdown";
import ReviewList from "./ReviewList";
import { usePublishedReviews } from "../hooks/usePublishedReviews";
import { colors } from "../constants/colors";
import {
  SAMPLE_META,
  SAMPLE_ANSWERS,
  SAMPLE_YEARS,
  SAMPLE_YEARS_REMAINING,
  SAMPLE_OVERVIEW,
  SAMPLE_YEAR_DETAIL,
} from "../constants/reportSample";

/** 기존 1:1 서면 분석 기준 가격 (정가·할인가가 아닌 '기준' 표기용) */
export const LEGACY_CONSULT_PRICE = 100000;
/** 리포트가 다루는 연도 수 (부분 연도 포함 11개) */
export const REPORT_YEAR_COUNT = 11;

const GOLD_BG_SOFT = "rgba(225, 172, 63, 0.12)";

// ===== 공용 소품 =====

function useLanding() {
  const { t } = useTranslation();
  return (key, opts) => t(`premium_report.landing.${key}`, opts);
}

/** Home 과 동일한 섹션 제목 패턴 (✦ ✦ ✦ / 제목 + 골드 액센트 / 부제) */
export function SectionHeading({ title, accent, sub, id }) {
  return (
    <div id={id} className="flex flex-col items-center text-center gap-3 mb-6 scroll-mt-24">
      <div className="flex justify-center gap-x-1.5 text-primary/90" aria-hidden="true">
        <span className="font-noto text-[clamp(10px,2.2vw,13px)]">✦</span>
        <span className="font-noto text-[clamp(10px,2.2vw,13px)]">✦</span>
        <span className="font-noto text-[clamp(10px,2.2vw,13px)]">✦</span>
      </div>
      <h2 className="font-noto text-[clamp(18px,4.8vw,24px)] font-medium leading-[1.45] tracking-[-0.02em] text-white">
        {title} {accent && <span className="text-primary">{accent}</span>}
      </h2>
      {sub && (
        <p className="font-noto text-[clamp(12.5px,3.2vw,15px)] font-light leading-[1.65] text-[#9CA3B8] whitespace-pre-line">
          {sub}
        </p>
      )}
    </div>
  );
}

function GoldIconBox({ Icon, size = "md" }) {
  const box = size === "sm" ? "w-8 h-8 rounded-lg" : "w-10 h-10 rounded-xl";
  const icon = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <span
      className={`shrink-0 ${box} flex items-center justify-center`}
      style={{ backgroundColor: GOLD_BG_SOFT }}
    >
      <Icon className={icon} strokeWidth={1.75} style={{ color: colors.primary }} aria-hidden="true" />
    </span>
  );
}

/** 골드 아웃라인 보조 CTA */
function OutlineCta({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-full border text-base font-semibold transition-colors hover:bg-[rgba(225,172,63,0.1)] touch-manipulation"
      style={{ borderColor: colors.primary, color: colors.primary }}
    >
      {children}
    </button>
  );
}

// ===== 1. 히어로 =====

export function ReportHero({ price, onBuy, onSample, ctaRef }) {
  const L = useLanding();
  const { t } = useTranslation();
  const chips = ["hero_chip_0", "hero_chip_1", "hero_chip_2", "hero_chip_3", "hero_chip_4"];
  return (
    <section className="text-center pt-4 pb-8">
      <h1 className="font-noto text-[clamp(22px,6vw,32px)] font-medium leading-[1.4] tracking-[-0.02em] text-white mb-4">
        {L("hero_title_1")}
        <br />
        <span className="text-primary">{L("hero_title_2")}</span>
      </h1>
      <p className="font-noto text-[clamp(13.5px,3.5vw,16px)] font-light leading-[1.7] text-[#D8D8ED] whitespace-pre-line mb-5">
        {L("hero_sub")}
      </p>

      <ul className="flex flex-wrap justify-center gap-2 mb-6" aria-label={L("hero_chips_label")}>
        {chips.map((k) => (
          <li
            key={k}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-slate-200 border"
            style={{ backgroundColor: "rgba(37, 61, 135, 0.25)", borderColor: "#253D87" }}
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: colors.primary }} aria-hidden="true" />
            {L(k)}
          </li>
        ))}
      </ul>

      <div className="mb-4">
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-3xl font-bold" style={{ color: colors.primary }}>
            {price.toLocaleString()}
            {t("common.unit_won")}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">{L("hero_price_note")}</p>
      </div>

      <div ref={ctaRef}>
        <PrimaryButton type="button" variant="gold" fullWidth onClick={onBuy}>
          {L("hero_cta", { price: price.toLocaleString() })}
        </PrimaryButton>
      </div>
      <button
        type="button"
        onClick={onSample}
        className="mt-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-white underline underline-offset-4 decoration-slate-500"
      >
        {L("hero_sample_link")}
        <ChevronDown className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
      </button>
      <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">{L("hero_trust")}</p>
    </section>
  );
}

// ===== 2. 사용자의 고민/질문 =====

const QUESTION_EXAMPLES = [
  { key: "q_1", Icon: Briefcase },
  { key: "q_2", Icon: Heart },
  { key: "q_3", Icon: Building2 },
  { key: "q_4", Icon: Coins },
  { key: "q_5", Icon: UserRound },
  { key: "q_6", Icon: Plane },
];

export function ReportQuestions({ onPick }) {
  const L = useLanding();
  return (
    <section className="py-8">
      <SectionHeading title={L("q_title")} accent={L("q_title_accent")} sub={L("q_sub")} />
      <ul className="space-y-2.5">
        {QUESTION_EXAMPLES.map(({ key, Icon }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onPick(L(key))}
              className="w-full flex items-center gap-3 text-left rounded-xl px-4 py-3 border border-slate-700 bg-slate-800/40 hover:border-[#E1AC3F]/60 hover:bg-slate-800/60 transition-colors touch-manipulation"
            >
              <GoldIconBox Icon={Icon} size="sm" />
              <span className="flex-1 text-sm text-slate-200 leading-snug">{L(key)}</span>
              <span className="shrink-0 text-[11px] font-medium" style={{ color: colors.primary }}>
                {L("q_pick")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ===== 3. 이 리포트로 알 수 있는 것 =====

const OUTCOMES = [
  { key: "out_1", Icon: MessageCircleQuestion },
  { key: "out_2", Icon: CalendarRange },
  { key: "out_3", Icon: Briefcase },
  { key: "out_4", Icon: Scale },
  { key: "out_5", Icon: Route },
  { key: "out_6", Icon: Milestone },
];

export function ReportOutcomes() {
  const L = useLanding();
  return (
    <section className="py-8">
      <SectionHeading title={L("out_title")} accent={L("out_title_accent")} sub={L("out_sub")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OUTCOMES.map(({ key, Icon }) => (
          <div key={key} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 flex gap-3">
            <GoldIconBox Icon={Icon} />
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm leading-snug mb-1">{L(`${key}_t`)}</p>
              <p className="text-slate-300 text-xs leading-relaxed">{L(`${key}_d`)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ===== 4. 실제 리포트 구성 (문서 목차) =====

export function ReportContents() {
  const L = useLanding();
  const parts = [
    { num: 1, title: L("toc_p1"), items: L("toc_p1_items").split("|") },
    { num: 2, title: L("toc_p2"), items: L("toc_p2_items").split("|") },
    { num: 3, title: L("toc_p3"), items: L("toc_p3_items").split("|") },
  ];
  const metas = [L("toc_meta_1"), L("toc_meta_2", { pages: SAMPLE_META.pages }), L("toc_meta_3")];
  return (
    <section className="py-8">
      <SectionHeading title={L("toc_title")} accent={L("toc_title_accent")} sub={L("toc_sub")} />
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "rgba(37, 61, 135, 0.2)", borderColor: "#253D87" }}
      >
        {/* 문서 표지 느낌의 헤더 */}
        <div className="px-5 pt-5 pb-4 border-b border-[#253D87] text-center">
          <p className="font-noto text-lg text-white font-medium">{L("toc_doc_title")}</p>
          <p className="text-xs text-slate-400 mt-0.5">{L("toc_doc_sub")}</p>
        </div>
        <ol className="px-5 py-4 space-y-4">
          {parts.map((p) => (
            <li key={p.num}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-[11px] font-semibold tracking-wide" style={{ color: colors.primary }}>
                  {L("toc_part", { num: p.num })}
                </span>
                <span className="text-white font-semibold text-sm">{p.title}</span>
              </div>
              <ul className="space-y-1 pl-1">
                {p.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                    <span
                      className="mt-[7px] w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: colors.primary }}
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <div className="px-5 py-3 border-t border-[#253D87] flex flex-wrap gap-x-4 gap-y-1">
          {metas.map((m) => (
            <span key={m} className="inline-flex items-center gap-1 text-[11px] text-slate-300">
              <Check className="w-3 h-3" strokeWidth={2.5} style={{ color: colors.primary }} aria-hidden="true" />
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== 5. 샘플 미리보기 (흐림/잠금) =====

function LockedOverlay({ label }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white border border-[#E1AC3F]/50 shadow-lg"
        style={{ backgroundColor: "rgba(15, 15, 43, 0.92)" }}
      >
        <Lock className="w-3 h-3" strokeWidth={2.25} style={{ color: colors.primary }} aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

export function ReportSamplePreview({ onBuy }) {
  const L = useLanding();
  const { i18n } = useTranslation();
  const isEnglish = i18n.language?.startsWith("en");
  const visibleAnswers = SAMPLE_ANSWERS.filter((a) => !a.locked);
  const lockedAnswers = SAMPLE_ANSWERS.filter((a) => a.locked);
  const visibleYears = SAMPLE_YEARS.filter((y) => !y.locked);
  const lockedYears = SAMPLE_YEARS.filter((y) => y.locked);

  const yearRow = (y) => (
    <li key={y.year} className="flex items-start gap-3">
      <span className="flex flex-col items-center pt-1.5">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${y.highlight ? "ring-4 ring-[rgba(225,172,63,0.2)]" : ""}`}
          style={{ backgroundColor: y.highlight ? colors.primary : "#7C86A8" }}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 text-sm leading-relaxed">
        <span className={`font-bold ${y.highlight ? "text-[#F0D9A4]" : "text-white"}`}>{y.year}</span>
        {y.range && <span className="text-slate-400 text-xs ml-1">({y.range})</span>}
        <span className="text-slate-300"> — {y.theme}</span>
      </span>
    </li>
  );

  return (
    <section className="py-8">
      <SectionHeading
        id="report-sample"
        title={L("sample_title")}
        accent={L("sample_title_accent")}
        sub={L("sample_sub", {
          who: SAMPLE_META.who,
          question: SAMPLE_META.question,
          issued: SAMPLE_META.issued,
        })}
      />

      <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
          <span className="text-[11px] text-slate-400">{L("toc_doc_title")}</span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-black"
            style={{ backgroundColor: colors.primary }}
          >
            {L("sample_frame_label")}
          </span>
        </div>

        <div className="p-5 sm:p-6 premium-report-md">
          {/* 블록 A — 질문 결론 */}
          <h2>먼저, 질문에 답해드리면</h2>
          {visibleAnswers.map((a) => (
            <FortuneMarkdown key={a.id}>{`**질문 ${a.id} —** ${a.answer}`}</FortuneMarkdown>
          ))}
          {lockedAnswers.length > 0 && (
            <div className="relative mt-1">
              <div className="report-sample-blur" aria-hidden="true">
                {lockedAnswers.map((a) => (
                  <FortuneMarkdown key={a.id}>{`**질문 ${a.id} —** ${a.answer}`}</FortuneMarkdown>
                ))}
              </div>
              <LockedOverlay label={L("sample_locked_answer")} />
            </div>
          )}

          {/* 블록 B — 10년 조감도 + 연도 타임라인 */}
          <h2>앞으로 10년의 전체 흐름</h2>
          <FortuneMarkdown>{SAMPLE_OVERVIEW}</FortuneMarkdown>
          <h3>연도별 핵심 주제</h3>
          <ul className="!list-none !pl-0 space-y-2.5">{visibleYears.map(yearRow)}</ul>
          <div className="relative mt-2.5">
            <ul className="!list-none !pl-0 space-y-2.5 report-sample-blur" aria-hidden="true">
              {lockedYears.map(yearRow)}
              <li className="text-xs text-slate-400 pl-5">+ {SAMPLE_YEARS_REMAINING}개 연도</li>
            </ul>
            <LockedOverlay label={L("sample_locked_years")} />
          </div>

          {/* 블록 C — 연도 상세 발췌 */}
          <h3 className="!mt-8">{SAMPLE_YEAR_DETAIL.heading}</h3>
          {SAMPLE_YEAR_DETAIL.paragraphs.map((p, i) => (
            <FortuneMarkdown key={i}>{p}</FortuneMarkdown>
          ))}
          <div className="relative">
            <div className="report-sample-fade" aria-hidden="true">
              <FortuneMarkdown>{SAMPLE_YEAR_DETAIL.fadedParagraph}</FortuneMarkdown>
            </div>
            <p className="text-center text-xs text-slate-400 mt-1 !mb-0">
              {L("sample_more_paragraphs", { count: SAMPLE_YEAR_DETAIL.totalParagraphs })}
            </p>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mt-3 text-center">
        {L("sample_caption", { pages: SAMPLE_META.pages })}
        {isEnglish && <> {L("sample_lang_note")}</>}
      </p>

      <div className="mt-5">
        <OutlineCta onClick={onBuy}>{L("sample_cta")}</OutlineCta>
      </div>
    </section>
  );
}

// ===== 6. 분석 방식 (신뢰) =====

export function ReportMethod() {
  const L = useLanding();
  /** 3단계(20년 상담·역추적 기반 구조 해석)가 이 상품의 핵심 — 골드 테두리 + '핵심' 배지로 강조 */
  const steps = ["m_1", "m_2", "m_3", "m_4", "m_5"];
  const CORE_STEP = "m_3";
  const chips = [
    { key: "method_chip_1", Icon: BadgeCheck },
    { key: "method_chip_2", Icon: Sparkles },
    { key: "method_chip_3", Icon: ShieldCheck },
  ];
  return (
    <section className="py-8">
      <SectionHeading title={L("method_title")} accent={L("method_title_accent")} sub={L("method_sub")} />
      <ol className="relative space-y-3">
        {steps.map((k, idx) => {
          const isCore = k === CORE_STEP;
          return (
            <li
              key={k}
              className={`flex gap-3 rounded-xl border p-4 ${
                isCore ? "border-[#E1AC3F]/60 bg-[rgba(225,172,63,0.08)]" : "border-slate-700 bg-slate-800/40"
              }`}
            >
              <span
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-black"
                style={{ backgroundColor: colors.primary }}
                aria-hidden="true"
              >
                {idx + 1}
              </span>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm mb-1 flex items-center gap-2 flex-wrap">
                  {L(`${k}_t`)}
                  {isCore && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-black"
                      style={{ backgroundColor: colors.primary }}
                    >
                      {L("method_core_badge")}
                    </span>
                  )}
                </p>
                <p className={`text-xs leading-relaxed ${isCore ? "text-slate-100" : "text-slate-300"}`}>
                  {L(`${k}_d`)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <ul className="mt-4 flex flex-wrap justify-center gap-2">
        {chips.map(({ key, Icon }) => (
          <li
            key={key}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] text-slate-200 border border-slate-600 bg-slate-800/40"
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2} style={{ color: colors.primary }} aria-hidden="true" />
            {L(key)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ===== 7. 무료 운세·AI 챗봇과의 비교 =====

export function ReportComparison() {
  const L = useLanding();
  // 근거 → 해석(20년 상담·역추적 노하우) → 시기 → 질문 → 분량 → 소장
  const rows = ["cmp_r1", "cmp_r6", "cmp_r2", "cmp_r3", "cmp_r4", "cmp_r5"];
  return (
    <section className="py-8">
      <SectionHeading title={L("cmp_title")} accent={L("cmp_title_accent")} />
      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[320px] break-keep">
            <thead>
              <tr className="bg-slate-800/60">
                <th scope="col" className="px-2.5 py-2.5 font-medium text-slate-400 w-[13%]" />
                <th scope="col" className="px-2.5 py-2.5 font-medium text-slate-300 w-[24%]">
                  {L("cmp_col_free")}
                </th>
                <th scope="col" className="px-2.5 py-2.5 font-medium text-slate-300 w-[26%]">
                  {L("cmp_col_chat")}
                </th>
                <th
                  scope="col"
                  className="px-2.5 py-2.5 font-semibold"
                  style={{ color: colors.primary, backgroundColor: "rgba(225, 172, 63, 0.1)" }}
                >
                  {L("cmp_col_report")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r} className="border-t border-slate-700/80">
                  <th scope="row" className="px-2.5 py-2.5 font-medium text-slate-400 align-top">
                    {L(`${r}_l`)}
                  </th>
                  <td className="px-2.5 py-2.5 text-slate-400 align-top leading-relaxed">
                    {L(`${r}_free`)}
                  </td>
                  <td className="px-2.5 py-2.5 text-slate-400 align-top leading-relaxed">
                    {L(`${r}_chat`)}
                  </td>
                  <td
                    className="px-2.5 py-2.5 text-slate-100 align-top leading-relaxed"
                    style={{ backgroundColor: "rgba(225, 172, 63, 0.06)" }}
                  >
                    <Check
                      className="inline w-3 h-3 mr-1 -mt-0.5"
                      strokeWidth={2.5}
                      style={{ color: colors.primary }}
                      aria-hidden="true"
                    />
                    {L(`${r}_report`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ===== 8. 가격 가치 =====

export function ReportPricing({ price, onBuy }) {
  const L = useLanding();
  const { t } = useTranslation();
  const perYear = Math.round(price / REPORT_YEAR_COUNT / 100) * 100;
  /** 기준 가격 대비 몇 % 낮은지 (18,000 vs 100,000 → 82) */
  const percent = Math.round((1 - price / LEGACY_CONSULT_PRICE) * 100);
  return (
    <section className="py-8">
      <SectionHeading
        id="report-price"
        title={L("price_title")}
        accent={L("price_title_accent", { price: price.toLocaleString() })}
        sub={L("price_sub")}
      />
      <div
        className="rounded-2xl border p-4 sm:p-5"
        style={{ borderColor: "rgba(225, 172, 63, 0.5)", backgroundColor: "rgba(225, 172, 63, 0.06)" }}
      >
        <div className="relative grid grid-cols-2 gap-3">
          {/* 기존 1:1 서면 분석 (기준) */}
          <div className="rounded-xl border border-slate-700 bg-[#0F0F2B]/60 p-3.5 flex flex-col">
            <span className="self-start text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 mb-2">
              {L("price_left_tag")}
            </span>
            <p className="text-xs text-slate-300 leading-snug mb-2 min-h-[2.5em]">{L("price_left_label")}</p>
            <p className="text-lg sm:text-xl font-bold text-slate-200">
              {L("price_left_amount", { amount: LEGACY_CONSULT_PRICE.toLocaleString() })}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">{L("price_left_meta")}</p>
          </div>

          {/* 진짜미래 리포트 */}
          <div
            className="rounded-xl border p-3.5 flex flex-col"
            style={{ borderColor: colors.primary, backgroundColor: "rgba(15, 15, 43, 0.75)" }}
          >
            <span
              className="self-start text-[10px] font-semibold px-1.5 py-0.5 rounded text-black mb-2"
              style={{ backgroundColor: colors.primary }}
            >
              {L("price_badge", { percent })}
            </span>
            <p className="text-xs text-white leading-snug mb-2 min-h-[2.5em]">{L("price_right_label")}</p>
            <p className="text-2xl sm:text-3xl font-bold" style={{ color: colors.primary }}>
              {price.toLocaleString()}
              <span className="text-base font-semibold">{t("common.unit_won")}</span>
            </p>
            <p className="text-[11px] text-slate-300 mt-1 leading-snug">{L("price_right_meta")}</p>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-slate-200">
          {L("price_unit", { years: REPORT_YEAR_COUNT, perYear: perYear.toLocaleString() })}
        </p>
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed text-center">
          {L("price_footnote", { amount: LEGACY_CONSULT_PRICE.toLocaleString() })}
        </p>

        <div className="mt-4">
          <PrimaryButton type="button" variant="gold" fullWidth onClick={onBuy}>
            {L("price_cta", { price: price.toLocaleString() })}
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}

// ===== 9. 후기 (리뷰 시스템 연동: 리포트(service="report") 구매 후기만) =====

export function ReportTestimonials() {
  const L = useLanding();
  const { i18n } = useTranslation();
  // 리포트 페이지에는 리포트 구매자 후기만 노출한다. 게시된 리포트 후기가 없으면 섹션을 숨긴다.
  // (다른 서비스·이관 후기로 대체하지 않음 — 구매 인증 배지는 ReviewList 가 붙인다)
  const { reviews, summary, loading, hasMore, loadingMore, loadMore } = usePublishedReviews({
    service: "report",
    language: i18n.language,
    pageSize: 8,
  });

  if (loading || reviews.length === 0) return null;

  return (
    <section className="py-8">
      <SectionHeading
        title={L("review_title_report")}
        accent={L("review_title_report_accent")}
        sub={L("review_sub_report")}
      />
      <ReviewList
        reviews={reviews}
        summary={summary}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </section>
  );
}

// ===== 10. FAQ =====

export function ReportFaq() {
  const L = useLanding();
  const items = ["faq_1", "faq_2", "faq_3", "faq_4"];
  return (
    <section className="py-8">
      <SectionHeading title={L("faq_title")} accent={L("faq_title_accent")} />
      <div className="space-y-2">
        {items.map((k) => (
          <details key={k} className="group rounded-xl border border-slate-700 bg-slate-800/30 open:bg-slate-800/50">
            <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none text-sm text-white [&::-webkit-details-marker]:hidden">
              <span>{L(`${k}_q`)}</span>
              <ChevronDown
                className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                strokeWidth={2}
                aria-hidden="true"
              />
            </summary>
            <p className="px-4 pb-4 text-xs text-slate-300 leading-relaxed">{L(`${k}_a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ===== 11. 하단 고정 CTA (모바일 중심) =====

/** 하단 네비게이션 높이를 측정해 그 위에 붙인다 (측정 실패 시 68px) */
function useBottomNavHeight() {
  const [height, setHeight] = useState(68);
  useEffect(() => {
    const nav = document.querySelector("nav.fixed.bottom-0");
    if (!nav) {
      setHeight(0);
      return undefined;
    }
    const measure = () => setHeight(nav.getBoundingClientRect().height || 68);
    measure();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(nav);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return height;
}

export function ReportStickyCta({ visible, price, onBuy }) {
  const L = useLanding();
  const { t } = useTranslation();
  const navHeight = useBottomNavHeight();
  if (!visible) return null;
  return (
    <div
      className="fixed left-0 right-0 z-40 px-3 pb-2 pointer-events-none animate-slide-up-float"
      style={{ bottom: navHeight }}
    >
      <div
        className="max-w-[600px] mx-auto pointer-events-auto rounded-2xl border shadow-2xl backdrop-blur px-3.5 py-2.5 flex items-center gap-3"
        style={{ backgroundColor: "rgba(15, 15, 43, 0.96)", borderColor: "rgba(225, 172, 63, 0.45)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-slate-300 truncate">{L("sticky_label")}</p>
          <p className="text-base font-bold leading-tight" style={{ color: colors.primary }}>
            {price.toLocaleString()}
            {t("common.unit_won")}
          </p>
        </div>
        <button
          type="button"
          onClick={onBuy}
          className="shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-colors hover:brightness-95 touch-manipulation"
          style={{ backgroundColor: colors.primary }}
        >
          {L("sticky_cta")}
        </button>
      </div>
    </div>
  );
}
