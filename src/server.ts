import express from "express";
import "dotenv/config";
import { env } from "./config/env.js"
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('API funcionando')
});

app.listen(env.PORT, () => {
    console.log(`Servidor rodando na porta ${env.PORT}`)
});