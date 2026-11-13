// Customer accounts without an email sign in with their mobile number. Supabase sign-in needs an email,
// so those accounts get a stand-in address on the reserved ".invalid" domain (never deliverable, never shown).
export const PHONE_LOGIN_DOMAIN = "phone.invalid";
/** "09171234567" → "09171234567@phone.invalid" */
export const phoneLoginEmail = (phone09: string) => `${phone09}@${PHONE_LOGIN_DOMAIN}`;
export const isPhoneLoginEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${PHONE_LOGIN_DOMAIN}`);
