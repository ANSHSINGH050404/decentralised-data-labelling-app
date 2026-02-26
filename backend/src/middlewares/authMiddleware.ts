/// <reference path="../types.d.ts" />
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { WORKERJWT_SECRET } from "../router/Worker";

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

export function workerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "You are not logged in" });
  }

  try {
    const decoded = jwt.verify(token, WORKERJWT_SECRET);
    // @ts-ignore
    if (decoded.userId) {
      // @ts-ignore
      req.userId = decoded.userId;
      return next();
    } else {
      return res.status(403).json({
        message: "You are not logged in",
      });
    }
  } catch (e) {
    return res.status(403).json({
      message: "You are not logged in",
    });
  }
}
