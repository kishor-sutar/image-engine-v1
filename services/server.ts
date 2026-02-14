import express, { raw } from 'express';
import { handler } from './lambda/index';
import { resolveSoa } from 'node:dns';

const app = express();

app.get("/:image",async(req,res)=>{
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