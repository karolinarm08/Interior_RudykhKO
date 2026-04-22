const productPage = document.getElementById('productPage');

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Сталася помилка');
  }

  return data;
}

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderProduct(product) {
  productPage.innerHTML = `
    <div class="product-layout">
      <div class="product-gallery">
        <img
          src="${product.image_url || './images/logo00.png'}"
          alt="${product.name}"
          class="product-main-image"
        >
      </div>

      <div class="product-details">
        <p class="product-breadcrumbs">
          <a href="shop.html">Магазин</a> / ${product.category_name || 'Категорія'} / ${product.name}
        </p>

        <h1>${product.name}</h1>

        <p class="product-category-badge">${product.category_name || 'Без категорії'}</p>

        <p class="product-price">${Number(product.price).toFixed(2)} грн</p>

        <p class="product-stock">
          <strong>Статус:</strong> ${product.stock_status || 'Не вказано'}
        </p>

        <div class="line"></div>

        <h2>Опис товару</h2>
        <p class="product-description-full">
          ${product.description || 'Опис товару відсутній.'}
        </p>

        <div class="product-actions">
          <a href="product-form.html?id=${product.id}" class="shop-main-btn">Редагувати товар</a>
          <a href="shop.html" class="shop-secondary-btn">Повернутись до каталогу</a>
        </div>
      </div>
    </div>
  `;
}

async function init() {
  const id = getProductId();

  if (!id) {
    productPage.innerHTML = '<p>Не вказано ідентифікатор товару.</p>';
    return;
  }

  try {
    const product = await apiFetch(`/api/products/${id}`);
    renderProduct(product);
  } catch (error) {
    productPage.innerHTML = `<p>${error.message}</p>`;
  }
}

init();