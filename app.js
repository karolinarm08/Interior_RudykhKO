const express = require('express');
const connectDB = require('./db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const NodeCache = require('node-cache');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { verifyAccessToken, allowRoles } = require('./middleware/authMiddleware');
const errorHandler = require('./middleware/errorHandler');
const { passport, googleEnabled } = require('./config/passport');

dotenv.config();

const app = express();
const cache = new NodeCache({ stdTTL: 60 });
const PORT = process.env.PORT || 3000;

const morgan = require('morgan');
app.use(morgan('combined'));

const winston = require('winston');
// Ротація логів
const DailyRotateFile = require('winston-daily-rotate-file');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'app.log',
      maxsize: 5242880, // Максимальний розмір файлу: 5 МБ (в байтах)
      maxFiles: 5,      // Зберігати максимум 5 старих файлів
      tailable: true    // Нові логи завжди писатимуться в app.log
    }),
    new winston.transports.Console()
  ]
});
logger.info('Сервер запущено, логер ініціалізовано');

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.url} - ${duration}ms`);
  });
  next();
});

/* =========================
   PATHS / UPLOADS
========================= */

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неправильний формат файлу (дозволено лише jpg, png, pdf)'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: fileFilter
});

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json());

app.use(helmet());
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000
});
app.use('/api', limiter);

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', express.static('public/uploads'));

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

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Реєстрація нового користувача
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, confirmPassword]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Name"
 *               email:
 *                 type: string
 *                 example: "UserName@example.com"
 *               password:
 *                 type: string
 *                 example: "StrongPass123!"
 *               confirmPassword:
 *                 type: string
 *                 example: "StrongPass123!"
 *     responses:
 *       201:
 *         description: Користувача успішно зареєстровано
 *       400:
 *         description: Помилка валідації або email вже існує
 */
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

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Вхід користувача в систему
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "UserName@example.com"
 *               password:
 *                 type: string
 *                 example: "StrongPass123!"
 *     responses:
 *       200:
 *         description: Успішний вхід, повертає токени
 *       400:
 *         description: Невірний email або пароль
 *       403:
 *         description: Email не підтверджено
 */
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

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Отримати список користувачів (для адміністраторів)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список користувачів
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *                   is_email_confirmed:
 *                     type: boolean
 *                   created_at:
 *                     type: string
 *                   updated_at:
 *                     type: string
 *       401:
 *         description: Неавторизований - потрібен токен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Немає токена доступу"
 *       403:
 *         description: Недостатньо прав - потрібна роль admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Недостатньо прав"
 */
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

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Створити нову категорію (Лише для Адміна)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Освітлення"
 *     responses:
 *       201:
 *         description: Категорію успішно створено
 *       400:
 *         description: Категорія з такою назвою вже існує
 *       401:
 *         description: Неавторизований запит
 *       403:
 *         description: Недостатньо прав (не адмін)
 */
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

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Отримати категорію за ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID категорії
 *     responses:
 *       200:
 *         description: Дані категорії
 *       404:
 *         description: Категорію не знайдено
 */
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

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Оновити категорію (Лише для Адміна)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID категорії
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Нова назва"
 *     responses:
 *       200:
 *         description: Категорію оновлено
 *       404:
 *         description: Категорію не знайдено
 */
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

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Видалити категорію за ID (Лише для Адміна)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID категорії
 *     responses:
 *       200:
 *         description: Категорію видалено
 *       400:
 *         description: Категорія містить товари
 *       404:
 *         description: Категорію не знайдено
 */
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

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Отримати список товарів (з пагінацією та фільтрацією)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: integer
 *         description: Фільтр за ID категорії
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер сторінки
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Кількість товарів на сторінці
 *     responses:
 *       200:
 *         description: Список товарів
 */
app.get('/api/products', async (req, res, next) => {
  try {
    const {
      category,
      page = 1,
      limit = 10
    } = req.query;

    const cacheKey = category
      ? `products_category_${category}`
      : 'all_products';

    const cachedProducts = cache.get(cacheKey);

    if (cachedProducts) {
      return res.json(cachedProducts);
    }

    const db = await connectDB();

    let query = `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;

    let params = [];

    if (category) {
      query += ' WHERE p.category_id = ?';
      params.push(category);
    }

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const offset = (pageNumber - 1) * limitNumber;

    query += ` LIMIT ${limitNumber} OFFSET ${offset}`;

    const [rows] = await db.execute(query, params);

    await db.end();

    cache.set(cacheKey, rows);

    res.json(rows);

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Отримати товар за ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID товару
 *     responses:
 *       200:
 *         description: Дані товару
 *       404:
 *         description: Товар не знайдено
 */
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

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Додати новий товар (Лише для Адміна)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price, category_id]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Стильне крісло"
 *               price:
 *                 type: number
 *                 example: 3500
 *               category_id:
 *                 type: integer
 *                 example: 1
 *               description:
 *                 type: string
 *                 example: "М'яке крісло у скандинавському стилі"
 *               stock_status:
 *                 type: string
 *                 example: "В наявності"
 *     responses:
 *       200:
 *         description: Товар успішно створено
 *       400:
 *         description: Заповнені не всі обов'язкові поля
 */
app.post(
  '/api/products',
  verifyAccessToken,
  allowRoles('admin'),
  async (req, res, next) => {
    try {
      const { name, price, category_id, description, stock_status, images } = req.body;

      if (!name || !price || !category_id) {
        return res.status(400).json({ message: 'Заповніть обовʼязкові поля' });
      }

      const db = await connectDB();

      const imagesJson = Array.isArray(images) && images.length > 0 ? JSON.stringify(images) : null;

      await db.execute(
        `
        INSERT INTO products (name, price, category_id, description, stock_status, image_url)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [name, Number(price), category_id, description || null, stock_status || 'В наявності', imagesJson]
      );

      cache.flushAll();
      await db.end();
      res.json({ message: 'Товар створено' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Оновити товар (Лише для Адміна)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID товару
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               category_id:
 *                 type: integer
 *               description:
 *                 type: string
 *               stock_status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Товар оновлено
 *       404:
 *         description: Товар не знайдено
 */
app.put(
  '/api/products/:id',
  verifyAccessToken,
  allowRoles('admin'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, price, category_id, description, stock_status, images } = req.body;

      const db = await connectDB();

      const imagesJson = Array.isArray(images) && images.length > 0 ? JSON.stringify(images) : null;

      await db.execute(
        `
        UPDATE products
        SET name=?, price=?, category_id=?, description=?, stock_status=?, image_url=?
        WHERE id=?
        `,
        [name, Number(price), category_id, description, stock_status, imagesJson, id]
      );

      cache.flushAll();
      await db.end();
      res.json({ message: 'Товар оновлено' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Видалити товар (Лише для Адміна)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID товару
 *     responses:
 *       200:
 *         description: Товар видалено
 *       404:
 *         description: Товар не знайдено
 */
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

      cache.flushAll();
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

// Ендпоінт для завантаження одного файлу
app.post('/upload', upload.single('file'), (req, res) => {
  logger.info('Один файл успішно завантажено: ' + req.file.filename);
  res.json({
    message: 'Один файл успішно завантажено',
    file: req.file
  });
});

// Ендпоінт для завантаження кількох файлів
app.post('/upload-multiple', upload.array('files', 5), (req, res) => {
  const fileNames = req.files.map(f => f.filename).join(', ');

  logger.info('Успішно завантажено файли: ' + fileNames);

  res.json({
    message: 'Файли успішно завантажено',
    files: req.files
  });
});

app.get('/status', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  res.json({
    uptime: uptime,
    memoryUsage: memoryUsage
  });
});

// API для перегляду логів
app.get('/api/logs', (req, res) => {
  // Читаємо стандартний файл логів
  fs.readFile('app.log', 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Логи не знайдені' });
    // Розбиваємо рядки і віддаємо як масив JSON
    const logs = data.trim().split('\n').map(line => JSON.parse(line));
    res.json(logs);
  });
});

// панель моніторингу
app.get('/dashboard', (req, res) => {
  res.send(`
        <html>
            <head><title>Моніторинг</title></head>
            <body style="font-family: Arial; padding: 20px;">
                <h1>Панель моніторингу сервера</h1>
                <div id="stats">Завантаження...</div>
                <script>
                    setInterval(() => {
                        fetch('/status')
                            .then(r => r.json())
                            .then(data => {
                                document.getElementById('stats').innerHTML = 
                                    '<p><b>Uptime:</b> ' + data.uptime.toFixed(2) + ' сек</p>' +
                                    '<p><b>Пам\\'ять (Heap Used):</b> ' + (data.memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB</p>';
                            });
                    }, 2000); // Оновлення кожні 2 секунди
                </script>
            </body>
        </html>
    `);
});


/* =========================
   SWAGGER
========================= */

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Interior API',
      version: '1.0.0',
      description: 'Документація REST API для інтернет-магазину інтер’єру'
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Локальний сервер'
      }
    ],
    // Додаємо конфігурацію для Bearer JWT авторизації
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Введіть JWT-токен доступу (AccessToken), отриманий при логіні'
        }
      }
    }
  },
  apis: ['./app.js']
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs)
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

app.use((err, req, res, next) => {
  logger.error(`Помилка: ${err.message}`);
  res.status(500).json({
    error: "Сталася помилка на сервері",
    details: err.message
  });
});

/* =========================
   START
========================= */

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Сервер запущено: http://localhost:${PORT}`);
  });
}

module.exports = app;

