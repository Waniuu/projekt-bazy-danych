// server.js – WERSJA POPRAWIONA (OPCJA B)
// =======================================
// Generowanie testu na podstawie kategorii → test odziedzicza id_przedmiotu

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./test3_baza.sqlite";

const ALLOWED_ORIGINS = [
  "https://waniuu.github.io",
  "http://localhost:5500",
  "http://localhost:3000",
  process.env.CLIENT_ORIGIN || "https://waniuu.github.io/projekt-bazy-danych"
].filter(Boolean);

const db = new Database(DB_PATH, { readonly: false });
const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));

app.use(bodyParser.json());

// ------------------------------------------------------
// UŻYTKOWNICY – pomocnicze mapowanie
// ------------------------------------------------------
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id_uzytkownika,
    imie: row.imie,
    nazwisko: row.nazwisko,
    email: row.email,
    typ_konta: row.typ_konta,
    numer_indeksu: row.numer_indeksu || null,
    stopien_naukowy: row.stopien_naukowy || null
  };
}

// ------------------------------------------------------
// PYTANIA Z ODPOWIEDZIAMI
// ------------------------------------------------------
app.get("/api/pytania-z-odpowiedziami", (req, res) => {
  try {
    const { id_kategorii } = req.query;

    if (!id_kategorii)
      return res.status(400).json({ error: "Brak id_kategorii" });

    const pytania = db.prepare(`
      SELECT * FROM Pytanie WHERE id_kategorii = ?
    `).all(id_kategorii);

    const odpStmt = db.prepare("SELECT * FROM Odpowiedz WHERE id_pytania = ?");

    const wynik = pytania.map(p => ({
      ...p,
      odpowiedzi: odpStmt.all(p.id_pytania)
    }));

    res.json(wynik);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------
// ZAPIS WYNIKU TESTU
// ------------------------------------------------------
app.post("/api/zapisz-wynik", (req, res) => {
  try {
    const { id_studenta, id_testu, liczba_punktow } = req.body;

    if (!id_studenta || !id_testu)
      return res.status(400).json({ error: "Brak id_studenta lub id_testu" });

    const stmt = db.prepare(`
      INSERT INTO WynikTestu (id_studenta, id_testu, data, liczba_punktow, ocena)
      VALUES (?, ?, DATE('now'), ?, ?)
    `);

    const info = stmt.run(id_studenta, id_testu, liczba_punktow, liczba_punktow);

    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------
// WYNIKI STUDENTA
// ------------------------------------------------------
app.get("/api/wyniki/:id", (req, res) => {
  try {
    const id = Number(req.params.id);

    const rows = db.prepare(`
      SELECT 
        W.id_wyniku,
        W.data,
        W.liczba_punktow,
        W.ocena,
        T.tytul AS nazwa_testu
      FROM WynikTestu W
      LEFT JOIN Test T ON T.id_testu = W.id_testu
      WHERE W.id_studenta = ?
      ORDER BY W.data DESC
    `).all(id);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------
// ⭐ GENEROWANIE TESTU – OPCJA B ⭐
// Pobiera: nazwa kategorii + id_przedmiotu z tabeli Kategoria
// ------------------------------------------------------
app.post("/api/testy/generuj", (req, res) => {
  try {
    const { id_szablonu, liczba_pytan = 5 } = req.body;

    if (!id_szablonu)
      return res.status(400).json({ error: "id_szablonu wymagane" });

    // 1. Pobieramy kategorię + id_przedmiotu
    const kategoria = db.prepare(`
      SELECT nazwa, id_przedmiotu
      FROM Kategoria
      WHERE id_kategorii = ?
    `).get(id_szablonu);

    if (!kategoria)
      return res.status(404).json({ error: "Kategoria nie istnieje" });

    if (!kategoria.id_przedmiotu)
      return res.status(500).json({ error: "Kategoria nie ma przypisanego id_przedmiotu!" });

    // 2. Transakcja generowania testu
    const tx = db.transaction(() => {

      // Tworzymy test z poprawnym przedmiotem
      const testInsert = db.prepare(`
        INSERT INTO Test (tytul, czas_trwania, id_szablonu, id_przedmiotu)
        VALUES (?, 30, ?, ?)
      `).run(kategoria.nazwa, id_szablonu, kategoria.id_przedmiotu);

      const newTestId = testInsert.lastInsertRowid;

      // Pobieramy losowe pytania z tej kategorii
      const pytania = db.prepare(`
        SELECT id_pytania
        FROM Pytanie
        WHERE id_kategorii = ?
        ORDER BY RANDOM()
        LIMIT ?
      `).all(id_szablonu, liczba_pytan);

      if (!pytania.length)
        throw new Error("Brak pytań w tej kategorii");

      // Zapisujemy powiązania test–pytania
      const insertTP = db.prepare(`
        INSERT INTO Test_Pytanie (id_testu, id_pytania)
        VALUES (?, ?)
      `);

      for (const p of pytania) {
        insertTP.run(newTestId, p.id_pytania);
      }

      return newTestId;
    });

    const id_testu = tx();
    res.status(201).json({ id_testu });

  } catch (err) {
    console.error("BŁĄD generowania testu:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------
// KATEGORIE
// ------------------------------------------------------
app.get("/api/kategorie", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM Kategoria ORDER BY nazwa").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------
// LOGIN
// ------------------------------------------------------
app.post("/api/login", (req, res) => {
  try {
    const { login, haslo } = req.body;

    if (!login || !haslo)
      return res.status(400).json({ success: false, message: "Brak loginu lub hasła" });

    const user = db.prepare(`
      SELECT *
      FROM Uzytkownik
      WHERE email = ? OR imie || ' ' || nazwisko = ?
    `).get(login, login);

    if (!user)
      return res.status(401).json({ success: false, message: "Nieprawidłowy login" });

    if (user.haslo !== haslo)
      return res.status(401).json({ success: false, message: "Złe hasło" });

    res.json({
      success: true,
      rola: user.typ_konta,
      user: mapUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/uzytkownicy/:id", (req, res) => {
  try {
    const id = Number(req.params.id);

    const row = db.prepare(`
      SELECT U.*, S.numer_indeksu
      FROM Uzytkownik U
      LEFT JOIN Student S ON S.id_uzytkownika = U.id_uzytkownika
      WHERE U.id_uzytkownika = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({ error: "Użytkownik nie istnieje" });
    }

    res.json({
      id: row.id_uzytkownika,
      imie: row.imie,
      nazwisko: row.nazwisko,
      email: row.email,
      typ_konta: row.typ_konta,
      numer_indeksu: row.numer_indeksu || null
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("API działa 🎉");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server działa na porcie ${PORT}, DB_PATH=${DB_PATH}`)
);

