import { HandlerFunction, Router } from "./router.js";
import * as http from "http";
import * as url from "url";
import { Logger } from "../utils/logger.js";
import { Request, Response } from "./handling.js";

export class HttpServer {
    private router: Router = new Router();
    private server: http.Server;

    constructor (logger: Logger) {
        // 可能不行async
        this.server = http.createServer(async (req, res) => {
            const pathname = url.parse(req.url?req.url:'').pathname;
            let request = new Request(req);
            let response = new Response(res);
            try{
                await request.getData();
            } catch (err) {
                response.json({"statusCode": 400, "data": {"errorType": err}});
                res.statusCode = 400;
                res.end();
                return;
            }
            logger.info("HttpServer", `${req.method} ${pathname}`);
            const code = await this.router.route(request).handle(request, response);
            logger.info("HttpServer", `${req.method} ${pathname}: ${code}`);
            res.statusCode = code;
            res.end();
        });
    }

    public listen(port: number) {
        this.server.listen(port, "0.0.0.0");
    }

    public registerHandler(path: string, handler: HandlerFunction) {
        this.router.register(path, handler)
    }
}