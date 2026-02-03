import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Compatibility from "./pages/Compatibility";
import YearlyFortune from "./pages/YearlyFortune";
import Consultation from "./pages/Consultation";
import Home from "./pages/Home";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Login from "./pages/Login";
import Footer from "./components/Footer";
import GNB from "./components/GNB";
import { useAuth } from "./hooks/useAuth";

/** 로그인 여부에 따라 / → 메인(Home) 또는 /consultation으로 보냄 */
function RootRoute() {
  const { user, loadingAuth } = useAuth();
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
  if (user) {
    return <Navigate to="/consultation" replace />;
  }
  return <Home />;
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen text-white flex flex-col">
        <GNB />
        <main
          className="flex-1 w-full"
          style={{
            background: "linear-gradient(to bottom, #343261 0%, #0F0F2B 100%)",
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
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
