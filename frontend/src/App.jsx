import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Compatibility from "./pages/Compatibility";
import YearlyFortune from "./pages/YearlyFortune";
import Consultation from "./pages/Consultation";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Login from "./pages/Login";
import Footer from "./components/Footer";
import GNB from "./components/GNB";

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
            <Route path="/" element={<Navigate to="/consultation" replace />} />
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
