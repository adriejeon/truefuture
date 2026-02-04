import { Link } from "react-router-dom";
import { colors } from "../constants/colors";

function Footer() {
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
          <p className="font-semibold">진짜미래</p>
          <p>대표 Adrie Jeon</p>
          <p>사업자등록번호 344-30-02017</p>
          <p>통신판매번호 2026-서울관악-0149</p>
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
            to="/privacy-policy"
            className="hover:text-white transition-colors duration-200 underline"
          >
            개인정보처리방침
          </Link>
          <span className="hidden sm:inline text-slate-600">|</span>
          <Link
            to="/terms"
            className="hover:text-white transition-colors duration-200 underline"
          >
            이용약관
          </Link>
        </div>

        {/* 저작권 */}
        <p className="text-center text-xs" style={{ color: colors.subText }}>
          © 2026 주피터. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
