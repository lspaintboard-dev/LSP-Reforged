import path from "path";
import { Request, Response } from "../httpserver/handling.js";
import { Server } from "../server/server.js";
import { Service } from "./service.js";
import { Translator } from "../utils/translator.js";
import { Permission } from "../permission/permission.js";
import fs from "fs-extra";
import * as WebSocket from "ws";
import * as https from "https";
import * as async from 'async';

class Color {
    public r: number = 0;
    public g: number = 0;
    public b: number = 0;

    constructor(color: number) {
        this.setByHex(('00000'+color.toString(16)).substr(-6));
    }

    public static toHexByte(num: number): string {
        return num.toString(16).length==2?num.toString(16):'0'+num.toString(16);
    }

    public toHex(): string {
        return Color.toHexByte(this.r) + Color.toHexByte(this.g) + Color.toHexByte(this.b);
    }
    
    public setByHex(colorHex: string): void {
        this.r = parseInt(colorHex.slice(0,2), 16);
        this.g = parseInt(colorHex.slice(2,4), 16);
        this.b = parseInt(colorHex.slice(4,6), 16);
    }

    public set(color: number) {
        this.setByHex(('00000'+color.toString(16)).substr(-6));
    }

}

class Pixel {
    public readonly x: number = 0;
    public readonly y: number = 0;
    public color: Color = new Color(0x000000);

    constructor(x: number, y: number, color: Color) {
        this.x = x;
        this.y = y;
        this.color = color;
    }
}

class PaintBoard {
    private readonly width: number = 0;
    private readonly height: number = 0;
    private boardArray: Array<Array<Pixel>> = [];
    private boardArrayCache: Uint8Array = new Uint8Array();

    constructor(width: number, height: number, loadFromString: boolean, defaultColor: number = 0xaaaaaa, boardString: string = '') {
        this.width = width;
        this.height = height;
        this.boardArrayCache = new Uint8Array(this.width * this.height * 3);
        const _defaultColor: Color = new Color(defaultColor); // 切记不要用这个初始化 Pixel，一定要 new 一个
        if(loadFromString) {
            for(let y=0;y<this.height;y++) {
                let _ = new Array<Pixel>();
                for(let x=0;x<this.width;x++) {
                    let _color = new Color(parseInt(boardString.slice(y*this.width*6+x*6, y*this.width*6+x*6+6), 16));
                    _.push(new Pixel(x, y, _color));
                    this.boardArrayCache[y*this.width*3+x*3]=_color.r;
                    this.boardArrayCache[y*this.width*3+x*3+1]=_color.g;
                    this.boardArrayCache[y*this.width*3+x*3+2]=_color.b;
                }
                this.boardArray.push(_);
            }
        }
        else {
            for(let y=0;y<this.height;y++) {
                let _ = new Array<Pixel>();
                for(let x=0;x<this.width;x++) {
                    _.push(new Pixel(x, y, new Color(defaultColor)));
                    this.boardArrayCache[y*this.width*3+x*3]=_defaultColor.r;
                    this.boardArrayCache[y*this.width*3+x*3+1]=_defaultColor.g;
                    this.boardArrayCache[y*this.width*3+x*3+2]=_defaultColor.b;
                }
                this.boardArray.push(_);
            }
        }
    }

    public getBoard(): Uint8Array {
        return this.boardArrayCache;
    }

    public getBoardString(): string {
        let result = "";
        for(let y=0;y<this.height;y++) {
            for(let x=0;x<this.width;x++) {
                result+=this.boardArray[y][x].color.toHex();
            }
        }
        return result;
    }

    public setPixel(x: number, y: number, color: number) {
        this.boardArray[y][x].color.set(color);
        this.boardArrayCache[y*this.width*3+x*3]=this.boardArray[y][x].color.r;
        this.boardArrayCache[y*this.width*3+x*3+1]=this.boardArray[y][x].color.g;
        this.boardArrayCache[y*this.width*3+x*3+2]=this.boardArray[y][x].color.b;
    }
}

export class PaintboardService implements Service {
    private server: Server | undefined;
    private cooldownCache: Map<number, number>;
    private paintboard: PaintBoard;
    private width: number = 0;
    private height: number = 0;
    private cooldown: number = 0;
    private websocketServer: WebSocket.WebSocketServer | undefined;
    private paintReqPerSec: number = 0;
    private paintReqPerSecAvg: number = 0;
    private paintReqPerSecMax: number = 0;
    private paintReqPerSecMin: number = 10000;
    private bandSpeed: number = 0;
    private paintQueue: async.QueueObject<object>;

    constructor() {
        this.cooldownCache = new Map<number, number>();
        this.paintboard = new PaintBoard(0, 0, false);
        this.paintQueue = async.queue(async (data: object) => {
            const xPos: number = data['xPos'];
            const yPos: number = data['yPos'];
            const color: number = data['color'];
            const broadcast: Uint8Array | null = new Uint8Array([0xfa, xPos%256, Math.floor(xPos/256), yPos%256, Math.floor(yPos/256), (color&0xFF0000)/0x10000, (color&0x00FF00)/0x100, color&0x0000FF]);
            this.websocketServer?.clients.forEach((client) => {
            if (client.readyState === WebSocket.WebSocket.OPEN) {
                try {
                    client.send(broadcast!);
                }
                catch (err) {
                    client.close();
                }
                }
                else if (client.readyState !== WebSocket.WebSocket.CONNECTING) {
                    client.close();
                }
            });
        })
    }

    public async onInitialize(server: Server, root: string, apiRoot: string): Promise<void> {
        this.server = server;
        if(server.getConfig('paintboard.resetBoard')) {
            this.paintboard = new PaintBoard(server.getConfig('paintboard.width'), server.getConfig('paintboard.height'), false, 0xaaaaaa);
        }
        else {
            this.paintboard = new PaintBoard(server.getConfig('paintboard.width'), server.getConfig('paintboard.height'), true, 0xaaaaaa, (await server.getDB().execute("select * from board", true))[0].board);
        }
        this.width = server.getConfig('paintboard.width');
        this.height = server.getConfig('paintboard.height');
        this.cooldown = server.getConfig('paintboard.cooldown');
        const getBoardPath = path.join(apiRoot, 'getboard');
        const paintPath = path.join(apiRoot, 'paint');
        this.server.registerHttpReq(getBoardPath, this.getBoardReqHandler, this);
        this.server.registerHttpReq(paintPath, this.paintReqHandler, this);
        this.server.getBus().emit('startListen');
        this.websocketServer = await new Promise(async (resolve, reject) => {
            const wsServer: WebSocket.WebSocketServer = await new Promise((resolve, reject) => {
                if(server.getConfig('global.wsUseTLS')) {
                    const cert = fs.readFileSync(server.getConfig('global.certPath').replaceAll('${WORKSPACE}', server.getConfig("global.workspace")));
                    const key = fs.readFileSync(server.getConfig('global.keyPath').replaceAll('${WORKSPACE}', server.getConfig("global.workspace")));
                    const opts = {
                        cert: cert,
                        key: key,
                        path: path.join(apiRoot, 'ws')
                    }
                    const httpsServer = https.createServer(opts);
                    httpsServer.listen(server.getConfig('global.wsPort'));
                    server.getBus().on('stop', () => {
                        httpsServer.close();
                    });
                    resolve(new WebSocket.WebSocketServer({ server: httpsServer }));
                } else {
                    const _ = new WebSocket.WebSocketServer({port: server.getConfig('global.wsPort')});
                    server.getBus().on('stop', () => {
                        _.close();
                    });
                    resolve(_);
                }
            });
            wsServer.on('connection', (ws, req) => {
                server.getLogger().info("Paintboard", `paintboard.getWebsocketConnection: ${req.connection.remoteAddress}`)
                ws.on('message', (msg: any) => {
                    ws.close();
                    wsServer.clients.delete(ws)
                });
                ws.on('close', function () {
                    wsServer.clients.delete(ws)
                });
                ws.on('error', function () {
                    ws.close();
                    wsServer.clients.delete(ws)
                });
            });
            wsServer.on('listening', () => { resolve(wsServer);});

            wsServer.on('error', (error) => { reject(error); });
            resolve(wsServer);
            
        });
        this.server.getBus().on('stop', async () => {
            await this.server?.getDB().execute(`update board set board = '${this.paintboard.getBoardString()}'`, false);
            this.server?.getBus().emit('stopDB');
        });
        setInterval(() => {
            if(this.paintReqPerSecAvg == 0) this.paintReqPerSecAvg = this.paintReqPerSec;
            this.paintReqPerSecMax = Math.max(this.paintReqPerSecMax, this.paintReqPerSec);
            this.paintReqPerSecMin = Math.max(this.paintReqPerSecMin, this.paintReqPerSec);
            this.paintReqPerSecAvg = this.paintReqPerSecAvg * 0.9 + this.paintReqPerSec * 0.1;
            this.server!.getLogger().info("Paintboard", `Lst/Avg/Min/Max: ${this.paintReqPerSec}/${this.paintReqPerSecAvg}/${this.paintReqPerSecMax}/${this.paintReqPerSecMin}`);
            this.server!.getLogger().info("Paintboard", `BandSpeed: ${this.bandSpeed/1024/1024} Mbps`);
            this.paintReqPerSec = 0;
            this.bandSpeed = 0;
        }, 1000);
    }

    public async paintReqHandler(req: Request, res: Response, urlParams: Array<string>): Promise<number> {
        // x: number = xPos, y: number = yPos, color: number = color, uid: number = uid, token: string = token
        //TODO Websocket
        if(req.getMethod() != "POST") {
            return 405;
        }
        try {
            this.paintReqPerSec++;
            this.bandSpeed+=100;
            if(Date.now()<this.server?.getConfig('paintboard.activityStartTimestamp')*1000 || Date.now()>this.server?.getConfig('paintboard.activityEndTimestamp')*1000) {
                res.json({'statusCode': 400, 'data': {'errorType': 'paintboard.illegalRequest'}});
                return 400;
            }
            const body: object = req.getBody();
            if(Number.isInteger(body['x']) && Number.isInteger(body['y']) && Number.isInteger(body['color']) && Number.isInteger(body['uid']) && typeof(body['token']) == "string") {
                const xPos: number = body['x'];
                const yPos: number = body['y'];
                const color: number = body['color'];
                const uid: number = body['uid'];
                const token: string = body['token'];
                if(xPos < this.width && xPos >= 0 && yPos < this.height && yPos >= 0 && color >= 0x000000 && color <= 0xffffff && uid >= 1) {
                    if((!this.cooldownCache.has(uid) || (Date.now() - this.cooldownCache.get(uid)! >= this.cooldown)) || (this.server!.getPermissionService().hasPermission(uid, Permission.PERM_ROOT))) {
                        if(this.server!.getAuthService().authToken(uid, token)) {
                            if(this.server!.getPermissionService().hasPermission(uid, Permission.PERM_PAINT)) {
                                this.paintboard.setPixel(xPos, yPos, color);
                                this.paintQueue.push({xPos: xPos, yPos: yPos, color: color});
                                res.json({'statusCode': 200});
                                this.cooldownCache.set(uid, Date.now());
                                return 200;
                            }
                            else {
                                res.json({'statusCode': 403, 'data': {'errorType': 'paintboard.permissionDenied'}});
                                return 403;
                            }
                        }
                        else {
                            res.json({'statusCode': 403, 'data': {'errorType': 'auth.invalidToken'}});
                            return 403;
                        }
                    }
                    else {
                        res.json({'statusCode': 418, 'data': {'errorType': 'paintboard.paintInCooldown', "message": `${Translator.translate('paintboard.paintInCooldown')}: ${(this.server?.getConfig('paintboard.cooldown') - Date.now() + this.cooldownCache.get(uid)!)/1000.0}s left.`}});
                        return 418;
                    }
                }
                else {
                    res.json({'statusCode': 400, 'data': {'errorType': 'paintboard.illegalRequest'}});
                    return 400;
                }
            }
            else {
                res.json({'statusCode': 400, 'data': {'errorType': 'paintboard.illegalRequest'}});
                return 400;
            }
        } catch(err) {
            this.server!.getLogger().error("Paintboard", err!.toString());
            res.json({'statusCode': 500, 'data': {'errorType': 'unknown.internalServerError'}});
            return 500;
        }
    }

    public async getBoardReqHandler(req: Request, res: Response, urlParams: Array<string>): Promise<number> {
        if(req.getMethod() != "GET") {
            return 405;
        }
        const _: Uint8Array = this.paintboard.getBoard();
        this.bandSpeed += 1.8*1024*1024;
        return (res.sendArrayBuffer(_).then(() => {return 200;})).catch((reason: any) => {this.server?.getLogger().error('Paintboard', reason!.toString()); res.json({'statusCode': 500, 'data': {'errorType': 'unknown.internalServerError'}}); return 500;});
    }

}