import { useState } from "react";
import { useTranslation } from "react-i18next";
import { colors } from "../constants/colors";

export default function EquipmentGuidePanel() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const GUIDE_ITEMS = [
    {
      id: "telescope",
      name: t("equipment_guide.telescope_name"),
      description: t("equipment_guide.telescope_desc"),
    },
    {
      id: "compass",
      name: t("equipment_guide.compass_name"),
      description: t("equipment_guide.compass_desc"),
    },
    {
      id: "probe",
      name: t("equipment_guide.probe_name"),
      description: t("equipment_guide.probe_desc"),
    },
  ];

  return (
    <div className="mb-6 rounded-xl border border-slate-600/80 bg-slate-800/20 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-700/20 min-[380px]:px-5 min-[380px]:py-3.5"
        aria-expanded={isOpen}
      >
        <span className="text-xs text-white min-[380px]:text-sm">
          {t("equipment_guide.title")}
        </span>
        <span className="text-slate-500 text-sm tabular-nums">
          {isOpen ? t("equipment_guide.collapse") : t("equipment_guide.expand")}
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
