// script.js

const API_URL = "https://projekt-bazy-danych-backend.onrender.com"; // <--- ZMIEŃ NA SWÓJ LINK Z RENDERA

const userList = document.getElementById("userList");
const refreshBtn = document.getElementById("refreshBtn");
const form = document.getElementById("userForm");
const usernameInput = document.getElementById("username");

// Funkcja pobierająca użytkowników
async function loadUsers() {
  userList.innerHTML = "<li class='p-2 text-gray-500'>Ładowanie...</li>";
  try {
    const res = await fetch(`${API_URL}/users`);
    const users = await res.json();

    if (users.length === 0) {
      userList.innerHTML = "<li class='p-2 text-gray-500'>Brak użytkowników</li>";
      return;
    }

    userList.innerHTML = users
      .map(u => `<li class='p-2'>👤 ${u.id}. ${u.name}</li>`)
      .join("");
  } catch (err) {
    console.error("Błąd pobierania:", err);
    userList.innerHTML = "<li class='p-2 text-red-500'>❌ Błąd połączenia z API</li>";
  }
}

// Obsługa dodawania użytkownika
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return alert("Podaj nazwę użytkownika!");

  try {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!res.ok) throw new Error("Błąd zapisu do bazy");

    usernameInput.value = "";
    await loadUsers();
  } catch (err) {
    alert("❌ Nie udało się dodać użytkownika");
  }
});

// Odświeżanie listy
refreshBtn.addEventListener("click", loadUsers);

// Wczytanie danych przy starcie
loadUsers();
