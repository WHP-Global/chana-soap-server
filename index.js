import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// กำหนดให้รับคำขอจากโดเมนที่ต้องการ
const corsOptions = {
  origin: "https://www.artandalice.co",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions)); // ใช้ cors ในการตั้งค่า
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com", // Zoho SMTP
  port: 465,
  secure: true, // ใช้ SSL
  auth: {
    user: process.env.EMAIL_USER, // Zoho email user เช่น "chanasoapsetting@gmail.com"
    pass: process.env.EMAIL_PASS, // รหัสผ่าน Zoho หรือ App Password (ถ้าเปิด 2FA)
  },
});

app.post("/send-email", async (req, res) => {
  console.log("req.body", req.body);
  const { dataFromInput, subject } = req.body;
  const emailOptions = {
    from: '"Art & Alice" <info@artandalice.co>', // ใช้บัญชีของเซิร์ฟเวอร์เป็นผู้ส่ง
    to: "info@artandalice.co",
    replyTo: dataFromInput.email,
    subject: subject,
    html: `
      <p>ชื่อ-นามสกุล: ${dataFromInput.name}</p>
      <p>อีเมล์: ${dataFromInput.email}</p>
      <p>เบอร์โทรศัพท์: ${dataFromInput.phone}</p>
      <p>------------------------------------------------------</p>
      <p>รายละเอียด</p>
      <p>${dataFromInput.message}</p>
    `,
  };

  try {
    await transporter.sendMail(emailOptions);
    console.log("Verification email sent!");
    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.listen(8888, "0.0.0.0", () => console.log("Server running on port 8888"));
