// Inicializar Supabase
const SUPABASE_URL = "https://pbtezbxmrgbcgmunfpns.supabase.co"; // ← cambiá por tu URL real si es otra
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBidGV6YnhtcmdiY2dtdW5mcG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5MzAyMDAsImV4cCI6MjA3NDUwNjIwMH0.OJotxjLi-7xnbIZat-JKQd-7bn5QMvqNsysPYU0GEsY";
const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos del DOM
const authSection = document.getElementById("auth-section");
const postSection = document.getElementById("post-section");
const feed = document.getElementById("feed");
const newPostInput = document.getElementById("new-post");
const charCount = document.getElementById("char-count");
const authError = document.getElementById("auth-error");

// Login
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    authError.innerText = "Login inválido";
    authError.classList.remove("hidden");
  } else {
    authError.classList.add("hidden");
    authSection.classList.add("hidden");
    postSection.classList.remove("hidden");
    loadPosts();
  }
}

// Registro
async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await client.auth.signUp({ email, password });

  if (error) {
    authError.innerText = "Error en registro: " + error.message;
    authError.classList.remove("hidden");
  } else {
    authError.innerText = "✅ Registrado. Revisa tu email para confirmar.";
    authError.classList.remove("hidden");
  }
}

// Publicar
async function createPost() {
  const content = newPostInput.value;
  if (!content.trim()) return;

  const session = await client.auth.getSession();
  const user = session.data.session?.user;
  if (!user) return;

  await client.from("posts").insert([{
    content,
    user_id: user.id,
    user_email: user.email
  }]);

  newPostInput.value = "";
  updateCharCount();
  loadPosts();
}

// Mostrar feed
async function loadPosts() {
  const { data: posts, error } = await client
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return console.error(error);

  feed.innerHTML = "";
  posts.forEach(post => {
    const el = document.createElement("div");
    el.className = "bg-white p-4 rounded shadow mb-3";
    el.innerHTML = `
      <div class="text-sm text-gray-500 mb-1">${post.user_email}</div>
      <div class="text-base mb-2">${post.content}</div>
      <div class="text-xs text-gray-400">${new Date(post.created_at).toLocaleString()}</div>
    `;
    feed.appendChild(el);
  });
}

// Contador de caracteres
function updateCharCount() {
  charCount.innerText = `${newPostInput.value.length} / 280`;
}
newPostInput?.addEventListener("input", updateCharCount);
