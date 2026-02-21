import { Router } from "express";
import jwt from "jsonwebtoken";
import nacl from "tweetnacl";
import { prisma } from "../../db";
import { authMiddleware } from "../middlewares/authMiddleware";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "crypto";
import { createTaskInput } from "../types";
import { z } from "zod";
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
const connection = new Connection(process.env.RPC_URL! ?? "https://api.devnet.solana.com");

// ─── Presigned URL ────────────────────────────────────────────────────────────

/**
 * GET /presignedUrl
 * Returns a short-lived S3 presigned POST URL scoped to the authenticated user.
 * The key is namespaced by userId to prevent path traversal / overwriting other users' files.
 */
router.get("/presignedUrl", authMiddleware, async (req, res) => {
  const userId = req.userId!;

  try {
    // Namespace by userId so users cannot overwrite each other's uploads
    const key = `uploads/${userId}/${randomUUID()}.jpg`;

    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: process.env.BUCKET_NAME!,
      Key: key,
      Conditions: [
        // FIX: enforce a strict size limit to prevent large file abuse
        ["content-length-range", 1, 5 * 1024 * 1024], // 1 byte min, 5 MB max
        // Note: Content-Type restriction only validates the declared MIME type.
        // True file-type validation requires server-side inspection (e.g. via
        // a Lambda trigger on S3 PutObject using the `file-type` package).
        ["starts-with", "$Content-Type", "image/"],
      ],
      Fields: {
        // FIX: lock the key so the client cannot override it in the POST form
        key,
      },
      Expires: 300, // FIX: reduced from 3600s (1hr) to 300s (5min) — principle of least privilege
    });

    res.json({ url, fields, key });
  } catch (err) {
    console.error("[GET /presignedUrl]", err);
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
});

// ─── Sign in ──────────────────────────────────────────────────────────────────

/**
 * POST /signin
 * Verifies a Solana wallet signature and issues a JWT.
 *
 * Body: { publicKey: string, signature: { data: number[] } }
 */
router.post("/signin", async (req, res) => {
  const { publicKey, signature } = req.body;

  // Validate inputs before any crypto operations
  if (!publicKey || typeof publicKey !== "string") {
    return res.status(400).json({ message: "publicKey is required" });
  }

  // FIX: signature is an object { data: number[] }, not a plain string
  if (!signature || !Array.isArray(signature.data)) {
    return res.status(400).json({
      message: "signature is required and must be an object with a data array",
    });
  }

  try {
    // FIX: actually verify the wallet signature (was completely missing before)
    // Without this, anyone who knows a user's public key can sign in as them.
    const message = new TextEncoder().encode(
      "Sign this message into LabelFlow to get started"
    );

    const isValid = nacl.sign.detached.verify(
      message,
      new Uint8Array(signature.data),
      new PublicKey(publicKey).toBytes()
    );

    if (!isValid) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { address: publicKey },
    });

    if (existingUser) {
      const token = jwt.sign(
        { userId: existingUser.id },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" }
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
  } catch (err) {
    console.error("[POST /signin]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Create task ──────────────────────────────────────────────────────────────

/**
 * POST /task
 * Verifies an on-chain payment and creates a labelling task with options.
 *
 * Body: { signature: string, options: { imageUrl: string }[], title?: string }
 */
router.post("/task", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const parsedBody = createTaskInput.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ message: "Invalid input", errors: parsedBody.error.flatten() });
  }

  const { signature, options, title } = parsedBody.data;
  const imageCount = options.length;
  const expectedLamports = LAMPORTS_PER_IMAGE * imageCount;

  try {
    // FIX: prevent signature replay — one transaction hash can only create one task
    const existingTask = await prisma.task.findFirst({ where: { signature } });
    if (existingTask) {
      return res.status(409).json({ message: "This transaction has already been used to create a task" });
    }

    // 1. Fetch the on-chain transaction
    let transaction;
    try {
      transaction = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 1,
      });
    } catch (err) {
      console.error("Failed to fetch transaction:", err);
      return res.status(400).json({ message: "Could not fetch transaction from the network" });
    }

    if (!transaction) {
      return res.status(411).json({ message: "Transaction not found on-chain" });
    }

    const accountKeys = transaction.transaction.message.getAccountKeys();

    // 2. Find the treasury wallet index dynamically (don't assume it's always at index 1)
    let treasuryIndex = -1;
    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys.get(i)?.toString() === PARENT_WALLET_ADDRESS) {
        treasuryIndex = i;
        break;
      }
    }

    if (treasuryIndex === -1) {
      return res.status(411).json({ message: "Transaction was not sent to the correct treasury address" });
    }

    // 3. Verify the treasury received the correct amount
    const preBalance = transaction.meta?.preBalances[treasuryIndex] ?? 0;
    const postBalance = transaction.meta?.postBalances[treasuryIndex] ?? 0;
    const received = postBalance - preBalance;

    if (received !== expectedLamports) {
      return res.status(411).json({
        message: `Incorrect payment. Expected ${expectedLamports} lamports for ${imageCount} image(s), but received ${received}.`,
      });
    }

    // 4. Fetch the authenticated user
    const user = await prisma.user.findFirst({
      where: { id: Number(userId) },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 5. Verify the transaction was sent from the authenticated user's wallet
    let senderIndex = -1;
    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys.get(i)?.toString() === user.address) {
        senderIndex = i;
        break;
      }
    }

    if (senderIndex === -1) {
      return res.status(411).json({
        message: "Transaction was not sent from your registered wallet address",
      });
    }

    // 6. Create the task and its options atomically
    // FIX: store the actual lamports received on-chain as the task amount,
    // so the worker payout logic divides real received funds — not a
    // mismatched TOTAL_DECIMALS-scaled value.
    const task = await prisma.$transaction(async (tx) => {
      const newTask = await tx.task.create({
        data: {
          title: title ?? DEFAULT_TITLE,
          amount: BigInt(expectedLamports), // FIX: lamports received, not imageCount * TOTAL_DECIMALS
          signature,
          user_id: Number(userId),
        },
      });

      await tx.option.createMany({
        data: options.map((opt) => ({
          image_url: opt.imageUrl,
          task_id: newTask.id,
        })),
      });

      return newTask;
    });

    res.status(201).json({
      message: "Task created successfully",
      id: task.id,
    });
  } catch (err) {
    console.error("[POST /task]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Get task ─────────────────────────────────────────────────────────────────

const taskQuerySchema = z.object({
  taskId: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * GET /task?taskId=<id>
 * Returns task details including options and submission counts.
 * Only accessible by the task's owner.
 */
router.get("/task", authMiddleware, async (req, res) => {
  try {
    const parsed = taskQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid or missing taskId" });
    }

    const taskId = parsed.data.taskId;
    const userId = Number(req.userId);

    const taskDetails = await prisma.task.findFirst({
      where: {
        id: taskId,
        user_id: userId, // scoped to owner — prevents accessing other users' tasks
      },
      include: {
        options: {
          include: {
            // Include submission counts per option so the frontend can show results
            submissions: {
              select: { id: true },
            },
          },
        },
        submissions: {
          select: { option_id: true },
        },
      },
    });

    if (!taskDetails) {
      // Use 403 rather than 404 to avoid leaking whether a task ID exists
      return res.status(403).json({ message: "You don't have access to this task" });
    }

    // Aggregate submission counts per option for convenience
    const optionsWithCounts = taskDetails.options.map((opt) => ({
      id: opt.id,
      image_url: opt.image_url,
      submissionCount: opt.submissions.length,
    }));

    res.json({
      id: taskDetails.id,
      title: taskDetails.title,
      done: taskDetails.done,
      amount: taskDetails.amount.toString(), // BigInt → string for JSON safety
      signature: taskDetails.signature,
      options: optionsWithCounts,
      totalSubmissions: taskDetails.submissions.length,
    });
  } catch (err) {
    console.error("[GET /task]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Get all tasks for user ───────────────────────────────────────────────────

/**
 * GET /tasks
 * Returns all tasks created by the authenticated user.
 */
router.get("/tasks", authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.userId);

    const tasks = await prisma.task.findMany({
      where: { user_id: userId },
      include: {
        options: true,
        _count: { select: { submissions: true } },
      },
      orderBy: { id: "desc" },
    });

    res.json(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        done: t.done,
        amount: t.amount.toString(),
        submissionCount: t._count.submissions,
        options: t.options,
      }))
    );
  } catch (err) {
    console.error("[GET /tasks]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;