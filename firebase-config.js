// ============================================================
// FIREBASE CONFIGURATIE — Feen
// Vul hier je eigen Firebase-projectgegevens in.
// Zie instructies in de README of vraag Omar.
// ============================================================

const firebaseConfig = {
    apiKey:            "VULL_HIER_IN",
    authDomain:        "VULL_HIER_IN",
    projectId:         "VULL_HIER_IN",
    storageBucket:     "VULL_HIER_IN",
    messagingSenderId: "VULL_HIER_IN",
    appId:             "VULL_HIER_IN"
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

    if (user && user.emailVerified) {
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
