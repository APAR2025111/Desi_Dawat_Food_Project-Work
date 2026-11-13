import html2canvas from "html2canvas";

function blobToDataUrl(blob, ownerWindow) {
  return new Promise((resolve, reject) => {
    const reader = new ownerWindow.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not prepare the receipt logo for export."));
    reader.readAsDataURL(blob);
  });
}

function inlineComputedStyles(source, clone, ownerWindow) {
  if (source.nodeType === ownerWindow.Node.ELEMENT_NODE && clone.nodeType === ownerWindow.Node.ELEMENT_NODE) {
    const computed = ownerWindow.getComputedStyle(source);
    for (let index = 0; index < computed.length; index += 1) {
      const property = computed[index];
      clone.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
    }
  }

  const childCount = Math.min(source.childNodes.length, clone.childNodes.length);
  for (let index = 0; index < childCount; index += 1) {
    inlineComputedStyles(source.childNodes[index], clone.childNodes[index], ownerWindow);
  }
}

async function embedImages(source, clone, ownerWindow) {
  const sourceImages = Array.from(source.querySelectorAll("img"));
  const cloneImages = Array.from(clone.querySelectorAll("img"));

  await Promise.all(cloneImages.map(async (image, index) => {
    const sourceUrl = sourceImages[index]?.currentSrc || image.currentSrc || image.src;
    if (!sourceUrl || sourceUrl.startsWith("data:")) return;

    const response = await ownerWindow.fetch(sourceUrl, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not load an image on the receipt.");
    image.src = await blobToDataUrl(await response.blob(), ownerWindow);
  }));
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The receipt image could not be created."));
    }, "image/png");
  });
}

export async function downloadReceiptFirstPageImage(receiptElement, receiptNumber) {
  if (!receiptElement) throw new Error("Receipt preview is not available.");

  const ownerDocument = receiptElement.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const clone = receiptElement.cloneNode(true);
  inlineComputedStyles(receiptElement, clone, ownerWindow);
  clone.querySelector(".receipt-payment-page")?.remove();
  clone.querySelectorAll(".no-print, .receipt-actions").forEach((element) => element.remove());
  await embedImages(receiptElement, clone, ownerWindow);

  const width = Math.ceil(receiptElement.getBoundingClientRect().width);
  if (!width) throw new Error("Receipt image dimensions are unavailable.");

  const captureRoot = ownerDocument.createElement("div");
  Array.from(clone.attributes).forEach(({ name, value }) => captureRoot.setAttribute(name, value));
  captureRoot.style.setProperty("width", `${width}px`, "important");
  captureRoot.style.setProperty("max-width", "none", "important");
  captureRoot.style.setProperty("height", "auto", "important");
  captureRoot.style.setProperty("min-height", "0", "important");
  captureRoot.style.setProperty("margin", "0", "important");
  Array.from(clone.childNodes).forEach((child) => captureRoot.appendChild(child.cloneNode(true)));

  const host = ownerDocument.createElement("div");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;opacity:0;pointer-events:none;z-index:-1;`;
  host.appendChild(captureRoot);
  ownerDocument.body.appendChild(host);

  try {
    await Promise.all(Array.from(captureRoot.querySelectorAll("img")).map((image) => (
      image.complete ? Promise.resolve() : new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Could not load an image on the receipt."));
      })
    )));
    if (ownerDocument.fonts?.ready) await ownerDocument.fonts.ready;

    const height = Math.ceil(captureRoot.scrollHeight);
    if (!height) throw new Error("Receipt image dimensions are unavailable.");

    const canvas = await html2canvas(captureRoot, {
      backgroundColor: "#ffffff",
      scale: 3,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width,
      height,
      windowWidth: Math.max(ownerWindow.innerWidth, width),
      windowHeight: Math.max(ownerWindow.innerHeight, height),
      scrollX: 0,
      scrollY: 0,
    });
    const blob = await canvasToBlob(canvas);
    const imageUrl = ownerWindow.URL.createObjectURL(blob);
    const anchor = ownerDocument.createElement("a");
    anchor.href = imageUrl;
    anchor.download = `desi-dawat-receipt-${String(receiptNumber || "order").replace(/[^a-z0-9_-]/gi, "-")}-page-1.png`;
    ownerDocument.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    ownerWindow.setTimeout(() => ownerWindow.URL.revokeObjectURL(imageUrl), 30_000);
  } finally {
    host.remove();
  }
}
