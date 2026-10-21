(() => {
"use strict";
const token=new URLSearchParams(location.search).get("token")||location.pathname.split("/").filter(Boolean).pop()||"";
const $=id=>document.getElementById(id);
const notice=(message,error=false)=>{$("notice").textContent=message;$("notice").classList.remove("hidden");$("notice").classList.toggle("error",error);};
const escape=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const API_BASE_URL="https://wishly-production-api.ethan-galea1000.workers.dev";
async function api(path,options={}){const r=await fetch(API_BASE_URL+"/api/"+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Une erreur est survenue.");return data;}
async function load(){
 if(!/^[a-f0-9]{64}$/.test(token)){notice("Lien de partage invalide.",true);$("title").textContent="Liste indisponible";return;}
 try{
 const data=await api("shared/"+token);$("title").textContent=data.list.title;$("description").textContent=data.list.description||"";
 const root=$("items");root.replaceChildren();
 if(!data.items.length){root.textContent="Cette liste ne contient pas encore de cadeaux.";return;}
 data.items.forEach(item=>{
  const article=document.createElement("article");article.className="item";
  const h=document.createElement("h2");h.textContent=item.title;
  const desc=document.createElement("p");desc.className="muted";desc.textContent=item.description||"";
  const meta=document.createElement("p");meta.className="muted";meta.textContent="Quantité disponible : "+item.remaining_quantity;
  article.append(h,desc);
  if(item.url){const a=document.createElement("a");a.href=item.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Voir le cadeau";article.append(a);}
  article.append(meta);
  if(item.remaining_quantity>0){
   const form=document.createElement("form");form.className="row";
   const input=document.createElement("input");input.name="guestName";input.maxLength=60;input.required=true;input.autocomplete="name";input.placeholder="Ton prénom";
   const button=document.createElement("button");button.className="btn";button.type="submit";button.textContent="Réserver";
   form.append(input,button);
   form.addEventListener("submit",async e=>{
    e.preventDefault();button.disabled=true;
    try{
     const result=await api("shared/"+token+"/items/"+encodeURIComponent(item.id)+"/reservations",{method:"POST",body:JSON.stringify({guestName:input.value})});
     const dialog=document.createElement("div");dialog.className="notice";
     const message=document.createElement("p");message.textContent="Réservation enregistrée. Conserve le code ci-dessous pour pouvoir annuler.";
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
 const id=document.getElementById("reservationId").value.trim();
 const cancellationToken=document.getElementById("cancelToken").value.trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[a-f0-9]{64}$/i.test(cancellationToken)){notice("Référence ou code invalide.",true);return;}
 const button=event.currentTarget.querySelector("button");button.disabled=true;
 try{await api("reservations/"+encodeURIComponent(id)+"/cancel",{method:"POST",body:JSON.stringify({cancellationToken})});notice("Réservation annulée.");event.currentTarget.reset();await load();}
 catch(error){notice(error.message,true);}
 finally{button.disabled=false;}
});
load();
})();