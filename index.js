import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import multer from "multer";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

// สร้างโฟลเดอร์ temp_uploads ถ้ายังไม่มี
const tempDir = path.join(__dirname, "temp_uploads");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "https://www.artandalice.co",
      "https://artandalice.co",
      "http://localhost:5173",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"], // เพิ่ม Cache-Control ที่นี่
};

app.use(cors(corsOptions));
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post("/send-email", async (req, res) => {
  const { dataFromInput, subject } = req.body;
  const emailOptions = {
    from: `"Art & Alice Website Contact" <info@artandalice.co>`,
    to: "info@artandalice.co",
    replyTo: dataFromInput.email,
    subject: `จากคุณ ${dataFromInput.name} - ${subject}`,
    html: `
      <p><strong>ชื่อ-นามสกุล:</strong> ${dataFromInput.name}</p>
      <p><strong>อีเมล์:</strong> ${dataFromInput.email}</p>
      <p><strong>เบอร์โทรศัพท์:</strong> ${dataFromInput.phone}</p>
      <hr />
      <p><strong>รายละเอียด:</strong></p>
      <p>${dataFromInput.message}</p>
    `,
  };

  try {
    await transporter.sendMail(emailOptions);
    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ✅ เปลี่ยนจาก query เป็น body เพื่อให้ใช้งานกับ form-data ได้
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderName = req.body.folderName;
    if (!folderName) {
      return cb(new Error("folderName is missing in body"));
    }
    const targetPath = path.join("public", folderName);
    cb(null, targetPath);
  },
  filename: (req, file, cb) => {
    const filenameWithoutExtension = req.body.filename;
    const extension = path.extname(file.originalname).toLowerCase();
    const newFileName =
      filenameWithoutExtension + (extension === ".jpeg" ? ".jpg" : extension);
    cb(null, newFileName);
  },
});

const upload = multer({
  dest: tempDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // limit 20MB
});

// อัปเดตไฟล์
app.put("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { filename, folderName } = req.body;
    const allowedFolders = [
      "AboutUs",
      "ActiveFresh",
      "AloeVera",
      "ContactUs",
      "EmpoweringFarmerProject",
      "EqLife",
      "GentleGlow",
      "logo",
      "Products",
      "Projects",
    ];
    const allowedExt = [".jpg", ".jpeg", ".png", ".webp"];

    // ตรวจสอบ input
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "ไม่พบไฟล์ที่อัปโหลด" });
    }
    if (!filename || !folderName) {
      return res.status(400).json({
        success: false,
        message: "กรุณาระบุทั้ง filename และ folderName",
      });
    }
    if (!allowedFolders.includes(folderName)) {
      return res
        .status(400)
        .json({ success: false, message: "โฟลเดอร์ที่ระบุไม่ถูกต้อง" });
    }

    // เตรียมโฟลเดอร์ปลายทาง
    const targetDir = path.join(__dirname, "public", folderName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // รีเนมไฟล์
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.includes(ext)) {
      return res
        .status(400)
        .json({ success: false, message: "ประเภทไฟล์ไม่รองรับ" });
    }
    const baseName = path.basename(filename, path.extname(filename));
    const newFileName = baseName + ext;
    const newFilePath = path.join(targetDir, newFileName);

    // ลบไฟล์เดิมที่มีนามสกุลต่างๆ
    for (const e of allowedExt) {
      const oldPath = path.join(targetDir, baseName + e);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // ย้ายไฟล์จาก temp ไป public
    fs.renameSync(file.path, newFilePath);

    res.json({ success: true, filePath: `/${folderName}/${newFileName}` });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: "อัปโหลดล้มเหลว" });
  }
});

const getAllImagePaths = (dirPath, baseUrl = "") => {
  let imagePaths = [];
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const relPath = path.join(baseUrl, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      imagePaths = imagePaths.concat(getAllImagePaths(fullPath, relPath));
    } else if (
      [".jpg", ".jpeg", ".png", ".gif", ".webp", ".jfif"].includes(
        path.extname(file).toLowerCase()
      )
    ) {
      imagePaths.push("/" + relPath.replace(/\\/g, "/"));
    }
  }

  return imagePaths;
};

app.get("/images", (req, res) => {
  try {
    const allImages = getAllImagePaths(publicPath);
    res.json({ success: true, images: allImages });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการอ่านรูป:", error);
    res.status(500).json({ success: false, message: "ดึงรูปไม่สำเร็จ" });
  }
});

app.listen(8888, "0.0.0.0", () => console.log("Server running on port 8888"));
