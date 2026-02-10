import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Compatibility from "./pages/Compatibility";
import YearlyFortune from "./pages/YearlyFortune";
import Consultation from "./pages/Consultation";
import Home from "./pages/Home";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Login from "./pages/Login";
import Purchase from "./pages/Purchase";
import PurchaseHistory from "./pages/PurchaseHistory";
import PaymentComplete from "./pages/PaymentComplete";
import Footer from "./components/Footer";
import GNB from "./components/GNB";
import { useAuth } from "./hooks/useAuth";

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
  // 메인 페이지(/)에서만 Footer 표시
  const showFooter = location.pathname === "/";

  return (
    <div className="min-h-screen text-white flex flex-col" style={{ colorScheme: "dark light" }}>
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
          <Route path="/lifetime" element={<Navigate to="/yearly" replace />} />
          <Route path="/compatibility" element={<Compatibility />} />
          <Route path="/yearly" element={<YearlyFortune />} />
          <Route path="/consultation" element={<Consultation />} />
          <Route path="/consultation/:resultId" element={<Consultation />} />
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/purchase/history" element={<PurchaseHistory />} />
          <Route path="/payment/complete" element={<PaymentComplete />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
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
