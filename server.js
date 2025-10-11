// server.js
import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Połączenie z bazą danych SQLite
const db = await open({
  filename: "./system_generowania_testow.sqlite",
  driver: sqlite3.Database
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

