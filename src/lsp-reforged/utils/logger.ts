import fs from 'fs-extra';
import path from 'path';

export class Logger {
    private static INFO: string;
    private static WARN: string;
    private static ERROR: string;
    private static CRITICAL: string;
    private logPath: string;
    private initializedTime: number;
    private logIntoFile: boolean;
    private logIntoConsole: boolean;
    private logLevel: number;
    private file: number;
    static {
        this.INFO = `\x1b[0m<>\x1b[0m`;
        this.WARN = `\x1b[0;33m<>\x1b[0m`;
        this.ERROR = `\x1b[0;31m<>\x1b[0m`;
        this.CRITICAL = `\x1b[0;31;40m<>\x1b[0m`;
    }
    constructor(logLevel: number = 0, logIntoConsole: boolean = true, logIntoFile: boolean = false, logPath: string = '') {
        this.logPath = logPath;
        this.logIntoFile = logIntoFile;
        this.logIntoConsole = logIntoConsole;
        this.logLevel = logLevel;
        this.initializedTime = Date.now();
        this.file = fs.openSync(path.join(this.logPath, `${this.initializedTime}.log`), 'w');
    }
    private log(level: number, msg: string): void {
        if(level >= this.logLevel) {
            if(this.logIntoFile) {
                fs.appendFileSync(this.file, msg);
            }
            if(this.logIntoConsole) {
                console.log(msg);
            }
        }
    }
    public info(tag: string, msg: string): void {
        this.log(0, Logger.INFO.replace('<>', `[INFO] [${tag}]: ${msg}`));
    }
    public warn(tag: string, msg: string): void {
        this.log(1, Logger.WARN.replace('<>', `[WARN] [${tag}]: ${msg}`));
    }
    public error(tag: string, msg: string): void {
        this.log(2, Logger.ERROR.replace('<>', `[ERROR] [${tag}]: ${msg}`));
    }
    public critical(tag: string, msg: string): void {
        this.log(3, Logger.CRITICAL.replace('<>', `[CRITICAL] [${tag}]: ${msg}`));
    }
}