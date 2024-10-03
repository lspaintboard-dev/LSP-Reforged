import * as utils from '../utils/utils.js'
import { Service } from '../service/service.js';
import { EventEmitter } from 'events';
import { Config } from '../config/config.js';
import { Translator } from '../utils/translator.js';
import { DBService } from '../service/db.js';
import { PermissionService } from '../permission/permission.js';
import { AuthService } from '../auth/auth.js';
import { HttpServer } from '../httpserver/httpserver.js';
import { HandlerFunction } from '../httpserver/router.js';

export class Server {
    private logger: utils.Logger;
    private services: Map<string, Service>;
    private bus: EventEmitter;
    private config: Config;
    private db: DBService;
    private permissionService: PermissionService;
    private authService: AuthService;
    private httpServer: HttpServer;

    constructor(config: Config, db: DBService) {
        this.bus = new EventEmitter();
        this.config = config;
        this.logger = new utils.Logger(config.getConfig("logging.logLevel"), config.getConfig("logging.logIntoConsole"), config.getConfig("logging.logIntoFile"), config.getConfig('global.workspace') + config.getConfig('logging.logPath'));
        this.services = new Map<string, Service>();
        this.db = db;
        this.permissionService = new PermissionService();
        this.authService = new AuthService();
        this.db.onInitialize(this, "/db", '/api/db');
        this.permissionService.onInitialize(this, '/permission', '/api/permission');
        this.authService.onInitialize(this, '/auth', '/api/auth');
        this.httpServer = new HttpServer(this.logger);
    }

    public getLogger(): utils.Logger {
        return this.logger;
    }

    public getService(key: string): Service | undefined {
        if(this.services.has(key)) {
            return this.services.get(key);
        }
        this.getLogger().error('Server', Translator.translate('server.serviceNotFoundException') + `: ${key}`);
        return undefined;
    }

    public getConfig(key?: string): any {
        return this.config.getConfig(key);
    }

    public saveConfig(): void {
        this.config.save();
    }

    public getBus(): EventEmitter {
        return this.bus;
    }

    public getDB(): DBService {
        return this.db;
    }

    public getPermissionService(): PermissionService {
        return this.permissionService;
    }

    public getAuthService(): AuthService {
        return this.authService;
    }

    public registerHttpReq(path: string, handler: HandlerFunction) {
        this.httpServer.registerHandler(path, handler);
    }

    public async addService(key: string, service: Service, root: string, rootApi: string): Promise<boolean> {
        if(this.services.has(key)) {
            this.getLogger().error('Server', Translator.translate('server.serviceAlreadyHaveException') + `: ${key}`);
            return false;
        }
        try {
            this.services.set(key, service);
            await service.onInitialize(this, root, rootApi);
            return true;
        }
        catch (err) {
            this.getLogger().error('Server', Translator.translate('server.serviceException') + `: ${key}`);
            return false;
        }
    }

    public run(): void {
        this.getLogger().warn('Server', Translator.translate('server.startMessage'));
        //TODO httplisten
    }

    public stop(): void {
        this.getLogger().warn('Server', Translator.translate('server.stopMessage'));
        this.config.save();
        this.bus.emit('stop');
    }
};