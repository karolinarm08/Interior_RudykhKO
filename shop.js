const categoriesContainer = document.getElementById('categories');
const productsContainer = document.getElementById('products');

let currentCategoryId = null;

function getToken() {
  return localStorage.getItem('accessToken');
}

function getUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

function isAdminUser() {
  const user = getUser();
  return user && user.role === 'admin';
}

async function apiFetch(url, options = {}) {
  const token = getToken();

  const headers = { ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Сталася помилка');
  }

  return data;
}

async function loadCategories() {
  try {
    const categories = await apiFetch('/api/categories');
    renderCategories(categories);
  } catch (error) {
    categoriesContainer.innerHTML = `<p>${error.message}</p>`;
  }
}

async function loadProducts(categoryId = null) {
  try {
    const url = categoryId
      ? `/api/products?category=${categoryId}`
      : '/api/products';

    const products = await apiFetch(url);
    renderProducts(products);
  } catch (error) {
    productsContainer.innerHTML = `<p>${error.message}</p>`;
  }
}

function renderCategories(categories) {
  categoriesContainer.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.textContent = 'Усі товари';
  allBtn.className = currentCategoryId === null
    ? 'shop-filter-btn active'
    : 'shop-filter-btn';

  allBtn.onclick = () => {
    currentCategoryId = null;
    loadCategories();
    loadProducts();
  };

  categoriesContainer.appendChild(allBtn);

  categories.forEach(category => {
    const btn = document.createElement('button');
    btn.textContent = category.name;
    btn.className = currentCategoryId === category.id
      ? 'shop-filter-btn active'
      : 'shop-filter-btn';

    btn.onclick = () => {
      currentCategoryId = category.id;
      loadCategories();
      loadProducts(category.id);
    };

    categoriesContainer.appendChild(btn);
  });
}

function renderProducts(products) {
  productsContainer.innerHTML = '';

  if (!products.length) {
    productsContainer.innerHTML = '<p class="shop-empty">У цій категорії товарів поки немає.</p>';
    return;
  }

  products.forEach(product => {
    const article = document.createElement('article');
    article.className = 'shop-product-card';

    let displayImg = '/images/logo00.png';
    if (product.image_url) {
      try {
        const parsedImages = JSON.parse(product.image_url);
        if (Array.isArray(parsedImages) && parsedImages.length > 0) {
          displayImg = parsedImages[0]; 
        } else {
          displayImg = product.image_url; 
        }
      } catch(e) {
        displayImg = product.image_url; 
      }
    }

    const adminActions = isAdminUser()
      ? `
        <div class="shop-card-actions">
          <a href="product.html?id=${product.id}" class="shop-main-btn small">Детальніше</a>
          <a href="product-form.html?id=${product.id}" class="shop-secondary-btn small">Редагувати</a>
          <button class="shop-delete-btn small" data-id="${product.id}">Видалити</button>
        </div>
      `
      : `
        <div class="shop-card-actions">
          <a href="product.html?id=${product.id}" class="shop-main-btn small">Детальніше</a>
        </div>
      `;

    article.innerHTML = `
      <a class="shop-product-image-link" href="product.html?id=${product.id}">
        <img
          class="shop-product-image"
          src="${displayImg}"
          alt="${product.name}"
        >
      </a>
      <div class="shop-product-info">
        <p class="shop-product-category">${product.category_name || 'Без категорії'}</p>
        <h3><a href="product.html?id=${product.id}">${product.name}</a></h3>
        <p class="shop-product-description">${product.description || 'Опис товару відсутній.'}</p>
        <div class="shop-product-meta">
          <span class="shop-price">${Number(product.price).toFixed(2)} грн</span>
          <span class="shop-status">${product.stock_status || 'Не вказано'}</span>
        </div>
        ${adminActions}
      </div>
    `;

    productsContainer.appendChild(article);
  });

  document.querySelectorAll('.shop-delete-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.id;

      if (!confirm('Видалити цей товар?')) return;

      try {
        await apiFetch(`/api/products/${productId}`, {
          method: 'DELETE'
        });
        await loadProducts(currentCategoryId);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function updateAdminButtons() {
  const addProductBtn = document.getElementById('addProductWrapper');

  if (!isAdminUser()) {
    if (addProductBtn) addProductBtn.style.display = 'none';
  }
}

async function init() {
  updateAdminButtons();
  await loadCategories();
  await loadProducts();
}

init();
