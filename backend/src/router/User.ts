import Router, { response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../db";
import { authMiddleware } from "../middlewares/authMiddleware";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "crypto";
import { createTaskInput } from "../types";
import {z} from "zod";
import { TOTAL_DECIMALS } from "../config";
const router = Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const DEFAULT_TITLE = "Select the most clickable thumbnail";
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

  console.log({ url, fields });

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

router.post("/task", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const body = req.body;
  const parsedBody = createTaskInput.safeParse(body);

  if (!parsedBody.success) {
    return res.status(400).json({
      message: "Invalid input",
    });
  }

  //parse the signature here to ensure that the user payed for the task

const task = await prisma.task.create({
  data: {
    title: parsedBody.data.title ?? DEFAULT_TITLE,
    amount: 1 * TOTAL_DECIMALS,
    signature: parsedBody.data.signature,
    user_id: req.userId!,
  },
});

await prisma.option.createMany({
  data: parsedBody.data.options.map((x) => ({
    image_url: x.imageUrl,
    task_id: task.id,
  })),
});

  res.json({
    message: "Task created successfully",
    id: task.id,
  });
});


const taskQuerySchema = z.object({
  taskId: z.string().regex(/^\d+$/).transform(Number)
});


router.get("/task", authMiddleware, async (req, res) => {
  try {
    const parsed = taskQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid taskId"
      });
    }

    const taskId = parsed.data.taskId;
    // @ts-ignore
    const userId = Number(req.userId);

    const taskDetails = await prisma.task.findFirst({
      where: {
        user_id: userId,
        id: taskId
      },
      include: {
        options: true
      }
    });

    if (!taskDetails) {
      return res.status(403).json({
        message: "You dont have access to this task"
      });
    }

    res.json(taskDetails);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/balance", authMiddleware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId;

    const worker = await prisma.worker.findFirst({
        where: {
            id: Number(userId)
        }
    })

    res.json({
        pendingAmount: worker?.pending_amount,
        lockedAmount: worker?.pending_amount,
    })
})


export default router;
