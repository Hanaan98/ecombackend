// server.js
require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' })); // for JSON fallbacks
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // for form fallbacks

// --- Multer config (PDF only, size limit 5MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

// --- Nodemailer transporter (create once)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.dreamhost.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // STARTTLS on 587
  auth: {
    user: process.env.DREAMHOST_EMAIL,
    pass: process.env.DREAMHOST_PASS
  },
  logger: Boolean(process.env.MAIL_LOGGER || false), // set MAIL_LOGGER=1 to enable
  debug: Boolean(process.env.MAIL_DEBUG || false)     // set MAIL_DEBUG=1 to enable verbose SMTP logs
});

// Optional: listen to nodemailer logs (when debug enabled)
transporter.on('log', info => {
  if (process.env.MAIL_DEBUG) console.log('[SMTP LOG]', info);
});
transporter.on('error', err => {
  console.error('[SMTP ERROR EVENT]', err);
});

// --- Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// --- Email route
app.post('/send-email', upload.single('payslip'), async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const payslipPdf = req.file;

    // Basic validation
    if (!email || !name || !payslipPdf) {
      const missing = [
        !name ? 'name' : null,
        !email ? 'email' : null,
        !payslipPdf ? 'payslip (PDF)' : null
      ].filter(Boolean);
      return res.status(400).json({ ok: false, error: 'Missing required data', missing });
    }

    // Additional content validation (MIME already checked)
    if (payslipPdf.mimetype !== 'application/pdf') {
      return res.status(400).json({ ok: false, error: 'Only PDF files are allowed' });
    }

    // From should generally be the authenticated user
    const fromAddress = process.env.DREAMHOST_EMAIL;
    if (!fromAddress) {
      return res.status(500).json({ ok: false, error: 'Email sender is not configured (DREAMHOST_EMAIL missing)' });
    }

    // Build absolute paths for CID images
    const publicDir = path.join(__dirname, 'public');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #000;">
        <p>Hi ${escapeHtml(name)},</p>
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
          <a href="https://www.facebook.com/ecommercesteem0"><img src="cid:icon" alt="Facebook" /></a>
          <a href="https://www.instagram.com/ecommercesteem/"><img src="cid:instagram" alt="Instagram" /></a>
          <a href="https://www.linkedin.com/company/ecommercesteem-ltd/"><img src="cid:linkedin" alt="LinkedIn" /></a>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Ecommercesteem" <${fromAddress}>`,
      to: email,
      subject: `Your Payslip`,
      html,
      attachments: [
        {
          filename: `Payslip-${sanitizeFilename(name)}.pdf`,
          content: payslipPdf.buffer,
          contentType: 'application/pdf'
        },
        { filename: 'logo.png',     path: path.join(publicDir, 'logo.png'),     cid: 'logo' },
        { filename: 'icon.png',     path: path.join(publicDir, 'icon.png'),     cid: 'icon' },
        { filename: 'instagram.png',path: path.join(publicDir, 'instagram.png'),cid: 'instagram' },
        { filename: 'linkedin.png', path: path.join(publicDir, 'linkedin.png'), cid: 'linkedin' }
      ]
    });

    // If we got here, SMTP accepted the message (queued by remote)
    return res.json({
      ok: true,
      message: 'Email handed to SMTP server',
      messageId: info.messageId,
      response: info.response
    });
  } catch (err) {
    // Classify common errors
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ ok: false, error: 'PDF too large (max 5MB)' });
      }
      return res.status(400).json({ ok: false, error: `Upload error: ${err.message}` });
    }

    // Nodemailer / network errors
    const isConnErr = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ESOCKET', 'EAUTH'].includes(err.code);
    const status = isConnErr ? 502 : 500;
    console.error('[SEND-EMAIL ERROR]', {
      name: err.name,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    return res.status(status).json({
      ok: false,
      error: 'Failed to send email',
      details: process.env.NODE_ENV === 'production' ? undefined : {
        name: err.name,
        code: err.code,
        message: err.message
      }
    });
  }
});

// --- Global error handler (last)
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT ERROR]', err);
  res.status(500).json({ ok: false, error: 'Unexpected server error' });
});

// --- Startup: verify transporter before listening
(async () => {
  try {
    if (!process.env.DREAMHOST_EMAIL || !process.env.DREAMHOST_PASS) {
      throw new Error('Missing DREAMHOST_EMAIL or DREAMHOST_PASS in environment');
    }
    console.log('Verifying SMTP transport...');
    const verifyRes = await transporter.verify();
    console.log('SMTP transport verified:', verifyRes);

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('SMTP verification failed. Server not started.');
    console.error(err);
    process.exit(1);
  }
})();

// --- Helpers
function sanitizeFilename(str = '') {
  return String(str).replace(/[\/\\?%*:|"<>]/g, '-').slice(0, 100);
}
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
