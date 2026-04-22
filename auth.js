const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const authMessage = document.getElementById('authMessage');

function showMessage(text, isError = false) {
  authMessage.innerHTML = text.replace(/\n/g, '<br>');
  authMessage.className = isError ? 'auth-message error' : 'auth-message success';
}

async function parseResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    if (data.errors && data.errors.length) {
      const messages = data.errors.map(error => `• ${error.msg}`).join('\n');
      throw new Error(messages);
    }

    throw new Error(data.message || data.error || 'Сталася помилка');
  }

  return data;
}

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const payload = {
      name: document.getElementById('registerName').value.trim(),
      email: document.getElementById('registerEmail').value.trim(),
      password: document.getElementById('registerPassword').value,
      confirmPassword: document.getElementById('registerConfirmPassword').value,
    };

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseResponse(response);

    showMessage(`Реєстрація успішна. Підтвердь email. Посилання: ${data.verifyLink || 'дивись консоль сервера'}`);
    registerForm.reset();
  } catch (error) {
    showMessage(error.message, true);
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const payload = {
      email: document.getElementById('loginEmail').value.trim(),
      password: document.getElementById('loginPassword').value
    };

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseResponse(response);

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    showMessage('Вхід успішний');
    setTimeout(() => {
      window.location.href = 'profile.html';
    }, 800);
  } catch (error) {
    showMessage(error.message, true);
  }
});

forgotPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const payload = {
      email: document.getElementById('forgotEmail').value.trim()
    };

    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseResponse(response);

    showMessage(`Посилання для відновлення створено: ${data.resetLink || 'дивись консоль сервера'}`);
    forgotPasswordForm.reset();
  } catch (error) {
    showMessage(error.message, true);
  }
});

const authTabs = document.querySelectorAll('.auth-tab');
const authTabContents = document.querySelectorAll('.auth-tab-content');

authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const selectedTab = tab.dataset.tab;

    authTabs.forEach(btn => btn.classList.remove('active'));
    authTabContents.forEach(content => content.classList.remove('active'));

    tab.classList.add('active');

    if (selectedTab === 'register') {
      document.getElementById('registerBlock').classList.add('active');
    }

    if (selectedTab === 'login') {
      document.getElementById('loginBlock').classList.add('active');
    }

    if (selectedTab === 'forgot') {
      document.getElementById('forgotBlock').classList.add('active');
    }

    authMessage.innerHTML = '';
    authMessage.className = 'auth-message';
  });
});