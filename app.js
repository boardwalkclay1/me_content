// Shared data + logic for all Me Content pages

const STORAGE_KEY_ITEMS = "meContent_items_v1";
const STORAGE_KEY_CATEGORIES = "meContent_categories_v1";

let items = [];
let categories = [];

function loadData() {
  try {
    const rawItems = localStorage.getItem(STORAGE_KEY_ITEMS);
    const rawCats = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    items = rawItems ? JSON.parse(rawItems) : [];
    categories = rawCats
      ? JSON.parse(rawCats)
      : ["Ideas", "In Progress", "Posted"];
  } catch (e) {
    items = [];
    categories = ["Ideas", "In Progress", "Posted"];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
}

function generateId() {
  return (
    "mc_" +
    Math.random().toString(36).slice(2) +
    "_" +
    Date.now().toString(36)
  );
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inferInitialStatus(type) {
  if (type === "content" || type === "script") return "draft";
  if (type === "reminder") return "idea";
  return "idea";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generic list renderer
function renderList(container, listItems, options = {}) {
  const {
    emptyEl = null,
    showStatus = false,
    allowStatusChange = false,
    onSelect = null,
  } = options;

  container.innerHTML = "";
  if (!listItems.length) {
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  listItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-item";

    const main = document.createElement("div");
    main.className = "list-item-main";

    const title = document.createElement("div");
    title.className = "list-item-title";
    title.textContent = item.title;
    main.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "list-item-meta";
    meta.innerHTML = `
      <span class="tag">${escapeHtml(item.type)}</span>
      <span class="tag">${escapeHtml(item.category)}</span>
    `;
    if (item.publishDate) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = "📆 " + item.publishDate;
      meta.appendChild(span);
    }
    if (item.reminderDate) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = "⏰ " + item.reminderDate;
      meta.appendChild(span);
    }
    if (item.tags && item.tags.length) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = "#" + item.tags.join(" #");
      meta.appendChild(span);
    }
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "list-item-actions";

    if (showStatus) {
      const status = document.createElement("span");
      status.className = "status-pill";
      status.textContent = (item.status || "idea").toUpperCase();
      actions.appendChild(status);
    }

    if (allowStatusChange) {
      const select = document.createElement("select");
      select.className = "small";
      select.style.background = "rgba(5,6,10,0.9)";
      select.style.color = "var(--muted)";
      ["idea", "draft", "done"].forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s.toUpperCase();
        if ((item.status || "idea") === s) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener("change", () => {
        item.status = select.value;
        saveData();
        initPage(); // re-render current page
      });
      actions.appendChild(select);
    }

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.justifyContent = "space-between";
    wrapper.style.gap = "8px";
    wrapper.appendChild(main);
    wrapper.appendChild(actions);

    li.appendChild(wrapper);

    if (onSelect) {
      li.style.cursor = "pointer";
      li.addEventListener("click", (e) => {
        if (e.target.tagName === "SELECT") return;
        onSelect(item);
      });
    }

    container.appendChild(li);
  });
}

// Modal wiring (shared)
function setupModal() {
  const modalBackdrop = document.getElementById("modalBackdrop");
  const newThoughtBtn = document.getElementById("newThoughtBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const form = document.getElementById("newThoughtForm");

  if (!modalBackdrop || !newThoughtBtn || !closeModalBtn || !form) return;

  function openModal() {
    populateCategorySelect();
    form.reset();
    modalBackdrop.style.display = "flex";
  }

  function closeModal() {
    modalBackdrop.style.display = "none";
  }

  newThoughtBtn.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("ntTitle");
    const typeInput = document.getElementById("ntType");
    const catInput = document.getElementById("ntCategory");
    const tagsInput = document.getElementById("ntTags");
    const textInput = document.getElementById("ntText");
    const videoInput = document.getElementById("ntVideo");
    const reminderInput = document.getElementById("ntReminderDate");
    const publishInput = document.getElementById("ntPublishDate");

    const title = titleInput.value.trim();
    const type = typeInput.value;
    const category = catInput.value || "Unsorted";
    const tags = tagsInput.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const text = textInput.value.trim();
    const reminderDate = reminderInput.value || "";
    const publishDate = publishInput.value || "";

    let videoDataUrl = "";
    if (videoInput && videoInput.files && videoInput.files[0]) {
      videoDataUrl = await fileToDataUrl(videoInput.files[0]);
    }

    const autoTitle =
      title ||
      (text
        ? text.slice(0, 40) + (text.length > 40 ? "…" : "")
        : type.toUpperCase() + " " + new Date().toLocaleString());

    const item = {
      id: generateId(),
      title: autoTitle,
      type,
      category,
      tags,
      text,
      videoDataUrl,
      reminderDate,
      publishDate,
      status: inferInitialStatus(type),
      createdAt: new Date().toISOString(),
    };

    items.unshift(item);
    saveData();
    closeModal();
    initPage();
  });
}

function populateCategorySelect() {
  const select = document.getElementById("ntCategory");
  if (!select) return;
  select.innerHTML = "";
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

// Page-specific logic
function initDashboard() {
  const today = todayISO();
  const todayRemindersList = document.getElementById("todayRemindersList");
  const todayRemindersEmpty = document.getElementById("todayRemindersEmpty");
  const todayPlanList = document.getElementById("todayPlanList");
  const todayPlanEmpty = document.getElementById("todayPlanEmpty");

  if (!todayRemindersList || !todayPlanList) return;

  const todaysReminders = items.filter(
    (i) => i.reminderDate && i.reminderDate === today
  );
  const todaysPlan = items.filter(
    (i) => i.publishDate && i.publishDate === today
  );

  renderList(todayRemindersList, todaysReminders, {
    emptyEl: todayRemindersEmpty,
    showStatus: true,
    allowStatusChange: true,
  });

  renderList(todayPlanList, todaysPlan, {
    emptyEl: todayPlanEmpty,
    showStatus: true,
    allowStatusChange: true,
  });
}

function initVault() {
  const vaultSearch = document.getElementById("vaultSearch");
  const vaultCategoryFilter = document.getElementById("vaultCategoryFilter");
  const vaultTypeFilter = document.getElementById("vaultTypeFilter");
  const vaultList = document.getElementById("vaultList");
  const vaultEmpty = document.getElementById("vaultEmpty");
  const detailPanel = document.getElementById("detailPanel");

  if (!vaultList) return;

  function populateCategoryFilter() {
    if (!vaultCategoryFilter) return;
    vaultCategoryFilter.innerHTML = '<option value="">All</option>';
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      vaultCategoryFilter.appendChild(opt);
    });
  }

  function showDetail(item) {
    const created = new Date(item.createdAt).toLocaleString();
    const tags = item.tags.length ? item.tags.join(", ") : "None";
    const reminder = item.reminderDate || "None";
    const publish = item.publishDate || "None";

    let html = `
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(item.title)}</div>
        <div class="list-item-meta">
          <span class="tag">${escapeHtml(item.type)}</span>
          <span class="tag">${escapeHtml(item.category)}</span>
          <span class="tag">Status: ${escapeHtml(item.status || "idea")}</span>
        </div>
        <p class="field-hint" style="margin-top:6px;">
          <strong>Created:</strong> ${created}<br/>
          <strong>Tags:</strong> ${escapeHtml(tags)}<br/>
          <strong>Reminder date:</strong> ${escapeHtml(reminder)}<br/>
          <strong>Publish date:</strong> ${escapeHtml(publish)}
        </p>
        <p class="field-hint" style="margin-top:6px; white-space:pre-wrap;">
          ${escapeHtml(item.text || "")}
        </p>
      </div>
    `;

    if (item.videoDataUrl) {
      html += `
        <div style="margin-top:8px;">
          <span class="field-hint">Video message:</span><br/>
          <video controls src="${item.videoDataUrl}" style="max-width:160px; border-radius:8px; border:1px solid rgba(37,41,58,0.9);"></video>
        </div>
      `;
    }

    html += `
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn ghost small" data-action="delete" data-id="${item.id}">
          🗑️ Delete
        </button>
      </div>
    `;

    detailPanel.innerHTML = html;

    const delBtn = detailPanel.querySelector('[data-action="delete"]');
    delBtn.addEventListener("click", () => {
      if (!confirm("Delete this item? This cannot be undone.")) return;
      items = items.filter((i) => i.id !== item.id);
      saveData();
      initPage();
    });
  }

  function renderVault() {
    const q = (vaultSearch?.value || "").toLowerCase();
    const cat = vaultCategoryFilter?.value || "";
    const type = vaultTypeFilter?.value || "";

    let filtered = items.slice();
    if (q) {
      filtered = filtered.filter((i) => {
        return (
          i.title.toLowerCase().includes(q) ||
          i.text.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    }
    if (cat) {
      filtered = filtered.filter((i) => i.category === cat);
    }
    if (type) {
      filtered = filtered.filter((i) => i.type === type);
    }

    renderList(vaultList, filtered, {
      emptyEl: vaultEmpty,
      showStatus: true,
      allowStatusChange: true,
      onSelect: (item) => showDetail(item),
    });

    if (!filtered.length && detailPanel) {
      detailPanel.innerHTML =
        "Select an item from the vault to see its full details.";
    }
  }

  populateCategoryFilter();
  renderVault();

  vaultSearch?.addEventListener("input", renderVault);
  vaultCategoryFilter?.addEventListener("change", renderVault);
  vaultTypeFilter?.addEventListener("change", renderVault);
}

function initPlanner() {
  const colIdea = document.getElementById("col-idea");
  const colDraft = document.getElementById("col-draft");
  const colDone = document.getElementById("col-done");
  const countIdea = document.getElementById("count-idea");
  const countDraft = document.getElementById("count-draft");
  const countDone = document.getElementById("count-done");
  const planFromDate = document.getElementById("planFromDate");
  const planToDate = document.getElementById("planToDate");
  const planCalendarList = document.getElementById("planCalendarList");
  const planCalendarEmpty = document.getElementById("planCalendarEmpty");

  if (!colIdea || !planCalendarList) return;

  function renderPipeline() {
    const ideaItems = items.filter((i) => (i.status || "idea") === "idea");
    const draftItems = items.filter((i) => (i.status || "idea") === "draft");
    const doneItems = items.filter((i) => (i.status || "idea") === "done");

    countIdea.textContent = ideaItems.length;
    countDraft.textContent = draftItems.length;
    countDone.textContent = doneItems.length;

    renderList(colIdea, ideaItems, {
      showStatus: true,
      allowStatusChange: true,
    });
    renderList(colDraft, draftItems, {
      showStatus: true,
      allowStatusChange: true,
    });
    renderList(colDone, doneItems, {
      showStatus: true,
      allowStatusChange: true,
    });
  }

  function renderCalendar() {
    const from = planFromDate.value;
    const to = planToDate.value;

    let filtered = items.filter((i) => i.publishDate);
    if (from) {
      filtered = filtered.filter((i) => i.publishDate >= from);
    }
    if (to) {
      filtered = filtered.filter((i) => i.publishDate <= to);
    }

    renderList(planCalendarList, filtered, {
      emptyEl: planCalendarEmpty,
      showStatus: true,
      allowStatusChange: true,
    });
  }

  renderPipeline();
  renderCalendar();

  planFromDate.addEventListener("change", renderCalendar);
  planToDate.addEventListener("change", renderCalendar);
}

function initCategories() {
  const categoriesList = document.getElementById("categoriesList");
  const categoriesEmpty = document.getElementById("categoriesEmpty");
  const newCategoryName = document.getElementById("newCategoryName");
  const addCategoryBtn = document.getElementById("addCategoryBtn");

  if (!categoriesList) return;

  function renderCategories() {
    categoriesList.innerHTML = "";
    if (!categories.length) {
      categoriesEmpty.style.display = "block";
      return;
    }
    categoriesEmpty.style.display = "none";

    categories.forEach((cat) => {
      const count = items.filter((i) => i.category === cat).length;
      const li = document.createElement("li");
      li.className = "list-item";
      li.innerHTML = `
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(cat)}</div>
          <div class="list-item-meta">
            <span class="tag">${count} item(s)</span>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn ghost small" data-cat="${cat}">Delete</button>
        </div>
      `;
      li.querySelector("button").addEventListener("click", () => {
        if (
          !confirm(
            "Delete this category? Items will keep their category name but it will no longer be in the list."
          )
        )
          return;
        categories = categories.filter((c) => c !== cat);
        saveData();
        renderCategories();
      });
      categoriesList.appendChild(li);
    });
  }

  addCategoryBtn.addEventListener("click", () => {
    const name = newCategoryName.value.trim();
    if (!name) return;
    if (!categories.includes(name)) {
      categories.push(name);
      saveData();
      renderCategories();
    }
    newCategoryName.value = "";
  });

  renderCategories();
}

// Entry
function initPage() {
  loadData();
  const page = document.body.dataset.page;

  if (page === "dashboard") {
    setupModal();
    initDashboard();
  } else if (page === "vault") {
    setupModal();
    initVault();
  } else if (page === "planner") {
    setupModal();
    initPlanner();
  } else if (page === "categories") {
    initCategories();
  } else if (page === "index") {
    // landing only, no extra wiring
  }
}

document.addEventListener("DOMContentLoaded", initPage);
