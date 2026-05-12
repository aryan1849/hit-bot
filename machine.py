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
    return " ".join(text.lower().replace("'", "").replace("?", "").split())


def detect_department(message: str) -> str | None:
    for alias, department in DEPARTMENT_ALIASES.items():
        if alias in message:
            return department
    return None


def detect_session_type(message: str) -> str | None:
    if "lab" in message or "practical" in message:
        return "lab"
    if "library" in message:
        return "library"
    if "remedial" in message:
        return "remedial"
    if "mentor" in message:
        return "mentoring"
    if "life skill" in message:
        return "life skills"
    if "lecture" in message:
        return "lecture"
    return None


def detect_day(message: str) -> str | None:
    if "today" in message:
        return datetime.now().strftime("%A").lower()
    if "tomorrow" in message:
        return (datetime.now() + timedelta(days=1)).strftime("%A").lower()

    for day in DAYS:
        if day in message:
            return day
    return None


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

    if message in {"help", "commands"}:
        return (
            "Try questions like: 'When is the next lab of CSE dept?', "
            "'Show CSE classes on Tuesday', or 'next CSE group 2 lab'."
        )

    matches = filter_sessions(message, schedules)

    if not matches:
        return "I could not find a matching class. Try mentioning department, day, semester, or lab/lecture."

    if "next" in message or "upcoming" in message or "when" in message:
        session = next_session(matches)
        return format_session(session) if session else "No upcoming matching class found."

    return "\n".join(format_session(session) for session in matches)


def main() -> None:
    schedules = load_schedules()
    print("College Schedule Chatbot")
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
