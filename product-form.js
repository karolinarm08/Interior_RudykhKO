if (!requireAdmin()) {
  throw new Error('Forbidden');
}

const form = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const categorySelect = document.getElementById('category_id');
const currentImageWrapper = document.getElementById('currentImageWrapper');

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

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

async function loadCategories(selectedId = null) {
  const categories = await apiFetch('/api/categories');

  categorySelect.innerHTML = '<option value="">Оберіть категорію</option>';

  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;

    if (selectedId && Number(selectedId) === Number(category.id)) {
      option.selected = true;
    }

    categorySelect.appendChild(option);
  });
}

async function loadProductForEdit(id) {
  const product = await apiFetch(`/api/products/${id}`);

  formTitle.textContent = 'Редагувати товар';

  document.getElementById('name').value = product.name || '';
  document.getElementById('description').value = product.description || '';
  document.getElementById('price').value = product.price || '';
  document.getElementById('stock_status').value = product.stock_status || 'В наявності';

  await loadCategories(product.category_id);

  if (product.image_url) {
    currentImageWrapper.innerHTML = `
      <p>Поточне фото:</p>
      <img src="${product.image_url}" alt="${product.name}" class="current-product-image">
    `;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const productId = getProductId();
    const formData = new FormData(form);
    const token = localStorage.getItem('accessToken');

    const url = productId ? `/api/products/${productId}` : '/api/products';
    const method = productId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Сталася помилка');
    }

    alert(productId ? 'Товар оновлено' : 'Товар додано');
    window.location.href = 'shop.html';
  } catch (error) {
    alert(error.message);
  }
});

async function init() {
  const productId = getProductId();

  if (productId) {
    await loadProductForEdit(productId);
  } else {
    await loadCategories();
  }
}

init();

// const form = document.getElementById('productForm');
// const formTitle = document.getElementById('formTitle');
// const categorySelect = document.getElementById('category_id');
// const currentImageWrapper = document.getElementById('currentImageWrapper');

// function getProductId() {
//   const params = new URLSearchParams(window.location.search);
//   return params.get('id');
// }

// async function apiFetch(url, options = {}) {
//   const response = await fetch(url, options);
//   const data = await response.json();

//   if (!response.ok) {
//     throw new Error(data.error || 'Сталася помилка');
//   }

//   return data;
// }

// async function loadCategories(selectedId = null) {
//   const categories = await apiFetch('/api/categories');

//   categorySelect.innerHTML = '<option value="">Оберіть категорію</option>';

//   categories.forEach(category => {
//     const option = document.createElement('option');
//     option.value = category.id;
//     option.textContent = category.name;

//     if (selectedId && Number(selectedId) === Number(category.id)) {
//       option.selected = true;
//     }

//     categorySelect.appendChild(option);
//   });
// }

// async function loadProductForEdit(id) {
//   const product = await apiFetch(`/api/products/${id}`);

//   formTitle.textContent = 'Редагувати товар';

//   document.getElementById('name').value = product.name || '';
//   document.getElementById('description').value = product.description || '';
//   document.getElementById('price').value = product.price || '';
//   document.getElementById('stock_status').value = product.stock_status || 'В наявності';

//   await loadCategories(product.category_id);

//   if (product.image_url) {
//     currentImageWrapper.innerHTML = `
//       <p>Поточне фото:</p>
//       <img src="${product.image_url}" alt="${product.name}" class="current-product-image">
//     `;
//   }
// }

// form.addEventListener('submit', async (e) => {
//   e.preventDefault();

//   try {
//     const productId = getProductId();
//     const formData = new FormData(form);

//     const url = productId ? `/api/products/${productId}` : '/api/products';
//     const method = productId ? 'PUT' : 'POST';

//     const response = await fetch(url, {
//       method,
//       body: formData
//     });

//     const data = await response.json();

//     if (!response.ok) {
//       throw new Error(data.error || 'Сталася помилка');
//     }

//     alert(productId ? 'Товар оновлено' : 'Товар додано');
//     window.location.href = 'shop.html';
//   } catch (error) {
//     alert(error.message);
//   }
// });

// async function init() {
//   const productId = getProductId();

//   if (productId) {
//     await loadProductForEdit(productId);
//   } else {
//     await loadCategories();
//   }
// }

// init();