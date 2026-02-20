import express from "express";
import UserRouter from "./router/User";
import WorkerRouter from "./router/Worker";
const app = express();


app.use(express.json());
app.use("/api/v1/user", UserRouter);
app.use("/api/v1/worker", WorkerRouter);
const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
