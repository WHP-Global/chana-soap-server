import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();

// กำหนดให้รับคำขอจากโดเมนที่ต้องการ
const corsOptions = {
  origin: [
    "http://www.chanasoapofficial.com",
    "http://localhost:5173",
    "https://drive.google.com",
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions)); // ใช้ cors ในการตั้งค่า
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ตั้งค่า static file สำหรับเสิร์ฟไฟล์ใน public directory
const publicDir = path.resolve(__dirname, "public");
// app.use(express.static(publicDir)); // เสิร์ฟไฟล์จากโฟลเดอร์ public
// ตั้งค่า static file พร้อม Cache-Control
app.use(
  express.static(publicDir, {
    setHeaders: (res, filePath) => {
      if (filePath.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        res.setHeader("Cache-Control", "public, max-age=0");
      } else {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, private"
        ); // ไม่แคช
      }
    },
  })
);

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
        q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType='video/mp4')`,
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

// ฟังก์ชันดาวน์โหลดไฟล์จาก Google Drive
const downloadFile = async (fileId, savePath) => {
  const dest = fs.createWriteStream(savePath);
  await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
    (err, res) => {
      if (err) return console.error("Error downloading file:", err);
      res.data.pipe(dest);
      dest.on("finish", () => console.log(`Downloaded: ${savePath}`));
    }
  );
};

// Sync ไฟล์จาก Google Drive ไปยังโฟลเดอร์ public
const syncFilesToPublic = async (parentFolderId) => {
  try {
    const driveFiles = await getFilesFromSubfolders(parentFolderId);

    // โฟลเดอร์ที่ต้องการเก็บไฟล์
    const folderPaths = [
      "AboutUs",
      "ActiveRefresh",
      "AloeVera",
      "ContactUs",
      "EmpoweringFarmerProject",
      "EqLife",
      "GentleGlow",
      "Logo",
      "Products",
      "Projects",
    ].map((folder) => path.join(publicDir, folder));

    // สร้างโฟลเดอร์ใน local หากยังไม่มี
    for (const folderPath of folderPaths) {
      if (!fs.existsSync(folderPath))
        fs.mkdirSync(folderPath, { recursive: true });
    }

    // ดึงข้อมูลไฟล์จาก local เพื่อตรวจสอบ fileId
    const getLocalFileMetadata = (folderPath) => {
      return fs.readdirSync(folderPath).map((fileName) => {
        const filePath = path.join(folderPath, fileName);
        const metadataPath = `${filePath}.meta.json`;
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
          return { fileName, fileId: metadata.fileId };
        }
        return { fileName, fileId: null };
      });
    };

    // ดาวน์โหลดไฟล์จาก Google Drive
    for (const file of driveFiles) {
      const folderPath = path.join(publicDir, file.folder);
      const localFilePath = path.join(folderPath, file.name);
      const metadataPath = `${localFilePath}.meta.json`;

      // ตรวจสอบว่ามีไฟล์อยู่แล้วหรือไม่
      const localFiles = getLocalFileMetadata(folderPath);
      const existingFile = localFiles.find((f) => f.fileName === file.name);

      if (!existingFile || existingFile.fileId !== file.id) {
        if (existingFile) {
          console.log(`File ID changed: ${file.name} - Redownloading...`);
          fs.unlinkSync(localFilePath); // ลบไฟล์เก่า
          if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
        } else {
          console.log(`New file: ${file.name} - Downloading...`);
        }

        await downloadFile(file.id, localFilePath);

        // บันทึกข้อมูลไฟล์ (fileId) ลงใน metadata
        fs.writeFileSync(metadataPath, JSON.stringify({ fileId: file.id }));
      }
    }

    // ฟังก์ชันตรวจสอบและลบไฟล์ที่ไม่ได้อยู่ใน Google Drive
    const syncFolders = (folderPath, files) => {
      const localFiles = fs.readdirSync(folderPath);
      for (const localFile of localFiles) {
        if (localFile.endsWith(".meta.json")) continue; // ข้ามไฟล์ metadata

        const localFilePath = path.join(folderPath, localFile);
        const metadataPath = `${localFilePath}.meta.json`;
        const isFileExist = files.some((f) => f.name === localFile);

        if (!isFileExist) {
          fs.unlinkSync(localFilePath); // ลบไฟล์
          if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath); // ลบ metadata
          console.log(`Deleted old file: ${localFilePath}`);
        }
      }
    };

    // Synchronize file9s
    for (const folderPath of folderPaths) {
      const folderName = path.basename(folderPath);
      const filesInFolder = driveFiles.filter((f) => f.folder === folderName);
      syncFolders(folderPath, filesInFolder);
    }

    console.log("Sync completed!");
  } catch (error) {
    console.error("Sync error:", error);
  }
};

// ตั้งเวลาให้ทำการซิงค์ทุก 6 ชั่วโมง
// setInterval(() => {
//   syncFilesToPublic("1rIoleDibJGQzSZ66CI3DEFxWb6tLwbA3");
// }, 60 * 1000);
// }, 6 * 60 * 60 * 1000);

const subFolderIds = [
  "1NS94758xD56jItF6V9oQaKRtyVSQueGv",
  "1vBaSau2sKnLRoCxrPf6_mbfBoKN9U18T",
  "1Gl2Isxa83ax501HJ_TzR887uFjJ-RrWN",
  "1esDkxIglMQywAtGMuHkAhrclyn7KyNpR",
  "1ljWudpXuaG7-ODM54r2NQ7IkQUotEb20",
  "1CVvb53BwjtjrY3mQAVOO__8LAkYhT4z8",
  "12TiwQucx6zrWw_h4qD6-Ii-KLyjAuKac",
  "1xVwdRy3Ehc2pIAKnGR8e7BmxqqF1WU9s",
  "10cMtSg3AOebsrKjovqYjeec9WiwF2dhH",
  "1YTbaEXbfJ59o8rgZRAsfbcKn8VxO5j3H",
];

// Route สำหรับรับการแจ้งเตือนจาก Google Drive
app.post("/drive-webhook", async (req, res) => {
  console.log("Received Drive Webhook:", req.headers);

  // ตรวจสอบว่าเกิดการเปลี่ยนแปลง
  let resourceId = req.headers["x-goog-channel-id"];
  const resourceState = req.headers["x-goog-resource-state"];

  // ตัดคำว่า 'channel-' ออก
  resourceId = resourceId.replace("channel-", "").split("-")[0];
  console.log("resourceId", resourceId);

  if (resourceState === "update") {
    // ตรวจสอบว่า resourceId ตรงกับ subFolderIds หรือไม่
    const isValidFolder = subFolderIds.some(
      (folderId) => folderId === resourceId
    );

    if (isValidFolder) {
      console.log(`Folder ID ${resourceId} changed - Syncing new files...`);
      syncFilesToPublic(resourceId);
    } else {
      console.log(`No relevant change detected for Folder ID: ${resourceId}`);
    }
  }

  res.status(200).send("OK");
});

// ฟังก์ชันสมัครรับการแจ้งเตือน (Watch)
const watchDriveFolder = async (folderId) => {
  try {
    const response = await drive.files.watch({
      fileId: folderId,
      requestBody: {
        id: "your-unique-channel-main-folder", // ต้องไม่ซ้ำกับ channel อื่น
        type: "web_hook",
        address:
          "https://f444-2001-fb1-ae-6f89-8952-adfe-250c-954d.ngrok-free.app/drive-webhook", // Use the correct HTTPS URL here
      },
    });
    console.log("Watch response:", response.data);
  } catch (error) {
    console.error("Error setting up Drive watch:", error.message);
  }
};

const watchSubfolders = async () => {
  try {
    for (const folderId of subFolderIds) {
      const uniqueChannelId = `channel-${folderId}-${Date.now()}`; // Make the ID unique
      await drive.files.watch({
        fileId: folderId,
        requestBody: {
          id: uniqueChannelId, // Unique channel ID
          type: "web_hook",
          address:
            "https://f444-2001-fb1-ae-6f89-8952-adfe-250c-954d.ngrok-free.app/drive-webhook", // URL that will receive notifications
        },
      });
      console.log(`Watch set for folder: ${folderId}`);
      syncFilesToPublic("1rIoleDibJGQzSZ66CI3DEFxWb6tLwbA3");
    }
  } catch (error) {
    console.error("Error setting up watch:", error);
  }
};

watchSubfolders();

// เรียกใช้ฟังก์ชัน watch เมื่อเซิร์ฟเวอร์เริ่มทำงาน
watchDriveFolder("1rIoleDibJGQzSZ66CI3DEFxWb6tLwbA3");

// สร้าง route สำหรับดึงไฟล์ทั้งหมดจากโฟลเดอร์ย่อย
app.get("/api/files/:parentFolderId", async (req, res) => {
  const { parentFolderId } = req.params; // รับ Parent Folder ID จาก URL
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
  const { dataFromInput, subject, filePath } = req.body;
  const emailOptions = {
    from: process.env.EMAIL_USER,
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
    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    res.status(500).json({ message: `Error: ${error.message}` });
  }
});

// เริ่ม server ที่พอร์ต 8888
app.listen(8888, "0.0.0.0", () => console.log("Server running on port 8888"));
