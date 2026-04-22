function getAccessToken() {
  return localStorage.getItem('accessToken');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function getUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

function isLoggedIn() {
  return !!getAccessToken();
}

function isAdmin() {
  const user = getUser();
  return user && user.role === 'admin';
}

function logoutUser() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

function renderAuthNav() {
  const authNav = document.getElementById('authNav');
  if (!authNav) return;

  const user = getUser();

  if (user) {
    authNav.innerHTML = `
      <a href="profile.html">Профіль</a>
      ${user.role === 'admin' ? '<a href="admin-users.html">Користувачі</a>' : ''}
      <a href="#" id="logoutLink">Вихід</a>
    `;

    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();

        try {
          const token = getAccessToken();
          if (token) {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
          }
        } catch (error) {
          console.error(error);
        }

        logoutUser();
      });
    }
  } else {
    authNav.innerHTML = `
      <a href="auth.html">Вхід / Реєстрація</a>
    `;
  }
}

function applyAdminVisibility() {
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    if (!isAdmin()) {
      el.style.display = 'none';
    }
  });
}

function requireAuth(redirect = true) {
  if (!isLoggedIn()) {
    if (redirect) {
      window.location.href = 'auth.html';
    }
    return false;
  }
  return true;
}

function requireAdmin(redirect = true) {
  if (!isLoggedIn()) {
    if (redirect) {
      window.location.href = 'auth.html';
    }
    return false;
  }

  if (!isAdmin()) {
    if (redirect) {
      window.location.href = 'index.html';
    }
    return false;
  }

  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  renderAuthNav();
  applyAdminVisibility();
});