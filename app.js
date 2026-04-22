import {
  onAuthStateChanged,
  signOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { auth, db } from "./auth.js";

// ---------- state ----------
let currentUser = null;
let rosterRows = [];
let rosterSort = { key: "timestamp", dir: "desc" };

const STATUS_LABEL = {
  available: "Available",
  unavailable: "Unavailable",
  onleave: "On leave",
};

// ---------- boot ----------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  currentUser = user;
  document.getElementById("who").textContent =
    user.displayName ? `${user.displayName} (${user.email})` : user.email;
  document.getElementById("display-name").value = user.displayName || "";

  if (!user.displayName) {
    openNameModal();
  }

  showTabFromHash();
  refreshHistory();
});

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    window.location.hash = name;
  });
});
window.addEventListener("hashchange", showTabFromHash);

function showTabFromHash() {
  const name = (window.location.hash || "#checkin").slice(1);
  const valid = ["checkin", "roster", "account"].includes(name) ? name : "checkin";
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${valid}`;
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === valid);
    tab.setAttribute("aria-selected", tab.dataset.tab === valid ? "true" : "false");
  });
  if (valid === "roster") refreshRoster();
}

// ---------- logout ----------
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("index.html");
});

// ---------- check-in ----------
document.querySelectorAll(".status-btn").forEach((btn) => {
  btn.addEventListener("click", () => submitCheckin(btn.dataset.status));
});

async function submitCheckin(status) {
  if (!currentUser) return;
  const msg = document.getElementById("checkin-message");
  const noteEl = document.getElementById("note");
  const buttons = document.querySelectorAll(".status-btn");
  buttons.forEach((b) => (b.disabled = true));
  msg.textContent = "Recording check-in…";
  msg.className = "status-message";
  try {
    await addDoc(collection(db, "checkins"), {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName || currentUser.email,
      status,
      note: noteEl.value.trim(),
      timestamp: serverTimestamp(),
    });
    msg.textContent = `Recorded: ${STATUS_LABEL[status]}.`;
    msg.classList.add("success");
    noteEl.value = "";
    await refreshHistory();
  } catch (err) {
    console.error(err);
    msg.textContent = `Could not record check-in: ${err.message || err}`;
    msg.classList.add("error");
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

// ---------- personal history ----------
async function refreshHistory() {
  if (!currentUser) return;
  const tbody = document.querySelector("#history-table tbody");
  const empty = document.getElementById("history-empty");
  tbody.innerHTML = "";
  try {
    const q = query(
      collection(db, "checkins"),
      where("uid", "==", currentUser.uid),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      empty.hidden = false;
      document.getElementById("history-table").hidden = true;
      return;
    }
    empty.hidden = true;
    document.getElementById("history-table").hidden = false;
    snap.forEach((doc) => {
      const d = doc.data();
      const tr = document.createElement("tr");
      tr.appendChild(statusCell(d.status));
      tr.appendChild(td(d.note || ""));
      tr.appendChild(td(formatTimestamp(d.timestamp)));
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    empty.hidden = false;
    empty.textContent = `Could not load history: ${err.message || err}`;
  }
}

// ---------- roster ----------
document.getElementById("refresh-roster").addEventListener("click", refreshRoster);
document.getElementById("export-csv").addEventListener("click", exportCsv);

document.querySelectorAll("#roster-table th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (rosterSort.key === key) {
      rosterSort.dir = rosterSort.dir === "asc" ? "desc" : "asc";
    } else {
      rosterSort.key = key;
      rosterSort.dir = key === "timestamp" ? "desc" : "asc";
    }
    renderRoster();
  });
});

async function refreshRoster() {
  const meta = document.getElementById("roster-meta");
  meta.textContent = "Loading roster…";
  try {
    // Pull the most recent check-ins, then dedupe by uid client-side.
    // 500 is plenty for ~45 people; adjust if your department grows.
    const q = query(
      collection(db, "checkins"),
      orderBy("timestamp", "desc"),
      limit(500)
    );
    const snap = await getDocs(q);
    const latest = new Map();
    snap.forEach((doc) => {
      const d = doc.data();
      if (!latest.has(d.uid)) latest.set(d.uid, d);
    });
    rosterRows = Array.from(latest.values());
    meta.textContent = `${rosterRows.length} ${rosterRows.length === 1 ? "person" : "people"} · updated ${new Date().toLocaleTimeString()}`;
    renderRoster();
  } catch (err) {
    console.error(err);
    meta.textContent = `Could not load roster: ${err.message || err}`;
    rosterRows = [];
    renderRoster();
  }
}

function renderRoster() {
  const tbody = document.querySelector("#roster-table tbody");
  const empty = document.getElementById("roster-empty");
  tbody.innerHTML = "";

  const rows = [...rosterRows].sort(rosterComparator);

  if (rows.length === 0) {
    empty.hidden = false;
    document.getElementById("roster-table").hidden = true;
  } else {
    empty.hidden = true;
    document.getElementById("roster-table").hidden = false;
    rows.forEach((d) => {
      const tr = document.createElement("tr");
      tr.appendChild(td(d.displayName || d.email));
      tr.appendChild(td(d.email || ""));
      tr.appendChild(statusCell(d.status));
      tr.appendChild(td(d.note || ""));
      tr.appendChild(td(formatTimestamp(d.timestamp)));
      tbody.appendChild(tr);
    });
  }

  // update sort indicators
  document.querySelectorAll("#roster-table th[data-sort]").forEach((th) => {
    const ind = th.querySelector(".sort-indicator");
    if (th.dataset.sort === rosterSort.key) {
      ind.textContent = rosterSort.dir === "asc" ? "▲" : "▼";
    } else {
      ind.textContent = "";
    }
  });
}

function rosterComparator(a, b) {
  const { key, dir } = rosterSort;
  const mul = dir === "asc" ? 1 : -1;
  let av, bv;
  if (key === "timestamp") {
    av = timestampMillis(a.timestamp);
    bv = timestampMillis(b.timestamp);
    return (av - bv) * mul;
  }
  av = (a[key] || "").toString().toLowerCase();
  bv = (b[key] || "").toString().toLowerCase();
  if (av < bv) return -1 * mul;
  if (av > bv) return 1 * mul;
  return 0;
}

// ---------- CSV export ----------
function exportCsv() {
  const rows = [...rosterRows].sort(rosterComparator);
  const header = ["Name", "Email", "Status", "Note", "Last check-in (ISO)", "Last check-in (local)"];
  const lines = [header.map(csvEscape).join(",")];
  rows.forEach((d) => {
    const date = timestampToDate(d.timestamp);
    lines.push([
      d.displayName || d.email || "",
      d.email || "",
      STATUS_LABEL[d.status] || d.status || "",
      d.note || "",
      date ? date.toISOString() : "",
      date ? date.toLocaleString() : "",
    ].map(csvEscape).join(","));
  });
  // Prepend BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `dfms-roster-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------- account: display name ----------
document.getElementById("name-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("display-name");
  const msg = document.getElementById("name-message");
  msg.textContent = "";
  msg.className = "status-message";
  const name = input.value.trim();
  if (!name) {
    msg.textContent = "Name can't be empty.";
    msg.classList.add("error");
    return;
  }
  try {
    await updateProfile(currentUser, { displayName: name });
    // auth.currentUser reflects the change after updateProfile resolves.
    document.getElementById("who").textContent = `${name} (${currentUser.email})`;
    msg.textContent = "Name updated. It will appear on your next check-in.";
    msg.classList.add("success");
  } catch (err) {
    msg.textContent = `Could not update name: ${err.message || err}`;
    msg.classList.add("error");
  }
});

// ---------- account: change password ----------
document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const currentEl = document.getElementById("current-password");
  const newEl = document.getElementById("new-password");
  const confirmEl = document.getElementById("confirm-password");
  const msg = document.getElementById("password-message");
  msg.textContent = "";
  msg.className = "status-message";

  if (newEl.value !== confirmEl.value) {
    msg.textContent = "New passwords don't match.";
    msg.classList.add("error");
    return;
  }
  if (newEl.value.length < 8) {
    msg.textContent = "New password must be at least 8 characters.";
    msg.classList.add("error");
    return;
  }
  try {
    const cred = EmailAuthProvider.credential(currentUser.email, currentEl.value);
    await reauthenticateWithCredential(currentUser, cred);
    await updatePassword(currentUser, newEl.value);
    msg.textContent = "Password updated.";
    msg.classList.add("success");
    currentEl.value = "";
    newEl.value = "";
    confirmEl.value = "";
  } catch (err) {
    const code = err && err.code ? err.code : "";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      msg.textContent = "Current password is incorrect.";
    } else if (code === "auth/weak-password") {
      msg.textContent = "New password is too weak.";
    } else if (code === "auth/requires-recent-login") {
      msg.textContent = "For security, sign out and back in, then try again.";
    } else {
      msg.textContent = `Could not update password: ${err.message || err}`;
    }
    msg.classList.add("error");
  }
});

// ---------- first-login name modal ----------
function openNameModal() {
  const modal = document.getElementById("name-modal");
  const input = document.getElementById("name-modal-input");
  modal.hidden = false;
  setTimeout(() => input.focus(), 0);
}

document.getElementById("name-modal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("name-modal-input");
  const err = document.getElementById("name-modal-error");
  err.textContent = "";
  const name = input.value.trim();
  if (!name) {
    err.textContent = "Please enter a name.";
    return;
  }
  try {
    await updateProfile(currentUser, { displayName: name });
    document.getElementById("who").textContent = `${name} (${currentUser.email})`;
    document.getElementById("display-name").value = name;
    document.getElementById("name-modal").hidden = true;
  } catch (e2) {
    err.textContent = e2.message || "Could not save name.";
  }
});

// ---------- helpers ----------
function td(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function statusCell(status) {
  const cell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `pill pill-${status}`;
  pill.textContent = STATUS_LABEL[status] || status || "";
  cell.appendChild(pill);
  return cell;
}

function timestampToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function timestampMillis(ts) {
  const d = timestampToDate(ts);
  return d ? d.getTime() : 0;
}

function formatTimestamp(ts) {
  const d = timestampToDate(ts);
  if (!d) return "(pending)";
  return d.toLocaleString();
}
