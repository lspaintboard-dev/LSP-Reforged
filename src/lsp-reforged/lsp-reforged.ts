import { Server } from "./server/server.js";
import { Config } from "./config/config.js";

const configPath: string = process.argv[2];

const server = new Server(new Config(configPath));

server.run();