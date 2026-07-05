import nodemailer from 'nodemailer';
import { config } from '../config';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string) {
  const transport = getTransporter();
  if (!transport) {
    if (config.nodeEnv === 'development') {
      console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${text}`);
    }
    return;
  }

  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
  });
}
