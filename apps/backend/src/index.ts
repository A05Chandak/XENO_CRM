import cors from "cors";
import express from "express";
import routes from "./routes/index.js";

const port = Number(process.env.PORT ?? "4000");

const app = express();
app.use(cors());
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    }
  })
);
app.use(routes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`CRM API listening on http://localhost:${port}`);
});
