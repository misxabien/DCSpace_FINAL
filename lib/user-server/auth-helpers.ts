function getAllowedEmailDomain() {
  const domain = process.env.ALLOWED_GOOGLE_DOMAIN?.trim().toLowerCase() || "sdca.edu.ph";
  return domain.startsWith("@") ? domain : `@${domain}`;
}

export function isSchoolEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .endsWith(getAllowedEmailDomain());
}

export function validateRegistrationBody(body: Record<string, unknown>) {
  const requiredFields = [
    "firstName",
    "lastName",
    "studentNumber",
    "email",
    "password",
    "confirmPassword",
    "verificationCode",
  ];
  for (const field of requiredFields) {
    if (!body[field] || String(body[field]).trim() === "") {
      return `${field} is required.`;
    }
  }
  if (!isSchoolEmail(String(body.email))) {
    return `email must use your school domain (${getAllowedEmailDomain()}).`;
  }
  if (!/^\d{6}$/.test(String(body.verificationCode).trim())) {
    return "verificationCode must be a 6-digit number.";
  }
  if (String(body.password).length < 8) {
    return "password must be at least 8 characters.";
  }
  if (body.password !== body.confirmPassword) {
    return "password and confirmPassword do not match.";
  }
  if (body.dataPrivacyAccepted !== true) {
    return "dataPrivacyAccepted must be true before registration.";
  }
  return null;
}
