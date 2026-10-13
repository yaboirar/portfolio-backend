// Studio Portfolio Backend - Interactive Client with Security & Anti-Download Protection

let adminToken = localStorage.getItem("portfolio_admin_token") || "creative_secret_2026";

document.addEventListener("DOMContentLoaded", () => {
    initAuthBar();
    initTabs();
    initUpload();
    initPoemForm();
    loadStats();
    loadMedia();
    loadPoems();
});

// --- Authentication Manager ---
function initAuthBar() {
    const input = document.getElementById("adminKeyInput");
    const btn = document.getElementById("adminKeyBtn");
    const badge = document.getElementById("authBadge");

    if (input) input.value = adminToken;
    verifyAdminToken(adminToken);

    if (btn) {
        btn.addEventListener("click", () => {
            adminToken = input.value.trim();
            localStorage.setItem("portfolio_admin_token", adminToken);
            verifyAdminToken(adminToken);
        });
    }
}

async function verifyAdminToken(token) {
    const badge = document.getElementById("authBadge");
    try {
        const res = await fetch("/api/auth/verify", {
            headers: { "X-Admin-Token": token }
        });
        const data = await res.json();
        if (data.authenticated) {
            badge.textContent = "🔓 ADMIN UNLOCKED";
            badge.style.background = "rgba(63, 185, 80, 0.2)";
            badge.style.borderColor = "rgba(63, 185, 80, 0.5)";
            badge.style.color = "#3fb950";
        } else {
            badge.textContent = "🔒 ADMIN LOCKED";
            badge.style.background = "rgba(248, 81, 73, 0.2)";
            badge.style.borderColor = "rgba(248, 81, 73, 0.5)";
            badge.style.color = "#f85149";
        }
    } catch {
        badge.textContent = "⚠️ OFFLINE";
    }
}

// --- Tab Management ---
function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));

            tab.classList.add("active");
            const target = document.getElementById(tab.dataset.tab);
            if (target) {
                target.classList.add("active");
                if (tab.dataset.tab === "dbTab") {
                    loadDatabaseInspector();
                }
            }
        });
    });

    const filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            filterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadMedia(btn.dataset.filter);
        });
    });
}

// --- Stats ---
async function loadStats() {
    try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        document.getElementById("statVideos").textContent = `🎬 ${data.video_count} Videos`;
        document.getElementById("statImages").textContent = `🎨 ${data.image_count} Images`;
        document.getElementById("statPoems").textContent = `✍️ ${data.poem_count} Poems`;
        document.getElementById("statStorage").textContent = `💾 ${data.total_media_mb} MB`;
    } catch (err) {
        console.error("Stats load failed", err);
    }
}

// --- Upload Handler (With Admin Token & Progress) ---
function initUpload() {
    const form = document.getElementById("uploadForm");
    const fileInput = document.getElementById("mediaFile");
    const dropText = document.getElementById("dropText");
    const progressContainer = document.getElementById("progressContainer");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const uploadBtn = document.getElementById("uploadBtn");

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
            dropText.innerHTML = `<span>Selected: <strong>${file.name}</strong></span><small>Size: ${sizeMb} MB | GPS/EXIF will be sanitized & filename anonymized</small>`;
            
            const titleInput = document.getElementById("mediaTitle");
            if (!titleInput.value) {
                titleInput.value = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
            }
        }
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const file = fileInput.files[0];
        if (!file) {
            alert("Please select a file first");
            return;
        }

        const title = document.getElementById("mediaTitle").value;
        const description = document.getElementById("mediaDesc").value;
        const typeOverride = document.getElementById("mediaType").value;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", title);
        formData.append("description", description);
        if (typeOverride !== "auto") {
            formData.append("type", typeOverride);
        }

        progressContainer.style.display = "block";
        uploadBtn.disabled = true;

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload", true);
        xhr.setRequestHeader("X-Admin-Token", adminToken);

        xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
                const percent = Math.round((evt.loaded / evt.total) * 100);
                progressBar.style.width = percent + "%";
                progressText.textContent = `${percent}% (${(evt.loaded / (1024*1024)).toFixed(1)}MB / ${(evt.total / (1024*1024)).toFixed(1)}MB)`;
            }
        };

        xhr.onload = () => {
            uploadBtn.disabled = false;
            if (xhr.status === 201) {
                form.reset();
                dropText.innerHTML = `<span>📁 Drag & drop or click to browse</span><small>Supports MP4 up to 100MB+, JPG/PNG up to 20MB</small>`;
                progressContainer.style.display = "none";
                progressBar.style.width = "0%";
                loadStats();
                loadMedia();
            } else if (xhr.status === 401) {
                alert("Upload Rejected: Invalid Admin Key. Please unlock in the top navbar.");
                progressContainer.style.display = "none";
            } else {
                alert("Upload failed: " + xhr.responseText);
                progressContainer.style.display = "none";
            }
        };

        xhr.onerror = () => {
            uploadBtn.disabled = false;
            alert("Network error during upload");
            progressContainer.style.display = "none";
        };

        xhr.send(formData);
    });
}

// --- Media Hub (With Anti-Download Video Protection) ---
async function loadMedia(filter = "all") {
    const grid = document.getElementById("mediaGrid");
    try {
        const url = filter === "all" ? "/api/media" : `/api/media?type=${filter}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.media || data.media.length === 0) {
            grid.innerHTML = `<div class="empty-state">No ${filter === 'all' ? '' : filter} assets yet. Upload one above!</div>`;
            return;
        }

        grid.innerHTML = data.media.map(item => {
            const sizeMb = (item.file_size / (1024 * 1024)).toFixed(2);
            const isVideo = item.media_type === "video";
            
            return `
            <div class="media-card" id="media-card-${item.id}">
                ${isVideo ? `
                    <div style="position:relative;">
                        <video 
                            controls 
                            preload="metadata" 
                            controlsList="nodownload noplaybackrate" 
                            oncontextmenu="return false;" 
                            disablePictureInPicture
                            style="width:100%; height:180px; object-fit:cover; background:#000;">
                            <source src="${item.relative_url}" type="${item.mime_type}">
                            Your browser does not support video playback.
                        </video>
                    </div>
                ` : `
                    <img src="${item.relative_url}" alt="${item.title}" loading="lazy" oncontextmenu="return false;">
                `}
                <div class="media-info">
                    <div class="media-title-row">
                        <span class="media-title">${escapeHtml(item.title)}</span>
                        <span class="badge">${item.media_type.toUpperCase()}</span>
                    </div>
                    ${item.description ? `<p style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(item.description)}</p>` : ''}
                    <div class="media-meta">${sizeMb} MB &bull; ${item.mime_type}</div>
                    <div class="media-url" title="Anonymous hash (no creator or original name leaked)">${item.relative_url}</div>
                    <div class="media-actions">
                        <button class="btn-danger" onclick="deleteMedia(${item.id})">Delete Asset</button>
                    </div>
                </div>
            </div>
            `;
        }).join("");

    } catch (err) {
        console.error("Failed to load media", err);
    }
}

async function deleteMedia(id) {
    if (!confirm("Delete this asset from database and disk? (Requires Admin Key)")) return;
    try {
        const res = await fetch(`/api/media/${id}`, { 
            method: "DELETE",
            headers: { "X-Admin-Token": adminToken }
        });
        if (res.ok) {
            loadMedia();
            loadStats();
        } else if (res.status === 401) {
            alert("Unauthorized: Check your Admin Key in the top navbar.");
        } else {
            alert("Failed to delete media");
        }
    } catch (err) {
        alert("Error deleting media: " + err);
    }
}

// --- Poems Notebook ---
function initPoemForm() {
    const form = document.getElementById("poemForm");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("poemTitle").value;
        const mood = document.getElementById("poemMood").value;
        const tags = document.getElementById("poemTags").value;
        const content = document.getElementById("poemContent").value;

        try {
            const res = await fetch("/api/poems", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "X-Admin-Token": adminToken
                },
                body: jsonSerializeSafe({ title, mood, tags, content })
            });

            if (res.ok) {
                form.reset();
                loadPoems();
                loadStats();
            } else if (res.status === 401) {
                alert("Unauthorized: Please unlock with your Admin Key in the navbar first.");
            } else {
                alert("Failed to publish poem");
            }
        } catch (err) {
            alert("Error creating poem: " + err);
        }
    });
}

async function loadPoems() {
    const list = document.getElementById("poemsList");
    const countBadge = document.getElementById("poemCount");
    try {
        const res = await fetch("/api/poems");
        const data = await res.json();
        
        countBadge.textContent = `${data.count} Poems`;

        if (!data.poems || data.poems.length === 0) {
            list.innerHTML = `<div class="empty-state">No poems yet. Write your first stanza on the left!</div>`;
            return;
        }

        list.innerHTML = data.poems.map(p => {
            const tagsHtml = p.tags ? p.tags.split(",").map(t => `<span class="tag">#${escapeHtml(t.trim())}</span>`).join(" ") : "";
            return `
            <div class="poem-card" id="poem-card-${p.id}">
                <div class="poem-card-header">
                    <span class="poem-card-title">${escapeHtml(p.title)}</span>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span class="poem-mood">${escapeHtml(p.mood)}</span>
                        <button class="btn-danger" onclick="deletePoem(${p.id})">Delete</button>
                    </div>
                </div>
                <div class="poem-stanzas">${escapeHtml(p.content)}</div>
                ${tagsHtml ? `<div class="poem-tags">${tagsHtml}</div>` : ''}
            </div>
            `;
        }).join("");

    } catch (err) {
        console.error("Failed to load poems", err);
    }
}

async function deletePoem(id) {
    if (!confirm("Delete this poem from database? (Requires Admin Key)")) return;
    try {
        const res = await fetch(`/api/poems/${id}`, { 
            method: "DELETE",
            headers: { "X-Admin-Token": adminToken }
        });
        if (res.ok) {
            loadPoems();
            loadStats();
        } else if (res.status === 401) {
            alert("Unauthorized: Check your Admin Key in the top navbar.");
        } else {
            alert("Failed to delete poem");
        }
    } catch (err) {
        alert("Error deleting poem: " + err);
    }
}

// --- Live Database Inspector ---
async function loadDatabaseInspector() {
    try {
        const mRes = await fetch("/api/media");
        const mData = await mRes.json();
        const mBody = document.querySelector("#dbMediaTable tbody");
        if (mData.media && mData.media.length > 0) {
            mBody.innerHTML = mData.media.map(m => `
                <tr>
                    <td>${m.id}</td>
                    <td><strong>${escapeHtml(m.title)}</strong></td>
                    <td><span class="badge">${m.media_type}</span></td>
                    <td><code style="color:var(--accent-purple);">${escapeHtml(m.filename)}</code></td>
                    <td><code>${m.relative_url}</code></td>
                    <td>${(m.file_size / (1024*1024)).toFixed(2)} MB</td>
                    <td>${m.mime_type}</td>
                    <td>${m.created_at.slice(0, 19).replace('T', ' ')}</td>
                </tr>
            `).join("");
        } else {
            mBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Table 'media' is currently empty</td></tr>`;
        }

        const pRes = await fetch("/api/poems");
        const pData = await pRes.json();
        const pBody = document.querySelector("#dbPoemsTable tbody");
        if (pData.poems && pData.poems.length > 0) {
            pBody.innerHTML = pData.poems.map(p => `
                <tr>
                    <td>${p.id}</td>
                    <td><strong>${escapeHtml(p.title)}</strong></td>
                    <td>${escapeHtml(p.mood)}</td>
                    <td>${escapeHtml(p.tags)}</td>
                    <td>${escapeHtml(p.content.slice(0, 45))}...</td>
                    <td>${p.created_at.slice(0, 19).replace('T', ' ')}</td>
                </tr>
            `).join("");
        } else {
            pBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Table 'poems' is currently empty</td></tr>`;
        }
    } catch (err) {
        console.error("Inspector error", err);
    }
}

// Utility
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function jsonSerializeSafe(obj) {
    return JSON.stringify(obj);
}
