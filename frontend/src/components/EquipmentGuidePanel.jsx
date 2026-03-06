import { useState } from "react";
import { colors } from "../constants/colors";

// 기존 상점 페이지와 동일한 아이콘
const GUIDE_ITEMS = [
  {
    id: "telescope",
    name: "망원경",
    description: "진짜미래, 진짜궁합 열람권",
  },
  {
    id: "compass",
    name: "나침반",
    description: "오늘의 운세 열람권",
  },
  {
    id: "probe",
    name: "탐사선",
    description: "종합 운세 열람권",
  },
];

export default function EquipmentGuidePanel() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-6 rounded-xl border border-slate-600/80 bg-slate-800/20 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-700/20 min-[380px]:px-5 min-[380px]:py-3.5"
        aria-expanded={isOpen}
      >
        <span className="text-xs text-white min-[380px]:text-sm">
          장비 사용 가이드
        </span>
        <span className="text-slate-500 text-sm tabular-nums">
          {isOpen ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-600/60 px-4 pb-4 pt-3 min-[380px]:px-5 min-[380px]:pb-5 min-[380px]:pt-4">
          <ul className="flex flex-col gap-3 min-[380px]:gap-4">
            {GUIDE_ITEMS.map((item) => (
              <li key={item.id}>
                <div className="min-w-0">
                  <span className="font-semibold text-white">{item.name}</span>
                  <span style={{ color: colors.subText }}>
                    : {item.description}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
