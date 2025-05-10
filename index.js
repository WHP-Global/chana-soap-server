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

// กำหนดให้รับคำขอจากโดเมนที่ต้องการ
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "https://www.artandalice.co",
      "http://localhost:5173",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT"],
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
  เมื่อคุณใช้แบบนี้: try {
    await transporter.sendMail(emailOptions);
    console.log("Verification email sent!");
    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// app.use(express.static(path.join(__dirname, "public")));
// app.use("/upload", uploadRoute);

// 👉 1. ให้เสิร์ฟ static ก่อน
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// 👉 2. จากนั้นให้ React จัดการ route ที่เหลือ
app.get(
  /^\/(?!.*\.(jpg|jpeg|png|gif|css|js|ico|svg|woff|ttf)).*$/,
  (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  }
);

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "public/AboutUs/"); // เก็บไฟล์ในโฟลเดอร์ public/AboutUs
//   },
//   filename: (req, file, cb) => {
//     cb(null, file.originalname); // ใช้ชื่อไฟล์เดิมจากฟอร์ม
//   },
// });

// // Route สำหรับอัปโหลดไฟล์
// app.post("/upload", upload.single("file"), (req, res) => {
//   if (req.file) {
//     res.json({
//       success: true,
//       filePath: `/AboutUs/${req.file.filename}`, // ส่ง path ของไฟล์กลับไปที่ frontend
//     });
//     console.log("req.file.filename", req.file.filename);
//   } else {
//     res.status(400).json({ success: false, message: "อัปโหลดล้มเหลว" });
//   }
// });

// ตั้งค่า storage สำหรับ multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/AboutUs/"); // กำหนดโฟลเดอร์ที่เก็บไฟล์
  },
  filename: (req, file, cb) => {
    // ดึงชื่อไฟล์จากฟอร์ม
    const filenameWithoutExtension = req.body.filename; // ชื่อไฟล์ที่ได้รับจาก frontend

    // ตรวจสอบนามสกุลไฟล์
    const extension = path.extname(file.originalname).toLowerCase();

    // ตั้งชื่อไฟล์ใหม่ให้เป็น .jpg หรือ .jpeg
    const newFileName =
      filenameWithoutExtension + (extension === ".jpeg" ? ".jpg" : extension); // เปลี่ยน .jpeg เป็น .jpg ถ้าต้องการ

    cb(null, newFileName); // บันทึกชื่อไฟล์ใหม่
  },
});

const upload = multer({ storage });

// Route สำหรับอัปโหลดไฟล์ (อัปเดตไฟล์)
const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

app.put("/upload", upload.single("file"), async (req, res) => {
  try {
    const uploadedFile = req.file;
    const customFileName = req.body.filename;
    const folderName = req.body.folderName; // รับข้อมูลชื่อโฟลเดอร์

    if (!uploadedFile) {
      return res
        .status(400)
        .json({ success: false, message: "ไม่พบไฟล์ที่อัปโหลด" });
    }

    if (!customFileName) {
      return res
        .status(400)
        .json({ success: false, message: "ไม่ระบุชื่อไฟล์ใหม่" });
    }

    if (!folderName) {
      return res
        .status(400)
        .json({ success: false, message: "ไม่ระบุชื่อโฟลเดอร์" });
    }

    // เช็คให้แน่ใจว่าโฟลเดอร์ที่ส่งมามีอยู่ในรายการที่อนุญาต
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

    if (!allowedFolders.includes(folderName)) {
      return res
        .status(400)
        .json({ success: false, message: "โฟลเดอร์ที่ระบุไม่ถูกต้อง" });
    }

    const folderPath = path.join(__dirname, "public", folderName);
    const newExtension = path.extname(uploadedFile.originalname).toLowerCase(); // เช่น .jpeg
    const baseName = path.basename(
      customFileName,
      path.extname(customFileName)
    ); // เช่น "swimming"
    const newFileName = baseName + newExtension;
    const newFilePath = path.join(folderPath, newFileName);

    // 🔥 ลบไฟล์เก่าทุกนามสกุล เช่น swimming.jpg, swimming.jpeg, swimming.png
    for (const ext of allowedExtensions) {
      const oldFilePath = path.join(folderPath, baseName + ext);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
        console.log(`ลบไฟล์เก่า: ${oldFilePath}`);
      }
    }

    // ✅ บันทึกไฟล์ใหม่
    fs.renameSync(uploadedFile.path, newFilePath);

    return res
      .status(200)
      .json({ success: true, filePath: `/${folderName}/${newFileName}` });
  } catch (error) {
    console.error("เกิดข้อผิดพลาด:", error);
    return res.status(500).json({ success: false, message: "อัปโหลดล้มเหลว" });
  }
});

// อ่านไฟล์แบบ recursive
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
      imagePaths.push("/" + relPath.replace(/\\/g, "/")); // ปรับให้ URL ใช้ / แม้เป็น Windows
    }
  }

  return imagePaths;
};

// Endpoint ดึงทุกรูป
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
