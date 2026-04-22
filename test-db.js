const connectDB = require('./db');

async function test() {
  try {
    const db = await connectDB();
    console.log('Підключено');

    const [rows] = await db.execute('SELECT * FROM products');
    console.log(rows);

  } catch (error) {
    console.error('Помилка:', error.message);
  }
}

test();
