import { Router } from "express";
import { getNextTask, prisma } from "../../db";
import jwt from "jsonwebtoken";
import { createSubmissionInput } from "../types";
import { workerMiddleware } from "../middlewares/authMiddleware";
import { TOTAL_DECIMALS, TOTAL_SUBMISSIONS } from "../config";

const router = Router();

export const WORKERJWT_SECRET = process.env.JWT_SECRET! + "worker";

router.post("/signin", async (req, res) => {
  const hardcodedWalletAddress = "0x1234567890123456789012345678901234567890";

  const existingUser = await prisma.worker.findUnique({
    where: {
      address: hardcodedWalletAddress,
    },
  });

  if (existingUser) {
    const token = jwt.sign(
      {
        userId: existingUser.id,
      },
      WORKERJWT_SECRET,
      { expiresIn: "1h" },
    );
    res.json({ token });
  } else {
    const newUser = await prisma.worker.create({
      data: {
        address: hardcodedWalletAddress,
        pending_amount: 0,
        locked_amount: 0,
      },
    });
    const token = jwt.sign({ userId: newUser.id }, WORKERJWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  }
});

router.get("/nextTask", workerMiddleware, async (req, res) => {
  const userId = req.userId;
  console.log(userId);

  const task = await getNextTask(Number(userId));

  if (!task) {
    res.status(411).json({
      message: "No more tasks left for you to review",
    });
  } else {
    res.json({
      task,
    });
  }
});

router.post("/submission", workerMiddleware, async (req, res) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const body = req.body;
  const parsedBody = createSubmissionInput.safeParse(body);

  if (parsedBody.success) {
    const task = await getNextTask(Number(userId));
    if (!task || task?.id !== Number(parsedBody.data.taskId)) {
      return res.status(411).json({
        message: "Incorrect task id",
      });
    }

    const amount = BigInt(task.amount) / BigInt(TOTAL_SUBMISSIONS);

    const submission = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.create({
        data: {
          option_id: Number(parsedBody.data.selection),
          worker_id: Number(userId),
          task_id: Number(parsedBody.data.taskId),
          amount: amount,
        },
      });

      await tx.worker.update({
        where: {
          id: Number(userId),
        },
        data: {
          pending_amount: {
            increment: amount * BigInt(TOTAL_DECIMALS),
          },
        },
      });

      return submission;
    });

    const nextTask = await getNextTask(Number(userId));
    res.json({
      nextTask,
      amount,
    });
  } else {
    res.status(411).json({
      message: "Incorrect inputs",
    });
  }
});

export default router;
console.log();
