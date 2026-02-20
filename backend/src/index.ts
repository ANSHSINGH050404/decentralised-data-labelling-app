import express from "express";
import UserRouter from "./router/User";
const app = express();


app.use(express.json());
app.use("/api/v1/user", UserRouter);
const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
