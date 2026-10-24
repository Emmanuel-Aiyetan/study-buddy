import test from "node:test";
import assert from "node:assert/strict";
import { adaptSchedule, analytics, addDays, calendarFile, type Task } from "../lib/planning.ts";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, title: id, description: null, scheduled_date: "2026-10-20", estimated_minutes: 30, completed: false, completed_at: null, ...overrides };
}
test("adaptive schedule preserves completed tasks and fits daily capacity", () => {
  const tasks = [task("a"), task("b"), task("c"), task("done", { completed: true })];
  assert.deepEqual(adaptSchedule(tasks, "2026-10-23", "2026-10-25", 1), [
    { id: "a", scheduled_date: "2026-10-23" }, { id: "b", scheduled_date: "2026-10-23" }, { id: "c", scheduled_date: "2026-10-24" },
  ]);
  assert.equal(tasks[0].scheduled_date, "2026-10-20");
});
test("impossible schedules explain the needed change", () => {
  assert.throws(() => adaptSchedule([task("long", { estimated_minutes: 90 })], "2026-10-23", "2026-10-23", 1), /Increase/);
  assert.throws(() => adaptSchedule([task("a"), task("b"), task("c")], "2026-10-23", "2026-10-23", 1), /Extend/);
  assert.throws(() => adaptSchedule([], "2026-10-23", "2026-10-22", 1));
  assert.throws(() => adaptSchedule([], "2026-10-23", "2026-10-24", NaN));
});
test("completed tasks still consume their scheduled day's capacity", () => {
  const result = adaptSchedule([task("done", { completed: true, scheduled_date: "2026-10-23", estimated_minutes: 60 }), task("pending")], "2026-10-23", "2026-10-24", 1);
  assert.equal(result[0].scheduled_date, "2026-10-24");
});
test("calendar arithmetic crosses daylight saving and year boundaries", () => {
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("streaks use local completion days, deduplicate days, and allow yesterday", () => {
  const done = (id: string, date: string) => task(id, { completed: true, completed_at: `${date}T12:00:00` });
  const data = analytics([done("a", "2026-10-21"), done("b", "2026-10-22"), done("c", "2026-10-22"), task("late")], new Date("2026-10-23T12:00:00"));
  assert.equal(data.current, 2); assert.equal(data.best, 2); assert.equal(data.overdue, 1);
  assert.equal(data.week.reduce((n, d) => n + d.count, 0), 3);
  assert.equal(analytics([done("a", "2026-10-20")], new Date("2026-10-23T12:00:00")).current, 0);
});
test("calendar exports escape content, fold UTF-8 lines and omit completed tasks", () => {
  const output = calendarFile([task("a", { title: "Ã©".repeat(100) + ", review;\nnext" }), task("done", { completed: true })], new Date("2026-10-23T00:00:00Z"));
  assert.match(output, /BEGIN:VALARM/); assert.match(output, /DTEND;VALUE=DATE:20261021/);
  assert.match(output.replace(/\r\n /g, ""), /\\, review\\;\\nnext/); assert.doesNotMatch(output, /UID:done/);
  assert.ok(output.split("\r\n").every(line => Buffer.byteLength(line) <= 75));
});
