import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis"; // เพิ่ม import สำหรับ googleapis
import path from "path";
import fs from "fs";

dotenv.config();
const app = express();

// กำหนดให้รับคำขอจากโดเมนที่ต้องการ
// ตั้งค่า CORS ให้อนุญาตจาก localhost
const corsOptions = {
  origin: ["http://www.chanasoapofficial.com", "http://localhost:5173"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions)); // ใช้ cors ในการตั้งค่า
app.use(express.json());

// ตั้งค่าการรับรองความถูกต้องสำหรับ Google Drive API
const auth = new google.auth.GoogleAuth({
  keyFile: "./chana-soap-740b8cec8dce.json", // ใส่ path ของไฟล์ Service Account ที่ดาวน์โหลดมา
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// เพิ่มฟังก์ชันดึงไฟล์จากทุกโฟลเดอร์ย่อยใน Google Drive
const getFilesFromSubfolders = async (parentFolderId) => {
  try {
    // ดึงรายชื่อโฟลเดอร์ย่อยจากโฟลเดอร์หลัก
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "files(id, name)",
    });

    const subfolders = res.data.files;

    let allFiles = [];

    // สำหรับแต่ละโฟลเดอร์ย่อย เราจะดึงไฟล์จากโฟลเดอร์นั้น
    for (const folder of subfolders) {
      const folderId = folder.id;
      const files = await drive.files.list({
        q: `'${folderId}' in parents`,
        fields: "files(id, name)",
      });

      const folderFiles = files.data.files.map((file) => ({
        id: file.id,
        name: file.name,
        folder: folder.name,
      }));

      allFiles = [...allFiles, ...folderFiles];
    }

    return allFiles; // คืนค่ารายการไฟล์ทั้งหมดจากโฟลเดอร์ย่อย
  } catch (error) {
    console.error("Error fetching files from subfolders:", error);
    throw new Error("Error fetching files from subfolders");
  }
};

// สร้าง route สำหรับดึงไฟล์ทั้งหมดจากโฟลเดอร์ย่อย
app.get("/api/files/:parentFolderId", async (req, res) => {
  const { parentFolderId } = req.params; // รับ Parent Folder ID จาก URL
  // ตั้งค่า Cache-Control เพื่อบังคับไม่ให้แคช
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  try {
    const files = await getFilesFromSubfolders(parentFolderId);
    res.status(200).json({ files });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ฟังก์ชันการส่งอีเมล
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_USER,
  service: "gmail",
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Route สำหรับส่งอีเมล
app.post("/send-email", async (req, res) => {
  console.log("req.body", req.body);
  const { dataFromInput, subject, filePath } = req.body; // รับไฟล์ path จาก body request
  const emailOptions = {
    from: process.env.EMAIL_USER, // ใช้บัญชีของเซิร์ฟเวอร์เป็นผู้ส่ง
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
    // ส่งอีเมล
    await transporter.sendMail(emailOptions);
    console.log("Verification email sent!");

    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error(`Error sending email: ${error.message}`);
    res.status(500).json({ message: `Error: ${error.message}` });
  }
});

app.listen(8888, "0.0.0.0", () => console.log("Server running on port 8888"));
