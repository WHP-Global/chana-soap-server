import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// กำหนดให้รับคำขอจากโดเมนที่ต้องการ
const corsOptions = {
  origin: "http://www.artandalice.co/",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions)); // ใช้ cors ในการตั้งค่า

// app.use(cors()); // ใช้ cors ในการตั้งค่า

app.use(express.json());

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_USER,
  service: "gmail",
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post("/send-email", async (req, res) => {
  console.log("req.body", req.body);
  const { dataFromInput, subject } = req.body;
  const emailOptions = {
    from: process.env.EMAIL_USER, // ใช้บัญชีของเซิร์ฟเวอร์เป็นผู้ส่ง
    // to: "chanasoapsetting@gmail.com",
    to: "info@chanasoapofficial.com",
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
    if (error.responseCode === 535 || error.responseCode === 550) {
      // SMTP authentication หรือ invalid recipient
      createError(400, "Invalid email or authentication error");
    } else if (error.code === "ECONNREFUSED") {
      // การเชื่อมต่อ SMTP ล้มเหลว
      createError(503, "Email service unavailable");
    } else {
      // ข้อผิดพลาดทั่วไป
      createError(500, `Failed to send email ${error}`);
    }
  }
});

app.listen(8888, "0.0.0.0", () => console.log("Server running on port 8888"));
