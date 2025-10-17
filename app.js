
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const multer = require("multer");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- middleware ---
app.use(cors());
// Parse JSON in case you add JSON routes later
app.use(express.json());
// Serve /public so inline images can be fetched if needed in future
app.use("/public", express.static(path.join(__dirname, "public")));

// Multer: keep PDF in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- helpers ---
const makeTransportConfig = (use465 = false) => ({
  host: process.env.SMTP_HOST || "smtp.dreamhost.com",
  port: use465 ? 465 : Number(process.env.SMTP_PORT || 587),
  secure: use465, // true for 465, false for 587 (STARTTLS)
  auth: {
    user: process.env.DREAMHOST_EMAIL,
    pass: process.env.DREAMHOST_PASS,
  },
  // Be explicit about timeouts to avoid hanging
  connectionTimeout: 15000, // time to establish TCP
  greetingTimeout: 10000,   // time waiting for server greeting
  socketTimeout: 20000,     // total inactivity timeout during send
  tls: {
    servername: process.env.SMTP_HOST || "smtp.dreamhost.com",
    // If you are behind a corporate proxy doing TLS interception and just testing,
    // you can _temporarily_ add: rejectUnauthorized: false
  },
});

// Optional: simple logger
const log = (...args) => console.log(new Date().toISOString(), ...args);

// --- routes ---
app.get("/", (_req, res) => {
  res.send("Email sender is running.");
});

app.post("/send-email", upload.single("payslip"), async (req, res) => {
  try {
    const { name, email } = req.body;
    const payslipPdf = req.file;

    if (!email || !name || !payslipPdf) {
      return res.status(400).send("Missing required data");
    }

    // Try 587 STARTTLS first, then fall back to 465 implicit TLS if 587 is blocked
    let transporter;
    try {
      log("Creating SMTP transporter on 587 (STARTTLS)...");
      transporter = nodemailer.createTransport(makeTransportConfig(false));
      await transporter.verify(); // checks network + auth + TLS
      log("587 verify OK");
    } catch (e587) {
      log("587 verify failed, falling back to 465:", e587 && e587.code || e587 && e587.message);
      transporter = nodemailer.createTransport(makeTransportConfig(true));
      await transporter.verify();
      log("465 verify OK");
    }

    const html = `
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
          <a href="https://www.facebook.com/ecommercesteem0"><img src="cid:icon" alt="Icon" /></a>
          <a href="https://www.instagram.com/ecommercesteem/"><img src="cid:instagram" alt="Instagram" /></a>
          <a href="https://www.linkedin.com/company/ecommercesteem-ltd/"><img src="cid:linkedin" alt="LinkedIn" /></a>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Ecommercesteem" <${process.env.DREAMHOST_EMAIL}>`,
      to: email,
      subject: "Your Payslip",
      html,
      attachments: [
        {
          filename: `Payslip-${name}.pdf`,
          content: payslipPdf.buffer,
          contentType: "application/pdf",
        },
        {
          filename: "logo.png",
          path: path.join(__dirname, "public", "logo.png"),
          cid: "logo",
        },
        {
          filename: "icon.png",
          path: path.join(__dirname, "public", "icon.png"),
          cid: "icon",
        },
        {
          filename: "instagram.png",
          path: path.join(__dirname, "public", "instagram.png"),
          cid: "instagram",
        },
        {
          filename: "linkedin.png",
          path: path.join(__dirname, "public", "linkedin.png"),
          cid: "linkedin",
        },
      ],
    });

    res.send("Email sent successfully");
  } catch (err) {
    // Include key error properties to help diagnose ETIMEDOUT vs auth vs TLS
    log("send-email error:", {
      name: err.name,
      code: err.code,
      command: err.command,
      message: err.message,
      response: err.response,
    });
    res.status(500).send("Failed to send email");
  }
});

// --- start server ---
app.listen(PORT, () => {
  log(`Server running on http://localhost:${PORT}`);
});
