const express = require('express');
const connectDB = require('./db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const { verifyAccessToken, allowRoles } = require('./middleware/authMiddleware');
const errorHandler = require('./middleware/errorHandler');
const { passport, googleEnabled } = require('./config/passport');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   PATHS / UPLOADS
========================= */

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/\s+/g, '-');
    cb(null, `${uniqueSuffix}-${safeName}`);
  }
});

const upload = multer({ storage });

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

/* =========================
   HELPERS
========================= */

function createAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m' }
  );
}

function createRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
}

function createRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Помилка валідації',
      errors: errors.array()
    });
  }
  return null;
}

async function sendEmailOrLog(to, subject, text) {
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text
    });
  } else {
    console.log('EMAIL NOT SENT - SMTP not configured');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Text:', text);
  }
}

function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

/* =========================
   RATE LIMIT
========================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Забагато спроб входу. Спробуйте пізніше.'
  }
});

/* =========================
   STATIC PAGES
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* =========================
   AUTH
========================= */

app.post(
  '/api/auth/register',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Ім’я є обов’язковим'),

    body('email')
      .isEmail()
      .withMessage('Некоректний email'),

    body('password')
      .notEmpty()
      .withMessage('Пароль є обов’язковим')
      .isLength({ min: 8 })
      .withMessage('Пароль має містити мінімум 8 символів')
      .matches(/[A-Z]/)
      .withMessage('Пароль має містити хоча б одну велику літеру')
      .matches(/[a-z]/)
      .withMessage('Пароль має містити хоча б одну малу літеру')
      .matches(/[0-9]/)
      .withMessage('Пароль має містити хоча б одну цифру')
      .matches(/[!@#$%^&*()_\-+=[\]{};:'"\\|,.<>/?]/)
      .withMessage('Пароль має містити хоча б один спеціальний символ'),

    body('confirmPassword')
      .notEmpty()
      .withMessage('Підтвердження пароля є обов’язковим')
  ],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { name, email, password, confirmPassword } = req.body;

      if (password !== confirmPassword) {
        return res.status(400).json({
          message: 'Пароль і підтвердження пароля не співпадають'
        });
      }

      const db = await connectDB();

      const [existingUsers] = await db.execute(
        'SELECT id FROM users WHERE email = ?',
        [email.trim().toLowerCase()]
      );

      if (existingUsers.length) {
        await db.end();
        return res.status(400).json({
          message: 'Користувач з таким email вже існує'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const emailVerificationToken = createRandomToken();

      const [result] = await db.execute(
        `
        INSERT INTO users
        (name, email, password_hash, role, email_verification_token)
        VALUES (?, ?, ?, 'user', ?)
        `,
        [
          name.trim(),
          email.trim().toLowerCase(),
          hashedPassword,
          emailVerificationToken
        ]
      );

      const verifyLink = `${getBaseUrl(req)}/api/auth/verify-email/${emailVerificationToken}`;

      await sendEmailOrLog(
        email.trim().toLowerCase(),
        'Підтвердження email',
        `Перейдіть за посиланням для підтвердження email: ${verifyLink}`
      );

      await db.end();

      res.status(201).json({
        message: 'Користувача зареєстровано. Підтвердіть email.',
        userId: result.insertId,
        verifyLink
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get('/api/auth/verify-email/:token', async (req, res, next) => {
  try {
    const db = await connectDB();

    const [rows] = await db.execute(
      'SELECT id, is_email_confirmed FROM users WHERE email_verification_token = ?',
      [req.params.token]
    );

    if (!rows.length) {
      await db.end();
      return res.status(400).json({
        message: 'Недійсний токен підтвердження email'
      });
    }

    await db.execute(
      `
      UPDATE users
      SET is_email_confirmed = 1,
          email_verification_token = NULL
      WHERE id = ?
      `,
      [rows[0].id]
    );

    await db.end();

    res.json({
      message: 'Email успішно підтверджено'
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/auth/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Некоректний email'),
    body('password').notEmpty().withMessage('Пароль є обов’язковим')
  ],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { email, password } = req.body;

      const db = await connectDB();

      const [rows] = await db.execute(
        'SELECT * FROM users WHERE email = ?',
        [email.trim().toLowerCase()]
      );

      if (!rows.length) {
        await db.end();
        return res.status(400).json({
          message: 'Користувача не знайдено'
        });
      }

      const user = rows[0];

      if (!user.is_email_confirmed) {
        await db.end();
        return res.status(403).json({
          message: 'Підтвердіть email перед входом'
        });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        await db.end();
        return res.status(400).json({
          message: 'Невірний пароль'
        });
      }

      const accessToken = createAccessToken(user);
      const refreshToken = createRefreshToken(user);

      await db.execute(
        'UPDATE users SET refresh_token = ? WHERE id = ?',
        [refreshToken, user.id]
      );

      await db.end();

      res.json({
        message: 'Вхід успішний',
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post('/api/auth/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        message: 'Refresh token обов’язковий'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({
        message: 'Недійсний refresh token'
      });
    }

    const db = await connectDB();

    const [rows] = await db.execute(
      'SELECT * FROM users WHERE id = ? AND refresh_token = ?',
      [decoded.id, refreshToken]
    );

    if (!rows.length) {
      await db.end();
      return res.status(401).json({
        message: 'Refresh token не знайдено'
      });
    }

    const user = rows[0];
    const newAccessToken = createAccessToken(user);
    const newRefreshToken = createRefreshToken(user);

    await db.execute(
      'UPDATE users SET refresh_token = ? WHERE id = ?',
      [newRefreshToken, user.id]
    );

    await db.end();

    res.json({
      message: 'Токени оновлено',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', verifyAccessToken, async (req, res, next) => {
  try {
    const db = await connectDB();

    await db.execute(
      'UPDATE users SET refresh_token = NULL WHERE id = ?',
      [req.user.id]
    );

    await db.end();

    res.json({
      message: 'Вихід виконано успішно'
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/auth/forgot-password',
  [body('email').isEmail().withMessage('Некоректний email')],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { email } = req.body;
      const db = await connectDB();

      const [rows] = await db.execute(
        'SELECT id, email FROM users WHERE email = ?',
        [email.trim().toLowerCase()]
      );

      if (!rows.length) {
        await db.end();
        return res.status(404).json({
          message: 'Користувача з таким email не знайдено'
        });
      }

      const token = createRandomToken();
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.execute(
        `
        UPDATE users
        SET password_reset_token = ?, password_reset_expires = ?
        WHERE email = ?
        `,
        [token, expires, email.trim().toLowerCase()]
      );

      const resetLink = `${getBaseUrl(req)}/api/auth/reset-password/${token}`;

      await sendEmailOrLog(
        email.trim().toLowerCase(),
        'Відновлення пароля',
        `Перейдіть за посиланням для скидання пароля: ${resetLink}`
      );

      await db.end();

      res.json({
        message: 'Посилання для відновлення пароля створено',
        resetLink
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get('/api/auth/reset-password/:token', (req, res) => {
  res.send(`
    <h2>Скидання пароля</h2>
    <p>Token: ${req.params.token}</p>
  `);
});

app.post(
  '/api/auth/reset-password/:token',
  [
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Новий пароль має містити мінімум 6 символів'),
    body('confirmNewPassword')
      .notEmpty()
      .withMessage('Підтвердження нового пароля є обов’язковим')
  ],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { newPassword, confirmNewPassword } = req.body;

      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({
          message: 'Новий пароль і підтвердження не співпадають'
        });
      }

      const db = await connectDB();

      const [rows] = await db.execute(
        `
        SELECT * FROM users
        WHERE password_reset_token = ?
          AND password_reset_expires IS NOT NULL
          AND password_reset_expires > NOW()
        `,
        [req.params.token]
      );

      if (!rows.length) {
        await db.end();
        return res.status(400).json({
          message: 'Недійсний або прострочений токен відновлення'
        });
      }

      const user = rows[0];
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await db.execute(
        `
        UPDATE users
        SET password_hash = ?,
            password_reset_token = NULL,
            password_reset_expires = NULL,
            refresh_token = NULL
        WHERE id = ?
        `,
        [hashedPassword, user.id]
      );

      await db.end();

      res.json({
        message: 'Пароль успішно змінено'
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================
   GOOGLE OAUTH
========================= */

app.get('/api/auth/google', (req, res, next) => {
  if (!googleEnabled) {
    return res.status(400).json({
      message: 'Google OAuth не налаштований у .env'
    });
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })(req, res, next);
});

app.get('/api/auth/google/callback', (req, res, next) => {
  if (!googleEnabled) {
    return res.status(400).json({
      message: 'Google OAuth не налаштований у .env'
    });
  }

  passport.authenticate('google', { session: false }, async (err, user) => {
    try {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.status(401).json({
          message: 'Google авторизація не вдалася'
        });
      }

      const accessToken = createAccessToken(user);
      const refreshToken = createRefreshToken(user);

      const db = await connectDB();
      await db.execute(
        'UPDATE users SET refresh_token = ? WHERE id = ?',
        [refreshToken, user.id]
      );
      await db.end();

      res.json({
        message: 'Google login успішний',
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      next(error);
    }
  })(req, res, next);
});

/* =========================
   PROFILE
========================= */

app.get('/api/profile', verifyAccessToken, async (req, res, next) => {
  try {
    const db = await connectDB();

    const [rows] = await db.execute(
      `
      SELECT id, name, email, role, is_email_confirmed, created_at, updated_at
      FROM users
      WHERE id = ?
      `,
      [req.user.id]
    );

    await db.end();

    if (!rows.length) {
      return res.status(404).json({
        message: 'Користувача не знайдено'
      });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.put(
  '/api/profile',
  verifyAccessToken,
  [
    body('name').trim().notEmpty().withMessage('Ім’я є обов’язковим'),
    body('email').isEmail().withMessage('Некоректний email')
  ],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { name, email } = req.body;
      const db = await connectDB();

      const [existingUsers] = await db.execute(
        'SELECT id FROM users WHERE email = ? AND id <> ?',
        [email.trim().toLowerCase(), req.user.id]
      );

      if (existingUsers.length) {
        await db.end();
        return res.status(400).json({
          message: 'Такий email уже використовується іншим користувачем'
        });
      }

      await db.execute(
        `
        UPDATE users
        SET name = ?, email = ?
        WHERE id = ?
        `,
        [name.trim(), email.trim().toLowerCase(), req.user.id]
      );

      await db.end();

      res.json({
        message: 'Профіль оновлено'
      });
    } catch (error) {
      next(error);
    }
  }
);

app.patch(
  '/api/profile/change-password',
  verifyAccessToken,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Поточний пароль є обов’язковим'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Новий пароль має містити мінімум 6 символів'),
    body('confirmNewPassword')
      .notEmpty()
      .withMessage('Підтвердження нового пароля є обов’язковим')
  ],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { currentPassword, newPassword, confirmNewPassword } = req.body;

      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({
          message: 'Новий пароль і підтвердження не співпадають'
        });
      }

      const db = await connectDB();

      const [rows] = await db.execute(
        'SELECT * FROM users WHERE id = ?',
        [req.user.id]
      );

      if (!rows.length) {
        await db.end();
        return res.status(404).json({
          message: 'Користувача не знайдено'
        });
      }

      const user = rows[0];
      const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

      if (!isMatch) {
        await db.end();
        return res.status(400).json({
          message: 'Поточний пароль невірний'
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await db.execute(
        `
        UPDATE users
        SET password_hash = ?, refresh_token = NULL
        WHERE id = ?
        `,
        [hashedPassword, req.user.id]
      );

      await db.end();

      res.json({
        message: 'Пароль успішно змінено. Увійдіть повторно.'
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================
   ADMIN USERS
========================= */

app.get(
  '/api/admin/users',
  verifyAccessToken,
  allowRoles('admin'),
  async (req, res, next) => {
    try {
      const db = await connectDB();

      const [rows] = await db.execute(
        `
        SELECT id, name, email, role, is_email_confirmed, created_at, updated_at
        FROM users
        ORDER BY id DESC
        `
      );

      await db.end();

      res.json(rows);
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  '/api/users/:id',
  verifyAccessToken,
  allowRoles('admin'),
  async (req, res, next) => {
    try {
      const userId = Number(req.params.id);

      if (userId === req.user.id) {
        return res.status(400).json({
          message: 'Адміністратор не може видалити власний акаунт'
        });
      }

      if (!userId) {
        return res.status(400).json({
          message: 'Некоректний id користувача'
        });
      }

      const db = await connectDB();

      const [rows] = await db.execute(
        'SELECT id FROM users WHERE id = ?',
        [userId]
      );

      if (!rows.length) {
        await db.end();
        return res.status(404).json({
          message: 'Користувача не знайдено'
        });
      }

      await db.execute('DELETE FROM users WHERE id = ?', [userId]);
      await db.end();

      res.json({
        message: 'Користувача видалено'
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================
   CATEGORIES
========================= */

app.get('/api/categories', async (req, res, next) => {
  try {
    const db = await connectDB();
    const [rows] = await db.execute('SELECT * FROM categories ORDER BY name');
    await db.end();
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/categories/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    const [rows] = await db.execute(
      'SELECT * FROM categories WHERE id = ?',
      [req.params.id]
    );
    await db.end();

    if (!rows.length) {
      return res.status(404).json({ message: 'Категорію не знайдено' });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/categories',
  verifyAccessToken,
  allowRoles('admin'),
  [body('name').trim().notEmpty().withMessage('Назва категорії обов’язкова')],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { name } = req.body;
      const db = await connectDB();

      const [existingRows] = await db.execute(
        'SELECT id FROM categories WHERE name = ?',
        [name.trim()]
      );

      if (existingRows.length) {
        await db.end();
        return res.status(400).json({
          message: 'Категорія з такою назвою вже існує'
        });
      }

      const [result] = await db.execute(
        'INSERT INTO categories (name) VALUES (?)',
        [name.trim()]
      );

      await db.end();

      res.status(201).json({
        message: 'Категорію додано',
        id: result.insertId
      });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  '/api/categories/:id',
  verifyAccessToken,
  allowRoles('admin'),
  [body('name').trim().notEmpty().withMessage('Назва категорії обов’язкова')],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { name } = req.body;
      const db = await connectDB();

      const [rows] = await db.execute(
        'SELECT id FROM categories WHERE id = ?',
        [req.params.id]
      );

      if (!rows.length) {
        await db.end();
        return res.status(404).json({
          message: 'Категорію не знайдено'
        });
      }

      await db.execute(
        'UPDATE categories SET name = ? WHERE id = ?',
        [name.trim(), req.params.id]
      );

      await db.end();

      res.json({
        message: 'Категорію оновлено'
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  '/api/categories/:id',
  verifyAccessToken,
  allowRoles('admin'),
  async (req, res, next) => {
    try {
      const db = await connectDB();

      const [products] = await db.execute(
        'SELECT id FROM products WHERE category_id = ? LIMIT 1',
        [req.params.id]
      );

      if (products.length) {
        await db.end();
        return res.status(400).json({
          message: 'Категорію не можна видалити, бо в ній є товари'
        });
      }

      await db.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
      await db.end();

      res.json({
        message: 'Категорію видалено'
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================
   PRODUCTS
========================= */

app.get('/api/products', async (req, res, next) => {
  try {
    const db = await connectDB();

    let sql = `
      SELECT products.*, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
    `;
    const params = [];

    if (req.query.category) {
      sql += ' WHERE products.category_id = ?';
      params.push(req.query.category);
    }

    sql += ' ORDER BY products.id DESC';

    const [rows] = await db.execute(sql, params);
    await db.end();

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/products/:id', async (req, res, next) => {
  try {
    const db = await connectDB();
    const [rows] = await db.execute(
      `
      SELECT products.*, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      WHERE products.id = ?
      `,
      [req.params.id]
    );
    await db.end();

    if (!rows.length) {
      return res.status(404).json({ message: 'Товар не знайдено' });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/products',
  verifyAccessToken,
  allowRoles('admin'),
  upload.single('image'),
  [
    body('name').trim().notEmpty().withMessage('Назва товару обов’язкова'),
    body('price').notEmpty().withMessage('Ціна є обов’язковою'),
    body('category_id').notEmpty().withMessage('Категорія є обов’язковою')
  ],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { name, description, price, stock_status, category_id } = req.body;

      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

      const db = await connectDB();

      const [categoryRows] = await db.execute(
        'SELECT id FROM categories WHERE id = ?',
        [Number(category_id)]
      );

      if (!categoryRows.length) {
        await db.end();
        return res.status(400).json({
          message: 'Обрана категорія не існує'
        });
      }

      const [result] = await db.execute(
        `
        INSERT INTO products (name, description, price, stock_status, category_id, image_url)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          name.trim(),
          description?.trim() || '',
          Number(price),
          stock_status?.trim() || 'В наявності',
          Number(category_id),
          imageUrl
        ]
      );

      await db.end();

      res.status(201).json({
        message: 'Товар додано',
        id: result.insertId
      });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  '/api/products/:id',
  verifyAccessToken,
  allowRoles('admin'),
  upload.single('image'),
  [
    body('name').trim().notEmpty().withMessage('Назва товару обов’язкова'),
    body('price').notEmpty().withMessage('Ціна є обов’язковою'),
    body('category_id').notEmpty().withMessage('Категорія є обов’язковою')
  ],
  async (req, res, next) => {
    try {
      const validation = sendValidationErrors(req, res);
      if (validation) return validation;

      const { name, description, price, stock_status, category_id } = req.body;
      const db = await connectDB();

      const [existingRows] = await db.execute(
        'SELECT * FROM products WHERE id = ?',
        [req.params.id]
      );

      if (!existingRows.length) {
        await db.end();
        return res.status(404).json({ message: 'Товар не знайдено' });
      }

      const existingProduct = existingRows[0];
      const imageUrl = req.file
        ? `/uploads/${req.file.filename}`
        : existingProduct.image_url;

      await db.execute(
        `
        UPDATE products
        SET name = ?, description = ?, price = ?, stock_status = ?, category_id = ?, image_url = ?
        WHERE id = ?
        `,
        [
          name.trim(),
          description?.trim() || '',
          Number(price),
          stock_status?.trim() || 'В наявності',
          Number(category_id),
          imageUrl,
          Number(req.params.id)
        ]
      );

      await db.end();

      res.json({ message: 'Товар оновлено' });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  '/api/products/:id',
  verifyAccessToken,
  allowRoles('admin'),
  async (req, res, next) => {
    try {
      const db = await connectDB();

      const [rows] = await db.execute(
        'SELECT image_url FROM products WHERE id = ?',
        [req.params.id]
      );

      if (!rows.length) {
        await db.end();
        return res.status(404).json({ message: 'Товар не знайдено' });
      }

      const imageUrl = rows[0].image_url;

      await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
      await db.end();

      if (imageUrl) {
        const absolutePath = path.join(__dirname, imageUrl.replace(/^\//, ''));
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
        }
      }

      res.json({ message: 'Товар видалено' });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================
   404
========================= */

app.use((req, res) => {
  res.status(404).json({
    message: 'Маршрут не знайдено'
  });
});

/* =========================
   ERROR HANDLER
========================= */

app.use(errorHandler);

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(`Сервер запущено: http://localhost:${PORT}`);
});

// const express = require('express');
// const connectDB = require('./db');
// const path = require('path');
// const fs = require('fs');
// const multer = require('multer');

// const app = express();
// const PORT = 3000;

// const uploadsDir = path.join(__dirname, 'uploads');
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir);
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir);
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     const safeName = file.originalname.replace(/\s+/g, '-');
//     cb(null, `${uniqueSuffix}-${safeName}`);
//   }
// });

// const upload = multer({ storage });

// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(express.static(__dirname));
// app.use('/uploads', express.static(uploadsDir));

// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'index.html'));
// });

// /* =========================
//    CATEGORIES
// ========================= */

// app.get('/api/categories', async (req, res) => {
//   try {
//     const db = await connectDB();
//     const [rows] = await db.execute('SELECT * FROM categories ORDER BY name');
//     await db.end();
//     res.json(rows);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get('/api/categories/:id', async (req, res) => {
//   try {
//     const db = await connectDB();
//     const [rows] = await db.execute(
//       'SELECT * FROM categories WHERE id = ?',
//       [req.params.id]
//     );
//     await db.end();

//     if (!rows.length) {
//       return res.status(404).json({ error: 'Категорію не знайдено' });
//     }

//     res.json(rows[0]);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.post('/api/categories', async (req, res) => {
//   try {
//     const { name } = req.body;

//     if (!name || !name.trim()) {
//       return res.status(400).json({ error: 'Назва категорії обов’язкова' });
//     }

//     const db = await connectDB();
//     const [result] = await db.execute(
//       'INSERT INTO categories (name) VALUES (?)',
//       [name.trim()]
//     );
//     await db.end();

//     res.json({
//       message: 'Категорію додано',
//       id: result.insertId
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.put('/api/categories/:id', async (req, res) => {
//   try {
//     const { name } = req.body;

//     if (!name || !name.trim()) {
//       return res.status(400).json({ error: 'Назва категорії обов’язкова' });
//     }

//     const db = await connectDB();
//     await db.execute(
//       'UPDATE categories SET name = ? WHERE id = ?',
//       [name.trim(), req.params.id]
//     );
//     await db.end();

//     res.json({ message: 'Категорію оновлено' });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.delete('/api/categories/:id', async (req, res) => {
//   try {
//     const db = await connectDB();

//     const [products] = await db.execute(
//       'SELECT id FROM products WHERE category_id = ? LIMIT 1',
//       [req.params.id]
//     );

//     if (products.length) {
//       await db.end();
//       return res.status(400).json({
//         error: 'Категорію не можна видалити, бо в ній є товари'
//       });
//     }

//     await db.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
//     await db.end();

//     res.json({ message: 'Категорію видалено' });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// /* =========================
//    PRODUCTS
// ========================= */

// app.get('/api/products', async (req, res) => {
//   try {
//     const db = await connectDB();

//     let sql = `
//       SELECT products.*, categories.name AS category_name
//       FROM products
//       LEFT JOIN categories ON products.category_id = categories.id
//     `;
//     const params = [];

//     if (req.query.category) {
//       sql += ' WHERE products.category_id = ?';
//       params.push(req.query.category);
//     }

//     sql += ' ORDER BY products.id DESC';

//     const [rows] = await db.execute(sql, params);
//     await db.end();

//     res.json(rows);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get('/api/products/:id', async (req, res) => {
//   try {
//     const db = await connectDB();
//     const [rows] = await db.execute(
//       `
//       SELECT products.*, categories.name AS category_name
//       FROM products
//       LEFT JOIN categories ON products.category_id = categories.id
//       WHERE products.id = ?
//       `,
//       [req.params.id]
//     );
//     await db.end();

//     if (!rows.length) {
//       return res.status(404).json({ error: 'Товар не знайдено' });
//     }

//     res.json(rows[0]);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.post('/api/products', upload.single('image'), async (req, res) => {
//   try {
//     const { name, description, price, stock_status, category_id } = req.body;

//     if (!name || !price || !category_id) {
//       return res.status(400).json({
//         error: 'Поля name, price, category_id є обов’язковими'
//       });
//     }

//     const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

//     const db = await connectDB();
//     const [result] = await db.execute(
//       `
//       INSERT INTO products (name, description, price, stock_status, category_id, image_url)
//       VALUES (?, ?, ?, ?, ?, ?)
//       `,
//       [
//         name.trim(),
//         description?.trim() || '',
//         Number(price),
//         stock_status?.trim() || 'В наявності',
//         Number(category_id),
//         imageUrl
//       ]
//     );
//     await db.end();

//     res.json({
//       message: 'Товар додано',
//       id: result.insertId
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.put('/api/products/:id', upload.single('image'), async (req, res) => {
//   try {
//     const { name, description, price, stock_status, category_id } = req.body;

//     if (!name || !price || !category_id) {
//       return res.status(400).json({
//         error: 'Поля name, price, category_id є обов’язковими'
//       });
//     }

//     const db = await connectDB();

//     const [existingRows] = await db.execute(
//       'SELECT * FROM products WHERE id = ?',
//       [req.params.id]
//     );

//     if (!existingRows.length) {
//       await db.end();
//       return res.status(404).json({ error: 'Товар не знайдено' });
//     }

//     const existingProduct = existingRows[0];
//     const imageUrl = req.file
//       ? `/uploads/${req.file.filename}`
//       : existingProduct.image_url;

//     await db.execute(
//       `
//       UPDATE products
//       SET name = ?, description = ?, price = ?, stock_status = ?, category_id = ?, image_url = ?
//       WHERE id = ?
//       `,
//       [
//         name.trim(),
//         description?.trim() || '',
//         Number(price),
//         stock_status?.trim() || 'В наявності',
//         Number(category_id),
//         imageUrl,
//         Number(req.params.id)
//       ]
//     );

//     await db.end();
//     res.json({ message: 'Товар оновлено' });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.delete('/api/products/:id', async (req, res) => {
//   try {
//     const db = await connectDB();

//     const [rows] = await db.execute(
//       'SELECT image_url FROM products WHERE id = ?',
//       [req.params.id]
//     );

//     if (!rows.length) {
//       await db.end();
//       return res.status(404).json({ error: 'Товар не знайдено' });
//     }

//     const imageUrl = rows[0].image_url;

//     await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
//     await db.end();

//     if (imageUrl) {
//       const absolutePath = path.join(__dirname, imageUrl.replace(/^\//, ''));
//       if (fs.existsSync(absolutePath)) {
//         fs.unlinkSync(absolutePath);
//       }
//     }

//     res.json({ message: 'Товар видалено' });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Сервер запущено: http://localhost:${PORT}`);
// });