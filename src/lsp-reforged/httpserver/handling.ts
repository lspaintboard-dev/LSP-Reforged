import { ServerResponse, IncomingMessage } from "http";
import { Translator } from "../utils/translator.js";

export class Request {
    private request: IncomingMessage;
    private headers: Map<string, any>;
    private data: any;
    private transmitted: boolean = false;

    constructor(request: IncomingMessage) {
        this.request = request;
        this.headers = new Map<string, any>;
        for(let i = 0; i < request.rawHeaders.length; i+=2) {
            this.headers.set(request.rawHeaders[i].toLowerCase(), request.rawHeaders[i+1]);
        }
    }
    
    public async getData() {
        this.data = await new Promise((resolve, reject) => {
            let _data: any = '';
            this.request.on('data', (data) => {
                _data += data;
            })
            this.request.on('end', () => {
                this.transmitted = true;
                try {
                    resolve(JSON.parse(_data));
                }
                catch (err) {
                    reject(Translator.translate("httpserver.request.notAValidJSONException"));
                }
                resolve(_data);
            })
            this.request.on('error', () => {
                reject(Translator.translate("httpserver.request.receiveException"));
            })
        })
    }

    public getHeader(K: string): any {
        return this.headers.get(K);
    }
    
    public getBody(): object {
        if(this.transmitted) return this.data;
        else {
            throw Translator.translate("httpserver.request.transmissionNotEndedException");
        }
    }
}

export class Response {
    private jsonResponse: number = -1;
    private response: ServerResponse;

    constructor(response: ServerResponse) {
        this.response = response;
    }

    public setHeader(K: string, V: any) {
        K = K.toLowerCase();
        if(K == "content-type" && this.jsonResponse == 1) {
            throw Translator.translate("httpserver.response.contentTypeException");
        }
        this.response.setHeader(K, V);
    }

    public json(json: object) {
        if(this.jsonResponse == 0) {
            throw Translator.translate("httpserver.response.contentTypeException");
        }
        if(this.jsonResponse == 1) {
            throw Translator.translate("httpserver.response.alreadyJsonedException");
        }
        this.setHeader("content-type", "application/json")
        this.response.write(JSON.stringify(json));
        this.jsonResponse = 1;
    }

    public write(content: any) {
        if(this.jsonResponse == 1) {
            throw Translator.translate("httpserver.response.contentTypeException");
        }
        this.jsonResponse = 0;
        this.write(content);
    }
}