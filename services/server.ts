import express, { raw } from 'express';
import { handler } from './lambda/index';
import { resolveSoa } from 'node:dns';

const app = express();

app.get("/:image",async(req,res)=>{
    const event = {
        rawPath: "/"+req.params.image,
        queryStringParameters: req.query as any
    };
    const lambdaRes = await handler(event);

    res.status(lambdaRes.statusCode);

    if(!lambdaRes.isBase64Encoded){
        return res.send(lambdaRes.body);
    }

    const buffer = Buffer.from(lambdaRes.body, "base64");
    Object.entries(lambdaRes.headers).forEach(([k,v])=>{
        res.setHeader(k,v);
    });

    return res.send(buffer);
});

app.listen(3000,()=>{
    console.log("Image Engine running on http://localhost:3000");
});