if (!requireAdmin()) {
  throw new Error('Forbidden');
}

const usersList = document.getElementById('usersList');

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

async function loadUsers() {
  try {
    const users = await authFetch('/api/admin/users');

    if (!users.length) {
      usersList.innerHTML = '<p>Користувачів немає.</p>';
      return;
    }

    usersList.innerHTML = '';

    users.forEach(user => {
      const item = document.createElement('div');
      item.className = 'category-admin-item';

        item.innerHTML = `
        <div>
          <strong>${user.name}</strong><br>
          <span>${user.email}</span><br>
          <span>Роль: ${user.role}</span><br>
          <span>Email підтверджено: ${user.is_email_confirmed ? 'так' : 'ні'}</span>
        </div>
        <div class="category-admin-actions">
        ${user.id === getUser().id
            ? '<span class="admin-self-label">Поточний акаунт</span>'
            : `<button class="shop-delete-btn small" data-id="${user.id}">Видалити</button>`}
        </div>
      `;

      usersList.appendChild(item);
    });

    document.querySelectorAll('[data-id]').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('Видалити цього користувача?')) return;

        try {
          await authFetch(`/api/users/${button.dataset.id}`, {
            method: 'DELETE'
          });
          await loadUsers();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    usersList.innerHTML = `<p>${error.message}</p>`;
  }
}

loadUsers();