import { Request, Response } from "./handling.js";

export type HandlerFunction = (req: Request, res: Response, params: object) => Promise<number>;

export class Route {
    private handler: HandlerFunction;
    private params: object;

    constructor(handler: HandlerFunction, params: object) {
        this.handler = handler;
        this.params = params;
    }

    public async handle(req: Request, res: Response): Promise<number> {
        if(this.handler == undefined) {
            return 404;
        }
        try {
            return await this.handler(req, res, this.params);
        }
        catch (err) {
            return 500;
        }
    }
}

export class Router {
    public register(path: string, handler: HandlerFunction) {
        
    }

    public route(req: Request): Route {
        //TODO
        return new Route(async () => {return 404;}, {});
    }
}