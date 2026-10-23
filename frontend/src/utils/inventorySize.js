// Inventory size display: show measurements only, converting legacy kg/litre entries to gm/ml.
export function normalizeInventorySize(value) {
  const match = String(value ?? "").trim().match(
    /^([0-9]+(?:[.,][0-9]+)?)\s*(kg|gm|g|grams?|ml|l|lit(?:re|er)s?)(?:\s+(?:cans?|pieces?|packs?|packets?|jars?|containers?|boxes?))?$/i
  );
  if (!match) return "";

  let amount = Number(match[1].replace(",", "."));
  const originalUnit = match[2].toLowerCase();
  let unit;
  if (originalUnit === "kg") {
    amount *= 1000;
    unit = "gm";
  } else if (originalUnit === "g" || originalUnit.startsWith("gram") || originalUnit === "gm") {
    unit = "gm";
  } else if (originalUnit === "l" || originalUnit.startsWith("lit")) {
    amount *= 1000;
    unit = "ml";
  } else {
    unit = "ml";
  }

  return `${Number(amount.toFixed(3))} ${unit}`;
}

// Inventory size validation: keep newly saved sizes to the requested gm/ml units only.
export function isValidInventorySize(value) {
  const size = String(value ?? "").trim();
  return size === "" || /^[0-9]+(?:\.[0-9]+)?\s*(?:gm|ml)$/i.test(size);
}