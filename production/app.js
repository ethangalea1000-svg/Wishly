  (() => {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const state = { mode: "login", user: null, lists: [], selected: null };
    const notice = (id, message = "", error = false) => {
      const node = $(id); node.textContent = message; node.classList.toggle("hidden", !message); node.classList.toggle("error", error);
    };
    const api = async (path, options = {}) => {
      const response = await fetch("/api/" + path.replace(/^\//, ""), {
        credentials: "same-origin",
        ...options,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Une erreur est survenue. Réessaie.");
      return payload;
    };
    const setMode = (mode) => {
      state.mode = mode;
      $("nameField").classList.toggle("hidden", mode !== "register");
      $("password").autocomplete = mode === "register" ? "new-password" : "current-password";
      $("password").minLength = mode === "register" ? 12 : 1;
      $("authSubmit").textContent = mode === "register" ? "Créer mon compte" : "Se connecter";
      $("showLogin").setAttribute("aria-pressed", String(mode === "login"));
      $("showRegister").setAttribute("aria-pressed", String(mode === "register"));
      notice("notice");
    };
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
    const showApp = (user) => {
      state.user = user;
      $("authView").classList.add("hidden");
      $("appView").classList.remove("hidden");
      $("logoutBtn").classList.remove("hidden");
      $("accountLabel").textContent = user.displayName || user.email;
      $("welcomeTitle").textContent = "Bonjour " + (user.displayName || "et bienvenue");
      loadLists();
    };
    const showAuth = () => {
      state.user = null; state.lists = []; state.selected = null;
      $("authView").classList.remove("hidden"); $("appView").classList.add("hidden");
      $("logoutBtn").classList.add("hidden"); $("accountLabel").textContent = "";
    };
    async function loadLists() {
      try {
        const result = await api("lists");
        state.lists = result.lists || [];
        renderLists();
        if (state.selected && state.lists.some(x => x.id === state.selected)) await openList(state.selected);
        else if (state.lists.length) await openList(state.lists[0].id);
        else {
          state.selected = null;
          $("listDetail").innerHTML = '<div class="empty"><h2>Aucune liste pour le moment</h2>Crée ta première liste avec le formulaire à gauche.</div>';
        }
      } catch (error) { notice("appNotice", error.message, true); }
    }
    function renderLists() {
      const node = $("lists"); node.replaceChildren();
      if (!state.lists.length) { node.innerHTML = '<div class="empty">Pas encore de liste.</div>'; return; }
      state.lists.forEach(list => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "list-choice";
        button.setAttribute("aria-current", String(list.id === state.selected));
        const title = document.createElement("strong"); title.textContent = list.title;
        const desc = document.createElement("span"); desc.className = "muted"; desc.textContent = list.description || "Liste de cadeaux";
        button.append(title, desc); button.addEventListener("click", () => openList(list.id));
        node.append(button);
      });
    }
    async function openList(id) {
      state.selected = id; renderLists();
      try {
        const result = await api("lists/" + encodeURIComponent(id));
        const list = result.list; const items = result.items || [];
        const detail = $("listDetail"); detail.replaceChildren();
        const heading = document.createElement("div"); heading.className = "row between";
        const title = document.createElement("h2"); title.id = "selectedTitle"; title.textContent = list.title;
        const badge = document.createElement("span"); badge.className = "pill"; badge.textContent = "Privée";
        heading.append(title, badge); detail.append(heading);
        if (list.description) { const p = document.createElement("p"); p.className = "muted"; p.textContent = list.description; detail.append(p); }
        const itemTitle = document.createElement("h2"); itemTitle.textContent = "Idées de cadeaux"; itemTitle.style.marginTop = "1.4rem"; detail.append(itemTitle);
        if (!items.length) { const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Ajoute ta première idée ci-dessous."; detail.append(empty); }
        items.forEach(item => {
          const card = document.createElement("article"); card.className = "gift";
          const h = document.createElement("h3"); h.textContent = item.title;
          const p = document.createElement("p"); p.className = "muted"; p.textContent = item.description || "Aucune description";
          card.append(h,p);
          if (item.url) { const a = document.createElement("a"); a.href = item.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "Ouvrir le lien du cadeau"; card.append(a); }
          const meta = document.createElement("p"); meta.className = "muted"; meta.textContent = "Quantité : " + item.quantity + " · Priorité : " + item.priority; card.append(meta);
          detail.append(card);
        });
        const form = document.createElement("form"); form.id = "itemForm"; form.style.marginTop = "1.4rem";
        form.innerHTML = '<h2>Ajouter une idée</h2><div class="field"><label for="itemTitle">Nom du cadeau</label><input id="itemTitle" maxlength="160" required></div><div class="field"><label for="itemUrl">Lien (facultatif)</label><input id="itemUrl" type="url" maxlength="2048" placeholder="https://…"></div><div class="field"><label for="itemDescription">Description (facultatif)</label><textarea id="itemDescription" maxlength="2000"></textarea></div><div class="row"><div class="field" style="flex:1"><label for="itemQuantity">Quantité</label><input id="itemQuantity" type="number" min="1" max="99" value="1" required></div><div class="field" style="flex:1"><label for="itemPriority">Priorité</label><select id="itemPriority"><option value="1">Basse</option><option value="2" selected>Normale</option><option value="3">Haute</option></select></div></div><button class="btn" type="submit">Ajouter le cadeau</button>';
        form.addEventListener("submit", async event => {
          event.preventDefault();
          try {
            await api("lists/" + encodeURIComponent(id) + "/items", { method:"POST", body:JSON.stringify({
              title:$("itemTitle").value, url:$("itemUrl").value || null, description:$("itemDescription").value,
              quantity:Number($("itemQuantity").value), priority:Number($("itemPriority").value)
            })});
            notice("appNotice", "Cadeau ajouté."); await openList(id);
          } catch (error) { notice("appNotice", error.message, true); }
        });
        detail.append(form);
      } catch (error) { notice("appNotice", error.message, true); }
    }
    $("showLogin").addEventListener("click", () => setMode("login"));
    $("showRegister").addEventListener("click", () => setMode("register"));
    $("authForm").addEventListener("submit", async event => {
      event.preventDefault(); notice("notice");
      const body = { email:$("email").value, password:$("password").value };
      if (state.mode === "register") body.displayName = $("displayName").value;
      try {
        const result = await api("auth/" + (state.mode === "register" ? "register" : "login"), { method:"POST", body:JSON.stringify(body) });
        showApp(result.user);
      } catch (error) { notice("notice", error.message, true); }
    });
    $("listForm").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const result = await api("lists", { method:"POST", body:JSON.stringify({ title:$("listTitle").value, description:$("listDescription").value, visibility:$("visibility").value }) });
        $("listTitle").value = ""; $("listDescription").value = "";
        state.selected = result.list.id; notice("appNotice", "Liste créée."); await loadLists();
      } catch (error) { notice("appNotice", error.message, true); }
    });
    $("logoutBtn").addEventListener("click", async () => {
      try { await api("auth/logout", { method:"POST", body:JSON.stringify({}) }); } finally { showAuth(); }
    });
    setMode("login");
    api("auth/me").then(result => showApp(result.user)).catch(() => showAuth());
  })();
