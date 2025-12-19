/**
 * Email service for sending verification codes
 *
 * This is a placeholder implementation. Replace with your actual email provider:
 * - SendGrid
 * - Mailgun
 * - AWS SES
 * - Postmark
 * - etc.
 */

export async function sendVerificationEmail(
  email: string,
  code: string,
  meetingCode: string
): Promise<void> {
  // TODO: Replace with actual email sending logic
  console.log(`
    ========================================
    VERIFICATION EMAIL (Development Mode)
    ========================================
    To: ${email}
    Meeting Code: ${meetingCode}
    Verification Code: ${code}
    ========================================

    In production, configure EMAIL_API_KEY and
    update this function to use your email provider.
  `);

  // Example SendGrid implementation:
  // import sgMail from '@sendgrid/mail';
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  //
  // await sgMail.send({
  //   to: email,
  //   from: 'noreply@yourdomain.com',
  //   subject: `Your verification code for meeting ${meetingCode}`,
  //   text: `Your verification code is: ${code}. This code expires in 15 minutes.`,
  //   html: `
  //     <h2>Your Verification Code</h2>
  //     <p>Enter this code to join meeting <strong>${meetingCode}</strong>:</p>
  //     <h1 style="font-size: 32px; letter-spacing: 5px;">${code}</h1>
  //     <p>This code expires in 15 minutes.</p>
  //   `
  // });
}
