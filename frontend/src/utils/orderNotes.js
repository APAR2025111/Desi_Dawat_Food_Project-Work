// Keep internal timing review flags stored on the order, but out of the customer note shown in the order panel.
export function getCustomerNoteForOrderPanel(notes) {
  return String(notes ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^ORDER REVIEW REQUIRED:/i.test(line.trim()))
    .join("\n")
    .trim();
}
