import sharp from "sharp";
import fs from "fs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

interface storageProvider {
    loadSource(fileName: string): Promise<Buffer>;
    getTransformed(key: string): Promise<Buffer | null>;
    saveTransformed(key: string, buffer: Buffer): Promise<void>;
}

const storage = {

    memoryCache: new Map<
        string,
        { buffer: Buffer; expiresAt: number }
    >(),

    TTL: 60 * 1000,
    MAX: 100,

    async loadSource(fileName: string): Promise<Buffer> {
        const localPath = __dirname + "/" + fileName;

        if (!fs.existsSync(localPath)) {
            throw new Error("source image not found locally");
        }

        return fs.readFileSync(localPath);
    },

    getFromCache(key: string): Buffer | null {

        const now = Date.now();
        const cached = this.memoryCache.get(key);

        if (cached && cached.expiresAt > now) {
            console.log("CACHE HIT (memory):", key);
            return cached.buffer;
        }

        return null;
    },

    saveToCache(key: string, buffer: Buffer): void {

        const now = Date.now();

        // 1️ Write to disk (persistent cache)
        const diskPath = __dirname + "/transformed/" +
            key.replace(/\//g, "_");

        fs.writeFileSync(diskPath, buffer);

        // 2️ Maintain memory cache (hot cache)
        if (this.memoryCache.size >= this.MAX) {
            const iterator = this.memoryCache.keys().next();
            if (!iterator.done) {
                this.memoryCache.delete(iterator.value);
                console.log("EVICTED:", iterator.value);
            }
        }

        this.memoryCache.set(key, {
            buffer,
            expiresAt: now + this.TTL
        });

        console.log("CACHE WRITE (memory):", key);
    }
};




const MAX_CACHE_ENTRIES = 100;

// Max number of items in cache - can be tuned based on memory constraints


type LambdaEvent = {
    rawPath: string;
    queryStringParameters?: Record<string, string>;
};

type LambdaResponse = {
    statusCode: number;
    headers: Record<string, string>;
    isBase64Encoded: boolean;
    body: string;
};

type TransformParams = {
    width?: number;
    height?: number;
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
// function validateParams(query: any): TransformParams {

//     const step = (v: number, s: number) =>
//         Math.round(v / s) * s;

//     // let w = Number(query.w || 800);
//     // let h = Number(query.h || 800);
//     let w = query.w ? Number(query.w) : undefined;
//     let h = query.h ? Number(query.h) : undefined;

//     let q = Number(query.q || 80);
//     let fmt = query.fmt || "webp";


//     const allowed = ["jpeg", "png", "webp"];
//     if (!allowed.includes(fmt)) {
//         throw new Error("format not allowed");
//     }

//     // w = step(w, 100);
//     // h = step(h, 100);
//     if (w) w = step(w, 100);
//     if (h) h = step(h, 100);

//     q = step(q, 10);

//     // Reject extreme values instead of auto-fixing
//     if (w && w < 50) {
//         throw new Error("width too small");
//     }

//     if (h && h < 50) {
//         throw new Error("height too small");
//     }




//     if (w > 3000 || h > 3000)
//         throw new Error("dimension too large");

//     if (q < 10 || q > 90)
//         throw new Error("quality out of range");

//     const ratio = Math.max(w, h) / Math.min(w, h);
//     if (ratio > 5) {
//         throw new Error("aspect ratio insane");
//     }


//     return {
//         width: w,
//         height: h,
//         quality: q,
//         format: fmt as any
//     };
// }  

// adddition of transformBuffer
//Old fu*** bitch

function validateParams(query: any): TransformParams {

    const step = (v: number, s: number) =>
        Math.round(v / s) * s;

    let w = query.w ? Number(query.w) : undefined;
    let h = query.h ? Number(query.h) : undefined;

    let q = Number(query.q || 80);
    let fmt = query.fmt || "webp";

    const allowed = ["jpeg", "png", "webp"];
    if (!allowed.includes(fmt)) {
        throw new Error("format not allowed");
    }

    // Step dimensions only if provided
    if (w !== undefined) w = step(w, 100);
    if (h !== undefined) h = step(h, 100);

    q = step(q, 10);

    // Minimum checks
    if (w !== undefined && w < 50) {
        throw new Error("width too small");
    }

    if (h !== undefined && h < 50) {
        throw new Error("height too small");
    }

    // Maximum checks
    if (w !== undefined && w > 3000) {
        throw new Error("width too large");
    }

    if (h !== undefined && h > 3000) {
        throw new Error("height too large");
    }

    if (q < 10 || q > 90) {
        throw new Error("quality out of range");
    }

    // Ratio check only if both dimensions provided
    if (w !== undefined && h !== undefined) {
        const ratio = Math.max(w, h) / Math.min(w, h);
        if (ratio > 5) {
            throw new Error("aspect ratio insane");
        }
    }

    return {
        width: w,
        height: h,
        quality: q,
        format: fmt as any
    };
}

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
        .resize(
            params.width ?? null,
            params.height ?? null
        )

        .toFormat(params.format, { quality: params.quality })
        .toBuffer();

    return buffer;

}

// async function transformLocal(
//     inputPath: string,
//     params: TransformParams
// ) {
//     // Detect real format
//     const input = fs.readFileSync(inputPath);
//     return transformBuffer(input, params);
// }

function buildKey(
  fileName: string,
  params: TransformParams
): string {

  const parts = [
    `fmt=${params.format}`,
    `q=${params.quality}`
  ];

  if (params.width !== undefined) {
    parts.push(`w=${params.width}`);
  }

  if (params.height !== undefined) {
    parts.push(`h=${params.height}`);
  }

  parts.sort(); // deterministic order

  return `${fileName}/${parts.join("_")}.${params.format}`;
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

async function loadSource(fileName: string): Promise<Buffer> {
    const localPath = __dirname + "/" + fileName;
    if (!fs.existsSync(localPath)) {
        throw new Error("Souce image not found locally");
    }

    return fs.readFileSync(localPath);
}

// async function checkOrsave(
//     fileName:string,
//     params:TransformParams,
//     buffer:Buffer
// ){
//     const key = buildKey(fileName,params);

//     const outPath = __dirname + "/cached_" + key.replace(/\//g,"_");

//     if(fs.existsSync(outPath)){
//         console.log("CACHE HIT: " , outPath);
//         return fs.readFileSync(outPath);
//     }

//     fs.writeFileSync(outPath,buffer);

//     console.log("SAVED MOCK" ,outPath);

//     return buffer;

// }
// async function checkOrsave(
//   fileName: string,
//   params: TransformParams,
//   buffer: Buffer
// ) {

//   const key = buildKey(fileName, params);

//   if (memoryCache.has(key)) {
//     console.log("CACHE HIT (memory):", key);
//     return memoryCache.get(key)!;
//   }

//   memoryCache.set(key, buffer);
//   console.log("CACHE WRITE (memory):", key);

//   return buffer;
// }

async function checkOrave(
    fileName: string,
    params: TransformParams,
    buffer: Buffer
) {

    const key = buildKey(fileName, params);
    const now = Date.now();
    const TTL = 60 * 1000; // 60 seconds

    const cached = storage.memoryCache.get(key);

    if (cached && cached.expiresAt > now) {
        console.log("CACHE HIT (memory):", key);
        return cached.buffer;
    }

    if (storage.memoryCache.size >= MAX_CACHE_ENTRIES) {
        const iterator = storage.memoryCache.keys().next();
        if (!iterator.done) {
            const oldestKey = iterator.value;
            storage.memoryCache.delete(oldestKey);
            console.log("EVICTED:", oldestKey);
        }
    }

    storage.memoryCache.set(key, {
        buffer,
        expiresAt: now + TTL
    });

    console.log("CACHE WRITE (memory):", key);

    return buffer;
}


// function getFromCache(key: string) {

//   const now = Date.now();
//   const cached = storage.memoryCache.get(key);

//   if (cached && cached.expiresAt > now) {
//     console.log("CACHE HIT (memory):", key);
//     return cached.buffer;
//   }

//   return null;
// }

// function saveToCache(key: string, buffer: Buffer) {

//   const TTL = 60 * 1000;
//   const MAX = 100;
//   const now = Date.now();

//   if (storage.memoryCache.size >= MAX) {
//     const iterator = storage.memoryCache.keys().next();
//     if (!iterator.done) {
//       storage.memoryCache.delete(iterator.value);
//       console.log("EVICTED:", iterator.value);
//     }
//   }

//   storage.memoryCache.set(key, {
//     buffer,
//     expiresAt: now + TTL
//   });

//   console.log("CACHE WRITE (memory):", key);
// }

//Old handler
// export const handler = async (
//     event: LambdaEvent
// ): Promise<LambdaResponse> => {
//     const start = Date.now();
//     try {
//         //1.extract request info (lambda URL styles)
//         const path = event.rawPath || "/evil_Cat_195235.jpg";
//         const query = event.queryStringParameters || {};

//         //remove leading slash

//         const fileName = path.replace(/^\//, "").toLowerCase().trim();


//         if (fileName.includes("..") || fileName.includes("/")) {
//             throw new Error("invalid file name");
//         }

//         //2.Validate & normalize

//         const normalizedQuery = normalizeQuery(query);
//         const params = validateParams(normalizedQuery);


//         const key = buildKey(fileName, params);
//         // console.log("TARGET KEY:", key);


//         //3.transform 

//         const localPath = __dirname + "/" + fileName;

//         if (!fs.existsSync(localPath)) {
//             throw new Error("source image not found locally");
//         }
//         const source = await loadSource(fileName);
//         const buffer = await transformBuffer(source, params);

//         // await saveResult(fileName,params,buffer);  oooolld  codde
//         const finalBuffer = await checkOrsave(fileName, params, buffer);





//         //4. content type map

//         const mime: any = {
//             webp: "image/webp",
//             jpeg: "image/jpeg",
//             png: "image/png"
//         };

//         //5. return HTTP resources
//         const res = buildResponse(finalBuffer, params.format);
//         // console.log("THIS_MS", Date.now() - start);

//         return res;

//     } catch (err: any) {
//         const msg = err.message || "unknown error";

//         if (msg.includes("not found")) {
//             return errorResponse(404, msg);
//         }


//         if (msg.includes("format") || msg.includes("dimension") || msg.includes("quality")) {
//             return errorResponse(400, msg);
//         }


//         // console.log("THIS_MS : ", Date.now() - start);
//         return errorResponse(500, msg);
//     }
// };
export const handler = async (
    event: LambdaEvent
): Promise<LambdaResponse> => {

    try {

        // 1️ Extract request
        const path = event.rawPath || "/evil_Cat_195235.jpg";
        const query = event.queryStringParameters || {};

        const fileName = path
            .replace(/^\//, "")
            .toLowerCase()
            .trim();

        if (fileName.includes("..") || fileName.includes("/")) {
            throw new Error("invalid file name");
        }

        // 2 Validate & normalize
        const normalizedQuery = normalizeQuery(query);
        const params = validateParams(normalizedQuery);

        // 3 Build key
        const key = buildKey(fileName, params);

        // 4 Check cache FIRST
        const cached = storage.getFromCache(key);
        if (cached) {
            return buildResponse(cached, params.format);
        }

        // 5️ Load source
        const source = await storage.loadSource(fileName);

        // 6️ Transform
        const buffer = await transformBuffer(source, params);

        //7️ Save to cache
        storage.saveToCache(key, buffer);

        // 8️ Return response
        return buildResponse(buffer, params.format);

    } catch (err: any) {

        const msg = err.message || "unknown error";

        if (msg.includes("not found")) {
            return errorResponse(404, msg);
        }

        if (
            msg.includes("format") ||
            msg.includes("dimension") ||
            msg.includes("quality")
        ) {
            return errorResponse(400, msg);
        }

        return errorResponse(500, msg);
    }
};






/**🧠 What That Step Is Called

That step is called:

Separation of Concerns

More specifically:

Layered Responsibility Refactor

And architecturally:

Cache-Aside Pattern
🎯 What Exactly Changed

Before:

Your handler did this:

load → transform → cache → return


The cache logic was tangled inside transformation flow.

After:

Your handler now follows proper architecture:

build key
check cache
    if hit → return
else
    load
    transform
    save to cache
    return


That pattern is known as:

📌 Cache-Aside Strategy

It is the most common caching strategy used in:

Redis-backed APIs

CDN edge logic

Microservices

Cloud image processors

Netflix

Amazon

Everywhere

🔥 Why This Matters
1️⃣ Correct Order of Operations

You do NOT:

Load source unnecessarily

Transform unnecessarily

You check cache FIRST.

That saves CPU, IO, cost.

2️⃣ Makes AWS Migration Easy

When we move to S3:

Only these functions change:

loadSource()
getFromCache()
saveToCache()


Handler stays untouched.

That’s called:

📌 Dependency Isolation

You separated:

Business logic

Storage logic

Cache logic

This is real backend discipline.

3️⃣ Your Handler Is Now Pure

Your handler now only orchestrates:

Input validation

Key generation

High-level flow

It no longer knows HOW caching works.

That’s powerful.

4️⃣ It Makes Testing Easier

You can now test:

transformBuffer separately

cache logic separately

handler flow separately

This is how scalable systems are built.

⚠️ Brutal Truth

If you had gone to AWS without this refactor:

Your Lambda would be:

messy

hard to change

tightly coupled

painful to extend

Now it’s clean.

🧠 In One Sentence

You just converted a script into a properly layered service using the cache-aside architectural pattern. */