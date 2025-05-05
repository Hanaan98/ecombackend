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
      text: `Hi ${name},\n\nPlease find your salary slip attached.`,
      attachments: [
        {
          filename: `Payslip-${name}.pdf`,
          content: payslipPdf.buffer,
          contentType: 'application/pdf'
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
