const mysql = require('mysql2/promise');
require('dotenv').config();

async function connectDB() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'interior_shop',
    port: Number(process.env.DB_PORT || 3306)
  });
}

module.exports = connectDB;

// // const mysql = require('mysql2/promise');

// // async function connectDB() {
// //   const connection = await mysql.createConnection({
// //     host: 'localhost',
// //     user: 'root',
// //     password: 'root123kara!',
// //     database: 'interior_shop',
// //     port: 3307 
// //   });

// //   return connection;
// // }

// // module.exports = connectDB;

// const mysql = require('mysql2/promise');
// require('dotenv').config();

// async function connectDB() {
//   return mysql.createConnection({
//     host: process.env.DB_HOST || 'localhost',
//     user: process.env.DB_USER || 'root',
//     password: process.env.DB_PASSWORD || '',
//     database: process.env.DB_NAME || 'interior_shop',
//     port: Number(process.env.DB_PORT || 3306)
//   });
// }

// module.exports = connectDB;