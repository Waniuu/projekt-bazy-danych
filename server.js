// ======== server.js ========
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const PdfPrinter = require("pdfmake");
const fs = require("fs");

const app = express();
app.use(express.static("public"));
// === FastReport integracja ===
const fastReport = require("fastreport");
const fs = require("fs");
const { Readable } = require("stream");

// Endpoint: generowanie raportu użytkowników
app.get("/api/raport/uzytkownicy", async (req, res) => {
  try {
    // Pobierz dane z SQLite
    db.all("SELECT imie, nazwisko, email FROM Uzytkownik", async (err, rows) => {
      if (err) {
        console.error("Błąd bazy danych:", err);
        return res.status(500).send("Błąd bazy danych");
      }

      // Utwórz raport FastReport
      const report = fastReport.createReport();

      // Załaduj szablon FRX
      const frxPath = path.join(__dirname, "reports", "raport_uzytkownicy.frx");
      await report.load(frxPath);

      // Podłącz dane z bazy
      report.registerData(rows, "Uzytkownik");

      // Przygotuj raport
      await report.prepare();

      // Eksport do PDF
      const pdf = await report.exportPdf();

      // Zwróć jako plik do pobrania
      res.setHeader("Content-Disposition", "attachment; filename=raport_uzytkownicy.pdf");
      res.setHeader("Content-Type", "application/pdf");
      Readable.from(pdf).pipe(res);
    });
  } catch (err) {
    console.error("❌ Błąd raportu:", err);
    res.status(500).send("Błąd generowania raportu");
  }
});

// === KONFIGURACJA BAZY DANYCH ===
const dbPath = path.join(__dirname, "system_generowania_testow.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Błąd połączenia z bazą:", err.message);
  } else {
    console.log("✅ Połączono z bazą SQLite:", dbPath);
  }
});

// === ENDPOINT: pobieranie użytkowników jako JSON ===
app.get("/api/uzytkownicy", (req, res) => {
  db.all("SELECT id_uzytkownika, imie, nazwisko, email, typ_konta FROM Uzytkownik", [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: "Błąd bazy danych" });
    } else {
      res.json(rows);
    }
  });
});

// === ENDPOINT: generowanie raportu PDF ===
app.get("/api/raport/uzytkownicy", (req, res) => {
  db.all("SELECT imie, nazwisko, email, typ_konta FROM Uzytkownik", [], (err, rows) => {
    if (err) {
      console.error("❌ Błąd bazy danych:", err);
      return res.status(500).send("Błąd bazy danych");
    }

    const fonts = {
      Roboto: {
        normal: path.join(__dirname, "node_modules/pdfmake/fonts/Roboto-Regular.ttf"),
        bold: path.join(__dirname, "node_modules/pdfmake/fonts/Roboto-Medium.ttf")
      }
    };

    const printer = new PdfPrinter(fonts);

    const docDefinition = {
      content: [
        { text: "Raport użytkowników", style: "header" },
        {
          table: {
            widths: ["auto", "*", "*", "*"],
            body: [
              ["#", "Imię", "Nazwisko", "Email", "Typ konta"],
              ...rows.map((u, i) => [
                i + 1,
                u.imie,
                u.nazwisko,
                u.email,
                u.typ_konta
              ])
            ]
          }
        },
        { text: `\nŁącznie użytkowników: ${rows.length}`, italics: true }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          alignment: "center",
          margin: [0, 0, 0, 20]
        }
      },
      defaultStyle: {
        font: "Roboto"
      }
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=raport_uzytkownicy.pdf");
    pdfDoc.pipe(res);
    pdfDoc.end();
  });
});

// === URUCHOMIENIE SERWERA ===
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na http://localhost:${PORT}`);
  console.log(`📄 Raport PDF: http://localhost:${PORT}/api/raport/uzytkownicy`);
});
