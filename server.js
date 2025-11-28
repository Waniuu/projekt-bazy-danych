// server.js (ESM) - poprawiona wersja
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
  origin: function(origin, callback){
    // allow requests with no origin (e.g. curl or server-to-server)
    if(!origin) return callback(null, true);
    if(ALLOWED_ORIGINS.length === 0) return callback(null, true);
    if(ALLOWED_ORIGINS.indexOf(origin) !== -1) return callback(null, true);
    const msg = 'CORS policy: Origin not allowed.';
    return callback(new Error(msg), false);
  }
}));

// Open DB (read-write)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));
app.use(bodyParser.json());
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

// -------------------- UŻYTKOWNICY --------------------
// GET /api/uzytkownicy  (supports ?q=... & ?typ=... & ?limit & ?offset)
app.get('/api/uzytkownicy', (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const typ = (req.query.typ || '').trim();
    const limit = Math.min(10000, parseInt(req.query.limit||1000));
    const offset = parseInt(req.query.offset||0);

    let sql = 'SELECT * FROM Uzytkownik';
    const where = [];
    const params = {};
    if(q){
      where.push('(imie LIKE @q OR nazwisko LIKE @q OR email LIKE @q)');
      params['q'] = `%${q}%`;
    }
    if(typ){
      where.push('(typ_konta = @typ)');
      params['typ'] = typ;
    }
    if(where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY id_uzytkownika DESC';
    sql += ' LIMIT @limit OFFSET @offset';
    params['limit'] = limit;
    params['offset'] = offset;

    const rows = db.prepare(sql).all(params);
    const out = rows.map(normalizeUserRow);
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single user
app.get('/api/uzytkownicy/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(id);
    if(!row) return res.status(404).json({ error: 'Nie znaleziono użytkownika' });
    res.json(normalizeUserRow(row));
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// CREATE user
app.post('/api/uzytkownicy', (req,res)=>{
  try{
    const { imie, nazwisko, email, haslo, typ_konta } = req.body;
    if(!imie || !nazwisko || !email || !haslo){
      return res.status(400).json({ error: 'Brakuje wymaganych pól (imie,nazwisko,email,haslo)' });
    }
    const stmt = db.prepare('INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, typ_konta) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(imie, nazwisko, email, haslo, typ_konta || 'student');
    const newRow = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(info.lastInsertRowid);
    res.status(201).json(normalizeUserRow(newRow));
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// UPDATE user
app.put('/api/uzytkownicy/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const { imie, nazwisko, email, typ_konta, haslo } = req.body;
    // build dynamically
    const updates = [];
    const params = [];
    if(imie !== undefined){ updates.push('imie = ?'); params.push(imie); }
    if(nazwisko !== undefined){ updates.push('nazwisko = ?'); params.push(nazwisko); }
    if(email !== undefined){ updates.push('email = ?'); params.push(email); }
    if(typ_konta !== undefined){ updates.push('typ_konta = ?'); params.push(typ_konta); }
    if(haslo !== undefined){ updates.push('haslo = ?'); params.push(haslo); }
    if(updates.length === 0) return res.status(400).json({ error: 'Brak pól do aktualizacji' });
    params.push(id);
    const sql = `UPDATE Uzytkownik SET ${updates.join(', ')} WHERE id_uzytkownika = ?`;
    const info = db.prepare(sql).run(...params);
    const row = db.prepare('SELECT * FROM Uzytkownik WHERE id_uzytkownika = ?').get(id);
    res.json(normalizeUserRow(row));
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// DELETE user
app.delete('/api/uzytkownicy/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM Uzytkownik WHERE id_uzytkownika = ?').run(id);
    res.json({ ok: true, changes: info.changes });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- KATEGORIE --------------------
// GET all categories
app.get('/api/kategorie', (req,res)=>{
  try{
    const rows = db.prepare('SELECT * FROM Kategoria ORDER BY id_kategorii').all();
    res.json(rows);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// CREATE category
app.post('/api/kategorie', (req,res)=>{
  try{
    const { nazwa } = req.body;
    if(!nazwa) return res.status(400).json({ error: 'Brak nazwy' });
    const info = db.prepare('INSERT INTO Kategoria (nazwa) VALUES (?)').run(nazwa);
    const row = db.prepare('SELECT * FROM Kategoria WHERE id_kategorii = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// DELETE category
app.delete('/api/kategorie/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM Kategoria WHERE id_kategorii = ?').run(id);
    res.json({ ok: true, changes: info.changes });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- BANKI PYTAŃ --------------------
// GET banks
app.get('/api/banki', (req,res)=>{
  try{
    const rows = db.prepare('SELECT * FROM BankPytan ORDER BY id_banku').all();
    res.json(rows);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// CREATE bank
app.post('/api/banki', (req,res)=>{
  try{
    const { nazwa } = req.body;
    if(!nazwa) return res.status(400).json({ error: 'Brak nazwy' });
    const info = db.prepare('INSERT INTO BankPytan (nazwa) VALUES (?)').run(nazwa);
    const row = db.prepare('SELECT * FROM BankPytan WHERE id_banku = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// DELETE bank
app.delete('/api/banki/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM BankPytan WHERE id_banku = ?').run(id);
    res.json({ ok:true, changes: info.changes });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- PRZEDMIOTY --------------------
// GET subjects
app.get('/api/przedmioty', (req,res)=>{
  try{
    // join with nauczyciel user data if present
    const sql = `
      SELECT p.*, u.imie AS nauczyciel_imie, u.nazwisko AS nauczyciel_nazwisko, u.email AS nauczyciel_email
      FROM Przedmiot p
      LEFT JOIN Uzytkownik u ON p.id_nauczyciela = u.id_uzytkownika
      ORDER BY p.id_przedmiotu DESC
    `;
    const rows = db.prepare(sql).all();
    res.json(rows);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// CREATE subject
app.post('/api/przedmioty', (req,res)=>{
  try{
    const { nazwa, opis, nauczyciel_email } = req.body;
    let id_nauczyciela = null;
    if(nauczyciel_email){
      const u = db.prepare('SELECT id_uzytkownika FROM Uzytkownik WHERE email = ?').get(nauczyciel_email);
      if(u) id_nauczyciela = u.id_uzytkownika;
    }
    const info = db.prepare('INSERT INTO Przedmiot (nazwa, opis, id_nauczyciela) VALUES (?, ?, ?)').run(nazwa, opis || null, id_nauczyciela);
    const row = db.prepare('SELECT * FROM Przedmiot WHERE id_przedmiotu = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// DELETE subject
app.delete('/api/przedmioty/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM Przedmiot WHERE id_przedmiotu = ?').run(id);
    res.json({ ok:true, changes: info.changes });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// PUT subject
app.put('/api/przedmioty/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const { nazwa, opis, nauczyciel_email } = req.body;
    let id_nauczyciela = null;
    if(nauczyciel_email){
      const u = db.prepare('SELECT id_uzytkownika FROM Uzytkownik WHERE email = ?').get(nauczyciel_email);
      if(u) id_nauczyciela = u.id_uzytkownika;
    }
    db.prepare(`UPDATE Przedmiot SET nazwa = COALESCE(?, nazwa), opis = COALESCE(?, opis), id_nauczyciela = COALESCE(?, id_nauczyciela) WHERE id_przedmiotu = ?`).run(nazwa, opis, id_nauczyciela, id);
    const row = db.prepare('SELECT * FROM Przedmiot WHERE id_przedmiotu = ?').get(id);
    res.json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- PYTANIA --------------------
// GET questions (supports ?per_page, ?q, ?id_banku, ?id_kategorii)
app.get('/api/pytania', (req,res)=>{
  try{
    const q = (req.query.q || '').trim();
    const id_banku = req.query.id_banku ? Number(req.query.id_banku) : null;
    const id_kategorii = req.query.id_kategorii ? Number(req.query.id_kategorii) : null;
    const per_page = Math.min(10000, Number(req.query.per_page || 1000));
    const offset = Number(req.query.offset || 0);

    let sql = `
      SELECT p.*,
             b.nazwa AS bank_nazwa,
             k.nazwa AS kat_nazwa
      FROM Pytanie p
      LEFT JOIN BankPytan b ON p.id_banku = b.id_banku
      LEFT JOIN Kategoria k ON p.id_kategorii = k.id_kategorii
    `;
    const where = [];
    const params = {};
    if(q){
      where.push('(p.tresc LIKE @q OR p.tagi LIKE @q)');
      params['q'] = `%${q}%`;
    }
    if(id_banku) { where.push('p.id_banku = @id_banku'); params['id_banku'] = id_banku; }
    if(id_kategorii) { where.push('p.id_kategorii = @id_kategorii'); params['id_kategorii'] = id_kategorii; }
    if(where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY p.id_pytania DESC';
    sql += ' LIMIT @limit OFFSET @offset';
    params['limit'] = per_page;
    params['offset'] = offset;

    const rows = db.prepare(sql).all(params);

    // map DB cols to ones expected by frontend
    const mapped = rows.map(r => ({
      ...r,
      id_pytania: r.id_pytania,
      tresc: r.tresc,
      trudnosc: r.trudnosc || r.poziom_trudnosci || null, // alias
      punkty: r.punkty === undefined ? null : r.punkty,
      tagi: r.tagi || r.tags || '',
      bank_nazwa: r.bank_nazwa || '',
      kat_nazwa: r.kat_nazwa || '',
    }));
    res.json(mapped);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// GET single question
app.get('/api/pytania/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const row = db.prepare('SELECT p.*, b.nazwa AS bank_nazwa, k.nazwa AS kat_nazwa FROM Pytanie p LEFT JOIN BankPytan b ON p.id_banku = b.id_banku LEFT JOIN Kategoria k ON p.id_kategorii = k.id_kategorii WHERE id_pytania = ?').get(id);
    if(!row) return res.status(404).json({ error: 'Nie znaleziono pytania' });
    row.trudnosc = row.trudnosc || row.poziom_trudnosci || null;
    res.json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// CREATE question
app.post('/api/pytania', (req,res)=>{
  try{
    const { tresc, id_banku, id_kategorii, trudnosc, punkty, tagi } = req.body;
    if(!tresc) return res.status(400).json({ error: 'Brak treści pytania' });

    // map trudnosc -> poziom_trudnosci if DB uses different name
    const cols = db.prepare("PRAGMA table_info('Pytanie')").all().map(r => r.name);
    const hasPoziom = cols.includes('poziom_trudnosci');
    const hasTrudnosc = cols.includes('trudnosc');

    let insertSql, params;
    if(hasTrudnosc){
      insertSql = 'INSERT INTO Pytanie (tresc, id_banku, id_kategorii, trudnosc, punkty, tagi) VALUES (?, ?, ?, ?, ?, ?)';
      params = [tresc, id_banku || null, id_kategorii || null, trudnosc || null, punkty || null, tagi || null];
    } else if(hasPoziom){
      insertSql = 'INSERT INTO Pytanie (tresc, id_banku, id_kategorii, poziom_trudnosci, punkty, tagi) VALUES (?, ?, ?, ?, ?, ?)';
      params = [tresc, id_banku || null, id_kategorii || null, trudnosc || null, punkty || null, tagi || null];
    } else {
      insertSql = 'INSERT INTO Pytanie (tresc, id_banku, id_kategorii, punkty, tagi) VALUES (?, ?, ?, ?, ?)';
      params = [tresc, id_banku || null, id_kategorii || null, punkty || null, tagi || null];
    }

    const info = db.prepare(insertSql).run(...params);
    const row = db.prepare('SELECT * FROM Pytanie WHERE id_pytania = ?').get(info.lastInsertRowid);
    row.trudnosc = row.trudnosc || row.poziom_trudnosci || null;
    res.status(201).json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// UPDATE question
app.put('/api/pytania/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const { tresc, id_banku, id_kategorii, trudnosc, punkty, tagi } = req.body;
    const cols = db.prepare("PRAGMA table_info('Pytanie')").all().map(r => r.name);
    const hasPoziom = cols.includes('poziom_trudnosci');
    const hasTrudnosc = cols.includes('trudnosc');

    const updates = [];
    const params = [];
    if(tresc !== undefined){ updates.push('tresc = ?'); params.push(tresc); }
    if(id_banku !== undefined){ updates.push('id_banku = ?'); params.push(id_banku); }
    if(id_kategorii !== undefined){ updates.push('id_kategorii = ?'); params.push(id_kategorii); }
    if(punkty !== undefined){ updates.push('punkty = ?'); params.push(punkty); }
    if(tagi !== undefined){ updates.push('tagi = ?'); params.push(tagi); }

    if(hasTrudnosc && trudnosc !== undefined){ updates.push('trudnosc = ?'); params.push(trudnosc); }
    else if(hasPoziom && trudnosc !== undefined){ updates.push('poziom_trudnosci = ?'); params.push(trudnosc); }

    if(updates.length === 0) return res.status(400).json({ error: 'Brak pól do aktualizacji' });
    params.push(id);
    const sql = `UPDATE Pytanie SET ${updates.join(', ')} WHERE id_pytania = ?`;
    db.prepare(sql).run(...params);
    const row = db.prepare('SELECT * FROM Pytanie WHERE id_pytania = ?').get(id);
    row.trudnosc = row.trudnosc || row.poziom_trudnosci || null;
    res.json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// DELETE question
app.delete('/api/pytania/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM Pytanie WHERE id_pytania = ?').run(id);
    res.json({ ok:true, changes: info.changes });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- ODPOWIEDZI (opcjonalnie) --------------------
// GET answers for a question
app.get('/api/pytania/:id/odpowiedzi', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const rows = db.prepare('SELECT * FROM Odpowiedz WHERE id_pytania = ? ORDER BY id_odpowiedzi').all(id);
    res.json(rows);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// CREATE answer
app.post('/api/pytania/:id/odpowiedzi', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const { tresc, poprawna } = req.body;
    if(!tresc) return res.status(400).json({ error: 'Brak treści odpowiedzi' });
    const info = db.prepare('INSERT INTO Odpowiedz (id_pytania, tresc, poprawna) VALUES (?, ?, ?)').run(id, tresc, poprawna ? 1 : 0);
    const row = db.prepare('SELECT * FROM Odpowiedz WHERE id_odpowiedzi = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// DELETE answer
app.delete('/api/odpowiedzi/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM Odpowiedz WHERE id_odpowiedzi = ?').run(id);
    res.json({ ok:true, changes: info.changes });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- TESTY --------------------
// GET all tests
app.get('/api/testy', (req,res)=>{
  try{
    const rows = db.prepare('SELECT * FROM Test ORDER BY id_testu DESC').all();
    res.json(rows);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// GET single test with questions
app.get('/api/testy/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    const test = db.prepare('SELECT * FROM Test WHERE id_testu = ?').get(id);
    if(!test) return res.status(404).json({ error: 'Nie znaleziono testu' });
    const qrows = db.prepare(`
      SELECT tp.*, p.tresc, p.punkty, p.tagi
      FROM Test_Pytanie tp
      JOIN Pytanie p ON tp.id_pytania = p.id_pytania
      WHERE tp.id_testu = ?
      ORDER BY tp.id_test_pytania
    `).all(id);
    res.json({ test, pytania: qrows });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// GENERUJ test (POST /api/testy/generuj)
// body: { id_kategorii (optional), id_banku (optional), count (number), tytul (optional) }
app.post('/api/testy/generuj', (req,res)=>{
  try{
    const { id_kategorii, id_banku, count = 10, tytul } = req.body;
    // Build selection SQL
    let sql = 'SELECT id_pytania FROM Pytanie';
    const where = [];
    const params = {};
    if(id_kategorii) { where.push('id_kategorii = @id_kategorii'); params.id_kategorii = id_kategorii; }
    if(id_banku) { where.push('id_banku = @id_banku'); params.id_banku = id_banku; }
    if(where.length) sql += ' WHERE ' + where.join(' AND ');
    // Fetch all matching ids
    const all = db.prepare(sql).all(params).map(r => r.id_pytania);
    if(!all || all.length === 0) return res.status(400).json({ error: 'Brak pytań dla zadanych kryteriów' });
    // shuffle and take `count`
    const shuffled = all.sort(()=>0.5 - Math.random()).slice(0, Math.min(count, all.length));

    // Create Test record
    const created = db.prepare('INSERT INTO Test (tytul, opis) VALUES (?, ?)').run(tytul || `Test ${new Date().toISOString()}`, null);
    const id_testu = created.lastInsertRowid;

    const insertTP = db.prepare('INSERT INTO Test_Pytanie (id_testu, id_pytania, kolejnosc) VALUES (?, ?, ?)');
    let idx = 1;
    const inserted = [];
    const insertTran = db.transaction((items) => {
      for(const pId of items){
        insertTP.run(id_testu, pId, idx++);
        inserted.push(pId);
      }
    });
    insertTran(shuffled);

    // Return created test id and questions count
    res.status(201).json({ id_testu, inserted_count: inserted.length, inserted });
  }catch(err){ console.error(err); res.status(500).json({ error: err.message }); }
});

// DELETE test
app.delete('/api/testy/:id', (req,res)=>{
  try{
    const id = Number(req.params.id);
    // delete test_pytanie first
    db.prepare('DELETE FROM Test_Pytanie WHERE id_testu = ?').run(id);
    const info = db.prepare('DELETE FROM Test WHERE id_testu = ?').run(id);
    res.json({ ok:true, changes: info.changes });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- WYNIKI TESTÓW (opcjonalnie) --------------------
app.get('/api/wyniki', (req,res)=>{
  try{
    const rows = db.prepare('SELECT * FROM WynikTestu ORDER BY id_wyniku DESC').all();
    res.json(rows);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// Record a test result
app.post('/api/wyniki', (req,res)=>{
  try{
    const { id_testu, id_uzytkownika, uzyskane_punkty, max_punkty } = req.body;
    if(!id_testu || !id_uzytkownika) return res.status(400).json({ error: 'Brak id_testu lub id_uzytkownika' });
    const info = db.prepare('INSERT INTO WynikTestu (id_testu, id_uzytkownika, uzyskane_punkty, max_punkty) VALUES (?, ?, ?, ?)').run(id_testu, id_uzytkownika, uzyskane_punkty || 0, max_punkty || 0);
    const row = db.prepare('SELECT * FROM WynikTestu WHERE id_wyniku = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// -------------------- Health / Root --------------------
app.get('/', (req,res) => {
  res.send('<!doctype html><html><body><h2>API Backend — projekt-bazy-danych</h2><p>Użyj /api/...</p></body></html>');
});

app.get('/api', (req,res) => {
  res.json({ msg: 'API root', version: '1.0' });
});

// Global error handler (CORS callback errors and others)
app.use(function(err, req, res, next){
  console.error('Global error:', err && err.message);
  if(err && err.message && err.message.indexOf('CORS') !== -1){
    return res.status(403).json({ error: err.message });
  }
  return res.status(500).json({ error: err ? err.message : 'Unknown error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server uruchomiony na porcie ${PORT}`);
});


