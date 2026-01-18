const pool = require('../db/pool');

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const q = `
      SELECT 
      *
      FROM public.users
      WHERE LOWER(username) = LOWER($1)
        AND "password" = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(q, [username, password]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    return res.json({
      success: true,
      usertype: rows[0].usertype,
      user: rows[0]
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

module.exports = { login };
