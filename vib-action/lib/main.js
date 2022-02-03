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
exports.reset = exports.loadConfig = exports.getRawLogs = exports.getRawReports = exports.loadEventConfig = exports.loadTargetPlatforms = exports.getLogsFolder = exports.loadAllData = exports.getToken = exports.readPipeline = exports.createPipeline = exports.getExecutionGraphResult = exports.getExecutionGraph = exports.displayExecutionGraph = exports.getArtifactName = exports.runAction = void 0;
const artifact = __importStar(require("@actions/artifact"));
const constants = __importStar(require("./constants"));
const core = __importStar(require("@actions/core"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const util_1 = __importDefault(require("util"));
const root = process.env.GITHUB_WORKSPACE
    ? path.join(process.env.GITHUB_WORKSPACE, ".")
    : path.join(__dirname, "..");
//TODO timeouts in these two clients should be way shorter
const cspClient = axios_1.default.create({
    baseURL: `${process.env.CSP_API_URL
        ? process.env.CSP_API_URL
        : constants.DEFAULT_CSP_API_URL}`,
    timeout: 15000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
});
const vibClient = axios_1.default.create({
    baseURL: `${process.env.VIB_PUBLIC_URL
        ? process.env.VIB_PUBLIC_URL
        : constants.DEFAULT_VIB_PUBLIC_URL}`,
    timeout: 10000,
    headers: { "Content-Type": "application/json", "User-Agent": "VIB/0.1" },
});
let cachedCspToken = null;
let targetPlatforms = {};
const recordedStatuses = {};
let eventConfig;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        //TODO: Refactor so we don't need to do this check
        if (process.env["JEST_TESTS"] === "true")
            return; // skip running logic when importing class for npm test
        loadTargetPlatforms(); // load target platforms in the background
        yield loadEventConfig();
        yield runAction();
    });
}
//TODO: After generating objects with OpenAPI we should be able to have a Promise<ExecutionGraph>
//TODO: Enable linter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runAction() {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug("Running github action.");
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
            core.info("Downloading all outputs from execution graph.");
            const files = yield loadAllData(executionGraph);
            const result = yield getExecutionGraphResult(executionGraphId);
            if (process.env.ACTIONS_RUNTIME_TOKEN) {
                core.debug("Uploading logs as artifacts to GitHub");
                core.debug(`Will upload the following files: ${util_1.default.inspect(files)}`);
                core.debug(`Root directory: ${getFolder(executionGraphId)}`);
                const artifactClient = artifact.create();
                const artifactName = getArtifactName(config);
                const options = {
                    continueOnError: true,
                };
                const executionGraphFolder = getFolder(executionGraphId);
                const uploadResult = yield artifactClient.uploadArtifact(artifactName, files, executionGraphFolder, options);
                core.debug(`Got response from GitHub artifacts API: ${util_1.default.inspect(uploadResult)}`);
                core.info(`Uploaded artifact: ${uploadResult.artifactName}`);
                if (uploadResult.failedItems.length > 0) {
                    core.warning(`The following files could not be uploaded: ${util_1.default.inspect(uploadResult.failedItems)}`);
                }
            }
            else {
                core.warning("ACTIONS_RUNTIME_TOKEN env variable not found. Skipping upload artifacts.");
            }
            core.info("Processing execution graph result.");
            if (result && !result["passed"]) {
                core.setFailed("Some pipeline tests have failed. Please check the execution graph report for details.");
            }
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
            core.info("Generating action outputs.");
            //TODO: Improve existing tests to verify that outputs are set
            core.setOutput("execution-graph", executionGraph);
            core.setOutput("result", result);
            return executionGraph;
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
        }
    });
}
exports.runAction = runAction;
function getArtifactName(config) {
    if (config.targetPlatform) {
        // try to find the platform
        const targetPlatform = targetPlatforms[config.targetPlatform];
        if (targetPlatform) {
            return `assets-${process.env.GITHUB_JOB}-${targetPlatform.kind}-${targetPlatform.version}`;
        }
    }
    return `assets-${process.env.GITHUB_JOB}`;
}
exports.getArtifactName = getArtifactName;
function displayExecutionGraph(executionGraph) {
    for (const task of executionGraph["tasks"]) {
        const taskId = task["task_id"];
        let taskName = task["action_id"];
        const taskError = task["error"];
        const taskStatus = task["status"];
        const recordedStatus = recordedStatuses[taskId];
        if (taskName === "deployment") {
            // find the associated task
            const next = executionGraph["tasks"].find(it => it["task_id"] === task["next_tasks"][0]);
            taskName = `${taskName} ( ${next["action_id"]} )`;
        }
        else if (taskName === "undeployment") {
            // find the associated task
            const prev = executionGraph["tasks"].find(it => it["task_id"] === task["previous_tasks"][0]);
            taskName = `${taskName} ( ${prev["action_id"]} )`;
        }
        if (typeof recordedStatus === "undefined" ||
            taskStatus !== recordedStatus) {
            core.info(`Task ${taskName} is now in status ${taskStatus}`);
            switch (taskStatus) {
                case "FAILED":
                    core.error(`Task ${taskName} has failed. Error: ${taskError}`);
                    break;
                case "SKIPPED":
                    core.info(`Task ${taskName} has been skipped`);
                    break;
                case "SUCCEEDED":
                    //TODO: Use coloring to print this in green
                    core.info(`Task ${taskName} has finished successfully`);
                    break;
            }
        }
        recordedStatuses[taskId] = taskStatus;
    }
}
exports.displayExecutionGraph = displayExecutionGraph;
function getExecutionGraph(executionGraphId) {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Getting execution graph with id ${executionGraphId}`);
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            core.setFailed("VIB_PUBLIC_URL environment variable not found.");
            return "";
        }
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        try {
            const response = yield vibClient.get(`/v1/execution-graphs/${executionGraphId}`, { headers: { Authorization: `Bearer ${apiToken}` } });
            //TODO: Handle response codes
            const executionGraph = response.data;
            displayExecutionGraph(executionGraph);
            return executionGraph;
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && err.response) {
                if (err.response.status === 404) {
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
function getExecutionGraphResult(executionGraphId) {
    return __awaiter(this, void 0, void 0, function* () {
        core.info(`Downloading execution graph results from ${getDownloadVibPublicUrl()}/v1/execution-graphs/${executionGraphId}/report`);
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            core.setFailed("VIB_PUBLIC_URL environment variable not found.");
        }
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        try {
            const response = yield vibClient.get(`/v1/execution-graphs/${executionGraphId}/report`, { headers: { Authorization: `Bearer ${apiToken}` } });
            //TODO: Handle response codes
            const result = response.data;
            const resultFile = path.join(getFolder(executionGraphId), "result.json");
            fs_1.default.writeFileSync(resultFile, JSON.stringify(result));
            return result;
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && err.response) {
                if (err.response.status === 404) {
                    core.warning(`Coult not find execution graph report for ${executionGraphId}`);
                    return null;
                }
                // Don't throw error if we cannot fetch a report
                core.warning(`Error fetching execution graph for ${executionGraphId}. Error code: ${err.response.status}. Message: ${err.response.statusText}`);
                return null;
            }
            core.warning(`Could not fetch execution graph report for ${executionGraphId}. Error: ${err}}`);
            return null;
        }
    });
}
exports.getExecutionGraphResult = getExecutionGraphResult;
function createPipeline(config) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Config: ${config}`);
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            core.setFailed("VIB_PUBLIC_URL environment variable not found.");
        }
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        try {
            const pipeline = yield readPipeline(config);
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
function readPipeline(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const folderName = path.join(root, config.baseFolder);
        const filename = path.join(folderName, config.pipeline);
        core.debug(`Reading pipeline file from ${filename}`);
        let pipeline = fs_1.default.readFileSync(filename).toString();
        if (config.shaArchive) {
            pipeline = pipeline.replace(/{SHA_ARCHIVE}/g, config.shaArchive);
        }
        else {
            if (pipeline.includes("{SHA_ARCHIVE}")) {
                core.setFailed(`Pipeline ${config.pipeline} expects SHA_ARCHIVE variable but either GITHUB_REPOSITORY or GITHUB_SHA cannot be found on environment.`);
            }
        }
        //TODO: Add tests for default target platform input variable
        if (config.targetPlatform) {
            pipeline = pipeline.replace(/{TARGET_PLATFORM}/g, config.targetPlatform);
        }
        else {
            if (pipeline.includes("{TARGET_PLATFORM}")) {
                core.warning(`Pipeline ${config.pipeline} expects TARGET_PLATFORM variable but could not be found on environment.`);
                core.warning(`Defaulting to target platform${constants.DEFAULT_TARGET_PLATFORM}`);
                pipeline = pipeline.replace(/{TARGET_PLATFORM}/g, constants.DEFAULT_TARGET_PLATFORM);
            }
        }
        core.debug(`Sending pipeline: ${util_1.default.inspect(pipeline)}`);
        return pipeline;
    });
}
exports.readPipeline = readPipeline;
function getToken(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof process.env.CSP_API_TOKEN === "undefined") {
            core.setFailed("CSP_API_TOKEN secret not found.");
            return "";
        }
        if (typeof process.env.CSP_API_URL === "undefined") {
            core.setFailed("CSP_API_URL environment variable not found.");
            return "";
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
function loadAllData(executionGraph) {
    return __awaiter(this, void 0, void 0, function* () {
        let files = [];
        // Add result
        files.push(path.join(getFolder(executionGraph["execution_graph_id"]), "result.json"));
        //TODO assertions
        for (const task of executionGraph["tasks"]) {
            if (task["status"] === "SKIPPED") {
                continue;
            }
            const logFile = yield getRawLogs(executionGraph["execution_graph_id"], task["action_id"], task["task_id"]);
            if (logFile) {
                core.debug(`Downloaded file ${logFile}`);
                files.push(logFile);
            }
            const reports = yield getRawReports(executionGraph["execution_graph_id"], task["action_id"], task["task_id"]);
            files = [...files, ...reports];
        }
        return files;
    });
}
exports.loadAllData = loadAllData;
function getLogsFolder(executionGraphId) {
    //TODO validate inputs
    const logsFolder = path.join(getFolder(executionGraphId), "/logs");
    if (!fs_1.default.existsSync(logsFolder)) {
        core.debug(`Creating logs folder ${logsFolder}`);
        fs_1.default.mkdirSync(logsFolder, { recursive: true });
    }
    return logsFolder;
}
exports.getLogsFolder = getLogsFolder;
function getReportsFolder(executionGraphId) {
    //TODO validate inputs
    const reportsFolder = path.join(getFolder(executionGraphId), "/reports");
    if (!fs_1.default.existsSync(reportsFolder)) {
        core.debug(`Creating logs reports ${reportsFolder}`);
        fs_1.default.mkdirSync(reportsFolder, { recursive: true });
    }
    return reportsFolder;
}
/**
 * Loads target platforms into the global target platforms map. Target platform names
 * will be used later to store assets.
 */
function loadTargetPlatforms() {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug("Loading target platforms.");
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            throw new Error("VIB_PUBLIC_URL environment variable not found.");
        }
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        try {
            const response = yield vibClient.get("/v1/target-platforms", {
                headers: { Authorization: `Bearer ${apiToken}` },
            });
            //TODO: Handle response codes
            for (const targetPlatform of response.data) {
                targetPlatforms[targetPlatform.id] = {
                    id: targetPlatform.id,
                    kind: targetPlatform.kind,
                    version: targetPlatform.version,
                };
            }
            core.debug(`Received target platforms: ${util_1.default.inspect(targetPlatforms)}`);
            return targetPlatforms;
        }
        catch (err) {
            // Don't fail action if we cannot fetch target platforms. Log error instead
            core.error(`Could not fetch target platforms. Has the endpoint changed? `);
            if (axios_1.default.isAxiosError(err) && err.response) {
                core.error(`Error code: ${err.response.status}. Message: ${err.response.statusText}`);
            }
            else {
                core.error(`Error: ${err}`);
            }
            return {};
        }
    });
}
exports.loadTargetPlatforms = loadTargetPlatforms;
/**
 * Loads the event github event configuration from the environment variable if existing
 */
function loadEventConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof process.env.GITHUB_EVENT_PATH === "undefined") {
            core.warning("Could not find GITHUB_EVENT_PATH environment variable. Will not have any action event context.");
            return {};
        }
        core.info(`Loading event configuration from ${process.env.GITHUB_EVENT_PATH}`);
        try {
            eventConfig = JSON.parse(fs_1.default.readFileSync(process.env.GITHUB_EVENT_PATH).toString());
            core.debug(`Loaded config: ${util_1.default.inspect(eventConfig)}`);
            return eventConfig;
        }
        catch (err) {
            core.warning(`Could not read content from ${process.env.GITHUB_EVENT_PATH}. Error: ${err}`);
            return {};
        }
    });
}
exports.loadEventConfig = loadEventConfig;
function getFolder(executionGraphId) {
    const folder = path.join(root, "outputs", executionGraphId);
    if (!fs_1.default.existsSync(folder)) {
        fs_1.default.mkdirSync(folder, { recursive: true });
    }
    return folder;
}
function getDownloadVibPublicUrl() {
    return typeof process.env.VIB_REPLACE_PUBLIC_URL !== "undefined"
        ? process.env.VIB_REPLACE_PUBLIC_URL
        : process.env.VIB_PUBLIC_URL;
}
function getRawReports(executionGraphId, taskName, taskId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            core.setFailed("VIB_PUBLIC_URL environment variable not found.");
        }
        core.info(`Downloading raw reports for task ${taskName} from ${getDownloadVibPublicUrl()}/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/raw-reports`);
        const reports = [];
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        try {
            const response = yield vibClient.get(`/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/raw-reports`, { headers: { Authorization: `Bearer ${apiToken}` } });
            //TODO: Handle response codes
            const result = response.data;
            if (result && result.length > 0) {
                for (const raw_report of result) {
                    const reportFilename = `${taskId}_${raw_report.filename}`;
                    const reportFile = path.join(getReportsFolder(executionGraphId), `${reportFilename}`);
                    // Still need to download the raw content
                    const writer = fs_1.default.createWriteStream(reportFile);
                    core.debug(`Downloading raw report from ${getDownloadVibPublicUrl()}/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/raw-reports/${raw_report.id} into ${reportFile}`);
                    const fileResponse = yield vibClient.get(`/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/raw-reports/${raw_report.id}`, {
                        headers: { Authorization: `Bearer ${apiToken}` },
                        responseType: "stream",
                    });
                    fileResponse.data.pipe(writer);
                    reports.push(reportFile);
                }
            }
            return reports;
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && err.response) {
                // Don't throw error if we cannot fetch a report
                core.warning(`Received error while fetching reports for task ${taskId}. Error code: ${err.response.status}. Message: ${err.response.statusText}`);
                return [];
            }
            else {
                throw err;
            }
        }
    });
}
exports.getRawReports = getRawReports;
function getRawLogs(executionGraphId, taskName, taskId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
            core.setFailed("VIB_PUBLIC_URL environment variable not found.");
        }
        core.info(`Downloading logs for task ${taskName} from ${getDownloadVibPublicUrl()}/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/logs/raw`);
        const logFile = path.join(getLogsFolder(executionGraphId), `${taskName}-${taskId}.log`);
        const apiToken = yield getToken({ timeout: constants.CSP_TIMEOUT });
        core.debug(`Will store logs at ${logFile}`);
        try {
            const response = yield vibClient.get(`/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/logs/raw`, { headers: { Authorization: `Bearer ${apiToken}` } });
            //TODO: Handle response codes
            fs_1.default.writeFileSync(logFile, response.data);
            return logFile;
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && err.response) {
                // Don't throw error if we cannot fetch a log
                core.warning(`Received error while fetching logs for task ${taskId}. Error code: ${err.response.status}. Message: ${err.response.statusText}`);
                return null;
            }
            else {
                throw err;
            }
        }
    });
}
exports.getRawLogs = getRawLogs;
function loadConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        //TODO: Replace SHA_ARCHIVE with something more meaningful like PR_HEAD_TARBALL or some other syntax. Perhaps something
        //      we could do would be to allow to use as variables to the actions any of the data from the GitHub event from the
        //      GITHUB_EVENT_PATH file.
        //      For the time being I'm using pull_request.head.repo.url plus the ref as the artifact name and reusing shaArchive
        //      but we need to redo this in the very short term
        let shaArchive;
        if (eventConfig) {
            shaArchive = `${eventConfig["pull_request"]["head"]["repo"]["url"]}/tarball/${eventConfig["pull_request"]["head"]["ref"]}`;
        }
        else {
            // fall back to the old logic if needed
            // Warn on rqeuirements for HELM_CHART variable replacement
            if (typeof process.env.GITHUB_SHA === "undefined") {
                core.warning("Could not find a valid GitHub SHA on environment. Is the GitHub action running as part of PR or Push flows?");
            }
            else if (typeof process.env.GITHUB_REPOSITORY === "undefined") {
                core.warning("Could not find a valid GitHub Repository on environment. Is the GitHub action running as part of PR or Push flows?");
            }
            else {
                shaArchive = `https://github.com/${process.env.GITHUB_REPOSITORY}/archive/${process.env.GITHUB_SHA}.zip`;
            }
        }
        core.info(`SHA_ARCHIVE will resolve to ${shaArchive}`);
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
            core.setFailed(`Could not find base folder at ${folderName}`);
        }
        const filename = path.join(folderName, pipeline);
        if (!fs_1.default.existsSync(filename)) {
            core.setFailed(`Could not find pipeline at ${baseFolder}/${pipeline}`);
        }
        return {
            pipeline,
            baseFolder,
            shaArchive,
            targetPlatform: process.env.TARGET_PLATFORM,
        };
    });
}
exports.loadConfig = loadConfig;
/*eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/promise-function-async*/
//TODO: Enable linter
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/*eslint-enable */
function reset() {
    return __awaiter(this, void 0, void 0, function* () {
        cachedCspToken = null;
        targetPlatforms = {};
    });
}
exports.reset = reset;
run();
//# sourceMappingURL=main.js.map