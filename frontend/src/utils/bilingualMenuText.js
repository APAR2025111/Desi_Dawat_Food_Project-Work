const finnishClues = /[äöå]|\b(?:ja|sekä|kpl|päivän|pähkin|kuivattujen|hedelmien|valmistettu|valmistetaan|herkku|perinteinen|intialainen|kastike|mauste|tarjoillaan|keitetty|annos|ruoka|papu|mungpapu)\w*\b/i;

const isFinnishText = (text) => finnishClues.test(text);

/** Return display lines as English first, Finnish second when both are present. */
export function getBilingualMenuLines(value) {
  const text = String(value || "").trim();
  if (!text) return [];

  const parts = text.split(/\s*[|/]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    const firstIsFinnish = isFinnishText(parts[0]);
    const secondIsFinnish = isFinnishText(parts[1]);
    if (firstIsFinnish !== secondIsFinnish) {
      return firstIsFinnish ? [parts[1], parts[0]] : [parts[0], parts[1]];
    }
    // If the language detector is inconclusive, keep the saved English-first order.
  }

  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((part) => part.trim()).filter(Boolean) || [];
  const finnishSentences = sentences.filter(isFinnishText);
  const englishSentences = sentences.filter((sentence) => !isFinnishText(sentence));
  if (finnishSentences.length && englishSentences.length) {
    return [englishSentences.join(" "), finnishSentences.join(" ")];
  }

  return [text];
}

export function formatBilingualMenuText(value) {
  return getBilingualMenuLines(value).join("\n");
}
