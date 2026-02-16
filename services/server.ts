import express, { raw } from 'express';
import { handler } from './lambda/index';
import { API_KEYS } from "../config/apiKeys";

import { resolveSoa } from 'node:dns';

const app = express();
app.use((req, res, next) => {
  const apiKey = req.header("x-api-key");

  if (!apiKey || !API_KEYS.has(apiKey)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  next();
});

app.get("/u/:userId/:image",async(req,res)=>{

    const {userId,image} = req.params;
    req.params.image = image;
    req.params.userId = userId;
    const start = Date.now();
    const event = {
        rawPath: "/"+req.params.image,
        queryStringParameters: req.query as any
    };
    const lambdaRes = await handler(event);

    res.status(lambdaRes.statusCode);

    if(!lambdaRes.isBase64Encoded){
        console.log("REQ_TIME_MS:",Date.now()-start);
        return res.send(lambdaRes.body);
    }

    const buffer = Buffer.from(lambdaRes.body, "base64");
    Object.entries(lambdaRes.headers).forEach(([k,v])=>{
        res.setHeader(k,v);
    });
    console.log("REQ_TIME_MS:",Date.now()-start);
    return res.send(buffer);
});

app.listen(3000,()=>{
    console.log("Image Engine running on http://localhost:3000");
});