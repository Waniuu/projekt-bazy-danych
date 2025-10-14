// server.js – wersja ESM
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./baza.sqlite";
const db = new Database(DB_PATH, { readonly: false });

const app = express();
app.use(cors());
app.use(bodyParser.json());

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id_uzytkownika ?? row.id,
    imie: row.imie || "",
    nazwisko: row.nazwisko || "",
    email: row.email || "",
    data_dolaczenia: row.data_dolaczenia || "",
    komentarz: row.komentarz || "",
  };
}

app.get("/api/uzytkownicy", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM Uzytkownik ORDER BY id_uzytkownika DESC").all();
    res.json(rows.map(mapUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/uzytkownicy", (req, res) => {
  try {
    const { imie, nazwisko, email, haslo, typ_konta } = req.body;
    if (!imie || !nazwisko || !email || !haslo || !typ_konta) {
      return res.status(400).json({ error: "Brak wymaganych pól!" });
    }
    const stmt = db.prepare(
      "INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, typ_konta) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(imie, nazwisko, email, haslo, typ_konta);
    const row = db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?").get(info.lastInsertRowid);
    res.status(201).json(mapUser(row));
  } catch (err) {
    console.error("POST /api/uzytkownicy error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/uzytkownicy/:id", (req, res) => {
  try {
    const id = req.params.id;
    const { imie, nazwisko, email, data_dolaczenia, komentarz } = req.body;
    db.prepare(
      "UPDATE Uzytkownik SET imie=?, nazwisko=?, email=?, data_dolaczenia=?, komentarz=? WHERE id_uzytkownika=?"
    ).run(imie || "", nazwisko || "", email || "", data_dolaczenia || "", komentarz || "", id);
    const row = db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika=?").get(id);
    res.json(mapUser(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/uzytkownicy/:id", (req, res) => {
  try {
    const id = req.params.id;
    const info = db.prepare("DELETE FROM Uzytkownik WHERE id_uzytkownika=?").run(id);
    res.json({ ok: true, changes: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("✅ API działa poprawnie! Endpoint: /api/uzytkownicy");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server działa na porcie ${PORT}`));


