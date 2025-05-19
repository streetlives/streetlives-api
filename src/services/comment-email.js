const nodemailer = require('nodemailer');

// const transporter = nodemailer.createTransport({
//   host: 'smtp.ethereal.email',
//   port: 587,
//   secure: false, // true for port 465, false for other ports
//   auth: {
//     user: 'maddison53@ethereal.email',
//     pass: 'jn7jnAPss4f63QBp6D',
//   },
// });

// Looking to send emails in production? Check out our Email API/SMTP product!
const transporter = nodemailer.createTransport({
  host: 'live.smtp.mailtrap.io',
  port: 587,
  auth: {
    user: 'api',
    pass: '35fa92c4ed33c045e5cd86b963c37638',
  },
});

async function commentEmail({
  whatCouldBeImproved, whatWentWell, servicesUsed, locationName, providersEmail
}) {
  console.log('sending mail...');
  // send mail with defined transport object
  const info = await transporter.sendMail({
    from: '"Streetlives" <shakil@demomailtrap.co>', // sender address
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
    <p><a href="https://yourpeer.nyc/login" class="cta-button" style="color: #ffffff !important;">👉 Log in here to reply to the review</a></p>

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

export default commentEmail;

// main().catch(console.error);
