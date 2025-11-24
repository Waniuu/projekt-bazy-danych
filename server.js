// server.js (ESM) - poprawiona, rozszerzona wersja
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./baza.sqlite";
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
  },
  credentials: false
}));
app.use(bodyParser.json());

// Helper: map user row to client-friendly object
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id_uzytkownika ?? row.id,
    imie: row.imie || "",
    nazwisko: row.nazwisko || "",
    email: row.email || "",
    typ_konta: row.typ_konta || "",
    // pola opcjonalne (jeśli istnieją)
    numer_indeksu: row.numer_indeksu || null,
    stopien_naukowy: row.stopien_naukowy || null
  };
}
app.get("/api/uzytkownicy/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?").get(id);

    if (!row) return res.status(404).json({ error: "Użytkownik nie znaleziony" });

    res.json({
      id: row.id_uzytkownika,
      imie: row.imie,
      nazwisko: row.nazwisko,
      email: row.email,
      numer_indeksu: row.numer_indeksu,
      typ_konta: row.typ_konta
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/wyniki", (req, res) => {
  try {
    const { id_studenta, id_kategorii, liczba_punktow, max_punktow, ocena } = req.body;

    if (!id_studenta || !id_kategorii) {
      return res.status(400).json({ error: "Brak wymaganych pól" });
    }

    const stmt = db.prepare(`
      INSERT INTO WynikTestu (id_studenta, id_kategorii, liczba_punktow, max_punktow, ocena, data)
      VALUES (?, ?, ?, ?, ?, DATE('now'))
    `);

    const info = stmt.run(id_studenta, id_kategorii, liczba_punktow, max_punktow, ocena);

    res.json({ success: true, id: info.lastInsertRowid });

  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/zapisz-wynik", (req, res) => {
  try {
    const { id_studenta, id_testu, liczba_punktow, ocena } = req.body;

    if (!id_studenta || !id_testu) {
      return res.status(400).json({ error: "Brak wymaganych pól" });
    }

    const stmt = db.prepare(`
      INSERT INTO WynikTestu (id_studenta, id_testu, data, liczba_punktow, ocena)
      VALUES (?, ?, DATE('now'), ?, ?)
    `);

    const info = stmt.run(id_studenta, id_testu, liczba_punktow, ocena);

    res.json({ success: true, id: info.lastInsertRowid });

  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// CRUD: Uzytkownicy (uniwersalne)
// -----------------------------
app.get("/api/uzytkownicy", (req, res) => {
  try {
    // Obsługa prostego filtrowania / sortowania / paginacji
    const { q, typ, sort = "id_uzytkownika", order = "DESC", limit = 50, offset = 0 } = req.query;
    let where = [];
    let params = [];
    if (q) {
      where.push("(imie LIKE ? OR nazwisko LIKE ? OR email LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (typ) {
      where.push("typ_konta = ?");
      params.push(typ);
    }
    const sql = `
      SELECT * FROM Uzytkownik
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY ${sort} ${order === "ASC" ? "ASC" : "DESC"}
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(mapUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/uzytkownicy", (req, res) => {
  try {
    const { imie, nazwisko, email, haslo, typ_konta } = req.body;
    if (!imie || !nazwisko || !email || !haslo || !typ_konta) {
      return res.status(400).json({ error: "Brak wymaganych pól: imie, nazwisko, email, haslo, typ_konta" });
    }
    const stmt = db.prepare(
      "INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, typ_konta) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(imie, nazwisko, email, haslo, typ_konta);
    const row = db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?").get(info.lastInsertRowid);
    res.status(201).json(mapUser(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/uzytkownicy/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const { imie, nazwisko, email, typ_konta } = req.body;
    db.prepare(
      "UPDATE Uzytkownik SET imie = COALESCE(?, imie), nazwisko = COALESCE(?, nazwisko), email = COALESCE(?, email), typ_konta = COALESCE(?, typ_konta) WHERE id_uzytkownika = ?"
    ).run(imie, nazwisko, email, typ_konta, id);
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

// -------------------------------------------
// High-level: Tworzenie studenta bez kluczy obcych
// (wstawia Uzytkownik + Student w transakcji)
// -------------------------------------------
app.post("/api/studenci", (req, res) => {
  try {
    const { imie, nazwisko, email, haslo, numer_indeksu } = req.body;
    if (!imie || !nazwisko || !email || !haslo || !numer_indeksu) {
      return res.status(400).json({ error: "Brak wymaganych pól" });
    }
    const insert = db.transaction(() => {
      const info = db.prepare("INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, typ_konta) VALUES (?, ?, ?, ?, 'student')").run(imie, nazwisko, email, haslo);
      const newId = info.lastInsertRowid;
      db.prepare("INSERT INTO Student (id_uzytkownika, numer_indeksu) VALUES (?, ?)").run(newId, numer_indeksu);
      return db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?").get(newId);
    });
    const row = insert();
    res.status(201).json(mapUser(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------
// Tworzenie nauczyciela (tworzy Uzytkownik + Nauczyciel)
// -------------------------------------------
app.post("/api/nauczyciele", (req, res) => {
  try {
    const { imie, nazwisko, email, haslo, stopien_naukowy } = req.body;
    if (!imie || !nazwisko || !email || !haslo) {
      return res.status(400).json({ error: "Brak wymaganych pól" });
    }
    const insert = db.transaction(() => {
      const info = db.prepare("INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, typ_konta) VALUES (?, ?, ?, ?, 'nauczyciel')").run(imie, nazwisko, email, haslo);
      const id = info.lastInsertRowid;
      db.prepare("INSERT INTO Nauczyciel (id_uzytkownika, stopien_naukowy) VALUES (?, ?)").run(id, stopien_naukowy || null);
      return db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?").get(id);
    });
    const row = insert();
    res.status(201).json(mapUser(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------
// Wyniki studenta - DZIAŁAJĄCE DLA TWOJEJ BAZY
// -------------------------------------------
// ------------------------------------------------------
// Wyniki studenta – POPRAWIONE wg Twojej bazy SQLite
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
    console.error("BŁĄD /api/wyniki:", err);
    res.status(500).json({ error: err.message });
  }
});





// -------------------------------------------
// Przedmioty: CRUD + listowanie (bez wymagania kluczy)
// -------------------------------------------
app.get("/api/przedmioty", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT P.*, U.imie AS nauczyciel_imie, U.nazwisko AS nauczyciel_nazwisko
      FROM Przedmiot P
      LEFT JOIN Nauczyciel N ON P.id_nauczyciela = N.id_uzytkownika
      LEFT JOIN Uzytkownik U ON N.id_uzytkownika = U.id_uzytkownika
      ORDER BY P.id_przedmiotu DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/przedmioty", (req, res) => {
  try {
    // Można utworzyć przedmiot podając id_nauczyciela (opcjonalne), ale UI nie musi znać id - można wysłać email nauczyciela
    const { nazwa, opis, nauczyciel_email } = req.body;
    let id_nauczyciela = null;
    if (nauczyciel_email) {
      const nauc = db.prepare("SELECT id_uzytkownika FROM Uzytkownik WHERE email = ? AND typ_konta = 'nauczyciel'").get(nauczyciel_email);
      if (nauc) id_nauczyciela = nauc.id_uzytkownika;
    }
    const info = db.prepare("INSERT INTO Przedmiot (nazwa, opis, id_nauczyciela) VALUES (?, ?, ?)").run(nazwa, opis || "", id_nauczyciela);
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

// -------------------------------------------
// Pytania: CRUD + wyszukiwanie z kryteriami
// -------------------------------------------
app.get("/api/pytania", (req, res) => {
  try {
    const { q = "", id_banku, id_kategorii, page = 1, per_page = 20 } = req.query;
    let where = [];
    let params = [];
    if (q) {
      where.push("P.tresc LIKE ?");
      params.push(`%${q}%`);
    }
    if (id_banku) {
      where.push("P.id_banku = ?");
      params.push(Number(id_banku));
    }
    if (id_kategorii) {
      where.push("P.id_kategorii = ?");
      params.push(Number(id_kategorii));
    }
    const offset = (Number(page) - 1) * Number(per_page);
    const sql = `
      SELECT P.*, B.nazwa AS bank_nazwa, K.nazwa AS kat_nazwa
      FROM Pytanie P
      LEFT JOIN BankPytan B ON P.id_banku = B.id_banku
      LEFT JOIN Kategoria K ON P.id_kategorii = K.id_kategorii
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY P.id_pytania DESC
      LIMIT ? OFFSET ?
    `;
    params.push(Number(per_page), offset);
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pytania", (req, res) => {
  try {
    const { tresc, id_banku, id_kategorii, trudnosc } = req.body;
    const info = db.prepare("INSERT INTO Pytanie (tresc, id_banku, id_kategorii, trudnosc) VALUES (?, ?, ?, ?)").run(tresc, id_banku || null, id_kategorii || null, trudnosc || 1);
    const row = db.prepare("SELECT * FROM Pytanie WHERE id_pytania = ?").get(info.lastInsertRowid);
    res.status(201).json(row);
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

// -------------------------------------------
// Testy: generowanie testu z szablonu (prosty)
// -------------------------------------------
app.post("/api/testy/generuj", (req, res) => {
  try {
    const { id_szablonu, liczba_pytan = 5 } = req.body;
    if (!id_szablonu) return res.status(400).json({ error: "id_szablonu wymagane" });

    const tx = db.transaction(() => {
      const info = db.prepare("INSERT INTO Test (id_szablonu, data_utworzenia) VALUES (?, DATE('now'))").run(id_szablonu);
      const newTestId = info.lastInsertRowid;
      db.prepare("INSERT INTO Test_Pytanie (id_testu, id_pytania) SELECT ?, id_pytania FROM Pytanie WHERE id_banku IN (SELECT id_banku FROM SzablonTestu WHERE id_szablonu = ?) ORDER BY RANDOM() LIMIT ?")
        .run(newTestId, id_szablonu, liczba_pytan);
      return db.prepare("SELECT * FROM Test WHERE id_testu = ?").get(newTestId);
    });

    const testRow = tx();
    res.status(201).json(testRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// -------------------------------------------
// LOGIN (email + hasło → zwraca rolę i dane)
// -------------------------------------------
app.post("/api/login", (req, res) => {
  try {
    const { login, haslo } = req.body;

    if (!login || !haslo) {
      return res.status(400).json({ success: false, message: "Brak loginu lub hasła" });
    }

    // Szukamy po emailu lub imieniu+nazwisku jeśli login to email
    const user = db.prepare(`
      SELECT *
      FROM Uzytkownik
      WHERE email = ? OR imie || ' ' || nazwisko = ?
    `).get(login, login);

    if (!user) {
      return res.status(401).json({ success: false, message: "Nieprawidłowy login" });
    }

    // proste sprawdzenie hasła (bez hash)
    if (user.haslo !== haslo) {
      return res.status(401).json({ success: false, message: "Nieprawidłowe hasło" });
    }

    // zwracamy typ konta, np: student / nauczyciel / administrator
    return res.json({
      success: true,
      message: "Zalogowano pomyślnie",
      rola: user.typ_konta,
      user: {
        id: user.id_uzytkownika,
        imie: user.imie,
        nazwisko: user.nazwisko,
        email: user.email,
        typ_konta: user.typ_konta
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// -------------------------------------------
// Drobne endpointy pomocnicze (np. lista kategorii, banków)
// -------------------------------------------
app.get("/api/kategorie", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM Kategoria ORDER BY nazwa").all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/banki", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM BankPytan ORDER BY nazwa").all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Root
app.get("/", (req, res) => {
  res.send("✅ API działa — dostępne endpointy: /api/uzytkownicy, /api/studenci, /api/nauczyciele, /api/przedmioty, /api/pytania, /api/testy/generuj");
});

// Error handler for CORS rejection
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes("CORS")) {
    res.status(403).json({ error: "CORS error: origin not allowed" });
  } else next(err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server działa na porcie ${PORT}, DB_PATH=${DB_PATH}`));











