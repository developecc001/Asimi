// Configuración de Supabase
const SUPABASE_URL = 'https://pbtezbxmrgbcgmunfpns.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // tu key completa aquí

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos del DOM
const authSection = document.getElementById("auth-section");
const postSection = document.getElementById("post-section");
const feed = document.getElementById("feed");
const newPostInput = document.getElementById("new-post");
const charCount = document.getElementById("char-count");
const authError = document.getElementById("auth-error");

// Mostrar u ocultar secciones según sesión
async function checkSession() {
  const { data: { session } } = await client.auth.getSession();

  if (session && session.user) {
    authSection.classList.add("hidden");
    postSection.classList.remove("hidden");
    loadPosts();
    setupRealtime();
  } else {
    authSection.classList.remove("hidden");
    postSection.classList.add("hidden");
  }
}

// Login
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    authError.innerText = "Login inválido: " + error.message;
    authError.classList.remove("hidden");
  } else {
    authError.classList.add("hidden");
    await checkSession();
  }
}

// Registro
async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await client.auth.signUp({ email, password });

  if (error) {
    authError.innerText = "Error en registro: " + error.message;
  } else {
    authError.innerText = "✅ Registrado. Revisa tu email para confirmar.";
  }

  authError.classList.remove("hidden");
}

// Publicar
async function createPost() {
  const content = newPostInput.value.trim();
  if (!content) return;

  const { data: { session } } = await client.auth.getSession();
  const user = session?.user;
  if (!user) return;

  const { error } = await client.from("posts").insert([{
    content,
    user_id: user.id,
    user_email: user.email
  }]);

  if (!error) {
    newPostInput.value = "";
    updateCharCount();
    // Post se agrega automáticamente por realtime
  }
}

// Cargar posts
async function loadPosts() {
  const { data: posts, error } = await client
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al cargar posts:", error.message);
    return;
  }

  renderFeed(posts);
}

// Mostrar posts en el DOM
function renderFeed(posts) {
  feed.innerHTML = "";
  posts.forEach(post => {
    const el = document.createElement("div");
    el.className = "bg-white p-4 rounded shadow mb-3";
    el.innerHTML = `
      <div class="text-sm text-gray-500 mb-1">${post.user_email}</div>
      <div class="text-base mb-2 break-words">${post.content}</div>
      <div class="text-xs text-gray-400">${new Date(post.created_at).toLocaleString()}</div>
    `;
    feed.appendChild(el);
  });
}

// Realtime
function setupRealtime() {
  client
    .channel('public:posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
      loadPosts(); // Podés optimizar para agregar solo el nuevo
    })
    .subscribe();
}

// Contador de caracteres
function updateCharCount() {
  if (charCount && newPostInput) {
    charCount.innerText = `${newPostInput.value.length} / 280`;
  }
}

newPostInput?.addEventListener("input", updateCharCount);

// Al cargar la página
checkSession();
