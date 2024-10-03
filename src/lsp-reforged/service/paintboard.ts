import { Request } from "../httpserver/handling";
import { Server } from "../server/server";
import { Service } from "../service/service";
import { Translator } from "../utils/translator";

export class PaintboardService implements Service {
    private server: Server | undefined;
    private paintCache: Map<number, number>;

    constructor() {
        this.paintCache = new Map<number, number>();
    }

    public async onInitialize(server: Server, root: string, apiRoot: string): Promise<void> {
        this.server = server;
        //TODO HTTP
    }

    public async paintReqHandler(req: Request, res: Response): Promise<number> {
        return 200;
    }

}