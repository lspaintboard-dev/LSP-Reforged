import { Server } from "../server/server";
import { Logger } from "../utils/logger";
import { Service } from "./service";
import { Config } from "../config/config";

interface Database {
    connect(config: any): number
    execute(cmd: string): string
    disconnect(): number
}

class DBService implements Service {
    
    private db: Database;
    private server: Server | undefined;

    constructor(db: Database) {
        this.db = db;
    }

    public async onInitialize(server: Server, root: string, apiRoot: string): Promise<void> {
        this.server = server;   
        this.db.connect(server.getConfig('database'));
        this.server.getBus().on('stop', this.db.disconnect);
    }

}