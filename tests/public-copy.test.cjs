const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");

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
