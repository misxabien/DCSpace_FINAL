import nodemailer from "nodemailer";

const SMTP_SEND_TIMEOUT_MS = 25_000;

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim(),
  );
}

function getFromAddress() {
  return process.env.SMTP_FROM?.trim() || "DC Space <noreply@sdca.edu.ph>";
}

function shouldLogVerificationCodeInsteadOfEmail() {
  return process.env.VERIFICATION_LOG_CODE === "true";
}

/** When SMTP fails, still allow registration by printing the code in the terminal. */
function shouldFallbackToTerminalOnSmtpFailure() {
  // Default ON so local/school setups are not blocked by Gmail outages.
  // Set VERIFICATION_SMTP_FALLBACK=false to require real email delivery.
  return process.env.VERIFICATION_SMTP_FALLBACK !== "false";
}

function smtpNotConfiguredError() {
  return new Error(
    "Email is not set up. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to .env, then restart npm run dev.",
  );
}

function normalizeSmtpPass(pass: string) {
  // Gmail app passwords are often copied with spaces.
  return pass.replace(/\s+/g, "").trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function friendlySmtpError(message: string) {
  if (/timed out|timeout|ETIMEDOUT|ESOCKET|ECONNECTION/i.test(message)) {
    return "Could not reach Gmail SMTP in time. Check your network (port 587), or set VERIFICATION_LOG_CODE=true and read the code in the terminal.";
  }
  if (/Invalid login|EAUTH|535|Username and Password not accepted|BadCredentials/i.test(message)) {
    return "Gmail rejected the SMTP login. Use a Google App Password (not your normal password) for SMTP_PASS, then restart npm run dev.";
  }
  if (/self[- ]signed|certificate|UNABLE_TO_VERIFY/i.test(message)) {
    return "SMTP TLS certificate error. Check SMTP settings, or set SMTP_TLS_REJECT_UNAUTHORIZED=false for local testing.";
  }
  return message;
}

function logCodeToTerminal(email: string, code: string, reason: string) {
  console.info(`[DC Space] ${reason}`);
  console.info(`[DC Space] Verification code for ${email}: ${code}`);
}

export async function sendVerificationEmail({ email, code }: { email: string; code: string }) {
  if (!isSmtpConfigured()) {
    if (shouldLogVerificationCodeInsteadOfEmail() || shouldFallbackToTerminalOnSmtpFailure()) {
      logCodeToTerminal(email, code, "SMTP is not configured — using terminal code.");
      return { delivered: true, devMode: true };
    }
    throw smtpNotConfiguredError();
  }

  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465 || process.env.SMTP_SECURE === "true";
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: normalizeSmtpPass(process.env.SMTP_PASS || ""),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
    },
  });

  const subject = "Your DC Space verification code";
  const text = [
    "Hello,",
    "",
    `Your DC Space verification code is: ${code}`,
    "",
    "Enter this code on the registration screen to verify your school email.",
    "The code expires in 15 minutes.",
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
          <tr>
            <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#334155;padding-bottom:28px;">
              Your DC Space verification code
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 0 28px;">
              <span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:42px;font-weight:700;line-height:1.2;letter-spacing:0.35em;color:#5B8CFF;">
                ${code}
              </span>
            </td>
          </tr>
          <tr>
            <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#64748b;">
              Enter this code on the registration screen to verify your school email.<br />
              The code expires in 15 minutes.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await withTimeout(
      transport.sendMail({
        from: getFromAddress(),
        to: email,
        subject,
        text,
        html,
      }),
      SMTP_SEND_TIMEOUT_MS,
      "Email server timed out. Check SMTP settings in .env or try a different network (port 587 must be allowed).",
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown email error";
    console.error("[DC Space] SMTP send failed:", raw);

    if (shouldLogVerificationCodeInsteadOfEmail() || shouldFallbackToTerminalOnSmtpFailure()) {
      logCodeToTerminal(
        email,
        code,
        "SMTP failed — falling back to terminal verification code so registration can continue.",
      );
      return { delivered: true, devMode: true };
    }

    throw new Error(friendlySmtpError(raw));
  } finally {
    transport.close();
  }

  return { delivered: true, devMode: false };
}
