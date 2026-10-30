const CUSTOMER_NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;
const CUSTOMER_PHONE_PATTERN = /^[+]?[0-9\s()-]{7,30}$/;

export function validateCheckoutDetails({ name, phone, orderType, address }) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanPhone = typeof phone === "string" ? phone.trim() : "";
  const cleanAddress = typeof address === "string" ? address.trim() : "";

  if (!cleanName || cleanName.length < 2 || cleanName.length > 120 || !CUSTOMER_NAME_PATTERN.test(cleanName)) {
    return "Please enter a valid customer name using letters only.";
  }
  if (!CUSTOMER_PHONE_PATTERN.test(cleanPhone) || cleanPhone.replace(/\D/g, "").length < 7) {
    return "Please enter a valid phone number with at least 7 digits.";
  }
  if (orderType === "delivery" && !cleanAddress) {
    return "Please enter your delivery address.";
  }
  if (orderType === "delivery" && cleanAddress.length > 500) {
    return "Please keep your delivery address under 500 characters.";
  }
  return "";
}
