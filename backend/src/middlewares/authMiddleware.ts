import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as jwt.JwtPayload;

    if (decodedToken.userId) {
      req.userId = decodedToken.userId;
      next();
    } else {
      return res.status(403).json({ message: "Invalid token payload" });
    }
  } catch (e) {
    return res.status(403).json({ message: "Invalid token" });
  }
};
