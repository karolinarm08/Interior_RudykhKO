const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const connectDB = require('../db');

const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CALLBACK_URL
);

if (googleEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('Google не повернув email'));
          }

          const db = await connectDB();
          const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

          let user;
          if (rows.length) {
            user = rows[0];
          } else {
            const randomPassword = crypto.randomBytes(16).toString('hex');

            const [result] = await db.execute(
              `
              INSERT INTO users (name, email, password_hash, role, is_email_confirmed)
              VALUES (?, ?, ?, 'user', 1)
              `,
              [profile.displayName || 'Google User', email, randomPassword]
            );

            const [newRows] = await db.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
            user = newRows[0];
          }

          await db.end();
          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const db = await connectDB();
    const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    await db.end();
    done(null, rows[0] || null);
  } catch (error) {
    done(error);
  }
});

module.exports = { passport, googleEnabled };