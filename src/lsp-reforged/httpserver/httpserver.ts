import { HandlerFunction, Router } from "./router";
import * as http from "http";
import * as url from "url";
import { Logger } from "../utils/logger";
import { Request, Response } from "./handling";

export class HttpServer {
    private router: Router = new Router();
    private server: http.Server;

    constructor (logger: Logger) {
        // 可能不行async
        this.server = http.createServer(async (req, res) => {
            const pathname = url.parse(req.url?req.url:'').pathname;
            let request = new Request(req);
            let response = new Response(res);
            await request.getData();
            logger.info("HttpServer", `${req.method} ${pathname}`);
            const code = await this.router.route(request).handle(request, response);
            logger.info("HttpServer", `${req.method} ${pathname}: ${code}`);
            res.writeHead(code, res.getHeaders());
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