// =========================================================
// server.js — FINALNA WERSJA (ESM, SQLite, pełny CRUD)
// kompatybilny z test3_baza.sqlite i dashboard_administrator
// =========================================================

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Database from "better-sqlite3";

// -----------------------------------
// KONFIGURACJA
// -----------------------------------
const DB_PATH = process.env.DB_PATH || "./test3_baza.sqlite";

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
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));

app.use(bodyParser.json({ limit: "5mb" }));
// ===================== RAPORTY — serwer =====================
// wymaga: pdfkit, chartjs-node-canvas, moment
import PDFDocument from "pdfkit";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import moment from "moment";

// pomoc: konwertuj stream PDF do buffer
function pdfDocToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// inicjalizacja generatora wykresów
const chartWidth = 800; // px
const chartHeight = 400;
const chartCallback = (ChartJS) => {
  // można zarejestrować pluginy jeśli potrzeba
};
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: chartWidth, height: chartHeight, chartCallback });

// -------------------- 1) Raport: Lista użytkowników (kryteria: rola, email zawiera) --------------------
app.get("/api/reports/users", async (req, res) => {
  try {
    const { rola, email } = req.query;
    const where = [];
    const params = {};

    if (rola) { where.push("typ_konta = @rola"); params.rola = rola; }
    if (email) { where.push("email LIKE @email"); params.email = `%${email}%`; }

    const sql = `SELECT id_uzytkownika, imie, nazwisko, email, typ_konta FROM Uzytkownik ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY nazwisko`;
    const rows = db.prepare(sql).all(params);

    // PDF: tabela prosty
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.fontSize(14).text('Raport: Lista użytkowników', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Kryteria: rola=${rola || 'wszystkie'}, email zawiera=${email || '-'}`);
    doc.moveDown(0.5);

    // tabela nagłówki
    const tableTop = doc.y + 10;
    const colWidths = [60, 140, 140, 150];
    doc.fontSize(10).text('ID', 40, tableTop);
    doc.text('Imię', 40 + colWidths[0], tableTop);
    doc.text('Nazwisko', 40 + colWidths[0] + colWidths[1], tableTop);
    doc.text('Email / Rola', 40 + colWidths[0] + colWidths[1] + colWidths[2], tableTop);

    let y = tableTop + 18;
    rows.forEach(r => {
      doc.text(String(r.id_uzytkownika), 40, y);
      doc.text(r.imie || '', 40 + colWidths[0], y);
      doc.text(r.nazwisko || '', 40 + colWidths[0] + colWidths[1], y);
      doc.text(`${r.email || ''} / ${r.typ_konta || ''}`, 40 + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] });
      y += 18;
      if (y > 720) { doc.addPage(); y = 40; }
    });

    const buffer = await pdfDocToBuffer(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="raport_uzytkownicy.pdf"');
    res.send(buffer);
  } catch (err) {
    console.error("ERR /api/reports/users", err);
    res.status(500).json({ error: err.message });
  }
});


// -------------------- 2) Raport: Statystyki pytań (kryteria: id_kategorii, id_banku) + wykres --------------------
app.get("/api/reports/questions-stats", async (req, res) => {
  try {
    const { id_kategorii, id_banku } = req.query;
    const where = [];
    const params = {};
    if (id_kategorii) { where.push("id_kategorii = @k"); params.k = Number(id_kategorii); }
    if (id_banku)    { where.push("id_banku = @b"); params.b = Number(id_banku); }

    const sql = `SELECT COALESCE(poziom_trudnosci, 'brak') AS poziom, COUNT(*) AS ile FROM Pytanie ${where.length ? "WHERE " + where.join(" AND ") : ""} GROUP BY COALESCE(poziom_trudnosci, 'brak') ORDER BY poziom`;
    const rows = db.prepare(sql).all(params);

    // dane do wykresu
    const labels = rows.map(r => String(r.poziom));
    const counts = rows.map(r => r.ile);

    const configuration = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Liczba pytań',
          data: counts,
          backgroundColor: 'rgba(54,162,235,0.6)',
          borderColor: 'rgba(54,162,235,1)',
          borderWidth: 1
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { x: { title: { display: true, text: 'Poziom' } }, y: { title: { display: true, text: 'Ilość' }, beginAtZero: true } }
      }
    };

    const image = await chartJSNodeCanvas.renderToBuffer(configuration);

    // PDF: wstaw wykres + tabela
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.fontSize(14).text('Raport: Statystyki pytań', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Kryteria: kategoria=${id_kategorii || 'wszystkie'}, bank=${id_banku || 'wszystkie'}`);
    doc.moveDown(0.5);

    // wstaw obraz wykresu
    doc.image(image, { fit: [500, 300], align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).text('Szczegóły:', { underline: true });
    rows.forEach(r => {
      doc.text(`${r.poziom}: ${r.ile} pytań`);
    });

    const buffer = await pdfDocToBuffer(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="raport_pytania_stats.pdf"');
    res.send(buffer);
  } catch (err) {
    console.error("ERR /api/reports/questions-stats", err);
    res.status(500).json({ error: err.message });
  }
});


// -------------------- 3) Raport: Testy pogrupowane wg kategorii (kryteria: start, end daty) --------------------
app.get("/api/reports/tests-grouped", async (req, res) => {
  try {
    const { start, end } = req.query;
    // w Twojej bazie tabela Test może nie mieć pola data; użyjemy id_testu lub tytul; jeśli masz datę - podaj ją
    // zakładam, że Test może mieć kolumnę data_utworzenia lub tytul; w query poniżej używamy id_szablonu -> kategoria
    const rows = db.prepare(`
      SELECT T.id_testu, T.tytul, T.czas_trwania, K.nazwa AS kategoria
      FROM Test T
      LEFT JOIN Kategoria K ON K.id_kategorii = T.id_szablonu
      ORDER BY kategoria, T.id_testu
    `).all();

    // grupowanie po kategorii
    const grouped = {};
    for (const r of rows) {
      const k = r.kategoria || 'Brak kategorii';
      grouped[k] = grouped[k] || [];
      grouped[k].push(r);
    }

    // PDF: dla każdej grupy nowa sekcja
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.fontSize(14).text('Raport: Testy pogrupowane wg kategorii', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Kryteria: start=${start||'-'}, end=${end||'-'}`);
    doc.moveDown(0.5);

    for (const [kategoria, tests] of Object.entries(grouped)) {
      doc.addPage();
      doc.fontSize(12).text(`Kategoria: ${kategoria}`, { underline: true });
      doc.moveDown(0.3);
      tests.forEach(t => {
        doc.fontSize(10).text(`ID: ${t.id_testu}  •  Tytuł: ${t.tytul || '-'}  •  Czas: ${t.czas_trwania || '-'}`);
        doc.moveDown(0.1);
      });
    }

    const buffer = await pdfDocToBuffer(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="raport_testy_grouped.pdf"');
    res.send(buffer);
  } catch (err) {
    console.error("ERR /api/reports/tests-grouped", err);
    res.status(500).json({ error: err.message });
  }
});


// -------------------- 4) Raport: Formularz oceny testu (kryteria: id_testu, id_uzytkownika) --------------------
app.get("/api/reports/test-form", async (req, res) => {
  try {
    const { id_testu, id_uzytkownika } = req.query;
    if (!id_testu) return res.status(400).json({ error: "Brak id_testu" });

    const test = db.prepare("SELECT * FROM Test WHERE id_testu = ?").get(Number(id_testu));
    const user = id_uzytkownika ? db.prepare("SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?").get(Number(id_uzytkownika)) : null;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.fontSize(16).text('Formularz oceny testu', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Test: ${test ? (test.tytul || '—') : 'Nieznany'}`);
    doc.text(`Uczestnik: ${user ? (user.imie + ' ' + user.nazwisko + ' (' + user.email + ')') : '-'}`);
    doc.moveDown(0.5);

    doc.fontSize(12).text('Ocena (wypełnić):', { underline: true });
    doc.moveDown(0.2);

    // pola formularza wygląd (linie do wypelnienia)
    doc.fontSize(11);
    doc.text('1) Liczba punktów uzyskanych: __________________________');
    doc.moveDown(0.5);
    doc.text('2) Maksymalna liczba punktów: _________________________');
    doc.moveDown(0.5);
    doc.text('3) Ocena (np. 4.5): ___________________________________');
    doc.moveDown(0.5);
    doc.text('4) Komentarz:');
    doc.moveDown(0.2);
    const startY = doc.y;
    for (let i = 0; i < 8; i++) {
      doc.text('_______________________________________________________________');
      doc.moveDown(0.1);
    }

    doc.moveDown(0.5);
    doc.text(`Data: ${moment().format('YYYY-MM-DD')}`);
    doc.moveDown(0.5);
    doc.text('Podpis egzaminatora: ____________________________');

    const buffer = await pdfDocToBuffer(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="formularz_test_${id_testu}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error("ERR /api/reports/test-form", err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== KONIEC RAPORTÓW =====================

// -----------------------------------
// POMOCNICZE MAPOWANIE DANYCH
// -----------------------------------
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id_uzytkownika,
    imie: row.imie,
    nazwisko: row.nazwisko,
    email: row.email,
    typ_konta: row.typ_konta,
    numer_indeksu: row.numer_indeksu ?? null,
    stopien_naukowy: row.stopien_naukowy ?? null
  };
}

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
// ROOT + START
// =========================================================
app.get("/", (req, res) => {
  res.send("API działa 🎉");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server działa na porcie ${PORT}, DB_PATH=${DB_PATH}`));

