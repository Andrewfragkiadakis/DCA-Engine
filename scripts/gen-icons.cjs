// Regenerates src/brandIcons.js from @iconify-json/simple-icons.
//
// Icon data is committed rather than fetched at runtime: the Iconify API would add
// third-party requests from a private finance app, and the app's CSP only allows
// connect-src 'self'. Bundling also keeps the icons working offline in the PWA.
//
// Usage:  npm i -D @iconify-json/simple-icons && node scripts/gen-icons.cjs
const fs = require("fs");
const path = require("path");

const WANTED = {
  apple: "apple",
  microsoft: "microsoft",
  nvidia: "nvidia",
  cocacola: "cocacola",
  bitcoin: "bitcoin",
  ethereum: "ethereum",
};

const set = require("@iconify-json/simple-icons/icons.json");

const out = {};
for (const [key, name] of Object.entries(WANTED)) {
  const icon = set.icons[name];
  if (!icon) throw new Error(`simple-icons is missing "${name}"`);
  out[key] = {
    body: icon.body,
    width: icon.width || set.width || 24,
    height: icon.height || set.height || 24,
  };
}

const header = [
  "// Brand marks extracted from @iconify-json/simple-icons at build time.",
  "// Bundled locally on purpose: the Iconify runtime API would mean third-party requests",
  "// from a private finance app and would be blocked by our CSP (connect-src 'self').",
  "// Regenerate with: node scripts/gen-icons.cjs",
  "",
  "",
].join("\n");

fs.writeFileSync(
  path.join(__dirname, "..", "src", "brandIcons.js"),
  header + "export const BRAND_ICONS = " + JSON.stringify(out, null, 2) + ";\n"
);
console.log(`wrote src/brandIcons.js (${Object.keys(out).length} icons)`);
