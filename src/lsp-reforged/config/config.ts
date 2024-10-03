import { Logger } from "../utils/logger.js";
import * as yaml from "js-yaml";
import fs from "fs-extra";
import { Translator } from "../utils/translator.js";

export class Config {
    private configPath: string;
    private config: any;

    constructor(configPath: string) {
        this.configPath = configPath;
        try {
            this.config = yaml.load(fs.readFileSync(configPath, 'utf-8'));
        }
        catch(err) {
            console.log("An error occurs while loading config file.");
            console.log(err);
            process.exit(1);
        }
    }
    
    public save(): void {
        fs.writeFileSync(this.configPath, yaml.dump(this.config));
    }

    public getConfig(key?: string): Config | any {
        if(key == undefined) return this;
        let _ = 0;
        let keyList: string[] = key.split('.');
        let _config = this.config;
        while(_config != undefined && _ < keyList.length) {
            _config = _config[keyList[_]];
            _++;
        }
        if(_config == undefined) {
            throw Translator.translate("config.noSuchKeyException") + `: ${key}`;
        }
        else return _config;
    }
};