const sequelize = require('./config/database');
const { Category, Product } = require('./models');

async function runSequelizeDemo() {
  try {
    await sequelize.authenticate();
    console.log('Підключення через Sequelize успішне');

    await sequelize.sync();
    console.log('Синхронізація виконана');

    const category = await Category.create({
      name: 'Тестова категорія Sequelize'
    });
    console.log('Категорію створено:', category.toJSON());

    const product = await Product.create({
      name: 'Тестовий товар Sequelize',
      description: 'Створено через ORM Sequelize',
      price: 1999.99,
      stock_status: 'В наявності',
      category_id: category.id
    });
    console.log('Товар створено:', product.toJSON());

    const products = await Product.findAll({
      include: {
        model: Category,
        as: 'category'
      }
    });

    console.log('Усі товари разом з категоріями:');
    console.log(JSON.stringify(products, null, 2));

    await Product.update(
      { price: 2199.99 },
      { where: { id: product.id } }
    );
    console.log('Ціну товару оновлено');

    const updatedProduct = await Product.findByPk(product.id);
    console.log('Оновлений товар:', updatedProduct.toJSON());

    await Product.destroy({
      where: { id: product.id }
    });
    console.log('Товар видалено');

    await Category.destroy({
      where: { id: category.id }
    });
    console.log('Категорію видалено');

    await sequelize.close();
    console.log('З’єднання закрито');
  } catch (error) {
    console.error('Помилка Sequelize:', error.message);
  }
}

runSequelizeDemo();
