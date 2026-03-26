import { supabase } from "../lib/supabaseClient";

/**
 * 언어·타입에 맞는 최신 약관을 DB에서 가져온다.
 *
 * @param {"terms"|"privacy"} type - 약관 종류
 * @param {string} currentLang     - i18n.language 값 (예: "ko", "en", "en-US" 등)
 * @returns {Promise<{content: string, version: string, ...}>}
 */
export async function fetchTermsContent(type, currentLang) {
  // 브라우저 언어 코드 정규화: 'en-US', 'en-GB' 등은 모두 'en' 처리
  const lang = currentLang?.startsWith("en") ? "en" : "ko";

  const { data, error } = await supabase
    .from("terms_definitions")
    .select("*")
    .eq("type", type)
    .eq("language", lang)
    .lte("effective_at", new Date().toISOString())
    .order("version", { ascending: false })
    .order("effective_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // 영문 약관이 아직 없는 경우 한국어로 폴백
    if (lang === "en" && error.code === "PGRST116") {
      const { data: fallback, error: fallbackError } = await supabase
        .from("terms_definitions")
        .select("*")
        .eq("type", type)
        .eq("language", "ko")
        .lte("effective_at", new Date().toISOString())
        .order("version", { ascending: false })
        .order("effective_at", { ascending: false })
        .limit(1)
        .single();

      if (fallbackError) throw fallbackError;
      return fallback;
    }
    throw error;
  }

  return data;
}
