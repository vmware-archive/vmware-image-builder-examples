// eslint-disable-next-line filenames/match-regex
import * as constants from "../src/constants"
import * as core from "@actions/core"
import * as path from "path"
import {
  createPipeline,
  getArtifactName,
  getExecutionGraph,
  getExecutionGraphResult,
  getLogsFolder,
  getRawLogs,
  getRawReports,
  getToken,
  loadAllData,
  loadConfig,
  loadTargetPlatforms,
  readPipeline,
  reset,
  runAction,
} from "../src/main"
import fs from "fs"
import validator from "validator"

const defaultCspTimeout = 10 * 60 * 1000
const root = path.join(__dirname, "..")
const fixedExecutionGraphId = "d632043b-f74c-4901-8e00-0dbed62f1031"
const fixedTaskId = '1fd2e795-ea31-4ef2-8483-c536e48dc30d'
const fixedTaskName = 'linter-packaging'
const undefinedExecutionGraphId = "aaaaaaaa-f74c-4901-8e00-0dbed62f1031"
const tkgPlatformId = "7ddab896-2e4e-4d58-a501-f79897eba3a0"

const STARTING_ENV = process.env

describe("VIB", () => {
  beforeAll(async () => {
    // mock all output so that there is less noise when running tests
    //jest.spyOn(console, 'log').mockImplementation(() => {})
    //jest.spyOn(core, 'debug').mockImplementation(() => {})
    jest.spyOn(core, "info").mockImplementation(() => {})
    jest.spyOn(core, "warning").mockImplementation(() => {})
    jest.spyOn(core, 'setFailed')
    process.env["JEST_TESTS"] = "true"
    path.join(root, 'logs')
  })

  beforeEach(async () => {
    jest.resetModules()
    process.env = { ...STARTING_ENV }
    reset()
  })

  afterEach(async () => {
    jest.clearAllMocks()
  })

  afterAll(async () => {})

  it("Can get token from CSP", async () => {
    const apiToken = await getToken({ timeout: defaultCspTimeout })
    expect(apiToken).toBeDefined()
  })

  it("CSP token gets cached", async () => {
    const apiToken = await getToken({ timeout: defaultCspTimeout })
    expect(apiToken).toBeDefined()
    // Call again and our action should use the cached CSP token
    const apiToken2 = await getToken({ timeout: defaultCspTimeout })
    expect(apiToken2).toEqual(apiToken)
  })

  it("CSP token to be refreshed", async () => {
    const apiToken = await getToken({ timeout: 1 }) // token will expire after 1ms
    expect(apiToken).toBeDefined()

    await new Promise((resolve) => setTimeout(resolve, 10))

    // earlier token should have expired
    const apiToken2 = await getToken({ timeout: defaultCspTimeout })
    expect(apiToken2).not.toEqual(apiToken)
  })

  it("No CSP_API_TOKEN throws an error", async () => {
    delete process.env["CSP_API_TOKEN"]
    await getToken({ timeout: defaultCspTimeout })
    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith(
      "CSP_API_TOKEN secret not found.")
  })

  it("No CSP_API_URL throws an error", async () => {
    delete process.env["CSP_API_URL"]
    process.env.CSP_API_TOKEN="abcd"
    await getToken({ timeout: defaultCspTimeout })
    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith(
      "CSP_API_URL environment variable not found.")
  })

  it("Default base folder is used when not customized", async () => {
    const config = await loadConfig()
    expect(config.baseFolder).toEqual(constants.DEFAULT_BASE_FOLDER)
  })

  it("Default base folder is not used when customized", async () => {
    process.env["INPUT_CONFIG"] = ".vib-other"
    process.env["INPUT_PIPELINE"] = "vib-pipeline-other.json"
    const config = await loadConfig()
    expect(config.baseFolder).toEqual(process.env["INPUT_CONFIG"])
  })

  it("Default pipeline is used when not customized", async () => {
    const config = await loadConfig()
    expect(config.pipeline).toEqual(constants.DEFAULT_PIPELINE)
  })

  it("If file does not exist, throw an error", async () => {
    jest.spyOn(core, 'setFailed')
    process.env["INPUT_PIPELINE"] = "prueba.json"
    await loadConfig()
    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith(
      "Could not find pipeline at .vib/prueba.json")
  })
  
  //TODO: Move these URLs to constant defaults and change tests to verify default is used when no env variable exists
  //      Using defaults is more resilient and friendlier than forcing users to define env vars.
  
  it("No VIB_PUBLIC_URL throws an error", async () => {
    const existingApiUrl = process.env["VIB_PUBLIC_URL"]
    try {
      delete process.env["VIB_PUBLIC_URL"]
      expect(createPipeline).rejects.toThrow(
        new Error("VIB_PUBLIC_URL environment variable not found.")
      )
    } finally {
      process.env["VIB_PUBLIC_URL"] = existingApiUrl
    }
  })

  it('When github sha is not present there will be no sha archive config property', async () => {
    const config = await loadConfig()
    expect(config.shaArchive).toBeUndefined()
  })

  it('When github repository is not present there will be no sha archive config property', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    const config = await loadConfig()
    expect(config.shaArchive).toBeUndefined()
  })

  it('When both github sha and repository are present then there will be sha archive config property set', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    const config = await loadConfig()
    expect(config.shaArchive).toBeDefined()
    expect(config.shaArchive).toEqual(`https://github.com/vmware/vib-action/archive/aacf48f14ed73e4b368ab66abf4742b0e9afae54.zip`)
  })  

  it("Create pipeline returns an execution graph", async () => {
    const config = await loadConfig()
    const executionGraphId = await createPipeline(config)
    core.debug(`Got execution graph id ${executionGraphId}`)
    expect(executionGraphId).toBeDefined()
    expect(validator.isUUID(executionGraphId)).toBeTruthy()
  })

  it("Create not default pipeline. Return an execution graph", async () => {
    process.env["INPUT_PIPELINE"] = "vib-pipeline-2.json"
    const config = await loadConfig()
    const executionGraphId = await createPipeline(config)
    core.debug(`Got execution graph id ${executionGraphId}`)
    expect(executionGraphId).toBeDefined()
    expect(validator.isUUID(executionGraphId)).toBeTruthy()
  })

  // TODO: Add all pipeline failure test cases, e.g. pipeline does not exist, pipeline is wrongly formatted, ..

  it("Gets an execution graph", async () => {
    const executionGraph = await getExecutionGraph(fixedExecutionGraphId)
    expect(executionGraph).toBeDefined()
    //TODO: With Swagger and OpenAPI create object definitions and then we should have typed objects here
    expect(executionGraph["execution_graph_id"]).toEqual(fixedExecutionGraphId)
    expect(executionGraph["status"]).toEqual("SUCCEEDED")
  })

  it("Get execution graph that does not exist", async () => {
    expect(getExecutionGraph(undefinedExecutionGraphId)).rejects.toThrow(
      new Error(`Execution graph ${undefinedExecutionGraphId} not found!`)
    )
  })

  it('Reads a pipeline from filesystem and has some content', async () => {
    const config = await loadConfig()
    const pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).not.toEqual("")
  })  

  it('Reads a pipeline and does not template sha archive if not needed', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    const config = await loadConfig()
    const pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).not.toContain(config.shaArchive)
  })  

  it('Reads a pipeline and does not template sha archive if not needed', async () => {
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    const config = await loadConfig()
    const pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).not.toContain(config.shaArchive)
  })  

  it('Reads a pipeline and templates sha archive if needed', async () => {

    process.env.INPUT_PIPELINE='vib-sha-archive.json'
    process.env.GITHUB_SHA='aacf48f14ed73e4b368ab66abf4742b0e9afae54'
    process.env.GITHUB_REPOSITORY='vmware/vib-action'
    const config = await loadConfig()
    const pipeline = await readPipeline(config)
    expect(pipeline).toBeDefined()
    expect(pipeline).toContain(`"${config.shaArchive}"`)

  })

  it('Reads a pipeline and fails if cannot template sha archive when needed', async () => {
    process.env.INPUT_PIPELINE='vib-sha-archive.json'
    jest.spyOn(core, 'setFailed')
    core.debug("This test should fail")
    const config = await loadConfig()
    await readPipeline(config)
    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith(
      'Pipeline vib-sha-archive.json expects SHA_ARCHIVE variable but either GITHUB_REPOSITORY or GITHUB_SHA cannot be found on environment.')
  })       

  it('Fetches execution graph logs', async () => {
    const logFile = await getRawLogs(fixedExecutionGraphId, 'linter-packaging', fixedTaskId)
    expect(logFile).not.toBeNull()
    if (logFile) {
      expect(logFile).toBeDefined()
      expect(fs.existsSync(logFile)).toBeTruthy()    
    }
  })

  it('Fetches multiple execution graph logs ', async () => {
    const executionGraph = await getExecutionGraph(fixedExecutionGraphId)
    await loadAllData(executionGraph)

    // This fixed execution graph has two actions, linter-packaging and trivy
    // assert that logs folder has two files
    const logs = fs.readdirSync(getLogsFolder(fixedExecutionGraphId))

    expect(logs.length).toEqual(2)
    for (const task of executionGraph['tasks']) {
      expect(logs.indexOf(`${task['action_id']}-${task['task_id']}.log`)).not.toEqual(-1)
    }
  })

  it('Fetches a raw report ', async () => {
    const reportFiles = await getRawReports(fixedExecutionGraphId, fixedTaskName, fixedTaskId)
    expect(reportFiles).toBeDefined()
    expect(reportFiles.length).toEqual(1)
  })
  
  it('Fetches an execution graph result ', async () => {
    const executionGraphResult = await getExecutionGraphResult(fixedExecutionGraphId)
    expect(executionGraphResult).toBeDefined()
    expect(executionGraphResult['passed']).toEqual(true)
    expect(executionGraphResult['actions'].length).toEqual(1)
    expect(executionGraphResult['actions'][0]['action_id']).toEqual('trivy')
  })

  it('Fetches platforms', async () => {
    const targetPlatforms = await loadTargetPlatforms()
    expect(targetPlatforms).not.toBeNull()
    expect(targetPlatforms[tkgPlatformId].kind).toBe("TKG")
  })

  it('Artifact uses job name if no target platform is found', async () => {
    process.env.GITHUB_JOB = 'test-job'
    const config = await loadConfig()
    const artifactName = await getArtifactName(config)
    expect(artifactName).toBe("assets-test-job")
  })  

  it('Artifact uses job name if target platform does not exist', async () => {
    process.env.GITHUB_JOB = 'test-job'
    process.env.TARGET_PLATFORM = 'this_one_does_not_exist'
    await loadTargetPlatforms()
    const config = await loadConfig()
    const artifactName = await getArtifactName(config)
    expect(artifactName).toBe("assets-test-job")
  })  

  it('Artifact uses target platform in name when exists', async () => {
    process.env.GITHUB_JOB = 'test-job'
    process.env.TARGET_PLATFORM = tkgPlatformId
    const targetPlatforms = await loadTargetPlatforms()    
    const tkgPlatform = targetPlatforms ? targetPlatforms[tkgPlatformId] : "meh"
    const config = await loadConfig()
    const artifactName = await getArtifactName(config)
    expect(artifactName).toBe(`assets-${process.env.GITHUB_JOB}-${tkgPlatform['kind']}-${tkgPlatform.version}`)
  })   

  // TODO: Add all the failure scenarios. Trying to get an execution graph that does not exist, no public url defined, etc.
  it('Runs the GitHub action and succeeds', async () => {
    const executionGraph = await runAction()

    //TODO: can also test the number of loops done is bigger than one, perhaps with a callback or exposing state

    expect(executionGraph).toBeDefined()
    expect(executionGraph['status']).toEqual('SUCCEEDED')
  }, 120000) // long test, processing this execution graph ( lint, trivy ) might take up to 2 minutes.

  //TODO: Worth mocking axios and returning custom execution graphs to test the whole flows?
  //      Integration tests are slow
})
