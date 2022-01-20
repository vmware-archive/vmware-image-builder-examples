"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reset = exports.loadConfig = exports.getToken = exports.createPipeline = exports.getExecutionGraph = exports.runAction = void 0;
const constants = __importStar(require("./constants"));
const core = __importStar(require("@actions/core"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const axios_2 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const util_1 = __importDefault(require("util"));
const root = process.env.GITHUB_WORKSPACE
    ? path.join(process.env.GITHUB_WORKSPACE, ".")
    : path.join(__dirname, "..");
const cspClient = axios_1.default.create({
    baseURL: `${process.env.CSP_API_URL}`,
    timeout: 3000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
});
const vibClient = axios_1.default.create({
    baseURL: `${process.env.VIB_PUBLIC_URL}`,
    timeout: 3000,
    headers: { "Content-Type": "application/json" },
});
let cachedCspToken = null;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        //TODO: Refactor so we don't need to do this check
        if (process.env["JEST_TESTS"] === "true")
            return; // skip running logic when importing class for npm test
        yield runAction();
    });
}
//TODO: After generating objects with OpenAPI we should be able to have a Promise<ExecutionGraph>
//TODO: Enable linter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runAction() {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Running github action.`);
        const config = yield loadConfig();
        const startTime = Date.now();
        try {
            const executionGraphId = yield createPipeline(config);
            core.info(`Created pipeline with id ${executionGraphId}.`);
            // Now wait until pipeline ends or times out
            let executionGraph = yield getExecutionGraph(executionGraphId);
            while (!Object.values(constants.EndStates).includes(executionGraph["status"])) {
                core.info(`Fetched execution graph with id ${executionGraphId}. Status: ${executionGraph["status"]}`);
                if (Date.now() - startTime >
                    constants.DEFAULT_EXECUTION_GRAPH_GLOBAL_TIMEOUT) {
                    //TODO: Allow user to override the global timeout via action input params
                    core.info(`Execution graph ${executionGraphId} timed out. Ending Github Action.`);
                    break;
                }
                yield sleep(constants.DEFAULT_EXECUTION_GRAPH_CHECK_INTERVAL);
                executionGraph = yield getExecutionGraph(executionGraphId);
            }
            core.info(`Generating action outputs.`);
            //TODO: Improve existing tests to verify that outputs are set
            core.setOutput("execution-graph", executionGraph);
            // TODO: Fetch logs and results
            // TODO: Upload logs and results as artifacts
            if (!Object.values(constants.EndStates).includes(executionGraph["status"])) {
                core.setFailed(`Execution graph ${executionGraphId} has timed out.`);
            }
            else {
                if (executionGraph["status"] === constants.EndStates.FAILED) {
                    core.setFailed(`Execution graph ${executionGraphId} has failed.`);
                }
                else {
                    core.info(`Execution graph ${executionGraphId} has completed successfully.`);
                }
            }
            return executionGraph;
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
        }
    });
}
exports.runAction = runAction;
function getExecutionGraph(executionGraphId) {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Getting execution graph with id ${executionGraphId}`);
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            throw new Error("VIB_PUBLIC_URL environment variable not found.");
        }
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        try {
            const response = yield vibClient.get(`/v1/execution-graphs/${executionGraphId}`, { headers: { Authorization: `Bearer ${apiToken}` } });
            //TODO: Handle response codes
            return response.data;
        }
        catch (err) {
            if (axios_2.default.isAxiosError(err) && err.response) {
                if (err.response.status == 404) {
                    core.debug(err.response.data.detail);
                    throw new Error(err.response.data.detail);
                }
                throw new Error(err.response.data.detail);
            }
            throw err;
        }
    });
}
exports.getExecutionGraph = getExecutionGraph;
function createPipeline(config) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Config: ${config}`);
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            throw new Error("VIB_PUBLIC_URL environment variable not found.");
        }
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        try {
            const folderName = path.join(root, config.baseFolder);
            const filename = path.join(folderName, config.pipeline);
            core.debug(`Reading pipeline file from ${filename}`);
            const pipeline = fs_1.default.readFileSync(filename).toString();
            core.debug(`Sending pipeline: ${util_1.default.inspect(pipeline)}`);
            //TODO: Define and replace different placeholders: e.g. for values, content folders (goss, jmeter), etc.
            const response = yield vibClient.post("/v1/pipelines", pipeline, {
                headers: { Authorization: `Bearer ${apiToken}` },
            });
            core.debug(`Got create pipeline response data : ${JSON.stringify(response.data)}, headers: ${util_1.default.inspect(response.headers)}`);
            //TODO: Handle response codes
            const locationHeader = (_a = response.headers["location"]) === null || _a === void 0 ? void 0 : _a.toString();
            if (typeof locationHeader === "undefined") {
                throw new Error("Location header not found");
            }
            core.debug(`Location Header: ${locationHeader}`);
            const executionGraphId = locationHeader.substring(locationHeader.lastIndexOf("/") + 1);
            return executionGraphId;
        }
        catch (error) {
            core.debug(`Error: ${JSON.stringify(error)}`);
            throw error;
        }
    });
}
exports.createPipeline = createPipeline;
function getToken(input) {
    return __awaiter(this, void 0, void 0, function* () {
        //const config = loadConfig()
        core.debug(`Checking CSP API token... Cached token: ${cachedCspToken}`);
        core.debug(typeof process.env.CSP_API_TOKEN);
        if (typeof process.env.CSP_API_TOKEN === "undefined") {
            throw new Error("CSP_API_TOKEN secret not found.");
        }
        if (typeof process.env.CSP_API_URL === "undefined") {
            throw new Error("CSP_API_URL environment variable not found.");
        }
        if (cachedCspToken != null && cachedCspToken.timestamp > Date.now()) {
            return cachedCspToken.access_token;
        }
        try {
            const response = yield cspClient.post("/csp/gateway/am/api/auth/api-tokens/authorize", `grant_type=refresh_token&api_token=${process.env.CSP_API_TOKEN}`);
            //TODO: Handle response codes
            if (typeof response.data === "undefined" ||
                typeof response.data.access_token === "undefined") {
                throw new Error("Could not fetch access token.");
            }
            cachedCspToken = {
                access_token: response.data.access_token,
                timestamp: Date.now() + input.timeout,
            };
            return response.data.access_token;
        }
        catch (error) {
            throw error;
        }
    });
}
exports.getToken = getToken;
function loadConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        let pipeline = core.getInput("pipeline");
        let baseFolder = core.getInput("config");
        if (pipeline === "") {
            pipeline = constants.DEFAULT_PIPELINE;
        }
        if (baseFolder === "") {
            baseFolder = constants.DEFAULT_BASE_FOLDER;
        }
        const folderName = path.join(root, baseFolder);
        if (!fs_1.default.existsSync(folderName)) {
            throw new Error(`Could not find base folder at ${folderName}`);
        }
        const filename = path.join(folderName, pipeline);
        if (!fs_1.default.existsSync(filename)) {
            core.setFailed(`Could not find pipeline at ${baseFolder}/${pipeline}`);
        }
        return {
            pipeline,
            baseFolder,
        };
    });
}
exports.loadConfig = loadConfig;
/*eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/promise-function-async*/
//TODO: Enable linter
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/*eslint-enable */
function reset() {
    return __awaiter(this, void 0, void 0, function* () {
        cachedCspToken = null;
    });
}
exports.reset = reset;
run();
//# sourceMappingURL=main.js.map