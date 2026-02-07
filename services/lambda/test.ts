import { log } from "node:console";
import { handler } from "./index";
(async () => {
    console.log("TEST STARTED");
    try {
        const event = {
            rawPath: "/evil_Cat_195235.jpg",
            queryStringParameters: {
                h: "412",
                w: "237",
                fmt: "webp",
                q: "83"
            }
        };
        console.log("EVENT:" ,event);
        
        const res = await handler(event);

        console.log("RESPONSE RECEIVED");
        console.log(JSON.stringify(res,null,2));
        
        

    } catch (error) {
        console.log("TEST CRASHED" ,error);
        

    }

})();


