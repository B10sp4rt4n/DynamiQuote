const dueDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// tasks.due_date is a PostgreSQL DATE, serialized by Prisma at UTC midnight.
// It represents a calendar day, not an instant to convert to the browser zone.
export function formatTaskDueDate(iso: string): string {
  return dueDateFormatter.format(new Date(iso));
}
