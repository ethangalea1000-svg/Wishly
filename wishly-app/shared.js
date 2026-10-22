(() => {
"use strict";
const token=new URLSearchParams(location.search).get("token")||location.pathname.split("/").filter(Boolean).pop()||"";
const $=id=>document.getElementById(id);
const notice=(message,error=false)=>{$("notice").textContent=message;$("notice").classList.remove("hidden");$("notice").classList.toggle("error",error);};
const escape=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const API_BASE_URL="https://wishly-production-api.ethan-galea1000.workers.dev";
async function api(path,options={}){
 let response;
 try {
  response=await fetch(API_BASE_URL+"/api/"+path,{...options,cache:"no-store",headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});
 } catch {
  throw new Error(navigator.onLine===false
   ?"Tu sembles hors connexion. Vérifie Internet puis réessaie."
   :"Impossible de joindre Wishly. Vérifie ta connexion ou réessaie dans quelques instants.");
 }
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||`Erreur ${response.status}. Réessaie.`);
 return data;
}
async function load(){
 if(!/^[a-f0-9]{64}$/.test(token)){notice("Lien de partage invalide.",true);$("title").textContent="Liste indisponible";return;}
 try{
 const data=await api("shared/"+token);$("title").textContent=data.list.title;$("description").textContent=data.list.description||"";
 let eventInfo=$("eventInfo");if(!eventInfo){eventInfo=document.createElement("p");eventInfo.id="eventInfo";eventInfo.className="muted";$("description").insertAdjacentElement("afterend",eventInfo);}
 const eventDetails=[];if(data.list.occasion)eventDetails.push(data.list.occasion);if(data.list.event_date){const date=new Date(data.list.event_date+"T12:00:00");if(!Number.isNaN(date.getTime()))eventDetails.push(date.toLocaleDateString("fr-FR"));}
 eventInfo.textContent=eventDetails.join(" · ");eventInfo.hidden=eventDetails.length===0;
 const root=$("items");root.replaceChildren();
 const toolbar=document.createElement("div");toolbar.className="row";toolbar.style.justifyContent="space-between";toolbar.style.margin="1rem 0";
 const summary=document.createElement("p");summary.className="muted";summary.textContent="Les réservations sont anonymes pour le propriétaire de la liste.";
 const refresh=document.createElement("button");refresh.type="button";refresh.className="btn";refresh.textContent="Actualiser la liste";
 refresh.addEventListener("click",async()=>{refresh.disabled=true;refresh.textContent="Actualisation…";try{await load();}finally{refresh.disabled=false;refresh.textContent="Actualiser la liste";}});
 toolbar.append(summary,refresh);root.append(toolbar);
 if(!data.items.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="Cette liste ne contient pas encore de cadeaux.";root.append(empty);return;}
 data.items.forEach(item=>{
  const article=document.createElement("article");article.className="item";
  const h=document.createElement("h2");h.textContent=item.title;
  const desc=document.createElement("p");desc.className="muted";desc.textContent=item.description||"";
  if(item.image_url){
   try{const imageUrl=new URL(item.image_url);if(["https:","http:"].includes(imageUrl.protocol)){const image=document.createElement("img");image.src=imageUrl.href;image.alt="";image.loading="lazy";image.decoding="async";image.style.cssText="display:block;width:min(100%,220px);max-height:220px;object-fit:contain;border-radius:.8rem;margin:.5rem 0";image.addEventListener("error",()=>image.remove(),{once:true});article.append(image);}}catch{}
  }
  const details=[];
  if(item.category)details.push(item.category);
  if(Number.isInteger(item.price_minor)&&item.price_minor>=0)details.push(new Intl.NumberFormat("fr-FR",{style:"currency",currency:/^[A-Z]{3}$/.test(item.currency||data.list.currency||"EUR")?(item.currency||data.list.currency||"EUR"):"EUR"}).format(item.price_minor/100));
  if(Number.isInteger(item.priority))details.push(({3:"Priorité haute",2:"Priorité normale",1:"Priorité basse"})[item.priority]||"");
  const meta=document.createElement("p");meta.className="muted";meta.textContent="Quantité disponible : "+item.remaining_quantity+(details.filter(Boolean).length?" · "+details.filter(Boolean).join(" · "):"");
  article.append(h,desc);
  if(item.url){const a=document.createElement("a");a.href=item.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Voir le cadeau";article.append(a);}
  article.append(meta);
  if(item.remaining_quantity>0){
   const form=document.createElement("form");form.className="row";
   const input=document.createElement("input");input.name="guestName";input.maxLength=60;input.required=true;input.autocomplete="name";input.placeholder="Ton prénom";input.setAttribute("aria-label","Ton prénom pour la réservation");
   const button=document.createElement("button");button.className="btn";button.type="submit";button.textContent="Réserver";
   form.append(input,button);
   form.addEventListener("submit",async e=>{
    e.preventDefault();button.disabled=true;
    try{
     const result=await api("shared/"+token+"/items/"+encodeURIComponent(item.id)+"/reservations",{method:"POST",body:JSON.stringify({guestName:input.value})});
     const dialog=document.createElement("div");dialog.className="notice";
     const message=document.createElement("p");message.textContent="Réservation enregistrée. Le propriétaire de la liste ne voit pas ton nom. Conserve le code ci-dessous pour pouvoir annuler.";
     const code=document.createElement("code");code.textContent=result.cancellationToken;code.style.display="block";code.style.overflowWrap="anywhere";
     const copy=document.createElement("button");copy.type="button";copy.className="btn";copy.textContent="Copier le code";
     copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(result.cancellationToken);copy.textContent="Code copié";}catch{notice("Copie impossible : sélectionne le code manuellement.");}});
     const reservationId=document.createElement("p");reservationId.textContent="Référence de réservation : "+result.reservationId;dialog.append(message,reservationId,code,copy);article.append(dialog);form.remove();
    }catch(error){notice(error.message,true);button.disabled=false;}
   });
   article.append(form);
  }else{const tag=document.createElement("p");tag.textContent="Entièrement réservé";tag.className="muted";article.append(tag);}
  root.append(article);
 });
 }catch(error){$("title").textContent="Liste indisponible";notice(error.message,true);}
}
document.getElementById("cancelForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const form=event.currentTarget;
 const id=document.getElementById("reservationId").value.trim();
 const cancellationToken=document.getElementById("cancelToken").value.trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[a-f0-9]{64}$/i.test(cancellationToken)){notice("Référence ou code invalide.",true);return;}
 const button=event.currentTarget.querySelector("button");button.disabled=true;
 try{await api("reservations/"+encodeURIComponent(id)+"/cancel",{method:"POST",body:JSON.stringify({cancellationToken})});notice("Réservation annulée.");form.reset();await load();}
 catch(error){notice(error.message,true);}
 finally{button.disabled=false;}
});
load();
})();