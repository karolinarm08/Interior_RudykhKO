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

const form = document.getElementById('categoryForm');
const categoryListContainer = document.getElementById('categoryList');

async function loadAdminCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();

        if (!categories || categories.length === 0) {
            categoryListContainer.innerHTML = '<p>Категорій поки немає.</p>';
            return;
        }

        categoryListContainer.innerHTML = categories.map(cat => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f9f9f9; margin-bottom: 5px; border-radius: 4px; border: 1px solid #ddd;">
                <span>${cat.name}</span>
                <button type="button" onclick="deleteCategory(${cat.id})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Видалити</button>
            </div>
        `).join('');
    } catch (error) {
        categoryListContainer.innerHTML = `<p>Помилка завантаження: ${error.message}</p>`;
    }
}

window.deleteCategory = async function(id) {
    if (!confirm('Видалити цю категорію?')) return;

    try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(`/api/categories/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Помилка при видаленні');
        }

        alert(data.message);
        loadAdminCategories(); // Оновлюємо список
    } catch (error) {
        alert(error.message);
    }
};

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById('categoryName');
    const name = nameInput.value.trim();

    if (!name) {
        alert('Введіть назву категорії');
        return;
    }

    try {
        const token = localStorage.getItem('accessToken');
        
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Помилка при додаванні категорії');
        }

        alert(data.message);
        nameInput.value = ''; 
        loadAdminCategories(); 
    } catch (error) {
        alert(error.message);
    }
});

loadAdminCategories();