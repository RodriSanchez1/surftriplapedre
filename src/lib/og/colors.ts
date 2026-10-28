/** Reads the `--c-*` colors from src/styles/tokens.css, so images and meta tags use the same palette as the site. */
export function parseColors(css: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/--c-([a-z]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) colors[name] = value;
  return colors;
}
