import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import LifetimeFortune from './pages/LifetimeFortune'
import Compatibility from './pages/Compatibility'
import YearlyFortune from './pages/YearlyFortune'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Terms from './pages/Terms'
import Footer from './components/Footer'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        <main className="flex-1 w-full">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/lifetime" element={<LifetimeFortune />} />
            <Route path="/compatibility" element={<Compatibility />} />
            <Route path="/yearly" element={<YearlyFortune />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}

export default App
