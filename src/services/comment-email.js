import config from '../config';

const nodemailer = require('nodemailer');

const appUrl = config.appUrl || 'https://staging.yourpeer.nyc';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const transport = nodemailer.createTransport({
  host: config.mail.host,
  port: config.mail.port,
  auth: {
    user: config.mail.username,
    pass: config.mail.password,
  },
});

const sharedCss = `
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', sans-serif;
      background-color: #f7f9fc;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      border-radius: 8px;
    }
    .header {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .comment-box {
      background-color: #f1f5f9;
      padding: 16px;
      border-left: 4px solid #FFDC00;
      border-radius: 6px;
      margin-bottom: 24px;
      white-space: pre-wrap;
    }
    .cta-button {
      display: inline-block;
      padding: 12px 20px;
      background-color: #171717;
      color: white;
      text-decoration: none;
      font-weight: 600;
      border-radius: 6px;
      margin-bottom: 32px;
    }
    .footer {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.6;
    }
`;

function buildEmailHtml({
  title, header, bodyHtml, footerMessage,
}) {
  return `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap"
        rel="stylesheet">
  <style>
${sharedCss}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${header}</div>

    ${bodyHtml}

    <div class="footer">
      <p>If you have any questions or need support, feel free to reach out to us at <a href="mailto:team@streetlives.nyc">team@streetlives.nyc</a>.</p>
      <p>${footerMessage}</p>
      <p>—<br>The YourPeer Team<br>Powered by Streetlives</p>
    </div>
  </div>
</body>
</html>
    `;
}

async function sendEmail({ to, subject, html }) {
  await transport.sendMail({
    from: `"YourPeer Feedback" <${config.mail.from}>`,
    to,
    subject,
    html,
  });
}

async function commentEmail({
  whatCouldBeImproved, whatWentWell, servicesUsed, locationName, providersEmail, locationSlug,
}) {
  const subject = '📝 You’ve Got a New Comment on YourPeer!';
  const escapedName = escapeHtml(locationName);
  const commentLines = [
    servicesUsed ? `Services used: ${servicesUsed.map(escapeHtml).join(', ')}` : '',
    whatWentWell ? `What went well: ${escapeHtml(whatWentWell)}` : '',
    whatCouldBeImproved ? `What could be improved: ${escapeHtml(whatCouldBeImproved)}` : '',
  ].filter(Boolean).join('\n');
  const safeSlug = encodeURIComponent(locationSlug);
  const bodyHtml = `
    <p>Hi <strong>${escapedName}</strong>,</p>
    <p>Someone just left you a new comment on YourPeer. Here’s what they shared:</p>

    <div class="comment-box">"${commentLines}"</div>

    <p>Want to keep the conversation going?</p>
    <p>Click <a href="${appUrl}/locations/${safeSlug}#reviews">here</a>
    and "View All" to see your location’s reviews.</p>
    <p>(If you’re not logged in, click <a href="${appUrl}/login">here</a> to log in)</p>
  `;

  await sendEmail({
    to: providersEmail,
    subject,
    html: buildEmailHtml({
      title: 'You’ve Got a New Comment on YourPeer!',
      header: `📝 ${subject}`,
      bodyHtml,
      footerMessage: 'Thanks for being part of the YourPeer community!',
    }),
  });
}

async function replyEmail({
  locationName, toEmail, locationSlug, replyContent,
}) {
  if (!toEmail || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}$/.test(toEmail)) {
    throw new Error('Invalid recipient email address');
  }

  const subject = '📝 A provider replied to your comment on YourPeer!';
  const safeSlug = encodeURIComponent(locationSlug);
  const bodyHtml = `
    <p>Hi,</p>
    <p>A provider has replied to your comment on YourPeer. Here's what they shared:</p>

    <div class="comment-box">"${escapeHtml(replyContent)}"</div>

    <p>Click <a href="${appUrl}/locations/${safeSlug}#reviews">here</a>
    and "View All" to see your comment.</p>
  `;

  await sendEmail({
    to: toEmail,
    subject,
    html: buildEmailHtml({
      title: 'A provider replied to your comment on YourPeer!',
      header: subject,
      bodyHtml,
      footerMessage: 'Thanks for using YourPeer!',
    }),
  });
}

export { replyEmail };

export default commentEmail;
