// =========================================================
// server.js — WERSJA OSTATECZNA (Z FIXEM NA 429 i FAVICON)
// =========================================================

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./test3_baza.sqlite";
const FASTREPORT_URL = "https://fastreport-service.onrender.com"; // Publiczny adres (pewniejszy)

const ALLOWED_ORIGINS = [
  "https://waniuu.github.io",
  "https://waniuu.github.io/projekt-bazy-danych",
  "http://localhost:5500",
  "http://localhost:3000",
  process.env.CLIENT_ORIGIN || ""
].filter(Boolean);

const db = new Database(DB_PATH, { readonly: false });
const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) cb(null, true);
    else cb(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(bodyParser.json());
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- FUNKCJA WYSYŁAJĄCA DANE DO C# ---
async function generateReportWithData(endpoint, data, res) {
    try {
        console.log(`[Report] Generowanie: ${endpoint} -> ${FASTREPORT_URL}, Wierszy: ${data.length}`);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(`${FASTREPORT_URL}${endpoint}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/pdf"
            },
            body: JSON.stringify(data),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errText = await response.text();
            // Jeśli to strona HTML (błąd Cloudflare), rzuć czytelny wyjątek
            if (errText.trim().startsWith("<!DOCTYPE")) {
                 throw new Error("Serwis C# jest zablokowany lub zajęty (429/403). Spróbuj za chwilę.");
            }
            throw new Error(`FastReport Error ${response.status}: ${errText}`);
        }

        const pdfBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=raport.pdf");
        res.send(Buffer.from(pdfBuffer));

    } catch (err) {
        console.error("RAPORT ERROR:", err.message);
        const msg = err.name === 'AbortError' ? "Serwis C# się wybudza (Timeout). Spróbuj ponownie za 30s." : err.message;
        res.status(500).json({ error: "Błąd generowania raportu", details: msg });
    }
}

// 1. LISTA STUDENTÓW (Fix SQL)
app.get("/api/reports/students-list", (req, res) => {
    try {
        // Zmiana: Filtrujemy po emailu, wykluczając adminów
        const sql = `
            SELECT 
                id_uzytkownika AS "ID", 
                imie AS "Imie", 
                nazwisko AS "Nazwisko", 
                email AS "Email" 
            FROM Uzytkownik 
            WHERE email NOT LIKE '%admin%' 
            ORDER BY nazwisko ASC
        `;
        const rows = db.prepare(sql).all();
        generateReportWithData("/reports/students-list", rows, res);
    } catch (e) { res.status(500).json({error: e.message}); }
});
// Fix dla starego linku
app.get("/api/reports/users", (req, res) => {
    try {
        const sql = `SELECT id_uzytkownika AS "ID", imie AS "Imie", nazwisko AS "Nazwisko", email AS "Email" FROM Uzytkownik ORDER BY nazwisko ASC`;
        const rows = db.prepare(sql).all();
        generateReportWithData("/reports/students-list", rows, res); // Przekierowanie do działającego endpointu w C#
    } catch (e) { res.status(500).json({error: e.message}); }
});

// 2. WYNIKI EGZAMINU
app.get("/api/reports/exam-results", (req, res) => {
    try {
        const { id_testu } = req.query;
        if (!id_testu) return res.status(400).json({error: "Wybierz test!"});
        const sql = `SELECT u.imie || ' ' || u.nazwisko AS "Student", w.liczba_punktow AS "Punkty", w.ocena AS "Ocena" FROM WynikTestu w JOIN Uzytkownik u ON w.id_studenta = u.id_uzytkownika WHERE w.id_testu = ? ORDER BY w.liczba_punktow DESC`;
        const rows = db.prepare(sql).all(id_testu);
        generateReportWithData("/reports/exam-results", rows, res);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// 3. BANK PYTAŃ
app.get("/api/reports/questions-bank", (req, res) => {
    try {
        const sql = `SELECT k.nazwa AS "Kategoria", p.poziom_trudnosci AS "Poziom", p.tresc AS "Tresc_Pytania" FROM Pytanie p JOIN Kategoria k ON p.id_kategorii = k.id_kategorii ORDER BY k.nazwa`;
        const rows = db.prepare(sql).all();
        generateReportWithData("/reports/questions-bank", rows, res);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// 4. STATYSTYKA
app.get("/api/reports/tests-stats", (req, res) => {
    try {
        const sql = `SELECT t.tytul AS "Test", COUNT(w.id_wyniku) AS "Podejscia" FROM Test t LEFT JOIN WynikTestu w ON t.id_testu = w.id_testu GROUP BY t.id_testu`;
        const rows = db.prepare(sql).all();
        generateReportWithData("/reports/tests-stats", rows, res);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// FIX API UZYTKOWNICY
app.get("/api/uzytkownicy", (req, res) => {
    try { res.json(db.prepare("SELECT * FROM Uzytkownik ORDER BY id_uzytkownika DESC").all()); } 
    catch (e) { res.json([]); }
});
app.get("/api/users", (req, res) => {
    try { res.json(db.prepare("SELECT * FROM Uzytkownik ORDER BY id_uzytkownika DESC").all()); } 
    catch (e) { res.json([]); }
});  // <-- Dla kompatybilności
// =========================================================
// 1. LOGIN
// =========================================================
app.post("/api/login", (req, res) => {
  try {
    const { login, haslo } = req.body;

    if (!login || !haslo)
      return res.status(400).json({ success: false, message: "Brak loginu lub hasła" });

    const user = db.prepare(`
      SELECT * FROM Uzytkownik
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

// =========================================================
// 2. UŻYTKOWNICY — PEŁNY CRUD
// =========================================================
app.get("/api/uzytkownicy", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM Uzytkownik ORDER BY id_uzytkownika DESC").all();
    res.json(rows.map(mapUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    if (!row) return res.status(404).json({ error: "Użytkownik nie istnieje" });

    res.json(mapUser(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/uzytkownicy", (req, res) => {
  try {
    const { imie, nazwisko, email, haslo, typ_konta } = req.body;

    if (!imie || !nazwisko || !email || !haslo)
      return res.status(400).json({ error: "Brak wymaganych pól" });

    const info = db.prepare(`
      INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, typ_konta)
      VALUES (?, ?, ?, ?, ?)
    `).run(imie, nazwisko, email, haslo, typ_konta || "student");

    const row = db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?")
      .get(info.lastInsertRowid);

    res.status(201).json(mapUser(row));

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/uzytkownicy/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const { imie, nazwisko, email, typ_konta } = req.body;

    db.prepare(`
      UPDATE Uzytkownik
      SET imie = COALESCE(?, imie),
          nazwisko = COALESCE(?, nazwisko),
          email = COALESCE(?, email),
          typ_konta = COALESCE(?, typ_konta)
      WHERE id_uzytkownika = ?
    `).run(imie, nazwisko, email, typ_konta, id);

    const row = db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?").get(id);

    res.json(mapUser(row));

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/uzytkownicy/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const info = db.prepare("DELETE FROM Uzytkownik WHERE id_uzytkownika = ?").run(id);
    res.json({ ok: true, changes: info.changes });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 3. KATEGORIE — PEŁNY CRUD
// =========================================================
app.get("/api/kategorie", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM Kategoria ORDER BY id_kategorii").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/kategorie", (req, res) => {
  try {
    const { nazwa } = req.body;
    if (!nazwa) return res.status(400).json({ error: "Brak nazwy kategorii" });

    const info = db.prepare("INSERT INTO Kategoria (nazwa) VALUES (?)").run(nazwa);
    const row = db.prepare("SELECT * FROM Kategoria WHERE id_kategorii = ?").get(info.lastInsertRowid);

    res.status(201).json(row);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/kategorie/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const info = db.prepare("DELETE FROM Kategoria WHERE id_kategorii = ?").run(id);
    res.json({ ok: true, changes: info.changes });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 4. BANKI PYTAŃ — PEŁNY CRUD
// =========================================================
app.get("/api/banki", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM BankPytan ORDER BY id_banku").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/banki", (req, res) => {
  try {
    const { nazwa } = req.body;
    if (!nazwa) return res.status(400).json({ error: "Brak nazwy banku" });

    const info = db.prepare("INSERT INTO BankPytan (nazwa) VALUES (?)").run(nazwa);
    const row = db.prepare("SELECT * FROM BankPytan WHERE id_banku = ?").get(info.lastInsertRowid);

    res.status(201).json(row);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/banki/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const info = db.prepare("DELETE FROM BankPytan WHERE id_banku = ?").run(id);
    res.json({ ok: true, changes: info.changes });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 5. PYTANIA — PEŁNY CRUD
// =========================================================
app.get("/api/pytania", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT P.*, B.nazwa AS bank_nazwa, K.nazwa AS kat_nazwa
      FROM Pytanie P
      LEFT JOIN BankPytan B ON B.id_banku = P.id_banku
      LEFT JOIN Kategoria K ON K.id_kategorii = P.id_kategorii
      ORDER BY id_pytania DESC
    `).all();
    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pytania", (req, res) => {
  try {
    const { tresc, id_banku, id_kategorii, poziom_trudnosci, punkty, tagi } = req.body;

    if (!tresc) return res.status(400).json({ error: "Brak treści pytania" });

    const info = db.prepare(`
      INSERT INTO Pytanie (tresc, id_banku, id_kategorii, poziom_trudnosci, punkty, tagi)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tresc, id_banku, id_kategorii, poziom_trudnosci, punkty, tagi);

    const row = db.prepare("SELECT * FROM Pytanie WHERE id_pytania = ?").get(info.lastInsertRowid);
    res.status(201).json(row);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/pytania/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const { tresc, id_banku, id_kategorii, poziom_trudnosci, punkty, tagi } = req.body;

    db.prepare(`
      UPDATE Pytanie
      SET tresc = COALESCE(?, tresc),
          id_banku = COALESCE(?, id_banku),
          id_kategorii = COALESCE(?, id_kategorii),
          poziom_trudnosci = COALESCE(?, poziom_trudnosci),
          punkty = COALESCE(?, punkty),
          tagi = COALESCE(?, tagi)
      WHERE id_pytania = ?
    `).run(tresc, id_banku, id_kategorii, poziom_trudnosci, punkty, tagi, id);

    const row = db.prepare("SELECT * FROM Pytanie WHERE id_pytania = ?").get(id);
    res.json(row);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/pytania/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const info = db.prepare("DELETE FROM Pytanie WHERE id_pytania = ?").run(id);
    res.json({ ok: true, changes: info.changes });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 6. PRZEDMIOTY — PEŁNY CRUD
// =========================================================
app.get("/api/przedmioty", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT P.*, U.imie AS nauczyciel_imie, U.nazwisko AS nauczyciel_nazwisko
      FROM Przedmiot P
      LEFT JOIN Uzytkownik U ON U.id_uzytkownika = P.id_nauczyciela
    `).all();
    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/przedmioty", (req, res) => {
  try {
    const { nazwa, opis, nauczyciel_email } = req.body;

    let id_nauczyciela = null;
    if (nauczyciel_email) {
      const nauc = db.prepare("SELECT id_uzytkownika FROM Uzytkownik WHERE email = ? AND typ_konta = 'nauczyciel'").get(nauczyciel_email);
      if (nauc) id_nauczyciela = nauc.id_uzytkownika;
    }

    const info = db.prepare(`
      INSERT INTO Przedmiot (nazwa, opis, id_nauczyciela)
      VALUES (?, ?, ?)
    `).run(nazwa, opis, id_nauczyciela);

    const row = db.prepare("SELECT * FROM Przedmiot WHERE id_przedmiotu = ?").get(info.lastInsertRowid);
    res.status(201).json(row);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/przedmioty/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const info = db.prepare("DELETE FROM Przedmiot WHERE id_przedmiotu = ?").run(id);
    res.json({ ok: true, changes: info.changes });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 7. TESTY — LISTA + GENEROWANIE (masz już generowanie z pliku)
// =========================================================
app.get("/api/testy", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM Test ORDER BY id_testu DESC").all();
    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// =========================================================
//  WYNIKI TESTÓW — LISTA WYNIKÓW DLA KONKRETNEGO STUDENTA
// =========================================================
app.get("/api/wyniki/:id_uzytkownika", (req, res) => {
  try {
    const id = Number(req.params.id_uzytkownika);

    const sql = `
  SELECT 
        id_wyniku,
        id_studenta,
        id_testu,
        data,
        liczba_punktow,
        ocena
      FROM WynikTestu
      WHERE id_studenta = ?
      ORDER BY id_wyniku DESC
    `;

    const rows = db.prepare(sql).all(id);

    res.json(rows);

  } catch (err) {
    console.error("ERR /api/wyniki/:id_uzytkownika", err);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// ROOT + START
// =========================================================
app.get("/", (req, res) => {
  res.send("API działa 🎉");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server działa na porcie ${PORT}, DB_PATH=${DB_PATH}`));

























