const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DEPARTMENT_ALIASES = {
  "computer science": "cse",
  cs: "cse",
  cse: "cse",
  electronics: "ece",
  ece: "ece",
};

const DAY_ALIASES = {
  today: "today",
  tody: "today",
  tomorrow: "tomorrow",
  tommorow: "tomorrow",
  tmrw: "tomorrow",
  tmw: "tomorrow",
  monday: "monday",
  mon: "monday",
  tuesday: "tuesday",
  tue: "tuesday",
  tues: "tuesday",
  wednesday: "wednesday",
  wed: "wednesday",
  thursday: "thursday",
  thu: "thursday",
  thurs: "thursday",
  friday: "friday",
  fri: "friday",
  saturday: "saturday",
  sat: "saturday",
  sunday: "sunday",
  sun: "sunday",
};

const SESSION_TYPE_ALIASES = {
  lab: "lab",
  labs: "lab",
  practical: "lab",
  practicals: "lab",
  experiment: "lab",
  experiments: "lab",
  keyboard: "lab",
  computer: "lab",
  coding: "lab",
  lecture: "lecture",
  lectures: "lecture",
  class: null,
  classes: null,
  period: null,
  periods: null,
  subject: null,
  subjects: null,
  library: "library",
  remedial: "remedial",
  mentor: "mentoring",
  mentoring: "mentoring",
  "life skill": "life skills",
  "life skills": "life skills",
};

const messages = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#questionInput");
const sessionCount = document.querySelector("#sessionCount");
const clearChat = document.querySelector("#clearChat");
const promptChips = document.querySelectorAll(".prompt-chip");

let schedules = [];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), (record[index] || "").trim()]))
  );
}

function normalize(text) {
  return text
    .toLowerCase()
    .replaceAll("'", "")
    .replaceAll("&", " and ")
    .replace(/\bw\//g, "with ")
    .replace(/\bw\b/g, "with")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsFrom(message) {
  return message.match(/[a-z0-9]+/g) || [];
}

function editDistance(left, right) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    let previous = costs[0];
    costs[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = costs[j];
      costs[j] =
        left[i - 1] === right[j - 1]
          ? previous
          : Math.min(previous + 1, costs[j] + 1, costs[j - 1] + 1);
      previous = current;
    }
  }

  return costs[right.length];
}

function fuzzyFind(words, candidates, maxDistance = 1) {
  return candidates.find((candidate) =>
    words.some((word) => word.length > 2 && editDistance(word, candidate) <= maxDistance)
  );
}

function detectDepartment(message) {
  const words = wordsFrom(message);
  const direct = Object.entries(DEPARTMENT_ALIASES).find(([alias]) =>
    alias.length <= 3 ? words.includes(alias) : message.includes(alias)
  )?.[1];
  if (direct) return direct;

  const fuzzy = fuzzyFind(words, Object.keys(DEPARTMENT_ALIASES));
  return fuzzy ? DEPARTMENT_ALIASES[fuzzy] : null;
}

function detectSessionType(message) {
  const direct = Object.entries(SESSION_TYPE_ALIASES).find(([alias]) => message.includes(alias));
  if (direct) return direct[1];

  const fuzzy = fuzzyFind(wordsFrom(message), Object.keys(SESSION_TYPE_ALIASES).filter((alias) => !alias.includes(" ")));
  return fuzzy ? SESSION_TYPE_ALIASES[fuzzy] : null;
}

function detectDay(message) {
  const now = new Date();
  const words = wordsFrom(message);
  const direct = Object.entries(DAY_ALIASES).find(([alias]) => words.includes(alias) || message.includes(alias))?.[1];
  const fuzzy = direct || fuzzyFind(words, Object.keys(DAY_ALIASES), 1);
  const day = DAY_ALIASES[fuzzy] || fuzzy;

  if (day === "today") {
    return DAYS[(now.getDay() + 6) % 7];
  }
  if (day === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return DAYS[(tomorrow.getDay() + 6) % 7];
  }
  return DAYS.includes(day) ? day : null;
}

function detectSemester(message) {
  const words = message.split(" ");
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if ((word === "sem" || word === "semester") && /^\d+$/.test(words[index + 1] || "")) {
      return words[index + 1];
    }
    const ordinal = word.match(/^(\d+)(st|nd|rd|th)$/);
    if (ordinal) {
      return ordinal[1];
    }
  }
  return null;
}

function detectGroup(message) {
  const words = message.replaceAll(".", " ").split(" ");
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if ((word === "group" || word === "gr") && /^\d+$/.test(words[index + 1] || "")) {
      return words[index + 1];
    }
    const compact = word.match(/^gr(\d+)$/);
    if (compact) {
      return compact[1];
    }
  }
  return null;
}

function detectCourse(message, sessions) {
  const compactMessage = message.replaceAll(" ", "");
  const courses = [...new Set(sessions.map((session) => session.course.toLowerCase()))].sort(
    (a, b) => b.length - a.length
  );
  const direct = courses.find((course) => message.includes(course) || compactMessage.includes(course.replaceAll(" ", "")));
  if (direct) return direct;

  return fuzzyFind(wordsFrom(message), courses.map((course) => course.replaceAll(" ", "")), 1);
}

function wantsAvailability(message) {
  return (
    message.includes("do i have") ||
    message.includes("i have") ||
    message.includes("have to") ||
    message.includes("have class") ||
    message.includes("any class") ||
    message.includes("any lab") ||
    message.includes("am i free") ||
    message.includes("free tomorrow") ||
    message.includes("free today")
  );
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function sessionWeekMinute(session) {
  return DAYS.indexOf(session.day) * 24 * 60 + timeToMinutes(session.start);
}

function currentWeekMinute() {
  const now = new Date();
  const day = DAYS[(now.getDay() + 6) % 7];
  return DAYS.indexOf(day) * 24 * 60 + now.getHours() * 60 + now.getMinutes();
}

function formatTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function filterSessions(question) {
  const message = normalize(question);
  const department = detectDepartment(message);
  const sessionType = detectSessionType(message);
  const day = detectDay(message);
  const semester = detectSemester(message);
  const group = detectGroup(message);
  const course = detectCourse(message, schedules);

  return schedules
    .filter((session) => !department || session.department === department)
    .filter((session) => !sessionType || session.session_type === sessionType)
    .filter((session) => !day || session.day === day)
    .filter((session) => !semester || session.semester === semester)
    .filter((session) => !group || session.group === group || session.group === "all")
    .filter((session) => !course || session.course.toLowerCase() === course)
    .sort((a, b) => sessionWeekMinute(a) - sessionWeekMinute(b));
}

function selectAnswerSessions(question, matches) {
  const message = normalize(question);
  if (
    message.includes("next") ||
    message.includes("upcoming") ||
    message.startsWith("when") ||
    message.startsWith("wen") ||
    message.startsWith("whn") ||
    message.includes("when is") ||
    message.includes("whens")
  ) {
    const now = currentWeekMinute();
    return [matches.find((session) => sessionWeekMinute(session) >= now) || matches[0]].filter(Boolean);
  }
  return matches;
}

function sessionTitle(session) {
  if (session.course.toLowerCase() === session.session_type) {
    return session.course;
  }
  return `${session.course} ${session.session_type}`;
}

function sessionDescription(session) {
  const section = session.section ? ` section ${session.section.toUpperCase()}` : "";
  const group = session.group === "all" ? "all groups" : `group ${session.group}`;
  const faculty = session.faculty && session.faculty !== "-" ? ` Faculty: ${session.faculty}.` : "";
  return `${sessionTitle(session)} for ${session.department.toUpperCase()}${section} semester ${session.semester} ${group} is on ${capitalize(
    session.day
  )} from ${formatTime(session.start)} to ${formatTime(session.end)} in ${session.room}.${faculty}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function answerQuestion(question) {
  const message = normalize(question);
  if (message === "help" || message === "commands") {
    return {
      text: "Try questions like these:",
      sessions: [],
      examples: ["next CSE group 2 lab", "show Monday classes", "when is CSE2203", "when is library for group 1"],
    };
  }

  const matches = filterSessions(question);
  if (!matches.length) {
    if (wantsAvailability(message)) {
      return {
        text: "Looks free from the timetable I have. I found no matching sessions for that question.",
        sessions: [],
        examples: [],
      };
    }

    return {
      text: "I could not find a matching class. Try adding a day, group, course code, or lab/lecture.",
      sessions: [],
      examples: ["show Tuesday classes", "next group 1 lab", "when is CSE2201"],
    };
  }

  const answerSessions = selectAnswerSessions(question, matches);
  if (wantsAvailability(message)) {
    return {
      text: `Yes, I found ${answerSessions.length} matching session${answerSessions.length === 1 ? "" : "s"}.`,
      sessions: answerSessions,
      examples: [],
    };
  }

  return {
    text: answerSessions.length === 1 ? sessionDescription(answerSessions[0]) : `I found ${answerSessions.length} matching sessions.`,
    sessions: answerSessions.length === 1 ? [] : answerSessions,
    examples: [],
  };
}

function addMessage(role, content) {
  const row = document.createElement("article");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const text = document.createElement("p");
  text.textContent = typeof content === "string" ? content : content.text;
  bubble.append(text);

  if (typeof content !== "string" && content.sessions.length) {
    const list = document.createElement("div");
    list.className = "result-list";
    content.sessions.forEach((session) => {
      const card = document.createElement("div");
      card.className = "session-card";

      const title = document.createElement("strong");
      title.textContent = sessionTitle(session);

      const meta = document.createElement("div");
      meta.className = "session-meta";
      meta.textContent = `${capitalize(session.day)} · ${formatTime(session.start)}-${formatTime(session.end)} · ${
        session.group === "all" ? "All groups" : `Group ${session.group}`
      } · ${session.room}`;

      card.append(title, meta);
      list.append(card);
    });
    bubble.append(list);
  }

  if (typeof content !== "string" && content.examples.length) {
    const list = document.createElement("div");
    list.className = "result-list";
    content.examples.forEach((example) => {
      const chip = document.createElement("button");
      chip.className = "prompt-chip";
      chip.type = "button";
      chip.textContent = example;
      chip.addEventListener("click", () => ask(example));
      list.append(chip);
    });
    bubble.append(list);
  }

  row.append(avatar, bubble);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
}

function ask(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) return;
  addMessage("user", cleanQuestion);
  addMessage("assistant", answerQuestion(cleanQuestion));
  input.value = "";
  resizeInput();
  input.focus();
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

async function loadSchedules() {
  const response = await fetch("schedules.csv");
  if (!response.ok) {
    throw new Error("Could not load schedules.csv");
  }
  schedules = parseCsv(await response.text()).map((session) => ({
    ...session,
    department: session.department.toLowerCase(),
    section: session.section.toLowerCase(),
    group: session.group.toLowerCase() || "all",
    session_type: session.session_type.toLowerCase(),
    day: session.day.toLowerCase(),
  }));
  sessionCount.textContent = String(schedules.length);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

clearChat.addEventListener("click", () => {
  messages.replaceChildren();
  addMessage("assistant", {
    text: "Chat cleared. Ask me about lectures, labs, library slots, course codes, or groups.",
    sessions: [],
    examples: [],
  });
});

promptChips.forEach((chip) => {
  chip.addEventListener("click", () => ask(chip.textContent));
});

loadSchedules()
  .then(() => {
    addMessage("assistant", {
      text: "Hi! I can answer timetable questions for CSE Section C. Ask naturally, like 'next group 2 lab' or 'when is CSE2203'.",
      sessions: [],
      examples: [],
    });
  })
  .catch(() => {
    sessionCount.textContent = "0";
    addMessage("assistant", {
      text: "I could not load the timetable. Please make sure schedules.csv is in the same folder as this website.",
      sessions: [],
      examples: [],
    });
  });
