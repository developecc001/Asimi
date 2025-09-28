// Configuración de Supabase
const supabase = supabase.createClient(
  'https://TU_PROYECTO.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBidGV6YnhtcmdiY2dtdW5mcG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5MzAyMDAsImV4cCI6MjA3NDUwNjIwMH0.OJotxjLi-7xnbIZat-JKQd-7bn5QMvqNsysPYU0GEsY'
);

let currentUser = null;

// Elementos del DOM
const loginSection = document.getElementById('login-section');
const postSection = document.getElementById('post-section');
const feedSection = document.getElementById('feed');
const loginError = document.getElementById('login-error');
const newPost = document.getElementById('new-post');
const charCount = document.getElementById('char-count');

// Contador en tiempo real
newPost?.addEventListener('input', () => {
  charCount.textContent = `${newPost.value.length} / 280`;
});

// Función de login
async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginError.classList.remove('hidden');
    loginError.textContent = 'Login error: ' + error.message;
    return;
  }

  currentUser = data.user;
  loginSection.classList.add('hidden');
  postSection.classList.remove('hidden');
  fetchFeed();
}

// Crear nuevo post
async function createPost() {
  const content = newPost.value.trim();
  if (!content || content.length > 280 || !currentUser) return;

  const { error } = await supabase.from('posts').insert([
    {
      content,
      user_id: currentUser.id,
      created_at: new Date().toISOString(),
    },
  ]);

  if (!error) {
    newPost.value = '';
    charCount.textContent = '0 / 280';
    fetchFeed();
  } else {
    alert('Error al publicar: ' + error.message);
  }
}

// Obtener y renderizar posts
async function fetchFeed() {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, content, created_at, users (email)')
    .order('created_at', { ascending: false });

  if (error) {
    feedSection.innerHTML = `<p class="text-red-500">Error cargando feed</p>`;
    return;
  }

  feedSection.innerHTML = posts.map(post => {
    const date = new Date(post.created_at).toLocaleString();
    const user = post.users?.email || 'Usuario desconocido';
    return `
      <div class="bg-white shadow p-4 mb-4 rounded">
        <div class="text-sm text-gray-500">${user} — ${date}</div>
        <p class="mt-2 text-gray-800">${post.content}</p>
        <div class="flex space-x-4 mt-3 text-blue-500 text-sm">
          <button title="Like ❤️">❤️ Me gusta</button>
          <button title="Comentar 💬">💬 Comentar</button>
        </div>
      </div>
    `;
  }).join('');
}

// Autologin (si ya estaba logueado)
supabase.auth.getUser().then(({ data, error }) => {
  if (data?.user) {
    currentUser = data.user;
    loginSection.classList.add('hidden');
    postSection.classList.remove('hidden');
    fetchFeed();
  }
});
