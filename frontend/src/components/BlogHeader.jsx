import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getBrandLogoAlt } from "../constants/seoMeta";

/** 블로그 전용 최소 헤더 — 서비스 GNB와 분리, 좌측 브랜드 로고만 표시 */
export default function BlogHeader() {
  const { i18n } = useTranslation();
  const logoSrc = i18n.language?.startsWith("en")
    ? "/assets/logo-en.png"
    : "/assets/logo.png";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-3xl items-center px-5 sm:h-16 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center">
          <img
            src={logoSrc}
            alt={getBrandLogoAlt(i18n.language)}
            className="h-4 w-auto object-contain sm:h-5"
          />
        </Link>
      </div>
    </header>
  );
}
