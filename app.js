const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DEPARTMENT_ALIASES = {
  "computer science": "cse",
  cs: "cse",
  cse: "cse",
  electronics: "ece",
  ece: "ece",
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
  return text.toLowerCase().replaceAll("'", "").replace(/[?!.]/g, " ").replace(/\s+/g, " ").trim();
}

function detectDepartment(message) {
  return Object.entries(DEPARTMENT_ALIASES).find(([alias]) => message.includes(alias))?.[1] || null;
}

function detectSessionType(message) {
  if (message.includes("lab") || message.includes("practical")) return "lab";
  if (message.includes("library")) return "library";
  if (message.includes("remedial")) return "remedial";
  if (message.includes("mentor")) return "mentoring";
  if (message.includes("life skill")) return "life skills";
  if (message.includes("lecture")) return "lecture";
  return null;
}

function detectDay(message) {
  const now = new Date();
  if (message.includes("today")) {
    return DAYS[(now.getDay() + 6) % 7];
  }
  if (message.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return DAYS[(tomorrow.getDay() + 6) % 7];
  }
  return DAYS.find((day) => message.includes(day)) || null;
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
  return courses.find((course) => message.includes(course) || compactMessage.includes(course.replaceAll(" ", ""))) || null;
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
  if (message.includes("next") || message.includes("upcoming") || message.startsWith("when")) {
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
    return {
      text: "I could not find a matching class. Try adding a day, group, course code, or lab/lecture.",
      sessions: [],
      examples: ["show Tuesday classes", "next group 1 lab", "when is CSE2201"],
    };
  }

  const answerSessions = selectAnswerSessions(question, matches);
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
