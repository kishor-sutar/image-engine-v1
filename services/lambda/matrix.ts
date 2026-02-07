import { handler } from "./index";

const cases = [
  {
    name: "normal",
    event: {
      rawPath: "/evil_cat_195235.jpg",
      queryStringParameters: {
        w: "237",
        h: "412",
        q: "83",
        fmt: "webp"
      }
    }
  },

  {
    name: "no params (defaults)",
    event: {
      rawPath: "/evil_cat_195235.jpg",
      queryStringParameters: {}
    }
  },

  {
    name: "bad format",
    event: {
      rawPath: "/evil_cat_195235.jpg",
      queryStringParameters: { fmt: "gif" }
    }
  },

  {
    name: "insane ratio",
    event: {
      rawPath: "/evil_cat_195235.jpg",
      queryStringParameters: { w: "10", h: "2000" }
    }
  }
];

(async () => {

  for (const c of cases) {

    console.log("\nCASE:", c.name);

    const res = await handler(c.event);

    console.log({
      status: res.statusCode,
      body: String(res.body).slice(0, 60)
    });
  }

})();
