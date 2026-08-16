export const emailTemplete = function ({
  otp,
  userName,
}: {
  otp: number | string;
  userName?: string;
}) {
  const currentYear = new Date().getFullYear();
  const greeting = userName ? `Hello ${userName},` : 'Hello Sports Player,';

  return `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>SportVenue - Verification Code</title>
  <style>
    /* Reset styles */
    body,
    table,
    td,
    a {
      text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    table,
    td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }

    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }

    table {
      border-collapse: collapse !important;
    }

    body {
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    .otp-code {
      font-family: 'Courier New', Courier, monospace, sans-serif;
      font-size: 34px;
      letter-spacing: 8px;
      font-weight: 800;
      color: #059669;
      background-color: #ecfdf5;
      border: 2px dashed #10b981;
      padding: 16px 28px;
      border-radius: 12px;
      display: inline-block;
    }
  </style>
</head>

<body style="background-color: #0f172a; padding: 24px 0; margin: 0;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
          style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);">

          <!-- Header / Pitch Green Gradient -->
          <tr>
            <td
              style="background: linear-gradient(135deg, #065f46 0%, #059669 50%, #10b981 100%); padding: 36px 24px; text-align: center;">
              <!-- Sports Stadium Logo Badge -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto;">
                <tr>
                  <td
                    style="background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; padding: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                      style="display: block;">
                      <!-- Stadium / Trophy / Ball Sports Icon -->
                      <path
                        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                        fill="#ffffff" opacity="0.9" />
                      <circle cx="12" cy="12" r="9" stroke="#ffffff" stroke-width="2" />
                    </svg>
                  </td>
                </tr>
              </table>
              <div style="font-size: 13px; font-weight: 700; color: #a7f3d0; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px;">
                SportVenue Management
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                Confirm Your Verification Code
              </h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 28px; background-color: #ffffff;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #0f172a; font-weight: 600;">
                ${greeting}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #475569;">
                Welcome to <strong>SportVenue</strong>! To secure your account and proceed with your stadium and venue bookings, please enter the one-time verification code below:
              </p>

              <!-- OTP Code Display -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
                style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <div class="otp-code"
                      style="font-family: 'Courier New', Courier, monospace, sans-serif; font-size: 34px; letter-spacing: 8px; font-weight: 800; color: #047857; background-color: #ecfdf5; border: 2px dashed #10b981; padding: 16px 28px; border-radius: 12px; display: inline-block;">
                      ${otp}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security & Expiration Banner -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
                style="margin-bottom: 24px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #92400e;">
                      ⏱ Code Expiration & Security
                    </p>
                    <p style="margin: 0; font-size: 13px; line-height: 19px; color: #b45309;">
                      This code is valid for <strong>5 minutes</strong>. For your security, never share this OTP with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
                If you did not request this verification on SportVenue, please disregard this email or contact support if you suspect unauthorized activity.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td
              style="padding: 24px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; font-weight: 600;">
                SportVenue &bull; Sports Venue & Stadium Management Platform
              </p>
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #94a3b8;">
                &copy; ${currentYear} SportVenue. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
                This is an automated system notification, please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>

</html>`;
};
