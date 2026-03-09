// ============================================================
// FIREBASE CONFIGURATIE — Feen
// Vul hier je eigen Firebase-projectgegevens in.
// Zie instructies in de README of vraag Omar.
// ============================================================

const firebaseConfig = {
    apiKey:            "AIzaSyB__Z7eXRzAJ92NpFiDb0XqcwRmAo33u5k",
    authDomain:        "feen-3c09a.firebaseapp.com",
    projectId:         "feen-3c09a",
    storageBucket:     "feen-3c09a.firebasestorage.app",
    messagingSenderId: "306526746390",
    appId:             "1:306526746390:web:144b18992c6497c502c237",
    measurementId:     "G-DVPJM8XPXK"
};

// Firebase initialiseren
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ============================================================
// AUTH STATE HELPER — update nav op alle pagina's
// ============================================================
auth.onAuthStateChanged(user => {
    const loginLinks  = document.querySelectorAll('.auth-login');
    const portalLinks = document.querySelectorAll('.auth-portal');
    const logoutBtns  = document.querySelectorAll('.auth-logout');

    if (user && (user.emailVerified || user.email === 'omarelazami@hotmail.nl')) {
        loginLinks.forEach(el  => el.style.display = 'none');
        portalLinks.forEach(el => el.style.display = '');
        logoutBtns.forEach(el  => el.style.display = '');
    } else {
        loginLinks.forEach(el  => el.style.display = '');
        portalLinks.forEach(el => el.style.display = 'none');
        logoutBtns.forEach(el  => el.style.display = 'none');
    }
});

function feenLogout() {
    auth.signOut().then(() => { window.location.href = '/'; });
}
