import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Image as ImageIcon, Loader2 } from "lucide-react";
import {
  downloadNodeAsPng,
  downloadNodeAsSvg,
  findSvg,
} from "../utils/figureExport";

interface FigureExportProps {
  /** Nombre de archivo (sin extensión) usado al descargar. */
  filename: string;
  children: React.ReactNode;
  className?: string;
  /** Factor de escala del PNG (3 = alta resolución). */
  scale?: number;
}

/**
 * Envuelve una gráfica o figura y añade botones (visibles al pasar el cursor)
 * para descargarla en PNG de alta resolución y, si es SVG, también en vectorial.
 */
export default function FigureExport({
  filename,
  children,
  className,
  scale = 3,
}: FigureExportProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [hasSvg, setHasSvg] = useState(false);
  const [error, setError] = useState(false);

  const detect = useCallback(() => {
    setHasSvg(Boolean(findSvg(ref.current)));
  }, []);

  useEffect(() => {
    detect();
    const node = ref.current;
    if (!node || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(detect);
    observer.observe(node, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [detect]);

  const handlePng = async () => {
    if (!ref.current) return;
    setBusy(true);
    setError(false);
    try {
      await downloadNodeAsPng(ref.current, filename, scale);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const handleSvg = () => {
    if (!ref.current) return;
    try {
      downloadNodeAsSvg(ref.current, filename);
    } catch {
      setError(true);
    }
  };

  return (
    <div ref={ref} className={`figure-export${className ? ` ${className}` : ""}`}>
      <div className="figure-export-actions" data-export-ignore="true">
        <button
          type="button"
          className="figure-export-btn"
          onClick={handlePng}
          disabled={busy}
          title={t("common.downloadPngHq")}
        >
          {busy ? <Loader2 size={13} className="spin-icon" /> : <Download size={13} />}
          <span>PNG</span>
        </button>
        {hasSvg && (
          <button
            type="button"
            className="figure-export-btn"
            onClick={handleSvg}
            title={t("common.downloadSvg")}
          >
            <ImageIcon size={13} />
            <span>SVG</span>
          </button>
        )}
      </div>
      {error && (
        <span className="figure-export-error" data-export-ignore="true">
          {t("common.downloadError")}
        </span>
      )}
      {children}
    </div>
  );
}
