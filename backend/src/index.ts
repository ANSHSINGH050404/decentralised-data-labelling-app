import express from "express";
import UserRouter from "./router/User";
import WorkerRouter from "./router/Worker";
import cors = require("cors");
import morgan = require("morgan");
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
