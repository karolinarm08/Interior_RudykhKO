if (!requireAdmin()) {
  throw new Error('Forbidden');
}

const form = document.getElementById('categoryForm');
const categoryNameInput = document.getElementById('categoryName');
const categoryList = document.getElementById('categoryList');
const title = document.getElementById('categoryFormTitle');

let editingCategoryId = null;

async function apiFetch(url, options = {}) {
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

async function loadCategories() {
  const categories = await apiFetch('/api/categories');

  categoryList.innerHTML = '';

  if (!categories.length) {
    categoryList.innerHTML = '<p>Категорій поки немає.</p>';
    return;
  }

  categories.forEach(category => {
    const item = document.createElement('div');
    item.className = 'category-admin-item';

    item.innerHTML = `
      <span>${category.name}</span>
      <div class="category-admin-actions">
        <button class="shop-secondary-btn small" data-edit="${category.id}" data-name="${category.name}">Редагувати</button>
        <button class="shop-delete-btn small" data-delete="${category.id}">Видалити</button>
      </div>
    `;

    categoryList.appendChild(item);
  });

  document.querySelectorAll('[data-edit]').forEach(button => {
    button.addEventListener('click', () => {
      editingCategoryId = button.dataset.edit;
      categoryNameInput.value = button.dataset.name;
      title.textContent = 'Редагувати категорію';
    });
  });

  document.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('Видалити цю категорію?')) return;

      try {
        await apiFetch(`/api/categories/${button.dataset.delete}`, {
          method: 'DELETE'
        });
        await loadCategories();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const name = categoryNameInput.value.trim();

    if (!name) {
      alert('Введіть назву категорії');
      return;
    }

    if (editingCategoryId) {
      await apiFetch(`/api/categories/${editingCategoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      alert('Категорію оновлено');
    } else {
      await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      alert('Категорію додано');
    }

    form.reset();
    editingCategoryId = null;
    title.textContent = 'Додати категорію';
    await loadCategories();
  } catch (error) {
    alert(error.message);
  }
});

loadCategories();

// const form = document.getElementById('categoryForm');
// const categoryNameInput = document.getElementById('categoryName');
// const categoryList = document.getElementById('categoryList');
// const title = document.getElementById('categoryFormTitle');

// let editingCategoryId = null;

// async function apiFetch(url, options = {}) {
//   const response = await fetch(url, options);
//   const data = await response.json();

//   if (!response.ok) {
//     throw new Error(data.error || 'Сталася помилка');
//   }

//   return data;
// }

// async function loadCategories() {
//   const categories = await apiFetch('/api/categories');

//   categoryList.innerHTML = '';

//   if (!categories.length) {
//     categoryList.innerHTML = '<p>Категорій поки немає.</p>';
//     return;
//   }

//   categories.forEach(category => {
//     const item = document.createElement('div');
//     item.className = 'category-admin-item';

//     item.innerHTML = `
//       <span>${category.name}</span>
//       <div class="category-admin-actions">
//         <button class="shop-secondary-btn small" data-edit="${category.id}" data-name="${category.name}">Редагувати</button>
//         <button class="shop-delete-btn small" data-delete="${category.id}">Видалити</button>
//       </div>
//     `;

//     categoryList.appendChild(item);
//   });

//   document.querySelectorAll('[data-edit]').forEach(button => {
//     button.addEventListener('click', () => {
//       editingCategoryId = button.dataset.edit;
//       categoryNameInput.value = button.dataset.name;
//       title.textContent = 'Редагувати категорію';
//     });
//   });

//   document.querySelectorAll('[data-delete]').forEach(button => {
//     button.addEventListener('click', async () => {
//       if (!confirm('Видалити цю категорію?')) return;

//       try {
//         await apiFetch(`/api/categories/${button.dataset.delete}`, {
//           method: 'DELETE'
//         });
//         await loadCategories();
//       } catch (error) {
//         alert(error.message);
//       }
//     });
//   });
// }

// form.addEventListener('submit', async (e) => {
//   e.preventDefault();

//   try {
//     const name = categoryNameInput.value.trim();

//     if (!name) {
//       alert('Введіть назву категорії');
//       return;
//     }

//     if (editingCategoryId) {
//       await apiFetch(`/api/categories/${editingCategoryId}`, {
//         method: 'PUT',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ name })
//       });
//       alert('Категорію оновлено');
//     } else {
//       await apiFetch('/api/categories', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ name })
//       });
//       alert('Категорію додано');
//     }

//     form.reset();
//     editingCategoryId = null;
//     title.textContent = 'Додати категорію';
//     await loadCategories();
//   } catch (error) {
//     alert(error.message);
//   }
// });

// loadCategories();