from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class ClassSession:
    department: str
    section: str
    semester: str
    group: str
    course: str
    session_type: str
    day: str
    start: time
    end: time
    room: str
    faculty: str


DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


SCHEDULE_FILE = Path(__file__).with_name("schedules.csv")


DEFAULT_SCHEDULES = [
    ClassSession("cse", "c", "4", "all", "CSE2201", "lecture", "tuesday", time(9, 0), time(10, 0), "ICT312", "NGB"),
    ClassSession("cse", "c", "4", "1", "CSE2252", "lab", "monday", time(13, 0), time(15, 0), "ICTB10", "AD+SA"),
    ClassSession("cse", "c", "4", "2", "CSE2251", "lab", "monday", time(13, 0), time(15, 0), "ICTB11", "NGB+SMK"),
]


DEPARTMENT_ALIASES = {
    "computer science": "cse",
    "cs": "cse",
    "cse": "cse",
    "electronics": "ece",
    "ece": "ece",
}

DAY_ALIASES = {
    "today": "today",
    "tody": "today",
    "tomorrow": "tomorrow",
    "tommorow": "tomorrow",
    "tmrw": "tomorrow",
    "tmw": "tomorrow",
    "monday": "monday",
    "mon": "monday",
    "tuesday": "tuesday",
    "tue": "tuesday",
    "tues": "tuesday",
    "wednesday": "wednesday",
    "wed": "wednesday",
    "thursday": "thursday",
    "thu": "thursday",
    "thurs": "thursday",
    "friday": "friday",
    "fri": "friday",
    "saturday": "saturday",
    "sat": "saturday",
    "sunday": "sunday",
    "sun": "sunday",
}

SESSION_TYPE_ALIASES = {
    "lab": "lab",
    "labs": "lab",
    "practical": "lab",
    "practicals": "lab",
    "experiment": "lab",
    "experiments": "lab",
    "keyboard": "lab",
    "computer": "lab",
    "coding": "lab",
    "lecture": "lecture",
    "lectures": "lecture",
    "class": None,
    "classes": None,
    "period": None,
    "periods": None,
    "subject": None,
    "subjects": None,
    "library": "library",
    "remedial": "remedial",
    "mentor": "mentoring",
    "mentoring": "mentoring",
    "life skill": "life skills",
    "life skills": "life skills",
}


def parse_time(value: str) -> time:
    return datetime.strptime(value.strip(), "%H:%M").time()


def load_schedules() -> list[ClassSession]:
    if not SCHEDULE_FILE.exists():
        return DEFAULT_SCHEDULES

    sessions: list[ClassSession] = []
    with SCHEDULE_FILE.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            sessions.append(
                ClassSession(
                    department=row["department"].strip().lower(),
                    section=row.get("section", "").strip().lower(),
                    semester=row["semester"].strip(),
                    group=row.get("group", "all").strip().lower() or "all",
                    course=row["course"].strip(),
                    session_type=row["session_type"].strip().lower(),
                    day=row["day"].strip().lower(),
                    start=parse_time(row["start"]),
                    end=parse_time(row["end"]),
                    room=row["room"].strip(),
                    faculty=row["faculty"].strip(),
                )
            )

    return sessions


def normalize(text: str) -> str:
    return (
        " ".join(
            text.lower()
            .replace("'", "")
            .replace("&", " and ")
            .replace("w/", "with ")
            .replace("?", " ")
            .replace("!", " ")
            .replace(".", " ")
            .split()
        )
        .replace(" w ", " with ")
    )


def words_from(message: str) -> list[str]:
    return [word for word in message.split() if word.isalnum()]


def edit_distance(left: str, right: str) -> int:
    costs = list(range(len(right) + 1))

    for i, left_char in enumerate(left, start=1):
        previous = costs[0]
        costs[0] = i
        for j, right_char in enumerate(right, start=1):
            current = costs[j]
            if left_char == right_char:
                costs[j] = previous
            else:
                costs[j] = min(previous + 1, costs[j] + 1, costs[j - 1] + 1)
            previous = current

    return costs[-1]


def fuzzy_find(words: list[str], candidates: Iterable[str], max_distance: int = 1) -> str | None:
    for candidate in candidates:
        if any(len(word) > 2 and edit_distance(word, candidate) <= max_distance for word in words):
            return candidate
    return None


def detect_department(message: str) -> str | None:
    words = words_from(message)
    for alias, department in DEPARTMENT_ALIASES.items():
        if (len(alias) <= 3 and alias in words) or (len(alias) > 3 and alias in message):
            return department

    fuzzy = fuzzy_find(words, DEPARTMENT_ALIASES.keys())
    return DEPARTMENT_ALIASES[fuzzy] if fuzzy else None


def detect_session_type(message: str) -> str | None:
    for alias, session_type in SESSION_TYPE_ALIASES.items():
        if alias in message:
            return session_type

    fuzzy = fuzzy_find(words_from(message), [alias for alias in SESSION_TYPE_ALIASES if " " not in alias])
    return SESSION_TYPE_ALIASES[fuzzy] if fuzzy else None


def detect_day(message: str) -> str | None:
    words = words_from(message)
    direct = next((DAY_ALIASES[alias] for alias in DAY_ALIASES if alias in words or alias in message), None)
    fuzzy = direct or fuzzy_find(words, DAY_ALIASES.keys(), 1)
    day = DAY_ALIASES.get(fuzzy, fuzzy)

    if day == "today":
        return datetime.now().strftime("%A").lower()
    if day == "tomorrow":
        return (datetime.now() + timedelta(days=1)).strftime("%A").lower()

    return day if day in DAYS else None


def detect_semester(message: str) -> str | None:
    words = message.split()
    for index, word in enumerate(words):
        if word in {"sem", "semester"} and index + 1 < len(words):
            if words[index + 1].isdigit():
                return words[index + 1]
        if word.endswith(("st", "nd", "rd", "th")) and word[:-2].isdigit():
            return word[:-2]
    return None


def detect_group(message: str) -> str | None:
    words = message.replace(".", " ").split()
    for index, word in enumerate(words):
        if word in {"group", "gr"} and index + 1 < len(words):
            if words[index + 1].isdigit():
                return words[index + 1]
        if word.startswith("gr") and word[2:].isdigit():
            return word[2:]
    return None


def detect_course(message: str, sessions: Iterable[ClassSession]) -> str | None:
    compact_message = message.replace(" ", "")
    courses = sorted({session.course.lower() for session in sessions}, key=len, reverse=True)
    for course in courses:
        if course in message or course.replace(" ", "") in compact_message:
            return course

    return fuzzy_find(words_from(message), [course.replace(" ", "") for course in courses], 1)


def wants_availability(message: str) -> bool:
    return any(
        phrase in message
        for phrase in (
            "do i have",
            "i have",
            "have to",
            "have class",
            "any class",
            "any lab",
            "am i free",
            "free tomorrow",
            "free today",
        )
    )


def is_only_small_talk(message: str, terms: set[str]) -> bool:
    words = words_from(message)
    return bool(words) and all(word in terms for word in words)


def conversational_reply(message: str) -> str | None:
    greeting_words = {"hi", "hello", "hey", "yo", "sup", "namaste"}
    thanks_words = {"thanks", "thank", "thankyou", "ty", "thx"}
    bye_words = {"bye", "goodbye", "cya", "see", "later"}

    if any(
        phrase in message
        for phrase in (
            "owner",
            "creator",
            "made you",
            "built you",
            "who made",
            "who is aryan",
        )
    ):
        return (
            "I was crafted by Aryan for HIT students, so timetable questions do not have to feel "
            "like decoding a spreadsheet."
        )

    if "your name" in message or "who are you" in message:
        return "I am hit.bot, your HIT timetable assistant. Ask me naturally and I will check the schedule for you."

    if is_only_small_talk(message, greeting_words):
        return "Hey! Ask me anything about the timetable. I can handle normal wording, typos, course codes, groups, and days."

    words = words_from(message)
    if any(word in thanks_words for word in words) and len(words) <= 4:
        return "Anytime. Timetable chaos is exactly what I am here for."

    if is_only_small_talk(message, bye_words):
        return "See you. Come back when the timetable starts acting mysterious again."

    if "love you" in message or "you are good" in message or "nice bot" in message:
        return "That is kind. I will stay useful and keep the timetable answers clean."

    return None


def minutes_since_week_start(day: str, start: time) -> int:
    return DAYS.index(day) * 24 * 60 + start.hour * 60 + start.minute


def current_week_minute() -> int:
    now = datetime.now()
    day = now.strftime("%A").lower()
    return DAYS.index(day) * 24 * 60 + now.hour * 60 + now.minute


def filter_sessions(message: str, sessions: Iterable[ClassSession]) -> list[ClassSession]:
    department = detect_department(message)
    session_type = detect_session_type(message)
    day = detect_day(message)
    semester = detect_semester(message)
    group = detect_group(message)
    all_sessions = list(sessions)
    course = detect_course(message, all_sessions)

    matches = all_sessions
    if department:
        matches = [session for session in matches if session.department == department]
    if session_type:
        matches = [session for session in matches if session.session_type == session_type]
    if day:
        matches = [session for session in matches if session.day == day]
    if semester:
        matches = [session for session in matches if session.semester == semester]
    if group:
        matches = [session for session in matches if session.group in {group, "all"}]
    if course:
        matches = [session for session in matches if session.course.lower() == course]

    return sorted(matches, key=lambda session: (DAYS.index(session.day), session.start))


def next_session(sessions: Iterable[ClassSession]) -> ClassSession | None:
    now_minutes = current_week_minute()
    sorted_sessions = sorted(sessions, key=lambda session: minutes_since_week_start(session.day, session.start))

    for session in sorted_sessions:
        if minutes_since_week_start(session.day, session.start) >= now_minutes:
            return session

    return sorted_sessions[0] if sorted_sessions else None


def format_session(session: ClassSession) -> str:
    start = session.start.strftime("%I:%M %p").lstrip("0")
    end = session.end.strftime("%I:%M %p").lstrip("0")
    section = f" section {session.section.upper()}" if session.section else ""
    group = "all groups" if session.group == "all" else f"group {session.group}"
    title = session.course
    if session.course.lower() != session.session_type:
        title = f"{session.course} {session.session_type}"
    faculty = "" if session.faculty == "-" else f" Faculty: {session.faculty}."
    return (
        f"{title} for {session.department.upper()}{section} semester {session.semester} {group} "
        f"is on {session.day.title()} from {start} to {end} in {session.room}.{faculty}"
    )


def answer_question(question: str, schedules: Iterable[ClassSession]) -> str:
    message = normalize(question)
    conversation = conversational_reply(message)
    if conversation:
        return conversation

    if message in {"help", "commands"}:
        return (
            "Try questions like: 'When is the next lab of CSE dept?', "
            "'Show CSE classes on Tuesday', or 'next CSE group 2 lab'."
        )

    matches = filter_sessions(message, schedules)

    if not matches:
        if wants_availability(message):
            return "Looks free from the timetable I have. I found no matching sessions for that question."
        return "I could not find a matching class. Try mentioning department, day, semester, or lab/lecture."

    if "next" in message or "upcoming" in message or "when" in message or message.startswith(("wen", "whn")):
        session = next_session(matches)
        return format_session(session) if session else "No upcoming matching class found."

    if wants_availability(message):
        sessions = "\n".join(format_session(session) for session in matches)
        label = "session" if len(matches) == 1 else "sessions"
        return f"Yes, I found {len(matches)} matching {label}.\n{sessions}"

    return "\n".join(format_session(session) for session in matches)


def main() -> None:
    schedules = load_schedules()
    print("hit.bot")
    print("Ask about class schedules. Type 'help' for examples or 'exit' to stop.")
    print(f"Loaded {len(schedules)} sessions from {SCHEDULE_FILE.name}.")

    while True:
        question = input("\nYou: ").strip()
        if normalize(question) in {"exit", "quit", "bye"}:
            print("Bot: Bye!")
            break

        print(f"Bot: {answer_question(question, schedules)}")


if __name__ == "__main__":
    main()
