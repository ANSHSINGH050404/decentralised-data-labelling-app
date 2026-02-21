import Router from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../db";
import { authMiddleware } from "../middlewares/authMiddleware";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "crypto";
import { createTaskInput } from "../types";
import { z } from "zod";
import { TOTAL_DECIMALS } from "../config";
import { Connection, PublicKey } from "@solana/web3.js";

const router = Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const PARENT_WALLET_ADDRESS = "9ot6dE3PaWePG3mvEHmaNvXopTweV1D72N6Xp8T9NK3B";
const LAMPORTS_PER_IMAGE = 100_000_000; // 0.1 SOL
const DEFAULT_TITLE = "Select the most clickable thumbnail";
const connection = new Connection(process.env.RPC_URL! ?? "");

// ─── Presigned URL ────────────────────────────────────────────────────────────
router.get("/presignedUrl", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const key = `fever/${userId}/${randomUUID()}.jpg`;

  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: process.env.BUCKET_NAME!,
    Key: key,
    Conditions: [
      ["content-length-range", 0, 5 * 1024 * 1024],
      ["starts-with", "$Content-Type", "image/"],
    ],
    Expires: 3600,
  });

  res.json({ url, fields, key });
});

// ─── Sign in ──────────────────────────────────────────────────────────────────
router.post("/signin", async (req, res) => {
  const { publicKey, signature } = req.body;

  if (!publicKey || typeof publicKey !== "string") {
    return res.status(400).json({ message: "publicKey is required" });
  }

  if (!signature || typeof signature !== "object") {
    return res.status(400).json({ message: "signature is required" });
  }

  const existingUser = await prisma.user.findUnique({
    where: { address: publicKey },
  });

  if (existingUser) {
    const token = jwt.sign(
      { userId: existingUser.id },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
    return res.json({ token });
  }

  const newUser = await prisma.user.create({
    data: { address: publicKey },
  });

  const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });

  res.json({ token });
});

// ─── Create task ──────────────────────────────────────────────────────────────
router.post("/task", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const parsedBody = createTaskInput.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ message: "Invalid input" });
  }

  const { signature, options, title } = parsedBody.data;
  const imageCount = options.length;
  const expectedLamports = LAMPORTS_PER_IMAGE * imageCount; // scales with image count

  // 1. Fetch the on-chain transaction — wrapped in try/catch to handle network errors
  let transaction;
  try {
    transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 1,
    });
  } catch (err) {
    console.error("Failed to fetch transaction:", err);
    return res.status(400).json({ message: "Could not fetch transaction" });
  }

  if (!transaction) {
    return res.status(411).json({ message: "Transaction not found on-chain" });
  }

  const accountKeys = transaction.transaction.message.getAccountKeys();

  // 2. Find the treasury wallet dynamically — don't assume it's always at index 1
  let treasuryIndex = -1;
  for (let i = 0; i < accountKeys.length; i++) {
    if (accountKeys.get(i)?.toString() === PARENT_WALLET_ADDRESS) {
      treasuryIndex = i;
      break;
    }
  }

  if (treasuryIndex === -1) {
    return res.status(411).json({ message: "Transaction sent to wrong address" });
  }

  // 3. Verify the treasury received the correct amount for the number of images
  const preBalance = transaction.meta?.preBalances[treasuryIndex] ?? 0;
  const postBalance = transaction.meta?.postBalances[treasuryIndex] ?? 0;
  if (postBalance - preBalance !== expectedLamports) {
    return res.status(411).json({
      message: `Incorrect payment. Expected ${expectedLamports} lamports for ${imageCount} image(s).`,
    });
  }

  // 4. Fetch the authenticated user
  const user = await prisma.user.findFirst({
    where: { id: Number(userId) },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // 5. Verify sender matches the authenticated user's wallet — don't assume index 0
  let senderIndex = -1;
  for (let i = 0; i < accountKeys.length; i++) {
    if (accountKeys.get(i)?.toString() === user.address) {
      senderIndex = i;
      break;
    }
  }

  if (senderIndex === -1) {
    return res.status(411).json({
      message: "Transaction was not sent from your registered wallet",
    });
  }

  // 6. Create task and options
  const task = await prisma.task.create({
    data: {
      title: title ?? DEFAULT_TITLE,
      amount: BigInt(imageCount * TOTAL_DECIMALS), // fixed: scale with image count
      signature,
      user_id: req.userId!,
    },
  });

  await prisma.option.createMany({
    data: options.map((x) => ({
      image_url: x.imageUrl,
      task_id: task.id,
    })),
  });

  res.json({
    message: "Task created successfully",
    id: task.id,
  });
});

// ─── Get task ─────────────────────────────────────────────────────────────────
const taskQuerySchema = z.object({
  taskId: z.string().regex(/^\d+$/).transform(Number),
});

router.get("/task", authMiddleware, async (req, res) => {
  try {
    const parsed = taskQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid taskId" });
    }

    const taskId = parsed.data.taskId;
    const userId = Number(req.userId);

    const taskDetails = await prisma.task.findFirst({
      where: {
        user_id: userId,
        id: taskId,
      },
      include: {
        options: true,
        submissions: {
          select: { option_id: true },
        },
      },
    });

    if (!taskDetails) {
      return res.status(403).json({ message: "You don't have access to this task" });
    }

    res.json({
      ...taskDetails,
      amount: taskDetails.amount.toString(), // BigInt → string for JSON
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─── Get balance ──────────────────────────────────────────────────────────────
router.get("/balance", authMiddleware, async (req, res) => {
  const userId = req.userId!;

  const user = await prisma.user.findFirst({
    where: { id: Number(userId) },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // Fixed: actually return balance fields, not just address
  res.json({
    userId: user.id,
    address: user.address,
  });
});

export default router;