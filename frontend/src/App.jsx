import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Compatibility from "./pages/Compatibility";
import YearlyFortune from "./pages/YearlyFortune";
import Consultation from "./pages/Consultation";
import Home from "./pages/Home";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import FAQ from "./pages/FAQ";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Purchase from "./pages/Purchase";
import PurchaseHistory from "./pages/PurchaseHistory";
import PaymentComplete from "./pages/PaymentComplete";
import MyPage from "./pages/MyPage";
import Contact from "./pages/Contact";
import RefundInquiry from "./pages/RefundInquiry";
import Footer from "./components/Footer";
import GNB from "./components/GNB";
import { useAuth } from "./hooks/useAuth";
import { useTranslation } from "react-i18next";
import { DEFAULT_META, SITE_ORIGIN, getBrandImageAlt } from "./constants/seoMeta";

/** 로그인 여부와 관계없이 / → 메인(Home)으로 보냄 */
function RootRoute() {
  const { loadingAuth } = useAuth();
  if (loadingAuth) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }
  return <Home />;
}

function AppContent() {
  const location = useLocation();
  const { i18n } = useTranslation();
  // 메인 페이지(/)에서만 Footer 표시
  const showFooter = location.pathname === "/";
  const canonicalUrl = `${SITE_ORIGIN}${location.pathname}`;
  const shareImageAlt = getBrandImageAlt(i18n.language);

  return (
    <div className="min-h-screen text-white flex flex-col" style={{ colorScheme: "dark light" }}>
      {/* 기본 SEO: 점성술 페이지가 아닌 라우트에서 사용. 점성술 페이지는 각 페이지 Helmet으로 덮어씀 */}
      <Helmet>
        <title>{DEFAULT_META.title}</title>
        <meta name="description" content={DEFAULT_META.description} />
        <meta name="keywords" content={DEFAULT_META.keywords} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={DEFAULT_META.title} />
        <meta property="og:description" content={DEFAULT_META.description} />
        <meta property="og:image:alt" content={shareImageAlt} />
        <meta name="twitter:url" content={canonicalUrl} />
        <meta name="twitter:title" content={DEFAULT_META.title} />
        <meta name="twitter:description" content={DEFAULT_META.description} />
        <meta name="twitter:image:alt" content={shareImageAlt} />
      </Helmet>
      <GNB />
      <main
        className="flex-1 w-full"
        style={{
          background: "linear-gradient(to bottom, #343261 0%, #0F0F2B 100%)",
          color: "#ffffff",
        }}
      >
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/compatibility" element={<Compatibility />} />
          <Route path="/yearly" element={<YearlyFortune />} />
          <Route path="/consultation" element={<Consultation />} />
          <Route path="/consultation/:resultId" element={<Consultation />} />
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/purchase/history" element={<PurchaseHistory />} />
          <Route path="/payment/complete" element={<PaymentComplete />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/refund-inquiry" element={<RefundInquiry />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/faq" element={<FAQ />} />
        </Routes>
      </main>
      {showFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
