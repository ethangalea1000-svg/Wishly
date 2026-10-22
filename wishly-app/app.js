  (() => {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const state = { mode: "login", user: null, lists: [], selected: null, listLoadVersion: 0 };
    const API_BASE_URL = "https://wishly-production-api.ethan-galea1000.workers.dev";
    const TOKEN_KEY = "wishly_session_token";
    const notice = (id, message = "", error = false) => {
      const node = $(id); node.textContent = message; node.classList.toggle("hidden", !message); node.classList.toggle("error", error);
    };
    const api = async (path, options = {}) => {
      const token = sessionStorage.getItem(TOKEN_KEY);
      let response;
      try {
        response = await fetch(API_BASE_URL + "/api/" + path.replace(/^\//, ""), {
        ...options,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { "Authorization": "Bearer " + token } : {}), ...(options.headers || {}) }
        });
      } catch (cause) {
        const message = navigator.onLine === false
          ? "Ton navigateur indique que tu es hors connexion. Vérifie ta connexion Internet, puis réessaie."
          : "La requête n’a reçu aucune réponse de l’API Wishly. Vérifie la connexion, les extensions du navigateur et l’onglet Réseau de F12, puis réessaie.";
        const error = new Error(message);
        error.name = "NetworkError";
        throw error;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Erreur HTTP ${response.status}. Réessaie.`);
        error.status = response.status;
        throw error;
      }
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
      $("exportBtn").classList.remove("hidden");
      $("deleteAccountBtn").classList.remove("hidden");
      $("accountLabel").textContent = user.displayName || user.email;
      $("welcomeTitle").textContent = "Bonjour " + (user.displayName || "et bienvenue");
      loadLists();
    };
    const showAuth = () => {
      state.user = null; state.lists = []; state.selected = null;
      $("authView").classList.remove("hidden"); $("appView").classList.add("hidden");
      $("logoutBtn").classList.add("hidden"); $("exportBtn").classList.add("hidden"); $("deleteAccountBtn").classList.add("hidden"); $("accountLabel").textContent = "";
    };
    async function loadLists() {
      const requestVersion = ++state.listLoadVersion;
      try {
        const result = await api("lists");
        // Ignore stale responses when list refreshes overlap (e.g. login + create list).
        if (requestVersion !== state.listLoadVersion) return;
        state.lists = result.lists || [];
        renderLists();
        if (state.selected && state.lists.some(x => x.id === state.selected)) await openList(state.selected);
        else if (state.lists.length) await openList(state.lists[0].id);
        else {
          state.selected = null;
          $("listDetail").innerHTML = '<div class="empty"><h2>Aucune liste pour le moment</h2>Crée ta première liste avec le formulaire à gauche.</div>';
        }
      } catch (error) {
        if (requestVersion === state.listLoadVersion) notice("appNotice", error.message, true);
      }
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
        const actions = document.createElement("div"); actions.className = "row"; actions.style.margin = ".8rem 0 1.2rem";
        const actionButton = (label, cls, handler) => { const b=document.createElement("button"); b.type="button"; b.className="btn "+(cls||"secondary"); b.textContent=label; b.addEventListener("click",handler); actions.append(b); return b; };
        actionButton("Partager", "secondary", async () => {
          try {
            const result=await api("lists/"+encodeURIComponent(id)+"/share",{method:"POST",body:JSON.stringify({})});
            const shareUrl=new URL("./shared.html?token="+encodeURIComponent(result.shareToken),location.href).href;
            try { await navigator.clipboard.writeText(shareUrl); notice("appNotice","Lien de partage copié."); }
            catch { notice("appNotice","Lien de partage : "+shareUrl); }
          } catch(error) { notice("appNotice",error.message,true); }
        });
        actionButton("Désactiver le lien", "secondary", async () => {
          if(!confirm("Désactiver le lien public actuel ? Les invités ne pourront plus ouvrir cette liste avec ce lien."))return;
          try { await api("lists/"+encodeURIComponent(id)+"/share",{method:"POST",body:JSON.stringify({revoke:true})}); notice("appNotice","Lien de partage désactivé."); }
          catch(error){notice("appNotice",error.message,true);}
        });
        actionButton("Dupliquer", "secondary", async () => {
          try { const result=await api("lists/"+encodeURIComponent(id)+"/duplicate",{method:"POST",body:JSON.stringify({})}); notice("appNotice","Liste dupliquée."); state.selected=result.list.id; await loadLists(); }
          catch(error){notice("appNotice",error.message,true);}
        });
        actionButton("Archiver / restaurer", "secondary", async () => {
          try { await api("lists/"+encodeURIComponent(id)+"/archive",{method:"POST",body:JSON.stringify({})}); notice("appNotice","État d’archivage modifié."); await loadLists(); }
          catch(error){notice("appNotice",error.message,true);}
        });
        actionButton("Supprimer la liste", "danger", async () => {
          if(!confirm("Supprimer définitivement cette liste et ses cadeaux ?")) return;
          try { await api("lists/"+encodeURIComponent(id),{method:"DELETE"}); state.selected=null; notice("appNotice","Liste supprimée."); await loadLists(); }
          catch(error){notice("appNotice",error.message,true);}
        });
        detail.append(actions);
        if (list.description) { const p = document.createElement("p"); p.className = "muted"; p.textContent = list.description; detail.append(p); }
        const metadata=[];
        if(list.occasion)metadata.push(list.occasion);
        if(list.event_date)metadata.push(new Date(list.event_date+"T12:00:00").toLocaleDateString("fr-FR"));
        if(list.currency)metadata.push(list.currency);
        if(metadata.length){const p=document.createElement("p");p.className="muted";p.textContent=metadata.join(" · ");detail.append(p);}
        const editDetails=document.createElement("details");editDetails.style.margin="1rem 0";
        editDetails.innerHTML='<summary style="cursor:pointer;font-weight:700;padding:.5rem 0">Modifier les détails de la liste</summary><form class="stack" style="margin-top:.8rem"><div class="field"><label for="editListTitle">Titre</label><input id="editListTitle" maxlength="100" required></div><div class="field"><label for="editListDescription">Description</label><textarea id="editListDescription" maxlength="2000"></textarea></div><div class="field"><label for="editListOccasion">Occasion</label><input id="editListOccasion" maxlength="80"></div><div class="field"><label for="editListDate">Date</label><input id="editListDate" type="date"></div><div class="field"><label for="editListCurrency">Devise</label><select id="editListCurrency"><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="CAD">CAD</option><option value="CHF">CHF</option><option value="JPY">JPY</option></select></div><button class="btn" type="submit">Enregistrer les détails</button></form>';
        editDetails.querySelector("#editListTitle").value=list.title||"";
        editDetails.querySelector("#editListDescription").value=list.description||"";
        editDetails.querySelector("#editListOccasion").value=list.occasion||"";
        editDetails.querySelector("#editListDate").value=list.event_date||"";
        editDetails.querySelector("#editListCurrency").value=list.currency||"EUR";
        editDetails.querySelector("form").addEventListener("submit",async event=>{
          event.preventDefault();
          try{
            await api("lists/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({
              title:editDetails.querySelector("#editListTitle").value,
              description:editDetails.querySelector("#editListDescription").value,
              occasion:editDetails.querySelector("#editListOccasion").value||null,
              eventDate:editDetails.querySelector("#editListDate").value||null,
              currency:editDetails.querySelector("#editListCurrency").value
            })});
            notice("appNotice","Détails de la liste enregistrés.");await openList(id);
          }catch(error){notice("appNotice",error.message,true);}
        });
        detail.append(editDetails);
        const itemTitle = document.createElement("h2"); itemTitle.textContent = "Idées de cadeaux"; itemTitle.style.marginTop = "1.4rem"; detail.append(itemTitle);
        const itemToolbar=document.createElement("div");itemToolbar.className="row";itemToolbar.style.margin=".7rem 0";
        const itemFilter=document.createElement("input");itemFilter.type="search";itemFilter.placeholder="Rechercher un cadeau";itemFilter.setAttribute("aria-label","Rechercher dans les cadeaux");itemFilter.style.flex="1";
        const itemSort=document.createElement("select");itemSort.setAttribute("aria-label","Trier les cadeaux");
        [["newest","Plus récents"],["priority","Priorité"],["price","Prix croissant"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;itemSort.append(option);});
        itemToolbar.append(itemFilter,itemSort);detail.append(itemToolbar);
        const itemContainer=document.createElement("div");detail.append(itemContainer);
        const sortAndFilter=()=>{
          const query=itemFilter.value.trim().toLocaleLowerCase("fr");
          const cards=Array.from(itemContainer.children).filter(node=>node instanceof HTMLElement);
          cards.forEach(card=>{card.hidden=!(card.dataset.search||"").includes(query);});
          cards.sort((a,b)=>{
            if(itemSort.value==="priority")return Number(b.dataset.priority)-Number(a.dataset.priority);
            if(itemSort.value==="price")return Number(a.dataset.price)-Number(b.dataset.price);
            return String(b.dataset.created).localeCompare(String(a.dataset.created));
          });
          cards.forEach(card=>itemContainer.append(card));
        };
        itemFilter.addEventListener("input",sortAndFilter);itemSort.addEventListener("change",sortAndFilter);
        if (!items.length) { const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Ajoute ta première idée ci-dessous."; detail.append(empty); }
        items.forEach(item => {
          const card = document.createElement("article"); card.className = "gift"; card.dataset.priority=String(item.priority||2); card.dataset.price=String(item.price_minor==null?999999999999:item.price_minor); card.dataset.created=String(item.created_at||""); card.dataset.search=[item.title,item.description,item.category].filter(Boolean).join(" ").toLocaleLowerCase("fr");
          const h = document.createElement("h3"); h.textContent = item.title;
          const p = document.createElement("p"); p.className = "muted"; p.textContent = item.description || "Aucune description";
          card.append(h,p);
          const giftActions=document.createElement("div"); giftActions.className="row"; giftActions.style.marginTop=".7rem";
          const editGift=document.createElement("button"); editGift.type="button"; editGift.className="btn secondary"; editGift.textContent="Modifier";
          editGift.addEventListener("click",async()=>{
            const nextTitle=prompt("Nom du cadeau :",item.title); if(nextTitle===null)return;
            try{await api("lists/"+encodeURIComponent(id)+"/items/"+encodeURIComponent(item.id),{method:"PATCH",body:JSON.stringify({title:nextTitle})});notice("appNotice","Cadeau modifié.");await openList(id);}
            catch(error){notice("appNotice",error.message,true);}
          });
          const deleteGift=document.createElement("button"); deleteGift.type="button"; deleteGift.className="btn danger"; deleteGift.textContent="Supprimer";
          deleteGift.addEventListener("click",async()=>{
            if(!confirm("Supprimer ce cadeau ?"))return;
            try{await api("lists/"+encodeURIComponent(id)+"/items/"+encodeURIComponent(item.id),{method:"DELETE"});notice("appNotice","Cadeau supprimé.");await openList(id);}
            catch(error){notice("appNotice",error.message,true);}
          });
          giftActions.append(editGift,deleteGift); card.append(giftActions);
          if (item.url) { const a = document.createElement("a"); a.href = item.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "Ouvrir le lien du cadeau"; card.append(a); }
          const meta = document.createElement("p"); meta.className = "muted"; meta.textContent = "Quantité : " + item.quantity + " · Priorité : " + item.priority + (item.price_minor == null ? "" : " · Prix : " + new Intl.NumberFormat("fr-FR", {style:"currency",currency:item.currency || list.currency || "EUR"}).format(item.price_minor / 100)); card.append(meta);
          const statusLabel=document.createElement("label");statusLabel.textContent="Statut du cadeau ";
          const statusSelect=document.createElement("select");
          [["wanted","À trouver"],["reserved","Réservé"],["purchased","Acheté"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;statusSelect.append(option);});
          statusSelect.value=item.status||"wanted";statusSelect.dataset.savedStatus=statusSelect.value;
          statusSelect.addEventListener("change",async()=>{
            try{await api("lists/"+encodeURIComponent(id)+"/items/"+encodeURIComponent(item.id),{method:"PATCH",body:JSON.stringify({status:statusSelect.value})});statusSelect.dataset.savedStatus=statusSelect.value;notice("appNotice","Statut mis à jour.");}
            catch(error){statusSelect.value=statusSelect.dataset.savedStatus||"wanted";notice("appNotice",error.message,true);}
          });
          statusLabel.append(statusSelect);card.append(statusLabel);
          itemContainer.append(card);
        });
        sortAndFilter();
        const form = document.createElement("form"); form.id = "itemForm"; form.style.marginTop = "1.4rem";
        form.innerHTML = '<h2>Ajouter une idée</h2><div class="field"><label for="itemTitle">Nom du cadeau</label><input id="itemTitle" maxlength="160" required></div><div class="field"><label for="itemUrl">Lien (facultatif)</label><input id="itemUrl" type="url" maxlength="2048" placeholder="https://…"></div><div class="field"><label for="itemDescription">Description (facultatif)</label><textarea id="itemDescription" maxlength="2000"></textarea></div><div class="field"><label for="itemCategory">Catégorie (facultatif)</label><input id="itemCategory" maxlength="80" placeholder="Ex. Lecture, technologie…"></div><div class="row"><div class="field" style="flex:1"><label for="itemPrice">Prix estimé (facultatif)</label><input id="itemPrice" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" placeholder="0,00"></div><div class="field" style="flex:1"><label for="itemQuantity">Quantité</label><input id="itemQuantity" type="number" min="1" max="99" value="1" required></div><div class="field" style="flex:1"><label for="itemPriority">Priorité</label><select id="itemPriority"><option value="1">Basse</option><option value="2" selected>Normale</option><option value="3">Haute</option></select></div></div><button class="btn" type="submit">Ajouter le cadeau</button>';
        $("itemPrice").previousElementSibling.textContent = "Prix estimé en " + (list.currency || "EUR") + " (facultatif)";
        form.addEventListener("submit", async event => {
          event.preventDefault();
          try {
            await api("lists/" + encodeURIComponent(id) + "/items", { method:"POST", body:JSON.stringify({
              title:$("itemTitle").value, url:$("itemUrl").value || null, description:$("itemDescription").value, category:$("itemCategory").value || null,
              priceMinor:$("itemPrice").value === "" ? null : Math.round(Number($("itemPrice").value) * 100), currency:list.currency || "EUR",
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
      event.preventDefault();
      if ($("authSubmit").disabled) return;
      notice("notice");
      const submitButton = $("authSubmit");
      const originalLabel = state.mode === "register" ? "Créer mon compte" : "Se connecter";
      const body = { email:$("email").value, password:$("password").value };
      if (state.mode === "register") body.displayName = $("displayName").value;
      submitButton.disabled = true;
      submitButton.textContent = state.mode === "register" ? "Création en cours…" : "Connexion en cours…";
      try {
        const result = await api("auth/" + (state.mode === "register" ? "register" : "login"), { method:"POST", body:JSON.stringify(body) });
        if (!result.sessionToken) throw new Error("La session n’a pas pu être créée. Réessaie.");
        sessionStorage.setItem(TOKEN_KEY, result.sessionToken);
        showApp(result.user);
      } catch (error) {
        notice("notice", error.message, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    });
    $("listForm").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const result = await api("lists", { method:"POST", body:JSON.stringify({ title:$("listTitle").value, description:$("listDescription").value, visibility:$("visibility").value, occasion:$("listOccasion").value || null, eventDate:$("listEventDate").value || null, currency:$("listCurrency").value }) });
        $("listTitle").value = ""; $("listDescription").value = ""; $("listOccasion").value = ""; $("listEventDate").value = "";
        state.selected = result.list.id; notice("appNotice", "Liste créée."); await loadLists();
      } catch (error) { notice("appNotice", error.message, true); }
    });
    $("logoutBtn").addEventListener("click", async () => {
      let logoutWarning = "";
      try {
        await api("auth/logout", { method:"POST", body:JSON.stringify({}) });
      } catch {
        logoutWarning = "Tu es déconnecté de cette page, mais Wishly n’a pas pu confirmer la révocation de la session côté serveur. Si tu es sur un appareil partagé, ferme aussi cet onglet.";
      } finally {
        sessionStorage.removeItem(TOKEN_KEY);
        showAuth();
      }
      notice("notice", logoutWarning || "Tu es bien déconnecté.", Boolean(logoutWarning));
    });
    $("deleteAccountBtn").addEventListener("click", async () => {
      if(!confirm("Supprimer définitivement ton compte, tes listes et tes cadeaux ? Cette action est irréversible."))return;
      const password=prompt("Pour confirmer, saisis ton mot de passe.");
      if(password===null||!password)return;
      const confirmEmail=prompt("Saisis l'adresse e-mail de ton compte pour confirmer.");
      if(confirmEmail===null)return;
      try {
        await api("account",{method:"DELETE",body:JSON.stringify({password,confirmEmail})});
        sessionStorage.removeItem(TOKEN_KEY);showAuth();notice("notice","Le compte et les listes associées ont été supprimés.");
      } catch(error){notice("appNotice",error.message,true);}
    });
    $("exportBtn").addEventListener("click", async () => {
      try {
        const data=await api("account/export");
        const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
        const objectUrl=URL.createObjectURL(blob);const link=document.createElement("a");
        link.href=objectUrl;link.download="wishly-export-"+new Date().toISOString().slice(0,10)+".json";
        document.body.append(link);link.click();link.remove();URL.revokeObjectURL(objectUrl);
        notice("appNotice","Export téléchargé. Conserve ce fichier dans un endroit sûr.");
      } catch(error){notice("appNotice",error.message,true);}
    });

    window.addEventListener("offline", () => {
      notice("notice", "Ton navigateur signale une perte de connexion Internet. Wishly réessaiera quand tu relanceras l’action.", true);
    });
    window.addEventListener("online", () => {
      if (navigator.onLine) notice("notice", "Connexion Internet rétablie. Tu peux réessayer.", false);
    });

    setMode("login");
    api("auth/me").then(result => showApp(result.user)).catch(error => {
      sessionStorage.removeItem(TOKEN_KEY);
      showAuth();
      if (error.status !== 401) notice("notice", error.message || "Impossible de vérifier la session. Réessaie.", true);
    });
  })();
