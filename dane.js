async function loadStudentData() {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return logout();

    const studentId = user.id;

    // 🔹 ŁADOWANIE KATEGORII
    const categories = await fetch("https://projekt-bazy-danych-backend.onrender.com/api/kategorie")
        .then(r => r.json());

    const grid = document.getElementById("collectionsGrid");
    grid.innerHTML = "";

    categories.forEach(cat => {
        grid.innerHTML += `
            <div class="collection-card">
                <div class="collection-thumbnail">
                    <img src="images/neo-classic.avif">
                </div>
                <div class="card-content">
                    <h3 class="card-title">${cat.nazwa}</h3>
                    <p class="card-subtitle">${cat.opis || ""}</p>
                    <a href="start-test.html?id=${cat.id_kategorii}" class="cta-button primary">Rozpocznij</a>
                </div>
            </div>
        `;
    });

    // 🔹 TERAZ ŁADUJEMY WYNIKI
    loadResults(studentId);
}

// 🔥 FUNKCJA BYŁA SCHOWANA — TERAZ NA ZEWNĄTRZ I WYWOŁYWANA
async function loadResults(studentId) {

    const wyniki = await fetch(`https://projekt-bazy-danych-backend.onrender.com/api/wyniki/${studentId}`)
        .then(r => r.json());

    const wynikiDiv = document.getElementById("wynikiContainer");
    wynikiDiv.innerHTML = "";

    if (!wyniki.length) {
        wynikiDiv.innerHTML = "<p>Brak wyników do wyświetlenia.</p>";
        return;
    }

    wyniki.forEach(w => {
        wynikiDiv.innerHTML += `
            <div class="score-box">
                <b>${w.nazwa_testu || "Nieznany test"}</b><br>
                Punkty: <span style="color:#ff3366; font-weight:bold;">${w.liczba_punktow}</span><br>
                Ocena: <b>${w.ocena}</b><br>
                Data: ${w.data}
            </div>
        `;
    });
}
loadStudentData();