import { Router } from "express";
import nacl from "tweetnacl";
import { getNextTask, prisma } from "../../db";
import jwt from "jsonwebtoken";
import { createSubmissionInput } from "../types";
import { workerMiddleware } from "../middlewares/authMiddleware";
import { TOTAL_DECIMALS, TOTAL_SUBMISSIONS } from "../config";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
} from "@solana/web3.js";
import { privateKey } from "../privateKey";
import { decode } from "bs58";

const router = Router();

export const WORKERJWT_SECRET = process.env.JWT_SECRET! + "worker";
const connection = new Connection(
  process.env.RPC_URL || "https://api.devnet.solana.com",
);

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Divides `total` by `parts` and returns [quotient, remainder].
 * Use the remainder for the last/first recipient to avoid losing lamports.
 */
function splitAmount(total: bigint, parts: bigint): [bigint, bigint] {
  const quotient = total / parts;
  const remainder = total % parts;
  return [quotient, remainder];
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /balance
 * Returns the worker's pending and locked balances.
 */
router.get("/balance", workerMiddleware, async (req, res) => {
  const userId: number = req.userId!;

  try {
    const worker = await prisma.worker.findFirst({
      where: { id: userId },
    });

    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    res.json({
      pendingAmount: worker.pending_amount.toString(),
      lockedAmount: worker.locked_amount.toString(), // FIX: was returning pending_amount twice
    });
  } catch (err) {
    console.error("[GET /balance]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /signin
 * Verifies a Solana wallet signature and returns a JWT.
 */
router.post("/signin", async (req, res) => {
  const { publicKey, signature } = req.body;

  // FIX: validate inputs BEFORE attempting to use them
  if (!publicKey || typeof publicKey !== "string") {
    return res.status(400).json({ message: "publicKey is required" });
  }

  // FIX: signature is an object {data: [...]}, not a string
  if (!signature || !Array.isArray(signature.data)) {
    return res.status(400).json({
      message: "signature is required and must be an object with a data array",
    });
  }

  try {
    const message = new TextEncoder().encode(
      "Sign this message into LabelFlow to get started",
    );

    const result = nacl.sign.detached.verify(
      message,
      new Uint8Array(signature.data),
      new PublicKey(publicKey).toBytes(),
    );

    if (!result) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const existingWorker = await prisma.worker.findUnique({
      where: { address: publicKey },
    });

    if (existingWorker) {
      const token = jwt.sign({ userId: existingWorker.id }, WORKERJWT_SECRET, {
        expiresIn: "1h",
      });
      return res.json({
        token,
        amount: existingWorker.pending_amount.toString(), // Return raw lamports as string to avoid truncation
      });
    }

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

    res.json({ token, amount: "0" });
  } catch (err) {
    console.error("[POST /signin]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /nextTask
 * Returns the next unreviewed task for this worker.
 */
router.get("/nextTask", workerMiddleware, async (req, res) => {
  const userId = req.userId!;

  try {
    const task = await getNextTask(userId);

    if (!task) {
      return res.status(411).json({
        message: "No more tasks left for you to review",
      });
    }

    res.json({
      task: {
        ...task,
        amount: task.amount.toString(),
      },
    });
  } catch (err) {
    console.error("[GET /nextTask]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /submission
 * Records a worker's selection for a task and updates their pending balance.
 */
router.post("/submission", workerMiddleware, async (req, res) => {
  const userId = req.userId!;
  const parsedBody = createSubmissionInput.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(411).json({ message: "Incorrect inputs" });
  }

  const { taskId, selection } = parsedBody.data;

  try {
    // FIX: fetch the task directly by ID instead of relying on getNextTask for validation
    const task = await prisma.task.findUnique({
      where: { id: taskId, done: false },
      include: { options: true }, // Include options to validate selection
    });

    if (!task) {
      return res
        .status(404)
        .json({ message: "Task not found or already completed" });
    }

    // FIX: Verify selection belongs to this task
    if (!task.options.some((o) => o.id === selection)) {
      return res.status(400).json({ message: "Invalid option for this task" });
    }

    // FIX: preserve remainder lamports — give the last submitter the dust
    const [baseAmount] = splitAmount(task.amount, BigInt(TOTAL_SUBMISSIONS));

    let nextTask = null;

    await prisma.$transaction(async (tx) => {
      // Re-check task status inside transaction to prevent over-submission race
      const lockedTask = await tx.task.findUnique({
        where: { id: taskId },
        select: { done: true, amount: true },
      });

      if (!lockedTask || lockedTask.done) {
        throw new Error("TASK_ALREADY_DONE");
      }

      const submissionCount = await tx.submission.count({
        where: { task_id: taskId },
      });

      if (submissionCount >= TOTAL_SUBMISSIONS) {
        throw new Error("TASK_ALREADY_DONE");
      }

      await tx.submission.create({
        data: {
          option_id: selection,
          worker_id: userId,
          task_id: taskId,
          amount: baseAmount,
        },
      });

      const isLastSubmission = submissionCount + 1 >= TOTAL_SUBMISSIONS;
      const remainder = isLastSubmission
        ? task.amount % BigInt(TOTAL_SUBMISSIONS)
        : 0n;

      await tx.worker.update({
        where: { id: userId },
        data: { pending_amount: { increment: baseAmount + remainder } },
      });

      if (isLastSubmission) {
        await tx.task.update({
          where: { id: taskId },
          data: { done: true },
        });
      }
    });

    // FIX: fetch next task only once, after the transaction
    nextTask = await getNextTask(userId);

    res.json({
      nextTask: nextTask
        ? { ...nextTask, amount: nextTask.amount.toString() }
        : null,
      amount: baseAmount.toString(),
    });
  } catch (err: any) {
    // Unique constraint violation = worker already submitted for this task
    if (err?.code === "P2002") {
      return res
        .status(409)
        .json({ message: "You have already submitted for this task" });
    }
    if (err?.message === "TASK_ALREADY_DONE") {
      return res
        .status(410)
        .json({ message: "Task was just completed by others" });
    }
    console.error("[POST /submission]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /payout
 * Moves a worker's pending balance to locked and sends a real Solana transaction.
 */

router.post("/payout", workerMiddleware, async (req, res) => {
  const userId = req.userId!;
  const worker = await prisma.worker.findFirst({
    where: { id: userId },
  });

  if (!worker) {
    return res.status(403).json({
      message: "User not found",
    });
  }

  // 1. Atomically move funds from pending to locked to prevent double spending
  const amountToPay = worker.pending_amount;
  if (amountToPay <= 0n) {
    return res.status(400).json({ message: "No funds to payout" });
  }

  const payout = await prisma.$transaction(async (tx) => {
    // Check balance again inside transaction
    const lockedWorker = await tx.worker.findUnique({
      where: { id: userId },
    });
    if (!lockedWorker || lockedWorker.pending_amount < amountToPay) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    await tx.worker.update({
      where: { id: userId },
      data: {
        pending_amount: { decrement: amountToPay },
        locked_amount: { increment: amountToPay },
      },
    });

    return await tx.payouts.create({
      data: {
        worker_id: userId,
        amount: amountToPay,
        status: "Processing",
        signature: "", // Will update after sending
      },
    });
  });

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey("2KeovpYvrgpziaDsq8nbNMP4mc48VNBVXb5arbqrg9Cq"),
      toPubkey: new PublicKey(worker.address),
      lamports: Number(amountToPay), // Now using raw lamports
    }),
  );

  const keypair = Keypair.fromSecretKey(decode(privateKey));
  let signature = "";
  let success = false;

  try {
    signature = await sendAndConfirmTransaction(connection, transaction, [
      keypair,
    ]);
    success = true;
  } catch (e) {
    console.error("Payout transaction failed:", e);
  }

  // 3. Finalize or Revert
  await prisma.$transaction(async (tx) => {
    if (success) {
      await tx.worker.update({
        where: { id: userId },
        data: { locked_amount: { decrement: amountToPay } },
      });
      await tx.payouts.update({
        where: { id: payout.id },
        data: { status: "Success", signature },
      });
    } else {
      // Revert funds back to pending
      await tx.worker.update({
        where: { id: userId },
        data: {
          pending_amount: { increment: amountToPay },
          locked_amount: { decrement: amountToPay },
        },
      });
      await tx.payouts.update({
        where: { id: payout.id },
        data: { status: "Failure" },
      });
    }
  });

  if (success) {
    res.json({
      message: "Payout successful",
      signature,
      amount: amountToPay.toString(),
    });
  } else {
    res
      .status(500)
      .json({ message: "Transaction failed, funds returned to balance" });
  }
});

export default router;
