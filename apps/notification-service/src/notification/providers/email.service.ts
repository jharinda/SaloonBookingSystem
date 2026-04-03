import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

import { IEmailService } from '../interfaces/notification-channel.interface';

export interface SendEmailOptions {
  to: string;
  toName: string;
  subject: string;
  html: string;
  /**
   * When provided the email gains full calendar-invitation functionality:
   *   - A styled "Add to Google Calendar" button is injected into the body.
   *   - The ICS is attached as `appointment.ics` (works with Apple Calendar, Outlook, …).
   *   - The ICS is also sent as an inline `text/calendar; method=REQUEST` MIME part
   *     so Gmail shows its native "Add to Calendar" prompt automatically — no click required.
   */
  calendarInvite?: {
    icsContent: string;
    googleCalendarUrl: string;
  };
}

/**
 * Converts a plain-text email body (with `\n` line breaks) into a fully
 * styled HTML email shell.
 *
 * Paragraphs are separated by blank lines (`\n\n`); single newlines become
 * `<br>` tags within a paragraph.  If the string already starts with `<`
 * (i.e. is already HTML) it is passed through unchanged.
 *
 * When `googleCalendarUrl` is supplied a calendar call-to-action section is
 * appended at the bottom of the body before the footer.
 */
function plainToHtml(text: string, subject: string, googleCalendarUrl?: string): string {
  if (text.trimStart().startsWith('<')) return text; // already HTML

  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => {
      const escaped = block
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 14px 0">${escaped}</p>`;
    })
    .join('\n');

  const calendarSection = googleCalendarUrl
    ? `
          <!-- Calendar CTA -->
          <tr>
            <td style="padding:0 32px 28px 32px">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-top:1px solid #e5e7eb;padding-top:20px">
                <tr>
                  <td>
                    <p style="margin:0 0 14px 0;font-size:13px;color:#6b7280;font-family:Arial,Helvetica,sans-serif">
                      Save this appointment to your calendar:
                    </p>
                    <a href="${googleCalendarUrl}"
                       style="display:inline-block;background:#4285F4;color:#ffffff;
                              padding:11px 22px;border-radius:6px;text-decoration:none;
                              font-size:13px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">
                      &#128197;&nbsp; Add to Google Calendar
                    </a>
                    <p style="margin:10px 0 0 0;font-size:11px;color:#9ca3af;font-family:Arial,Helvetica,sans-serif">
                      An <strong>appointment.ics</strong> file is also attached — open it to add
                      this event to Apple Calendar, Outlook, or any other calendar app.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

          <!-- Header -->
          <tr>
            <td style="background:#10B981;padding:24px 32px">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:.5px">SnapSalon</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 20px 32px;color:#333333;font-size:14px;line-height:1.7">
              ${paragraphs}
            </td>
          </tr>
          ${calendarSection}

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eeeeee">
              <p style="margin:0;font-size:12px;color:#999999;text-align:center">
                You received this email because you have an account on SnapSalon.
                &copy; ${new Date().getFullYear()} SnapSalon. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

@Injectable()
export class EmailService implements IEmailService, OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    this.fromEmail = this.config.get<string>('EMAIL_FROM', 'noreply@snapsalon.lk');
    this.fromName  = this.config.get<string>('EMAIL_FROM_NAME', 'SnapSalon');
  }

  onModuleInit(): void {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY', '');
    if (!apiKey) {
      this.logger.warn('SENDGRID_API_KEY not configured — email sending disabled');
      return;
    }
    sgMail.setApiKey(apiKey);
    this.logger.log('SendGrid client initialised');
  }

  async sendEmail(options: SendEmailOptions): Promise<string | null> {
    if (this.config.get<string>('EMAIL_ENABLED', 'true') === 'false') {
      this.logger.debug(`sendEmail skipped — EMAIL_ENABLED=false (to=${options.to})`);
      return null;
    }
    if (!this.config.get<string>('SENDGRID_API_KEY', '')) {
      this.logger.warn('sendEmail skipped — SENDGRID_API_KEY not configured');
      return null;
    }

    const htmlBody = plainToHtml(
      options.html,
      options.subject,
      options.calendarInvite?.googleCalendarUrl,
    );

    const base = {
      to:      { email: options.to, name: options.toName },
      from:    { email: this.fromEmail, name: this.fromName },
      subject: options.subject,
    };

    // MailDataRequired is a union that needs html/text/content at construction time,
    // so we build the complete object in each branch rather than patching after.
    let msg: sgMail.MailDataRequired;

    if (options.calendarInvite?.icsContent) {
      const { icsContent } = options.calendarInvite;
      msg = {
        ...base,
        html: htmlBody,
        // .ics attachment — Gmail, Apple Calendar, Outlook, and all other calendar
        // apps open the event when the user clicks the attachment. Gmail also shows
        // a native "View in Calendar" banner for .ics files from trusted senders.
        attachments: [
          {
            content:     Buffer.from(icsContent).toString('base64'),
            filename:    'appointment.ics',
            type:        'application/octet-stream',
            disposition: 'attachment',
          },
        ],
      };
    } else {
      msg = { ...base, html: htmlBody };
    }

    try {
      const [response] = await sgMail.send(msg);
      const messageId =
        (response.headers as Record<string, string>)['x-message-id'] ?? null;
      this.logger.log(`Email sent to ${options.to} | msgId=${messageId}`);
      return messageId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${options.to}: ${message}`);
      throw err;
    }
  }
}
