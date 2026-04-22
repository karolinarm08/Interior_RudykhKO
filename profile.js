if (!requireAuth()) {
  throw new Error('Unauthorized');
}

const profileInfo = document.getElementById('profileInfo');
const profileForm = document.getElementById('profileForm');
const changePasswordForm = document.getElementById('changePasswordForm');
const profileMessage = document.getElementById('profileMessage');

function showProfileMessage(text, isError = false) {
  profileMessage.textContent = text;
  profileMessage.className = isError ? 'auth-message error' : 'auth-message success';
}

async function authFetch(url, options = {}) {
  const token = localStorage.getItem('accessToken');

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Сталася помилка');
  }

  return data;
}

async function loadProfile() {
  const data = await authFetch('/api/profile');

profileInfo.innerHTML = `
  <div class="profile-info-item">
    <span class="profile-info-label">ID</span>
    <span class="profile-info-value">${data.id}</span>
  </div>

  <div class="profile-info-item">
    <span class="profile-info-label">Ім’я</span>
    <span class="profile-info-value">${data.name}</span>
  </div>

  <div class="profile-info-item">
    <span class="profile-info-label">Email</span>
    <span class="profile-info-value">${data.email}</span>
  </div>

  <div class="profile-info-item">
    <span class="profile-info-label">Роль</span>
    <span class="profile-info-value">${data.role}</span>
  </div>

  <div class="profile-info-item">
    <span class="profile-info-label">Email підтверджено</span>
    <span class="profile-info-value">${data.is_email_confirmed ? 'так' : 'ні'}</span>
  </div>
`;

  document.getElementById('profileName').value = data.name || '';
  document.getElementById('profileEmail').value = data.email || '';

  const oldUser = JSON.parse(localStorage.getItem('user') || '{}');
  localStorage.setItem('user', JSON.stringify({
    ...oldUser,
    name: data.name,
    email: data.email,
    role: data.role,
    id: data.id
  }));
}

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    await authFetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: document.getElementById('profileName').value.trim(),
        email: document.getElementById('profileEmail').value.trim()
      })
    });

    showProfileMessage('Профіль оновлено');
    await loadProfile();
  } catch (error) {
    showProfileMessage(error.message, true);
  }
});

changePasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    await authFetch('/api/profile/change-password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currentPassword: document.getElementById('currentPassword').value,
        newPassword: document.getElementById('newPassword').value,
        confirmNewPassword: document.getElementById('confirmNewPassword').value
      })
    });

    showProfileMessage('Пароль змінено. Виконай повторний вхід.');
    changePasswordForm.reset();
  } catch (error) {
    showProfileMessage(error.message, true);
  }
});

loadProfile().catch((error) => {
  showProfileMessage(error.message, true);
});