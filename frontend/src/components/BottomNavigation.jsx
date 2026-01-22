import { Link, useLocation } from 'react-router-dom'

function BottomNavigation({ activeTab }) {
  const location = useLocation()
  
  // 현재 경로에 따라 activeTab 결정
  const currentTab = location.pathname.includes('/lifetime') ? 'lifetime' 
    : location.pathname.includes('/compatibility') ? 'compatibility'
    : location.pathname.includes('/yearly') ? 'yearly'
    : activeTab
  const tabs = [
    {
      id: 'lifetime',
      path: '/lifetime',
      label: '인생 종합운',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      id: 'compatibility',
      path: '/compatibility',
      label: '궁합',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      )
    },
    {
      id: 'yearly',
      path: '/yearly',
      label: '1년 운세',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      )
    }
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 z-50">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-3 divide-x divide-slate-700">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id
            
            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={`
                  flex flex-col items-center justify-center py-3 px-2 sm:py-4 sm:px-4
                  transition-colors duration-200
                  ${isActive
                    ? 'bg-slate-700 text-blue-400' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }
                `}
              >
                <div className="mb-1">
                  {tab.icon}
                </div>
                <span className="text-xs sm:text-sm font-medium text-center">
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export default BottomNavigation
