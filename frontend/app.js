import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ⚠️ Pegá tu anon key real acá
const SUPABASE_URL  = "https://pbtezbxmrgbcgmunfpns.supabase.co";
const SUPABASE_ANON = "TU_ANON_KEY_AQUI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const feedUI = $("feedUI"), commentsUI = $("commentsUI");
const activeHint = $("activeHint"), debugWrap = $("debugWrap");
const outEl = $("out"), debugToggle = $("debugToggle"), toastBox = $("toasts");
const btnToggle = $("toggle"), btnAddComment = $("addComment"), btnListComments = $("listComments");

function toast(msg, type="ok"){
  const t=document.createElement("div"); t.className=`toast ${type}`; t.textContent=msg; toastBox.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show")); setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),200); },2500);
}
function log(m){ if (debugToggle.checked){ outEl.textContent += m + "\n"; } }
debugToggle.onchange = ()=> { debugWrap.style.display = debugToggle.checked ? "block" : "none"; };

const state = { activePostId:null, posts:[] };

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

function renderFeed(items){
  feedUI.innerHTML = "";
  if (!items?.length){ feedUI.innerHTML = `<div class="card" style="opacity:.7">No hay posts.</div>`; setActivePost(null); return; }
  state.posts = items;
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

// ---------- Datos ----------
async function refreshFeed(selectFirstIfEmpty=true){
  const { data, error } = await supabase
    .from("feed_with_author")
    .select("id, content, created_at, username, avatar_url, liked_by_me, likes_count, comments_count")
    .order("created_at", { ascending:false }).limit(10);
  if (error){ toast("Error al cargar feed", "err"); log("Feed error: " + error.message); return; }
  renderFeed(data);
  if (selectFirstIfEmpty && !state.activePostId && data?.[0]) setActivePost(data[0].id);
}

async function loadComments(){
  if (!state.activePostId) return;
  const { data, error } = await supabase.from("comments")
    .select("id, content, created_at, author:author_id ( username, avatar_url )")
    .eq("post_id", state.activePostId).order("created_at", { ascending:false }).limit(10);
  if (error){ toast("No se pudieron cargar comentarios", "err"); log("List comments error: " + error.message); return; }
  renderComments(data);
}

// ---------- Actions ----------
$("login").onclick = async () => {
  const { data, error } = await supabase.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
  if (error){ toast("Login falló: " + error.message, "err"); log("Login error: " + error.message); return; }
  toast("Bienvenido " + data.session.user.email);
  log("Login OK: " + data.session.user.email);
  await refreshFeed();  // carga y selecciona post
  setupRealtime();      // se suscribe con el post activo
};

$("refresh").onclick = () => { refreshFeed(); };

$("toggle").onclick = async () => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user){ toast("Hacé login primero", "err"); return; }
  if (!state.activePostId){ toast("Elegí un post del feed", "err"); return; }
  const { data, error } = await supabase.rpc("toggle_like", { p_post_id: state.activePostId });
  if (error){ toast("Error al dar like", "err"); log("Toggle error: " + error.message); return; }
  toast((data?.[0]?.action === "liked") ? "¡Te gustó el post!" : "Quitaste tu me gusta");
  await refreshFeed(false);
};

$("addComment").onclick = async () => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user){ toast("Hacé login primero", "err"); return; }
  const text = $("commentText").value.trim();
  if (!text){ toast("Comentario vacío", "err"); return; }
  if (!state.activePostId){ toast("Elegí un post del feed", "err"); return; }
  const { error } = await supabase.from("comments").insert([{ post_id: state.activePostId, author_id: userData.user.id, content: text }]);
  if (error){ toast("No se pudo comentar", "err"); log("Comment error: " + error.message); return; }
  $("commentText").value = ""; toast("Comentario publicado");
  await loadComments(); await refreshFeed(false);
};

$("listComments").onclick = () => loadComments();

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

// Carga inicial del feed (modo público)
refreshFeed();
