const connectDB = require('./db');

async function runCRUD() {
  try {
    const db = await connectDB();

    const [products] = await db.execute('SELECT * FROM products');
    console.log('Товари:');
    console.log(products);

    // await db.execute(
    //   'INSERT INTO categories (name) VALUES (?)',
    //   ['Меблі']
    // );
    // console.log('Категорію додано');

    // await db.execute(
    //   'UPDATE products SET price = ? WHERE id = ?',
    //   [5555, 1]
    // );
    // console.log('Ціну товару оновлено');

    // await db.execute(
    //   'DELETE FROM categories WHERE name = ?',
    //   ['Меблі']
    // );
    // console.log('Категорію видалено');

    await db.end();
    console.log('CRUD виконано успішно');
  } catch (error) {
    console.error('Помилка:', error.message);
  }
}

runCRUD();
