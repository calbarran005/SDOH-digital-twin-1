// Exportación de gráficas/figuras (Recharts SVG, tablas HTML, mapas) a PNG en
// alta resolución y a SVG vectorial, sin dependencias externas.

const SVG_STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "paint-order",
  "color",
];

const HTML_STYLE_PROPS = [
  "color",
  "background-color",
  "background-image",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "border-collapse",
  "border-spacing",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "vertical-align",
  "white-space",
  "display",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "max-width",
  "grid-template-columns",
  "grid-template-rows",
  "gap",
  "justify-content",
  "align-items",
  "flex-direction",
  "flex-wrap",
  "opacity",
  "overflow",
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo rasterizar la figura"));
    img.src = src;
  });
}

/** Clona el árbol copiando los estilos resueltos como estilos en línea. */
function inlineStyles(source: Element, target: Element): void {
  const cs = window.getComputedStyle(source);
  const props = source instanceof SVGElement ? SVG_STYLE_PROPS : HTML_STYLE_PROPS;
  let style = "";
  for (const prop of props) {
    const value = cs.getPropertyValue(prop);
    if (value) style += `${prop}:${value};`;
  }
  const existing = target.getAttribute("style") || "";
  target.setAttribute("style", style + existing);
  const sChildren = source.children;
  const tChildren = target.children;
  const count = Math.min(sChildren.length, tChildren.length);
  for (let i = 0; i < count; i += 1) inlineStyles(sChildren[i], tChildren[i]);
}

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba | null {
  const m = value.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2], parts.length >= 4 ? parts[3] : 1];
}

function composite(base: Rgba, top: Rgba): Rgba {
  const a = top[3] + base[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  const mix = (i: number) => (top[i] * top[3] + base[i] * base[3] * (1 - top[3])) / a;
  return [mix(0), mix(1), mix(2), a];
}

/** Color de fondo resultante de componer los ancestros (para PNG sin transparencia). */
export function resolveBackground(el: HTMLElement | null): string {
  const layers: Rgba[] = [];
  let node: HTMLElement | null = el;
  while (node) {
    const color = parseColor(window.getComputedStyle(node).backgroundColor);
    if (color) layers.push(color);
    node = node.parentElement;
  }
  let out: Rgba = [255, 255, 255, 1];
  for (let i = layers.length - 1; i >= 0; i -= 1) out = composite(out, layers[i]);
  const [r, g, b, a] = out;
  if (a === 0) return "#ffffff";
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function rasterize(
  svgMarkup: string,
  width: number,
  height: number,
  scale: number,
  background?: string
): Promise<Blob> {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob falló"))),
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function findSvg(root: HTMLElement | null): SVGSVGElement | null {
  return root ? root.querySelector("svg") : null;
}

/** Serializa el SVG de una gráfica (Recharts) a texto SVG autónomo. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  const rect = svg.getBoundingClientRect();
  const width = svg.width.baseVal.value || rect.width;
  const height = svg.height.baseVal.value || rect.height;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  return new XMLSerializer().serializeToString(clone);
}

/** Serializa cualquier nodo HTML (incluido su SVG interno) dentro de un foreignObject. */
export function serializeNodeAsSvg(node: HTMLElement): string {
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  const clone = node.cloneNode(true) as HTMLElement;
  inlineStyles(node, clone);
  clone
    .querySelectorAll("[data-export-ignore], .recharts-tooltip-wrapper")
    .forEach((n) => n.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.margin = "0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.boxSizing = "border-box";
  const xml = new XMLSerializer().serializeToString(clone);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" ` +
    `height="${height}">${xml}</foreignObject></svg>`
  );
}

/** Descarga un nodo completo (gráfica + leyenda / tabla) como PNG en alta resolución. */
export async function downloadNodeAsPng(
  node: HTMLElement,
  filename: string,
  scale = 3
): Promise<void> {
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  if (!width || !height) throw new Error("La figura no tiene tamaño");
  const background = resolveBackground(node);
  try {
    const markup = serializeNodeAsSvg(node);
    const blob = await rasterize(markup, width, height, scale, background);
    triggerDownload(blob, `${filename}.png`);
  } catch (err) {
    // Respaldo: si el nodo contiene un SVG, rasterizar solo la gráfica vectorial.
    const svg = findSvg(node);
    if (!svg) throw err;
    const rect = svg.getBoundingClientRect();
    const blob = await rasterize(serializeSvg(svg), rect.width, rect.height, scale, background);
    triggerDownload(blob, `${filename}.png`);
  }
}

/** Descarga el SVG vectorial de una gráfica Recharts (si el nodo contiene uno). */
export function downloadNodeAsSvg(node: HTMLElement, filename: string): void {
  const svg = findSvg(node);
  if (!svg) throw new Error("No hay SVG que exportar");
  const markup = serializeSvg(svg);
  triggerDownload(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
    `${filename}.svg`
  );
}

/** Descarga un canvas (p. ej. el gemelo 3D) como PNG. */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, `${filename}.png`);
  }, "image/png");
}

export { triggerDownload };
