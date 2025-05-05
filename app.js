const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const app = express();
const PORT = 5000;
require("dotenv").config();
app.use(cors());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/send-email', upload.single('payslip'), async (req, res) => {
  const { name, email } = req.body;
  const payslipPdf = req.file;

  if (!email || !name || !payslipPdf) {
    return res.status(400).send("Missing required data");
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.dreamhost.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.DREAMHOST_EMAIL,
      pass: process.env.DREAMHOST_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: `"Ecommercesteem" <${process.env.DREAMHOST_EMAIL}>`,
      to: email,
      subject: `Your Payslip`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #000;">
          <p>Hi ${name},</p>
          <p>Please find your salary slip attached.</p>

          <br/>
          <p>Best regards,<br/>Asad Niaz</p>

          <div style="margin-top: 10px;">
            <img src="cid:logo" alt="Ecommercesteem Logo" style="width: 100px;"/>
          </div>

          <div style="font-size: 14px; margin-top: 10px;">
            <strong>Ecommerce Steem</strong><br/>
            <a href="https://calendly.com/contact-ecommercesteem" style="color: #0066cc; text-decoration: none;">Schedule a Meeting</a><br/>
            🌐 Website: <a href="https://ecommercesteem.com" style="color: #0066cc;">ecommercesteem.com</a><br/>
            📧 Email: <a href="mailto:asad@ecommercesteem.com" style="color: #0066cc;">asad@ecommercesteem.com</a><br/>
            📞 Phone: +44 7915391870
          </div>

          <div style="margin-top: 10px;">
            <p>Stay connected:</p>
            <a href="https://www.facebook.com/ecommercesteem0><img src="cid:icon" alt="Icon" /></a>
            <a href="https://www.instagram.com/ecommercesteem/"><img src="cid:instagram" alt="Instagram" /></a>
            <a href="https://www.linkedin.com/company/ecommercesteem-ltd/"><img src="cid:linkedin" alt="LinkedIn" /></a>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Payslip-${name}.pdf`,
          content: payslipPdf.buffer,
          contentType: 'application/pdf'
        },
        {
          filename: 'logo.png',
          path: __dirname + '/public/logo.png',
          cid: 'logo'
        },
        {
          filename: 'icon.png',
          path: __dirname + '/public/icon.png',
          cid: 'icon'
        },
        {
          filename: 'instagram.png',
          path: __dirname + '/public/instagram.png',
          cid: 'instagram'
        },
        {
          filename: 'linkedin.png',
          path: __dirname + '/public/linkedin.png',
          cid: 'linkedin'
        }
      ]
      
    });

    res.send("Email sent successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to send email");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
