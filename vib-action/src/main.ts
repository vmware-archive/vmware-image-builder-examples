import * as constants from "./constants";
import * as core from "@actions/core";
import * as artifact from "@actions/artifact";
import * as path from "path";
import axios from "axios";
import request from "axios";
import fs from "fs";
import util from "util";
import { exec } from "child_process";
import { sanitize } from "./sanitize";

const root = process.env.GITHUB_WORKSPACE
  ? path.join(process.env.GITHUB_WORKSPACE, ".")
  : path.join(__dirname, "..");

  //TODO timeouts in these two clients should be way shorter
const cspClient = axios.create({
  baseURL: `${process.env.CSP_API_URL}`,
  timeout: 10000,
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
});

const vibClient = axios.create({
  baseURL: `${process.env.VIB_PUBLIC_URL}`,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

interface Config {
  pipeline: string
  baseFolder: string
  shaArchive: string
  targetPlatform: string | undefined
}

interface CspToken {
  access_token: string;
  timestamp: number;
}

interface CspInput {
  timeout: number;
}

let cachedCspToken: CspToken | null = null;
let taskStatus = {}

async function run(): Promise<void> {
  //TODO: Refactor so we don't need to do this check
  if (process.env["JEST_TESTS"] === "true") return; // skip running logic when importing class for npm test

  await runAction();
}

//TODO: After generating objects with OpenAPI we should be able to have a Promise<ExecutionGraph>
//TODO: Enable linter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAction(): Promise<any> {
  core.debug(`Running github action.`);
  const config = await loadConfig();
  const startTime = Date.now();

  try {
    const executionGraphId = await createPipeline(config);
    core.info(`Created pipeline with id ${executionGraphId}.`);

    // Now wait until pipeline ends or times out
    let executionGraph = await getExecutionGraph(executionGraphId);
    while (
      !Object.values(constants.EndStates).includes(executionGraph["status"])
    ) {
      core.info(
        `Fetched execution graph with id ${executionGraphId}. Status: ${executionGraph["status"]}`
      );
      if (
        Date.now() - startTime >
        constants.DEFAULT_EXECUTION_GRAPH_GLOBAL_TIMEOUT
      ) {
        //TODO: Allow user to override the global timeout via action input params
        core.info(
          `Execution graph ${executionGraphId} timed out. Ending Github Action.`
        );
        break;
      }
      await sleep(constants.DEFAULT_EXECUTION_GRAPH_CHECK_INTERVAL);
      executionGraph = await getExecutionGraph(executionGraphId);
    }
    const result = await getExecutionGraphResult(executionGraphId)
    core.info("Processing execution graph result.")
    if (!result['passed']) {
      core.setFailed('Some pipeline tests have failed. Please check the execution graph report for details.')
    }

    core.info("Generating action outputs.");
    //TODO: Improve existing tests to verify that outputs are set
    core.setOutput("execution-graph", executionGraph);
    core.setOutput("result", result)

    // TODO: Fetch logs and results
    // TODO: Upload logs and results as artifacts

    if (
      !Object.values(constants.EndStates).includes(executionGraph["status"])
    ) {
      core.setFailed(`Execution graph ${executionGraphId} has timed out.`);
    } else {
      if (executionGraph["status"] === constants.EndStates.FAILED) {
        core.setFailed(`Execution graph ${executionGraphId} has failed.`);
      } else {
        core.info(
          `Execution graph ${executionGraphId} has completed successfully.`
        );
      }
    }

    core.info("Downloading all logs")
    let files = await loadAllData(executionGraph)

    core.debug("Uploading logs as artifacts to GitHub")
    core.debug(`Will upload the following files: ${util.inspect(files)}`)
    core.debug(`Root directory: ${getLogsFolder(executionGraphId)}`)
    const artifactClient = artifact.create()
    const artifactName = `assets-${process.env.GITHUB_JOB}`

    const options = {
        continueOnError: true
    }
    const executionGraphFolder = getFolder(executionGraphId)
    const uploadResult = await artifactClient.uploadArtifact(artifactName, files, executionGraphFolder, options)
    core.debug(`Got response from GitHub artifacts API: ${util.inspect(uploadResult)}`)
    core.info(`Uploaded artifact: ${uploadResult.artifactName}`)
    if (uploadResult.failedItems.length > 0) {
      core.warning(`The following files could not be uploaded: ${util.inspect(uploadResult.failedItems)}`)
    }

    return executionGraph;
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export function displayExecutionGraph(
  executionGraph: Object
): void {
  let recordedStatuses = {}

  for (const task of executionGraph['tasks']) {

    const taskId = task['task_id']
    let taskName = task['action_id']
    const taskStatus = task['status']
    const recordedStatus = recordedStatuses[taskId]

    if (taskName === 'deployment') {
      // find the associated task
      let next = executionGraph['tasks'].find(it => it['task_id'] === task['next_tasks'][0])
      taskName = `${taskName} ( ${next['action_id']} )`
    } else if (taskName === 'undeployment') {
      // find the associated task
      let prev = executionGraph['tasks'].find(it => it['task_id'] === task['previous_tasks'][0])
      taskName = `${taskName} ( ${prev['action_id']} )`
    }

    if (typeof recordedStatus === "undefined" || taskStatus != recordedStatus) {
      core.info(`Task ${taskName} is now in status ${taskStatus}`)
      switch(taskStatus) {
        case 'FAILED': 
          core.error(`Task ${taskName} has failed`)
          break
        case 'SKIPPED':
          core.warning(`Task ${taskName} has been skipped`)
          break
        case 'SUCCEEDED':
          //TODO: Use coloring to print this in green
          core.info(`Task ${taskName} has finished successfully`)
          break  
      }
    }
    
    recordedStatuses[taskId] = taskStatus;
  }  
}

export async function getExecutionGraph(
  executionGraphId: string
): Promise<Object> {
  core.debug(`Getting execution graph with id ${executionGraphId}`);
  if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
    throw new Error("VIB_PUBLIC_URL environment variable not found.");
  }

  const apiToken = await getToken({ timeout: constants.CSP_TIMEOUT });
  try {
    const response = await vibClient.get(
      `/v1/execution-graphs/${executionGraphId}`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );
    //TODO: Handle response codes
    let executionGraph = response.data;
    displayExecutionGraph(executionGraph)
    return executionGraph
  } catch (err) {
    if (request.isAxiosError(err) && err.response) {
      if (err.response.status == 404) {
        core.debug(err.response.data.detail);
        throw new Error(err.response.data.detail);
      }
      throw new Error(err.response.data.detail);
    }
    throw err;
  }
}

export async function getExecutionGraphResult(
  executionGraphId: string
): Promise<Object> {
  core.info(`Downloading execution graph results from ${getDownloadVibPublicUrl()}/v1/execution-graphs/${executionGraphId}/report`)
  if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
    throw new Error("VIB_PUBLIC_URL environment variable not found.");
  }

  const apiToken = await getToken({ timeout: constants.CSP_TIMEOUT });
  try {
    const response = await vibClient.get(
      `/v1/execution-graphs/${executionGraphId}/report`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );
    //TODO: Handle response codes
    let result = response.data

    const resultFile = path.join(getFolder(executionGraphId), 'result.json')
    fs.writeFileSync(resultFile, result)
    return result
  } catch (err) {
    if (request.isAxiosError(err) && err.response) {
      if (err.response.status == 404) {
        core.debug(err.response.data.detail);
        throw new Error(err.response.data.detail);
      }
      throw new Error(err.response.data.detail);
    }
    throw err;
  }
}

export async function createPipeline(config: Config): Promise<string> {
  core.debug(`Config: ${config}`);
  if (typeof process.env.VIB_PUBLIC_URL === "undefined") {
    throw new Error("VIB_PUBLIC_URL environment variable not found.");
  }

  const apiToken = await getToken({ timeout: constants.CSP_TIMEOUT });

  try {
    const pipeline = await readPipeline(config)
    core.debug(`Sending pipeline: ${util.inspect(pipeline)}`);
    //TODO: Define and replace different placeholders: e.g. for values, content folders (goss, jmeter), etc.

    const response = await vibClient.post("/v1/pipelines", pipeline, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    core.debug(
      `Got create pipeline response data : ${JSON.stringify(
        response.data
      )}, headers: ${util.inspect(response.headers)}`
    );
    //TODO: Handle response codes
    const locationHeader = response.headers["location"]?.toString();
    if (typeof locationHeader === "undefined") {
      throw new Error("Location header not found");
    }
    core.debug(`Location Header: ${locationHeader}`);

    const executionGraphId = locationHeader.substring(
      locationHeader.lastIndexOf("/") + 1
    );
    return executionGraphId;
  } catch (error) {
    core.debug(`Error: ${JSON.stringify(error)}`);
    throw error;
  }
}

export async function readPipeline(config: Config): Promise<string> {

  const folderName = path.join(root, constants.DEFAULT_BASE_FOLDER)
  const filename = path.join(folderName, config.pipeline)
  core.debug(`Reading pipeline file from ${filename}`)
  let pipeline = fs.readFileSync(filename).toString()

  if (config.shaArchive) {
    pipeline = pipeline.replace(/{SHA_ARCHIVE}/g, config.shaArchive);
  } else {
    if (pipeline.indexOf("{SHA_ARCHIVE}") !== -1) {
      core.setFailed(`Pipeline ${config.pipeline} expects SHA_ARCHIVE variable but either GITHUB_REPOSITORY or GITHUB_SHA cannot be found on environment.`)
    }
  }

  //TODO: Add tests for default target platform input variable
  if (config.targetPlatform) {
    pipeline = pipeline.replace(/{TARGET_PLATFORM}/g, config.targetPlatform);
  } else {
    if (pipeline.indexOf("{TARGET_PLATFORM}") !== -1) {
      core.warning(`Pipeline ${config.pipeline} expects TARGET_PLATFORM variable but could not be found on environment.`)
      core.warning(`Defaulting to target platform${constants.DEFAULT_TARGET_PLATFORM}`)
      pipeline = pipeline.replace(/{TARGET_PLATFORM}/g, constants.DEFAULT_TARGET_PLATFORM);
    }
  }

  core.debug(`Sending pipeline: ${util.inspect(pipeline)}`)

  return pipeline
}

export async function getToken(input: CspInput): Promise<string> {
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
    const response = await cspClient.post(
      "/csp/gateway/am/api/auth/api-tokens/authorize",
      `grant_type=refresh_token&api_token=${process.env.CSP_API_TOKEN}`
    );
    //TODO: Handle response codes
    if (
      typeof response.data === "undefined" ||
      typeof response.data.access_token === "undefined"
    ) {
      throw new Error("Could not fetch access token.");
    }

    cachedCspToken = {
      access_token: response.data.access_token,
      timestamp: Date.now() + input.timeout,
    };

    return response.data.access_token;
  } catch (error) {
    throw error;
  }
}

export async function loadAllData(
  executionGraph: Object
): Promise<string[]> {

  let files:string[] = []
  // Add result
  files.push(path.join(getFolder(executionGraph['id'])), 'result.json')

  //TODO assertions
  for (const task of executionGraph['tasks']) {
    const logFile = await getRawLogs(executionGraph['execution_graph_id'], task['action_id'], task['task_id'])
    core.debug(`Downloaded file ${logFile}`)
    files.push(logFile)

    let reports = await getRawReports(executionGraph['execution_graph_id'], task['action_id'], task['task_id'])
    files.push.apply(files, reports);
  }
  
  return files
}

function getLogsFolder(executionGraphId: string) {
  //TODO validate inputs
  const logsFolder = path.join(root, executionGraphId, '/logs')
  if (!fs.existsSync(logsFolder)) {
    core.debug(`Creating logs folder ${logsFolder}`)
    fs.mkdirSync(logsFolder, { recursive: true })
  }

  return logsFolder
}

function getReportsFolder(executionGraphId: string) {
  //TODO validate inputs
  const reportsFolder = path.join(root, executionGraphId, '/reports')
  if (!fs.existsSync(reportsFolder)) {
    core.debug(`Creating logs reports ${reportsFolder}`)
    fs.mkdirSync(reportsFolder, { recursive: true })
  }

  return reportsFolder
}

function getFolder(executionGraphId: string) {

  return path.join(root, executionGraphId)
}

function getDownloadVibPublicUrl(): string|undefined {

  return (typeof process.env.VIB_REPLACE_PUBLIC_URL !== 'undefined') ? process.env.VIB_REPLACE_PUBLIC_URL : process.env.VIB_PUBLIC_URL
}

export async function getRawReports(
  executionGraphId: string,
  taskName: string,
  taskId: string
): Promise<string[]> {
  if (typeof process.env.VIB_PUBLIC_URL === 'undefined') {
    throw new Error('VIB_PUBLIC_URL environment variable not found.')
  }
  core.info(`Downloading results for task ${taskName} from ${getDownloadVibPublicUrl()}/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/result`)

  let reports:string[] = []

  const config = await loadConfig()
  const apiToken = await getToken({timeout: constants.CSP_TIMEOUT})

  try {
    const response = await vibClient.get(
      `/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/result`,
      {headers: {Authorization: `Bearer ${apiToken}`}}
    )
    //TODO: Handle response codes
    let result = response.data
    if (result.raw_reports && result.raw_reports.length > 0) {
      for (const raw_report of result.raw_reports) {
        const reportFilename = `${taskName}-${taskId}-report-${sanitize(raw_report.id,'-')}`
        //TODO: Can VIB return a hint on the content type?
        const reportFile = path.join(getReportsFolder(executionGraphId), `${reportFilename}`)
        const binary = Buffer.from(raw_report.raw_report, 'base64')
        fs.writeFileSync(reportFile, binary)
        reports.push(reportFile)
      }
    }
    return reports

  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      if (err.response.status === 404) {
        core.debug(`Could not find execution graph with id ${executionGraphId}`)
      }
      throw err
    } else {
      throw err
    }
  }
}

export async function getRawLogs(
  executionGraphId: string,
  taskName: string,
  taskId: string
): Promise<string> {
  if (typeof process.env.VIB_PUBLIC_URL === 'undefined') {
    throw new Error('VIB_PUBLIC_URL environment variable not found.')
  }
  core.info(`Downloading logs for task ${taskName} from ${getDownloadVibPublicUrl()}/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/logs/raw`)

  const config = await loadConfig()
  const logFile = path.join(getLogsFolder(executionGraphId), `${taskName}-${taskId}.log`)
  const apiToken = await getToken({timeout: constants.CSP_TIMEOUT})

  core.debug(`Will store logs at ${logFile}`)
  try {
    const response = await vibClient.get(
      `/v1/execution-graphs/${executionGraphId}/tasks/${taskId}/logs/raw`,
      {headers: {Authorization: `Bearer ${apiToken}`}}
    )
    //TODO: Handle response codes
    fs.writeFileSync(logFile, response.data)
    return logFile
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      if (err.response.status === 404) {
        core.debug(`Could not find execution graph with id ${executionGraphId}`)
      }
      throw err
    } else {
      throw err
    }
  }
}

export async function loadConfig(): Promise<Config> {
  
  let shaArchive
  // Warn on rqeuirements for HELM_CHART variable replacement
  if (typeof process.env.GITHUB_SHA === 'undefined') {
    core.warning('Could not find a valid GitHub SHA on environment. Is the GitHub action running as part of PR or Push flows?')
  } else if (typeof process.env.GITHUB_REPOSITORY === 'undefined') {
    core.warning('Could not find a valid GitHub Repository on environment. Is the GitHub action running as part of PR or Push flows?')
  } else {
    shaArchive = `https://github.com/${process.env.GITHUB_REPOSITORY}/archive/${process.env.GITHUB_SHA }.zip`
  }
  
  let pipeline = core.getInput("pipeline");
  let baseFolder = core.getInput("config");

  if (pipeline === "") {
    pipeline = constants.DEFAULT_PIPELINE;
  }

  if (baseFolder === "") {
    baseFolder = constants.DEFAULT_BASE_FOLDER;
  }

  const folderName = path.join(root, baseFolder);

  if (!fs.existsSync(folderName)) {
    throw new Error(`Could not find base folder at ${folderName}`);
  }

  const filename = path.join(folderName, pipeline);
  if (!fs.existsSync(filename)) {
    core.setFailed(`Could not find pipeline at ${baseFolder}/${pipeline}`);
  }
  return {
    pipeline,
    baseFolder,
    shaArchive,
    targetPlatform: process.env.TARGET_PLATFORM
  };
}

/*eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/promise-function-async*/
//TODO: Enable linter
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/*eslint-enable */

export async function reset(): Promise<void> {
  cachedCspToken = null;
}

run();
