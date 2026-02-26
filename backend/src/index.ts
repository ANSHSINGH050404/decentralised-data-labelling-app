import express from "express";
import UserRouter from "./router/User.js";
import WorkerRouter from "./router/Worker.js";
import cors from "cors";
import morgan from "morgan";
const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use("/api/v1/user", UserRouter);
app.use("/api/v1/worker", WorkerRouter);

const port = process.env.PORT || 5000;

app.get("/health", (req, res) => {
  res.json({ message: "OK" });
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });
}

export default app;
