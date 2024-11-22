import { Server } from "../server/server.js";
import { Logger } from "../utils/logger.js";
import { Service } from "./service.js";
import { Config } from "../config/config.js";
import { Translator } from "../utils/translator.js";
import sqlite3 from 'sqlite3';
import * as _sqlite from 'sqlite';
const sqliteOpen = _sqlite.open;

export interface Database {
    connect(config: any, logger: Logger): Promise<number>
    execute(cmd: string, isRead: boolean): Promise<any>
    disconnect(logger: Logger): Promise<number>
}

export class DBSqlite3 implements Database {
    private logger: Logger | undefined;
    private db: any;

    constructor() {
    }

    public async connect(config: Config, logger: Logger): Promise<number> {
        this.logger = logger;
        try{
            this.db = await sqliteOpen({
                filename: config.getConfig("database.path").replaceAll('${WORKSPACE}', config.getConfig("global.workspace")),
                driver: sqlite3.Database
            });
        }
        catch(err) {
            this.logger.critical("Sqlite3Driver", Translator.translate("database.connectException") + ": " + err)
            process.exit(1);
        }
        return 0;
    }

    public async execute(cmd: string, isRead: boolean): Promise<any> {
        if(isRead) {
            return await this.db.all(cmd);
        }
        else {
            return await this.db.run(cmd);
        }
    }

    public async disconnect(logger: Logger): Promise<number> {
        try{
            this.db.close();
            process.exit(0);
        }
        catch(err){
            logger.critical("Sqlite3Driver", Translator.translate("database.disconnectException") + err)
            process.exit(1);
            return 1;
        }
        return 0;
    }
}

export class DBService implements Service {
    
    private db: Database;
    private server: Server | undefined;

    constructor(db: Database) {
        this.db = db;
    }

    public async onInitialize(server: Server, root: string, apiRoot: string): Promise<void> {
        this.server = server;   
        await this.db.connect(server.getConfig(), server.getLogger());
        this.server.getBus().on('stopDB', () => {this.db.disconnect(server.getLogger())});
    }

    public async execute(cmd: string, isRead: boolean): Promise<any> {
        return this.db.execute(cmd, isRead);
    }

}