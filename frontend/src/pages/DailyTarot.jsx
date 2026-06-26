import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import BottomNavigation from "../components/BottomNavigation";
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../constants/colors";
import { TAROT_CARDS, ORACLE_CARDS, randomCard } from "../constants/tarotCards";
import { supabase } from "../lib/supabaseClient";

// 한국 시간 기준 오늘 날짜 (YYYY-MM-DD)
function getKoreanDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const STORAGE_KEY = "daily_tarot_record";

function DailyTarot() {
  const { t, i18n } = useTranslation();
  const isKo = !i18n.language?.startsWith("en");

  const [deck, setDeck] = useState("tarot"); // "tarot" | "oracle"
  const [card, setCard] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(false);
  const [alreadyDrawn, setAlreadyDrawn] = useState(false);

  // 오늘 이미 뽑았는지 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const rec = JSON.parse(raw);
      if (rec.date === getKoreanDate() && rec.cardId) {
        const all = [...TAROT_CARDS, ...ORACLE_CARDS];
        const found = all.find((c) => c.id === rec.cardId);
        if (found) {
          setCard(found);
          setDeck(found.deck);
          setFlipped(true);
          setAlreadyDrawn(true);
          setInterpretation(rec.interpretation || "");
        }
      }
    } catch (_) {
      // ignore
    }
  }, []);

  const fetchInterpretation = useCallback(
    async (picked) => {
      setLoading(true);
      try {
        const lang = isKo ? "ko" : "en";
        const body = {
          cardId: picked.id,
          cardName: isKo ? picked.nameKo : picked.nameEn,
          keywords: isKo ? picked.keywords : picked.keywordsEn,
          cardType: picked.deck,
          isPositive: picked.isPositive,
          language: lang,
        };

        let text = "";
        if (supabase) {
          const { data, error } = await supabase.functions.invoke("daily-tarot", {
            body,
          });
          if (error) throw error;
          text = data?.interpretation || "";
        }
        if (!text) text = picked.description; // 폴백
        setInterpretation(text);

        // 기록 저장
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            date: getKoreanDate(),
            cardId: picked.id,
            interpretation: text,
          })
        );
      } catch (_) {
        setInterpretation(picked.description);
      } finally {
        setLoading(false);
      }
    },
    [isKo]
  );

  const handleDraw = () => {
    if (flipped || alreadyDrawn) return;
    const picked = randomCard(deck);
    setCard(picked);
    setFlipped(true);
    setAlreadyDrawn(true);
    fetchInterpretation(picked);
  };

  const cardName = card ? (isKo ? card.nameKo : card.nameEn) : "";
  const keywordList = card
    ? (isKo ? card.keywords : card.keywordsEn)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const accent = card && !card.isPositive ? "#E1606A" : colors.primary;

  return (
    <div className="w-full py-8 sm:py-12" style={{ position: "relative", zIndex: 1 }}>
      <Helmet>
        <title>{t("daily_tarot.meta_title")}</title>
        <meta name="description" content={t("daily_tarot.meta_desc")} />
      </Helmet>

      <div className="w-full max-w-[600px] mx-auto px-4 pb-24 sm:pb-28">
        {/* 헤더 */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {t("daily_tarot.title")}
            </h1>
            <span
              className="px-2 py-0.5 text-xs font-semibold rounded-[4px] text-black"
              style={{ backgroundColor: colors.primary }}
            >
              {t("daily_tarot.free_badge")}
            </span>
          </div>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            {t("daily_tarot.subtitle")}
          </p>
        </div>

        {/* 덱 선택 (뽑기 전에만) */}
        {!flipped && (
          <div
            className="flex gap-1 mb-6 p-1 rounded-lg"
            style={{ backgroundColor: "#121230" }}
          >
            {[
              { id: "tarot", label: t("daily_tarot.deck_tarot") },
              { id: "oracle", label: t("daily_tarot.deck_oracle") },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeck(d.id)}
                className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-md transition-colors ${
                  deck === d.id
                    ? "text-black"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                }`}
                style={deck === d.id ? { backgroundColor: colors.primary } : {}}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        {/* 카드 영역 */}
        <div className="flex flex-col items-center justify-center mb-8">
          {!flipped ? (
            <button
              type="button"
              onClick={handleDraw}
              className="group relative transition-transform duration-300 hover:scale-105 focus:outline-none"
              aria-label={t("daily_tarot.tap_hint")}
            >
              <img
                src="/assets/card-back.png"
                alt={t("daily_tarot.card_back_alt")}
                className="w-[200px] sm:w-[240px] h-auto rounded-2xl"
                style={{
                  boxShadow: `0 0 28px 4px ${colors.primary}40`,
                  animation: "tarotFloat 2.5s ease-in-out infinite",
                }}
              />
            </button>
          ) : (
            <div className="flex flex-col items-center">
              <img
                src={card.image}
                alt={cardName}
                className="w-[200px] sm:w-[240px] h-auto rounded-2xl"
                style={{ boxShadow: `0 0 32px 6px ${accent}55` }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <h2
                className="mt-5 text-xl sm:text-2xl font-bold"
                style={{ color: accent }}
              >
                {cardName}
              </h2>
              {keywordList.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  {keywordList.map((kw, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 text-xs font-medium rounded-full"
                      style={{
                        backgroundColor: `${accent}1F`,
                        color: accent,
                        border: `1px solid ${accent}4D`,
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!flipped && (
            <p className="mt-5 text-slate-400 text-sm text-center">
              {t("daily_tarot.tap_hint")}
            </p>
          )}
        </div>

        {/* AI 해석 */}
        {flipped && (
          <div className="mb-8">
            <div className="rounded-xl border border-slate-700 bg-[#0F0F2B]/60 p-5 sm:p-6">
              {loading ? (
                <div className="flex flex-col items-center py-6">
                  <div
                    className="animate-spin rounded-full h-8 w-8 border-b-2 mb-4"
                    style={{ borderColor: colors.primary }}
                  ></div>
                  <p className="text-slate-400 text-sm">
                    {t("daily_tarot.generating")}
                  </p>
                </div>
              ) : (
                <p className="text-slate-100 text-[15px] sm:text-base leading-[1.9] whitespace-pre-line">
                  {interpretation}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 유료 운세 CTA */}
        {flipped && !loading && (
          <div className="mb-6">
            <Link
              to="/yearly"
              className="block rounded-xl p-5 transition-all"
              style={{
                background:
                  "linear-gradient(135deg, #2A1F5C 0%, #1A1840 100%)",
                border: `1px solid ${colors.primary}66`,
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">✨</span>
                <div className="flex-1">
                  <p
                    className="text-sm font-bold mb-1"
                    style={{ color: colors.primary }}
                  >
                    {t("daily_tarot.cta_title")}
                  </p>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    {t("daily_tarot.cta_subtitle")}
                  </p>
                </div>
                <span style={{ color: colors.primary }}>›</span>
              </div>
            </Link>
          </div>
        )}

        {alreadyDrawn && !loading && (
          <p className="text-center text-slate-500 text-xs">
            {t("daily_tarot.come_back_tomorrow")}
          </p>
        )}
      </div>

      <BottomNavigation activeTab="tarot" />

      <style>{`
        @keyframes tarotFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}

export default DailyTarot;
