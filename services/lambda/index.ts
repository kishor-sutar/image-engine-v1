import sharp from "sharp";
import fs from "fs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

type TransformParams = {
    width: number;
    height: number;
    quality: number;
    format: 'jpeg' | 'png' | 'webp';
};

function normalizeQuery(q: any) {
    const ordered: any = {};

    Object.keys(q)
        .sort()
        .forEach(k => {
            ordered[k] = q[k]
        });
    return ordered;
}
function validateParams(query: any): TransformParams {

    const step = (v: number, s: number) =>
        Math.round(v / s) * s;

    let w = Number(query.w || 800);
    let h = Number(query.h || 800);
    let q = Number(query.q || 80);
    let fmt = query.fmt || "webp";


    const allowed = ["jpeg", "png", "webp"];
    if (!allowed.includes(fmt)) {
        throw new Error("format not allowed");
    }

    w = step(w, 100);
    h = step(h, 100);
    q = step(q, 10);

    // Reject extreme values instead of auto-fixing
    if (w < 50 || h < 50) {
        throw new Error("dimension too small");
    }



    if (w > 3000 || h > 3000)
        throw new Error("dimension too large");

    if (q < 10 || q > 90)
        throw new Error("quality out of range");

    const ratio = Math.max(w, h) / Math.min(w, h);
    if (ratio > 5){
        throw new Error("aspect ratio insane");
    }
        

    return {
        width: w,
        height: h,
        quality: q,
        format: fmt as any
    };
}

// adddition of transformBuffer

async function transformBuffer(
    input: Buffer,
    params: TransformParams
) {
    const meta = await sharp(input).metadata();

    const allowedInput = ["jpeg", "png", "webp"];

    if (!meta.format || !allowedInput.includes(meta.format)) {
        throw new Error("unsupported source format");
    }

    const buffer = await sharp(input, {
        limitInputPixels: 10_000_000
    })
        .resize(params.width, params.height)
        .toFormat(params.format, { quality: params.quality })
        .toBuffer();

    return buffer;

}

async function transformLocal(
    inputPath: string,
    params: TransformParams
) {
    // Detect real format
    const input = fs.readFileSync(inputPath);
    return transformBuffer(input, params);
}

function buildKey(fileName: string, p: TransformParams) {

    const base = fileName;

    return `${base}/fmt=${p.format}_h=${p.height}_q=${p.quality}_w=${p.width}.${p.format}`;
}

// -------- LOCAL TEST MODE --------


function buildResponse(buffer: Buffer, format: string) {
    const mime: any = {
        webp: "image/webp",
        jpeg: "image/jpeg",
        png: "image/png"
    };

    return {
        statusCode: 200,
        headers: {
            "Content-Type": mime[format],
            "Cache-Control": "public,max-age=31536000"
        },

        isBase64Encoded: true,
        body: buffer.toString("base64")
    };
}

// centralized eror handling
function errorResponse(status: number, msg: string) {
    return {
        statusCode: status,
        headers: {
            "Content-Type": "application/json"
        },
        isBase64Encoded: false,
        body: JSON.stringify({ error: msg })
    };
}

export const handler = async (event: any) => {
    const start = Date.now();
    try {
        //1.extract request info (lambda URL styles)
        const path = event.rawPath || "/evil_Cat_195235.jpg";
        const query = event.queryStringParameters || {};

        //remove leading slash

        const fileName = path.replace(/^\//, "").toLowerCase().trim();

        //2.Validate & normalize

        const normalizedQuery = normalizeQuery(query);
        const params = validateParams(normalizedQuery);


        const key = buildKey(fileName, params);
        console.log("TARGET KEY:", key);


        //3.transform 

        const localPath = __dirname + "/" + fileName;

        if (!fs.existsSync(localPath)) {
            throw new Error("source image not found locally");
        }

        const buffer = await transformLocal(
            localPath,
            params
        );


        //4. content type map

        const mime: any = {
            webp: "image/webp",
            jpeg: "image/jpeg",
            png: "image/png"
        };

        //5. return HTTP resources
        const res = buildResponse(buffer, params.format);
        console.log("THIS_MS", Date.now() - start);

        return res;

    } catch (err: any) {
        const msg = err.message || "unknown error";

        if (msg.includes("not found")) {
            return errorResponse(404, msg);
        }


        if (msg.includes("format") || msg.includes("dimension") || msg.includes("quality")) {
            return errorResponse(400, msg);
        }


        console.log("THIS_MS : ", Date.now() - start);
        return errorResponse(500, msg);
    }
};
