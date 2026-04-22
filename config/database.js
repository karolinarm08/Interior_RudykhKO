const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  'interior_shop',
  'root',
  'root123kara!',
  {
    host: 'localhost',
    port: 3307,
    dialect: 'mysql'
  }
);

module.exports = sequelize;