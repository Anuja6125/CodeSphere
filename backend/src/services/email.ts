import nodemailer, { Transporter } from "nodemailer";
import { config } from "../config/env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (process.env.NODE_ENV === "test") return null;
  if (transporter) return transporter;

  if (config.smtp.host && config.smtp.user && config.smtp.pass) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  return transporter;
}

export interface SendOtpEmailParams {
  email: string;
  otp: string;
  expiresInMinutes: number;
}

/**
 * Sends a one-time password (OTP) email using configured SMTP provider.
 */
export async function sendOtpEmail({
  email,
  otp,
  expiresInMinutes,
}: SendOtpEmailParams): Promise<{ success: boolean; previewUrl?: string }> {
  const mailer = getTransporter();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 24px; margin: 0; }
          .container { max-width: 480px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .logo { font-size: 20px; font-weight: 700; color: #60a5fa; margin-bottom: 24px; display: flex; align-items: center; }
          h2 { margin-top: 0; color: #ffffff; font-size: 22px; font-weight: 600; }
          p { color: #94a3b8; font-size: 15px; line-height: 1.5; margin: 12px 0; }
          .otp-code { display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #38bdf8; background: #1e293b; padding: 12px 24px; border-radius: 8px; border: 1px solid #334155; margin: 20px 0; font-family: 'Courier New', monospace; }
          .footer { margin-top: 24px; border-top: 1px solid #1f2937; padding-top: 16px; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">⚡ CodeSphere</div>
          <h2>Your One-Time Password</h2>
          <p>Use the 6-digit code below to log in to your CodeSphere account. This code is valid for <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
          <div class="otp-code">${otp}</div>
          <p>If you did not request this verification code, please ignore this email.</p>
          <div class="footer">
            CodeSphere codebase intelligence platform. Do not share this code with anyone.
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `CodeSphere Verification Code: ${otp}\n\nThis code expires in ${expiresInMinutes} minutes and is single-use.\nIf you did not request this code, you can safely ignore this message.`;

  if (mailer) {
    await mailer.sendMail({
      from: config.smtp.from,
      to: email,
      subject: `Your CodeSphere Verification Code: ${otp}`,
      text: textContent,
      html: htmlContent,
    });
    return { success: true };
  }

  // Fallback for development if SMTP is not configured
  if (process.env.NODE_ENV !== "production") {
    // Check if running tests or development without SMTP
    console.warn(`[EmailService] SMTP not configured. OTP generated for: ${email}`);
    // If dev explicitly enabled console OTP display for local testing
    if (process.env.DEV_LOG_OTP === "true" || !process.env.NODE_ENV) {
      console.log(`[EmailService:DEV_ONLY] One-time code for ${email} is [${otp}]`);
    }
    return { success: true };
  }

  throw new Error("Email service is not configured. Please set SMTP environment variables.");
}
