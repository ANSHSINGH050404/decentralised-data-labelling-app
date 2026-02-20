import { Router } from "express";
import { getNextTask, prisma } from "../../db";
import jwt from "jsonwebtoken";
import { createSubmissionInput } from "../types";
import { workerMiddleware } from "../middlewares/authMiddleware";
import { TOTAL_DECIMALS, TOTAL_SUBMISSIONS } from "../config";

const router = Router();

export const WORKERJWT_SECRET = process.env.JWT_SECRET! + "worker";

router.post("/signin", async (req, res) => {
  const { publicKey } = req.body;

  if (!publicKey || typeof publicKey !== "string") {
    return res.status(400).json({ message: "publicKey is required" });
  }

  const existingWorker = await prisma.worker.findUnique({
    where: { address: publicKey },
  });

  if (existingWorker) {
    const token = jwt.sign({ userId: existingWorker.id }, WORKERJWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } else {
    const newWorker = await prisma.worker.create({
      data: {
        address: publicKey,
        pending_amount: 0,
        locked_amount: 0,
      },
    });
    const token = jwt.sign({ userId: newWorker.id }, WORKERJWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  }
});

router.get("/nextTask", workerMiddleware, async (req, res) => {
  const userId = req.userId;

  const task = await getNextTask(Number(userId));

  if (!task) {
    res.status(411).json({
      message: "No more tasks left for you to review",
    });
  } else {
    res.json({
      task: {
        ...task,
        amount: task.amount.toString(),
      },
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
    if (!task || task.id !== parsedBody.data.taskId) {
      return res.status(411).json({ message: "Incorrect task id" });
    }

    const amount = BigInt(task.amount) / BigInt(TOTAL_SUBMISSIONS);

    await prisma.$transaction(async (tx) => {
      await tx.submission.create({
        data: {
          option_id: parsedBody.data.selection,
          worker_id: Number(userId),
          task_id: parsedBody.data.taskId,
          amount,
        },
      });

      await tx.worker.update({
        where: { id: Number(userId) },
        data: { pending_amount: { increment: amount } },
      });

      // Mark task as done once enough submissions are collected
      const submissionCount = await tx.submission.count({
        where: { task_id: parsedBody.data.taskId },
      });
      if (submissionCount >= TOTAL_SUBMISSIONS) {
        await tx.task.update({
          where: { id: parsedBody.data.taskId },
          data: { done: true },
        });
      }
    });

    const nextTask = await getNextTask(Number(userId));
    res.json({
      nextTask: nextTask
        ? { ...nextTask, amount: nextTask.amount.toString() }
        : null,
      amount: amount.toString(),
    });
  } else {
    res.status(411).json({ message: "Incorrect inputs" });
  }
});

router.post("/payout", workerMiddleware, async (req, res) => {
  // @ts-ignore
  const userId: string = req.userId;
  const worker = await prisma.worker.findFirst({
    where: { id: Number(userId) },
  });

  if (!worker) {
    return res.status(403).json({
      message: "User not found",
    });
  }

  const address = worker?.address;

  //logic to create  a txns

  const txnId = "0x536789675373767";

  // We should add a lock here
  await prisma.$transaction(async (tx) => {
    await tx.worker.update({
      where: {
        id: Number(userId),
      },
      data: {
        pending_amount: {
          decrement: worker.pending_amount,
        },
        locked_amount: {
          increment: worker.pending_amount,
        },
      },
    });

    await tx.payouts.create({
      data: {
        worker_id: Number(userId),
        amount: worker.pending_amount,
        status: "Processing",
        signature: txnId,
      },
    });
  });

  //send the txn to the solana blockchain

  res.json({
    message: "Processing payout",
    amount: worker.pending_amount.toString(),
  });
});

export default router;
