import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../store/language";

export default function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className="nav-item"
      onClick={toggleLanguage}
      title={language === "es" ? t("language.switchToEn") : t("language.switchToEs")}
    >
      <Globe size={18} />
      <span>{language === "es" ? "English" : "Español"}</span>
    </button>
  );
}
