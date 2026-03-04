const STORAGE_KEY = "rifts_dashboard_v1";
const DEFAULT_EMPTY_NOTE = "(no note)";

const CORE_STATS = [
  { key: "PPE", title: "PPE", baseFallback: 50, loggable: true },
  { key: "SDC", title: "SDC", baseFallback: 30, loggable: true },
  { key: "MDC", title: "MDC", baseFallback: 20, loggable: true },
  { key: "HP", title: "HP", baseFallback: 0, loggable: true },
  { key: "ISP", title: "ISP", baseFallback: 0, loggable: true },
  { key: "APM", title: "Attacks per Melee", baseFallback: 4, loggable: false },
];

const state = loadState();

const addCharacterForm = document.querySelector("#add-character-form");
const newCharacterNameInput = document.querySelector("#new-character-name");
const partyList = document.querySelector("#party-list");
const emptyDetail = document.querySelector("#empty-detail");
const detailPanel = document.querySelector("#character-detail");
const detailNameInput = document.querySelector("#detail-name");
const editBaseStatsButton = document.querySelector("#edit-base-stats");
const addStatBlockButton = document.querySelector("#add-stat-block");
const deleteCharacterButton = document.querySelector("#delete-character");
const statsGrid = document.querySelector("#stats-grid");
const characterNotes = document.querySelector("#character-notes");
const ammoList = document.querySelector("#ammo-list");
const addAmmoForm = document.querySelector("#add-ammo-form");
const ammoWeaponInput = document.querySelector("#ammo-weapon");
const ammoMaxInput = document.querySelector("#ammo-max");
const characterHistory = document.querySelector("#character-history");
const globalHistory = document.querySelector("#global-history");
const exportButton = document.querySelector("#export-data");
const importTriggerButton = document.querySelector("#import-trigger");
const importFileInput = document.querySelector("#import-file");
const resetDataButton = document.querySelector("#reset-data");

const logDialog = document.querySelector("#log-dialog");
const logDialogForm = document.querySelector("#log-dialog-form");
const logDialogContext = document.querySelector("#log-dialog-context");
const logReasonInput = document.querySelector("#log-reason");

const baseStatsDialog = document.querySelector("#base-stats-dialog");
const baseStatsForm = document.querySelector("#base-stats-form");
const basePpeInput = document.querySelector("#base-ppe");
const baseSdcInput = document.querySelector("#base-sdc");
const baseMdcInput = document.querySelector("#base-mdc");
const baseHpInput = document.querySelector("#base-hp");
const baseIspInput = document.querySelector("#base-isp");
const baseAttacksInput = document.querySelector("#base-attacks");
const applyBaseToCurrentInput = document.querySelector("#apply-base-to-current");

const partyItemTemplate = document.querySelector("#party-item-template");
const statRowTemplate = document.querySelector("#stat-row-template");
const ammoItemTemplate = document.querySelector("#ammo-item-template");

let pendingChange = null;

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function timestamp() {
  return new Date().toLocaleString();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function asInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeReason(reason) {
  const trimmed = (reason || "").trim();
  return trimmed || DEFAULT_EMPTY_NOTE;
}

function normalizeNumber(value, fallback = 0) {
  if (typeof value === "number") return Math.max(0, asInt(value, fallback));
  if (value && typeof value === "object") return Math.max(0, asInt(value.current, fallback));
  return Math.max(0, fallback);
}

function getCoreConfigByKey(key) {
  return CORE_STATS.find((entry) => entry.key === key);
}

function buildCoreStat({ key, title, baseFallback, loggable }, baseSource, currentSource, collapsedSource) {
  const current = normalizeNumber(currentSource, baseFallback);
  const base = normalizeNumber(baseSource, current);
  return {
    id: `core-${key.toLowerCase()}`,
    key,
    title,
    base,
    current,
    collapsed: collapsedSource === true,
    loggable,
  };
}

function legacyCurrentForKey(character, key) {
  const map = {
    PPE: ["ppe"],
    SDC: ["sdc"],
    MDC: ["mdc"],
    HP: ["hp"],
    ISP: ["isp"],
    APM: ["attacks"],
  };

  const field = map[key]?.[0];
  if (!field) return 0;

  if (character.stats && !Array.isArray(character.stats)) {
    return character.stats[field];
  }

  return 0;
}

function legacyBaseForKey(character, key) {
  const map = {
    PPE: ["ppe"],
    SDC: ["sdc"],
    MDC: ["mdc"],
    HP: ["hp"],
    ISP: ["isp"],
    APM: ["attacks"],
  };

  const field = map[key]?.[0];
  if (!field) return 0;

  if (character.baseStats && !Array.isArray(character.baseStats)) {
    return character.baseStats[field];
  }

  return legacyCurrentForKey(character, key);
}

function ensureStatsArray(character) {
  if (Array.isArray(character.stats)) {
    character.stats = character.stats.map((stat) => ({
      id: stat.id || uid(),
      key: typeof stat.key === "string" ? stat.key : "",
      title: (stat.title || stat.label || "Stat").toString(),
      base: normalizeNumber(stat.base, normalizeNumber(stat.current, 0)),
      current: normalizeNumber(stat.current, normalizeNumber(stat.base, 0)),
      collapsed: stat.collapsed === true,
      loggable: stat.loggable !== false,
    }));
  } else {
    const collapsedLegacy = character.collapsedStats && typeof character.collapsedStats === "object" ? character.collapsedStats : {};
    const migratedCore = CORE_STATS.map((core) => {
      const legacyCollapseKey = `core:${core.key === "APM" ? "attacks" : core.key.toLowerCase()}`;
      return buildCoreStat(
        core,
        legacyBaseForKey(character, core.key),
        legacyCurrentForKey(character, core.key),
        collapsedLegacy[legacyCollapseKey]
      );
    });

    const legacyCustom = Array.isArray(character.customStats)
      ? character.customStats.map((entry, index) => {
          const id = entry.id || uid();
          const type = (entry.type || "CUSTOM").toString().trim().toUpperCase() || "CUSTOM";
          const title = (entry.label || entry.title || `Custom ${index + 1}`).toString().trim() || `Custom ${index + 1}`;
          const collapsedKey = `custom:${id}`;
          return {
            id,
            key: type === "CUSTOM" ? "" : type,
            title,
            base: normalizeNumber(entry.base, normalizeNumber(entry.current, 0)),
            current: normalizeNumber(entry.current, normalizeNumber(entry.base, 0)),
            collapsed: collapsedLegacy[collapsedKey] === true || entry.collapsed === true,
            loggable: type !== "APM",
          };
        })
      : [];

    character.stats = [...migratedCore, ...legacyCustom];
  }

  CORE_STATS.forEach((core) => {
    if (!character.stats.some((stat) => stat.key === core.key)) {
      character.stats.push(
        buildCoreStat(
          core,
          legacyBaseForKey(character, core.key),
          legacyCurrentForKey(character, core.key),
          false
        )
      );
    }
  });

  character.stats = character.stats.map((stat) => {
    const core = getCoreConfigByKey(stat.key);
    return {
      ...stat,
      collapsed: stat.collapsed === true,
      loggable: core ? core.loggable : stat.loggable !== false,
      title: core ? core.title : (stat.title || "Stat"),
      base: normalizeNumber(stat.base, normalizeNumber(stat.current, 0)),
      current: normalizeNumber(stat.current, normalizeNumber(stat.base, 0)),
    };
  });

  character.stats.sort((a, b) => {
    const aCoreIdx = CORE_STATS.findIndex((core) => core.key === a.key);
    const bCoreIdx = CORE_STATS.findIndex((core) => core.key === b.key);
    const aIsCore = aCoreIdx !== -1;
    const bIsCore = bCoreIdx !== -1;
    if (aIsCore && bIsCore) return aCoreIdx - bCoreIdx;
    if (aIsCore) return -1;
    if (bIsCore) return 1;
    return 0;
  });
}

function sanitizeForDisplay(stateToFix) {
  stateToFix.characters.forEach((character) => {
    character.id ||= uid();
    character.name = (character.name || "Unnamed").toString();
    character.notes = typeof character.notes === "string" ? character.notes : "";
    if (!Array.isArray(character.history)) character.history = [];
    character.history.forEach((entry) => {
      entry.id ||= uid();
      entry.reason = normalizeReason(entry.reason);
      entry.time ||= timestamp();
      entry.text ||= "Updated stat";
      entry.character ||= character.name;
    });

    if (!Array.isArray(character.ammo)) character.ammo = [];
    character.ammo.forEach((entry) => {
      entry.id ||= uid();
      entry.weapon = (entry.weapon || "Weapon").toString();
      entry.max = Math.max(1, asInt(entry.max, 1));
      entry.current = clamp(asInt(entry.current, entry.max), 0, entry.max);
    });

    ensureStatsArray(character);

    delete character.baseStats;
    delete character.customStats;
    delete character.collapsedStats;
  });

  if (!Array.isArray(stateToFix.history)) stateToFix.history = [];
  stateToFix.history.forEach((entry) => {
    entry.id ||= uid();
    entry.reason = normalizeReason(entry.reason);
    entry.time ||= timestamp();
    entry.text ||= "Updated stat";
    entry.character ||= "Unknown";
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { characters: [], selectedCharacterId: null, history: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.history)) throw new Error("Invalid state");
    sanitizeForDisplay(parsed);
    return parsed;
  } catch {
    return { characters: [], selectedCharacterId: null, history: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function selectedCharacter() {
  return state.characters.find((character) => character.id === state.selectedCharacterId) || null;
}

function createCharacter(name, baseStats) {
  const coreStats = CORE_STATS.map((core) =>
    buildCoreStat(
      core,
      baseStats[core.key] ?? core.baseFallback,
      baseStats[core.key] ?? core.baseFallback,
      false
    )
  );

  return {
    id: uid(),
    name,
    notes: "",
    history: [],
    stats: coreStats,
    ammo: [],
  };
}

function getCharacterStat(character, key) {
  return character.stats.find((stat) => stat.key === key);
}

function render() {
  renderPartyList();
  renderDetail();
  renderGlobalHistory();
}

function renderPartyList() {
  partyList.innerHTML = "";

  state.characters.forEach((character) => {
    const fragment = partyItemTemplate.content.cloneNode(true);
    const openButton = fragment.querySelector(".open-character");
    const meta = fragment.querySelector(".party-meta");

    openButton.textContent = character.name;
    openButton.addEventListener("click", () => {
      state.selectedCharacterId = character.id;
      saveState();
      render();
    });

    const ppe = getCharacterStat(character, "PPE")?.current ?? 0;
    const sdc = getCharacterStat(character, "SDC")?.current ?? 0;
    const mdc = getCharacterStat(character, "MDC")?.current ?? 0;
    const hp = getCharacterStat(character, "HP")?.current ?? 0;
    const isp = getCharacterStat(character, "ISP")?.current ?? 0;

    meta.textContent = `PPE ${ppe} • SDC ${sdc} • MDC ${mdc} • HP ${hp} • ISP ${isp}`;
    partyList.append(fragment);
  });
}

function queueChange(change) {
  pendingChange = change;
  logDialogContext.textContent = change.context;
  logReasonInput.value = "";
  logDialog.showModal();
  logReasonInput.focus();
}

function pushHistory(character, text, reason, delta = null) {
  const entry = {
    id: uid(),
    character: character.name,
    text,
    reason: normalizeReason(reason),
    delta,
    time: timestamp(),
  };

  character.history.unshift(entry);
  state.history.unshift(entry);
  saveState();
  render();
}

function applyDelta(character, stat, delta, optionalReason = "") {
  const before = stat.current;
  stat.current = Math.max(0, stat.current + delta);
  const appliedDelta = stat.current - before;
  pushHistory(character, `${stat.title} ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${stat.current})`, optionalReason, appliedDelta);
}

function resetToBase(character, stat) {
  const before = stat.current;
  stat.current = stat.base;
  const delta = stat.current - before;
  pushHistory(character, `${stat.title} reset to base (${stat.current})`, "Reset to base", delta);
}

function toggleCollapse(character, stat) {
  stat.collapsed = !stat.collapsed;
  saveState();
  renderStats(character);
}

function deleteStat(character, stat) {
  const isCore = CORE_STATS.some((core) => core.key === stat.key);
  if (isCore) return;

  const confirmed = window.confirm(`Delete stat block "${stat.title}"?`);
  if (!confirmed) return;

  character.stats = character.stats.filter((entry) => entry.id !== stat.id);
  pushHistory(character, `Deleted stat block: ${stat.title}`, "", 0);
}

function wireCustomAdjustment({ customAmountInput, onApply }) {
  const customButtons = customAmountInput.closest(".custom-controls").querySelectorAll("button[data-custom-action]");
  customButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Math.max(1, asInt(customAmountInput.value, 1));
      customAmountInput.value = amount;
      const signedAmount = button.dataset.customAction === "subtract" ? -amount : amount;
      onApply(signedAmount);
    });
  });
}

function renderStats(character) {
  statsGrid.innerHTML = "";

  character.stats.forEach((stat) => {
    const fragment = statRowTemplate.content.cloneNode(true);
    const label = fragment.querySelector(".stat-label");
    const headerValue = fragment.querySelector(".stat-header-value");
    const value = fragment.querySelector(".stat-value");
    const body = fragment.querySelector(".stat-body");
    const toggleButton = fragment.querySelector(".toggle-stat");
    const quickButtons = fragment.querySelectorAll(".quick-controls button[data-delta]");
    const deleteButton = fragment.querySelector(".delete-stat-block");
    const resetButton = fragment.querySelector(".reset-to-base");
    const customAmountInput = fragment.querySelector(".mod-input");

    label.textContent = stat.title;
    headerValue.textContent = `${stat.current}`;
    value.textContent = `${stat.current} (Base ${stat.base})`;

    body.hidden = stat.collapsed === true;
    toggleButton.textContent = stat.collapsed ? "▸" : "▾";
    toggleButton.addEventListener("click", () => {
      toggleCollapse(character, stat);
    });

    const isCore = CORE_STATS.some((core) => core.key === stat.key);
    deleteButton.hidden = isCore;
    deleteButton.addEventListener("click", () => {
      deleteStat(character, stat);
    });

    quickButtons.forEach((button) => {
      const buttonDelta = asInt(button.dataset.delta, 0);
      if (stat.key === "APM" && Math.abs(buttonDelta) === 5) {
        button.hidden = true;
        return;
      }

      button.addEventListener("click", () => {
        const context = `${character.name}: ${stat.title} ${buttonDelta >= 0 ? "+" : ""}${buttonDelta}`;
        if (stat.loggable === false) {
          applyDelta(character, stat, buttonDelta, "");
          return;
        }

        queueChange({
          context,
          apply: (reason) => {
            applyDelta(character, stat, buttonDelta, reason);
          },
        });
      });
    });

    resetButton.addEventListener("click", () => {
      resetToBase(character, stat);
    });

    wireCustomAdjustment({
      customAmountInput,
      onApply: (delta) => {
        const context = `${character.name}: ${stat.title} custom ${delta >= 0 ? "+" : ""}${delta}`;
        if (stat.loggable === false) {
          applyDelta(character, stat, delta, "");
          return;
        }

        queueChange({
          context,
          apply: (reason) => {
            applyDelta(character, stat, delta, reason);
          },
        });
      },
    });

    statsGrid.append(fragment);
  });
}

function renderAmmo(character) {
  ammoList.innerHTML = "";

  character.ammo.forEach((ammo) => {
    const fragment = ammoItemTemplate.content.cloneNode(true);
    const weaponName = fragment.querySelector(".weapon-name");
    const weaponValue = fragment.querySelector(".weapon-value");
    const quickButtons = fragment.querySelectorAll(".quick-controls button[data-delta]");
    const reloadButton = fragment.querySelector(".reload");
    const removeButton = fragment.querySelector(".remove-ammo");
    const customAmountInput = fragment.querySelector(".mod-input");

    weaponName.textContent = ammo.weapon;
    weaponValue.textContent = `${ammo.current}/${ammo.max}`;

    quickButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const delta = asInt(button.dataset.delta, 0);
        queueChange({
          context: `${character.name}: ammo ${ammo.weapon} ${delta >= 0 ? "+" : ""}${delta}`,
          apply: (reason) => {
            const before = ammo.current;
            ammo.current = clamp(ammo.current + delta, 0, ammo.max);
            const appliedDelta = ammo.current - before;
            pushHistory(
              character,
              `Ammo (${ammo.weapon}) ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${ammo.current}/${ammo.max})`,
              reason,
              appliedDelta
            );
          },
        });
      });
    });

    wireCustomAdjustment({
      customAmountInput,
      onApply: (delta) => {
        queueChange({
          context: `${character.name}: ammo ${ammo.weapon} custom ${delta >= 0 ? "+" : ""}${delta}`,
          apply: (reason) => {
            const before = ammo.current;
            ammo.current = clamp(ammo.current + delta, 0, ammo.max);
            const appliedDelta = ammo.current - before;
            pushHistory(
              character,
              `Ammo (${ammo.weapon}) ${appliedDelta >= 0 ? "+" : ""}${appliedDelta} (${ammo.current}/${ammo.max})`,
              reason,
              appliedDelta
            );
          },
        });
      },
    });

    reloadButton.addEventListener("click", () => {
      queueChange({
        context: `${character.name}: reload ${ammo.weapon}`,
        apply: (reason) => {
          const before = ammo.current;
          ammo.current = ammo.max;
          pushHistory(character, `Ammo (${ammo.weapon}) reloaded (${ammo.current}/${ammo.max})`, reason, ammo.current - before);
        },
      });
    });

    removeButton.addEventListener("click", () => {
      const confirmed = window.confirm(`Remove ammo tracker for ${ammo.weapon}?`);
      if (!confirmed) return;
      character.ammo = character.ammo.filter((entry) => entry.id !== ammo.id);
      pushHistory(character, `Removed ammo tracker: ${ammo.weapon}`, "System");
    });

    ammoList.append(fragment);
  });
}

function setHistoryReason(character, entryId, reason) {
  const updatedReason = normalizeReason(reason);
  const characterEntry = character.history.find((entry) => entry.id === entryId);
  if (characterEntry) characterEntry.reason = updatedReason;

  const globalEntry = state.history.find((entry) => entry.id === entryId);
  if (globalEntry) globalEntry.reason = updatedReason;

  saveState();
  renderCharacterHistory(character);
  renderGlobalHistory();
}

function renderCharacterHistory(character) {
  characterHistory.innerHTML = "";

  character.history.slice(0, 50).forEach((entry) => {
    const li = document.createElement("li");

    const line = document.createElement("p");
    line.className = "history-line";
    line.textContent = `[${entry.time}] ${entry.text} — ${normalizeReason(entry.reason)}`;

    const controls = document.createElement("div");
    controls.className = "history-edit-controls";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary";
    editButton.textContent = "Edit";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "history-edit-input";
    input.value = normalizeReason(entry.reason) === DEFAULT_EMPTY_NOTE ? "" : normalizeReason(entry.reason);
    input.hidden = true;

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.hidden = true;

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "secondary";
    cancelButton.textContent = "Cancel";
    cancelButton.hidden = true;

    editButton.addEventListener("click", () => {
      editButton.hidden = true;
      input.hidden = false;
      saveButton.hidden = false;
      cancelButton.hidden = false;
      input.focus();
    });

    saveButton.addEventListener("click", () => {
      setHistoryReason(character, entry.id, input.value);
    });

    cancelButton.addEventListener("click", () => {
      input.value = normalizeReason(entry.reason) === DEFAULT_EMPTY_NOTE ? "" : normalizeReason(entry.reason);
      input.hidden = true;
      saveButton.hidden = true;
      cancelButton.hidden = true;
      editButton.hidden = false;
    });

    controls.append(editButton, input, saveButton, cancelButton);
    li.append(line, controls);
    characterHistory.append(li);
  });
}

function renderGlobalHistory() {
  globalHistory.innerHTML = "";

  state.history.slice(0, 100).forEach((entry) => {
    const li = document.createElement("li");
    const line = document.createElement("p");
    line.className = "history-line";
    line.textContent = `[${entry.time}] ${entry.character}: ${entry.text} — ${normalizeReason(entry.reason)}`;
    li.append(line);
    globalHistory.append(li);
  });
}

function renderDetail() {
  const character = selectedCharacter();
  if (!character) {
    emptyDetail.hidden = false;
    detailPanel.hidden = true;
    return;
  }

  emptyDetail.hidden = true;
  detailPanel.hidden = false;
  detailNameInput.value = character.name;
  characterNotes.value = character.notes;
  renderStats(character);
  renderAmmo(character);
  renderCharacterHistory(character);
}

function promptForBaseStats() {
  const defaults = CORE_STATS.reduce((acc, core) => {
    acc[core.key] = core.baseFallback;
    return acc;
  }, {});

  const ppe = window.prompt("Base PPE", `${defaults.PPE}`);
  if (ppe === null) return null;
  const sdc = window.prompt("Base SDC", `${defaults.SDC}`);
  if (sdc === null) return null;
  const mdc = window.prompt("Base MDC", `${defaults.MDC}`);
  if (mdc === null) return null;
  const hp = window.prompt("Base HP", `${defaults.HP}`);
  if (hp === null) return null;
  const isp = window.prompt("Base ISP", `${defaults.ISP}`);
  if (isp === null) return null;
  const apm = window.prompt("Base Attacks per melee", `${defaults.APM}`);
  if (apm === null) return null;

  return {
    PPE: Math.max(0, asInt(ppe, defaults.PPE)),
    SDC: Math.max(0, asInt(sdc, defaults.SDC)),
    MDC: Math.max(0, asInt(mdc, defaults.MDC)),
    HP: Math.max(0, asInt(hp, defaults.HP)),
    ISP: Math.max(0, asInt(isp, defaults.ISP)),
    APM: Math.max(0, asInt(apm, defaults.APM)),
  };
}

addCharacterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = newCharacterNameInput.value.trim();
  if (!name) return;

  const baseStats = promptForBaseStats();
  if (!baseStats) return;

  const character = createCharacter(name, baseStats);
  state.characters.push(character);
  state.selectedCharacterId = character.id;
  saveState();
  render();
  addCharacterForm.reset();
});

detailNameInput.addEventListener("change", () => {
  const character = selectedCharacter();
  if (!character) return;

  const nextName = detailNameInput.value.trim();
  if (!nextName) {
    detailNameInput.value = character.name;
    return;
  }

  character.name = nextName;
  saveState();
  render();
});

characterNotes.addEventListener("input", () => {
  const character = selectedCharacter();
  if (!character) return;
  character.notes = characterNotes.value;
  saveState();
});

editBaseStatsButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) return;

  basePpeInput.value = getCharacterStat(character, "PPE")?.base ?? 0;
  baseSdcInput.value = getCharacterStat(character, "SDC")?.base ?? 0;
  baseMdcInput.value = getCharacterStat(character, "MDC")?.base ?? 0;
  baseHpInput.value = getCharacterStat(character, "HP")?.base ?? 0;
  baseIspInput.value = getCharacterStat(character, "ISP")?.base ?? 0;
  baseAttacksInput.value = getCharacterStat(character, "APM")?.base ?? 0;
  applyBaseToCurrentInput.checked = false;
  baseStatsDialog.showModal();
});

addStatBlockButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) return;

  const typeInput = window.prompt("Stat type (Custom, PPE, SDC, MDC, HP, ISP, APM)", "Custom");
  if (typeInput === null) return;

  const normalizedType = typeInput.trim().toUpperCase() || "CUSTOM";
  const allowed = ["CUSTOM", "PPE", "SDC", "MDC", "HP", "ISP", "APM"];
  const chosenType = allowed.includes(normalizedType) ? normalizedType : "CUSTOM";

  const label = window.prompt("Stat title/label", chosenType === "CUSTOM" ? "Custom Stat" : chosenType);
  if (label === null) return;

  const cleanLabel = label.trim();
  if (!cleanLabel) {
    window.alert("Stat title/label is required.");
    return;
  }

  const baseInput = window.prompt("Base value", "0");
  if (baseInput === null) return;

  const baseValue = Math.max(0, asInt(baseInput, 0));

  const stat = {
    id: uid(),
    key: chosenType === "CUSTOM" ? "" : chosenType,
    title: cleanLabel,
    base: baseValue,
    current: baseValue,
    collapsed: false,
    loggable: chosenType !== "APM",
  };

  character.stats.push(stat);
  saveState();
  render();
});

baseStatsForm.addEventListener("submit", (event) => {
  const submitButton = event.submitter;
  if (!submitButton || submitButton.value !== "confirm") return;

  event.preventDefault();
  const character = selectedCharacter();
  if (!character) {
    baseStatsDialog.close();
    return;
  }

  const nextBase = {
    PPE: Math.max(0, asInt(basePpeInput.value, getCharacterStat(character, "PPE")?.base ?? 0)),
    SDC: Math.max(0, asInt(baseSdcInput.value, getCharacterStat(character, "SDC")?.base ?? 0)),
    MDC: Math.max(0, asInt(baseMdcInput.value, getCharacterStat(character, "MDC")?.base ?? 0)),
    HP: Math.max(0, asInt(baseHpInput.value, getCharacterStat(character, "HP")?.base ?? 0)),
    ISP: Math.max(0, asInt(baseIspInput.value, getCharacterStat(character, "ISP")?.base ?? 0)),
    APM: Math.max(0, asInt(baseAttacksInput.value, getCharacterStat(character, "APM")?.base ?? 0)),
  };

  Object.entries(nextBase).forEach(([key, value]) => {
    const stat = getCharacterStat(character, key);
    if (!stat) return;
    stat.base = value;
    if (applyBaseToCurrentInput.checked) {
      stat.current = value;
    }
  });

  saveState();
  render();
  baseStatsDialog.close();
});

deleteCharacterButton.addEventListener("click", () => {
  const character = selectedCharacter();
  if (!character) return;

  const confirmed = window.confirm(`Delete ${character.name}? This cannot be undone.`);
  if (!confirmed) return;

  state.characters = state.characters.filter((entry) => entry.id !== character.id);
  if (state.selectedCharacterId === character.id) {
    state.selectedCharacterId = state.characters[0]?.id || null;
  }
  saveState();
  render();
});

addAmmoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const character = selectedCharacter();
  if (!character) return;

  const weapon = ammoWeaponInput.value.trim();
  const max = Math.max(1, asInt(ammoMaxInput.value, 1));
  if (!weapon) return;

  character.ammo.push({ id: uid(), weapon, current: max, max });
  pushHistory(character, `Added ammo tracker: ${weapon} (${max}/${max})`, "System");
  addAmmoForm.reset();
  ammoMaxInput.value = "20";
});

logDialogForm.addEventListener("submit", (event) => {
  const submitButton = event.submitter;
  if (!submitButton || submitButton.value !== "confirm") {
    pendingChange = null;
    return;
  }

  event.preventDefault();
  if (!pendingChange) {
    logDialog.close();
    return;
  }

  const reason = logReasonInput.value;
  pendingChange.apply(reason);
  pendingChange = null;
  logDialog.close();
});

exportButton.addEventListener("click", () => {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rifts-dashboard-export-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

importTriggerButton.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;

  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    window.alert("Invalid JSON file.");
    return;
  }

  const confirmed = window.confirm("Importing will overwrite current dashboard data. Continue?");
  if (!confirmed) return;

  if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.history)) {
    window.alert("JSON does not match expected dashboard export format.");
    return;
  }

  sanitizeForDisplay(parsed);
  state.characters = parsed.characters;
  state.selectedCharacterId = parsed.selectedCharacterId || parsed.characters[0]?.id || null;
  state.history = parsed.history;
  saveState();
  render();
  importFileInput.value = "";
});

resetDataButton.addEventListener("click", () => {
  const firstConfirm = window.confirm("This will erase all saved dashboard data. Continue?");
  if (!firstConfirm) return;

  const typed = window.prompt('Type RESET to permanently clear all data.');
  if (typed !== "RESET") return;

  state.characters = [];
  state.selectedCharacterId = null;
  state.history = [];
  localStorage.removeItem(STORAGE_KEY);
  saveState();
  render();
});

if (!state.selectedCharacterId && state.characters.length > 0) {
  state.selectedCharacterId = state.characters[0].id;
}

saveState();
render();
