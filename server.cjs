// server.js — poprawiona wersja dla Render
// ----------------------------------------
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');

// Ścieżka do bazy SQLite
const DB_PATH = process.env.DB_PATH || './baza.sqlite';
const db = new Database(DB_PATH, { readonly: false });

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Pomocnicze mapowanie pól z tabeli Uzytkownik
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id_uzytkownika ?? row.id,
    imie: row.imie || '',
    nazwisko: row.nazwisko || '',
    email: row.email || '',
    data_dolaczenia: row.data_dolaczenia || '',
    komentarz: row.komentarz || ''
  };
}

// --- ENDPOINTY REST API ---

// GET /api/uzytkownicy — lista użytkowników
app.get('/api/uzytkownicy', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM Uzytkownik ORDER BY id_uzytkownika DESC').all();
    res.json(rows.map(mapUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/uzytkownicy/:id — pojedynczy użytkownik
app.get('/api/uzytkownicy/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Nie znaleziono użytkownika' });
    res.json(mapUser(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/uzytkownicy — dodaj użytkownika
app.post('/api/uzytkownicy', (req, res) => {
  try {
    const { imie, nazwisko, email, data_dolaczenia, komentarz } = req.body;
    const stmt = db.prepare('INSERT INTO Uzytkownik (imie, nazwisko, email, data_dolaczenia, komentarz) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(imie || '', nazwisko || '', email || '', data_dolaczenia || '', komentarz || '');
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(info.lastInsertRowid);
    res.status(201).json(mapUser(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/uzytkownicy/:id — edytuj użytkownika
app.put('/api/uzytkownicy/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { imie, nazwisko, email, data_dolaczenia, komentarz } = req.body;
    const stmt = db.prepare('UPDATE Uzytkownik SET imie=?, nazwisko=?, email=?, data_dolaczenia=?, komentarz=? WHERE id_uzytkownika=?');
    stmt.run(imie || '', nazwisko || '', email || '', data_dolaczenia || '', komentarz || '', id);
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika=?').get(id);
    res.json(mapUser(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/uzytkownicy/:id — usuń użytkownika
app.delete('/api/uzytkownicy/:id', (req, res) => {
  try {
    const id = req.params.id;
    const stmt = db.prepare('DELETE FROM Uzytkownik WHERE id_uzytkownika=?');
    const info = stmt.run(id);
    res.json({ ok: true, changes: info.changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Strona domyślna — test API
app.get('/', (req, res) => {
  res.send('✅ API działa poprawnie! Endpoint: /api/uzytkownicy');
});

// Start serwera
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server działa na porcie ${PORT}`));
