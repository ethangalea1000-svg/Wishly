const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const demo = fs.readFileSync(path.join(root, "demo-anniversaire.html"), "utf8");
const shared = fs.readFileSync(path.join(root, "wishly-app", "shared.html"), "utf8");
const privacy = fs.readFileSync(path.join(root, "wishly-app", "confidentialite.html"), "utf8");

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("la démonstration anniversaire offre un lien d’évitement et un focus visible", () => {
  assert.match(demo, /<a class="skip-link" href="#main-content">Aller au contenu principal<\/a>/);
  assert.match(demo, /<main class="wrap" id="main-content">/);
  assert.match(demo, /a:focus-visible,button:focus-visible\{outline:3px solid var\(--accent\);outline-offset:3px\}/);
  assert.match(demo, /<div class="brand">wish<span>ly<\/span> <span aria-hidden="true">✳<\/span><\/div>/);
  for (let n = 1; n <= 6; n++) assert.match(demo, new RegExp('<div class="gift-number" aria-hidden="true">' + n + '<\\/div>'));
});

test("la page d’invitation partagée permet de sauter au contenu et a un focus contrasté", () => {
  assert.match(shared, /<a class="skip-link" href="#main-content">Aller au contenu principal<\/a>/);
  assert.match(shared, /<main id="main-content">/);
  assert.match(shared, /:focus-visible\{outline:3px solid #6553c8;outline-offset:3px\}/);
  assert.match(shared, /<label for="reservationId">Référence<\/label>/);
  assert.match(shared, /<label for="cancelToken">Code d’annulation<\/label>/);
  assert.ok(contrastRatio("#6553c8", "#ffffff") >= 3, "l’indicateur de focus doit être visible sur le fond blanc");
});

test("la politique de confidentialité a un lien d’évitement et un focus clavier visible", () => {
  assert.match(privacy, /<a class="skip-link" href="#main-content">Aller au contenu principal<\/a>/);
  assert.match(privacy, /<main id="main-content">/);
  assert.match(privacy, /a:focus-visible\{outline:3px solid #6553c8;outline-offset:3px\}/);
  assert.match(privacy, /Version de travail/);
});
