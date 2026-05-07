function isAdminUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return false;
  try {
    const user = JSON.parse(raw);
    return user.role === 'admin';
  } catch (e) {
    return false;
  }
}

if (!isAdminUser()) {
  alert('Доступ заборонено!');
  window.location.href = 'shop.html';
}

const form = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const categorySelect = document.getElementById('category_id');
const currentImageWrapper = document.getElementById('currentImageWrapper');

let currentImages = []; 

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
  if (!response.ok) throw new Error(data.message || data.error || 'Сталася помилка');
  return data;
}

async function loadCategories(selectedId = null) {
  const categories = await apiFetch('/api/categories');
  categorySelect.innerHTML = '<option value="">Оберіть категорію</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    if (selectedId && Number(selectedId) === Number(category.id)) option.selected = true;
    categorySelect.appendChild(option);
  });
}

function renderCurrentImages() {
  if (currentImages.length === 0) {
    currentImageWrapper.innerHTML = '';
    return;
  }
  
  let html = '<p style="margin-bottom: 10px;">Поточні фотографії (натисніть на хрестик, щоб видалити):</p><div style="display: flex; flex-wrap: wrap; gap: 10px;">';
  currentImages.forEach((img, index) => {
    html += `
      <div style="position: relative; display: inline-block;">
        <img src="${img}" alt="Фото" style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc;">
        <button type="button" onclick="removeImage(${index})" style="position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-weight: bold; line-height: 18px; padding: 0;">&times;</button>
      </div>
    `;
  });
  html += '</div>';
  currentImageWrapper.innerHTML = html;
}

window.removeImage = function(index) {
  currentImages.splice(index, 1);
  renderCurrentImages(); 
};

async function loadProductForEdit(id) {
  const product = await apiFetch(`/api/products/${id}`);
  formTitle.textContent = 'Редагувати товар';
  
  document.getElementById('name').value = product.name || '';
  document.getElementById('description').value = product.description || '';
  document.getElementById('price').value = product.price || '';
  document.getElementById('stock_status').value = product.stock_status || 'В наявності';

  await loadCategories(product.category_id);

  if (product.image_url) {
    try {
      const parsed = JSON.parse(product.image_url);
      currentImages = Array.isArray(parsed) ? parsed : [product.image_url];
    } catch(e) {
      currentImages = [product.image_url];
    }
    renderCurrentImages();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const token = localStorage.getItem('accessToken');
    const fileInput = document.getElementById('images');
    const files = fileInput.files;

    let newUploadedImages = [];

    if (files.length > 0) {
      const uploadData = new FormData();
      for (let i = 0; i < files.length; i++) {
        uploadData.append('files', files[i]);
      }
      const uploadRes = await fetch('/upload-multiple', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: uploadData
      });
      const uploadResult = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadResult.message || 'Помилка завантаження фото');
      
      newUploadedImages = uploadResult.files.map(file => '/uploads/' + file.filename);
    }

    const finalImages = [...currentImages, ...newUploadedImages];

    const productId = getProductId();
    const url = productId ? `/api/products/${productId}` : '/api/products';
    const method = productId ? 'PUT' : 'POST';

    const payload = {
      name: document.getElementById('name').value,
      price: document.getElementById('price').value,
      category_id: categorySelect.value,
      description: document.getElementById('description').value,
      stock_status: document.getElementById('stock_status').value,
      images: finalImages
    };

    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Помилка збереження товару');

    alert(data.message);
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
