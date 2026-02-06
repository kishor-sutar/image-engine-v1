import sharp from "sharp";
import fs from "fs";

type TransformParams = {
  width: number;
  height: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
};

function validateParams(query: any): TransformParams {

  const step = (v: number, s: number) =>
    Math.round(v / s) * s;

  let w = Number(query.w || 0);
  let h = Number(query.h || 0);
  let q = Number(query.q || 80);
  let fmt = query.fmt || "webp";

  const allowed = ["jpeg", "png", "webp"];
  if (!allowed.includes(fmt)) {
    throw new Error("format not allowed");
  }

  w = step(w, 100);
  h = step(h, 100);
  q = step(q, 10);

  if (w < 50 || h < 50)
    throw new Error("dimension too small");

  if (w > 3000 || h > 3000)
    throw new Error("dimension too large");

  if (q < 10 || q > 90)
    throw new Error("quality out of range");

  const ratio = Math.max(w, h) / Math.min(w, h);
  if (ratio > 5)
    throw new Error("aspect ratio insane");

  return {
    width: w,
    height: h,
    quality: q,
    format: fmt as any
  };
}

async function transformLocal(
  inputPath: string,
  params: TransformParams
) {

  const { width, height, quality, format } = params;

  const buffer = await sharp(inputPath, {
    limitInputPixels: 10_000_000
  })
    .resize(width, height)
    .toFormat(format, { quality })
    .toBuffer();

  return buffer;
}

// -------- LOCAL TEST MODE --------

export const handler = async (event:any)=>{
    try {
        //1.extract request info (lambda URL styles)
        const path = event.rawPath || "/evil_Cat_195235.jpg";
        const query = event.queryStringParameters || {};

        //remove leading slash

        const fileName = path.replace(/^\//,"");

        //2.Validate & normalize

        const params = validateParams(query);

        //3.transform 

        const buffer = await transformLocal(
            __dirname + "/" +fileName,
            params
        );

        //4. content type map

        const mime:any = {
            webp : "image/webp",
            jpeg:"image/jpeg",
            png:"image/png"
        };

        //5. return HTTP resources
        return{
            statusCode:200,
            headers : {
                "Content-Type" : mime[params.format],
                "Cache-Control":"public, max-age = 31536000" 
            },
            isBase64Encoded:true,
            body:buffer.toString("base64");

        };
    } catch (err:any) {
        
        return{
            statusCode :400,
            body:err.message
        };

    }
};
