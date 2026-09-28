/**
 * WhatsApp click-to-chat links (https://wa.me/<number>?text=<message>).
 *
 * This is the ONLY WhatsApp integration in the app: staff click a button
 * and WhatsApp opens a chat with the parent. Nothing is ever sent
 * automatically and no WhatsApp Business / Meta API credentials exist.
 *
 * Pure functions, no environment access, so it is safe in client
 * components. Default country code is Egypt ("20").
 */

const DEFAULT_COUNTRY_CODE = "20";

/**
 * Normalizes a phone number to international digits (no "+", no spaces).
 *   01012345678   -> 201012345678
 *   +201012345678 -> 201012345678
 *   00201012345678-> 201012345678
 *   201012345678  -> 201012345678
 * Returns null when the result is not a plausible international number.
 */
export function normalizeWhatsAppNumber(
  raw: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = countryCode + digits.slice(1);
  digits = digits.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Builds a wa.me link, optionally with a pre-filled message. Null if the number is invalid. */
export function buildWhatsAppLink(
  rawNumber: string | null | undefined,
  text?: string,
  countryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  const number = normalizeWhatsAppNumber(rawNumber, countryCode);
  if (!number) return null;
  const base = `https://wa.me/${number}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
