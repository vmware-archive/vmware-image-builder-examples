import * as core from "@actions/core";
import * as path from "path";
import * as constants from "../src/constants";
import fs from "fs";
import util from 'util'
import {
  createPipeline,
  readPipeline,
  getExecutionGraph,
  getToken,
  loadConfig,
  reset,
  runAction,
  getRawLogs,
  loadAllRawLogs,
  displayExecutionGraph,
  getRawReports,
  getExecutionGraphResult,
} from "../src/main";
import validator from "validator";
import { exec } from "child_process";

const defaultCspTimeout = 10 * 60 * 1000;
const root = path.join(__dirname, "..");
const fixedExecutionGraphId = "d632043b-f74c-4901-8e00-0dbed62f1031";
const fixedTaskId = '1fd2e795-ea31-4ef2-8483-c536e48dc30d'
const fixedTaskName = 'linter-packaging'
const undefinedExecutionGraphId = "aaaaaaaa-f74c-4901-8e00-0dbed62f1031";

const STARTING_ENV = process.env;

describe("VIB", () => {
  beforeAll(async () => {
    // mock all output so that there is less noise when running tests
    //jest.spyOn(console, 'log').mockImplementation(() => {})
    //jest.spyOn(core, 'debug').mockImplementation(() => {})
    jest.spyOn(core, "info").mockImplementation(() => {});
    jest.spyOn(core, "warning").mockImplementation(() => {});
    process.env["JEST_TESTS"] = "true";
    let logsFolder = path.join(root, 'logs')
  });

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...STARTING_ENV };
    reset();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  afterAll(async () => {});
/*
  it("Can get token from CSP", async () => {
    const apiToken = await getToken({ timeout: defaultCspTimeout });
    expect(apiToken).toBeDefined();
  });

  it("CSP token gets cached", async () => {
    const apiToken = await getToken({ timeout: defaultCspTimeout });
    expect(apiToken).toBeDefined();
    // Call again and our action should use the cached CSP token
    const apiToken2 = await getToken({ timeout: defaultCspTimeout });
    expect(apiToken2).toEqual(apiToken);
  });

  it("CSP token to be refreshed", async () => {
    const apiToken = await getToken({ timeout: 1 }); // token will expire after 1ms
    expect(apiToken).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // earlier token should have expired
    const apiToken2 = await getToken({ timeout: defaultCspTimeout });
    expect(apiToken2).not.toEqual(apiToken);
  });

  it("No CSP_API_TOKEN throws an error", async () => {
    let existingToken = process.env["CSP_API_TOKEN"];
    try {
      delete process.env["CSP_API_TOKEN"];
      expect(getToken).rejects.toThrow(
        new Error("CSP_API_TOKEN secret not found.")
      );
    } finally {
      process.env["CSP_API_TOKEN"] = existingToken;
    }
  });

  it("No CSP_API_URL throws an error", async () => {
    let existingApiUrl = process.env["CSP_API_URL"];
    try {
      delete process.env["CSP_API_URL"];
      expect(getToken).rejects.toThrow(
        new Error("CSP_API_URL environment variable not found.")
      );
    } finally {
      process.env["CSP_API_URL"] = existingApiUrl;
    }
  });

  it("Default base folder is used when not customized", async () => {
    let config = await loadConfig();
    expect(config.baseFolder).toEqual(constants.DEFAULT_BASE_FOLDER);
  });

  it("Default base folder is not used when customized", async () => {
    process.env["INPUT_CONFIG"] = ".cp-other";
    process.env["INPUT_PIPELINE"] = "cp-pipeline-other.json";
    let config = await loadConfig();
    expect(config.baseFolder).toEqual(process.env["INPUT_CONFIG"]);
  });

  it("Default pipeline is used when not customized", async () => {
    let config = await loadConfig();
    expect(config.pipeline).toEqual(constants.DEFAULT_PIPELINE);
  });

  it("If file does not exist, throw an error", async () => {
    jest.spyOn(core, 'setFailed')
    process.env["INPUT_PIPELINE"] = "prueba.json"
    await loadConfig()
    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith(
      "Could not find pipeline at .cp/prueba.json")
  }, 5000)
  
  //TODO: Move these URLs to constant defaults and change tests to verify default is used when no env variable exists
  //      Using defaults is more resilient and friendlier than forcing users to define env vars.
  it("No VIB_PUBLIC_URL throws an error", async () => {
    let existingApiUrl = process.env["VIB_PUBLIC_URL"];
    try {
      delete process.env["VIB_PUBLIC_URL"];
      expect(createPipeline).rejects.toThrow(
        new Error("VIB_PUBLIC_URL environment variable not found.")
      );
    } finally {
      process.env["VIB_PUBLIC_URL"] = existingApiUrl;
    }
  });

  it('When github sha is not present there will be no sha archive config property', async () => {
    let config = await loadConfig()
    expect(config.shaArchive).toBeUndefined()
  })

  it('When github repository is not present there will be no sha archive config property', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    let config = await loadConfig()
    expect(config.shaArchive).toBeUndefined()
  })

  it('When both github sha and repository are present then there will be sha archive config property set', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    let config = await loadConfig()
    expect(config.shaArchive).toBeDefined()
    expect(config.shaArchive).toEqual(`https://github.com/vmware/vib-action/archive/aacf48f14ed73e4b368ab66abf4742b0e9afae54.zip`)
  })  

  it("Create pipeline returns an execution graph", async () => {
    let config = await loadConfig();
    let executionGraphId = await createPipeline(config);
    core.debug(`Got execution graph id ${executionGraphId}`);
    expect(executionGraphId).toBeDefined();
    expect(validator.isUUID(executionGraphId)).toBeTruthy();
  });

  it("Create not default pipeline. Return an execution graph", async () => {
    process.env["INPUT_PIPELINE"] = "cp-pipeline-2.json";
    let config = await loadConfig();
    let executionGraphId = await createPipeline(config);
    core.debug(`Got execution graph id ${executionGraphId}`);
    expect(executionGraphId).toBeDefined();
    expect(validator.isUUID(executionGraphId)).toBeTruthy();
  });

  // TODO: Add all pipeline failure test cases, e.g. pipeline does not exist, pipeline is wrongly formatted, ..

  it("Gets an execution graph", async () => {
    let config = await loadConfig();

    let executionGraph = await getExecutionGraph(fixedExecutionGraphId);
    expect(executionGraph).toBeDefined();
    //TODO: With Swagger and OpenAPI create object definitions and then we should have typed objects here
    expect(executionGraph["execution_graph_id"]).toEqual(fixedExecutionGraphId);
    expect(executionGraph["status"]).toEqual("SUCCEEDED");
  });

  it("Get execution graph that does not exist", async () => {
    let config = await loadConfig();
    expect(getExecutionGraph(undefinedExecutionGraphId)).rejects.toThrow(
      new Error(`Execution graph ${undefinedExecutionGraphId} not found!`)
    );
  });

  it('Reads a pipeline from filesystem and has some content', async () => {
    let config = await loadConfig()
    let pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).not.toEqual("")
  })  

  it('Reads a pipeline and does not template sha archive if not needed', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    let config = await loadConfig()
    let pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).not.toContain(config.shaArchive)
  })  

  it('Reads a pipeline and does not template sha archive if not needed', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    let config = await loadConfig()
    let pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).not.toContain(config.shaArchive)
  })  

  it('Reads a pipeline and templates sha archive if needed', async () => {

    process.env.INPUT_PIPELINE='cp-sha-archive.json'
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    let config = await loadConfig()
    let pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).toContain(`"${config.shaArchive}"`)

  })

  it('Reads a pipeline and fails if cannot template sha archive when needed', async () => {
    process.env.INPUT_PIPELINE='cp-sha-archive.json'
    jest.spyOn(core, 'setFailed')
    core.debug("This test should fail")
    let config = await loadConfig()
    let pipeline = await readPipeline(config)
    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith(
      'Pipeline cp-sha-archive.json expects SHA_ARCHIVE variable but either GITHUB_REPOSITORY or GITHUB_SHA cannot be found on environment.')
  })       

  it('Fetches execution graph logs', async () => {

    let config = await loadConfig()
    let logFile = await getRawLogs(fixedExecutionGraphId, 'linter-packaging', fixedTaskId)
    expect(logFile).toBeDefined()
    expect(fs.existsSync(logFile)).toBeTruthy()    
  })

  it('Fetches multiple execution graph logs ', async () => {

    let config = await loadConfig()
    let executionGraph = await getExecutionGraph(fixedExecutionGraphId)
    await loadAllRawLogs(executionGraph)

    // This fixed execution graph has two actions, linter-packaging and trivy
    // assert that logs folder has two files
    core.debug(`Reading logs from ${config.logsFolder}`)
    let logs = fs.readdirSync(config.logsFolder);
    core.debug(`Logs found ${util.inspect(logs)}`)

    expect(logs.length).toEqual(2)
    executionGraph['tasks'].forEach(task => {
      expect(logs.indexOf(`${task['action_id']}-${task['task_id']}.log`)).not.toEqual(-1)
    });
  })
*/
/*
  it('Fetches a raw report ', async () => {

    let config = await loadConfig()
    let reportFiles = await getRawReports(fixedExecutionGraphId, fixedTaskName, fixedTaskId)
    expect(reportFiles).toBeDefined()
    expect(reportFiles.length).toEqual(1)
  })
  */
  it('Fetches an execution graph result ', async () => {

    let config = await loadConfig()
    let executionGraphResult = await getExecutionGraphResult(fixedExecutionGraphId)
    expect(executionGraphResult).toBeDefined()
    expect(executionGraphResult['passed']).toEqual(true)
    expect(executionGraphResult['actions'].length).toEqual(1)
    expect(executionGraphResult['actions'][0]['action_id']).toEqual('trivy')
  })
  
  /*
  // TODO: Add all the failure scenarios. Trying to get an execution graph that does not exist, no public url defined, etc.
  it('Runs the GitHub action and succeeds', async () => {
    let executionGraph = await runAction()

    //TODO: can also test the number of loops done is bigger than one, perhaps with a callback or exposing state

    expect(executionGraph).toBeDefined()
    expect(executionGraph['status']).toEqual('SUCCEEDED')
  }, 120000) // long test, processing this execution graph ( lint, trivy ) might take up to 2 minutes.
*/

  //TODO: Worth mocking axios and returning custom execution graphs to test the whole flows?
  //      Integration tests are slow
});
