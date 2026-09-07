import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../store/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className="nav-item"
      onClick={toggleTheme}
      title={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>
    </button>
  );
}
