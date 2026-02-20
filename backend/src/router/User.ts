import Router from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../db";
import { authMiddleware } from "../middlewares/authMiddleware";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { randomUUID } from "crypto";
const router = Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

router.get("/presignedUrl", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const key = `fever/${userId}/${randomUUID()}.jpg`;

  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: process.env.BUCKET_NAME!,
    Key: key,

    Conditions: [
      ["content-length-range", 0, 5 * 1024 * 1024],
      ["starts-with", "$Content-Type", "image/"]
    ],

    Expires: 3600
  });

  console.log({url,fields});
  

  res.json({ url, fields, key });
});

router.post("/signin", async (req, res) => {
  const hardcodedWalletAddress = "0x1234567890123456789012345678901234567890";

  const existingUser = await prisma.user.findUnique({
    where: {
      address: hardcodedWalletAddress,
    },
  });

  if (existingUser) {
    const token = jwt.sign(
      {
        userId: existingUser.id,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
    res.json({ token });
  } else {
    const newUser = await prisma.user.create({
      data: {
        address: hardcodedWalletAddress,
      },
    });
    const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET!, {
      expiresIn: "1h",
    });
    res.json({ token });
  }
});

router

export default router;
