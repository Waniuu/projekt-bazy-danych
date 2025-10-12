// --- server.js ---
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const Database = require('better-sqlite3')

import cors from "cors";

const DB_PATH = process.env.DB_PATH || './baza.sqlite'
const db = new Database(DB_PATH, { readonly: false })

const app = express()
app.use(cors())
app.use(bodyParser.json())

// helper: map row to user object (kolumny z twojej bazy)
function mapUser(row){
  if(!row) return null
  return {
    id: row.id_uzytkownika !== undefined ? row.id_uzytkownika : row.id,
    imie: row.imie || '',
    nazwisko: row.nazwisko || '',
    email: row.email || '',
    data_dolaczenia: row.data_dolaczenia || row.data || '',
    komentarz: row.komentarz || row.notatki || ''
  }
}

// GET all users
app.get('/api/uzytkownicy', (req, res) => {
  try{
    const rows = db.prepare('SELECT * FROM Uzytkownik ORDER BY id_uzytkownika DESC').all()
    res.json(rows.map(mapUser))
  }catch(err){ console.error(err); res.status(500).json({error:err.message}) }
})

// GET single
app.get('/api/uzytkownicy/:id', (req,res)=>{
  try{
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(req.params.id)
    res.json(mapUser(row))
  }catch(err){ console.error(err); res.status(500).json({error:err.message}) }
})

// POST create
app.post('/api/uzytkownicy', (req,res)=>{
  try{
    const { imie, nazwisko, email, data_dolaczenia, komentarz } = req.body
    const stmt = db.prepare('INSERT INTO Uzytkownik (imie,nazwisko,email,data_dolaczenia,komentarz) VALUES (?,?,?,?,?)')
    const info = stmt.run(imie||'', nazwisko||'', email||'', data_dolaczenia||'', komentarz||'')
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(info.lastInsertRowid)
    res.status(201).json(mapUser(row))
  }catch(err){ console.error(err); res.status(500).json({error:err.message}) }
})

// PUT update
app.put('/api/uzytkownicy/:id', (req,res)=>{
  try{
    const id = req.params.id
    const { imie, nazwisko, email, data_dolaczenia, komentarz } = req.body
    const stmt = db.prepare('UPDATE Uzytkownik SET imie=?, nazwisko=?, email=?, data_dolaczenia=?, komentarz=? WHERE id_uzytkownika = ?')
    const info = stmt.run(imie||'', nazwisko||'', email||'', data_dolaczenia||'', komentarz||'', id)
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(id)
    res.json(mapUser(row))
  }catch(err){ console.error(err); res.status(500).json({error:err.message}) }
})

// DELETE
app.delete('/api/uzytkownicy/:id', (req,res)=>{
  try{
    const id = req.params.id
    const stmt = db.prepare('DELETE FROM Uzytkownik WHERE id_uzytkownika = ?')
    const info = stmt.run(id)
    res.json({ok:true,changes:info.changes})
  }catch(err){ console.error(err); res.status(500).json({error:err.message}) }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, ()=> console.log('Server listening on',PORT))
app.get("/Uzytkownik", async (req, res) => {
  const rows = await db.all("SELECT imie, nazwisko, email FROM Uzytkownik");
  res.json(rows);
});
// ==================================
// 1. Przeglądanie danych czytelnie
// ==================================
app.get("/Uzytkownik", (req, res) => {
    const sql = `SELECT s.id_uzytkownika, u.imie, u.nazwisko, s.numer_indeksu
                 FROM Student s
                 JOIN Uzytkownik u ON s.id_uzytkownika = u.id_uzytkownika`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// ==================================
// 2. Wyszukiwanie studentów po imieniu/nazwisku
// ==================================
app.get('/Uzytkownik/search', (req, res) => {
    const { q } = req.query;
    const sql = `SELECT s.id_uzytkownika, u.imie, u.nazwisko, s.numer_indeksu
                 FROM Student s
                 JOIN Uzytkownik u ON s.id_uzytkownika = u.id_uzytkownika
                 WHERE u.imie LIKE ? OR u.nazwisko LIKE ?`;
    db.all(sql, [`%${q}%`, `%${q}%`], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// ==================================
// 3. Dodawanie studenta bez podawania id
// ==================================
app.post('/Uzytkownik', (req, res) => {
    const { imie, nazwisko, email, haslo, numer_indeksu } = req.body;

    db.run(`INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, typ_konta) 
            VALUES (?, ?, ?, ?, 'student')`, 
        [imie, nazwisko, email, haslo], 
        function(err) {
            if (err) return res.status(500).send(err.message);

            // Automatyczne dodanie do tabeli Student z id_uzytkownika
            db.run(`INSERT INTO Student (id_uzytkownika, numer_indeksu) VALUES (?, ?)`,
                [this.lastID, numer_indeksu],
                (err) => {
                    if (err) return res.status(500).send(err.message);
                    res.json({ message: 'Student dodany pomyślnie' });
                }
            );
        });
});

// ==================================
// 4. Usuwanie studenta po id_uzytkownika (ukryte przed użytkownikiem)
// ==================================
app.delete('/studenci/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM Uzytkownik WHERE id_uzytkownika = ?`, [id], (err) => {
        if (err) return res.status(500).send(err.message);
        res.json({ message: 'Student usunięty' });
    });
});

// ==================================
// 5. Aktualizacja studenta (bez podawania id tabeli Student)
// ==================================
app.put('/studenci/:id', (req, res) => {
    const { id } = req.params;
    const { imie, nazwisko, email, haslo, numer_indeksu } = req.body;

    db.run(`UPDATE Uzytkownik SET imie = ?, nazwisko = ?, email = ?, haslo = ? WHERE id_uzytkownika = ?`,
        [imie, nazwisko, email, haslo, id], function(err) {
            if (err) return res.status(500).send(err.message);

            db.run(`UPDATE Student SET numer_indeksu = ? WHERE id_uzytkownika = ?`,
                [numer_indeksu, id], (err) => {
                    if (err) return res.status(500).send(err.message);
                    res.json({ message: 'Dane studenta zaktualizowane' });
                });
        });
});

// Endpoint testowy
app.get("/", (req, res) => {
  res.send("✅ API działa! Połączono z SQLite3");
});


// Uruchom serwer (Render automatycznie przypisze port)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server działa na porcie ${PORT}`);
});











