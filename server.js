// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Database from "better-sqlite3";
const db = new sqlite3.Database(path.join(__dirname, 'system_testow.sqlite'));
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const cors = require('cors');
app.use(cors());

const app = express();
app.use(cors({
  origin: ["https://waniuu.github.io"],
  credentials: false // true tylko jeśli używasz cookies/autoryzacji
}));
app.use(bodyParser.json());

// Serve static files (HTML + client JS + CSS)
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Utility helpers ---------- */
function runSql(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function allSql(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function getSql(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

/* ---------- API: pomocnicze listy (dla selectów w formularzach) ---------- */
// listuj nauczycieli (czytelna nazwa)
app.get('/api/teachers', async (req, res) => {
  try {
    // zakładamy: teachers.user_id -> users.user_id
    const rows = await allSql(`
      SELECT t.user_id AS teacher_id, u.first_name || ' ' || u.last_name AS name, u.email
      FROM teachers t
      JOIN users u ON u.user_id = t.user_id
      ORDER BY u.last_name, u.first_name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// listuj grupy
app.get('/api/groups', async (req, res) => {
  try {
    const rows = await allSql(`
      SELECT g.group_id, g.name,
             u.first_name || ' ' || u.last_name AS teacher_name
      FROM groups g
      LEFT JOIN teachers t ON g.teacher_id = t.user_id
      LEFT JOIN users u ON t.user_id = u.user_id
      ORDER BY g.name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// listuj użytkowników (opcjonalnie filtrowanych po roli)
app.get('/api/users', async (req, res) => {
  try {
    const role = req.query.role;
    if (role) {
      const rows = await allSql(`SELECT user_id, first_name, last_name, email, role FROM users WHERE role = ? ORDER BY last_name`, [role]);
      res.json(rows);
    } else {
      const rows = await allSql(`SELECT user_id, first_name, last_name, email, role FROM users ORDER BY last_name`);
      res.json(rows);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- CRUD: users ---------- */
// GET list + optional search by name/email
app.get('/api/users/list', async (req, res) => {
  try {
    const { q } = req.query;
    if (q) {
      const like = `%${q}%`;
      const rows = await allSql(
        `SELECT user_id, first_name, last_name, email, role, created_at FROM users
         WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
         ORDER BY last_name LIMIT 200`,
        [like, like, like]
      );
      res.json(rows);
    } else {
      const rows = await allSql(`SELECT user_id, first_name, last_name, email, role, created_at FROM users ORDER BY last_name LIMIT 200`);
      res.json(rows);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST add user
app.post('/api/users/add', async (req, res) => {
  try {
    const { first_name, last_name, email, role } = req.body;
    const r = await runSql(
      `INSERT INTO users (first_name, last_name, email, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [first_name||null, last_name||null, email||null, role||'user']
    );
    res.json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST delete user
app.post('/api/users/delete', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const r = await runSql(`DELETE FROM users WHERE user_id = ?`, [user_id]);
    res.json({ success: true, changes: r.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- CRUD: groups ---------- */
app.get('/api/groups/list', async (req, res) => {
  try {
    const { q } = req.query;
    if (q) {
      const like = `%${q}%`;
      const rows = await allSql(`
        SELECT g.group_id, g.name, g.teacher_id, u.first_name || ' ' || u.last_name AS teacher_name
        FROM groups g
        LEFT JOIN teachers t ON t.user_id = g.teacher_id
        LEFT JOIN users u ON u.user_id = t.user_id
        WHERE g.name LIKE ? OR u.last_name LIKE ?
        ORDER BY g.name
      `, [like, like]);
      res.json(rows);
    } else {
      const rows = await allSql(`
        SELECT g.group_id, g.name, g.teacher_id, u.first_name || ' ' || u.last_name AS teacher_name
        FROM groups g
        LEFT JOIN teachers t ON t.user_id = g.teacher_id
        LEFT JOIN users u ON u.user_id = t.user_id
        ORDER BY g.name
      `);
      res.json(rows);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/groups/add', async (req, res) => {
  try {
    const { name, teacher_id } = req.body;
    const r = await runSql(`INSERT INTO groups (group_id, name, teacher_id) VALUES (NULL, ?, ?)`, [name||null, teacher_id||null]);
    res.json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/groups/delete', async (req, res) => {
  try {
    const { group_id } = req.body;
    if (!group_id) return res.status(400).json({ error: 'group_id required' });
    const r = await runSql(`DELETE FROM groups WHERE group_id = ?`, [group_id]);
    res.json({ success: true, changes: r.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- CRUD: students ---------- */
app.get('/api/students/list', async (req, res) => {
  try {
    const { q, group_id } = req.query;
    let params = [];
    let where = '1=1';
    if (q) {
      where += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR s.student_index LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (group_id) {
      where += ` AND s.group_id = ?`;
      params.push(group_id);
    }
    const rows = await allSql(`
      SELECT s.user_id, s.student_index, s.group_id,
             u.first_name || ' ' || u.last_name AS student_name,
             g.name AS group_name
      FROM students s
      JOIN users u ON u.user_id = s.user_id
      LEFT JOIN groups g ON g.group_id = s.group_id
      WHERE ${where} ORDER BY u.last_name LIMIT 500
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/students/add', async (req, res) => {
  try {
    // assume if new student, we first create user then student row
    const { first_name, last_name, email, student_index, group_id } = req.body;
    // create user
    const user = await runSql(`INSERT INTO users (first_name,last_name,email,role,created_at) VALUES (?, ?, ?, 'student', datetime('now'))`, [first_name||null, last_name||null, email||null]);
    const user_id = user.lastID;
    // create students row
    const s = await runSql(`INSERT INTO students (user_id, student_index, group_id) VALUES (?, ?, ?)`, [user_id, student_index||null, group_id||null]);
    res.json({ success: true, student_user_id: user_id, student_row_changes: s.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/students/delete', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    // usuń wpis w students, potem (opcjonalnie) użytkownika — tu stosujemy kaskadę jeśli skonfigurowano, inaczej usuwamy ręcznie
    await runSql(`DELETE FROM students WHERE user_id = ?`, [user_id]);
    const r = await runSql(`DELETE FROM users WHERE user_id = ?`, [user_id]);
    res.json({ success: true, changes: r.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- CRUD: teachers (głównie lista i dodawanie) ---------- */
app.get('/api/teachers/list', async (req, res) => {
  try {
    const rows = await allSql(`
      SELECT t.user_id AS teacher_id, u.first_name || ' ' || u.last_name AS name, u.email
      FROM teachers t
      JOIN users u ON u.user_id = t.user_id
      ORDER BY u.last_name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// add teacher: create user + teacher row
app.post('/api/teachers/add', async (req, res) => {
  try {
    const { first_name, last_name, email } = req.body;
    const user = await runSql(`INSERT INTO users (first_name,last_name,email,role,created_at) VALUES (?, ?, ?, 'teacher', datetime('now'))`, [first_name||null, last_name||null, email||null]);
    const user_id = user.lastID;
    const t = await runSql(`INSERT INTO teachers (teacher_id, user_id) VALUES (NULL, ?)`, [user_id])
      .catch(async (err) => {
        // jeśli tabela teachers ma inny schemat (np. teacher_id = user_id), spróbuj insert z user_id jako PK
        await runSql(`INSERT OR IGNORE INTO teachers (user_id) VALUES (?)`, [user_id]);
      });
    res.json({ success: true, teacher_user_id: user_id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teachers/delete', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    await runSql(`DELETE FROM teachers WHERE user_id = ?`, [user_id]);
    await runSql(`DELETE FROM users WHERE user_id = ?`, [user_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- CRUD: tests ---------- */
app.get('/api/tests/list', async (req, res) => {
  try {
    const { q } = req.query;
    let sql = `
      SELECT t.test_id, t.title, t.description, t.created_at,
             u.first_name || ' ' || u.last_name AS teacher_name
      FROM tests t
      LEFT JOIN teachers te ON te.user_id = t.created_by_teacher_id
      LEFT JOIN users u ON u.user_id = te.user_id
    `;
    if (q) {
      sql += ` WHERE t.title LIKE ? OR t.description LIKE ? ORDER BY t.created_at DESC`;
      const like = `%${q}%`;
      const rows = await allSql(sql, [like, like]);
      res.json(rows);
    } else {
      sql += ` ORDER BY t.created_at DESC`;
      const rows = await allSql(sql);
      res.json(rows);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tests/add', async (req, res) => {
  try {
    const { title, description, created_by_teacher_id } = req.body;
    const r = await runSql(`INSERT INTO tests (title, description, created_at, created_by_teacher_id) VALUES (?, ?, datetime('now'), ?)`, [title||null, description||null, created_by_teacher_id||null]);
    res.json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tests/delete', async (req, res) => {
  try {
    const { test_id } = req.body;
    if (!test_id) return res.status(400).json({ error: 'test_id required' });
    const r = await runSql(`DELETE FROM tests WHERE test_id = ?`, [test_id]);
    res.json({ success: true, changes: r.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Default route (serve index) ---------- */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ---------- Start server ---------- */
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

