// Minimal frontend logic
let accessToken = null; // in-memory access token
const apiBase = "/api/v1";

function el(id) {
  return document.getElementById(id);
}

// Helper: safely parse JSON response, fall back to text when JSON parsing fails
async function parseResponse(res) {
  try {
    const j = await res.json();
    return { body: j, text: null };
  } catch (err) {
    try {
      const t = await res.text();
      return { body: null, text: t };
    } catch (e) {
      return { body: null, text: null };
    }
  }
}

// Helper: show auth/register messages and toggle error styling
function setAuthMsg(id, message, isError = false) {
  const elmsg = document.getElementById(id);
  if (!elmsg) return;
  elmsg.textContent = message || "";
  if (isError) elmsg.classList.add("auth-error");
  else elmsg.classList.remove("auth-error");
}

// Basic email validation used by UI
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// Auth
el("btn-register").onclick = async () => {
  const name = el("reg-name").value;
  const email = el("reg-email").value;
  const pass = el("reg-pass").value;
  // Client-side validation: all fields required
  if (!name || !name.trim()) {
    setAuthMsg("reg-msg", "Name is required", true);
    return;
  }
  if (!isValidEmail(email)) {
    setAuthMsg("reg-msg", "Please enter a valid email address", true);
    return;
  }
  if (!pass || pass.length < 6) {
    setAuthMsg("reg-msg", "Password must be at least 6 characters", true);
    return;
  }
  try {
    const res = await fetch(`${apiBase}/auth/register`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: pass }),
    });
    const parsed = await parseResponse(res);
    if (!res.ok) {
      const msg =
        (parsed.body && parsed.body.message) ||
        parsed.text ||
        `${res.status} ${res.statusText}`;
      setAuthMsg("reg-msg", msg || "Register failed", true);
      setAuthMsg("login-msg", "", false);
      return;
    }
    const data = parsed.body || {};
    accessToken = data.token || data.accessToken || null;
    // clear messages
    setAuthMsg("reg-msg", "", false);
    setAuthMsg("login-msg", "", false);
    showMain();
  } catch (e) {
    setAuthMsg("reg-msg", e.message || "Register failed", true);
  }
};
el("btn-login").onclick = async () => {
  const email = el("login-email").value;
  const pass = el("login-pass").value;
  // Client-side validation
  if (!isValidEmail(email)) {
    setAuthMsg("login-msg", "Please enter a valid email address", true);
    return;
  }
  if (!pass || !pass.trim()) {
    setAuthMsg("login-msg", "Password is required", true);
    return;
  }
  try {
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    });
    const parsed = await parseResponse(res);
    if (!res.ok) {
      const msg =
        (parsed.body && parsed.body.message) ||
        parsed.text ||
        `${res.status} ${res.statusText}`;
      setAuthMsg("login-msg", msg || "Login failed", true);
      setAuthMsg("reg-msg", "", false);
      return;
    }
    const data = parsed.body || {};
    accessToken = data.token || data.accessToken || null;
    // clear any auth messages
    setAuthMsg("reg-msg", "", false);
    setAuthMsg("login-msg", "", false);
    showMain();
  } catch (e) {
    setAuthMsg("login-msg", e.message || "Login failed", true);
  }
};

el("btn-logout").onclick = async () => {
  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: "POST",
      credentials: "same-origin",
    }); // cookie cleared server-side
  } catch (e) {}
  accessToken = null;
  if (pollTimer) clearInterval(pollTimer);
  document.location.reload();
};

function authFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  opts.credentials = opts.credentials || "same-origin";
  if (accessToken) opts.headers["Authorization"] = `Bearer ${accessToken}`;
  return fetch(url, opts).then(async (res) => {
    if (res.status === 401) {
      // try refresh
      const r = await fetch(`${apiBase}/auth/refresh-token`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (r.ok) {
        const d = await r.json();
        accessToken = d.accessToken;
        if (accessToken) {
          opts.headers["Authorization"] = `Bearer ${accessToken}`;
          return fetch(url, opts);
        }
      }
    }
    return res;
  });
}

// Main UI
function showMain() {
  el("auth").style.display = "none";
  el("main").style.display = "block";
  loadReports();
  startPolling();
}

async function loadReports() {
  const res = await authFetch(`${apiBase}/reports/`);
  if (!res.ok) return;
  const data = await res.json();
  const tbody = document.querySelector("#reports-table tbody");
  tbody.innerHTML = "";
  (data.reports || []).forEach((r) => {
    const tr = document.createElement("tr");
    // build action buttons conditionally
    const actionButtons = [];
    actionButtons.push(
      `<button data-id="${r._id}" class="btn view">View</button>`
    );
    if (r.status === "COMPLETED") {
      actionButtons.push(
        `<button data-id="${r._id}" class="btn result">Result</button>`
      );
    } else {
      actionButtons.push(
        `<button class="btn" disabled title="Result will be available when processing completes">Result</button>`
      );
    }
    actionButtons.push(
      `<button data-id="${r._id}" class="btn danger delete">Delete</button>`
    );

    tr.innerHTML = `
      <td>
        <div class="id-cell">${r._id}<div class="small">${
      r.filename || ""
    }</div></div>
      </td>
      <td>${new Date(r.createdAt).toLocaleString()}</td>
      <td>${renderStatusBadge(r.status)}</td>
      <td class="actions">${actionButtons.join(" ")}</td>
    `;
    tbody.appendChild(tr);
  });
  // attach handlers
  document.querySelectorAll(".view").forEach((b) => {
    b.onclick = (ev) => {
      const id = b.dataset.id;
      // open preview modal (iframe will load the file, browser sends cookies)
      const iframe = document.getElementById("modal-iframe");
      const title = document.getElementById("modal-title");
      if (iframe) iframe.src = `${apiBase}/reports/file/${id}`;
      if (title) title.textContent = `Preview — ${id}`;
      const modal = document.getElementById("preview-modal");
      if (modal) modal.style.display = "flex";
    };
  });
  document
    .querySelectorAll(".result")
    .forEach((b) => (b.onclick = () => showDetail(b.dataset.id)));
  document.querySelectorAll(".delete").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.id;
      const ok = await showConfirm(
        "If you confirm then this record will be permanently removed from your list and you will not be able to access this document anymore.",
        "Confirm delete"
      );
      if (!ok) return;
      try {
        const r = await authFetch(`${apiBase}/reports/${id}`, {
          method: "DELETE",
        });
        const parsedDel = await parseResponse(r);
        if (!r.ok) {
          const msg =
            (parsedDel.body && parsedDel.body.message) ||
            parsedDel.text ||
            `${r.status} ${r.statusText}`;
          showToast(msg || "Delete failed", "error");
          return;
        }
        // refresh list immediately
        await loadReports();
        showToast("Report removed", "success");
      } catch (e) {
        showToast(e.message || "Delete failed", "error");
      }
    };
  });

  // update status message: show spinner if any pending/processing
  try {
    const reports = data.reports || [];
    const hasActive = reports.some(
      (rr) => rr && (rr.status === "PENDING" || rr.status === "PROCESSING")
    );
    const sm = el("status-msg");
    if (hasActive) {
      sm.innerHTML = `Processing active documents... <span class="muted">(updates every 3s)</span>`;
    } else {
      if (
        sm &&
        sm.textContent &&
        sm.textContent.toLowerCase().includes("processing")
      ) {
        sm.textContent = "";
      }
    }
  } catch (e) {
    // ignore
  }
}

function renderStatusBadge(s) {
  if (!s) return `<span class="status-badge">UNKNOWN</span>`;
  if (s === "PENDING")
    return `<span class="status-badge status-queued">QUEUED</span>`;
  if (s === "PROCESSING")
    return `<span class="status-badge status-processing">PROCESSING</span>`;
  if (s === "COMPLETED")
    return `<span class="status-badge status-completed">COMPLETED</span>`;
  if (s === "DELETED")
    return `<span class="status-badge" style="opacity:0.6">DELETED</span>`;
  return `<span class="status-badge">${s}</span>`;
}

// Modal close handler
function closeModal() {
  const modal = document.getElementById("preview-modal");
  const iframe = document.getElementById("modal-iframe");
  if (iframe) iframe.src = "";
  if (modal) modal.style.display = "none";
}

const modalClose = document.getElementById("modal-close");
if (modalClose) modalClose.onclick = closeModal;
const modalBackdrop = document.querySelector(".modal-backdrop");
if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);

// Toasts
function showToast(message, type = "success", timeout = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="msg">${message}</div>`;
  container.appendChild(t);
  // animate in
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, timeout);
}

// Custom confirm modal that returns a Promise<boolean>
function showConfirm(message, title = "Confirm") {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const msg = document.getElementById("confirm-msg");
    const ttl = document.getElementById("confirm-title");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");
    const backdrop = document.querySelector(".confirm-backdrop");
    if (!modal || !okBtn || !cancelBtn || !msg) return resolve(false);
    msg.textContent = message;
    if (ttl) ttl.textContent = title;
    modal.style.display = "flex";

    function cleanup() {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      backdrop && backdrop.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
    }

    function onOk() {
      cleanup();
      resolve(true);
    }
    function onCancel() {
      cleanup();
      resolve(false);
    }
    function onKey(e) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onOk();
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    backdrop && backdrop.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKey);
  });
}

el("btn-upload").onclick = async () => {
  const f = el("file-input").files[0];
  if (!f) {
    el("status-msg").textContent = "Select a file first";
    return;
  }
  const form = new FormData();
  form.append("file", f, f.name);
  // disable upload button while working
  const uploadBtn = el("btn-upload");
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
  }
  el("status-msg").textContent = "Processing started";
  try {
    const res = await authFetch(`${apiBase}/reports/upload`, {
      method: "POST",
      body: form,
    });
    const parsed = await parseResponse(res);
    if (!res.ok) {
      const msg =
        (parsed.body && parsed.body.message) ||
        parsed.text ||
        `${res.status} ${res.statusText}`;
      el("status-msg").textContent = msg || "Upload failed";
      showToast(msg || "Upload failed", "error");
      return;
    }
    const data = parsed.body || {};
    el("status-msg").textContent = data.message || "Processing started";
    showToast("Upload queued", "success");
    // clear file input and reset label immediately so UI reflects cleared state
    const fileInputEl = el("file-input");
    if (fileInputEl) fileInputEl.value = "";
    const label = document.querySelector(".file-choose");
    if (label) label.textContent = "Choose File";
    // refresh reports so the newly uploaded file appears
    await loadReports();
  } catch (e) {
    el("status-msg").textContent = e.message;
    showToast(e.message || "Upload failed", "error");
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
    }
  }
};

// show chosen filename in the label
const fileInput = el("file-input");
if (fileInput) {
  fileInput.addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    const label = document.querySelector(".file-choose");
    if (label) label.textContent = f ? f.name : "Choose File";
  });
}

async function showDetail(id) {
  const res = await authFetch(`${apiBase}/reports/result/${id}`);
  if (!res.ok) {
    const parsed = await parseResponse(res);
    const msg =
      (parsed.body && parsed.body.message) ||
      parsed.text ||
      `${res.status} ${res.statusText}`;
    showToast(msg || "Not ready", "error");
    return;
  }
  const data = await res.json();
  const result = data.result || {};
  // pretty JSON
  const pretty = JSON.stringify(result, null, 2);
  const jsonEl = el("detail-json");
  if (jsonEl) {
    // highlight redacted values
    const highlighted = pretty.replace(
      /"(\[[^\]]*REDACTED[^\]]*\])"/gi,
      '"<span class="redacted">$1</span>"'
    );
    jsonEl.innerHTML = `<div class="code-highlight">${escapeHtml(
      pretty
    )}</div>`;
  }

  // populate key/value view (flat)
  const kv = el("detail-kv");
  if (kv) {
    kv.innerHTML = "";
    const flat = flattenObject(result);
    Object.keys(flat).forEach((k) => {
      const v = flat[k];
      const div = document.createElement("div");
      div.className = "kv-row";
      const keyEl = document.createElement("div");
      keyEl.className = "kv-key";
      keyEl.textContent = k;
      const valEl = document.createElement("div");
      valEl.className = "kv-val";
      valEl.innerHTML = sanitizeVal(v);
      div.appendChild(keyEl);
      div.appendChild(valEl);
      kv.appendChild(div);
    });
  }

  el("detail-sub").textContent = `Report ID: ${id}`;
  el("detail").style.display = "block";

  // wire copy/download/search
  const copyBtn = el("btn-copy");
  if (copyBtn) copyBtn.onclick = () => copyToClipboard(pretty);
  const dlBtn = el("btn-download");
  if (dlBtn) dlBtn.onclick = () => downloadJson(pretty, `report-${id}.json`);
  const search = el("detail-search");
  if (search) {
    search.oninput = (e) => highlightSearch(e.target.value);
  }
  // tabs
  document.querySelectorAll(".tab").forEach((t) => {
    t.onclick = () => {
      document
        .querySelectorAll(".tab")
        .forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      const tab = t.dataset.tab;
      document.getElementById("tab-json").style.display =
        tab === "json" ? "block" : "none";
      document.getElementById("tab-table").style.display =
        tab === "table" ? "block" : "none";
    };
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function flattenObject(ob) {
  const toReturn = {};
  for (const i in ob) {
    if (!Object.prototype.hasOwnProperty.call(ob, i)) continue;
    if (typeof ob[i] === "object" && ob[i] !== null) {
      const flatObject = flattenObject(ob[i]);
      for (const x in flatObject) {
        if (!Object.prototype.hasOwnProperty.call(flatObject, x)) continue;
        toReturn[`${i}.${x}`] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

function sanitizeVal(v) {
  if (v === null || v === undefined) return '<i class="muted">(empty)</i>';
  const s = String(v);
  if (s.toUpperCase().includes("REDACTED"))
    return `<span class="redacted">${escapeHtml(s)}</span>`;
  return escapeHtml(s);
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).then(
    () => showToast("Copied to clipboard", "success"),
    () => showToast("Copy failed", "error")
  );
}

function downloadJson(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function highlightSearch(q) {
  const jsonEl = document.querySelector("#detail-json .code-highlight");
  const kv = document.getElementById("detail-kv");
  if (!q) {
    // remove highlights
    if (jsonEl)
      jsonEl.innerHTML = escapeHtml(jsonEl.textContent || jsonEl.innerText);
    if (kv) {
      kv.querySelectorAll(".kv-row").forEach(
        (r) => (r.style.background = "transparent")
      );
    }
    return;
  }
  const qq = q.toLowerCase();
  if (kv) {
    kv.querySelectorAll(".kv-row").forEach((r) => {
      const k = r.querySelector(".kv-key").textContent.toLowerCase();
      const v = r.querySelector(".kv-val").textContent.toLowerCase();
      if (k.includes(qq) || v.includes(qq))
        r.style.background = "rgba(2,126,167,0.06)";
      else r.style.background = "transparent";
    });
  }
}
el("close-detail").onclick = () => {
  el("detail").style.display = "none";
};

// Polling statuses
let pollTimer = null;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  // run one immediate refresh, then poll every 3 seconds
  loadReports();
  pollTimer = setInterval(async () => {
    // fetch reports and update table
    await loadReports();
  }, 3000);
}

function showAuth() {
  el("auth").style.display = "block";
  el("main").style.display = "none";
  clearAuthMessages();
}

// Clear auth messages whenever the auth form is shown
function clearAuthMessages() {
  setAuthMsg("reg-msg", "", false);
  setAuthMsg("login-msg", "", false);
}

// call it once to ensure clean state
clearAuthMessages();

// ensure messages cleared when showing auth
// wrapper removed; `showAuth()` now calls `clearAuthMessages()` directly

// On load, try to restore session using refresh-token cookie
window.addEventListener("load", async () => {
  try {
    const r = await fetch(`${apiBase}/auth/refresh-token`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (r.ok) {
      const d = await r.json();
      accessToken = d.accessToken || d.token || null;
      if (accessToken) {
        showMain();
        return;
      }
    }
  } catch (e) {
    console.warn("Session restore failed:", e.message || e);
  }
  // default to showing auth form
  showAuth();
});
