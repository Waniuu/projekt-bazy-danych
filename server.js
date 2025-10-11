// server.js
import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";
const cors = require('cors');
app.use(cors());

const app = express();
app.use(cors());
app.use(express.json());

// Połączenie z bazą danych SQLite
const db = await open({
  filename: "./baza.sqlite",
  driver: sqlite3.Database
});

const cors = require('cors');
app.use(cors());

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








