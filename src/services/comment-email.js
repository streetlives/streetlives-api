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

// Looking to send emails in production? Check out our Email API/SMTP product!
const transport = nodemailer.createTransport({
  host: config.mail.host,
  port: config.mail.port,
  auth: {
    user: config.mail.username,
    pass: config.mail.password,
  },
});

async function commentEmail({
  whatCouldBeImproved, whatWentWell, servicesUsed, locationName, providersEmail, locationSlug,
}) {
  console.log('sending mail...');
  // send mail with defined transport object
  const info = await transport.sendMail({
    from: `"YourPeer Feedback" <${config.mail.from}>`, // sender address
    to: providersEmail, // list of receivers
    subject: '📝 You’ve Got a New Comment on YourPeer!', // Subject line
    html: `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>You’ve Got a New Comment on YourPeer!</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">📝 You’ve Got a New Comment on YourPeer!</div>

    <p>Hi <strong>${locationName}</strong>,</p>
    <p>Someone just left you a new comment on YourPeer. Here’s what they shared:</p>

    <div class="comment-box">“${servicesUsed ? `Services used: ${servicesUsed.join(', ')}` : ''}
${whatWentWell ? `What went well: ${whatWentWell}` : ''}
${whatCouldBeImproved ? `What could be improved: ${whatCouldBeImproved}` : ''}”</div>

    <p>Want to keep the conversation going?</p>
    <p>Click <a href="${appUrl}/locations/${locationSlug}#reviews">here</a> and "View All" to see your location’s reviews.</p>
    <p>(If you’re not logged in, click <a href="${appUrl}/login">here</a> to log in)</p>

    <div class="footer">
      <p>If you have any questions or need support, feel free to reach out to us at <a href="mailto:team@streetlives.nyc">team@streetlives.nyc</a>.</p>
      <p>Thanks for being part of the YourPeer community!</p>
      <p>—<br>The YourPeer Team<br>Powered by Streetlives</p>
    </div>
  </div>
</body>
</html>
    `,
  });

  console.log('Message sent: %s', info.messageId);
  // Message sent: <d786aa62-4e0a-070a-47ed-0b0666549519@ethereal.email>
}

async function replyEmail({
  locationName, toEmail, locationSlug, replyContent
}) {
  const safeReplyContent = escapeHtml(replyContent);
  console.log('sending mail...');
  // send mail with defined transport object
  const info = await transport.sendMail({
    from: `"YourPeer Feedback" <${config.mail.from}>`, // sender address
    to: toEmail, // list of receivers
    subject: '📝 A provider replied to your comment on YourPeer!', // Subject line
    html: `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>A provider replied to your comment on YourPeer!</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">📝 A provider replied to your comment on YourPeer!</div>

    <p>Hi,</p>
    <p>A provider has replied to your comment on YourPeer. Here’s what they shared:</p>

    <div class="comment-box">“${safeReplyContent}”</div>

    <p>Click <a href="${appUrl}/locations/${locationSlug}#reviews">here</a> and "View All" to see your comment.</p>

    <div class="footer">
      <p>If you have any questions or need support, feel free to reach out to us at <a href="mailto:team@streetlives.nyc">team@streetlives.nyc</a>.</p>
      <p>Thanks for using YourPeer!</p>
      <p>—<br>The YourPeer Team<br>Powered by Streetlives</p>
    </div>
  </div>
</body>
</html>
    `,
  });
  console.log('Message sent: %s', info.messageId);
}

export { replyEmail };

export default commentEmail;

// main().catch(console.error);
