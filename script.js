const STAT_TYPES = ["PPE", "MDC", "SDC", "HP", "Ammunition"];

const resourceForm = document.querySelector("#resource-form");
const resourceTypeSelect = document.querySelector("#resource-type");
const resourceLabelInput = document.querySelector("#resource-label");
const resourceMaxInput = document.querySelector("#resource-max");
const statSections = document.querySelector("#stat-sections");
const actionLogOutput = document.querySelector("#action-log-output");
const encounterNotes = document.querySelector("#session-notes");
const clearLogButton = document.querySelector("#clear-log");
const clearNotesButton = document.querySelector("#clear-notes");

const statGroupTemplate = document.querySelector("#stat-group-template");
const resourceTemplate = document.querySelector("#resource-template");

const logs = [];
const groupGrids = new Map();

const asNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const timestamp = () => new Date().toLocaleTimeString();

const toColloquial = ({ type, title, delta, reason, current, max }) => {
  const changeWord = delta < 0 ? "lost" : "gained";
  const amount = Math.abs(delta);
  const because = reason ? ` after ${reason}` : "";
  return `${type} ${title} ${changeWord} ${amount}${because}. It is now ${current}/${max}.`;
};

const pushLog = (entry) => {
  logs.unshift(entry);
  actionLogOutput.value = logs.join("\n");
};

const logAdjustment = ({ type, title, delta, reason, current, max }) => {
  const sign = delta > 0 ? "+" : "";
  const because = reason ? ` | Reason: ${reason}` : "";
  const line = `[${timestamp()}] ${type} • ${title}: ${sign}${delta} => ${current}/${max}${because}`;
  pushLog(line);
  encounterNotes.value += `${encounterNotes.value ? "\n" : ""}${toColloquial({
    type,
    title,
    delta,
    reason,
    current,
    max,
  })}`;
};

const createResourceCard = ({ type, label = "Base", max = 50, current = max }) => {
  const fragment = resourceTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".stat-card");
  const titleInput = fragment.querySelector(".section-title");
  const currentOutput = fragment.querySelector(".stat-current");
  const maxInput = fragment.querySelector(".max-input");
  const removeButton = fragment.querySelector(".remove-resource");
  const resetButton = fragment.querySelector(".reset");
  const changeButtons = fragment.querySelectorAll(".change");

  titleInput.value = label;
  maxInput.value = max;

  const updateCurrentText = () => {
    const statMax = Math.max(0, asNumber(maxInput.value));
    maxInput.value = statMax;
    current = Math.min(Math.max(0, current), statMax);
    currentOutput.textContent = `${type}: ${current}/${statMax}`;
  };

  maxInput.addEventListener("input", updateCurrentText);

  changeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const delta = asNumber(button.dataset.action);
      const notePrompt = window.prompt(
        `Why did ${type} ${titleInput.value} change by ${delta}?`,
        ""
      );

      if (notePrompt === null) {
        return;
      }

      const statMax = Math.max(0, asNumber(maxInput.value));
      current = Math.min(Math.max(0, current + delta), statMax);
      updateCurrentText();

      logAdjustment({
        type,
        title: titleInput.value.trim() || "Untitled",
        delta,
        reason: notePrompt.trim(),
        current,
        max: statMax,
      });
    });
  });

  resetButton.addEventListener("click", () => {
    const statMax = Math.max(0, asNumber(maxInput.value));
    current = statMax;
    updateCurrentText();
    logAdjustment({
      type,
      title: titleInput.value.trim() || "Untitled",
      delta: 0,
      reason: "reset to max",
      current,
      max: statMax,
    });
  });

  removeButton.addEventListener("click", () => {
    card.remove();
    pushLog(`[${timestamp()}] ${type} • ${titleInput.value || "Untitled"}: removed section.`);
  });

  updateCurrentText();
  return fragment;
};

const addSection = (type, options = {}) => {
  const grid = groupGrids.get(type);
  if (!grid) {
    return;
  }

  const card = createResourceCard({ type, ...options });
  grid.append(card);
};

const createStatGroups = () => {
  STAT_TYPES.forEach((type) => {
    const fragment = statGroupTemplate.content.cloneNode(true);
    const group = fragment.querySelector(".stat-group");
    const title = fragment.querySelector(".group-title");
    const addSectionButton = fragment.querySelector(".add-section");
    const groupGrid = fragment.querySelector(".group-grid");

    title.textContent = type;
    addSectionButton.addEventListener("click", () => {
      addSection(type, { label: `${type} Section`, max: 50, current: 50 });
    });

    group.dataset.type = type;
    groupGrids.set(type, groupGrid);
    statSections.append(fragment);

    addSection(type, { label: "Base", max: 50, current: 50 });
  });
};

resourceForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const type = resourceTypeSelect.value;
  const label = resourceLabelInput.value.trim() || `${type} Section`;
  const max = Math.max(0, asNumber(resourceMaxInput.value));

  addSection(type, { label, max, current: max });
  pushLog(`[${timestamp()}] ${type} • ${label}: added section (${max}/${max}).`);

  resourceLabelInput.value = "";
});

clearLogButton.addEventListener("click", () => {
  logs.length = 0;
  actionLogOutput.value = "";
});

clearNotesButton.addEventListener("click", () => {
  encounterNotes.value = "";
});

STAT_TYPES.forEach((type) => {
  const option = document.createElement("option");
  option.value = type;
  option.textContent = type;
  resourceTypeSelect.append(option);
});

createStatGroups();
