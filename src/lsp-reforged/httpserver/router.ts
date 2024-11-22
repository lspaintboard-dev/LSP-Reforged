import { Logger } from "../utils/logger.js";
import { Request, Response } from "./handling.js";

export type HandlerFunction = (req: Request, res: Response, urlParams: Array<string>) => Promise<number>;

export class Router {
    private routeMap: Map<RegExp, Array<any>> = new Map<RegExp, Array<any>>();

    public register(path: string, handler: HandlerFunction, originThis: any) {
        const NEED_TO_REPLACE = "\\()[]{}^$+*?.|";
        if(path[0]!='/') path = '/' + path;
        for(let i=0;i<NEED_TO_REPLACE.length;i++) {
            path = path.replaceAll(NEED_TO_REPLACE[i], '\\' + NEED_TO_REPLACE[i]);
        }
        const _ = path.split('/');
        let regex = '';
        _.forEach((value) => {if(value!=''){if(value.charAt(0)=='<'&&value.charAt(value.length-1)=='>') regex+='/([^/]*?)'; else regex+='/'+value;}});
        const regExp: RegExp = new RegExp('^'+regex+'$', "i");
        this.routeMap.set(regExp, [handler, originThis]);
    }

    public async route(req: Request, res: Response, logger: Logger): Promise<number | undefined> {
        const pathname: string = req.getPathname() || '';
        let matched: boolean = false;
        for(const regex of this.routeMap.keys()) {
            if(regex.test(pathname)) {
                const urlParams: Array<string> = pathname.match(pathname)?.slice(1) || [];
                try {
                    const _ = this.routeMap.get(regex) || [(()=>{return 500;}), {}];
                    matched = true;
                    return _[0].call(_[1], req, res, urlParams).then((code: number) => {
                        return code;
                    });
                } catch(err: any) {
                    logger.error("HttpServer", err);
                    return 500;
                }
            }
        }
        if(!matched) return 404;
    }
}

// Method not allowed 405