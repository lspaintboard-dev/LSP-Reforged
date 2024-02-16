import { Logger } from "../utils/logger.js";
import * as yaml from "js-yaml";
import * as fs from "fs";

export class Config {
    private configPath: string;
    private config: any;

    constructor(configPath: string) {
        this.configPath = configPath;
        this.config = yaml.load(fs.readFileSync(configPath, 'utf-8'));
    }
    
    public save(): void {
        fs.writeFileSync(this.configPath, yaml.dump(this.config));
    }

    public getConfig(key: string = ""): any {
        let _ = 0;
        let keyList: string[] = key.split('.');
        let _config = this.config;
        while(_config != undefined && _ < keyList.length) {
            _config = _config[keyList[_]];
            _++;
        }
        if(_config == undefined) {
            throw `Error: 没有条目 ${key}!`;
        }
        else return _config;
    }
};