import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ⚠️ Tu proyecto Supabase
const SUPABASE_URL  = "https://pbtezbxmrgbcgmunfpns.supabase.co";
const SUPABASE_ANON = "TU_ANOeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBidGV6YnhtcmdiY2dtdW5mcG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5MzAyMDAsImV4cCI6MjA3NDUwNjIwMH0.OJotxjLi-7xnbIZat-JKQd-7bn5QMvqNsysPYU0GEsY"; // ← Reemplazá por tu anon public key

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const feedUI = $("feedUI"), commentsUI = $("commentsUI");
const activeHint = $("activeHint"), debugWrap = $("debugWrap");
const outEl = $("out"), debugToggle = $("debugToggle"), toastBox = $("toasts");
const btnToggle = $("toggle"), btnAddComment = $("addComment"), btnListComments = $("listComments");
const btnLogout = $("logout");

function toast(msg, type="ok"){
  const t=document.createElement("div"); t.className=`toast ${type}`; t.textContent=msg; toastBox.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show")); setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),200); },2600);
}
function log(m){ if (debugToggle.checked){ outEl.textContent += m + "\n"; } }
debugToggle.onchange = ()=> { debugWrap.style.display = debugToggle.checked ? "block" : "none"; };

const state = { activePostId:null, posts:[], cursor:null };

function setActivePost(id){
  state.activePostId = id || null;
  const has = !!state.activePostId;
  btnToggle.disabled = !has; btnAddComment.disabled = !has; btnListComments.disabled = !has;
  [...feedUI.querySelectorAll(".card")].forEach(c=>c.classList.remove("active"));
  const el = id ? feedUI.querySelector(`[data-post="${id}"]`) : null; if (el) el.classList.add("active");
  activeHint.textContent = has ? "post seleccionado" : "sin selección";
  if (has){ loadComments(); } else { commentsUI.innerHTML = ""; }
  setupRealtime();
}

function avatarTag(url, small=false){
  if (!url) return `<div class="${small?'avatar-s':'avatar'}" style="display:flex;align-items:center;justify-content:center">?</div>`;
  return `<img class="${small?'avatar-s':'avatar'}" src="${url}" alt="avatar">`;
}

function showFeedSkeleton() {
  feedUI.innerHTML = "";
  for (let i=0;i<3;i++){
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<div class="skel" style="height:78px;margin-bottom:8px"></div>
                    <div class="skel" style="height:18px;width:60%"></div>`;
    feedUI.appendChild(el);
  }
}

function renderFeed(items){
  feedUI.innerHTML = "";
  if (!items?.length){ feedUI.innerHTML = `<div class="card" style="opacity:.7">No hay posts.</div>`; setActivePost(null); return; }
  for (const it of items){
    const card = document.createElement("div");
    card.className = "card selectable";
    card.dataset.post = it.id;
    card.innerHTML = `
      <div class="row" style="align-items:center">
        ${avatarTag(it.avatar_url)}
        <div>
          <div style="font-weight:600">${it.username ?? 'usuario'}</div>
          <div class="meta">${new Date(it.created_at).toLocaleString()}</div>
        </div>
      </div>
      <div style="margin-top:10px">${it.content ?? ''}</div>
      <div class="meta" style="margin-top:10px">
        ❤️ ${it.likes_count} · 💬 ${it.comments_count} ${it.liked_by_me ? "· ⭐ Te gusta" : ""}
      </div>`;
    card.onclick = () => setActivePost(it.id);
    feedUI.appendChild(card);
  }
  if (!state.activePostId && items[0]) setActivePost(items[0].id);
}

function renderComments(items){
  commentsUI.innerHTML = "";
  if (!items?.length){ commentsUI.innerHTML = `<div class="card" style="opacity:.7">Sin comentarios.</div>`; return; }
  for (const it of items){
    const row = document.createElement("div");
    row.className = "card"; row.style.padding = "10px";
    row.innerHTML = `
      <div class="row" style="align-items:flex-start">
        ${avatarTag(it.author?.avatar_url, true)}
        <div>
          <div style="font-weight:600">${it.author?.username ?? 'usuario'}</div>
          <div class="meta">${new Date(it.created_at).toLocaleString()}</div>
          <div style="margin-top:6px">${it.content}</div>
        </div>
      </div>`;
    commentsUI.appendChild(row);
  }
}

// ---------- Realtime ----------
let channel = null;
function setupRealtime(){
  if (channel){ try{ supabase.removeChannel(channel); }catch(_){} }
  channel = supabase.channel('realtime-feed');
  const pid = state.activePostId;
  const base = { schema:'public' };
  const likeInsert    = { event:'INSERT', table:'post_likes', ...(pid?{filter:`post_id=eq.${pid}`}:{}) };
  const likeDelete    = { event:'DELETE', table:'post_likes', ...(pid?{filter:`post_id=eq.${pid}`}:{}) };
  const commentInsert = { event:'INSERT', table:'comments',   ...(pid?{filter:`post_id=eq.${pid}`}:{}) };

  channel
    .on('postgres_changes', { ...base, ...commentInsert }, () => { if (state.activePostId) loadComments(); refreshFeed(false); })
    .on('postgres_changes', { ...base, ...likeInsert },    () => { refreshFeed(false); })
    .on('postgres_changes', { ...base, ...likeDelete },    () => { refreshFeed(false); });

  channel.subscribe((status)=>{ if(status==='SUBSCRIBED'){ log("✅ Realtime conectado"); }});
}

// ---------- Datos (RPC con cursor) ----------
async function rpcGetFeed(limit=10, cursor=null){
  return await supabase.rpc("get_feed", { p_limit: limit, p_cursor: cursor });
}

async function refreshFeed(selectFirstIfEmpty=true){
  showFeedSkeleton();
  state.cursor = null;
  const { data, error } = await rpcGetFeed(10, null);
  if (error){ toast("Error al cargar feed", "err"); log("Feed error: " + error.message); return; }
  state.posts = data || [];
  renderFeed(state.posts);
  state.cursor = state.posts?.length ? state.posts[state.posts.length-1].created_at : null;
  if (selectFirstIfEmpty && !state.activePostId && state.posts?.[0]) setActivePost(state.posts[0].id);
}

async function loadMore(){
  if (!state.cursor) return;
  const { data, error } = await rpcGetFeed(10, state.cursor);
  if (error){ toast("No se pudo cargar más", "err"); return; }
  if (!data?.length) return;
  state.posts = [...state.posts, ...data];
  renderFeed(state.posts);
  state.cursor = data[data.length-1].created_at;
}

async function loadComments(){
  if (!state.activePostId) return;
  const { data, error } = await supabase.from("comments")
    .select("id, content, created_at, author:author_id ( username, avatar_url )")
    .eq("post_id", state.activePostId).order("created_at", { ascending:false }).limit(10);
  if (error){ toast("No se pudieron cargar comentarios", "err"); log("List comments error: " + error.message); return; }
  renderComments(data);
}

// ---------- Auth + acciones ----------
$("login").onclick = async () => {
  const { data, error } = await supabase.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  if (error){ toast("Login falló: " + error.message, "err"); log("Login error: " + error.message); return; }
  toast("Bienvenido " + data.session.user.email);
  btnLogout.style.display = "inline-block";
  await refreshFeed(); setupRealtime();
};

$("logout").onclick = async () => {
  await supabase.auth.signOut();
  btnLogout.style.display = "none";
  toast("Sesión cerrada");
  state.activePostId = null; state.posts = []; state.cursor = null;
  renderFeed([]); commentsUI.innerHTML = "";
};

$("signup").onclick = async () => {
  const email = $("email").value.trim(); const password = $("password").value;
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return toast("No se pudo crear la cuenta: " + error.message, "err");
  toast("Revisá tu email para confirmar la cuenta");
};

$("reset").onclick = async () => {
  const email = $("email").value.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) return toast("No se pudo enviar el mail: " + error.message, "err");
  toast("Te enviamos un link para resetear la contraseña");
};

$("refresh").onclick = () => { refreshFeed(); };
$("loadMore").onclick = () => { loadMore(); };
$("listComments").onclick = () => { loadComments(); };

$("publish").onclick = async () => {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return toast("Hacé login primero", "err");
  const content = $("newPost").value.trim();
  if (!content) return toast("Escribí algo", "err");

  const { error } = await supabase.from("posts").insert([{ content, author_id: u.user.id }]);
  if (error) return toast("No se pudo publicar: " + error.message, "err");
  $("newPost").value = "";
  toast("Publicado");
  await refreshFeed();
};

$("toggle").onclick = async () => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return toast("Hacé login primero", "err");
  if (!state.activePostId) return toast("Elegí un post", "err");

  // Like optimista
  const idx = state.posts.findIndex(p => p.id === state.activePostId);
  if (idx >= 0) {
    const p = state.posts[idx];
    const likedNext = !p.liked_by_me;
    state.posts[idx] = { ...p, liked_by_me: likedNext, likes_count: p.likes_count + (likedNext?1:-1) };
    renderFeed(state.posts);
  }

  const { error } = await supabase.rpc("toggle_like", { p_post_id: state.activePostId });
  if (error) {
    toast("Error al dar like", "err");
    if (idx >= 0) { // revertir UI
      const p = state.posts[idx];
      const likedPrev = !p.liked_by_me;
      state.posts[idx] = { ...p, liked_by_me: likedPrev, likes_count: p.likes_count + (likedPrev?1:-1) };
      renderFeed(state.posts);
    }
  }
};

$("addComment").onclick = async () => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return toast("Hacé login primero", "err");
  const text = $("commentText").value.trim();
  if (!text) return toast("Comentario vacío", "err");
  if (!state.activePostId) return toast("Elegí un post del feed", "err");
  const { error } = await supabase.from("comments").insert([{ post_id: state.activePostId, author_id: userData.user.id, content: text }]);
  if (error){ toast("No se pudo comentar", "err"); log("Comment error: " + error.message); return; }
  $("commentText").value = ""; toast("Comentario publicado");
  await loadComments(); await refreshFeed(false);
};

// Avatares rápidos
$("uploadAvatar").onclick = async () => {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user; if (!user){ toast("Hacé login primero", "err"); return; }
  const file = $("avatarFile").files?.[0]; if (!file){ toast("Elegí un archivo", "err"); return; }
  const filePath = `${user.id}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, file, { upsert:true });
  if (upErr){ toast("Error subiendo avatar", "err"); log("Upload error: " + upErr.message); return; }
  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
  const publicUrl = pub.publicUrl;
  const { error: upProfileErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
  if (upProfileErr){ toast("Error guardando avatar", "err"); log("Perfil error: " + upProfileErr.message); return; }
  toast("Avatar actualizado"); await loadComments(); await refreshFeed(false);
};

$("showAvatar").onclick = async () => {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user; if (!user){ toast("Hacé login primero", "err"); return; }
  const { data, error } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).single();
  if (error){ toast("No se pudo obtener avatar", "err"); log("Fetch avatar error: " + error.message); return; }
  if (!data?.avatar_url){ toast("Aún no tenés avatar"); return; }
  toast("Avatar listo");
};

// Perfil (modal)
$("openProfile").onclick = async () => {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return toast("Hacé login primero", "err");
  const { data, error } = await supabase.from("profiles").select("username, avatar_url").eq("id", u.user.id).single();
  if (!error){ $("profUsername").value = data?.username || ""; }
  $("profileModal").hidden = false;
};
$("closeProfile").onclick = () => { $("profileModal").hidden = true; };

$("saveProfile").onclick = async () => {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return;
  const username = $("profUsername").value.trim();

  let errText = "";
  const { error: e1 } = await supabase.from("profiles").update({ username }).eq("id", u.user.id);
  if (e1) errText += e1.message;

  const file = $("avatarFile2").files?.[0];
  if (file){
    const filePath = `${u.user.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, file, { upsert:true });
    if (!upErr){
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
      await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", u.user.id);
    } else { errText += (errText? " · ":"") + upErr.message; }
  }

  if (errText) toast("Errores: " + errText, "err"); else toast("Perfil actualizado");
  $("profileModal").hidden = true;
  await refreshFeed();
};

// ---------- Persistencia de sesión + carga inicial ----------
(async ()=>{
  const { data: { session } } = await supabase.auth.getSession();
  if (session){ btnLogout.style.display = "inline-block"; }
  await refreshFeed();
  setupRealtime();
})();
