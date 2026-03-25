import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { colors } from "../constants/colors";

function BottomNavigation({ activeTab }) {
  const { t } = useTranslation();
  const location = useLocation();

  const currentTab =
    location.pathname === "/"
      ? null
      : location.pathname.includes("/consultation")
      ? "consultation"
      : location.pathname.includes("/compatibility")
      ? "compatibility"
      : location.pathname.includes("/yearly")
      ? "yearly"
      : activeTab;

  const tabs = [
    {
      id: "consultation",
      path: "/consultation",
      labelKey: "bottom_nav.consultation",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
    },
    {
      id: "compatibility",
      path: "/compatibility",
      labelKey: "bottom_nav.compatibility",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      ),
    },
    {
      id: "yearly",
      path: "/yearly",
      labelKey: "bottom_nav.yearly",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t border-slate-700 z-50"
      style={{ backgroundColor: "#0F0F2B" }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-3 divide-x divide-slate-700">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;

            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={`
                  flex flex-col items-center justify-center py-3 px-2 sm:py-4 sm:px-4
                  transition-colors duration-200
                  ${
                    isActive
                      ? "text-primary"
                      : "hover:text-white hover:bg-slate-800/50"
                  }
                `}
                style={
                  isActive
                    ? { backgroundColor: "#343261", color: colors.primary }
                    : { color: colors.subText }
                }
              >
                <div className="mb-1">{tab.icon}</div>
                <span className="text-xs sm:text-sm font-medium text-center">
                  {t(tab.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default BottomNavigation;
