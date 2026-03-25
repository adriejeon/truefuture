import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { colors } from "../constants/colors";

function Footer() {
  const { t } = useTranslation();

  return (
    <footer
      className="mt-auto py-6 sm:py-8 pb-24 sm:pb-28 border-t border-white/10"
      style={{ backgroundColor: "#0F0F2B" }}
    >
      <div className="max-w-[600px] mx-auto px-4">
        {/* 회사 정보 */}
        <div
          className="text-left mb-6 text-sm space-y-1"
          style={{ color: colors.subText }}
        >
          <p className="font-semibold">{t("footer.company")}</p>
          <p>{t("footer.ceo")}</p>
          <p>{t("footer.address")}</p>
          <p>{t("footer.business_number")}</p>
          <p>{t("footer.mail_order_number")}</p>
          <p>{t("footer.phone")}</p>
          <p>
            <a
              href="mailto:jupiteradrie@gmail.com"
              className="hover:text-white transition-colors duration-200"
            >
              jupiteradrie@gmail.com
            </a>
          </p>
        </div>

        {/* 링크 */}
        <div
          className="flex flex-col sm:flex-row items-end justify-end gap-4 sm:gap-6 text-sm mb-4"
          style={{ color: colors.subText }}
        >
          <Link
            to="/faq"
            className="hover:text-white transition-colors duration-200 underline"
          >
            {t("footer.faq")}
          </Link>
          <span className="hidden sm:inline text-slate-600">|</span>
          <Link
            to="/privacy-policy"
            className="hover:text-white transition-colors duration-200 underline"
          >
            {t("footer.privacy")}
          </Link>
          <span className="hidden sm:inline text-slate-600">|</span>
          <Link
            to="/terms"
            className="hover:text-white transition-colors duration-200 underline"
          >
            {t("footer.terms")}
          </Link>
        </div>

        {/* 저작권 */}
        <p className="text-center text-xs" style={{ color: colors.subText }}>
          {t("footer.copyright")}
        </p>
      </div>
    </footer>
  );
}

export default Footer;
