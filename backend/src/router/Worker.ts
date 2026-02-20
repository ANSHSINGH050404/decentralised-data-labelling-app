import { Router } from "express";
import { prisma } from "../../db";
import jwt from "jsonwebtoken";
const router = Router();

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
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
    res.json({ token });
  } else {
    const newUser = await prisma.worker.create({
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

export default router;