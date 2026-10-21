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
        const actions = document.createElement("div"); actions.className = "row"; actions.style.margin = ".8rem 0 1.2rem";
        const actionButton = (label, cls, handler) => { const b=document.createElement("button"); b.type="button"; b.className="btn "+(cls||"secondary"); b.textContent=label; b.addEventListener("click",handler); actions.append(b); return b; };
        actionButton("Partager", "secondary", async () => {
          try {
            const result=await api("lists/"+encodeURIComponent(id)+"/share",{method:"POST",body:JSON.stringify({})});
            const shareUrl=location.origin+"/shared/"+result.shareToken;
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
        const itemTitle = document.createElement("h2"); itemTitle.textContent = "Idées de cadeaux"; itemTitle.style.marginTop = "1.4rem"; detail.append(itemTitle);
        if (!items.length) { const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Ajoute ta première idée ci-dessous."; detail.append(empty); }
        items.forEach(item => {
          const card = document.createElement("article"); card.className = "gift";
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
          statusSelect.value=item.status||"wanted";
          statusSelect.addEventListener("change",async()=>{
            try{await api("lists/"+encodeURIComponent(id)+"/items/"+encodeURIComponent(item.id),{method:"PATCH",body:JSON.stringify({status:statusSelect.value})});notice("appNotice","Statut mis à jour.");}
            catch(error){statusSelect.value=item.status||"wanted";notice("appNotice",error.message,true);}
          });
          statusLabel.append(statusSelect);card.append(statusLabel);
          detail.append(card);
        });
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
        const result = await api("lists", { method:"POST", body:JSON.stringify({ title:$("listTitle").value, description:$("listDescription").value, visibility:$("visibility").value, occasion:$("listOccasion").value || null, eventDate:$("listEventDate").value || null, currency:$("listCurrency").value }) });
        $("listTitle").value = ""; $("listDescription").value = ""; $("listOccasion").value = ""; $("listEventDate").value = "";
        state.selected = result.list.id; notice("appNotice", "Liste créée."); await loadLists();
      } catch (error) { notice("appNotice", error.message, true); }
    });
    $("logoutBtn").addEventListener("click", async () => {
      try { await api("auth/logout", { method:"POST", body:JSON.stringify({}) }); } finally { showAuth(); }
    });
    $("deleteAccountBtn").addEventListener("click", async () => {
      if(!confirm("Supprimer définitivement ton compte, tes listes et tes cadeaux ? Cette action est irréversible."))return;
      const password=prompt("Pour confirmer, saisis ton mot de passe.");
      if(password===null||!password)return;
      const confirmEmail=prompt("Saisis l'adresse e-mail de ton compte pour confirmer.");
      if(confirmEmail===null)return;
      try {
        await api("account",{method:"DELETE",body:JSON.stringify({password,confirmEmail})});
        showAuth();notice("notice","Le compte et les listes associées ont été supprimés.");
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

    setMode("login");
    api("auth/me").then(result => showApp(result.user)).catch(() => showAuth());
  })();
