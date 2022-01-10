import * as core from '@actions/core'
import * as path from 'path'
import * as constants from '../src/constants'
import fs from 'fs'
import {
  createPipeline,
  getExecutionGraph,
  getToken,
  loadConfig,
  reset,
  runAction
} from '../src/main'
import validator from 'validator'
import {exec} from 'child_process'

const defaultCspTimeout = 10 * 60 * 1000
const root = path.join(__dirname, '..')
const fixedExecutionGraphId = 'd632043b-f74c-4901-8e00-0dbed62f1031'

describe('VIB', () => {
  beforeAll(async () => {
    // mock all output so that there is less noise when running tests
    //jest.spyOn(console, 'log').mockImplementation(() => {})
    //jest.spyOn(core, 'debug').mockImplementation(() => {})
    jest.spyOn(core, 'info').mockImplementation(() => {})
    jest.spyOn(core, 'warning').mockImplementation(() => {})
    process.env['JEST_TESTS'] = 'true'
  })

  beforeEach(async () => {
    reset()
  })

  afterAll(async () => {})

  it('Can get token from CSP', async () => {
    const apiToken = await getToken({timeout: defaultCspTimeout})
    expect(apiToken).toBeDefined()
  })

  it('CSP token gets cached', async () => {
    const apiToken = await getToken({timeout: defaultCspTimeout})
    expect(apiToken).toBeDefined()
    // Call again and our action should use the cached CSP token
    const apiToken2 = await getToken({timeout: defaultCspTimeout})
    expect(apiToken2).toEqual(apiToken)
  })

  it('CSP token to be refreshed', async () => {
    const apiToken = await getToken({timeout: 1}) // token will expire after 1ms
    expect(apiToken).toBeDefined()

    await new Promise(resolve => setTimeout(resolve, 10))

    // earlier token should have expired
    const apiToken2 = await getToken({timeout: defaultCspTimeout})
    expect(apiToken2).not.toEqual(apiToken)
  })

  it('No CSP_API_TOKEN throws an error', async () => {
    let existingToken = process.env['CSP_API_TOKEN']
    try {
      delete process.env['CSP_API_TOKEN']
      expect(getToken).rejects.toThrow(
        new Error('CSP_API_TOKEN secret not found.')
      )
    } finally {
      process.env['CSP_API_TOKEN'] = existingToken
    }
  })

  it('No CSP_API_URL throws an error', async () => {
    let existingApiUrl = process.env['CSP_API_URL']
    try {
      delete process.env['CSP_API_URL']
      expect(getToken).rejects.toThrow(
        new Error('CSP_API_URL environment variable not found.')
      )
    } finally {
      process.env['CSP_API_URL'] = existingApiUrl
    }
  })

  it('Default base folder is used when not customized', async () => {
    let config = await loadConfig()
    expect(config.baseFolder).toEqual(constants.DEFAULT_BASE_FOLDER)
  })

  it('Default pipeline is used when not customized', async () => {
    let config = await loadConfig()
    expect(config.pipeline).toEqual(constants.DEFAULT_PIPELINE)
  })

  //TODO: Move these URLs to constant defaults and change tests to verify default is used when no env variable exists
  //      Using defaults is more resilient and friendlier than forcing users to define env vars.
  it('No VIB_PUBLIC_URL throws an error', async () => {
    let existingApiUrl = process.env['VIB_PUBLIC_URL']
    try {
      delete process.env['VIB_PUBLIC_URL']
      expect(createPipeline).rejects.toThrow(
        new Error('VIB_PUBLIC_URL environment variable not found.')
      )
    } finally {
      process.env['VIB_PUBLIC_URL'] = existingApiUrl
    }
  })

  it('Create pipeline returns an execution graph', async () => {
    let config = await loadConfig()
    let executionGraphId = await createPipeline(config)
    core.debug(`Got execution graph id ${executionGraphId}`)
    expect(executionGraphId).toBeDefined()
    expect(validator.isUUID(executionGraphId)).toBeTruthy()
  })

  // TODO: Add all pipeline failure test cases, e.g. pipeline does not exist, pipeline is wrongly formatted, ..

  it('Gets an execution graph', async () => {
    let config = await loadConfig()

    let executionGraph = await getExecutionGraph(fixedExecutionGraphId)
    expect(executionGraph).toBeDefined()
    //TODO: With Swagger and OpenAPI create object definitions and then we should have typed objects here
    expect(executionGraph['execution_graph_id']).toEqual(fixedExecutionGraphId)
    expect(executionGraph['status']).toEqual('SUCCEEDED')
  })

  // TODO: Add all the failure scenarios. Trying to get an execution graph that does not exist, no public url defined, etc.

  it('Runs the GitHub action and succeeds', async () => {
    let executionGraph = await runAction()

    //TODO: can also test the number of loops done is bigger than one, perhaps with a callback or exposing state

    expect(executionGraph).toBeDefined()
    expect(executionGraph['status']).toEqual('SUCCEEDED')
  }, 120000) // long test, processing this execution graph ( lint, trivy ) might take up to 2 minutes.

  //TODO: Worth mocking axios and returning custom execution graphs to test the whole flows?
  //      Integration tests are slow
})
