import { jsPDF } from "jspdf";
import { LETTERHEAD } from "../../../shared/letterhead.js";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const LEFT = 18;
const RIGHT = 18;
const BODY_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const FOOTER_Y = PAGE_HEIGHT - 12;

function safeFilename(value) {
  const name = String(value || "Desi Dawat report")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 90);
  return `${name || "Desi-Dawat-report"}.pdf`;
}

async function loadLogoDataUrl() {
  const response = await fetch(new URL(LETTERHEAD.logo, window.location.origin));
  if (!response.ok) throw new Error("Could not load the Desi Dawat logo for the PDF.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

function inlineText(value) {
  return String(value || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function reportBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let table = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: inlineText(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const flushTable = () => {
    if (!table.length) return;
    const isDivider = (line) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
    for (const line of table.filter((row) => !isDivider(row))) {
      const cells = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => inlineText(cell.trim()));
      blocks.push({ type: "tableRow", cells });
    }
    table = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      flushParagraph();
      flushList();
      table.push(line);
      continue;
    }
    flushTable();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: inlineText(heading[2]) });
      continue;
    }
    if (/^(---+|\*\*\*+)$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }
    const checkbox = line.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/);
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (checkbox || bullet || numbered) {
      flushParagraph();
      const type = numbered ? "numbered" : "bulleted";
      if (!list || list.type !== "list" || list.style !== type) {
        flushList();
        list = { type: "list", style: type, items: [] };
      }
      list.items.push({
        prefix: checkbox ? `[${checkbox[1].trim() ? "x" : " "}] ` : numbered ? `${numbered[1]}. ` : "• ",
        text: inlineText(checkbox ? checkbox[2] : numbered ? numbered[2] : bullet[1]),
      });
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  flushTable();
  return blocks;
}

export async function downloadBusinessDocumentPdf(title, documentType, content) {
  const logo = await loadLogoDataUrl();
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const generated = new Date().toLocaleDateString("en-FI");
  let page = 1;
  let y = 0;

  const addLetterhead = (firstPage) => {
    const logoX = LEFT;
    const logoY = 13;
    pdf.setDrawColor(199, 155, 53);
    pdf.setLineWidth(0.7);
    pdf.circle(logoX + 12, logoY + 12, 12);
    pdf.addImage(logo, "JPEG", logoX + 1.2, logoY + 1.2, 21.6, 21.6, undefined, "FAST");

    const textX = LEFT + 30;
    pdf.setTextColor(121, 29, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text(LETTERHEAD.name, textX, 20);
    pdf.setFontSize(9.5);
    pdf.text(LETTERHEAD.finnish, textX, 26);
    pdf.text(LETTERHEAD.english, textX, 31);
    pdf.setTextColor(67, 53, 45);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(`${LETTERHEAD.address}, Finland`, textX, 36);
    pdf.text(`Tel. ${LETTERHEAD.phone}  |  ${LETTERHEAD.email}`, textX, 41);
    pdf.setDrawColor(199, 155, 53);
    pdf.setLineWidth(0.45);
    pdf.line(LEFT, 48, PAGE_WIDTH - RIGHT, 48);

    if (firstPage) {
      pdf.setTextColor(121, 29, 42);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      const titleLines = pdf.splitTextToSize(inlineText(title || "Business Report"), BODY_WIDTH);
      pdf.text(titleLines, LEFT, 58);
      const titleHeight = titleLines.length * 6.5;
      pdf.setTextColor(93, 77, 66);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`${inlineText(documentType || "Business document")}  |  Prepared ${generated}`, LEFT, 58 + titleHeight + 1);
      pdf.setDrawColor(232, 223, 201);
      pdf.line(LEFT, 63 + titleHeight, PAGE_WIDTH - RIGHT, 63 + titleHeight);
      return 70 + titleHeight;
    }
    return 57;
  };

  const addFooter = () => {
    pdf.setDrawColor(231, 224, 211);
    pdf.setLineWidth(0.25);
    pdf.line(LEFT, FOOTER_Y - 4, PAGE_WIDTH - RIGHT, FOOTER_Y - 4);
    pdf.setTextColor(112, 100, 91);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`${LETTERHEAD.name}  ·  ${inlineText(title || "Business Report")}`, LEFT, FOOTER_Y);
    pdf.text(`Page ${page}`, PAGE_WIDTH - RIGHT, FOOTER_Y, { align: "right" });
  };

  const nextPage = () => {
    addFooter();
    pdf.addPage();
    page += 1;
    y = addLetterhead(false);
  };

  y = addLetterhead(true);
  const ensureSpace = (height) => {
    if (y + height > FOOTER_Y - 8) nextPage();
  };
  const blocks = reportBlocks(content);
  if (!blocks.length) blocks.push({ type: "paragraph", text: "No report content was provided." });

  for (const block of blocks) {
    if (block.type === "heading") {
      const size = block.level === 1 ? 15 : block.level === 2 ? 13 : 11;
      const topGap = block.level === 1 ? 7 : 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(size);
      const lines = pdf.splitTextToSize(block.text, BODY_WIDTH);
      ensureSpace(topGap + lines.length * (size * 0.38) + 4);
      y += topGap;
      pdf.setTextColor(121, 29, 42);
      pdf.text(lines, LEFT, y);
      y += lines.length * (size * 0.38) + 3;
      continue;
    }
    if (block.type === "paragraph") {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(block.text, BODY_WIDTH);
      for (const line of lines) {
        ensureSpace(5.1);
        pdf.setTextColor(48, 40, 35);
        pdf.text(line, LEFT, y);
        y += 5.1;
      }
      y += 2;
      continue;
    }
    if (block.type === "list") {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      for (const item of block.items) {
        const indent = 5;
        const lines = pdf.splitTextToSize(`${item.prefix}${item.text}`, BODY_WIDTH - indent);
        for (const [lineIndex, line] of lines.entries()) {
          ensureSpace(5.1);
          pdf.setTextColor(48, 40, 35);
          pdf.text(line, LEFT + (lineIndex ? indent : 0), y);
          y += 5.1;
        }
        y += 0.5;
      }
      y += 2;
      continue;
    }
    if (block.type === "tableRow") {
      const rowText = block.cells.join("   |   ");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const lines = pdf.splitTextToSize(rowText, BODY_WIDTH - 6);
      const rowHeight = lines.length * 4.8 + 3;
      ensureSpace(rowHeight);
      pdf.setDrawColor(221, 207, 170);
      pdf.setFillColor(251, 246, 234);
      pdf.rect(LEFT, y - 3.4, BODY_WIDTH, rowHeight, "FD");
      pdf.setTextColor(48, 40, 35);
      pdf.text(lines, LEFT + 3, y);
      y += rowHeight;
      continue;
    }
    if (block.type === "rule") {
      ensureSpace(7);
      pdf.setDrawColor(221, 207, 170);
      pdf.line(LEFT, y, PAGE_WIDTH - RIGHT, y);
      y += 6;
    }
  }

  addFooter();
  pdf.save(safeFilename(title));
}
