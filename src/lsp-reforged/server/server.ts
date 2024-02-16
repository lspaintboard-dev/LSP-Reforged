import * as utils from '../utils/utils.js'
import { Service } from '../service/service.js';
import { EventEmitter } from 'events';
import { Config } from '../config/config.js';

export class Server {
    private logger: utils.Logger;
    private services: Map<string, Service>;
    private bus: EventEmitter;
    private config: Config;

    constructor(config: Config) {
        this.bus = new EventEmitter();
        this.config = config;
        this.logger = new utils.Logger(config.getConfig("logging.logLevel"), config.getConfig("logging.logIntoConsole"), config.getConfig("logging.logIntoFile"), config.getConfig('logging.logPath'));
        this.services = new Map<string, Service>();
    }

    public getLogger(): utils.Logger {
        return this.logger;
    }

    public getService(key: string): Service | undefined {
        if(this.services.has(key)) {
            return this.services.get(key);
        }
        this.getLogger().error('Server', `getService(${key}): no such key found.`);
        return undefined;
    }

    public getConfig(key: string): any {
        return this.config.getConfig();
    }

    public saveConfig(): void {
        this.config.save();
    }

    public getBus(): EventEmitter {
        return this.bus;
    }

    public async addService(key: string, service: Service, root: string, rootApi: string): Promise<boolean> {
        if(this.services.has(key)) {
            this.getLogger().error('Server', `addService(${key}): already added a "${key}".`);
            return false;
        }
        try {
            this.services.set(key, service);
            await service.onInitialize(this, root, rootApi);
            return true;
        }
        catch (err) {
            this.getLogger().error('Server', `addService(${key}): failed.`);
            return false;
        }
    }

    public run(): void {
        this.getLogger().warn('Server', `Server started.`);
    }

    public stop(): void {
        this.getLogger().warn('Server', `Server stopping...`);
        this.config.save();
        this.bus.emit('stop');
    }
};