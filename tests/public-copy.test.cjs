const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("le titre utilise un balisage HTML correct, sans Markdown brut", () => {
  assert.match(html, /<h1>Les cadeaux qui font <em>plaisir<\/em>\.<\/h1>/);
  assert.doesNotMatch(html, /\*plaisir\.?\*/);
  assert.match(html, /h1 em\{font-style:normal;color:var\(--purple\)\}/);
});

test("la promesse explique clairement comment éviter les cadeaux en double", () => {
  assert.match(html, /éviter que deux personnes choisissent le même cadeau/);
  assert.doesNotMatch(html, /sans doublons/);
});

test("l’aperçu n’affiche plus de prix vides ni de disclaimers répétés", () => {
  assert.equal((html.match(/Aperçu fictif/g) || []).length, 1);
  assert.doesNotMatch(html, /Idée fictive/);
  assert.doesNotMatch(html, /class="price">—/);
  assert.doesNotMatch(html, /Prototype fictif/);
  assert.match(html, /Des idées pour un anniversaire, Noël ou une autre occasion à célébrer\./);
});

test("les appels à l’action sont concrets et gardent le vouvoiement", () => {
  assert.match(html, /Découvrir l’invitation de démonstration/);
  assert.match(html, /Envie de découvrir Wishly \?/);
  assert.match(html, /Ouvrez la liste de démonstration de Camille/);
  assert.doesNotMatch(html, /Prêt à découvrir Wishly/);
  assert.doesNotMatch(html, /Ouvre la liste de démonstration/);
  assert.doesNotMatch(html, /Voir invitation et cadeaux fictifs/);
});

test("les apostrophes sont cohérentes et le bandeau de la maquette garde un espacement", () => {
  assert.match(html, /l’administration/);
  assert.match(html, /l’interface/);
  assert.doesNotMatch(html, /l'administration/);
  assert.doesNotMatch(html, /l'interface/);
  assert.match(html, /\.mock-top\{[^}]*gap:12px;flex-wrap:wrap/);
});

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("les textes secondaires atteignent au moins 6:1 sur le papier et le CTA", () => {
  const muted = html.match(/--muted:(#[0-9a-fA-F]{6})/)[1];
  assert.ok(contrastRatio(muted, "#fbf7f2") >= 6, "contraste sur le fond papier");
  assert.ok(contrastRatio(muted, "#f0e7f4") >= 4.5, "contraste AA sur le fond du CTA");
});

test("les liens ont un focus visible et les liens de navigation restent tactiles sur mobile", () => {
  assert.match(html, /a:focus-visible\{outline:3px solid var\(--ink\);outline-offset:3px/);
  assert.match(html, /footer a:hover,footer a:focus-visible\{text-decoration:underline\}/);
  assert.match(html, /nav a\{display:inline-flex;align-items:center;min-height:44px;padding:10px 4px\}/);
});

test("les éléments décoratifs ne polluent pas la navigation des lecteurs d’écran", () => {
  assert.match(html, /<div class="preview" aria-hidden="true">/);
  assert.doesNotMatch(html, /class="preview" aria-label=/);
  assert.match(html, /Ouvrir la liste de démonstration <span aria-hidden="true">→<\/span>/);
  assert.match(html, /<a href="\.\/communaute\.html"><span aria-hidden="true">💬<\/span> Communauté<\/a>/);
  assert.match(html, /<a href="\.\/confidentialite\.html"><span aria-hidden="true">🔒<\/span> Confidentialité<\/a>/);
});

test("les propriétés CSS signalées comme coupées sont présentes dans le code source réel", () => {
  assert.match(html, /transition:transform \.15s ease,box-shadow \.15s ease/);
  assert.match(html, /\.bottom-cta\{background:#f0e7f4;border-radius:26px;padding:34px/);
  assert.match(html, /<section class="section" style="padding-top:0">/);
});
